import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../db.js", () => {
	const $extends = vi.fn();
	const mockDb = { $extends };
	$extends.mockReturnValue(mockDb);
	return { db: mockDb };
});

vi.mock("../../lib/context.js", () => ({
	getScopedDb: vi.fn(),
	getUserContext: vi.fn(),
}));

vi.mock("../../services/logger.js", () => ({
	logActivity: vi.fn().mockResolvedValue(undefined),
	buildChanges: vi.fn().mockReturnValue({}),
}));

vi.mock("../../services/appLogger.js", () => ({
	log: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../services/stockMovements.js", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../../services/stockMovements.js")>();
	return {
		...actual,
		recordMovements: vi.fn().mockResolvedValue({ lowStockItemIds: [], movementIds: [] }),
		lockInventoryRows: vi.fn().mockResolvedValue(undefined),
	};
});

vi.mock("../../services/lowStockAlerts.js", () => ({
	fireLowStockAlerts: vi.fn().mockResolvedValue(undefined),
	sendLowStockAlert: vi.fn().mockResolvedValue(undefined),
}));

import { applyFill, addVehicleStockItem, updateVehicleStockItem, getFillPlan } from "../vehiclesController.js";
import type { ReadinessResult } from "../vehiclesController.js";
import { getScopedDb } from "../../lib/context.js";
import { recordMovements, lockInventoryRows } from "../../services/stockMovements.js";

const mockGetScopedDb = vi.mocked(getScopedDb);
const mockRecordMovements = vi.mocked(recordMovements);
const mockLockInventoryRows = vi.mocked(lockInventoryRows);

function movementsFromLastCall() {
	const call = mockRecordMovements.mock.calls.at(-1);
	return call ? call[3] : undefined;
}

// ── fillToStandard ────────────────────────────────────────────────────────────

function makeFillSdb(stockItems: unknown[], warehouseItems: unknown[] = []) {
	const tx = {
		vehicle_stock_item: { findMany: vi.fn().mockResolvedValue(stockItems) },
		inventory_item: { findMany: vi.fn().mockResolvedValue(warehouseItems) },
		// buildTrackingInputs (capped mode) reads real non-recalled lot sums for
		// batch-tracked lines instead of trusting the inventory_item.quantity
		// cache (phase 0 cache-drift fix) — sized generously so the batch-tracked
		// tests below (all using inventory_item_id "dddddddd-...") aren't clamped
		// by this stub. Literal used (not the describe-scoped INV_UUID const,
		// which this module-scoped helper can't see) but they're the same value.
		stock_batch: {
			findMany: vi
				.fn()
				.mockResolvedValue([
					{ inventory_item_id: "dddddddd-dddd-4ddd-addd-dddddddddddd", qty_in_warehouse: 999 },
				]),
		},
		// Phase 2b — response-detail resolution: serial_unit/stock_batch code
		// lookups for explicit picks, stock_movement for the FIFO-auto-allocate
		// lot-code join. Empty by default; individual tests override where the
		// assertion cares about the resolved codes.
		serial_unit: {
			findMany: vi.fn().mockResolvedValue([]),
		},
		stock_movement: {
			findMany: vi.fn().mockResolvedValue([]),
		},
	};
	const sdb = {
		vehicle: { findFirst: vi.fn().mockResolvedValue({ id: "vehicle-1" }) },
		$transaction: vi.fn().mockImplementation(
			async (fn: (tx: typeof tx) => unknown) => fn(tx),
		),
		_tx: tx,
	};
	mockGetScopedDb.mockReturnValue(sdb as unknown as ReturnType<typeof getScopedDb>);
	return sdb;
}

