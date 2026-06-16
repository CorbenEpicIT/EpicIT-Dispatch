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
		recordMovements: vi.fn().mockResolvedValue({ lowStockItemIds: [] }),
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
		mockRecordMovements.mockResolvedValue({ lowStockItemIds: [] });
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
});

// ── addVehicleStockItem / updateVehicleStockItem (ledgered manual edits) ──────

const INV_UUID = "dddddddd-dddd-4ddd-addd-dddddddddddd";

function makeManualSdb(existingStockItem: unknown = null) {
	const tx = {
		vehicle_stock_item: {
			create: vi.fn().mockResolvedValue({ id: "s1" }),
			update: vi.fn().mockResolvedValue(undefined),
			findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "s1", inventory_item: {} }),
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
		mockRecordMovements.mockResolvedValue({ lowStockItemIds: [] });
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
		mockRecordMovements.mockResolvedValue({ lowStockItemIds: [] });
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
