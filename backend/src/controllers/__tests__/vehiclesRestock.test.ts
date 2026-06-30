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
		mockRecordMovements.mockResolvedValue({ lowStockItemIds: [] });
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
