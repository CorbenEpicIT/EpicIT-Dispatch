import { describe, it, expect, vi, beforeEach } from "vitest";
import { getItemPriceHistory } from "../inventoryController.js";
import { db } from "../../db.js";

vi.mock("../../db.js", () => {
	const $extends = vi.fn();
	const mockDb = {
		inventory_item: { findFirst: vi.fn() },
		log: { findMany: vi.fn() },
		stock_movement: { findMany: vi.fn() },
		$queryRaw: vi.fn(),
		$extends,
	};
	$extends.mockReturnValue(mockDb);
	return { db: mockDb };
});

vi.mock("../reportsController.js", () => ({ getItemReorderForecast: vi.fn() }));
vi.mock("../../services/logger.js", () => ({
	logActivity: vi.fn().mockResolvedValue(undefined),
	buildChanges: vi.fn().mockReturnValue({}),
}));
vi.mock("../../services/lowStockAlerts.js", () => ({
	sendLowStockAlert: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../services/socketService.js", () => ({ emitInventoryUpdated: vi.fn() }));
vi.mock("../../services/stockMovements.js", () => ({
	recordMovements: vi.fn(),
	InsufficientStockError: class extends Error {},
	getOrCreateBatch: vi.fn(),
	InsufficientBatchStockError: class extends Error {},
	TrackingValidationError: class extends Error {},
	lockInventoryRows: vi.fn(),
}));
vi.mock("../../services/inventoryTracking.js", () => ({
	shortCode: vi.fn(() => "LOT-TEST"),
	buildTrackingInputs: vi.fn(),
	TrackingValidationError: class extends Error {},
	lockBatchRows: vi.fn(),
	lockSerialRows: vi.fn(),
}));

const mockDb = vi.mocked(db) as unknown as {
	inventory_item: { findFirst: ReturnType<typeof vi.fn> };
	log: { findMany: ReturnType<typeof vi.fn> };
	stock_movement: { findMany: ReturnType<typeof vi.fn> };
	$queryRaw: ReturnType<typeof vi.fn>;
};

const ORG = "org-1";
const ITEM = "item-1";
const CREATED_AT = new Date("2026-01-01T00:00:00.000Z");

function setupItem(overrides: Record<string, unknown> = {}) {
	mockDb.inventory_item.findFirst.mockResolvedValue({
		id: ITEM,
		cost: 44,
		unit_price: 99,
		created_at: CREATED_AT,
		...overrides,
	});
}

// Tests that don't care about charged price / receipts get empty ones.
function setupNoSales() {
	mockDb.$queryRaw.mockResolvedValue([]);
	mockDb.stock_movement.findMany.mockResolvedValue([]);
}

function logEntry(at: string, changes: Record<string, unknown>) {
	return { timestamp: new Date(at), changes };
}

// The charged-price query is a tagged template, so the literal fragments arrive
// as the first argument. Joining them (interpolations dropped) is enough to
// assert on the SQL's SHAPE — which clock it buckets by, what it filters out.
function chargedSql() {
	return (mockDb.$queryRaw.mock.calls[0][0] as string[]).join("");
}

function receipt(at: string, qty: number, unit_cost: number | null, batchNumber?: string) {
	return {
		created_at: new Date(at),
		qty,
		unit_cost,
		movement_batches: batchNumber ? [{ batch: { batch_number: batchNumber } }] : [],
	};
}

describe("getItemPriceHistory", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		setupItem();
		setupNoSales();
		mockDb.log.findMany.mockResolvedValue([]);
	});

	it("404s for an unknown item", async () => {
		mockDb.inventory_item.findFirst.mockResolvedValue(null);
		const result = await getItemPriceHistory(ITEM, ORG);
		expect(result.err).toContain("not found");
	});

	it("rejects an invalid bucket", async () => {
		const result = await getItemPriceHistory(ITEM, ORG, { bucket: "decade" });
		expect(result.err).toBeTruthy();
		expect(result.cost).toBeUndefined();
	});

	describe("step series", () => {
		it("anchors the series at created_at using the first change's old value", async () => {
			mockDb.log.findMany.mockResolvedValue([
				logEntry("2026-03-01T00:00:00.000Z", { cost: { old: 39, new: 44 } }),
			]);

			const result = await getItemPriceHistory(ITEM, ORG);
			const points = result.cost!.points;

			// created_at @ 39 (the pre-change value) → change @ 44 → live tail @ 44
			expect(points).toHaveLength(3);
			expect(points[0]).toEqual({ at: CREATED_AT.toISOString(), value: 39 });
			expect(points[1]).toEqual({ at: "2026-03-01T00:00:00.000Z", value: 44 });
			expect(points[2].value).toBe(44);
		});

		it("pins the tail point to the LIVE column value, not the last logged one", async () => {
			// Cost changed outside the audited path (or the log lost a row): the item
			// says 44 while the log's last known value says 41.
			mockDb.log.findMany.mockResolvedValue([
				logEntry("2026-03-01T00:00:00.000Z", { cost: { old: 39, new: 41 } }),
			]);

			const points = (await getItemPriceHistory(ITEM, ORG)).cost!.points;
			expect(points[points.length - 1].value).toBe(44);
		});

		it("omits the created_at anchor when the field was previously unset", async () => {
			mockDb.log.findMany.mockResolvedValue([
				logEntry("2026-03-01T00:00:00.000Z", { cost: { old: null, new: 44 } }),
			]);

			const points = (await getItemPriceHistory(ITEM, ORG)).cost!.points;
			// No anchor — there was no earlier value being held.
			expect(points[0]).toEqual({ at: "2026-03-01T00:00:00.000Z", value: 44 });
			expect(points).toHaveLength(2);
		});

		it("coerces string-serialized Decimals", async () => {
			mockDb.log.findMany.mockResolvedValue([
				logEntry("2026-03-01T00:00:00.000Z", { cost: { old: "39.50", new: "44.25" } }),
			]);

			const points = (await getItemPriceHistory(ITEM, ORG)).cost!.points;
			expect(points[0].value).toBe(39.5);
			expect(points[1].value).toBe(44.25);
		});

		it("drops unusable change entries instead of plotting NaN", async () => {
			mockDb.log.findMany.mockResolvedValue([
				logEntry("2026-02-01T00:00:00.000Z", { cost: { old: 39, new: "not-a-number" } }),
				logEntry("2026-03-01T00:00:00.000Z", { cost: { old: 39, new: 44 } }),
			]);

			const points = (await getItemPriceHistory(ITEM, ORG)).cost!.points;
			expect(points.map((p) => p.value)).toEqual([39, 44, 44]);
		});

		it("treats a cleared value as a real null, not a drop", async () => {
			mockDb.log.findMany.mockResolvedValue([
				logEntry("2026-03-01T00:00:00.000Z", { cost: { old: 39, new: null } }),
			]);
			setupItem({ cost: null });

			const points = (await getItemPriceHistory(ITEM, ORG)).cost!.points;
			expect(points[1]).toEqual({ at: "2026-03-01T00:00:00.000Z", value: null });
		});

		it("returns a flat line for an item that was never edited", async () => {
			const points = (await getItemPriceHistory(ITEM, ORG)).cost!.points;
			expect(points).toHaveLength(2);
			expect(points[0]).toEqual({ at: CREATED_AT.toISOString(), value: 44 });
			expect(points[1].value).toBe(44);
		});

		it("returns nothing when there is no history AND no current value", async () => {
			setupItem({ cost: null, unit_price: null });
			const result = await getItemPriceHistory(ITEM, ORG);
			expect(result.cost!.points).toEqual([]);
			expect(result.price!.points).toEqual([]);
		});

		it("builds cost and unit_price independently from the same log rows", async () => {
			mockDb.log.findMany.mockResolvedValue([
				logEntry("2026-02-01T00:00:00.000Z", { cost: { old: 39, new: 44 } }),
				logEntry("2026-04-01T00:00:00.000Z", { unit_price: { old: 89, new: 99 } }),
			]);

			const result = await getItemPriceHistory(ITEM, ORG);
			expect(result.cost!.points.map((p) => p.value)).toEqual([39, 44, 44]);
			expect(result.price!.points.map((p) => p.value)).toEqual([89, 99, 99]);
		});

		it("keeps a re-stamped carry-in point at the window start", async () => {
			mockDb.log.findMany.mockResolvedValue([
				logEntry("2026-02-01T00:00:00.000Z", { cost: { old: 39, new: 41 } }),
				logEntry("2026-06-01T00:00:00.000Z", { cost: { old: 41, new: 44 } }),
			]);

			const from = "2026-05-01T00:00:00.000Z";
			const points = (await getItemPriceHistory(ITEM, ORG, { created_after: from })).cost!.points;

			// The pre-window value survives, restamped at the window start, so the
			// first visible segment isn't missing.
			expect(points[0]).toEqual({ at: new Date(from).toISOString(), value: 41 });
			expect(points[1]).toEqual({ at: "2026-06-01T00:00:00.000Z", value: 44 });
		});

		it("reports coverageStart from the earliest log row", async () => {
			mockDb.log.findMany.mockResolvedValue([
				logEntry("2026-02-01T00:00:00.000Z", { cost: { old: 39, new: 44 } }),
			]);
			const result = await getItemPriceHistory(ITEM, ORG);
			expect(result.coverageStart).toBe("2026-02-01T00:00:00.000Z");
		});

		it("reports a null coverageStart when the item has no audit history", async () => {
			const result = await getItemPriceHistory(ITEM, ORG);
			expect(result.coverageStart).toBeNull();
		});
	});

	describe("charged price", () => {
		it("averages revenue over quantity per bucket", async () => {
			mockDb.$queryRaw.mockResolvedValue([
				{ periodStart: new Date("2026-06-01T00:00:00.000Z"), qty: 4, revenue: 280 },
				{ periodStart: new Date("2026-07-01T00:00:00.000Z"), qty: 0, revenue: 0 },
			]);

			const result = await getItemPriceHistory(ITEM, ORG, { bucket: "month" });
			expect(result.charged!.bucket).toBe("month");
			expect(result.charged!.points[0].avgUnitPrice).toBe(70);
			// A zero-filled bucket is a real 0 sold, and has no average price.
			expect(result.charged!.points[1].qty).toBe(0);
			expect(result.charged!.points[1].avgUnitPrice).toBeNull();
		});

		it("defaults to weekly buckets", async () => {
			const result = await getItemPriceHistory(ITEM, ORG);
			expect(result.charged!.bucket).toBe("week");
		});

		it("accepts a range at the schema ceiling and clamps it per bucket", async () => {
			const result = await getItemPriceHistory(ITEM, ORG, { bucket: "month", range: 104 });
			expect(result.err).toBe("");
		});

		it("buckets by when the work happened, not when the row was inserted", async () => {
			await getItemPriceHistory(ITEM, ORG, { bucket: "month" });
			// A line item corrected weeks later still belongs to the visit's period.
			expect(chargedSql()).toContain(
				"date_trunc(, COALESCE(jv.actual_end_at, jv.scheduled_start_at, jli.created_at))",
			);
		});

		it("excludes cancelled work from realized price", async () => {
			await getItemPriceHistory(ITEM, ORG);
			expect(chargedSql()).toContain("jv.status <> 'Cancelled'::visit_status");
			expect(chargedSql()).toContain("j.status <> 'Cancelled'::job_status");
		});

		it("spans the item's whole life when no range is given", async () => {
			// "All" on the tab sends neither created_after nor range. The charged
			// cutoff has to reach back to created_at, not to the 12-bucket default,
			// or the chart draws configured prices past where charged ones stop.
			const result = await getItemPriceHistory(ITEM, ORG, { bucket: "month" });
			expect(result.chargedWindowStart).toBe(CREATED_AT.toISOString());
			expect(result.chargedTruncated).toBe(false);
		});

		it("clamps to the bucket cap and says so when the item predates it", async () => {
			setupItem({ created_at: new Date("2015-01-01T00:00:00.000Z") });
			const result = await getItemPriceHistory(ITEM, ORG, { bucket: "month" });
			// 36-month cap: the cutoff moves in, and the truncation is REPORTED —
			// a leading zero-filled bucket looks identical to a cut-off one.
			expect(new Date(result.chargedWindowStart!).getTime()).toBeGreaterThan(
				new Date("2015-01-01T00:00:00.000Z").getTime(),
			);
			expect(result.chargedTruncated).toBe(true);
		});

		it("matches the requested window exactly when created_after is given", async () => {
			const from = "2026-05-01T00:00:00.000Z";
			const result = await getItemPriceHistory(ITEM, ORG, { created_after: from });
			expect(result.chargedWindowStart).toBe(new Date(from).toISOString());
			expect(result.chargedTruncated).toBe(false);
		});
	});

	describe("paid cost", () => {
		it("computes a running weighted average over priced receipts", async () => {
			mockDb.stock_movement.findMany.mockResolvedValue([
				{
					created_at: new Date("2026-02-01T00:00:00.000Z"),
					qty: 10,
					unit_cost: 40,
					movement_batches: [],
				},
				{
					created_at: new Date("2026-03-01T00:00:00.000Z"),
					qty: 10,
					unit_cost: 50,
					movement_batches: [{ batch: { batch_number: "LOT-A" } }],
				},
			]);

			const result = await getItemPriceHistory(ITEM, ORG);
			expect(result.wac!.map((w) => w.value)).toEqual([40, 45]);
			expect(result.receipts![1].batchNumber).toBe("LOT-A");
			expect(result.costCoverage).toEqual({ receipts: 2, withCost: 2, wacBasisReceipts: 2 });
		});

		it("excludes unpriced receipts from the average but still counts them", async () => {
			mockDb.stock_movement.findMany.mockResolvedValue([
				{ created_at: new Date("2026-02-01T00:00:00.000Z"), qty: 10, unit_cost: null, movement_batches: [] },
				{ created_at: new Date("2026-03-01T00:00:00.000Z"), qty: 10, unit_cost: 50, movement_batches: [] },
			]);

			const result = await getItemPriceHistory(ITEM, ORG);
			// 50, not 25 — a missing cost is unknown, not zero.
			expect(result.wac!.map((w) => w.value)).toEqual([50]);
			expect(result.costCoverage).toEqual({ receipts: 2, withCost: 1, wacBasisReceipts: 1 });
		});

		it("ignores receipts with a non-positive quantity", async () => {
			mockDb.stock_movement.findMany.mockResolvedValue([
				{ created_at: new Date("2026-02-01T00:00:00.000Z"), qty: 0, unit_cost: 40, movement_batches: [] },
			]);

			const result = await getItemPriceHistory(ITEM, ORG);
			expect(result.wac).toEqual([]);
			expect(result.receipts).toEqual([]);
			expect(result.costCoverage).toEqual({ receipts: 1, withCost: 0, wacBasisReceipts: 0 });
		});

		it("reads both warehouse receives and field supplier purchases", async () => {
			await getItemPriceHistory(ITEM, ORG);
			expect(mockDb.stock_movement.findMany).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({
						reason: { in: ["receive", "supplier_purchase"] },
					}),
				}),
			);
		});

		it("averages over ALL receipts regardless of the requested window", async () => {
			mockDb.stock_movement.findMany.mockResolvedValue([
				receipt("2026-02-01T00:00:00.000Z", 10, 40),
				receipt("2026-03-01T00:00:00.000Z", 10, 50),
				receipt("2026-06-01T00:00:00.000Z", 20, 80),
			]);

			const all = await getItemPriceHistory(ITEM, ORG);
			const windowed = await getItemPriceHistory(ITEM, ORG, {
				created_after: "2026-05-01T00:00:00.000Z",
			});

			// (10*40 + 10*50 + 20*80) / 40 = 62.5 — the June average is the same
			// number whichever chip is selected. A window-local average would say 80.
			expect(all.wac![all.wac!.length - 1].value).toBe(62.5);
			expect(windowed.wac![windowed.wac!.length - 1].value).toBe(62.5);
		});

		it("carries the average into the window but never re-stamps a receipt", async () => {
			mockDb.stock_movement.findMany.mockResolvedValue([
				receipt("2026-02-01T00:00:00.000Z", 10, 40),
				receipt("2026-06-01T00:00:00.000Z", 10, 60),
			]);

			const from = "2026-05-01T00:00:00.000Z";
			const result = await getItemPriceHistory(ITEM, ORG, { created_after: from });

			// The average enters the window holding 40 (re-stamped at the start) so
			// the line has a value from the left edge.
			expect(result.wac![0]).toEqual({ at: new Date(from).toISOString(), value: 40 });
			expect(result.wac![1].value).toBe(50);
			// The February purchase itself is NOT dragged forward — re-stamping a
			// receipt marker would draw a purchase that never happened that day.
			expect(result.receipts!.map((r) => r.at)).toEqual(["2026-06-01T00:00:00.000Z"]);
		});

		it("counts window receipts for coverage and all priced receipts as the basis", async () => {
			mockDb.stock_movement.findMany.mockResolvedValue([
				receipt("2026-02-01T00:00:00.000Z", 10, 40),
				receipt("2026-06-01T00:00:00.000Z", 10, 60),
				receipt("2026-06-15T00:00:00.000Z", 5, null),
			]);

			const result = await getItemPriceHistory(ITEM, ORG, {
				created_after: "2026-05-01T00:00:00.000Z",
			});

			expect(result.costCoverage).toEqual({
				receipts: 2,
				withCost: 1,
				wacBasisReceipts: 2,
			});
		});
	});
});
