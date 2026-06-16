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

import {
	listRestockRequests,
	fulfillRestockRequest,
	dismissRestockRequest,
	createRestockRequest,
	fulfillRestockRequestsBulk,
} from "../vehiclesController.js";
import { db } from "../../db.js";
import { getScopedDb } from "../../lib/context.js";
import { recordMovements, InsufficientStockError } from "../../services/stockMovements.js";

const mockDb = vi.mocked(db, true);
const mockRecordMovements = vi.mocked(recordMovements);

const CONTEXT = { dispatcherId: "dispatcher-1" };

function makeRequest(overrides: Record<string, unknown> = {}) {
	return {
		id: "req-1",
		stock_item_id: "stock-1",
		technician_id: "tech-1",
		qty_requested: 5,
		note: null,
		status: "pending",
		created_at: new Date(),
		fulfilled_at: null,
		stock_item: {
			id: "stock-1",
			vehicle_id: "vehicle-1",
			inventory_item_id: "inv-1",
		},
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
				.mockResolvedValue(request ? { ...request, status: "fulfilled" } : null),
			updateMany: vi
				.fn()
				.mockResolvedValue({ count: request && request.status === "pending" ? 1 : 0 }),
		},
	};
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	mockDb.$transaction.mockImplementation(async (fn: any) => fn(tx));
	return tx;
}

describe("listRestockRequests", () => {
	beforeEach(() => vi.clearAllMocks());

	it("scopes by org through stock_item.vehicle and merges technician names", async () => {
		mockDb.vehicle_restock_request.findMany.mockResolvedValue([makeRequest()] as never);
		mockDb.technician.findMany.mockResolvedValue([{ id: "tech-1", name: "Bob" }] as never);

		const result = await listRestockRequests("org-1", "pending");

		expect(result.err).toBeUndefined();
		const where = mockDb.vehicle_restock_request.findMany.mock.calls[0][0]!.where;
		expect(where).toEqual({
			status: "pending",
			stock_item: { vehicle: { organization_id: "org-1" } },
		});
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		expect((result.requests![0] as any).technician).toEqual({ id: "tech-1", name: "Bob" });
	});

	it("filters by vehicle when vehicleId provided", async () => {
		mockDb.vehicle_restock_request.findMany.mockResolvedValue([] as never);

		await listRestockRequests("org-1", undefined, "vehicle-9");

		const where = mockDb.vehicle_restock_request.findMany.mock.calls[0][0]!.where;
		expect(where.stock_item.vehicle).toEqual({ organization_id: "org-1", id: "vehicle-9" });
	});
});

