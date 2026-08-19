import { describe, it, expect } from "vitest";
import {
	createProjectSchema,
	updateProjectSchema,
	attachJobSchema,
	PROJECT_BUDGET_MAX,
} from "../projects.js";

const CLIENT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DISPATCHER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const JOB_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

describe("updateProjectSchema — clearable fields", () => {
	it("keeps manager_dispatcher_id: null so the manager can be unassigned", () => {
		const parsed = updateProjectSchema.parse({ manager_dispatcher_id: null });
		expect(parsed.manager_dispatcher_id).toBeNull();
	});

	it("leaves manager_dispatcher_id undefined when the key is absent", () => {
		const parsed = updateProjectSchema.parse({ name: "Renamed" });
		expect(parsed.manager_dispatcher_id).toBeUndefined();
	});

	it("keeps an explicit dispatcher id", () => {
		const parsed = updateProjectSchema.parse({ manager_dispatcher_id: DISPATCHER_ID });
		expect(parsed.manager_dispatcher_id).toBe(DISPATCHER_ID);
	});

	it("persists description: '' (NOT NULL column) instead of skipping it", () => {
		const parsed = updateProjectSchema.parse({ description: "" });
		expect(parsed.description).toBe("");
	});

	it("maps address: '' to null (nullable column) and keeps undefined when absent", () => {
		expect(updateProjectSchema.parse({ address: "" }).address).toBeNull();
		expect(updateProjectSchema.parse({ address: null }).address).toBeNull();
		expect(updateProjectSchema.parse({ address: "1 Main St" }).address).toBe("1 Main St");
		expect(updateProjectSchema.parse({}).address).toBeUndefined();
	});

	it("maps cancellation_reason: '' to null", () => {
		expect(updateProjectSchema.parse({ cancellation_reason: "" }).cancellation_reason).toBeNull();
		expect(updateProjectSchema.parse({}).cancellation_reason).toBeUndefined();
	});

	it("keeps null for budget / starts_at / target_end_at", () => {
		const parsed = updateProjectSchema.parse({
			budget: null,
			starts_at: null,
			target_end_at: null,
		});
		expect(parsed.budget).toBeNull();
		expect(parsed.starts_at).toBeNull();
		expect(parsed.target_end_at).toBeNull();
	});

	it("still rejects an empty name", () => {
		expect(updateProjectSchema.safeParse({ name: "" }).success).toBe(false);
	});
});

describe("project schemas — target end vs start", () => {
	const start = "2026-09-01T00:00:00.000Z";
	const before = "2026-08-31T00:00:00.000Z";
	const after = "2026-09-02T00:00:00.000Z";

	it("update: rejects target_end_at before starts_at", () => {
		const result = updateProjectSchema.safeParse({ starts_at: start, target_end_at: before });
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0].path).toEqual(["target_end_at"]);
			expect(result.error.issues[0].message).toMatch(/before the start date/i);
		}
	});

	it("update: accepts end on/after start, or either side missing", () => {
		expect(updateProjectSchema.safeParse({ starts_at: start, target_end_at: after }).success).toBe(true);
		expect(updateProjectSchema.safeParse({ starts_at: start, target_end_at: start }).success).toBe(true);
		expect(updateProjectSchema.safeParse({ starts_at: start, target_end_at: null }).success).toBe(true);
		expect(updateProjectSchema.safeParse({ target_end_at: before }).success).toBe(true);
	});

	it("create: rejects target_end_at before starts_at", () => {
		const result = createProjectSchema.safeParse({
			name: "P",
			client_id: CLIENT_ID,
			starts_at: start,
			target_end_at: before,
		});
		expect(result.success).toBe(false);
	});
});

describe("project schemas — budget bounds", () => {
	it("accepts the Decimal(12,2) maximum and rejects anything above it", () => {
		expect(updateProjectSchema.safeParse({ budget: PROJECT_BUDGET_MAX }).success).toBe(true);
		expect(updateProjectSchema.safeParse({ budget: PROJECT_BUDGET_MAX + 1 }).success).toBe(false);
		expect(
			createProjectSchema.safeParse({ name: "P", client_id: CLIENT_ID, budget: 10_000_000_000 })
				.success,
		).toBe(false);
	});

	it("rejects a negative budget", () => {
		expect(updateProjectSchema.safeParse({ budget: -1 }).success).toBe(false);
	});
});

describe("attachJobSchema — jobId comes from the URL", () => {
	it("accepts a valid URL jobId with no body", () => {
		expect(attachJobSchema.parse({ jobId: JOB_ID })).toEqual({ jobId: JOB_ID });
	});

	it("accepts a body jobId that matches the URL", () => {
		expect(attachJobSchema.safeParse({ jobId: JOB_ID, bodyJobId: JOB_ID }).success).toBe(true);
	});

	it("rejects a body jobId that disagrees with the URL", () => {
		const result = attachJobSchema.safeParse({ jobId: JOB_ID, bodyJobId: CLIENT_ID });
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0].message).toMatch(/does not match the URL/i);
		}
	});

	it("rejects a non-uuid URL jobId", () => {
		expect(attachJobSchema.safeParse({ jobId: "not-a-uuid" }).success).toBe(false);
	});
});
