import { describe, it, expect, vi, beforeEach } from "vitest";
import {
	recordMovements,
	lockInventoryRows,
	InsufficientStockError,
	TrackingValidationError,
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
			findMany: vi.fn().mockResolvedValue([]),
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
		expect(result).toEqual({ lowStockItemIds: [], gapItemIds: [], movementIds: [] });
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

// ── recordMovements: serial + batch tracking (Phase 5) ─────────────────────────

function makeTrackedTx(over: Record<string, unknown> = {}) {
	return {
		...makeTx(),
		inventory_item: {
			findMany: vi.fn().mockResolvedValue([]),
			update: vi.fn().mockResolvedValue(undefined),
		},
		vehicle_stock_item: {
			upsert: vi.fn().mockResolvedValue(undefined),
			findMany: vi.fn().mockResolvedValue([]),
		},
		stock_movement: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
		stock_movement_serial: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
		stock_movement_batch: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
		serial_unit: {
			create: vi.fn().mockResolvedValue({ id: "u-x", batch_id: null }),
			createMany: vi.fn().mockResolvedValue({ count: 0 }),
			findMany: vi.fn().mockResolvedValue([]),
			update: vi.fn().mockResolvedValue(undefined),
			updateMany: vi.fn().mockResolvedValue({ count: 0 }),
		},
		stock_batch: {
			findFirst: vi.fn().mockResolvedValue({ qty_in_warehouse: 0 }),
			findMany: vi.fn().mockResolvedValue([]),
			update: vi.fn().mockResolvedValue(undefined),
			create: vi.fn().mockResolvedValue({ id: "b-x", code: "LOT-X" }),
		},
		vehicle_stock_batch: {
			findFirst: vi.fn().mockResolvedValue(null),
			findMany: vi.fn().mockResolvedValue([]),
			upsert: vi.fn().mockResolvedValue(undefined),
			update: vi.fn().mockResolvedValue(undefined),
			create: vi.fn().mockResolvedValue(undefined),
		},
		job_visit: { findUnique: vi.fn().mockResolvedValue({ job: { client_id: "cli-1" } }) },
		$queryRaw: vi.fn().mockResolvedValue([]),
		...over,
	};
}

function serializedRow(id: string, quantity = 100) {
	return { id, quantity, low_stock_threshold: null, is_serialized: true, is_batch_tracked: false };
}
function batchRow(id: string, quantity = 100) {
	return { id, quantity, low_stock_threshold: null, is_serialized: false, is_batch_tracked: true };
}

describe("recordMovements — serial tracking", () => {
	it("creates serial units + join rows on a serialized receive", async () => {
		const tx = makeTrackedTx();
		tx.inventory_item.findMany.mockResolvedValue([serializedRow("s1")]);

		const m: MovementInput = {
			inventory_item_id: "s1",
			qty: 2,
			from_location_type: "external",
			to_location_type: "warehouse",
			reason: "receive",
			serial: { create: [{ serial_number: "SN-A" }, { serial_number: "SN-B" }] },
		};
		await recordMovements(tx as unknown as Tx, ORG, ACTOR, [m]);

		// Batched into a single createMany with pre-generated ids (no per-row create).
		expect(tx.serial_unit.create).not.toHaveBeenCalled();
		expect(tx.serial_unit.createMany).toHaveBeenCalledTimes(1);
		const { data } = tx.serial_unit.createMany.mock.calls[0][0] as {
			data: { id: string; serial_number: string }[];
		};
		expect(data).toHaveLength(2);
		expect(data.map((d) => d.serial_number)).toEqual(["SN-A", "SN-B"]);
		expect(new Set(data.map((d) => d.id)).size).toBe(2); // ids pre-generated + unique

		const joins = tx.stock_movement_serial.createMany.mock.calls[0][0] as { data: unknown[] };
		expect(joins.data).toHaveLength(2);
	});

	it("rejects serial count that does not equal qty", async () => {
		const tx = makeTrackedTx();
		tx.inventory_item.findMany.mockResolvedValue([serializedRow("s1")]);
		const m: MovementInput = {
			inventory_item_id: "s1",
			qty: 2,
			from_location_type: "external",
			to_location_type: "warehouse",
			reason: "receive",
			serial: { create: [{ serial_number: "SN-A" }] },
		};
		await expect(recordMovements(tx as unknown as Tx, ORG, ACTOR, [m])).rejects.toThrow(
			"must equal qty",
		);
	});

	it("throws when a serialized item moves with no serial inputs", async () => {
		const tx = makeTrackedTx();
		tx.inventory_item.findMany.mockResolvedValue([serializedRow("s1")]);
		const m: MovementInput = {
			inventory_item_id: "s1",
			qty: 1,
			from_location_type: "vehicle",
			from_vehicle_id: "v1",
			to_location_type: "consumed",
			reason: "parts_used",
		};
		await expect(recordMovements(tx as unknown as Tx, ORG, ACTOR, [m])).rejects.toThrow(
			"requires serial units",
		);
	});

	it("allowUntracked lets a serialized movement through with a TRACKING_GAP note", async () => {
		const tx = makeTrackedTx();
		tx.inventory_item.findMany.mockResolvedValue([serializedRow("s1")]);
		const m: MovementInput = {
			inventory_item_id: "s1",
			qty: 1,
			from_location_type: "vehicle",
			from_vehicle_id: "v1",
			to_location_type: "consumed",
			reason: "parts_used",
		};
		const result = await recordMovements(tx as unknown as Tx, ORG, ACTOR, [m], {
			allowUntracked: true,
		});
		expect(result.gapItemIds).toContain("s1");
		const { data } = tx.stock_movement.createMany.mock.calls[0][0] as { data: Record<string, unknown>[] };
		expect(String(data[0].note)).toContain("[TRACKING_GAP]");
		expect(tx.serial_unit.create).not.toHaveBeenCalled();
		expect(tx.serial_unit.createMany).not.toHaveBeenCalled();
	});

	it("transitions an existing on_vehicle unit to consumed with client snapshot", async () => {
		const tx = makeTrackedTx();
		tx.inventory_item.findMany.mockResolvedValue([serializedRow("s1")]);
		tx.serial_unit.findMany.mockResolvedValue([
			{ id: "u1", status: "on_vehicle", current_vehicle_id: "v1", batch_id: null },
		]);
		const m: MovementInput = {
			inventory_item_id: "s1",
			qty: 1,
			from_location_type: "vehicle",
			from_vehicle_id: "v1",
			to_location_type: "consumed",
			reason: "parts_used",
			visit_id: "visit-1",
			serial: { unit_ids: ["u1"] },
		};
		await recordMovements(tx as unknown as Tx, ORG, ACTOR, [m]);

		// Transitions are collapsed into a single updateMany (no per-row update).
		expect(tx.serial_unit.update).not.toHaveBeenCalled();
		expect(tx.serial_unit.updateMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { id: { in: ["u1"] } },
				data: expect.objectContaining({ status: "consumed", client_id: "cli-1" }),
			}),
		);
	});

	it("rejects consuming a unit whose current status does not match the source", async () => {
		const tx = makeTrackedTx();
		tx.inventory_item.findMany.mockResolvedValue([serializedRow("s1")]);
		tx.serial_unit.findMany.mockResolvedValue([
			{ id: "u1", status: "in_warehouse", current_vehicle_id: null, batch_id: null },
		]);
		const m: MovementInput = {
			inventory_item_id: "s1",
			qty: 1,
			from_location_type: "vehicle",
			from_vehicle_id: "v1",
			to_location_type: "consumed",
			reason: "parts_used",
			serial: { unit_ids: ["u1"] },
		};
		await expect(recordMovements(tx as unknown as Tx, ORG, ACTOR, [m])).rejects.toThrow(
			"expected on_vehicle",
		);
	});

	it("rejects serial inputs on a non-serialized item", async () => {
		const tx = makeTrackedTx();
		tx.inventory_item.findMany.mockResolvedValue([
			{ id: "p1", quantity: 100, low_stock_threshold: null, is_serialized: false, is_batch_tracked: false },
		]);
		const m: MovementInput = {
			inventory_item_id: "p1",
			qty: 1,
			from_location_type: "external",
			to_location_type: "warehouse",
			reason: "receive",
			serial: { create: [{ serial_number: "SN-A" }] },
		};
		await expect(recordMovements(tx as unknown as Tx, ORG, ACTOR, [m])).rejects.toThrow(
			"non-serialized item",
		);
	});
});