describe("fulfillRestockRequest", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRecordMovements.mockResolvedValue({ lowStockItemIds: [] });
	});

	it("emits a warehouse→vehicle restock movement linked to the request", async () => {
		const tx = makeTx(makeRequest());

		const result = await fulfillRestockRequest("req-1", {}, "org-1", CONTEXT);

		expect(result.err).toBeUndefined();
		const movements = mockRecordMovements.mock.calls[0][3];
		expect(movements).toEqual([
			{
				inventory_item_id: "inv-1",
				qty: 5,
				from_location_type: "warehouse",
				to_location_type: "vehicle",
				to_vehicle_id: "vehicle-1",
				reason: "restock",
				restock_request_id: "req-1",
			},
		]);
		expect(tx.vehicle_restock_request.updateMany).toHaveBeenCalledWith({
			where: { id: "req-1", status: "pending" },
			data: { status: "fulfilled", fulfilled_at: expect.any(Date) },
		});
	});

	it("uses explicit qty over qty_requested", async () => {
		makeTx(makeRequest({ qty_requested: 5 }));

		await fulfillRestockRequest("req-1", { qty: 3 }, "org-1", CONTEXT);

		expect(mockRecordMovements.mock.calls[0][3][0].qty).toBe(3);
	});

	it("errors when neither qty nor qty_requested available", async () => {
		makeTx(makeRequest({ qty_requested: null }));

		const result = await fulfillRestockRequest("req-1", {}, "org-1", CONTEXT);

		expect(result.err).toBe("Quantity required to fulfill");
		expect(mockRecordMovements).not.toHaveBeenCalled();
	});

	it("surfaces insufficient warehouse stock with availability", async () => {
		makeTx(makeRequest());
		mockRecordMovements.mockRejectedValue(new InsufficientStockError({ "inv-1": 2 }));

		const result = await fulfillRestockRequest("req-1", {}, "org-1", CONTEXT);

		expect(result.err).toBe("insufficient_warehouse_stock");
		expect(result.available).toEqual({ "inv-1": 2 });
	});

	it("409-style error when the request is not pending", async () => {
		makeTx(makeRequest({ status: "fulfilled" }));

		const result = await fulfillRestockRequest("req-1", {}, "org-1", CONTEXT);

		expect(result.err).toBe("Request is already fulfilled");
		expect(mockRecordMovements).not.toHaveBeenCalled();
	});

	it("not-found error when the request is missing or out of org", async () => {
		makeTx(null);

		const result = await fulfillRestockRequest("req-1", {}, "org-1", CONTEXT);

		expect(result.err).toBe("Restock request not found");
	});

	it("records no movement when the guarded update loses the race", async () => {
		const tx = makeTx(makeRequest());
		tx.vehicle_restock_request.updateMany.mockResolvedValue({ count: 0 });

		const result = await fulfillRestockRequest("req-1", {}, "org-1", CONTEXT);

		expect(result.err).toBe("Request is already fulfilled or dismissed");
		expect(mockRecordMovements).not.toHaveBeenCalled();
	});
});

describe("dismissRestockRequest", () => {
	beforeEach(() => vi.clearAllMocks());

	it("dismisses a pending request via guarded update with dispatch reason", async () => {
		mockDb.vehicle_restock_request.updateMany.mockResolvedValue({ count: 1 } as never);
		mockDb.vehicle_restock_request.findFirst.mockResolvedValue(
			makeRequest({ status: "dismissed", dismissed_reason: "dispatch" }) as never,
		);

		const result = await dismissRestockRequest("req-1", "org-1", CONTEXT);

		expect(result.err).toBeUndefined();
		expect(mockDb.vehicle_restock_request.updateMany).toHaveBeenCalledWith({
			where: {
				id: "req-1",
				status: "pending",
				stock_item: { vehicle: { organization_id: "org-1" } },
			},
			data: { status: "dismissed", dismissed_reason: "dispatch" },
		});
	});

	it("rejects dismissing a non-pending request", async () => {
		mockDb.vehicle_restock_request.updateMany.mockResolvedValue({ count: 0 } as never);
		mockDb.vehicle_restock_request.findFirst.mockResolvedValue(
			makeRequest({ status: "dismissed" }) as never,
		);

		const result = await dismissRestockRequest("req-1", "org-1", CONTEXT);

		expect(result.err).toBe("Request is already dismissed");
	});

	it("not-found when the request is missing or out of org", async () => {
		mockDb.vehicle_restock_request.updateMany.mockResolvedValue({ count: 0 } as never);
		mockDb.vehicle_restock_request.findFirst.mockResolvedValue(null as never);

		const result = await dismissRestockRequest("req-1", "org-1", CONTEXT);

		expect(result.err).toBe("Restock request not found");
	});
});

