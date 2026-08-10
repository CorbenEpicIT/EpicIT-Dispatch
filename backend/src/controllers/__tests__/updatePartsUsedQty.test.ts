import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks (must be before any import that resolves to them) ───────────────────

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
		recordMovements: vi.fn().mockResolvedValue({ lowStockItemIds: [], gapItemIds: [], movementIds: [] }),
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

import { updatePartsUsedQty } from "../vehiclesController.js";
import { getScopedDb } from "../../lib/context.js";
import { recordMovements } from "../../services/stockMovements.js";

const mockGetScopedDb = vi.mocked(getScopedDb);
const mockRecordMovements = vi.mocked(recordMovements);

// ── UUIDs ─────────────────────────────────────────────────────────────────────

const VISIT_ID = "bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb";
const INV_ITEM_ID = "cccccccc-cccc-4ccc-accc-cccccccccccc";
const TECH_ID = "dddddddd-dddd-4ddd-addd-dddddddddddd";
const VEHICLE_ID = "eeeeeeee-eeee-4eee-aeee-eeeeeeeeeeee";
const LINE_ITEM_ID = "ffffffff-ffff-4fff-afff-ffffffffffff";
const BATCH_ID = "11111111-1111-4111-8111-111111111111";
const SERIAL_UUID_1 = "22222222-2222-4222-8222-222222222222";
const SERIAL_UUID_2 = "33333333-3333-4333-8333-333333333333";
const ORG_ID = "org-1";
const MOVEMENT_ID_1 = "55555555-5555-4555-8555-555555555555";
const MOVEMENT_ID_2 = "66666666-6666-4666-8666-666666666666";

// ── Factory helpers ───────────────────────────────────────────────────────────

function makeLineItem(overrides: Record<string, unknown> = {}) {
	return {
		id: LINE_ITEM_ID,
		visit_id: VISIT_ID,
		name: "Widget",
		quantity: 3,
		unit_price: 10,
		total: 30,
		source: "field_addition",
		item_type: "material",
		sort_order: 0,
		inventory_item_id: INV_ITEM_ID,
		fulfillment_status: "used",
		inventory_item: {
			id: INV_ITEM_ID,
			name: "Widget",
			unit_price: 10,
			is_serialized: false,
			is_batch_tracked: false,
		},
		...overrides,
	};
}

/** Build a scoped-db mock whose $transaction executes the callback inline. */
function makeSdb(opts: {
	lineItem?: unknown;
	originVehicleId?: string | null;
	serialRows?: { id: string }[];
	movementRows?: unknown[];
} = {}) {
	const lineItem = "lineItem" in opts ? opts.lineItem : makeLineItem();
	const tx = {
		serial_unit: {
			findMany: vi.fn().mockResolvedValue(opts.serialRows ?? []),
		},
		stock_movement: {
			findMany: vi.fn().mockResolvedValue(opts.movementRows ?? []),
		},
		job_visit_line_item: {
			update: vi.fn().mockResolvedValue(makeLineItem()),
			delete: vi.fn().mockResolvedValue(undefined),
		},
	};

	const sdb = {
		job_visit_line_item: { findFirst: vi.fn().mockResolvedValue(lineItem) },
		stock_movement: {
			findFirst: vi.fn().mockResolvedValue(
				opts.originVehicleId === undefined
					? { from_vehicle_id: VEHICLE_ID }
					: opts.originVehicleId === null
						? null
						: { from_vehicle_id: opts.originVehicleId },
			),
		},
		$transaction: vi.fn().mockImplementation(async (fn: (tx: typeof tx) => unknown) => fn(tx)),
		_tx: tx,
	};

	mockGetScopedDb.mockReturnValue(sdb as unknown as ReturnType<typeof getScopedDb>);
	return sdb;
}

