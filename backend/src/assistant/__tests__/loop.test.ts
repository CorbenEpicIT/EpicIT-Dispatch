import { beforeEach, describe, expect, it, vi } from "vitest";

const { create, executeTool, appendUserMessage, appendAssistantMessage, loadMessages } = vi.hoisted(() => ({
	create: vi.fn(),
	executeTool: vi.fn(),
	appendUserMessage: vi.fn(async () => ({ id: "um-1", created_at: new Date() })),
	appendAssistantMessage: vi.fn(async () => ({ id: "am-1", created_at: new Date() })),
	loadMessages: vi.fn(async () => [] as unknown[]),
}));

vi.mock("../openaiClient.js", () => ({
	getOpenAI: () => ({ chat: { completions: { create } } }),
	AssistantNotConfiguredError: class extends Error {},
}));
vi.mock("../conversations.js", async (importOriginal) => ({
	...(await importOriginal<typeof import("../conversations.js")>()),
	appendUserMessage,
	appendAssistantMessage,
	loadMessages,
}));
vi.mock("../../agent/execute.js", () => ({ executeTool }));
vi.mock("../../services/appLogger.js", () => ({
	log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../toolBridge.js", async (importOriginal) => ({
	...(await importOriginal<typeof import("../toolBridge.js")>()),
	// The real one reads the tool registry; the loop only cares that it is non-empty.
	toolsForOpenAI: () => [{ type: "function", function: { name: "get_record", parameters: {} } }],
}));

import { READ_ONLY_POLICY } from "../../agent/policy.js";
import type { AgentContext } from "../../agent/types.js";
import type { AssistantEvent } from "../events.js";
import { runTurn } from "../loop.js";

const ctx: AgentContext = {
	userId: "u1",
	role: "dispatcher",
	organizationId: "org-1",
	permissions: ["view_jobs"],
	actorType: "dispatcher",
	surface: "assistant",
	userName: "Dana Reyes",
};

/** Build an async-iterable stream of chat completion chunks. */
const streamOf = (chunks: unknown[]) => ({
	async *[Symbol.asyncIterator]() {
		for (const chunk of chunks) yield chunk;
	},
});

const textChunk = (text: string) => ({ choices: [{ delta: { content: text } }] });
const finish = (reason: string) => ({ choices: [{ delta: {}, finish_reason: reason }] });
const usageChunk = (input: number, output: number) => ({
	choices: [],
	usage: { prompt_tokens: input, completion_tokens: output },
});

/** Tool call fragments, split the way the API actually streams them. */
const toolCallChunks = (index: number, id: string, name: string, args: string) => [
	{ choices: [{ delta: { tool_calls: [{ index, id, function: { name, arguments: "" } }] } }] },
	...args.split("").map((ch) => ({ choices: [{ delta: { tool_calls: [{ index, function: { arguments: ch } }] } }] })),
];

async function run(overrides: Partial<Parameters<typeof runTurn>[0]> = {}) {
	const events: AssistantEvent[] = [];
	await runTurn({
		ctx,
		policy: READ_ONLY_POLICY,
		timezone: "America/Chicago",
		conversationId: "conv-1",
		userMessage: "what is on for tuesday?",
		emit: (e) => events.push(e),
		signal: new AbortController().signal,
		now: new Date("2026-08-19T12:00:00Z"),
		...overrides,
	});
	return events;
}

const typesOf = (events: AssistantEvent[]) => events.map((e) => e.type);

