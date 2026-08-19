import { describe, expect, it } from "vitest";
import { vi } from "vitest";

// The catalog imports every tool, which transitively pulls in controllers and
// services that reach for the Prisma client at module load. The route harness's
// fake covers that without a database.
vi.mock("../../db.js", async () => ({
	db: (await import("../../routes/__tests__/harness.js")).createFakeDb(),
	generateJobNumber: vi.fn(),
	generateQuoteNumber: vi.fn(),
	generateInvoiceNumber: vi.fn(),
	generateProjectNumber: vi.fn(),
	SECRET_FIELD_OMIT: {},
}));

import "../index.js";
import { AGENT_PERMISSION_CEILING } from "../policy.js";
import { describeTools, listTools } from "../registry.js";
import { toolInputSchema } from "../schema.js";

/** Phase 1 ships exactly these. A tool added without a line here fails this test on purpose. */
const EXPECTED = [
	"search_records",
	"get_record",
	"list_records",
	"get_schedule",
	"get_technician_availability",
	"get_inventory_levels",
	"run_report",
	"get_entity_history",
].sort();

describe("Phase 1 tool catalog", () => {
	it("registers exactly the expected tools", () => {
		expect(listTools().map((t) => t.name).sort()).toEqual(EXPECTED);
	});

	it("ships reads only", () => {
		expect(listTools().every((t) => t.risk === "read")).toBe(true);
	});

	it("only requires permissions the ceiling can actually grant", () => {
		// A tool gated on a permission outside AGENT_PERMISSION_CEILING is
		// unreachable by construction: resolveAgentPermissions can never produce
		// it, so every call would 403. Catch that here rather than in production.
		for (const tool of listTools()) {
			for (const permission of tool.permissions) {
				expect(
					AGENT_PERMISSION_CEILING.has(permission),
					`${tool.name} requires "${permission}", which the ceiling never grants`,
				).toBe(true);
			}
		}
	});

	it("gives every tool a usable JSON Schema", () => {
		for (const tool of listTools()) {
			const schema = toolInputSchema(tool.input);
			expect(schema.type, tool.name).toBe("object");
			expect(schema, tool.name).not.toHaveProperty("$schema");
		}
	});

	it("describes every tool for the model in more than a few words", () => {
		for (const tool of listTools()) {
			expect(tool.description.length, tool.name).toBeGreaterThan(60);
			expect(tool.title.length, tool.name).toBeGreaterThan(0);
		}
	});

	it("shows a dispatcher only the tools their permissions reach", () => {
		const names = describeTools({
			permissions: ["view_inventory"],
			allowWrites: false,
			allowDestructive: false,
		}).map((t) => t.name);

		expect(names).toContain("get_inventory_levels");
		expect(names).toContain("search_records");
		// search_records and the record tools accept view_inventory as one of their
		// ANY-OF permissions; reports and scheduling do not.
		expect(names).not.toContain("run_report");
		expect(names).not.toContain("get_schedule");
		expect(names).not.toContain("get_technician_availability");
	});

	it("shows a caller with no permissions nothing at all", () => {
		expect(describeTools({ permissions: [], allowWrites: false, allowDestructive: false })).toEqual([]);
	});
});
