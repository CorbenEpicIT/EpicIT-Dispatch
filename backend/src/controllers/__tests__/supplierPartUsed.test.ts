import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks (must be before any import that resolves to them) ───────────────────

vi.mock("../../db.js", () => {
	const $extends = vi.fn();
	const mockDb = {
		technician: { findFirst: vi.fn() },
		$extends,
	};
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

vi.mock("../../lib/recomputeDocumentTotals.js", () => ({
	recomputeVisitTotals: vi.fn().mockResolvedValue(undefined),
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { addSupplierPartUsed } from "../vehiclesController.js";
import { db } from "../../db.js";
import { getScopedDb } from "../../lib/context.js";
import { recordMovements } from "../../services/stockMovements.js";

const mockDb = vi.mocked(db, true);
const mockGetScopedDb = vi.mocked(getScopedDb);
const mockRecordMovements = vi.mocked(recordMovements);

// ── UUIDs ─────────────────────────────────────────────────────────────────────

const VEHICLE_ID = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const VISIT_ID = "bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb";
const INV_ITEM_ID = "cccccccc-cccc-4ccc-accc-cccccccccccc";
const TECH_ID = "dddddddd-dddd-4ddd-addd-dddddddddddd";
const STOCK_ROW_ID = "eeeeeeee-eeee-4eee-aeee-eeeeeeeeeeee";
const LINE_ITEM_ID = "ffffffff-ffff-4fff-afff-ffffffffffff";
const ORG_ID = "org-1";

// ── Factory helpers ───────────────────────────────────────────────────────────

function makeLineItem(overrides: Record<string, unknown> = {}) {
	return {
		id: LINE_ITEM_ID,
		visit_id: VISIT_ID,
		name: "Widget",
		quantity: 2,
		unit_price: 10,
		total: 20,
		source: "field_addition",
		item_type: "material",
		sort_order: 0,
		inventory_item_id: INV_ITEM_ID,
		fulfillment_status: "used",
		...overrides,
	};
}

function makeStockRow() {
	return { id: STOCK_ROW_ID };
}

/**
 * Build a scoped-db mock whose $transaction executes the callback inline.
 * All inner tx methods are vi.fn() stubs that can be asserted on.
 */
function makeSdb(
	invItem: { name: string; unit_price: number } | null = { name: "Widget", unit_price: 10 },
	invItemFlags: { is_serialized?: boolean; is_batch_tracked?: boolean } = {},
) {
	const tx = {
		inventory_item: {
			findFirst: vi.fn().mockResolvedValue(invItem ? { id: INV_ITEM_ID } : null),
			create: vi.fn().mockResolvedValue({ id: INV_ITEM_ID }),
			findFirstOrThrow: vi.fn().mockResolvedValue({ name: "Widget", unit_price: 10, ...invItemFlags }),
		},
		job_visit_line_item: {
			create: vi.fn().mockResolvedValue(makeLineItem()),
		},
		vehicle_stock_item: {
			findFirstOrThrow: vi.fn().mockResolvedValue(makeStockRow()),
			upsert: vi.fn().mockResolvedValue({ id: STOCK_ROW_ID, qty_on_hand: 0 }),
		},
		vehicle_stock_usage: {
			create: vi.fn().mockResolvedValue({ id: "usage-1" }),
		},
		serial_unit: {
			findMany: vi.fn().mockResolvedValue([]),
		},
		stock_batch: {
			findFirst: vi.fn().mockResolvedValue(null),
			create: vi.fn().mockResolvedValue({ id: "batch-created-1", code: "LOT-X" }),
		},
	};

	const sdb = {
		job_visit: { findFirst: vi.fn().mockResolvedValue({ id: VISIT_ID }) },
		$transaction: vi.fn().mockImplementation(
			async (fn: (tx: typeof tx) => unknown) => fn(tx),
		),
		_tx: tx,
	};

	mockGetScopedDb.mockReturnValue(sdb as unknown as ReturnType<typeof getScopedDb>);
	return sdb;
}

// Technician-on-vehicle helper: make db.technician.findFirst return a record
// that satisfies requireTechOnVehicle (current_vehicle_id === vehicleId).
function mockTechOnVehicle(vehicleId = VEHICLE_ID) {
	mockDb.technician.findFirst.mockResolvedValue({ current_vehicle_id: vehicleId } as never);
}

function mockTechNotOnVehicle() {
	mockDb.technician.findFirst.mockResolvedValue({ current_vehicle_id: "other-vehicle" } as never);
}

function mockNoTechContext() {
	// context has no techId → requireTechOnVehicle returns "Only technicians..."
	mockDb.technician.findFirst.mockResolvedValue(null as never);
}

const TECH_CONTEXT = { techId: TECH_ID, ipAddress: "127.0.0.1", userAgent: "test" };

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("addSupplierPartUsed", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// ── Case 1: new_item → provisional created, two movements, line item ─────

	it("creates a provisional item, fires two movements, creates a line item with fulfillment_status=used", async () => {
		const sdb = makeSdb();
		mockTechOnVehicle();

		const result = await addSupplierPartUsed(
			VEHICLE_ID,
			VISIT_ID,
			{ technician_id: TECH_ID, qty_used: 2, new_item: { name: "Widget", cost: 10 } },
			ORG_ID,
			TECH_CONTEXT,
		);

		expect(result.err).toBe("");

		// Two recordMovements calls: supplier_purchase then parts_used
		expect(mockRecordMovements).toHaveBeenCalledTimes(2);

		const [, , , movements1] = mockRecordMovements.mock.calls[0];
		expect(movements1).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					from_location_type: "external",
					to_location_type: "vehicle",
					reason: "supplier_purchase",
				}),
			]),
		);

		const [, , , movements2] = mockRecordMovements.mock.calls[1];
		expect(movements2).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					from_location_type: "vehicle",
					to_location_type: "consumed",
					reason: "parts_used",
				}),
			]),
		);

		// Line item created with fulfillment_status "used"
		const tx = sdb._tx;
		expect(tx.job_visit_line_item.create).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ fulfillment_status: "used" }),
			}),
		);

		// Provisional item created
		expect(tx.inventory_item.create).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ provisional: true, name: "Widget" }),
			}),
		);

		// Usage row created
		expect(tx.vehicle_stock_usage.create).toHaveBeenCalledOnce();
	});

	// ── Case 2: existing inventory_item_id path ──────────────────────────────

	it("resolves an existing inventory item and creates the movements + line item", async () => {
		const sdb = makeSdb();
		mockTechOnVehicle();

		const result = await addSupplierPartUsed(
			VEHICLE_ID,
			VISIT_ID,
			{ technician_id: TECH_ID, qty_used: 3, inventory_item_id: INV_ITEM_ID },
			ORG_ID,
			TECH_CONTEXT,
		);

		expect(result.err).toBe("");
		expect(mockRecordMovements).toHaveBeenCalledTimes(2);

		const tx = sdb._tx;
		// findFirst used to resolve existing item (not create)
		expect(tx.inventory_item.create).not.toHaveBeenCalled();
	});

	// ── Case 3: tech-on-vehicle ownership enforced ───────────────────────────

	it("returns an ownership error when technician is not assigned to the vehicle", async () => {
		makeSdb();
		mockTechNotOnVehicle();

		const result = await addSupplierPartUsed(
			VEHICLE_ID,
			VISIT_ID,
			{ technician_id: TECH_ID, qty_used: 1, inventory_item_id: INV_ITEM_ID },
			ORG_ID,
			TECH_CONTEXT,
		);

		expect(result.err).toMatch(/not assigned/i);
		expect(mockRecordMovements).not.toHaveBeenCalled();
	});

	it("returns an error when context has no techId", async () => {
		makeSdb();
		// No techId in context → requireTechOnVehicle returns "Only technicians..."
		const result = await addSupplierPartUsed(
			VEHICLE_ID,
			VISIT_ID,
			{ technician_id: TECH_ID, qty_used: 1, inventory_item_id: INV_ITEM_ID },
			ORG_ID,
			{ dispatcherId: "disp-1" },
		);

		expect(result.err).toMatch(/only technicians/i);
		expect(mockRecordMovements).not.toHaveBeenCalled();
	});

	// ── Case 4: validation — qty <= 0 rejected ───────────────────────────────

	it("rejects qty_used of 0", async () => {
		makeSdb();
		mockTechOnVehicle();

		const result = await addSupplierPartUsed(
			VEHICLE_ID,
			VISIT_ID,
			{ technician_id: TECH_ID, qty_used: 0, inventory_item_id: INV_ITEM_ID },
			ORG_ID,
			TECH_CONTEXT,
		);

		expect(result.err).toMatch(/validation failed/i);
		expect(mockRecordMovements).not.toHaveBeenCalled();
	});

	it("rejects negative qty_used", async () => {
		makeSdb();
		mockTechOnVehicle();

		const result = await addSupplierPartUsed(
			VEHICLE_ID,
			VISIT_ID,
			{ technician_id: TECH_ID, qty_used: -5, inventory_item_id: INV_ITEM_ID },
			ORG_ID,
			TECH_CONTEXT,
		);

		expect(result.err).toMatch(/validation failed/i);
		expect(mockRecordMovements).not.toHaveBeenCalled();
	});

	// ── Case 5: validation — neither inventory_item_id nor new_item ──────────

	it("rejects when neither inventory_item_id nor new_item is provided", async () => {
		makeSdb();
		mockTechOnVehicle();

		const result = await addSupplierPartUsed(
			VEHICLE_ID,
			VISIT_ID,
			{ technician_id: TECH_ID, qty_used: 1 },
			ORG_ID,
			TECH_CONTEXT,
		);

		expect(result.err).toMatch(/validation failed/i);
		expect(mockRecordMovements).not.toHaveBeenCalled();
	});

	it("rejects when both inventory_item_id and new_item are provided", async () => {
		makeSdb();
		mockTechOnVehicle();

		const result = await addSupplierPartUsed(
			VEHICLE_ID,
			VISIT_ID,
			{
				technician_id: TECH_ID,
				qty_used: 1,
				inventory_item_id: INV_ITEM_ID,
				new_item: { name: "Widget", cost: 5 },
			},
			ORG_ID,
			TECH_CONTEXT,
		);

		expect(result.err).toMatch(/validation failed/i);
		expect(mockRecordMovements).not.toHaveBeenCalled();
	});

	// ── Case 6: visit not found ───────────────────────────────────────────────

	it("returns an error when the visit does not exist", async () => {
		const sdb = makeSdb();
		sdb.job_visit.findFirst.mockResolvedValue(null as unknown as { id: string });
		mockTechOnVehicle();

		const result = await addSupplierPartUsed(
			VEHICLE_ID,
			VISIT_ID,
			{ technician_id: TECH_ID, qty_used: 1, inventory_item_id: INV_ITEM_ID },
			ORG_ID,
			TECH_CONTEXT,
		);

		expect(result.err).toMatch(/not found/i);
		expect(mockRecordMovements).not.toHaveBeenCalled();
	});

	// ── Case 7: serialized item — new_serials created on leg 1, consumed on leg 2 ──

	it("serialized item: creates serials on leg 1 and consumes the same units on leg 2", async () => {
		const sdb = makeSdb(undefined, { is_serialized: true, is_batch_tracked: false });
		mockTechOnVehicle();

		const createdUnits = [{ id: "su-1" }, { id: "su-2" }];
		sdb._tx.serial_unit.findMany.mockResolvedValue(createdUnits);

		const result = await addSupplierPartUsed(
			VEHICLE_ID,
			VISIT_ID,
			{
				technician_id: TECH_ID,
				qty_used: 2,
				inventory_item_id: INV_ITEM_ID,
				new_serials: ["SN-1", "SN-2"],
			},
			ORG_ID,
			TECH_CONTEXT,
		);

		expect(result.err).toBe("");
		expect(mockRecordMovements).toHaveBeenCalledTimes(2);

		const [, , , movements1] = mockRecordMovements.mock.calls[0];
		expect(movements1[0]).toEqual(
			expect.objectContaining({
				serial: { create: [{ serial_number: "SN-1" }, { serial_number: "SN-2" }] },
			}),
		);

		expect(sdb._tx.serial_unit.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					organization_id: ORG_ID,
					inventory_item_id: INV_ITEM_ID,
					serial_number: { in: ["SN-1", "SN-2"] },
				}),
			}),
		);

		const [, , , movements2] = mockRecordMovements.mock.calls[1];
		expect(movements2[0]).toEqual(
			expect.objectContaining({
				serial: { unit_ids: ["su-1", "su-2"] },
			}),
		);
	});

	it("serialized item: missing new_serials is rejected before any DB write", async () => {
		makeSdb(undefined, { is_serialized: true, is_batch_tracked: false });
		mockTechOnVehicle();

		const result = await addSupplierPartUsed(
			VEHICLE_ID,
			VISIT_ID,
			{ technician_id: TECH_ID, qty_used: 2, inventory_item_id: INV_ITEM_ID },
			ORG_ID,
			TECH_CONTEXT,
		);

		expect(result.err).toMatch(/new_serials/i);
		expect(mockRecordMovements).not.toHaveBeenCalled();
	});

	it("serialized item: wrong-length new_serials is rejected before any DB write", async () => {
		makeSdb(undefined, { is_serialized: true, is_batch_tracked: false });
		mockTechOnVehicle();

		const result = await addSupplierPartUsed(
			VEHICLE_ID,
			VISIT_ID,
			{
				technician_id: TECH_ID,
				qty_used: 2,
				inventory_item_id: INV_ITEM_ID,
				new_serials: ["SN-1"],
			},
			ORG_ID,
			TECH_CONTEXT,
		);

		expect(result.err).toMatch(/new_serials/i);
		expect(mockRecordMovements).not.toHaveBeenCalled();
	});

	// ── Case 8: batch-tracked item — new lot / existing lot ──────────────────

	it("batch-tracked item: a new lot (batch) succeeds and both legs carry matching batch_allocations", async () => {
		const sdb = makeSdb(undefined, { is_serialized: false, is_batch_tracked: true });
		mockTechOnVehicle();

		const result = await addSupplierPartUsed(
			VEHICLE_ID,
			VISIT_ID,
			{
				technician_id: TECH_ID,
				qty_used: 4,
				inventory_item_id: INV_ITEM_ID,
				batch: { batch_number: "LOT-100" },
			},
			ORG_ID,
			TECH_CONTEXT,
		);

		expect(result.err).toBe("");
		expect(sdb._tx.stock_batch.create).toHaveBeenCalledOnce();

		const [, , , movements1] = mockRecordMovements.mock.calls[0];
		expect(movements1[0]).toEqual(
			expect.objectContaining({
				batch_allocations: [{ batch_id: "batch-created-1", qty: 4 }],
			}),
		);

		const [, , , movements2] = mockRecordMovements.mock.calls[1];
		expect(movements2[0]).toEqual(
			expect.objectContaining({
				batch_allocations: [{ batch_id: "batch-created-1", qty: 4 }],
			}),
		);
	});

	it("batch-tracked item: an existing lot (batch_id) succeeds", async () => {
		const sdb = makeSdb(undefined, { is_serialized: false, is_batch_tracked: true });
		mockTechOnVehicle();
		sdb._tx.stock_batch.findFirst.mockResolvedValue({ id: "batch-existing-1" });

		const BATCH_ID = "11111111-1111-4111-a111-111111111111";
		const result = await addSupplierPartUsed(
			VEHICLE_ID,
			VISIT_ID,
			{
				technician_id: TECH_ID,
				qty_used: 3,
				inventory_item_id: INV_ITEM_ID,
				batch_id: BATCH_ID,
			},
			ORG_ID,
			TECH_CONTEXT,
		);

		expect(result.err).toBe("");
		expect(sdb._tx.stock_batch.findFirst).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { id: BATCH_ID, organization_id: ORG_ID, inventory_item_id: INV_ITEM_ID },
			}),
		);

		const [, , , movements1] = mockRecordMovements.mock.calls[0];
		expect(movements1[0]).toEqual(
			expect.objectContaining({
				batch_allocations: [{ batch_id: "batch-existing-1", qty: 3 }],
			}),
		);
	});

	it("batch-tracked item: batch_id not belonging to this item/org is rejected", async () => {
		const sdb = makeSdb(undefined, { is_serialized: false, is_batch_tracked: true });
		mockTechOnVehicle();
		sdb._tx.stock_batch.findFirst.mockResolvedValue(null);

		const BATCH_ID = "22222222-2222-4222-a222-222222222222";
		const result = await addSupplierPartUsed(
			VEHICLE_ID,
			VISIT_ID,
			{
				technician_id: TECH_ID,
				qty_used: 1,
				inventory_item_id: INV_ITEM_ID,
				batch_id: BATCH_ID,
			},
			ORG_ID,
			TECH_CONTEXT,
		);

		expect(result.err).toBe("Batch not found");
		expect(mockRecordMovements).not.toHaveBeenCalled();
	});

	it("batch-tracked item: providing neither batch nor batch_id is rejected", async () => {
		makeSdb(undefined, { is_serialized: false, is_batch_tracked: true });
		mockTechOnVehicle();

		const result = await addSupplierPartUsed(
			VEHICLE_ID,
			VISIT_ID,
			{ technician_id: TECH_ID, qty_used: 1, inventory_item_id: INV_ITEM_ID },
			ORG_ID,
			TECH_CONTEXT,
		);

		expect(result.err).toMatch(/provide batch or batch_id/i);
		expect(mockRecordMovements).not.toHaveBeenCalled();
	});

	// ── Case 9: untracked existing item — no regression ──────────────────────

	it("untracked existing item: no serial/batch fields are added to either movement", async () => {
		makeSdb(undefined, { is_serialized: false, is_batch_tracked: false });
		mockTechOnVehicle();

		const result = await addSupplierPartUsed(
			VEHICLE_ID,
			VISIT_ID,
			{ technician_id: TECH_ID, qty_used: 5, inventory_item_id: INV_ITEM_ID },
			ORG_ID,
			TECH_CONTEXT,
		);

		expect(result.err).toBe("");
		const [, , , movements1] = mockRecordMovements.mock.calls[0];
		expect(movements1[0].serial).toBeUndefined();
		expect(movements1[0].batch_allocations).toBeUndefined();

		const [, , , movements2] = mockRecordMovements.mock.calls[1];
		expect(movements2[0].serial).toBeUndefined();
		expect(movements2[0].batch_allocations).toBeUndefined();
	});
});
