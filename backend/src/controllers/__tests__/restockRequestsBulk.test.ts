import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../db.js", () => {
	const $extends = vi.fn();
	const mockDb = {
		vehicle_restock_request: {
			findMany: vi.fn(),
			createManyAndReturn: vi.fn(),
		},
		vehicle_stock_item: { findMany: vi.fn() },
		technician: { findFirst: vi.fn() },
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

import { createRestockRequestsBulk, listVehicleRestockRequests } from "../vehiclesController.js";
import { db } from "../../db.js";

const mockDb = vi.mocked(db, true);
const TECH_CONTEXT = { techId: "tech-1" };

function makeTx() {
	const tx = {
		vehicle_stock_item: { findMany: vi.fn() },
		vehicle_restock_request: { findMany: vi.fn(), createManyAndReturn: vi.fn() },
	};
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	mockDb.$transaction.mockImplementation(async (fn: any) => fn(tx));
	return tx;
}

describe("createRestockRequestsBulk", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockDb.technician.findFirst.mockResolvedValue({ current_vehicle_id: "vehicle-1" } as never);
	});

	it("rejects non-technician callers", async () => {
		const result = await createRestockRequestsBulk(
			"vehicle-1",
			{ items: [{ stock_item_id: "11111111-1111-1111-8111-111111111111" }] },
			"org-1",
			{ dispatcherId: "d-1" },
		);
		expect(result.err).toBe("Only technicians can perform this action");
	});

	it("rejects technicians not assigned to the vehicle", async () => {
		mockDb.technician.findFirst.mockResolvedValue({ current_vehicle_id: "other-vehicle" } as never);
		const result = await createRestockRequestsBulk(
			"vehicle-1",
			{ items: [{ stock_item_id: "11111111-1111-8111-8111-111111111111" }] },
			"org-1",
			TECH_CONTEXT,
		);
		expect(result.err).toBe("Technician is not assigned to this vehicle");
	});

	it("creates rows and skips not-found and already-pending items", async () => {
		const A = "11111111-1111-1111-8111-111111111111";
		const B = "22222222-2222-2222-8222-222222222222";
		const C = "33333333-3333-3333-8333-333333333333";
		const tx = makeTx();
		tx.vehicle_stock_item.findMany.mockResolvedValue([{ id: A }, { id: B }]);
		tx.vehicle_restock_request.findMany.mockResolvedValue([{ stock_item_id: B }]);
		tx.vehicle_restock_request.createManyAndReturn.mockResolvedValue([
			{ id: "req-a", stock_item_id: A },
		]);

		const result = await createRestockRequestsBulk(
			"vehicle-1",
			{
				items: [
					{ stock_item_id: A, qty_requested: 5, note: "low" },
					{ stock_item_id: B },
					{ stock_item_id: C },
				],
			},
			"org-1",
			TECH_CONTEXT,
		);

		expect(result.err).toBe("");
		expect(result.created).toHaveLength(1);
		expect(result.skipped).toEqual([
			{ stock_item_id: B, reason: "already_pending" },
			{ stock_item_id: C, reason: "not_found" },
		]);
		expect(tx.vehicle_restock_request.createManyAndReturn).toHaveBeenCalledWith({
			data: [
				{
					organization_id: "org-1",
					stock_item_id: A,
					technician_id: "tech-1",
					qty_requested: 5,
					note:          "low",
					status:        "pending",
				},
			],
		});
	});

	it("rejects duplicate stock_item_id entries in the payload", async () => {
		const A = "11111111-1111-1111-8111-111111111111";
		const result = await createRestockRequestsBulk(
			"vehicle-1",
			{ items: [{ stock_item_id: A }, { stock_item_id: A }] },
			"org-1",
			TECH_CONTEXT,
		);
		expect(result.err).toContain("Duplicate");
	});
});

describe("listVehicleRestockRequests", () => {
	beforeEach(() => vi.clearAllMocks());

	it("rejects technicians not assigned to the vehicle", async () => {
		mockDb.technician.findFirst.mockResolvedValue({ current_vehicle_id: "other" } as never);
		const result = await listVehicleRestockRequests("vehicle-1", "org-1", { techId: "tech-1" });
		expect(result.err).toBe("Technician is not assigned to this vehicle");
	});

	it("returns pending, unreceived, and recently resolved requests", async () => {
		mockDb.technician.findFirst.mockResolvedValue({ current_vehicle_id: "vehicle-1" } as never);
		const createdAt = new Date("2026-07-18T12:00:00.000Z");
		mockDb.vehicle_restock_request.findMany.mockResolvedValue([
			{
				id: "r1",
				status: "pending",
				qty_requested: 5,
				created_at: createdAt,
				acknowledged_at: null,
				resolved_at: null,
				stock_item: {
					id: "si-1",
					qty_on_hand: 2,
					qty_min: 1,
					qty_standard: 5,
					inventory_item: { id: "inv-1", name: "Filter", unit: "ea", quantity: 10 },
				},
			},
			{
				id: "r2",
				status: "acknowledged",
				qty_requested: 3,
				created_at: createdAt,
				acknowledged_at: createdAt,
				resolved_at: null,
				stock_item: {
					id: "si-2",
					qty_on_hand: 0,
					qty_min: 1,
					qty_standard: null,
					inventory_item: { id: "inv-2", name: "Belt", unit: "ea", quantity: 4 },
				},
			},
		] as never);

		const result = await listVehicleRestockRequests("vehicle-1", "org-1", { techId: "tech-1" });

		expect(result.err).toBeUndefined();
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const reqs = result.requests as any[];
		expect(reqs[0].id).toBe("r1");
		expect(reqs[0].created_at).toBe(createdAt.toISOString());
		expect(reqs[0].stock_item.qty_on_hand).toBe(2);
		expect(reqs[1].acknowledged_at).toBe(createdAt.toISOString());
		const where = mockDb.vehicle_restock_request.findMany.mock.calls[0][0]!.where;
		expect(where.stock_item.vehicle).toEqual({ id: "vehicle-1", organization_id: "org-1" });
		expect(where.OR).toHaveLength(4);
	});

	it("allows dispatcher callers without vehicle assignment", async () => {
		mockDb.vehicle_restock_request.findMany.mockResolvedValue([] as never);
		const result = await listVehicleRestockRequests("vehicle-1", "org-1", { dispatcherId: "d-1" });
		expect(result.err).toBeUndefined();
		expect(mockDb.technician.findFirst).not.toHaveBeenCalled();
	});
});
