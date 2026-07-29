import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock external dependencies before importing the controller ────────────────

// db.js must be mocked because getScopedDb calls db.$extends internally.
// The mock is also what inventoryController tests use; keep it consistent.
vi.mock("../../db.js", () => {
	const $extends = vi.fn();
	const mockDb = {
		$extends,
	};
	// By default $extends returns a plain object; tests will override via getScopedDb mock.
	$extends.mockReturnValue(mockDb);
	return { db: mockDb };
});

// Mock getScopedDb so we control what the controller receives as `sdb`.
vi.mock("../../lib/context.js", () => ({
	getScopedDb: vi.fn(),
	getUserContext: vi.fn(),
}));

// Mock the activity logger
vi.mock("../../services/logger.js", () => ({
	logActivity: vi.fn().mockResolvedValue(undefined),
	buildChanges: vi.fn().mockReturnValue({}),
}));

// Mock the app-level logger so log.error doesn't blow up
vi.mock("../../services/appLogger.js", () => ({
	log: {
		error: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		debug: vi.fn(),
	},
}));

// Ledger service — controllers are tested on the movement shapes they emit;
// the service itself is covered by stockMovements.test.ts
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

// Imports must come AFTER vi.mock() calls
import {
	completeRestock,
	getRestockToday,
	createRestockRequest,
	createRestockRequestsBulk,
	acknowledgeRestockRequest,
	dismissRestockRequest,
} from "../vehiclesController.js";
import { getScopedDb } from "../../lib/context.js";
import { db } from "../../db.js";
import { recordMovements, lockInventoryRows } from "../../services/stockMovements.js";
import { logActivity } from "../../services/logger.js";

const mockGetScopedDb = vi.mocked(getScopedDb);
const mockRecordMovements = vi.mocked(recordMovements);
const mockLockInventoryRows = vi.mocked(lockInventoryRows);
const mockLogActivity = vi.mocked(logActivity);

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeVehicle(overrides: Record<string, unknown> = {}) {
	return {
		id: "vehicle-1",
		name: "Truck 1",
		organization_id: "org-1",
		status: "active",
		...overrides,
	};
}

function makeStockItem(overrides: Record<string, unknown> = {}) {
	return {
		id: "stock-1",
		vehicle_id: "vehicle-1",
		inventory_item_id: "inv-1",
		qty_on_hand: 5,
		qty_min: 0,
		qty_standard: null,
		...overrides,
	};
}

function makeRestockRecord(overrides: Record<string, unknown> = {}) {
	return {
		id: "restock-1",
		vehicle_id: "vehicle-1",
		organization_id: "org-1",
		completed_at: new Date(),
		completed_by_id: "dispatcher-1",
		completed_by_tech_id: null,
		notes: null,
		restock_lines: [],
		completed_by: { id: "dispatcher-1", name: "Alice" },
		completed_by_tech: null,
		...overrides,
	};
}

function buildDefaultSdb() {
	const tx = {
		vehicle_stock_item: {
			findMany: vi.fn().mockResolvedValue([]),
		},
		inventory_item: {
			findMany: vi.fn().mockResolvedValue([]),
		},
		// buildTrackingInputs (capped mode) reads real non-recalled lot sums for
		// batch-tracked lines instead of trusting the inventory_item.quantity
		// cache (phase 0 cache-drift fix). Sized generously so the batch-tracked
		// tests below ("inv-batch") aren't clamped by this stub.
		stock_batch: {
			findMany: vi.fn().mockResolvedValue([{ inventory_item_id: "inv-batch", qty_in_warehouse: 999 }]),
		},
		// Phase 2b — response-detail resolution: serial_unit/stock_batch code lookups
		// for explicit picks, stock_movement for the FIFO-auto-allocate lot-code
		// join. Empty by default; individual tests override via mockResolvedValue
		// where the assertion cares about the resolved codes.
		serial_unit: {
			findMany: vi.fn().mockResolvedValue([]),
		},
		stock_movement: {
			findMany: vi.fn().mockResolvedValue([]),
		},
		vehicle_restock_record: {
			create: vi.fn().mockResolvedValue(makeRestockRecord()),
			findUniqueOrThrow: vi.fn().mockResolvedValue(makeRestockRecord()),
		},
		vehicle_restock_line: {
			createMany: vi.fn().mockResolvedValue({ count: 0 }),
		},
	};

	const sdb = {
		vehicle: {
			findFirst: vi.fn().mockResolvedValue(makeVehicle()),
		},
		organization: {
			findFirst: vi.fn().mockResolvedValue({ timezone: "UTC", name: "Test Org" }),
		},
		// G6 shortfall alert reads outside the transaction (post-commit) — only
		// exercised by tests that override _tx.vehicle_restock_record.findUniqueOrThrow
		// to return a non-empty restock_lines with a real shortfall.
		vehicle_stock_item: {
			findMany: vi.fn().mockResolvedValue([]),
		},
		vehicle_restock_record: {
			findFirst: vi.fn().mockResolvedValue(null),
		},
		vehicle_readiness: {
			upsert: vi.fn().mockResolvedValue({}),
		},
		$transaction: vi.fn().mockImplementation(
			async (fn: (tx: typeof tx) => unknown) => fn(tx),
		),
		_tx: tx, // expose for assertions
	};

	return sdb;
}

// ── Tests: completeRestock ────────────────────────────────────────────────────

