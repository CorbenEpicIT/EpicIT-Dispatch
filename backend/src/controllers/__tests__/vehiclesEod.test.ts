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
		recordMovements: vi.fn().mockResolvedValue({ lowStockItemIds: [] }),
		lockInventoryRows: vi.fn().mockResolvedValue(undefined),
	};
});

vi.mock("../../services/lowStockAlerts.js", () => ({
	fireLowStockAlerts: vi.fn().mockResolvedValue(undefined),
	sendLowStockAlert: vi.fn().mockResolvedValue(undefined),
}));

// Imports must come AFTER vi.mock() calls
import { completeEod, getEodToday } from "../vehiclesController.js";
import { getScopedDb } from "../../lib/context.js";
import { recordMovements, lockInventoryRows } from "../../services/stockMovements.js";
import { Prisma } from "../../../generated/prisma/client.js";

const mockGetScopedDb = vi.mocked(getScopedDb);
const mockRecordMovements = vi.mocked(recordMovements);
const mockLockInventoryRows = vi.mocked(lockInventoryRows);

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

function makeEodRecord(overrides: Record<string, unknown> = {}) {
	return {
		id: "eod-1",
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
		vehicle_eod_record: {
			create: vi.fn().mockResolvedValue(makeEodRecord()),
			findUniqueOrThrow: vi.fn().mockResolvedValue(makeEodRecord()),
		},
		vehicle_eod_restock_line: {
			createMany: vi.fn().mockResolvedValue({ count: 0 }),
		},
	};

	const sdb = {
		vehicle: {
			findFirst: vi.fn().mockResolvedValue(makeVehicle()),
		},
		vehicle_eod_record: {
			findFirst: vi.fn().mockResolvedValue(null),
		},
		$transaction: vi.fn().mockImplementation(
			async (fn: (tx: typeof tx) => unknown) => fn(tx),
		),
		_tx: tx, // expose for assertions
	};

	return sdb;
}

// ── Tests: completeEod ────────────────────────────────────────────────────────