describe("recordMovements — batch tracking", () => {
	it("increments batch warehouse + received qty on a batch receive", async () => {
		const tx = makeTrackedTx();
		tx.inventory_item.findMany.mockResolvedValue([batchRow("b1")]);
		tx.stock_batch.findFirst.mockResolvedValue({
			code: "LOT-1",
			inventory_item_id: "b1",
			recalled_at: null,
			qty_in_warehouse: 0,
		});

		const m: MovementInput = {
			inventory_item_id: "b1",
			qty: 5,
			from_location_type: "external",
			to_location_type: "warehouse",
			reason: "receive",
			batch_allocations: [{ batch_id: "batch-1", qty: 5 }],
		};
		await recordMovements(tx as unknown as Tx, ORG, ACTOR, [m]);

		expect(tx.stock_batch.update).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { id: "batch-1" },
				data: expect.objectContaining({
					qty_in_warehouse: { increment: expect.anything() },
					qty_received: { increment: expect.anything() },
				}),
			}),
		);
		const joins = tx.stock_movement_batch.createMany.mock.calls[0][0] as { data: unknown[] };
		expect(joins.data).toHaveLength(1);
	});

	it("FIFO auto-allocates a warehouse deduction with no explicit picks", async () => {
		const tx = makeTrackedTx();
		tx.inventory_item.findMany.mockResolvedValue([batchRow("b1")]);
		// collectLockTargets candidate scan + FIFO scan both use findMany
		tx.stock_batch.findMany.mockResolvedValue([{ id: "batch-1", qty_in_warehouse: 10 }]);
		tx.stock_batch.findFirst.mockResolvedValue({
			code: "LOT-1",
			inventory_item_id: "b1",
			recalled_at: null,
			qty_in_warehouse: 10,
		});

		const m: MovementInput = {
			inventory_item_id: "b1",
			qty: 3,
			from_location_type: "warehouse",
			to_location_type: "adjustment",
			reason: "loss",
		};
		await recordMovements(tx as unknown as Tx, ORG, ACTOR, [m]);

		expect(tx.stock_batch.update).toHaveBeenCalledWith(
			expect.objectContaining({ where: { id: "batch-1" } }),
		);
		const joins = tx.stock_movement_batch.createMany.mock.calls[0][0] as { data: { qty: unknown }[] };
		expect(joins.data).toHaveLength(1);
		expect(Number(joins.data[0].qty)).toBe(3);
	});

	it("rejects a batch receive that names no batch", async () => {
		const tx = makeTrackedTx();
		tx.inventory_item.findMany.mockResolvedValue([batchRow("b1")]);
		const m: MovementInput = {
			inventory_item_id: "b1",
			qty: 5,
			from_location_type: "external",
			to_location_type: "warehouse",
			reason: "receive",
		};
		await expect(recordMovements(tx as unknown as Tx, ORG, ACTOR, [m])).rejects.toThrow(
			"must name a batch",
		);
	});

	// ── Explicit-pick validation gaps (audit 2026-07-14, phase 0) ────────────────
	//
	// autoAllocateFifo (the no-explicit-picks path) already scopes candidate batches
	// to `inventory_item_id` and `recalled_at: null`. applyBatchAllocations — the
	// path every explicit batch_allocations pick goes through — validates neither.
	// These tests pin the intended behavior; they fail today because the seam is
	// unguarded (findFirst({ where: { id: a.batch_id } }) only, at
	// inventoryTracking.ts:438).

	it("rejects an explicit batch pick naming a recalled lot", async () => {
		const tx = makeTrackedTx();
		tx.inventory_item.findMany.mockResolvedValue([batchRow("b1")]);
		tx.stock_batch.findFirst.mockResolvedValue({
			qty_in_warehouse: 10,
			recalled_at: new Date("2026-07-02"),
			inventory_item_id: "b1",
		});

		const m: MovementInput = {
			inventory_item_id: "b1",
			qty: 3,
			from_location_type: "warehouse",
			to_location_type: "vehicle",
			to_vehicle_id: "v1",
			reason: "restock",
			batch_allocations: [{ batch_id: "batch-recalled", qty: 3 }],
		};

		await expect(recordMovements(tx as unknown as Tx, ORG, ACTOR, [m])).rejects.toBeInstanceOf(
			TrackingValidationError,
		);
	});

	it("rejects an explicit batch pick naming a lot that belongs to a different inventory item", async () => {
		const tx = makeTrackedTx();
		tx.inventory_item.findMany.mockResolvedValue([batchRow("b1")]);
		tx.stock_batch.findFirst.mockResolvedValue({
			qty_in_warehouse: 10,
			recalled_at: null,
			inventory_item_id: "some-other-item",
		});

		const m: MovementInput = {
			inventory_item_id: "b1",
			qty: 3,
			from_location_type: "warehouse",
			to_location_type: "vehicle",
			to_vehicle_id: "v1",
			reason: "restock",
			batch_allocations: [{ batch_id: "batch-cross-item", qty: 3 }],
		};

		await expect(recordMovements(tx as unknown as Tx, ORG, ACTOR, [m])).rejects.toBeInstanceOf(
			TrackingValidationError,
		);
	});
});
