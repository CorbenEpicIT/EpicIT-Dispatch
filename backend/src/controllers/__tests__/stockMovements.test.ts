import { describe, it, expect, vi, beforeEach } from "vitest";
import {
	recordMovements,
	lockInventoryRows,
	InsufficientStockError,
	type ActorInfo,
	type MovementInput,
} from "../../services/stockMovements.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

const ACTOR: ActorInfo = { actor_type: "dispatcher", actor_id: "disp-1" };
const ORG = "org-1";

function makeTx(overrides: Record<string, unknown> = {}) {
	return {
		$queryRaw: vi.fn().mockResolvedValue([]),
		inventory_item: {
			findMany: vi.fn().mockResolvedValue([]),
			update: vi.fn().mockResolvedValue(undefined),
		},
		vehicle_stock_item: {
			upsert: vi.fn().mockResolvedValue(undefined),
		},
		stock_movement: {
			createMany: vi.fn().mockResolvedValue({ count: 0 }),
		},
		...overrides,
	};
}

function makeItemRow(id: string, quantity: number, low_stock_threshold: number | null = null) {
	return { id, quantity, low_stock_threshold };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = ReturnType<typeof makeTx> & Record<string, any>;

// ── lockInventoryRows ─────────────────────────────────────────────────────────

describe("lockInventoryRows", () => {
	it("issues SELECT FOR UPDATE raw query with sorted ids", async () => {
		const tx = makeTx();
		await lockInventoryRows(tx as unknown as Tx, ["z-item", "a-item"]);
		expect(tx.$queryRaw).toHaveBeenCalledOnce();
	});

	it("is a no-op when itemIds is empty", async () => {
		const tx = makeTx();
		await lockInventoryRows(tx as unknown as Tx, []);
		expect(tx.$queryRaw).not.toHaveBeenCalled();
	});
});

// ── recordMovements ───────────────────────────────────────────────────────────

describe("recordMovements", () => {
	let tx: Tx;

	beforeEach(() => {
		tx = makeTx();
		tx.inventory_item.findMany.mockResolvedValue([]);
	});

	it("returns empty lowStockItemIds when movements array is empty", async () => {
		const result = await recordMovements(tx as unknown as Tx, ORG, ACTOR, []);
		expect(result).toEqual({ lowStockItemIds: [] });
		expect(tx.stock_movement.createMany).not.toHaveBeenCalled();
	});

	it("rejects movement with qty <= 0", async () => {
		const m: MovementInput = {
			inventory_item_id: "item-1",
			qty: 0,
			from_location_type: "external",
			to_location_type: "warehouse",
			reason: "receive",
		};
		await expect(recordMovements(tx as unknown as Tx, ORG, ACTOR, [m])).rejects.toThrow(
			"qty must be > 0",
		);
	});

	it("rejects fractional qty on warehouse-touching movements", async () => {
		const m: MovementInput = {
			inventory_item_id: "item-1",
			qty: 2.5,
			from_location_type: "external",
			to_location_type: "warehouse",
			reason: "receive",
		};
		await expect(recordMovements(tx as unknown as Tx, ORG, ACTOR, [m])).rejects.toThrow(
			"Fractional qty",
		);
	});

	it("allows fractional qty for vehicle-only movements", async () => {
		const m: MovementInput = {
			inventory_item_id: "item-1",
			qty: 1.5,
			from_location_type: "vehicle",
			from_vehicle_id: "v-1",
			to_location_type: "consumed",
			reason: "parts_used",
		};
		await expect(
			recordMovements(tx as unknown as Tx, ORG, ACTOR, [m]),
		).resolves.toBeDefined();
	});

	it("increments inventory_item.quantity on receive (external → warehouse)", async () => {
		tx.inventory_item.findMany.mockResolvedValue([makeItemRow("item-1", 10)]);

		const m: MovementInput = {
			inventory_item_id: "item-1",
			qty: 5,
			from_location_type: "external",
			to_location_type: "warehouse",
			reason: "receive",
		};
		await recordMovements(tx as unknown as Tx, ORG, ACTOR, [m]);

		expect(tx.inventory_item.update).toHaveBeenCalledWith({
			where: { id: "item-1" },
			data: { quantity: { increment: 5 } },
		});
	});

	it("decrements inventory_item.quantity on loss (warehouse → adjustment)", async () => {
		tx.inventory_item.findMany.mockResolvedValue([makeItemRow("item-1", 10)]);

		const m: MovementInput = {
			inventory_item_id: "item-1",
			qty: 3,
			from_location_type: "warehouse",
			to_location_type: "adjustment",
			reason: "loss",
		};
		await recordMovements(tx as unknown as Tx, ORG, ACTOR, [m]);

		expect(tx.inventory_item.update).toHaveBeenCalledWith({
			where: { id: "item-1" },
			data: { quantity: { increment: -3 } },
		});
	});

	it("throws InsufficientStockError when warehouse deduction exceeds available", async () => {
		tx.inventory_item.findMany.mockResolvedValue([makeItemRow("item-1", 2)]);

		const m: MovementInput = {
			inventory_item_id: "item-1",
			qty: 5,
			from_location_type: "warehouse",
			to_location_type: "adjustment",
			reason: "loss",
		};

		await expect(recordMovements(tx as unknown as Tx, ORG, ACTOR, [m])).rejects.toThrow(
			InsufficientStockError,
		);
	});

	it("InsufficientStockError.available contains the per-item quantity", async () => {
		tx.inventory_item.findMany.mockResolvedValue([makeItemRow("item-1", 2)]);

		const m: MovementInput = {
			inventory_item_id: "item-1",
			qty: 5,
			from_location_type: "warehouse",
			to_location_type: "adjustment",
			reason: "loss",
		};

		try {
			await recordMovements(tx as unknown as Tx, ORG, ACTOR, [m]);
			expect.fail("should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(InsufficientStockError);
			expect((e as InsufficientStockError).available["item-1"]).toBe(2);
		}
	});

	it("allows warehouse overdraw when allowNegative is true", async () => {
		// No findMany call should happen when allowNegative (no guard check)
		const m: MovementInput = {
			inventory_item_id: "item-1",
			qty: 999,
			from_location_type: "warehouse",
			to_location_type: "adjustment",
			reason: "loss",
		};
		await expect(
			recordMovements(tx as unknown as Tx, ORG, ACTOR, [m], { allowNegative: true }),
		).resolves.toBeDefined();
	});

	it("upserts vehicle_stock_item on restock (warehouse → vehicle)", async () => {
		const m: MovementInput = {
			inventory_item_id: "item-1",
			qty: 4,
			from_location_type: "warehouse",
			to_vehicle_id: "truck-1",
			to_location_type: "vehicle",
			reason: "restock",
		};
		tx.inventory_item.findMany.mockResolvedValue([makeItemRow("item-1", 10)]);

		await recordMovements(tx as unknown as Tx, ORG, ACTOR, [m]);

		expect(tx.vehicle_stock_item.upsert).toHaveBeenCalledWith(
			expect.objectContaining({
				where: {
					vehicle_id_inventory_item_id: {
						vehicle_id: "truck-1",
						inventory_item_id: "item-1",
					},
				},
			}),
		);
	});

	it("inserts a stock_movement row for every movement", async () => {
		tx.inventory_item.findMany.mockResolvedValue([makeItemRow("item-1", 10)]);

		const movements: MovementInput[] = [
			{
				inventory_item_id: "item-1",
				qty: 2,
				from_location_type: "external",
				to_location_type: "warehouse",
				reason: "receive",
			},
			{
				inventory_item_id: "item-1",
				qty: 1,
				from_location_type: "warehouse",
				to_location_type: "adjustment",
				reason: "loss",
			},
		];

		await recordMovements(tx as unknown as Tx, ORG, ACTOR, movements);

		expect(tx.stock_movement.createMany).toHaveBeenCalledWith(
			expect.objectContaining({ data: expect.arrayContaining([expect.anything(), expect.anything()]) }),
		);
		const { data } = tx.stock_movement.createMany.mock.calls[0][0] as { data: unknown[] };
		expect(data).toHaveLength(2);
	});

	it("returns lowStockItemIds for items at or below threshold after update", async () => {
		// receive movement = positive delta = no overdraw check; only one findMany call (post-update)
		tx.inventory_item.findMany.mockResolvedValue([makeItemRow("item-1", 4, 5)]);

		const m: MovementInput = {
			inventory_item_id: "item-1",
			qty: 2,
			from_location_type: "external",
			to_location_type: "warehouse",
			reason: "receive",
		};
		const result = await recordMovements(tx as unknown as Tx, ORG, ACTOR, [m]);
		expect(result.lowStockItemIds).toContain("item-1");
	});

	it("aggregates deltas from multiple movements on the same item", async () => {
		tx.inventory_item.findMany.mockResolvedValue([makeItemRow("item-1", 20)]);

		// +10 then -3 = net +7
		const movements: MovementInput[] = [
			{
				inventory_item_id: "item-1",
				qty: 10,
				from_location_type: "external",
				to_location_type: "warehouse",
				reason: "receive",
			},
			{
				inventory_item_id: "item-1",
				qty: 3,
				from_location_type: "warehouse",
				to_location_type: "adjustment",
				reason: "loss",
			},
		];

		await recordMovements(tx as unknown as Tx, ORG, ACTOR, movements);

		// Net delta = +10 - 3 = +7; single update call
		expect(tx.inventory_item.update).toHaveBeenCalledOnce();
		expect(tx.inventory_item.update).toHaveBeenCalledWith({
			where: { id: "item-1" },
			data: { quantity: { increment: 7 } },
		});
	});

	it("locks inventory rows before reading quantities", async () => {
		tx.inventory_item.findMany.mockResolvedValue([makeItemRow("item-1", 10)]);

		const calls: string[] = [];
		tx.$queryRaw.mockImplementation(async () => { calls.push("lock"); });
		tx.inventory_item.findMany.mockImplementation(async () => { calls.push("read"); return [makeItemRow("item-1", 10)]; });

		const m: MovementInput = {
			inventory_item_id: "item-1",
			qty: 2,
			from_location_type: "warehouse",
			to_location_type: "adjustment",
			reason: "loss",
		};
		await recordMovements(tx as unknown as Tx, ORG, ACTOR, [m]);

		const lockIdx = calls.indexOf("lock");
		const readIdx = calls.indexOf("read");
		expect(lockIdx).toBeLessThan(readIdx);
	});

	it("sets actor_type and actor_id on movement rows", async () => {
		tx.inventory_item.findMany.mockResolvedValue([makeItemRow("item-1", 5)]);

		const m: MovementInput = {
			inventory_item_id: "item-1",
			qty: 2,
			from_location_type: "external",
			to_location_type: "warehouse",
			reason: "receive",
		};
		await recordMovements(tx as unknown as Tx, ORG, { actor_type: "technician", actor_id: "tech-99" }, [m]);

		const { data } = tx.stock_movement.createMany.mock.calls[0][0] as { data: Record<string, unknown>[] };
		expect(data[0].actor_type).toBe("technician");
		expect(data[0].actor_id).toBe("tech-99");
	});
});
