import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../db.js", () => {
	const $extends = vi.fn();
	const mockDb = {
		vehicle_restock_request: {
			findMany: vi.fn(),
			findFirst: vi.fn(),
			update: vi.fn(),
			updateMany: vi.fn(),
			create: vi.fn(),
		},
		vehicle_stock_item: { findFirst: vi.fn() },
		technician: { findMany: vi.fn(), findFirst: vi.fn() },
		$transaction: vi.fn(),
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

import { confirmRestockReceipts, markRestockReceived } from "../vehiclesController.js";
import { db } from "../../db.js";
import { recordMovements } from "../../services/stockMovements.js";

const mockDb = vi.mocked(db, true);
const mockRecordMovements = vi.mocked(recordMovements);
const TECH_CONTEXT = { techId: "tech-1" };
const R1 = "11111111-1111-8111-8111-111111111111";

function makeFulfilled(overrides: Record<string, unknown> = {}) {
	return {
		id: R1,
		status: "fulfilled",
		received_at: null,
		stock_item: { id: "stock-1", vehicle_id: "vehicle-1", inventory_item_id: "inv-1" },
		stock_movements: [{ qty: 5 }],
		...overrides,
	};
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeTx(request: any) {
	const tx = {
		vehicle_restock_request: {
			findFirst: vi
				.fn()
				.mockResolvedValueOnce(request)
				.mockResolvedValue(request ? { ...request, received_at: new Date() } : null),
			updateMany: vi.fn().mockResolvedValue({ count: request && !request.received_at ? 1 : 0 }),
		},
	};
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	mockDb.$transaction.mockImplementation(async (fn: any) => fn(tx));
	return tx;
}

describe("confirmRestockReceipts", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockDb.technician.findFirst.mockResolvedValue({ current_vehicle_id: "vehicle-1" } as never);
		mockRecordMovements.mockResolvedValue({ lowStockItemIds: [] });
	});

	it("rejects technicians not on the vehicle", async () => {
		mockDb.technician.findFirst.mockResolvedValue({ current_vehicle_id: "other" } as never);
		const result = await confirmRestockReceipts(
			"vehicle-1",
			{ items: [{ request_id: R1, qty_received: 5 }] },
			"org-1",
			TECH_CONTEXT,
		);
		expect(result.err).toBe("Technician is not assigned to this vehicle");
	});

	it("matching quantity: no adjustment movement, no discrepant flag", async () => {
		const tx = makeTx(makeFulfilled());

		const result = await confirmRestockReceipts(
			"vehicle-1",
			{ items: [{ request_id: R1, qty_received: 5 }] },
			"org-1",
			TECH_CONTEXT,
		);

		expect(result.err).toBeUndefined();
		expect(result.confirmed).toHaveLength(1);
		expect(mockRecordMovements).not.toHaveBeenCalled();
		expect(tx.vehicle_restock_request.updateMany).toHaveBeenCalledWith({
			where: { id: R1, received_at: null },
			data: {
				received_at:  expect.any(Date),
				qty_received: 5,
				discrepant:   false,
			},
		});
	});

	it("short receipt: vehicle→adjustment audit_correction for the delta", async () => {
		makeTx(makeFulfilled());

		await confirmRestockReceipts(
			"vehicle-1",
			{ items: [{ request_id: R1, qty_received: 3 }] },
			"org-1",
			TECH_CONTEXT,
		);

		const movements = mockRecordMovements.mock.calls[0][3];
		expect(movements).toEqual([
			{
				inventory_item_id:  "inv-1",
				qty:                2,
				from_location_type: "vehicle",
				from_vehicle_id:    "vehicle-1",
				to_location_type:   "adjustment",
				reason:             "audit_correction",
				restock_request_id: R1,
			},
		]);
	});

	it("over receipt: adjustment→vehicle audit_correction for the delta", async () => {
		makeTx(makeFulfilled());

		await confirmRestockReceipts(
			"vehicle-1",
			{ items: [{ request_id: R1, qty_received: 7 }] },
			"org-1",
			TECH_CONTEXT,
		);

		const movements = mockRecordMovements.mock.calls[0][3];
		expect(movements[0]).toMatchObject({
			qty: 2,
			from_location_type: "adjustment",
			to_location_type:   "vehicle",
			to_vehicle_id:      "vehicle-1",
			reason:             "audit_correction",
		});
	});

	it("double-confirm fails per-item without movement", async () => {
		makeTx(makeFulfilled({ received_at: new Date() }));

		const result = await confirmRestockReceipts(
			"vehicle-1",
			{ items: [{ request_id: R1, qty_received: 5 }] },
			"org-1",
			TECH_CONTEXT,
		);

		expect(result.confirmed).toHaveLength(0);
		expect(result.failed).toEqual([{ request_id: R1, error: "Receipt already confirmed" }]);
		expect(mockRecordMovements).not.toHaveBeenCalled();
	});

	it("non-fulfilled request fails per-item", async () => {
		makeTx(makeFulfilled({ status: "pending" }));

		const result = await confirmRestockReceipts(
			"vehicle-1",
			{ items: [{ request_id: R1, qty_received: 5 }] },
			"org-1",
			TECH_CONTEXT,
		);

		expect(result.failed).toEqual([{ request_id: R1, error: "Request is not fulfilled" }]);
	});
});

describe("markRestockReceived", () => {
	beforeEach(() => vi.clearAllMocks());

	it("sets received_at and qty_received = fulfilled qty with no movement", async () => {
		const tx = makeTx(makeFulfilled());

		const result = await markRestockReceived(R1, "org-1", { dispatcherId: "d-1" });

		expect(result.err).toBeUndefined();
		expect(mockRecordMovements).not.toHaveBeenCalled();
		expect(tx.vehicle_restock_request.updateMany).toHaveBeenCalledWith({
			where: { id: R1, received_at: null },
			data: { received_at: expect.any(Date), qty_received: 5 },
		});
	});

	it("rejects already-received requests", async () => {
		makeTx(makeFulfilled({ received_at: new Date() }));

		const result = await markRestockReceived(R1, "org-1", { dispatcherId: "d-1" });

		expect(result.err).toBe("Receipt already confirmed");
	});
});