function movementsFromLastCall() {
	const call = mockRecordMovements.mock.calls.at(-1);
	return call ? call[3] : undefined;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("updatePartsUsedQty", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRecordMovements.mockResolvedValue({ lowStockItemIds: [], gapItemIds: [], movementIds: [] });
	});

	// ── Untracked items ────────────────────────────────────────────────────────

	it("increases an untracked line by deducting the delta from the same vehicle", async () => {
		makeSdb();

		const result = await updatePartsUsedQty(
			VISIT_ID,
			LINE_ITEM_ID,
			{ technician_id: TECH_ID, quantity: 5 },
			ORG_ID,
		);

		expect(result.err).toBe("");
		const movements = movementsFromLastCall();
		expect(movements).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					qty: 2,
					from_location_type: "vehicle",
					from_vehicle_id: VEHICLE_ID,
					to_location_type: "consumed",
					reason: "parts_used",
				}),
			]),
		);
	});

	it("decreases an untracked line by writing a reversal movement back to the vehicle", async () => {
		const sdb = makeSdb();

		const result = await updatePartsUsedQty(
			VISIT_ID,
			LINE_ITEM_ID,
			{ technician_id: TECH_ID, quantity: 1 },
			ORG_ID,
		);

		expect(result.err).toBe("");
		const movements = movementsFromLastCall();
		expect(movements).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					qty: 2,
					from_location_type: "consumed",
					to_location_type: "vehicle",
					to_vehicle_id: VEHICLE_ID,
					reason: "reversal",
				}),
			]),
		);
		expect(sdb._tx.job_visit_line_item.update).toHaveBeenCalledWith(
			expect.objectContaining({ data: expect.objectContaining({ quantity: 1, total: 10 }) }),
		);
	});

	it("deletes the line item when quantity drops to zero", async () => {
		const sdb = makeSdb();

		const result = await updatePartsUsedQty(
			VISIT_ID,
			LINE_ITEM_ID,
			{ technician_id: TECH_ID, quantity: 0 },
			ORG_ID,
		);

		expect(result.err).toBe("");
		expect(sdb._tx.job_visit_line_item.delete).toHaveBeenCalledWith({ where: { id: LINE_ITEM_ID } });
		expect(sdb._tx.job_visit_line_item.update).not.toHaveBeenCalled();
	});

	it("is a no-op when quantity is unchanged", async () => {
		makeSdb();

		const result = await updatePartsUsedQty(
			VISIT_ID,
			LINE_ITEM_ID,
			{ technician_id: TECH_ID, quantity: 3 },
			ORG_ID,
		);

		expect(result.err).toBe("");
		expect(mockRecordMovements).not.toHaveBeenCalled();
	});

	// ── Serialized items ───────────────────────────────────────────────────────

	it("rejects increasing a serialized line without opening a transaction", async () => {
		const sdb = makeSdb({
			lineItem: makeLineItem({
				inventory_item: { ...makeLineItem().inventory_item, is_serialized: true },
			}),
		});

		const result = await updatePartsUsedQty(
			VISIT_ID,
			LINE_ITEM_ID,
			{ technician_id: TECH_ID, quantity: 5 },
			ORG_ID,
		);

		expect(result.err).toMatch(/can't be increased/);
		expect(sdb.$transaction).not.toHaveBeenCalled();
		expect(mockRecordMovements).not.toHaveBeenCalled();
	});

	it("releases the exact consumed serials when decreasing a serialized line", async () => {
		const sdb = makeSdb({
			lineItem: makeLineItem({
				inventory_item: { ...makeLineItem().inventory_item, is_serialized: true },
			}),
			serialRows: [{ id: SERIAL_UUID_1 }, { id: SERIAL_UUID_2 }],
		});

		const result = await updatePartsUsedQty(
			VISIT_ID,
			LINE_ITEM_ID,
			{ technician_id: TECH_ID, quantity: 1 },
			ORG_ID,
		);

		expect(result.err).toBe("");
		expect(sdb._tx.serial_unit.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { consumed_line_item_id: LINE_ITEM_ID },
				take: 2,
			}),
		);
		const movements = movementsFromLastCall();
		expect(movements).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					reason: "reversal",
					serial: { unit_ids: [SERIAL_UUID_1, SERIAL_UUID_2] },
				}),
			]),
		);
	});

	it("errors instead of silently under-releasing when fewer consumed serials exist than the requested decrease", async () => {
		makeSdb({
			lineItem: makeLineItem({
				inventory_item: { ...makeLineItem().inventory_item, is_serialized: true },
			}),
			serialRows: [{ id: SERIAL_UUID_1 }],
		});

		const result = await updatePartsUsedQty(
			VISIT_ID,
			LINE_ITEM_ID,
			{ technician_id: TECH_ID, quantity: 1 },
			ORG_ID,
		);

		expect(result.err).toMatch(/Only 1 consumed unit/);
		expect(mockRecordMovements).not.toHaveBeenCalled();
	});

	// ── Batch-tracked items ────────────────────────────────────────────────────

	it("nets prior movements to compute the batch allocation released on decrease", async () => {
		makeSdb({
			lineItem: makeLineItem({
				inventory_item: { ...makeLineItem().inventory_item, is_batch_tracked: true },
			}),
			movementRows: [
				{
					id: MOVEMENT_ID_1,
					reason: "parts_used",
					movement_batches: [{ batch_id: BATCH_ID, qty: 3 }],
				},
			],
		});

		const result = await updatePartsUsedQty(
			VISIT_ID,
			LINE_ITEM_ID,
			{ technician_id: TECH_ID, quantity: 1 },
			ORG_ID,
		);

		expect(result.err).toBe("");
		const movements = movementsFromLastCall();
		expect(movements).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					reason: "reversal",
					batch_allocations: [{ batch_id: BATCH_ID, qty: 2 }],
				}),
			]),
		);
	});

	it("nets out a previously applied reversal before computing what remains to release", async () => {
		makeSdb({
			lineItem: makeLineItem({
				inventory_item: { ...makeLineItem().inventory_item, is_batch_tracked: true },
				quantity: 2,
			}),
			movementRows: [
				{ id: MOVEMENT_ID_1, reason: "parts_used", movement_batches: [{ batch_id: BATCH_ID, qty: 3 }] },
				{ id: MOVEMENT_ID_2, reason: "reversal", movement_batches: [{ batch_id: BATCH_ID, qty: 1 }] },
			],
		});

		const result = await updatePartsUsedQty(
			VISIT_ID,
			LINE_ITEM_ID,
			{ technician_id: TECH_ID, quantity: 1 },
			ORG_ID,
		);

		expect(result.err).toBe("");
		const movements = movementsFromLastCall();
		expect(movements).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ batch_allocations: [{ batch_id: BATCH_ID, qty: 1 }] }),
			]),
		);
	});

	it("allows increasing a batch-tracked line (FIFO auto-allocates, no picker needed)", async () => {
		makeSdb({
			lineItem: makeLineItem({
				inventory_item: { ...makeLineItem().inventory_item, is_batch_tracked: true },
			}),
		});

		const result = await updatePartsUsedQty(
			VISIT_ID,
			LINE_ITEM_ID,
			{ technician_id: TECH_ID, quantity: 5 },
			ORG_ID,
		);

		expect(result.err).toBe("");
		const movements = movementsFromLastCall();
		expect(movements).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ reason: "parts_used", batch_allocations: undefined }),
			]),
		);
	});

	// ── Guardrails ─────────────────────────────────────────────────────────────

	it("errors when the originating vehicle can't be determined", async () => {
		makeSdb({ originVehicleId: null });

		const result = await updatePartsUsedQty(
			VISIT_ID,
			LINE_ITEM_ID,
			{ technician_id: TECH_ID, quantity: 1 },
			ORG_ID,
		);

		expect(result.err).toMatch(/originating vehicle/);
		expect(mockRecordMovements).not.toHaveBeenCalled();
	});

	it("rejects a line item that was never linked to vehicle stock", async () => {
		makeSdb({ lineItem: makeLineItem({ inventory_item_id: null, inventory_item: null, fulfillment_status: null }) });

		const result = await updatePartsUsedQty(
			VISIT_ID,
			LINE_ITEM_ID,
			{ technician_id: TECH_ID, quantity: 1 },
			ORG_ID,
		);

		expect(result.err).toMatch(/regular line item/);
		expect(mockRecordMovements).not.toHaveBeenCalled();
	});

	it("returns not found for a missing line item", async () => {
		makeSdb({ lineItem: null });

		const result = await updatePartsUsedQty(
			VISIT_ID,
			LINE_ITEM_ID,
			{ technician_id: TECH_ID, quantity: 1 },
			ORG_ID,
		);

		expect(result.err).toBe("Line item not found");
	});
});