describe("applyFill", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRecordMovements.mockResolvedValue({ lowStockItemIds: [], movementIds: [] });
	});

	it("caps each line at warehouse availability and records warehouse → vehicle restock", async () => {
		// warehouse: invA has 2 available; request 5 → moved 2, shortfall 3
		makeFillSdb(
			[{ id: "s1", qty_on_hand: 2, qty_standard: 10, inventory_item_id: "dddddddd-dddd-4ddd-addd-dddddddddddd" }],
			[{ id: "dddddddd-dddd-4ddd-addd-dddddddddddd", quantity: 2 }],
		);
		const result = await applyFill(
			"vehicle-1",
			{ lines: [{ inventory_item_id: "dddddddd-dddd-4ddd-addd-dddddddddddd", qty: 5 }] },
			"org-1",
			{ dispatcherId: "d-1" },
		);
		expect(mockLockInventoryRows).toHaveBeenCalledWith(expect.anything(), ["dddddddd-dddd-4ddd-addd-dddddddddddd"]);
		expect(result.err).toBeUndefined();
		expect(movementsFromLastCall()).toEqual([
			expect.objectContaining({
				inventory_item_id: "dddddddd-dddd-4ddd-addd-dddddddddddd",
				qty: 2,
				from_location_type: "warehouse",
				to_location_type: "vehicle",
				to_vehicle_id: "vehicle-1",
				reason: "restock",
			}),
		]);
		expect(result.lines).toEqual([
			expect.objectContaining({
				inventory_item_id: "dddddddd-dddd-4ddd-addd-dddddddddddd",
				qty_moved: 2,
				shortfall: 3,
			}),
		]);
	});

	it("rejects fractional quantities (Zod validation)", async () => {
		makeFillSdb([], []);
		const result = await applyFill("vehicle-1", { lines: [{ inventory_item_id: "dddddddd-dddd-4ddd-addd-dddddddddddd", qty: 1.5 }] }, "org-1", {});
		expect(result.err).toMatch(/Validation failed/);
	});

	it("returns Vehicle not found", async () => {
		const sdb = makeFillSdb([], []);
		sdb.vehicle.findFirst.mockResolvedValue(null);
		const result = await applyFill("missing", { lines: [{ inventory_item_id: "dddddddd-dddd-4ddd-addd-dddddddddddd", qty: 1 }] }, "org-1", {});
		expect(result.err).toBe("Vehicle not found");
	});

	// ── Serial/batch tracking pass-through (B-T4) ───────────────────────────────

	const INV_UUID = "dddddddd-dddd-4ddd-addd-dddddddddddd";

	it("serialized item filled with NO serial_unit_ids succeeds (allowUntracked gap, not a throw)", async () => {
		makeFillSdb(
			[{ id: "s1", qty_on_hand: 0, qty_standard: 5, inventory_item_id: INV_UUID }],
			[{ id: INV_UUID, quantity: 5, is_serialized: true, is_batch_tracked: false }],
		);
		const result = await applyFill(
			"vehicle-1",
			{ lines: [{ inventory_item_id: INV_UUID, qty: 2 }] },
			"org-1",
			{ dispatcherId: "d-1" },
		);
		expect(result.err).toBeUndefined();
		expect(mockRecordMovements.mock.calls[0][4]).toEqual({ allowUntracked: true });
		const movements = movementsFromLastCall();
		expect(movements).toHaveLength(1);
		expect(movements![0].serial).toBeUndefined();
	});

	it("serialized item filled WITH serial_unit_ids carries serial: { unit_ids }", async () => {
		makeFillSdb(
			[{ id: "s1", qty_on_hand: 0, qty_standard: 5, inventory_item_id: INV_UUID }],
			[{ id: INV_UUID, quantity: 5, is_serialized: true, is_batch_tracked: false }],
		);
		const serialIds = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];
		const result = await applyFill(
			"vehicle-1",
			{ lines: [{ inventory_item_id: INV_UUID, qty: 2, serial_unit_ids: serialIds }] },
			"org-1",
			{ dispatcherId: "d-1" },
		);
		expect(result.err).toBeUndefined();
		const movements = movementsFromLastCall();
		expect(movements![0].serial).toEqual({ unit_ids: serialIds });
	});

	// ── Cache-drift shortfall (audit 2026-07-14, phase 0) ───────────────────────
	//
	// `moved = Math.min(line.qty, available)` (vehiclesController.ts:1236) clamps
	// against inventory_item.quantity — a cache. For a serialized item the tracking
	// tables (serial_unit rows) are the truth, not the cache. If 10 units are
	// scanned as in_warehouse but the cache says 6, the clamp invents a shortfall
	// that isn't real: it trims 4 units that are physically going on the truck,
	// moves stock without a ledger row for them, and hides the cache drift instead
	// of surfacing it. Availability for a serialized line must be the scanned
	// count, not the cache value.
	it("does not clamp a serialized line to cached quantity when scanned serials exceed it (cache drift)", async () => {
		makeFillSdb(
			[{ id: "s1", qty_on_hand: 0, qty_standard: 10, inventory_item_id: INV_UUID }],
			// Cache says 6 available; 10 units were actually scanned as in_warehouse.
			[{ id: INV_UUID, quantity: 6, is_serialized: true, is_batch_tracked: false }],
		);
		const serialIds = Array.from(
			{ length: 10 },
			(_, i) => `${i}${i}${i}${i}${i}${i}${i}${i}-${i}${i}${i}${i}-4${i}${i}${i}-8${i}${i}${i}-${i}${i}${i}${i}${i}${i}${i}${i}${i}${i}${i}${i}`,
		);

		const result = await applyFill(
			"vehicle-1",
			{ lines: [{ inventory_item_id: INV_UUID, qty: 10, serial_unit_ids: serialIds }] },
			"org-1",
			{ dispatcherId: "d-1" },
		);

		expect(result.err).toBeUndefined();
		const movements = movementsFromLastCall();
		expect(movements![0].qty).toBe(10);
		expect(movements![0].serial).toEqual({ unit_ids: serialIds });
		expect(result.lines).toEqual([
			expect.objectContaining({ inventory_item_id: INV_UUID, qty_moved: 10, shortfall: 0 }),
		]);
	});

	it("batch-tracked item filled with batch_picks passes them through as batch_allocations", async () => {
		makeFillSdb(
			[{ id: "s1", qty_on_hand: 0, qty_standard: 5, inventory_item_id: INV_UUID }],
			[{ id: INV_UUID, quantity: 5, is_serialized: false, is_batch_tracked: true }],
		);
		const batchPicks = [{ batch_id: "33333333-3333-4333-8333-333333333333", qty: 2 }];
		const result = await applyFill(
			"vehicle-1",
			{ lines: [{ inventory_item_id: INV_UUID, qty: 2, batch_picks: batchPicks }] },
			"org-1",
			{ dispatcherId: "d-1" },
		);
		expect(result.err).toBeUndefined();
		const movements = movementsFromLastCall();
		expect(movements![0].batch_allocations).toEqual(batchPicks);
	});

	it("batch-tracked item filled with no batch_picks still succeeds (FIFO/gap path)", async () => {
		makeFillSdb(
			[{ id: "s1", qty_on_hand: 0, qty_standard: 5, inventory_item_id: INV_UUID }],
			[{ id: INV_UUID, quantity: 5, is_serialized: false, is_batch_tracked: true }],
		);
		const result = await applyFill(
			"vehicle-1",
			{ lines: [{ inventory_item_id: INV_UUID, qty: 2 }] },
			"org-1",
			{ dispatcherId: "d-1" },
		);
		expect(result.err).toBeUndefined();
		const movements = movementsFromLastCall();
		expect(movements![0].batch_allocations).toBeUndefined();
	});
});

