import { describe, expect, it, vi } from "vitest";

vi.mock("../../db.js", async () => ({
	db: (await import("../../routes/__tests__/harness.js")).createFakeDb(),
	generateJobNumber: vi.fn(),
}));

import "../../agent/index.js";
import { READ_ONLY_POLICY } from "../../agent/policy.js";
import type { AgentContext } from "../../agent/types.js";
import { parseToolArguments, summariseToolResult, toolsForOpenAI } from "../toolBridge.js";

const ctxWith = (...permissions: string[]): AgentContext => ({
	userId: "u",
	role: "dispatcher",
	organizationId: "org-1",
	permissions,
	actorType: "dispatcher",
	surface: "assistant",
});

describe("toolsForOpenAI", () => {
	it("renders the registry in OpenAI's function shape", () => {
		const tools = toolsForOpenAI(ctxWith("view_jobs"), READ_ONLY_POLICY);
		expect(tools.length).toBeGreaterThan(0);
		for (const tool of tools) {
			expect(tool.type).toBe("function");
			expect(typeof tool.function.name).toBe("string");
			expect(tool.function.parameters).toMatchObject({ type: "object" });
		}
	});

	it("advertises only what the caller may call", () => {
		const names = toolsForOpenAI(ctxWith("view_inventory"), READ_ONLY_POLICY).map((t) => t.function.name);
		expect(names).toContain("get_inventory_levels");
		expect(names).not.toContain("run_report");
	});

	it("advertises nothing to a caller with no permissions", () => {
		expect(toolsForOpenAI(ctxWith(), READ_ONLY_POLICY)).toEqual([]);
	});

	it("hides write tools under the read-only policy", () => {
		const risky = toolsForOpenAI(ctxWith("view_jobs", "edit_jobs", "create_jobs"), READ_ONLY_POLICY);
		expect(risky.every((t) => t.function.name.startsWith("get") || t.function.name.startsWith("list") || t.function.name.startsWith("search") || t.function.name.startsWith("run"))).toBe(true);
	});
});

describe("parseToolArguments", () => {
	it("parses well-formed JSON", () => {
		expect(parseToolArguments('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
	});

	it("treats an empty string as no arguments", () => {
		// Models emit "" for a zero-argument tool rather than "{}".
		expect(parseToolArguments("   ")).toEqual({ ok: true, value: {} });
	});

	it("reports malformed JSON instead of throwing", () => {
		// A truncated turn must be recoverable: the model gets told, and retries.
		const result = parseToolArguments('{"a":');
		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("expected failure");
		expect(result.message).toContain("not valid JSON");
	});
});

describe("summariseToolResult", () => {
	it.each([
		["search_records", { query: "acme" }, { hits: [1, 2] }, "2 matches"],
		["search_records", { query: "acme" }, { hits: [1] }, "1 match"],
		["list_records", { type: "job" }, { returned: 5, total: 40 }, "Listed 5 of 40 jobs"],
		["get_schedule", {}, { total_visits: 3, unassigned: [1] }, "3 visits, 1 unassigned"],
		["get_technician_availability", {}, { technicians: [1, 2, 3] }, "3 technicians"],
		["get_inventory_levels", {}, { items: [1] }, "1 item"],
		["run_report", {}, { report: "jobs" }, "jobs report"],
		["get_entity_history", {}, { entries: [1, 2] }, "2 history entries"],
		["get_record", { type: "job" }, { found: false }, "not found"],
		["get_record", {}, { type: "job", job_number: "J-1042" }, "Opened job J-1042"],
	])("summarises %s for a person", (tool, input, data, expected) => {
		expect(summariseToolResult(tool, input, data)).toContain(expected);
	});

	it("falls back to the tool name for an unrecognised shape", () => {
		expect(summariseToolResult("something_new", {}, { odd: true })).toBe("Ran something_new");
	});

	it("survives a null result", () => {
		expect(summariseToolResult("get_record", {}, null)).toBe("Ran get_record");
	});
});