describe("completeRestock", () => {
	let sdb: ReturnType<typeof buildDefaultSdb>;

	beforeEach(() => {
		vi.clearAllMocks();
		mockRecordMovements.mockResolvedValue({ lowStockItemIds: [], movementIds: [] });
		sdb = buildDefaultSdb();
		mockGetScopedDb.mockReturnValue(sdb as unknown as ReturnType<typeof getScopedDb>);
	});

	it('returns "Vehicle not found" when vehicle.findFirst returns null', async () => {
		sdb.vehicle.findFirst.mockResolvedValue(null);

		const result = await completeRestock(
			"vehicle-1",
			{ restock_lines: [] },
			"org-1",
			{ dispatcherId: "dispatcher-1" },
		);

		expect(result.err).toBe("Vehicle not found");
	});

	it('returns "Actor context required" when context is undefined', async () => {
		const result = await completeRestock("vehicle-1", { restock_lines: [] }, "org-1", undefined);

		expect(result.err).toBe("Actor context required");
	});

	it("accepts a technician actor and stamps completed_by_tech_id", async () => {
		const result = await completeRestock(
			"vehicle-1",
			{ restock_lines: [] },
			"org-1",
			{ techId: "tech-1" },
		);

		expect(result.err).toBeUndefined();
		const createData = sdb._tx.vehicle_restock_record.create.mock.calls[0][0].data;
		expect(createData.completed_by_id).toBeNull();
		expect(createData.completed_by_tech_id).toBe("tech-1");
	});

	it("stamps completed_by_id (not tech) for a dispatcher actor", async () => {
		await completeRestock("vehicle-1", { restock_lines: [] }, "org-1", {
			dispatcherId: "dispatcher-1",
		});

		const createData = sdb._tx.vehicle_restock_record.create.mock.calls[0][0].data;
		expect(createData.completed_by_id).toBe("dispatcher-1");
		expect(createData.completed_by_tech_id).toBeNull();
	});

	it('returns "Validation failed: ..." for invalid input (restock_lines is not an array)', async () => {
		const result = await completeRestock(
			"vehicle-1",
			{ restock_lines: "not-an-array" },
			"org-1",
			{ dispatcherId: "dispatcher-1" },
		);

		expect(result.err).toMatch(/^Validation failed:/);
	});

	it('returns "Validation failed: ..." for duplicate stock_item_id entries', async () => {
		const result = await completeRestock(
			"vehicle-1",
			{
				restock_lines: [
					{ stock_item_id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d", qty_to_restock: 2 },
					{ stock_item_id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d", qty_to_restock: 1 },
				],
			},
			"org-1",
			{ dispatcherId: "dispatcher-1" },
		);

		expect(result.err).toMatch(/^Validation failed:/);
	});

	it("creates the restock record FIRST, locks rows, then emits restock movements", async () => {
		const stockItemId = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
		sdb._tx.vehicle_stock_item.findMany.mockResolvedValue([
			makeStockItem({ id: stockItemId }),
		]);
		sdb._tx.inventory_item.findMany.mockResolvedValue([{ id: "inv-1", quantity: 10 }]);

		const result = await completeRestock(
			"vehicle-1",
			{ restock_lines: [{ stock_item_id: stockItemId, qty_to_restock: 3 }] },
			"org-1",
			{ dispatcherId: "dispatcher-1" },
		);

		expect(result.err).toBeUndefined();
		expect(sdb._tx.vehicle_restock_record.create).toHaveBeenCalledOnce();
		expect(mockLockInventoryRows).toHaveBeenCalledWith(sdb._tx, ["inv-1"]);

		const [, orgId, actor, movements] = mockRecordMovements.mock.calls[0];
		expect(orgId).toBe("org-1");
		expect(actor).toEqual({ actor_type: "dispatcher", actor_id: "dispatcher-1" });
		expect(movements).toEqual([
			{
				inventory_item_id: "inv-1",
				qty: 3,
				from_location_type: "warehouse",
				to_location_type: "vehicle",
				to_vehicle_id: "vehicle-1",
				reason: "restock",
				restock_record_id: "restock-1",
			},
		]);
	});

	it("caps qty_restocked at available warehouse stock and records shortfall", async () => {
		const stockItemId = "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e";
		sdb._tx.vehicle_stock_item.findMany.mockResolvedValue([
			makeStockItem({ id: stockItemId, inventory_item_id: "inv-2" }),
		]);
		// Only 4 units available in warehouse, but 10 requested
		sdb._tx.inventory_item.findMany.mockResolvedValue([{ id: "inv-2", quantity: 4 }]);

		const result = await completeRestock(
			"vehicle-1",
			{ restock_lines: [{ stock_item_id: stockItemId, qty_to_restock: 10 }] },
			"org-1",
			{ dispatcherId: "dispatcher-1" },
		);

		expect(result.err).toBeUndefined();
		const lines = sdb._tx.vehicle_restock_line.createMany.mock.calls[0][0].data;
		expect(lines[0].qty_restocked).toBe(4);
		expect(lines[0].qty_shortfall).toBe(6);

		const movements = mockRecordMovements.mock.calls[0][3];
		expect(movements[0].qty).toBe(4);
	});

	it("passes notes through to the restock record", async () => {
		await completeRestock(
			"vehicle-1",
			{ restock_lines: [], notes: "Truck 1 short on filters — reorder Monday" },
			"org-1",
			{ dispatcherId: "dispatcher-1" },
		);

		const createData = sdb._tx.vehicle_restock_record.create.mock.calls[0][0].data;
		expect(createData.notes).toBe("Truck 1 short on filters — reorder Monday");
	});

	it("emits no movements when warehouse has zero available", async () => {
		const stockItemId = "c3d4e5f6-a7b8-4c9d-8e1f-2a3b4c5d6e7f";
		sdb._tx.vehicle_stock_item.findMany.mockResolvedValue([
			makeStockItem({ id: stockItemId, inventory_item_id: "inv-3" }),
		]);
		sdb._tx.inventory_item.findMany.mockResolvedValue([{ id: "inv-3", quantity: 0 }]);

		const result = await completeRestock(
			"vehicle-1",
			{ restock_lines: [{ stock_item_id: stockItemId, qty_to_restock: 5 }] },
			"org-1",
			{ dispatcherId: "dispatcher-1" },
		);

		expect(result.err).toBeUndefined();
		const movements = mockRecordMovements.mock.calls[0][3];
		expect(movements).toEqual([]);
		// Shortfall line is still recorded on the document
		const lines = sdb._tx.vehicle_restock_line.createMany.mock.calls[0][0].data;
		expect(lines[0].qty_restocked).toBe(0);
		expect(lines[0].qty_shortfall).toBe(5);
	});

	// ── Serial/batch tracking pass-through (B-T4) ───────────────────────────────

	it("serialized item restocked with NO serial_unit_ids succeeds (allowUntracked gap, not a throw)", async () => {
		const stockItemId = "d4e5f6a7-b8c9-4d0e-8f1a-2b3c4d5e6f7a";
		sdb._tx.vehicle_stock_item.findMany.mockResolvedValue([
			makeStockItem({ id: stockItemId, inventory_item_id: "inv-serial" }),
		]);
		sdb._tx.inventory_item.findMany.mockResolvedValue([
			{ id: "inv-serial", quantity: 10, is_serialized: true, is_batch_tracked: false },
		]);

		const result = await completeRestock(
			"vehicle-1",
			{ restock_lines: [{ stock_item_id: stockItemId, qty_to_restock: 2 }] },
			"org-1",
			{ dispatcherId: "dispatcher-1" },
		);

		expect(result.err).toBeUndefined();
		expect(mockRecordMovements.mock.calls[0][4]).toEqual({ allowUntracked: true });
		const movements = mockRecordMovements.mock.calls[0][3];
		expect(movements).toHaveLength(1);
		expect(movements[0].serial).toBeUndefined();
	});

	it("serialized item restocked WITH correct serial_unit_ids carries serial: { unit_ids }", async () => {
		const stockItemId = "e5f6a7b8-c9d0-4e1f-8a2b-3c4d5e6f7a8b";
		sdb._tx.vehicle_stock_item.findMany.mockResolvedValue([
			makeStockItem({ id: stockItemId, inventory_item_id: "inv-serial" }),
		]);
		sdb._tx.inventory_item.findMany.mockResolvedValue([
			{ id: "inv-serial", quantity: 10, is_serialized: true, is_batch_tracked: false },
		]);
		const serialIds = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];

		const result = await completeRestock(
			"vehicle-1",
			{ restock_lines: [{ stock_item_id: stockItemId, qty_to_restock: 2, serial_unit_ids: serialIds }] },
			"org-1",
			{ dispatcherId: "dispatcher-1" },
		);

		expect(result.err).toBeUndefined();
		const movements = mockRecordMovements.mock.calls[0][3];
		expect(movements[0].serial).toEqual({ unit_ids: serialIds });
	});

	// ── Cache-drift shortfall (audit 2026-07-14, phase 0) ───────────────────────
	//
	// `actual = Math.min(line.qty_to_restock, available)` (vehiclesController.ts:1480)
	// clamps against inventory_item.quantity — a cache. For a serialized item the
	// tracking tables (serial_unit rows) are the truth, not the cache. If 10 units
	// are scanned as in_warehouse but the cache says 6, the clamp invents a
	// shortfall that isn't real: it trims 4 units that are physically going on the
	// truck, moves stock without a ledger row for them, and hides the cache drift
	// instead of surfacing it. Availability for a serialized line must be the
	// scanned count, not the cache value.
	it("does not clamp a serialized line to cached quantity when scanned serials exceed it (cache drift)", async () => {
		const stockItemId = "b8c9d0e1-f2a3-4b4c-8d5e-6f7a8b9c0d1f";
		sdb._tx.vehicle_stock_item.findMany.mockResolvedValue([
			makeStockItem({ id: stockItemId, inventory_item_id: "inv-serial-drift" }),
		]);
		// Cache says 6 available; 10 units were actually scanned as in_warehouse.
		sdb._tx.inventory_item.findMany.mockResolvedValue([
			{ id: "inv-serial-drift", quantity: 6, is_serialized: true, is_batch_tracked: false },
		]);
		const serialIds = Array.from(
			{ length: 10 },
			(_, i) => `${i}${i}${i}${i}${i}${i}${i}${i}-${i}${i}${i}${i}-4${i}${i}${i}-8${i}${i}${i}-${i}${i}${i}${i}${i}${i}${i}${i}${i}${i}${i}${i}`,
		);

		const result = await completeRestock(
			"vehicle-1",
			{
				restock_lines: [
					{ stock_item_id: stockItemId, qty_to_restock: 10, serial_unit_ids: serialIds },
				],
			},
			"org-1",
			{ dispatcherId: "dispatcher-1" },
		);

		expect(result.err).toBeUndefined();
		const movements = mockRecordMovements.mock.calls[0][3];
		expect(movements[0].qty).toBe(10);
		expect(movements[0].serial).toEqual({ unit_ids: serialIds });
		const lines = sdb._tx.vehicle_restock_line.createMany.mock.calls[0][0].data;
		expect(lines[0].qty_restocked).toBe(10);
		expect(lines[0].qty_shortfall).toBe(0);
	});

	it("batch-tracked item restocked with batch_picks passes them through as batch_allocations", async () => {
		const stockItemId = "f6a7b8c9-d0e1-4f2a-8b3c-4d5e6f7a8b9c";
		sdb._tx.vehicle_stock_item.findMany.mockResolvedValue([
			makeStockItem({ id: stockItemId, inventory_item_id: "inv-batch" }),
		]);
		sdb._tx.inventory_item.findMany.mockResolvedValue([
			{ id: "inv-batch", quantity: 10, is_serialized: false, is_batch_tracked: true },
		]);
		const batchPicks = [{ batch_id: "33333333-3333-4333-8333-333333333333", qty: 2 }];

		const result = await completeRestock(
			"vehicle-1",
			{ restock_lines: [{ stock_item_id: stockItemId, qty_to_restock: 2, batch_picks: batchPicks }] },
			"org-1",
			{ dispatcherId: "dispatcher-1" },
		);

		expect(result.err).toBeUndefined();
		const movements = mockRecordMovements.mock.calls[0][3];
		expect(movements[0].batch_allocations).toEqual(batchPicks);
	});

	it("batch-tracked item restocked with no batch_picks still succeeds (FIFO/gap path)", async () => {
		const stockItemId = "a7b8c9d0-e1f2-4a3b-8c4d-5e6f7a8b9c0d";
		sdb._tx.vehicle_stock_item.findMany.mockResolvedValue([
			makeStockItem({ id: stockItemId, inventory_item_id: "inv-batch" }),
		]);
		sdb._tx.inventory_item.findMany.mockResolvedValue([
			{ id: "inv-batch", quantity: 10, is_serialized: false, is_batch_tracked: true },
		]);

		const result = await completeRestock(
			"vehicle-1",
			{ restock_lines: [{ stock_item_id: stockItemId, qty_to_restock: 2 }] },
			"org-1",
			{ dispatcherId: "dispatcher-1" },
		);

		expect(result.err).toBeUndefined();
		const movements = mockRecordMovements.mock.calls[0][3];
		expect(movements[0].batch_allocations).toBeUndefined();
	});

	// ── Phase 2b: response detail + activity log ────────────────────────────────

	it("untracked shortfall reports reason_code ok with a human message, and logs it as needing attention", async () => {
		const stockItemId = "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e";
		sdb._tx.vehicle_stock_item.findMany.mockResolvedValue([
			makeStockItem({ id: stockItemId, inventory_item_id: "inv-2" }),
		]);
		sdb._tx.inventory_item.findMany.mockResolvedValue([{ id: "inv-2", quantity: 4 }]);
		sdb._tx.vehicle_restock_record.findUniqueOrThrow.mockResolvedValue(
			makeRestockRecord({
				restock_lines: [{ stock_item_id: stockItemId, qty_restocked: 4, qty_shortfall: 6 }],
			}),
		);

		const result = await completeRestock(
			"vehicle-1",
			{ restock_lines: [{ stock_item_id: stockItemId, qty_to_restock: 10 }] },
			"org-1",
			{ dispatcherId: "dispatcher-1" },
		);

		expect(result.err).toBeUndefined();
		expect(result.line_details).toEqual([
			{
				stock_item_id: stockItemId,
				reason_code: "ok",
				message: "Only 4 of 10 available in the warehouse.",
			},
		]);
		expect(mockLogActivity).toHaveBeenCalledWith(
			expect.objectContaining({
				changes: expect.objectContaining({
					lines_needing_attention: {
						old: null,
						new: [{ item: "inv-2", reason: "ok", message: "Only 4 of 10 available in the warehouse." }],
					},
				}),
			}),
		);
	});

	it("serialized item with no scan reports no_tracking_gap with its explanatory message", async () => {
		const stockItemId = "d4e5f6a7-b8c9-4d0e-8f1a-2b3c4d5e6f7a";
		sdb._tx.vehicle_stock_item.findMany.mockResolvedValue([
			makeStockItem({ id: stockItemId, inventory_item_id: "inv-serial" }),
		]);
		sdb._tx.inventory_item.findMany.mockResolvedValue([
			{ id: "inv-serial", quantity: 10, is_serialized: true, is_batch_tracked: false },
		]);
		sdb._tx.vehicle_restock_record.findUniqueOrThrow.mockResolvedValue(
			makeRestockRecord({
				restock_lines: [{ stock_item_id: stockItemId, qty_restocked: 2, qty_shortfall: 0 }],
			}),
		);

		const result = await completeRestock(
			"vehicle-1",
			{ restock_lines: [{ stock_item_id: stockItemId, qty_to_restock: 2 }] },
			"org-1",
			{ dispatcherId: "dispatcher-1" },
		);

		expect(result.err).toBeUndefined();
		expect(result.line_details).toEqual([
			{
				stock_item_id: stockItemId,
				reason_code: "no_tracking_gap",
				message: "No units scanned — recorded as a tracking gap; verify what actually went out.",
			},
		]);
	});

	it("cache-drift line resolves its scanned serial codes and flags cache_drift_detected", async () => {
		const stockItemId = "b8c9d0e1-f2a3-4b4c-8d5e-6f7a8b9c0d1f";
		sdb._tx.vehicle_stock_item.findMany.mockResolvedValue([
			makeStockItem({ id: stockItemId, inventory_item_id: "inv-serial-drift" }),
		]);
		sdb._tx.inventory_item.findMany.mockResolvedValue([
			{ id: "inv-serial-drift", quantity: 1, is_serialized: true, is_batch_tracked: false },
		]);
		const serialIds = [
			"11111111-1111-4111-8111-111111111111",
			"22222222-2222-4222-8222-222222222222",
		];
		sdb._tx.serial_unit.findMany.mockResolvedValue([
			{ id: serialIds[0], code: "SU-AAAAAAAA" },
			{ id: serialIds[1], code: "SU-BBBBBBBB" },
		]);
		sdb._tx.vehicle_restock_record.findUniqueOrThrow.mockResolvedValue(
			makeRestockRecord({
				restock_lines: [{ stock_item_id: stockItemId, qty_restocked: 2, qty_shortfall: 0 }],
			}),
		);

		const result = await completeRestock(
			"vehicle-1",
			{ restock_lines: [{ stock_item_id: stockItemId, qty_to_restock: 2, serial_unit_ids: serialIds }] },
			"org-1",
			{ dispatcherId: "dispatcher-1" },
		);

		expect(result.err).toBeUndefined();
		expect(result.line_details).toEqual([
			{
				stock_item_id: stockItemId,
				reason_code: "cache_drift_detected",
				message:
					"Scanned/lot quantity did not match the cached stock count — investigate a possible data drift.",
				serial_codes: ["SU-AAAAAAAA", "SU-BBBBBBBB"],
			},
		]);
	});

	it("batch-tracked explicit picks resolve lot codes via a single batched stock_batch lookup", async () => {
		const stockItemId = "f6a7b8c9-d0e1-4f2a-8b3c-4d5e6f7a8b9c";
		sdb._tx.vehicle_stock_item.findMany.mockResolvedValue([
			makeStockItem({ id: stockItemId, inventory_item_id: "inv-batch" }),
		]);
		sdb._tx.inventory_item.findMany.mockResolvedValue([
			{ id: "inv-batch", quantity: 10, is_serialized: false, is_batch_tracked: true },
		]);
		const batchId = "33333333-3333-4333-8333-333333333333";
		// stock_batch.findMany is also called by buildTrackingInputs (capped-mode
		// availability, selecting qty_in_warehouse) — branch on `select` so this
		// one mock serves both call shapes correctly.
		sdb._tx.stock_batch.findMany.mockImplementation(({ select }: { select?: Record<string, boolean> }) => {
			if (select?.code) return Promise.resolve([{ id: batchId, code: "LOT-CCCCCCCC" }]);
			// Matches inventory_item.quantity (10) below so the capped-availability
			// check doesn't also (correctly, but not what this test is about) flag
			// cache_drift_detected.
			return Promise.resolve([{ inventory_item_id: "inv-batch", qty_in_warehouse: 10 }]);
		});
		sdb._tx.vehicle_restock_record.findUniqueOrThrow.mockResolvedValue(
			makeRestockRecord({
				restock_lines: [{ stock_item_id: stockItemId, qty_restocked: 2, qty_shortfall: 0 }],
			}),
		);

		const result = await completeRestock(
			"vehicle-1",
			{
				restock_lines: [
					{ stock_item_id: stockItemId, qty_to_restock: 2, batch_picks: [{ batch_id: batchId, qty: 2 }] },
				],
			},
			"org-1",
			{ dispatcherId: "dispatcher-1" },
		);

		expect(result.err).toBeUndefined();
		expect(result.line_details).toEqual([
			{ stock_item_id: stockItemId, reason_code: "ok", lot_codes: ["LOT-CCCCCCCC"] },
		]);
	});

	it("FIFO auto-allocated batch line resolves lot codes via the movement rows just written", async () => {
		const stockItemId = "a7b8c9d0-e1f2-4a3b-8c4d-5e6f7a8b9c0d";
		const restockRecord = makeRestockRecord({ id: "restock-fifo" });
		sdb._tx.vehicle_restock_record.create.mockResolvedValue(restockRecord);
		sdb._tx.vehicle_stock_item.findMany.mockResolvedValue([
			makeStockItem({ id: stockItemId, inventory_item_id: "inv-batch" }),
		]);
		sdb._tx.inventory_item.findMany.mockResolvedValue([
			{ id: "inv-batch", quantity: 10, is_serialized: false, is_batch_tracked: true },
		]);
		// Matches inventory_item.quantity (10) — isolates this test to the
		// FIFO lot-code join, not an incidental cache_drift_detected reason.
		sdb._tx.stock_batch.findMany.mockResolvedValue([{ inventory_item_id: "inv-batch", qty_in_warehouse: 10 }]);
		sdb._tx.stock_movement.findMany.mockResolvedValue([
			{
				inventory_item_id: "inv-batch",
				movement_batches: [{ batch: { code: "LOT-FIFO001" } }, { batch: { code: "LOT-FIFO002" } }],
			},
		]);
		sdb._tx.vehicle_restock_record.findUniqueOrThrow.mockResolvedValue(
			makeRestockRecord({
				id: "restock-fifo",
				restock_lines: [{ stock_item_id: stockItemId, qty_restocked: 2, qty_shortfall: 0 }],
			}),
		);
		// FIFO lot codes now resolve off the exact movement ids recordMovements
		// returns (deterministic — no wall-clock created_at filter).
		mockRecordMovements.mockResolvedValueOnce({ lowStockItemIds: [], movementIds: ["mv-fifo-1"] });

		const result = await completeRestock(
			"vehicle-1",
			{ restock_lines: [{ stock_item_id: stockItemId, qty_to_restock: 2 }] },
			"org-1",
			{ dispatcherId: "dispatcher-1" },
		);

		expect(result.err).toBeUndefined();
		expect(result.line_details).toEqual([
			{ stock_item_id: stockItemId, reason_code: "ok", lot_codes: ["LOT-FIFO001", "LOT-FIFO002"] },
		]);
		expect(sdb._tx.stock_movement.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({ id: { in: ["mv-fifo-1"] }, inventory_item_id: { in: ["inv-batch"] } }),
			}),
		);
	});

	it("zero-qty line reports reason_code ok with no message and is excluded from lines_needing_attention", async () => {
		const stockItemId = "c3d4e5f6-a7b8-4c9d-8e1f-2a3b4c5d6e7f";
		sdb._tx.vehicle_stock_item.findMany.mockResolvedValue([
			makeStockItem({ id: stockItemId, inventory_item_id: "inv-3" }),
		]);
		sdb._tx.inventory_item.findMany.mockResolvedValue([{ id: "inv-3", quantity: 10 }]);
		sdb._tx.vehicle_restock_record.findUniqueOrThrow.mockResolvedValue(
			makeRestockRecord({
				restock_lines: [{ stock_item_id: stockItemId, qty_restocked: 0, qty_shortfall: 0 }],
			}),
		);

		const result = await completeRestock(
			"vehicle-1",
			{ restock_lines: [{ stock_item_id: stockItemId, qty_to_restock: 0 }] },
			"org-1",
			{ dispatcherId: "dispatcher-1" },
		);

		expect(result.err).toBeUndefined();
		expect(result.line_details).toEqual([{ stock_item_id: stockItemId, reason_code: "ok" }]);
		expect(mockLogActivity).toHaveBeenCalledWith(
			expect.objectContaining({
				changes: expect.not.objectContaining({ lines_needing_attention: expect.anything() }),
			}),
		);
	});

	it("multi-line restock: tracking lands on the correct line despite a zero-qty line being filtered out", async () => {
		const stockItem1 = "b8c9d0e1-f2a3-4b4c-8d5e-6f7a8b9c0d1e";
		const stockItem2 = "c9d0e1f2-a3b4-4c5d-8e6f-7a8b9c0d1e2f";
		const stockItem3 = "d0e1f2a3-b4c5-4d6e-8f7a-8b9c0d1e2f3a";
		sdb._tx.vehicle_stock_item.findMany.mockResolvedValue([
			makeStockItem({ id: stockItem1, inventory_item_id: "inv-1" }),
			makeStockItem({ id: stockItem2, inventory_item_id: "inv-2" }),
			makeStockItem({ id: stockItem3, inventory_item_id: "inv-3" }),
		]);
		sdb._tx.inventory_item.findMany.mockResolvedValue([
			{ id: "inv-1", quantity: 10, is_serialized: false, is_batch_tracked: false },
			{ id: "inv-2", quantity: 10, is_serialized: false, is_batch_tracked: false },
			{ id: "inv-3", quantity: 10, is_serialized: true, is_batch_tracked: false },
		]);
		const serialIds = ["44444444-4444-4444-8444-444444444444", "55555555-5555-4555-8555-555555555555"];

		const result = await completeRestock(
			"vehicle-1",
			{
				restock_lines: [
					{ stock_item_id: stockItem1, qty_to_restock: 3 },
					{ stock_item_id: stockItem2, qty_to_restock: 0 },
					{ stock_item_id: stockItem3, qty_to_restock: 2, serial_unit_ids: serialIds },
				],
			},
			"org-1",
			{ dispatcherId: "dispatcher-1" },
		);

		expect(result.err).toBeUndefined();
		const movements = mockRecordMovements.mock.calls[0][3];
		// Middle (zero-qty) line produces no movement — only 2 movements for 3 lines
		expect(movements).toHaveLength(2);
		expect(movements[0]).toMatchObject({ inventory_item_id: "inv-1", qty: 3 });
		expect(movements[0].serial).toBeUndefined();
		expect(movements[1]).toMatchObject({ inventory_item_id: "inv-3", qty: 2 });
		expect(movements[1].serial).toEqual({ unit_ids: serialIds });
	});
});