// ── addVehicleStockItem / updateVehicleStockItem (ledgered manual edits) ──────

const INV_UUID = "dddddddd-dddd-4ddd-addd-dddddddddddd";

function makeStockItemRow(overrides: Record<string, unknown> = {}) {
	return {
		id: "s1",
		vehicle_id: "vehicle-1",
		inventory_item_id: INV_UUID,
		qty_on_hand: 0,
		qty_min: 0,
		qty_standard: null,
		created_at: new Date("2026-01-01T00:00:00.000Z"),
		updated_at: new Date("2026-01-01T00:00:00.000Z"),
		inventory_item: {
			id: INV_UUID,
			organization_id: "org-1",
			name: "Test Part",
			description: "",
			location: "",
			quantity: 0,
			unit_price: null,
			cost: null,
			sku: null,
			barcode: null,
			is_active: true,
			low_stock_threshold: null,
			provisional: false,
			created_by_tech_id: null,
			approved_at: null,
			approved_by_id: null,
			image_keys: [],
			alt_ids: [],
			image_urls: [],
			alert_emails_enabled: false,
			alert_email: null,
			created_at: new Date("2026-01-01T00:00:00.000Z"),
			updated_at: new Date("2026-01-01T00:00:00.000Z"),
			category: null,
			unit: "each",
		},
		...overrides,
	};
}

