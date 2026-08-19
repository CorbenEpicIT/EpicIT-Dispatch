import { describe, it, expect, vi, beforeEach } from "vitest";

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
		recordMovements: vi.fn(),
		lockInventoryRows: vi.fn(),
	};
});

vi.mock("../../services/lowStockAlerts.js", () => ({
	fireLowStockAlerts: vi.fn().mockResolvedValue(undefined),
	sendLowStockAlert: vi.fn().mockResolvedValue(undefined),
}));

import { getUsageToday } from "../vehiclesController.js";
import { getScopedDb } from "../../lib/context.js";

const mockGetScopedDb = vi.mocked(getScopedDb);

const VEHICLE_ID = "eeeeeeee-eeee-4eee-aeee-eeeeeeeeeeee";
const ORG_ID = "org-1";
const SINCE = new Date("2026-08-19T06:00:00.000Z");

type MovementRow = {
	id: string;
	reason: "parts_used" | "reversal" | "direct_consumption";
	qty: number;
	visit_id: string | null;
	inventory_item: { name: string };
	visit: { id: string; scheduled_start_at: Date | null; job: { name: string } } | null;
};

const movement = (overrides: Partial<MovementRow> & { id: string }): MovementRow => ({
	reason: "parts_used",
	qty: 1,
	visit_id: "visit-1",
	inventory_item: { name: "Capacitor" },
	visit: { id: "visit-1", scheduled_start_at: new Date("2026-08-19T13:00:00.000Z"), job: { name: "Rooftop swap" } },
	...overrides,
});

function makeSdb(movements: MovementRow[]) {
	const sdb = {
		vehicle: { findFirst: vi.fn().mockResolvedValue({ id: VEHICLE_ID, created_at: SINCE }) },
		vehicle_restock_record: { findFirst: vi.fn().mockResolvedValue(null) },
		vehicle_stock_usage: { findMany: vi.fn().mockResolvedValue([]) },
		stock_movement: { findMany: vi.fn().mockResolvedValue(movements) },
	};
	mockGetScopedDb.mockReturnValue(sdb as unknown as ReturnType<typeof getScopedDb>);
	return sdb;
}

describe("getUsageToday — reversal netting", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("queries reversals back onto this vehicle alongside parts_used", async () => {
		const sdb = makeSdb([]);

		await getUsageToday(VEHICLE_ID, ORG_ID);

		const where = sdb.stock_movement.findMany.mock.calls[0][0].where as { OR: unknown[] };
		expect(where.OR).toEqual(
			expect.arrayContaining([
				{ from_vehicle_id: VEHICLE_ID, reason: "parts_used" },
				{ to_vehicle_id: VEHICLE_ID, reason: "reversal", from_location_type: "consumed" },
			]),
		);
	});

	it("nets a reversal against the parts_used it cancels, per visit + item", async () => {
		makeSdb([
			movement({ id: "m1", reason: "parts_used", qty: 3 }),
			movement({ id: "m2", reason: "reversal", qty: 1 }),
			movement({ id: "m3", reason: "parts_used", qty: 2, inventory_item: { name: "Contactor" } }),
		]);

		const result = await getUsageToday(VEHICLE_ID, ORG_ID);

		expect(result.data).toEqual([
			{
				visitId: "visit-1",
				visitName: "Rooftop swap",
				scheduledAt: "2026-08-19T13:00:00.000Z",
				items: [
					{ itemName: "Capacitor", qtyUsed: 2 },
					{ itemName: "Contactor", qtyUsed: 2 },
				],
			},
		]);
	});

	it("drops an item that was fully reversed, and a visit left with no items", async () => {
		makeSdb([
			movement({ id: "m1", reason: "parts_used", qty: 3 }),
			movement({ id: "m2", reason: "reversal", qty: 3 }),
			movement({
				id: "m3",
				reason: "parts_used",
				qty: 1,
				visit_id: "visit-2",
				visit: { id: "visit-2", scheduled_start_at: null, job: { name: "Furnace tune-up" } },
			}),
		]);

		const result = await getUsageToday(VEHICLE_ID, ORG_ID);

		expect(result.data).toEqual([
			{ visitId: "visit-2", visitName: "Furnace tune-up", scheduledAt: null, items: [{ itemName: "Capacitor", qtyUsed: 1 }] },
		]);
	});

	it("merges repeated uses of one item on one visit into a single line", async () => {
		makeSdb([
			movement({ id: "m1", qty: 1.5 }),
			movement({ id: "m2", qty: 0.25 }),
		]);

		const result = await getUsageToday(VEHICLE_ID, ORG_ID);

		expect(result.data![0].items).toEqual([{ itemName: "Capacitor", qtyUsed: 1.75 }]);
	});

	it("returns not found for a foreign vehicle", async () => {
		const sdb = makeSdb([]);
		sdb.vehicle.findFirst.mockResolvedValue(null);

		const result = await getUsageToday(VEHICLE_ID, ORG_ID);

		expect(result.err).toBe("Vehicle not found");
		expect(sdb.stock_movement.findMany).not.toHaveBeenCalled();
	});
});