describe("runTurn", () => {
	beforeEach(() => {
		create.mockReset();
		executeTool.mockReset();
		appendAssistantMessage.mockClear();
		appendUserMessage.mockClear();
		loadMessages.mockClear();
		loadMessages.mockResolvedValue([]);
	});

	it("streams a plain answer and finishes", async () => {
		create.mockResolvedValueOnce(streamOf([textChunk("Two "), textChunk("visits."), finish("stop"), usageChunk(120, 8)]));

		const events = await run();

		expect(typesOf(events)).toEqual(["text_delta", "text_delta", "done"]);
		expect(events.filter((e) => e.type === "text_delta").map((e) => (e as { text: string }).text).join("")).toBe(
			"Two visits.",
		);
		expect(events.at(-1)).toMatchObject({ type: "done", usage: { input: 120, output: 8 } });
	});

	it("persists the user turn before calling the model", async () => {
		create.mockResolvedValueOnce(streamOf([textChunk("ok"), finish("stop")]));
		await run();
		expect(appendUserMessage).toHaveBeenCalledWith(ctx, "conv-1", "what is on for tuesday?");
	});

	it("records token counts on the assistant message", async () => {
		// The pricing question has to be answerable later, which means recording
		// usage from the first release rather than retrofitting it.
		create.mockResolvedValueOnce(streamOf([textChunk("ok"), finish("stop"), usageChunk(500, 40)]));
		await run();
		expect(appendAssistantMessage.mock.calls[0][2]).toMatchObject({ inputTokens: 500, outputTokens: 40 });
	});

	describe("tool calls", () => {
		it("assembles fragmented arguments, runs the tool, and loops back", async () => {
			create
				.mockResolvedValueOnce(
					streamOf([
						...toolCallChunks(0, "call_1", "get_schedule", '{"start_date":"2026-08-25"}'),
						finish("tool_calls"),
					]),
				)
				.mockResolvedValueOnce(streamOf([textChunk("Three visits."), finish("stop")]));
			executeTool.mockResolvedValue({ ok: true, data: { total_visits: 3, unassigned: [] } });

			const events = await run();

			expect(executeTool).toHaveBeenCalledOnce();
			expect(executeTool.mock.calls[0][0]).toBe("get_schedule");
			expect(executeTool.mock.calls[0][1]).toEqual({ start_date: "2026-08-25" });
			expect(typesOf(events)).toEqual(["tool_call", "tool_result", "text_delta", "done"]);
			expect(events[1]).toMatchObject({ ok: true, summary: expect.stringContaining("3 visits") });
		});

		it("passes the caller's context and policy to every tool call", async () => {
			// The loop must never widen what Phase 1 decided; it only forwards.
			create
				.mockResolvedValueOnce(streamOf([...toolCallChunks(0, "c1", "get_record", "{}"), finish("tool_calls")]))
				.mockResolvedValueOnce(streamOf([textChunk("done"), finish("stop")]));
			executeTool.mockResolvedValue({ ok: true, data: {} });

			await run();

			expect(executeTool.mock.calls[0][2]).toBe(ctx);
			expect(executeTool.mock.calls[0][3]).toBe(READ_ONLY_POLICY);
		});

		it("runs several calls from one turn in order", async () => {
			create
				.mockResolvedValueOnce(
					streamOf([
						...toolCallChunks(0, "c1", "search_records", '{"query":"acme"}'),
						...toolCallChunks(1, "c2", "get_record", '{"type":"client"}'),
						finish("tool_calls"),
					]),
				)
				.mockResolvedValueOnce(streamOf([textChunk("ok"), finish("stop")]));
			executeTool.mockResolvedValue({ ok: true, data: {} });

			await run();

			expect(executeTool.mock.calls.map((c) => c[0])).toEqual(["search_records", "get_record"]);
		});

		it("feeds a tool failure back to the model instead of ending the turn", async () => {
			create
				.mockResolvedValueOnce(streamOf([...toolCallChunks(0, "c1", "get_record", "{}"), finish("tool_calls")]))
				.mockResolvedValueOnce(streamOf([textChunk("I could not find that."), finish("stop")]));
			executeTool.mockResolvedValue({ ok: false, error: { code: "NOT_FOUND", message: "gone" } });

			const events = await run();

			expect(events[1]).toMatchObject({ type: "tool_result", ok: false, errorCode: "NOT_FOUND" });
			expect(create).toHaveBeenCalledTimes(2);
			expect(typesOf(events)).toContain("done");
		});

		it("reports malformed arguments as a tool failure without executing anything", async () => {
			// Truncated turns produce unparseable JSON. Executing a guess would be
			// worse than telling the model it emitted something invalid.
			create
				.mockResolvedValueOnce(
					streamOf([...toolCallChunks(0, "c1", "get_record", '{"type":'), finish("tool_calls")]),
				)
				.mockResolvedValueOnce(streamOf([textChunk("retrying"), finish("stop")]));

			const events = await run();

			expect(executeTool).not.toHaveBeenCalled();
			expect(events[1]).toMatchObject({ type: "tool_result", ok: false, errorCode: "VALIDATION_ERROR" });
		});

		it("stores the provider's call id so the transcript can be replayed", async () => {
			create
				.mockResolvedValueOnce(streamOf([...toolCallChunks(0, "call_abc", "get_record", "{}"), finish("tool_calls")]))
				.mockResolvedValueOnce(streamOf([textChunk("ok"), finish("stop")]));
			executeTool.mockResolvedValue({ ok: true, data: {} });

			await run();

			expect(appendAssistantMessage.mock.calls[0][2].toolCalls[0]).toMatchObject({
				provider_call_id: "call_abc",
				tool_name: "get_record",
				status: "ok",
			});
		});

		it("sums usage across every model call in the turn", async () => {
			create
				.mockResolvedValueOnce(
					streamOf([...toolCallChunks(0, "c1", "get_record", "{}"), finish("tool_calls"), usageChunk(100, 10)]),
				)
				.mockResolvedValueOnce(streamOf([textChunk("ok"), finish("stop"), usageChunk(300, 20)]));
			executeTool.mockResolvedValue({ ok: true, data: {} });

			const events = await run();

			expect(events.at(-1)).toMatchObject({ type: "done", usage: { input: 400, output: 30 } });
		});
	});

	describe("guards", () => {
		it("stops at the iteration limit and says so", async () => {
			// A model that keeps calling tools must not loop forever against a paid API.
			create.mockResolvedValue(
				streamOf([...toolCallChunks(0, "c1", "get_record", "{}"), finish("tool_calls")]),
			);
			executeTool.mockResolvedValue({ ok: true, data: {} });

			const events = await run();

			expect(create.mock.calls.length).toBeLessThanOrEqual(8);
			expect(events.some((e) => e.type === "error" && e.code === "ITERATION_LIMIT")).toBe(true);
			expect(events.at(-1)?.type).toBe("done");
		});

		it("stops immediately when the client disconnects", async () => {
			const controller = new AbortController();
			controller.abort();
			create.mockResolvedValue(streamOf([textChunk("never"), finish("stop")]));

			const events = await run({ signal: controller.signal });

			expect(events).toEqual([]);
			expect(create).not.toHaveBeenCalled();
		});

		it("stops between tool calls when the client disconnects mid-turn", async () => {
			const controller = new AbortController();
			create.mockResolvedValueOnce(
				streamOf([...toolCallChunks(0, "c1", "get_record", "{}"), finish("tool_calls")]),
			);
			executeTool.mockImplementation(async () => {
				controller.abort();
				return { ok: true, data: {} };
			});

			const events = await run({ signal: controller.signal });

			expect(create).toHaveBeenCalledOnce();
			expect(events.some((e) => e.type === "done")).toBe(false);
		});
	});

	it("sends the system prompt and the replayed history to the model", async () => {
		loadMessages.mockResolvedValue([
			{ role: "user", content: "earlier question", tool_calls: [] },
			{ role: "assistant", content: "earlier answer", tool_calls: [] },
		] as never);
		create.mockResolvedValueOnce(streamOf([textChunk("ok"), finish("stop")]));

		await run();

		const messages = create.mock.calls[0][0].messages;
		expect(messages[0].role).toBe("system");
		expect(messages[0].content).toContain("Dana Reyes");
		expect(messages.slice(1)).toEqual([
			{ role: "user", content: "earlier question" },
			{ role: "assistant", content: "earlier answer" },
		]);
	});
});
