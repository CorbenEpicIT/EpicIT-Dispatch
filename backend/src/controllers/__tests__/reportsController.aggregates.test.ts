import { describe, it, expect, vi } from "vitest";
import { aggregateBacklog, aggregateFieldAdded, type BacklogQueryRow } from "../reportsController.js";

// reportsController pulls in the Prisma client at import time; these
// aggregators are pure and need none of it.
vi.mock("../../db.js", () => {
	const $extends = vi.fn();
	const mockDb = { $extends, $queryRaw: vi.fn() };
	$extends.mockReturnValue(mockDb);
	return { db: mockDb };
});

describe("aggregateBacklog", () => {
	it("returns every status with empty buckets when there are no rows", () => {
		const out = aggregateBacklog([]);
		expect(out.statuses.map((s) => s.status)).toEqual(["Unscheduled", "Scheduled", "InProgress"]);
		for (const s of out.statuses) {
			expect(s.total).toEqual({ count: 0, revenue: 0 });
			expect(s.fresh).toEqual({ count: 0, revenue: 0 });
			expect(s.aging).toEqual({ count: 0, revenue: 0 });
			expect(s.stalled).toEqual({ count: 0, revenue: 0 });
		}
		expect(out.totals.total).toEqual({ count: 0, revenue: 0 });
	});

	it("rolls bucket rows up into per-status and grand totals", () => {
		const rows: BacklogQueryRow[] = [
			{ status: "Unscheduled", bucket: "fresh", count: 2, revenue: "100.00" },
			{ status: "Unscheduled", bucket: "stalled", count: 1, revenue: "50.50" },
			{ status: "Scheduled", bucket: "aging", count: 3, revenue: "300.25" },
			{ status: "InProgress", bucket: "fresh", count: 1, revenue: "10" },
		];
		const out = aggregateBacklog(rows);
		const byStatus = Object.fromEntries(out.statuses.map((s) => [s.status, s]));

		expect(byStatus.Unscheduled.fresh).toEqual({ count: 2, revenue: 100 });
		expect(byStatus.Unscheduled.stalled).toEqual({ count: 1, revenue: 50.5 });
		expect(byStatus.Unscheduled.total).toEqual({ count: 3, revenue: 150.5 });
		expect(byStatus.Scheduled.aging).toEqual({ count: 3, revenue: 300.25 });
		expect(byStatus.Scheduled.total).toEqual({ count: 3, revenue: 300.25 });
		expect(byStatus.InProgress.total).toEqual({ count: 1, revenue: 10 });

		expect(out.totals.fresh).toEqual({ count: 3, revenue: 110 });
		expect(out.totals.aging).toEqual({ count: 3, revenue: 300.25 });
		expect(out.totals.stalled).toEqual({ count: 1, revenue: 50.5 });
		expect(out.totals.total).toEqual({ count: 7, revenue: 460.75 });
	});

	it("rounds revenue to cents as it accumulates", () => {
		const out = aggregateBacklog([
			{ status: "Scheduled", bucket: "fresh", count: 1, revenue: "0.10" },
			{ status: "Scheduled", bucket: "fresh", count: 1, revenue: "0.20" },
		]);
		expect(out.statuses[1].fresh.revenue).toBe(0.3);
		expect(out.totals.total.revenue).toBe(0.3);
	});

	it("ignores rows whose status is not a backlog status", () => {
		const out = aggregateBacklog([
			{ status: "Completed" as BacklogQueryRow["status"], bucket: "fresh", count: 9, revenue: "900" },
		]);
		expect(out.totals.total).toEqual({ count: 0, revenue: 0 });
	});
});

describe("aggregateFieldAdded", () => {
	const visit = (jobId: string, at: string, techIds: string[]) => ({
		job_id: jobId,
		scheduled_start_at: new Date(at),
		visit_techs: techIds.map((id) => ({ tech: { id, name: `Tech ${id}` } })),
	});
	const names = new Map([
		["t1", "Alice"],
		["t2", "Bob"],
	]);

	it("credits a reconciled item wholly to the reconciling tech", () => {
		const { rows } = aggregateFieldAdded(
			[{ total: 120, reconciled_by_tech_id: "t2", visit: visit("j1", "2026-08-03T10:00:00Z", ["t1", "t2"]) }],
			names,
		);
		expect(rows).toEqual([
			{ techId: "t2", techName: "Bob", itemCount: 1, jobCount: 1, fieldAddedRevenue: 120, avgPerItem: 120 },
		]);
	});

	it("splits an unreconciled item evenly across the visit's techs (each counts the item once)", () => {
		const { rows } = aggregateFieldAdded(
			[{ total: 100, reconciled_by_tech_id: null, visit: visit("j1", "2026-08-03T10:00:00Z", ["t1", "t2"]) }],
			names,
		);
		const byTech = Object.fromEntries(rows.map((r) => [r.techId, r]));
		expect(byTech.t1.fieldAddedRevenue).toBe(50);
		expect(byTech.t2.fieldAddedRevenue).toBe(50);
		// Per-tech itemCount is "items this tech touched" — the same item shows on
		// both rows, which is why the registry's distinct total must not sum these.
		expect(byTech.t1.itemCount).toBe(1);
		expect(byTech.t2.itemCount).toBe(1);
	});

	it("buckets an item on a visit with no techs as Unassigned", () => {
		const { rows } = aggregateFieldAdded(
			[{ total: 40, reconciled_by_tech_id: null, visit: visit("j1", "2026-08-03T10:00:00Z", []) }],
			names,
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].techName).toBe("Unassigned");
		expect(rows[0].fieldAddedRevenue).toBe(40);
	});

	it("counts distinct jobs, sorts by revenue desc and builds a per-(tech, month) trend", () => {
		const { rows, trend } = aggregateFieldAdded(
			[
				{ total: 30, reconciled_by_tech_id: "t1", visit: visit("j1", "2026-07-10T10:00:00Z", ["t1"]) },
				{ total: 20, reconciled_by_tech_id: "t1", visit: visit("j1", "2026-08-10T10:00:00Z", ["t1"]) },
				{ total: 200, reconciled_by_tech_id: "t2", visit: visit("j2", "2026-08-11T10:00:00Z", ["t2"]) },
			],
			names,
		);
		expect(rows.map((r) => r.techId)).toEqual(["t2", "t1"]);
		expect(rows[1].jobCount).toBe(1);
		expect(rows[1].itemCount).toBe(2);
		expect(rows[1].avgPerItem).toBe(25);
		expect(trend.techs).toEqual([
			{ id: "t2", name: "Bob" },
			{ id: "t1", name: "Alice" },
		]);
		expect(trend.points).toEqual(
			expect.arrayContaining([
				{ month: "2026-07", techId: "t1", revenue: 30 },
				{ month: "2026-08", techId: "t1", revenue: 20 },
				{ month: "2026-08", techId: "t2", revenue: 200 },
			]),
		);
		expect(trend.points).toHaveLength(3);
	});

	it("names unknown tech ids 'Unknown' rather than dropping their revenue", () => {
		const { rows } = aggregateFieldAdded(
			[{ total: 10, reconciled_by_tech_id: "ghost", visit: visit("j1", "2026-08-03T10:00:00Z", []) }],
			names,
		);
		expect(rows[0]).toMatchObject({ techId: "ghost", techName: "Unknown", fieldAddedRevenue: 10 });
	});
});
