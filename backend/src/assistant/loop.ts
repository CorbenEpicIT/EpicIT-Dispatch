/**
 * The agent loop: user message → model → tools → model → answer.
 *
 * The loop owns no business logic. It streams a completion, hands any tool calls
 * to `executeTool` (which applies policy, permissions, tenancy and audit), feeds
 * the results back, and repeats until the model stops asking for tools. Every
 * security decision was made in Phase 1; this file must not add an exception to
 * one.
 *
 * Each model turn is persisted separately rather than collapsed into a single
 * assistant message. A turn that calls tools, answers, then calls more tools has
 * an order that matters — `toTranscript` has to replay it exactly or the API
 * rejects the request.
 */

import type OpenAI from "openai";
import { executeTool } from "../agent/execute.js";
import type { AgentContext, AgentPolicy } from "../agent/types.js";
import { log } from "../services/appLogger.js";
import { ASSISTANT_MODEL, MAX_COMPLETION_TOKENS, MAX_TOOL_ITERATIONS } from "./config.js";
import {
	appendAssistantMessage,
	appendUserMessage,
	loadMessages,
	toTranscript,
	type PersistedToolCall,
} from "./conversations.js";
import type { AssistantEvent } from "./events.js";
import { getOpenAI } from "./openaiClient.js";
import { buildSystemPrompt } from "./prompt.js";
import { parseToolArguments, summariseToolResult, toolsForOpenAI } from "./toolBridge.js";

export interface TurnOptions {
	ctx: AgentContext;
	policy: AgentPolicy;
	timezone: string;
	conversationId: string;
	userMessage: string;
	emit: (event: AssistantEvent) => void;
	signal: AbortSignal;
	/** Injected for testability; defaults to the wall clock. */
	now?: Date;
}

/** A tool call being assembled from streamed fragments. */
interface PendingCall {
	id: string;
	name: string;
	args: string;
}

interface StreamedTurn {
	text: string;
	calls: PendingCall[];
	finishReason: string | null;
	usage: { input: number; output: number } | null;
}

/**
 * Consume one streamed completion.
 *
 * Tool calls arrive as fragments keyed by `index`, with the name and id on the
 * first fragment and the arguments dribbled across later ones — hence the
 * accumulate-by-index dance rather than reading them off a single chunk.
 */
async function streamOnce(
	client: OpenAI,
	messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
	tools: OpenAI.Chat.Completions.ChatCompletionTool[],
	emit: (event: AssistantEvent) => void,
	signal: AbortSignal,
): Promise<StreamedTurn> {
	const stream = await client.chat.completions.create(
		{
			model: ASSISTANT_MODEL,
			messages,
			// An empty tools array is a request error, and a caller whose permissions
			// reach nothing legitimately has one.
			...(tools.length ? { tools, tool_choice: "auto" as const } : {}),
			stream: true,
			stream_options: { include_usage: true },
			max_completion_tokens: MAX_COMPLETION_TOKENS,
			// Temperature is deliberately unset: reasoning models reject it, and the
			// default is right for this workload anyway.
		},
		{ signal },
	);

	let text = "";
	let finishReason: string | null = null;
	let usage: StreamedTurn["usage"] = null;
	const pending = new Map<number, PendingCall>();

	for await (const chunk of stream) {
		if (chunk.usage) {
			usage = { input: chunk.usage.prompt_tokens ?? 0, output: chunk.usage.completion_tokens ?? 0 };
		}

		const choice = chunk.choices[0];
		if (!choice) continue;

		if (choice.delta?.content) {
			text += choice.delta.content;
			emit({ type: "text_delta", text: choice.delta.content });
		}

		for (const fragment of choice.delta?.tool_calls ?? []) {
			const current = pending.get(fragment.index) ?? { id: "", name: "", args: "" };
			if (fragment.id) current.id = fragment.id;
			if (fragment.function?.name) current.name += fragment.function.name;
			if (fragment.function?.arguments) current.args += fragment.function.arguments;
			pending.set(fragment.index, current);
		}

		if (choice.finish_reason) finishReason = choice.finish_reason;
	}

	return {
		text,
		calls: [...pending.entries()].sort(([a], [b]) => a - b).map(([, call]) => call),
		finishReason,
		usage,
	};
}