describe("completeEod", () => {
	let sdb: ReturnType<typeof buildDefaultSdb>;

	beforeEach(() => {
		vi.clearAllMocks();
		mockRecordMovements.mockResolvedValue({ lowStockItemIds: [] });
		sdb = buildDefaultSdb();
		mockGetScopedDb.mockReturnValue(sdb as unknown as ReturnType<typeof getScopedDb>);
	});

	it('returns "Vehicle not found" when vehicle.findFirst returns null', async () => {
		sdb.vehicle.findFirst.mockResolvedValue(null);

		const result = await completeEod(
			"vehicle-1",
			{ restock_lines: [] },
			"org-1",
			{ dispatcherId: "dispatcher-1" },
		);

		expect(result.err).toBe("Vehicle not found");
	});

	it('returns "Actor context required" when context is undefined', async () => {
		const result = await completeEod("vehicle-1", { restock_lines: [] }, "org-1", undefined);

		expect(result.err).toBe("Actor context required");
	});

	it("accepts a technician actor and stamps completed_by_tech_id", async () => {
		const result = await completeEod(
			"vehicle-1",
			{ restock_lines: [] },
			"org-1",
			{ techId: "tech-1" },
		);

		expect(result.err).toBeUndefined();
		const createData = sdb._tx.vehicle_eod_record.create.mock.calls[0][0].data;
		expect(createData.completed_by_id).toBeNull();
		expect(createData.completed_by_tech_id).toBe("tech-1");
	});

	it("stamps completed_by_id (not tech) for a dispatcher actor", async () => {
		await completeEod("vehicle-1", { restock_lines: [] }, "org-1", {
			dispatcherId: "dispatcher-1",
		});

		const createData = sdb._tx.vehicle_eod_record.create.mock.calls[0][0].data;
		expect(createData.completed_by_id).toBe("dispatcher-1");
		expect(createData.completed_by_tech_id).toBeNull();
	});

	it('returns "EOD already completed for today" on unique-constraint violation (P2002)', async () => {
		sdb._tx.vehicle_eod_record.create.mockRejectedValue(
			new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
				code: "P2002",
				clientVersion: "7.0.0",
			}),
		);

		const result = await completeEod(
			"vehicle-1",
			{ restock_lines: [] },
			"org-1",
			{ dispatcherId: "dispatcher-1" },
		);

		expect(result.err).toBe("EOD already completed for today");
	});

	it('returns "Validation failed: ..." for invalid input (restock_lines is not an array)', async () => {
		const result = await completeEod(
			"vehicle-1",
			{ restock_lines: "not-an-array" },
			"org-1",
			{ dispatcherId: "dispatcher-1" },
		);

		expect(result.err).toMatch(/^Validation failed:/);
	});

	it('returns "Validation failed: ..." for duplicate stock_item_id entries', async () => {
		const result = await completeEod(
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

	it("creates the EOD record FIRST, locks rows, then emits restock movements", async () => {
		const stockItemId = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
		sdb._tx.vehicle_stock_item.findMany.mockResolvedValue([
			makeStockItem({ id: stockItemId }),
		]);
		sdb._tx.inventory_item.findMany.mockResolvedValue([{ id: "inv-1", quantity: 10 }]);

		const result = await completeEod(
			"vehicle-1",
			{ restock_lines: [{ stock_item_id: stockItemId, qty_to_restock: 3 }] },
			"org-1",
			{ dispatcherId: "dispatcher-1" },
		);

		expect(result.err).toBeUndefined();
		expect(sdb._tx.vehicle_eod_record.create).toHaveBeenCalledOnce();
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
				eod_record_id: "eod-1",
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

		const result = await completeEod(
			"vehicle-1",
			{ restock_lines: [{ stock_item_id: stockItemId, qty_to_restock: 10 }] },
			"org-1",
			{ dispatcherId: "dispatcher-1" },
		);

		expect(result.err).toBeUndefined();
		const lines = sdb._tx.vehicle_eod_restock_line.createMany.mock.calls[0][0].data;
		expect(lines[0].qty_restocked).toBe(4);
		expect(lines[0].qty_shortfall).toBe(6);

		const movements = mockRecordMovements.mock.calls[0][3];
		expect(movements[0].qty).toBe(4);
	});

	it("passes notes through to the EOD record", async () => {
		await completeEod(
			"vehicle-1",
			{ restock_lines: [], notes: "Truck 1 short on filters — reorder Monday" },
			"org-1",
			{ dispatcherId: "dispatcher-1" },
		);

		const createData = sdb._tx.vehicle_eod_record.create.mock.calls[0][0].data;
		expect(createData.notes).toBe("Truck 1 short on filters — reorder Monday");
	});

	it("emits no movements when warehouse has zero available", async () => {
		const stockItemId = "c3d4e5f6-a7b8-4c9d-8e1f-2a3b4c5d6e7f";
		sdb._tx.vehicle_stock_item.findMany.mockResolvedValue([
			makeStockItem({ id: stockItemId, inventory_item_id: "inv-3" }),
		]);
		sdb._tx.inventory_item.findMany.mockResolvedValue([{ id: "inv-3", quantity: 0 }]);

		const result = await completeEod(
			"vehicle-1",
			{ restock_lines: [{ stock_item_id: stockItemId, qty_to_restock: 5 }] },
			"org-1",
			{ dispatcherId: "dispatcher-1" },
		);

		expect(result.err).toBeUndefined();
		const movements = mockRecordMovements.mock.calls[0][3];
		expect(movements).toEqual([]);
		// Shortfall line is still recorded on the document
		const lines = sdb._tx.vehicle_eod_restock_line.createMany.mock.calls[0][0].data;
		expect(lines[0].qty_restocked).toBe(0);
		expect(lines[0].qty_shortfall).toBe(5);
	});
});

// ── Tests: getEodToday ────────────────────────────────────────────────────────

describe("getEodToday", () => {
	let sdb: ReturnType<typeof buildDefaultSdb>;

	beforeEach(() => {
		vi.clearAllMocks();
		sdb = buildDefaultSdb();
		mockGetScopedDb.mockReturnValue(sdb as unknown as ReturnType<typeof getScopedDb>);
	});

	it('returns "Vehicle not found" when vehicle.findFirst returns null', async () => {
		sdb.vehicle.findFirst.mockResolvedValue(null);

		const result = await getEodToday("vehicle-1", "org-1");

		expect(result.err).toBe("Vehicle not found");
	});

	it("returns { record: null } when no EOD record exists for today", async () => {
		sdb.vehicle_eod_record.findFirst.mockResolvedValue(null);

		const result = await getEodToday("vehicle-1", "org-1");

		expect(result.err).toBeUndefined();
		expect(result.record).toBeNull();
	});

	it("returns { record: <data> } when an EOD record exists for today", async () => {
		const eodRecord = makeEodRecord();
		sdb.vehicle_eod_record.findFirst.mockResolvedValue(eodRecord);

		const result = await getEodToday("vehicle-1", "org-1");

		expect(result.err).toBeUndefined();
		expect(result.record).toEqual(eodRecord);
	});
});