// ── Helpers: db mock ──────────────────────────────────────────────────────────

const mockDb = vi.mocked(db as unknown as {
	vehicle_stock_item: { findFirst: ReturnType<typeof vi.fn> };
	vehicle_restock_request: {
		findFirst: ReturnType<typeof vi.fn>;
		create: ReturnType<typeof vi.fn>;
		findMany: ReturnType<typeof vi.fn>;
		findUnique: ReturnType<typeof vi.fn>;
		updateMany: ReturnType<typeof vi.fn>;
	};
	technician: { findFirst: ReturnType<typeof vi.fn> };
	$transaction: ReturnType<typeof vi.fn>;
});

function setupDbMock(overrides: Record<string, unknown> = {}) {
	(db as unknown as Record<string, unknown>).vehicle_stock_item = {
		findFirst: vi.fn().mockResolvedValue({
			id: "stock-1",
			vehicle_id: "vehicle-1",
			inventory_item_id: "inv-1",
		}),
		...((overrides.vehicle_stock_item as object) ?? {}),
	};
	(db as unknown as Record<string, unknown>).vehicle_restock_request = {
		findFirst: vi.fn().mockResolvedValue(null),
		create: vi.fn().mockResolvedValue({
			id: "req-1",
			stock_item_id: "stock-1",
			technician_id: "tech-1",
			organization_id: "org-1",
			qty_requested: null,
			note: null,
			status: "pending",
		}),
		findMany: vi.fn().mockResolvedValue([]),
		findUnique: vi.fn().mockResolvedValue(null),
		updateMany: vi.fn().mockResolvedValue({ count: 1 }),
		...((overrides.vehicle_restock_request as object) ?? {}),
	};
	(db as unknown as Record<string, unknown>).technician = {
		findFirst: vi.fn().mockResolvedValue({ current_vehicle_id: "vehicle-1" }),
		...((overrides.technician as object) ?? {}),
	};
	(db as unknown as Record<string, unknown>).$transaction = vi.fn().mockImplementation(
		async (fn: (tx: unknown) => unknown) => {
			const tx = {
				vehicle_stock_item: {
					findMany: vi.fn().mockResolvedValue([{ id: "stock-1" }]),
				},
				vehicle_restock_request: {
					findMany: vi.fn().mockResolvedValue([]),
					createManyAndReturn: vi.fn().mockResolvedValue([{ id: "req-1" }]),
				},
			};
			return fn(tx);
		},
	);
}