function makeManualSdb(existingStockItem: unknown = null) {
	const tx = {
		vehicle_stock_item: {
			create: vi.fn().mockResolvedValue({ id: "s1" }),
			update: vi.fn().mockResolvedValue(undefined),
			findUniqueOrThrow: vi.fn().mockResolvedValue(makeStockItemRow()),
		},
	};
	const sdb = {
		vehicle: { findFirst: vi.fn().mockResolvedValue({ id: "vehicle-1" }) },
		inventory_item: { findFirst: vi.fn().mockResolvedValue({ id: INV_UUID }) },
		vehicle_stock_item: { findFirst: vi.fn().mockResolvedValue(existingStockItem) },
		$transaction: vi.fn().mockImplementation(
			async (fn: (tx: typeof tx) => unknown) => fn(tx),
		),
		_tx: tx,
	};
	mockGetScopedDb.mockReturnValue(sdb as unknown as ReturnType<typeof getScopedDb>);
	return sdb;
}

describe("addVehicleStockItem", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRecordMovements.mockResolvedValue({ lowStockItemIds: [], movementIds: [] });
	});

	it("creates with qty 0 and ledgers initial quantity as an audit correction", async () => {
		const sdb = makeManualSdb(null);
		const result = await addVehicleStockItem(
			"vehicle-1",
			{ inventory_item_id: INV_UUID, qty_on_hand: 4, qty_min: 1 },
			"org-1",
			{ dispatcherId: "d-1" },
		);
		expect(result.err).toBe("");
		expect(sdb._tx.vehicle_stock_item.create.mock.calls[0][0].data.qty_on_hand).toBe(0);
		expect(movementsFromLastCall()).toEqual([
			{
				inventory_item_id: INV_UUID,
				qty: 4,
				from_location_type: "adjustment",
				to_location_type: "vehicle",
				to_vehicle_id: "vehicle-1",
				reason: "audit_correction",
				note: "Initial quantity on stock item add",
			},
		]);
	});

	it("emits no movement when initial qty is 0", async () => {
		makeManualSdb(null);
		await addVehicleStockItem(
			"vehicle-1",
			{ inventory_item_id: INV_UUID, qty_on_hand: 0, qty_min: 1 },
			"org-1",
			{ dispatcherId: "d-1" },
		);
		expect(mockRecordMovements).not.toHaveBeenCalled();
	});
});

describe("updateVehicleStockItem", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRecordMovements.mockResolvedValue({ lowStockItemIds: [], movementIds: [] });
	});

	it("ledgers a positive qty_on_hand edit as adjustment→vehicle audit_correction", async () => {
		makeManualSdb({ id: "s1", vehicle_id: "vehicle-1", inventory_item_id: INV_UUID, qty_on_hand: 2 });
		const result = await updateVehicleStockItem("vehicle-1", "s1", { qty_on_hand: 6 }, "org-1");
		expect(result.err).toBe("");
		expect(movementsFromLastCall()).toEqual([
			{
				inventory_item_id: INV_UUID,
				qty: 4,
				from_location_type: "adjustment",
				from_vehicle_id: undefined,
				to_location_type: "vehicle",
				to_vehicle_id: "vehicle-1",
				reason: "audit_correction",
				note: "Manual stock edit",
			},
		]);
	});

	it("ledgers a negative qty_on_hand edit as vehicle→adjustment audit_correction", async () => {
		makeManualSdb({ id: "s1", vehicle_id: "vehicle-1", inventory_item_id: INV_UUID, qty_on_hand: 5 });
		await updateVehicleStockItem("vehicle-1", "s1", { qty_on_hand: 1 }, "org-1");
		expect(movementsFromLastCall()).toEqual([
			{
				inventory_item_id: INV_UUID,
				qty: 4,
				from_location_type: "vehicle",
				from_vehicle_id: "vehicle-1",
				to_location_type: "adjustment",
				to_vehicle_id: undefined,
				reason: "audit_correction",
				note: "Manual stock edit",
			},
		]);
	});

	it("emits no movement for metadata-only updates (qty_min / qty_standard)", async () => {
		const sdb = makeManualSdb({ id: "s1", vehicle_id: "vehicle-1", inventory_item_id: INV_UUID, qty_on_hand: 5 });
		await updateVehicleStockItem("vehicle-1", "s1", { qty_min: 3, qty_standard: 8 }, "org-1");
		expect(mockRecordMovements).not.toHaveBeenCalled();
		expect(sdb._tx.vehicle_stock_item.update.mock.calls[0][0].data).toEqual({
			qty_min: 3,
			qty_standard: 8,
		});
	});

	it("emits no movement when qty_on_hand is unchanged", async () => {
		makeManualSdb({ id: "s1", vehicle_id: "vehicle-1", inventory_item_id: INV_UUID, qty_on_hand: 5 });
		await updateVehicleStockItem("vehicle-1", "s1", { qty_on_hand: 5 }, "org-1");
		expect(mockRecordMovements).not.toHaveBeenCalled();
	});
});