/**
 * Run one user turn to completion, emitting events as it goes.
 *
 * Returns rather than throws on failure: the caller has an open SSE stream, and
 * the useful thing to do with an error is put it in the thread.
 */
export async function runTurn(options: TurnOptions): Promise<void> {
	const { ctx, policy, timezone, conversationId, userMessage, emit, signal } = options;
	const now = options.now ?? new Date();
	const client = getOpenAI();

	await appendUserMessage(ctx, conversationId, userMessage);

	const history = await loadMessages(ctx, conversationId);
	const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
		{ role: "system", content: buildSystemPrompt({ ctx, timezone, now }) },
		...toTranscript(history),
	];

	const tools = toolsForOpenAI(ctx, policy);

	let lastMessageId: string | null = null;
	let totalIn = 0;
	let totalOut = 0;

	for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
		if (signal.aborted) return;

		const turn = await streamOnce(client, messages, tools, emit, signal);
		totalIn += turn.usage?.input ?? 0;
		totalOut += turn.usage?.output ?? 0;

		if (!turn.calls.length) {
			const saved = await appendAssistantMessage(ctx, conversationId, {
				content: turn.text,
				model: ASSISTANT_MODEL,
				finishReason: turn.finishReason,
				inputTokens: turn.usage?.input ?? null,
				outputTokens: turn.usage?.output ?? null,
				toolCalls: [],
			});
			emit({ type: "done", messageId: saved.id, usage: { input: totalIn, output: totalOut } });
			return;
		}

		const persisted: PersistedToolCall[] = [];

		for (const call of turn.calls) {
			if (signal.aborted) return;

			const parsed = parseToolArguments(call.args);
			const input = parsed.ok ? parsed.value : {};
			emit({ type: "tool_call", id: call.id, name: call.name, input });

			const started = Date.now();
			// A malformed arguments string is reported back as a tool failure rather
			// than executed with a guess — the model can then correct itself, which
			// it cannot do if the turn simply ends.
			const result = parsed.ok
				? await executeTool(call.name, input, ctx, policy)
				: ({ ok: false, error: { code: "VALIDATION_ERROR" as const, message: parsed.message } } as const);
			const durationMs = Date.now() - started;

			if (result.ok) {
				emit({
					type: "tool_result",
					id: call.id,
					ok: true,
					summary: summariseToolResult(call.name, input, result.data),
					durationMs,
				});
				if (result.meta?.invalidates?.length) {
					emit({ type: "invalidate", keys: result.meta.invalidates });
				}
			} else {
				emit({
					type: "tool_result",
					id: call.id,
					ok: false,
					summary: `${call.name} failed`,
					errorCode: result.error.code,
					errorMessage: result.error.message,
					durationMs,
				});
			}

			persisted.push({
				provider_call_id: call.id,
				tool_name: call.name,
				input,
				status: result.ok ? "ok" : "error",
				result,
				error_code: result.ok ? null : result.error.code,
				duration_ms: durationMs,
			});
		}

		const saved = await appendAssistantMessage(ctx, conversationId, {
			content: turn.text,
			model: ASSISTANT_MODEL,
			finishReason: turn.finishReason,
			inputTokens: turn.usage?.input ?? null,
			outputTokens: turn.usage?.output ?? null,
			toolCalls: persisted,
		});
		lastMessageId = saved.id;

		messages.push({
			role: "assistant",
			content: turn.text || null,
			tool_calls: turn.calls.map((call) => ({
				id: call.id,
				type: "function" as const,
				function: { name: call.name, arguments: call.args || "{}" },
			})),
		});
		for (const call of persisted) {
			messages.push({
				role: "tool",
				tool_call_id: call.provider_call_id,
				content: JSON.stringify(call.result),
			});
		}
	}

	// Ran out of iterations with the model still asking for tools. Say so rather
	// than presenting a partial answer as a complete one.
	log.warn(
		{ evt: "assistant.iteration_limit", conversation: conversationId, org: ctx.organizationId },
		"Assistant turn hit the tool iteration limit",
	);
	emit({
		type: "error",
		code: "ITERATION_LIMIT",
		message: `I looked things up ${MAX_TOOL_ITERATIONS} times without reaching an answer. Try narrowing the question.`,
	});
	emit({ type: "done", messageId: lastMessageId, usage: { input: totalIn, output: totalOut } });
}