// ── Tests: createRestockRequest ───────────────────────────────────────────────

describe("createRestockRequest", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		setupDbMock();
	});

	it('returns "Only technicians can perform this action" when context has no techId', async () => {
		const result = await createRestockRequest("vehicle-1", "stock-1", {}, "org-1", {
			dispatcherId: "dispatcher-1",
		});
		expect(result.err).toBe("Only technicians can perform this action");
	});

	it('returns "Technician is not assigned to this vehicle" when tech is on a different vehicle', async () => {
		(db as unknown as Record<string, unknown>).technician = {
			findFirst: vi.fn().mockResolvedValue({ current_vehicle_id: "vehicle-other" }),
		};
		const result = await createRestockRequest("vehicle-1", "stock-1", {}, "org-1", {
			techId: "tech-1",
		});
		expect(result.err).toBe("Technician is not assigned to this vehicle");
	});

	it('returns "Stock item not found" when stock item does not exist', async () => {
		(db as unknown as Record<string, unknown>).vehicle_stock_item = {
			findFirst: vi.fn().mockResolvedValue(null),
		};
		const result = await createRestockRequest("vehicle-1", "stock-1", {}, "org-1", {
			techId: "tech-1",
		});
		expect(result.err).toBe("Stock item not found");
	});

	it('returns "Restock already requested for this item" when a pending request exists', async () => {
		(db as unknown as Record<string, unknown>).vehicle_restock_request = {
			findFirst: vi.fn().mockResolvedValue({ id: "existing-req", status: "pending" }),
			create: vi.fn(),
		};
		const result = await createRestockRequest("vehicle-1", "stock-1", {}, "org-1", {
			techId: "tech-1",
		});
		expect(result.err).toBe("Restock already requested for this item");
	});

	it("creates request and returns it on happy path", async () => {
		const result = await createRestockRequest(
			"vehicle-1",
			"stock-1",
			{ qty_requested: 3, note: "need filters" },
			"org-1",
			{ techId: "tech-1" },
		);
		expect(result.err).toBeFalsy();
		expect(result.item).toBeDefined();
		expect(result.item!.status).toBe("pending");
	});

	it('returns "Validation failed" for negative qty_requested', async () => {
		const result = await createRestockRequest(
			"vehicle-1",
			"stock-1",
			{ qty_requested: -1 },
			"org-1",
			{ techId: "tech-1" },
		);
		expect(result.err).toMatch(/^Validation failed:/);
	});
});