// ── getFillPlan ───────────────────────────────────────────────────────────────

function makeFillPlanSdb(
	stockItems: unknown[],
	warehouseItems: unknown[] = [],
) {
	const sdb = {
		vehicle: { findFirst: vi.fn().mockResolvedValue({ id: "vehicle-1" }) },
		vehicle_stock_item: { findMany: vi.fn().mockResolvedValue(stockItems) },
		inventory_item: { findMany: vi.fn().mockResolvedValue(warehouseItems) },
	};
	mockGetScopedDb.mockReturnValue(sdb as unknown as ReturnType<typeof getScopedDb>);
	return sdb;
}

describe("getFillPlan", () => {
	// Default readiness mock: no visit demand (no gaps)
	const noGapsReadiness = vi.fn().mockResolvedValue({
		err: "",
		item: { state: "auto_ready", date: "2026-06-15", gaps: [] } as ReadinessResult,
	});

	beforeEach(() => {
		vi.clearAllMocks();
		noGapsReadiness.mockResolvedValue({
			err: "",
			item: { state: "auto_ready", date: "2026-06-15", gaps: [] } as ReadinessResult,
		});
	});

	it("standard bucket: items below qty_standard", async () => {
		makeFillPlanSdb([
			{
				id: "s1",
				vehicle_id: "vehicle-1",
				inventory_item_id: "invA",
				qty_on_hand: 1,
				qty_standard: 4,
				inventory_item: { id: "invA", name: "Filter A", unit: "each", quantity: 12 },
			},
		]);

		const result = await getFillPlan("vehicle-1", "org-1", noGapsReadiness as never);

		expect(result.err).toBeUndefined();
		expect(result.plan?.standard).toEqual([
			{
				inventory_item_id: "invA",
				name: "Filter A",
				unit: "each",
				on_hand: 1,
				target: 4,
				suggested_qty: 3,
				warehouse_available: 12,
			},
		]);
		expect(result.plan?.visits).toEqual([]);
	});

	it("visits bucket: demand beyond standard top-up", async () => {
		// itemB on_hand 0, qty_standard 2, warehouse 3; visit_need 5
		// after_standard = 0 + 2 = 2; visit_extra = 5 - 2 = 3
		const withGapsReadiness = vi.fn().mockResolvedValue({
			err: "",
			item: {
				state: "needs_action",
				date: "2026-06-15",
				gaps: [
					{
						inventory_item_id: "invB",
						name: "Capacitor B",
						qty_needed: 5,
						qty_on_hand: 0,
						gap: 5,
						visit_ids: ["v1"],
					},
				],
			} as ReadinessResult,
		});

		makeFillPlanSdb([
			{
				id: "s2",
				vehicle_id: "vehicle-1",
				inventory_item_id: "invB",
				qty_on_hand: 0,
				qty_standard: 2,
				inventory_item: { id: "invB", name: "Capacitor B", unit: "each", quantity: 3 },
			},
		]);

		const result = await getFillPlan("vehicle-1", "org-1", withGapsReadiness as never);

		expect(result.err).toBeUndefined();
		expect(result.plan?.standard).toEqual([
			expect.objectContaining({
				inventory_item_id: "invB",
				suggested_qty: 2,
			}),
		]);
		expect(result.plan?.visits).toEqual([
			expect.objectContaining({
				inventory_item_id: "invB",
				target: 5,
				suggested_qty: 3,
			}),
		]);
	});

	it("returns Vehicle not found for a missing vehicle", async () => {
		const sdb = makeFillPlanSdb([]);
		sdb.vehicle.findFirst.mockResolvedValue(null);

		const result = await getFillPlan("vehicle-1", "org-1", noGapsReadiness as never);

		expect(result.err).toBe("Vehicle not found");
		expect(result.plan).toBeUndefined();
	});

	it("returns error when readiness check fails", async () => {
		makeFillPlanSdb([]);
		const errReadiness = vi.fn().mockResolvedValue({ err: "Readiness failed" });
		const result = await getFillPlan("vehicle-1", "org-1", errReadiness as never);
		expect(result.err).toBe("Readiness failed");
		expect(result.plan).toBeUndefined();
	});
});
