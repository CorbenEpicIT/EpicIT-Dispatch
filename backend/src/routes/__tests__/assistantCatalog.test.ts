import { describe, expect, it, vi } from "vitest";

vi.mock("../../services/lowStockAlerts.js", () => ({
	fireLowStockAlerts: vi.fn().mockResolvedValue(undefined),
	sendLowStockAlert: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../db.js", async () => ({
	db: (await import("./harness.js")).createFakeDb(),
	generateJobNumber: vi.fn(),
	generateQuoteNumber: vi.fn(),
	generateInvoiceNumber: vi.fn(),
	generateProjectNumber: vi.fn(),
	SECRET_FIELD_OMIT: {},
}));

// Imported for its side effects, exactly as the Express app does.
import "../assistant.js";
import { describeTools, listTools } from "../../agent/registry.js";
import { AGENT_PERMISSION_CEILING } from "../../agent/policy.js";

/**
 * Regression: the assistant shipped non-functional because tools register by
 * side-effect import and nothing in the HTTP process performed it. Every unit
 * test passed — they each import `agent/index.js` directly — while the running
 * server saw an empty catalog, reported `enabled: false`, and the panel hid
 * itself. The symptom is indistinguishable from "this user has no permissions",
 * which is why it survived review.
 */
describe("the assistant routes populate the tool catalog", () => {
	it("registers tools merely by importing the router", () => {
		expect(listTools().length).toBeGreaterThan(0);
	});

	it("offers a real dispatcher a usable set of tools", () => {
		const tools = describeTools({
			permissions: [...AGENT_PERMISSION_CEILING],
			allowWrites: true,
			allowDestructive: false,
		});
		expect(tools.length).toBeGreaterThan(0);
		expect(tools.map((t) => t.name)).toContain("get_schedule");
	});
});