// ── Tests: acknowledgeRestockRequest ─────────────────────────────────────────

describe("acknowledgeRestockRequest", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		setupDbMock();
	});

	it('returns "Dispatcher context required" when no dispatcherId in context', async () => {
		const result = await acknowledgeRestockRequest("req-1", "org-1", { techId: "tech-1" });
		expect(result.err).toBe("Dispatcher context required");
	});

	it('returns "Restock request not found" when updateMany matches zero rows and no record exists', async () => {
		(db as unknown as Record<string, unknown>).vehicle_restock_request = {
			updateMany: vi.fn().mockResolvedValue({ count: 0 }),
			findFirst: vi.fn().mockResolvedValue(null),
			findUnique: vi.fn().mockResolvedValue(null),
		};
		const result = await acknowledgeRestockRequest("req-1", "org-1", {
			dispatcherId: "dispatcher-1",
		});
		expect(result.err).toBe("Restock request not found");
	});

	it('returns "Request is not in pending state" when request exists but is already acknowledged', async () => {
		(db as unknown as Record<string, unknown>).vehicle_restock_request = {
			updateMany: vi.fn().mockResolvedValue({ count: 0 }),
			findFirst: vi.fn().mockResolvedValue({ id: "req-1", status: "acknowledged" }),
			findUnique: vi.fn().mockResolvedValue(null),
		};
		const result = await acknowledgeRestockRequest("req-1", "org-1", {
			dispatcherId: "dispatcher-1",
		});
		expect(result.err).toBe("Request is not in pending state");
	});

	it("acknowledges the request on happy path", async () => {
		(db as unknown as Record<string, unknown>).vehicle_restock_request = {
			updateMany: vi.fn().mockResolvedValue({ count: 1 }),
			findUnique: vi.fn().mockResolvedValue({ id: "req-1", status: "acknowledged" }),
		};
		const result = await acknowledgeRestockRequest("req-1", "org-1", {
			dispatcherId: "dispatcher-1",
		});
		expect(result.err).toBeUndefined();
		expect(result.request).toBeDefined();
	});
});

