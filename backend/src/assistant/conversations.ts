/**
 * Conversation persistence and transcript replay.
 *
 * Every read and write here goes through `getScopedDb`, and the three assistant
 * models are registered in `lib/context.ts` (assistant_conversation directly,
 * messages and tool calls through their parents), so a conversation belonging to
 * another organization is unreachable rather than merely unlisted.
 *
 * Ownership within an org is a second, separate check: `assertOwned` refuses a
 * conversation belonging to a different user. Being in the same organization
 * does not make someone else's chat history yours.
 */

import type OpenAI from "openai";
import { getScopedDb } from "../lib/context.js";
import { HISTORY_WINDOW } from "./config.js";
import type { AgentContext } from "../agent/types.js";

export interface PersistedToolCall {
	provider_call_id: string;
	tool_name: string;
	input: unknown;
	status: string;
	result: unknown;
	error_code?: string | null;
	duration_ms?: number | null;
}

export async function createConversation(ctx: AgentContext, title?: string) {
	const db = getScopedDb(ctx.organizationId);
	return db.assistant_conversation.create({
		data: {
			organization_id: ctx.organizationId,
			user_id: ctx.userId,
			user_role: ctx.role,
			title: title ?? null,
		},
		select: { id: true, title: true, created_at: true, updated_at: true },
	});
}

export async function listConversations(ctx: AgentContext, limit = 30) {
	const db = getScopedDb(ctx.organizationId);
	return db.assistant_conversation.findMany({
		where: { user_id: ctx.userId, archived_at: null },
		select: { id: true, title: true, created_at: true, updated_at: true },
		orderBy: { updated_at: "desc" },
		take: limit,
	});
}

export class ConversationAccessError extends Error {
	constructor(message = "No such conversation") {
		super(message);
		this.name = "ConversationAccessError";
	}
}

/**
 * Fetch a conversation, refusing one that belongs to somebody else.
 *
 * The org filter is already applied by the scoped client; this adds the
 * per-user check on top. Both failures return the same error — confirming that
 * a conversation exists but belongs to a colleague is still a disclosure.
 */
async function assertOwned(ctx: AgentContext, conversationId: string) {
	const db = getScopedDb(ctx.organizationId);
	const conversation = await db.assistant_conversation.findFirst({
		where: { id: conversationId, user_id: ctx.userId },
		select: { id: true, title: true, created_at: true, updated_at: true },
	});
	if (!conversation) throw new ConversationAccessError();
	return conversation;
}

export async function getConversation(ctx: AgentContext, conversationId: string) {
	return assertOwned(ctx, conversationId);
}

export async function archiveConversation(ctx: AgentContext, conversationId: string) {
	await assertOwned(ctx, conversationId);
	const db = getScopedDb(ctx.organizationId);
	await db.assistant_conversation.update({
		where: { id: conversationId },
		data: { archived_at: new Date() },
	});
}

export async function renameConversation(ctx: AgentContext, conversationId: string, title: string) {
	await assertOwned(ctx, conversationId);
	const db = getScopedDb(ctx.organizationId);
	return db.assistant_conversation.update({
		where: { id: conversationId },
		data: { title },
		select: { id: true, title: true, updated_at: true },
	});
}

/** Messages for the UI, oldest first, with their tool calls attached. */
export async function loadMessages(ctx: AgentContext, conversationId: string, limit = HISTORY_WINDOW) {
	await assertOwned(ctx, conversationId);
	const db = getScopedDb(ctx.organizationId);

	// Newest-first with a take, then reversed: the tail is the part worth keeping
	// when a conversation outgrows the window.
	const rows = await db.assistant_message.findMany({
		where: { conversation_id: conversationId },
		select: {
			id: true,
			role: true,
			content: true,
			created_at: true,
			input_tokens: true,
			output_tokens: true,
			tool_calls: {
				select: {
					id: true,
					provider_call_id: true,
					tool_name: true,
					input: true,
					status: true,
					result: true,
					error_code: true,
					duration_ms: true,
				},
			},
		},
		orderBy: { created_at: "desc" },
		take: limit,
	});
	return rows.reverse();
}

export async function appendUserMessage(ctx: AgentContext, conversationId: string, content: string) {
	const db = getScopedDb(ctx.organizationId);
	const message = await db.assistant_message.create({
		data: { conversation_id: conversationId, role: "user", content },
		select: { id: true, created_at: true },
	});
	await db.assistant_conversation.update({
		where: { id: conversationId },
		data: { updated_at: new Date() },
	});
	return message;
}

export async function appendAssistantMessage(
	ctx: AgentContext,
	conversationId: string,
	message: {
		content: string;
		model: string;
		finishReason: string | null;
		inputTokens: number | null;
		outputTokens: number | null;
		toolCalls: PersistedToolCall[];
	},
) {
	const db = getScopedDb(ctx.organizationId);
	const row = await db.assistant_message.create({
		data: {
			conversation_id: conversationId,
			role: "assistant",
			content: message.content,
			model: message.model,
			finish_reason: message.finishReason,
			input_tokens: message.inputTokens,
			output_tokens: message.outputTokens,
			tool_calls: {
				create: message.toolCalls.map((call) => ({
					provider_call_id: call.provider_call_id,
					tool_name: call.tool_name,
					// Prisma's recursive InputJsonValue cannot be proven to accept `unknown`,
					// but every value here has already round-tripped through JSON.
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					input: call.input as any,
					status: call.status,
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					result: call.result as any,
					error_code: call.error_code ?? null,
					duration_ms: call.duration_ms ?? null,
					completed_at: new Date(),
				})),
			},
		},
		select: { id: true, created_at: true },
	});
	await db.assistant_conversation.update({
		where: { id: conversationId },
		data: { updated_at: new Date() },
	});
	return row;
}

type StoredMessage = Awaited<ReturnType<typeof loadMessages>>[number];

/**
 * Rebuild the OpenAI transcript from stored rows.
 *
 * An assistant turn that called tools has to be replayed as the assistant
 * message *plus* one `tool` message per call, each pairing back to the call it
 * answered via `provider_call_id`. Dropping or reordering those makes the API
 * reject the request outright, which is why the provider's call id is stored
 * rather than regenerated.
 */
export function toTranscript(messages: StoredMessage[]): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
	const out: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

	for (const message of messages) {
		if (message.role === "user") {
			out.push({ role: "user", content: message.content });
			continue;
		}

		const calls = message.tool_calls ?? [];
		if (!calls.length) {
			// An assistant turn with neither text nor tool calls carries nothing the
			// model needs; replaying it just wastes context.
			if (message.content.trim()) out.push({ role: "assistant", content: message.content });
			continue;
		}

		out.push({
			role: "assistant",
			// The API wants null, not "", when a turn was tool calls only.
			content: message.content || null,
			tool_calls: calls.map((call) => ({
				id: call.provider_call_id,
				type: "function" as const,
				function: { name: call.tool_name, arguments: JSON.stringify(call.input ?? {}) },
			})),
		});

		for (const call of calls) {
			out.push({
				role: "tool",
				tool_call_id: call.provider_call_id,
				content: JSON.stringify(call.result ?? { ok: false, error: "no result recorded" }),
			});
		}
	}

	return out;
}

/**
 * A title derived from the opening question, used until something better exists.
 * Cheap on purpose — spending a model call to name a chat is not worth it.
 */
export function deriveTitle(firstMessage: string): string {
	const flat = firstMessage.replace(/\s+/g, " ").trim();
	if (flat.length <= 60) return flat || "New conversation";
	return `${flat.slice(0, 57)}…`;
}
