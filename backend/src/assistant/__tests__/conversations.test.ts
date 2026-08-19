import { describe, expect, it, vi } from "vitest";

vi.mock("../../db.js", async () => ({
	db: (await import("../../routes/__tests__/harness.js")).createFakeDb(),
}));

import { deriveTitle, toTranscript } from "../conversations.js";

type Stored = Parameters<typeof toTranscript>[0][number];

const message = (over: Partial<Stored>): Stored =>
	({
		id: "m",
		role: "user",
		content: "",
		created_at: new Date(),
		input_tokens: null,
		output_tokens: null,
		tool_calls: [],
		...over,
	}) as Stored;

const call = (over: Record<string, unknown> = {}) => ({
	id: "tc",
	provider_call_id: "call_1",
	tool_name: "get_record",
	input: { id: "x" },
	status: "ok",
	result: { ok: true, data: { name: "Acme" } },
	error_code: null,
	duration_ms: 12,
	...over,
});

describe("toTranscript", () => {
	it("replays a plain exchange", () => {
		expect(
			toTranscript([
				message({ role: "user", content: "hi" }),
				message({ role: "assistant", content: "hello" }),
			]),
		).toEqual([
			{ role: "user", content: "hi" },
			{ role: "assistant", content: "hello" },
		]);
	});

	it("pairs each tool result back to the call that asked for it", () => {
		// The API rejects a transcript where a tool message has no matching
		// tool_call_id, which is why the provider's id is stored rather than
		// regenerated on replay.
		const transcript = toTranscript([
			message({ role: "assistant", content: "", tool_calls: [call()] as never }),
		]);

		expect(transcript).toEqual([
			{
				role: "assistant",
				content: null,
				tool_calls: [
					{ id: "call_1", type: "function", function: { name: "get_record", arguments: '{"id":"x"}' } },
				],
			},
			{ role: "tool", tool_call_id: "call_1", content: JSON.stringify({ ok: true, data: { name: "Acme" } }) },
		]);
	});

	it("sends null, not an empty string, for a tool-only assistant turn", () => {
		const [assistant] = toTranscript([message({ role: "assistant", content: "", tool_calls: [call()] as never })]);
		expect(assistant).toMatchObject({ content: null });
	});

	it("keeps text that accompanied a tool call", () => {
		const [assistant] = toTranscript([
			message({ role: "assistant", content: "Let me look.", tool_calls: [call()] as never }),
		]);
		expect(assistant).toMatchObject({ content: "Let me look." });
	});

	it("emits one tool message per call, in order", () => {
		const transcript = toTranscript([
			message({
				role: "assistant",
				content: "",
				tool_calls: [call({ provider_call_id: "a" }), call({ provider_call_id: "b" })] as never,
			}),
		]);
		expect(transcript.map((m) => m.role)).toEqual(["assistant", "tool", "tool"]);
		expect(transcript.slice(1).map((m) => (m as { tool_call_id: string }).tool_call_id)).toEqual(["a", "b"]);
	});

	it("drops an empty assistant turn that carries nothing", () => {
		expect(toTranscript([message({ role: "assistant", content: "   " })])).toEqual([]);
	});

	it("substitutes a marker when a call has no recorded result", () => {
		// Rather than emitting `null`, which the API rejects for a tool message.
		const transcript = toTranscript([
			message({ role: "assistant", content: "", tool_calls: [call({ result: null })] as never }),
		]);
		expect(JSON.parse((transcript[1] as { content: string }).content)).toMatchObject({ ok: false });
	});

	it("preserves a failed call so the model does not retry it blindly", () => {
		const transcript = toTranscript([
			message({
				role: "assistant",
				content: "",
				tool_calls: [call({ status: "error", result: { ok: false, error: { code: "NOT_FOUND" } } })] as never,
			}),
		]);
		expect((transcript[1] as { content: string }).content).toContain("NOT_FOUND");
	});
});

describe("deriveTitle", () => {
	it("uses a short question verbatim", () => {
		expect(deriveTitle("What is on for Tuesday?")).toBe("What is on for Tuesday?");
	});

	it("collapses whitespace", () => {
		expect(deriveTitle("  what   is\n on? ")).toBe("what is on?");
	});

	it("truncates a long opener", () => {
		const title = deriveTitle("x".repeat(200));
		expect(title).toHaveLength(58);
		expect(title.endsWith("…")).toBe(true);
	});

	it("falls back rather than producing an empty title", () => {
		expect(deriveTitle("   ")).toBe("New conversation");
	});
});