// ── Tests: dismissRestockRequest ──────────────────────────────────────────────

describe("dismissRestockRequest", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		setupDbMock();
	});

	it('returns "Restock request not found" when no matching row exists', async () => {
		(db as unknown as Record<string, unknown>).vehicle_restock_request = {
			updateMany: vi.fn().mockResolvedValue({ count: 0 }),
			findFirst: vi.fn().mockResolvedValue(null),
		};
		const result = await dismissRestockRequest("req-1", "org-1", { dispatcherId: "dispatcher-1" });
		expect(result.err).toBe("Restock request not found");
	});

	it('returns "Request is already resolved" when request is already resolved', async () => {
		(db as unknown as Record<string, unknown>).vehicle_restock_request = {
			updateMany: vi.fn().mockResolvedValue({ count: 0 }),
			findFirst: vi.fn().mockResolvedValue({ id: "req-1", status: "resolved" }),
		};
		const result = await dismissRestockRequest("req-1", "org-1", { dispatcherId: "dispatcher-1" });
		expect(result.err).toBe("Request is already resolved");
	});

	it("dismisses a pending request on happy path", async () => {
		(db as unknown as Record<string, unknown>).vehicle_restock_request = {
			updateMany: vi.fn().mockResolvedValue({ count: 1 }),
			findFirst: vi.fn().mockResolvedValue({ id: "req-1", status: "dismissed" }),
		};
		const result = await dismissRestockRequest("req-1", "org-1", { dispatcherId: "dispatcher-1" });
		expect(result.err).toBeUndefined();
		expect(result.request).toBeDefined();
	});
});