describe("fulfillRestockRequestsBulk", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRecordMovements.mockResolvedValue({ lowStockItemIds: [] });
	});

	const R1 = "11111111-1111-8111-8111-111111111111";
	const R2 = "22222222-2222-8222-8222-222222222222";

	// makeTx's findFirst is once-pending-then-fulfilled, which is wrong for multi-item
	// bulk runs — both items must read as pending at their own tx start
	function makeBulkTx() {
		const tx = {
			vehicle_restock_request: {
				findFirst: vi.fn().mockResolvedValue(makeRequest({ id: R1 })),
				updateMany: vi.fn().mockResolvedValue({ count: 1 }),
			},
		};
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		mockDb.$transaction.mockImplementation(async (fn: any) => fn(tx));
		return tx;
	}

	it("best-effort: failures stay in failed[], successes in fulfilled[]", async () => {
		// First item fulfills; second hits insufficient stock
		const tx = makeBulkTx();
		mockRecordMovements
			.mockResolvedValueOnce({ lowStockItemIds: ["inv-1"] })
			.mockRejectedValueOnce(new InsufficientStockError({ "inv-1": 2 }));

		const result = await fulfillRestockRequestsBulk(
			{ items: [{ request_id: R1, qty: 5 }, { request_id: R2, qty: 3 }] },
			"org-1",
			CONTEXT,
		);

		expect(result.err).toBeUndefined();
		expect(result.fulfilled).toHaveLength(1);
		expect(result.failed).toEqual([
			{ request_id: R2, error: "insufficient_warehouse_stock", available: { "inv-1": 2 } },
		]);
		expect(tx.vehicle_restock_request.updateMany).toHaveBeenCalledTimes(2);
	});

	it("fires low stock alerts once for the whole batch", async () => {
		makeBulkTx();
		mockRecordMovements.mockResolvedValue({ lowStockItemIds: ["inv-1"] });
		const { fireLowStockAlerts } = await import("../../services/lowStockAlerts.js");

		await fulfillRestockRequestsBulk(
			{ items: [{ request_id: R1, qty: 5 }, { request_id: R2, qty: 3 }] },
			"org-1",
			CONTEXT,
		);

		expect(vi.mocked(fireLowStockAlerts)).toHaveBeenCalledTimes(1);
		expect(vi.mocked(fireLowStockAlerts)).toHaveBeenCalledWith(["inv-1"], "org-1");
	});
});

describe("createRestockRequest", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(getScopedDb).mockReturnValue(db as never);
	});

	const TECH_CONTEXT = { techId: "tech-1" };

	it("rejects non-technician callers", async () => {
		const result = await createRestockRequest("vehicle-1", "stock-1", {}, "org-1", {
			dispatcherId: "dispatcher-1",
		});
		expect(result.err).toBe("Only technicians can perform this action");
	});

	it("rejects technicians not assigned to the vehicle", async () => {
		mockDb.technician.findFirst.mockResolvedValue({ current_vehicle_id: "other-vehicle" } as never);
		const result = await createRestockRequest("vehicle-1", "stock-1", {}, "org-1", TECH_CONTEXT);
		expect(result.err).toBe("Technician is not assigned to this vehicle");
	});

	it("rejects duplicate pending requests for the same stock item", async () => {
		mockDb.technician.findFirst.mockResolvedValue({ current_vehicle_id: "vehicle-1" } as never);
		mockDb.vehicle_stock_item.findFirst.mockResolvedValue({ id: "stock-1" } as never);
		mockDb.vehicle_restock_request.findFirst.mockResolvedValue(makeRequest() as never);

		const result = await createRestockRequest("vehicle-1", "stock-1", {}, "org-1", TECH_CONTEXT);

		expect(result.err).toBe("Restock already requested for this item");
		expect(mockDb.vehicle_restock_request.create).not.toHaveBeenCalled();
	});

	it("creates a pending request for an assigned technician", async () => {
		mockDb.technician.findFirst.mockResolvedValue({ current_vehicle_id: "vehicle-1" } as never);
		mockDb.vehicle_stock_item.findFirst.mockResolvedValue({ id: "stock-1" } as never);
		mockDb.vehicle_restock_request.findFirst.mockResolvedValue(null as never);
		mockDb.vehicle_restock_request.create.mockResolvedValue(makeRequest() as never);

		const result = await createRestockRequest(
			"vehicle-1",
			"stock-1",
			{ qty_requested: 5 },
			"org-1",
			TECH_CONTEXT,
		);

		expect(result.err).toBe("");
		expect(mockDb.vehicle_restock_request.create).toHaveBeenCalledWith({
			data: {
				stock_item_id: "stock-1",
				technician_id: "tech-1",
				qty_requested: 5,
				note:          null,
				status:        "pending",
			},
		});
	});
});