// ── Tests: createRestockRequestsBulk ─────────────────────────────────────────

describe("createRestockRequestsBulk", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		setupDbMock();
	});

	it("returns an error when called without a techId", async () => {
		const result = await createRestockRequestsBulk(
			"vehicle-1",
			{ items: [{ stock_item_id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d" }] },
			"org-1",
			{ dispatcherId: "dispatcher-1" },
		);
		expect(result.err).toBeTruthy();
	});

	it('returns "Validation failed" for empty items array', async () => {
		const result = await createRestockRequestsBulk("vehicle-1", { items: [] }, "org-1", {
			techId: "tech-1",
		});
		expect(result.err).toMatch(/^Validation failed:/);
	});

	it('returns "Validation failed" for duplicate stock_item_id entries', async () => {
		const id = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
		const result = await createRestockRequestsBulk(
			"vehicle-1",
			{ items: [{ stock_item_id: id }, { stock_item_id: id }] },
			"org-1",
			{ techId: "tech-1" },
		);
		expect(result.err).toMatch(/^Validation failed:/);
	});

	it("creates requests and returns created + skipped on happy path", async () => {
		const result = await createRestockRequestsBulk(
			"vehicle-1",
			{ items: [{ stock_item_id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d" }] },
			"org-1",
			{ techId: "tech-1" },
		);
		expect(result.err).toBeFalsy();
		expect(Array.isArray(result.created)).toBe(true);
		expect(Array.isArray(result.skipped)).toBe(true);
	});
});

// ── Tests: getRestockToday ────────────────────────────────────────────────────

describe("getRestockToday", () => {
	let sdb: ReturnType<typeof buildDefaultSdb>;

	beforeEach(() => {
		vi.clearAllMocks();
		sdb = buildDefaultSdb();
		mockGetScopedDb.mockReturnValue(sdb as unknown as ReturnType<typeof getScopedDb>);
	});

	it('returns "Vehicle not found" when vehicle.findFirst returns null', async () => {
		sdb.vehicle.findFirst.mockResolvedValue(null);

		const result = await getRestockToday("vehicle-1", "org-1");

		expect(result.err).toBe("Vehicle not found");
	});

	it("returns { record: null } when no restock record exists for today", async () => {
		sdb.vehicle_restock_record.findFirst.mockResolvedValue(null);

		const result = await getRestockToday("vehicle-1", "org-1");

		expect(result.err).toBeUndefined();
		expect(result.record).toBeNull();
	});

	it("returns { record: <data> } when a restock record exists for today", async () => {
		const restockRecord = makeRestockRecord();
		sdb.vehicle_restock_record.findFirst.mockResolvedValue(restockRecord);

		const result = await getRestockToday("vehicle-1", "org-1");

		expect(result.err).toBeUndefined();
		expect(result.record).toEqual(restockRecord);
	});
});
