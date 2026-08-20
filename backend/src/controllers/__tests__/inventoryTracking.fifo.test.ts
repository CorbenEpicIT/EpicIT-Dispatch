import { describe, it, expect, vi } from "vitest";
import { Prisma } from "../../../generated/prisma/client.js";
import {
	recordMovements,
	TrackingValidationError,
	type MovementInput,
} from "../../services/stockMovements.js";

/**
 * Vehicle-side FIFO auto-allocation + shortfall sink for batch-tracked items.
 *
 * The fake transaction below HONOURS the Prisma `where` shapes the service
 * issues (vehicle_id, qty_on_hand.gt, batch.recalled_at, batch.inventory_item_id),
 * so these tests prove what Postgres would return — a blanket mock that hands
 * back canned rows regardless of the filter cannot catch a missing predicate.
 *
 * Regression: vehicle_stock_batch has no inventory_item_id column, so the FIFO
 * candidate query, findSinkBatch, and the lock-target scan all have to filter
 * through `batch.inventory_item_id`. Before the fix none of them did, so a truck
 * carrying lots of two batch-tracked items allocated item B's deduction to item
 * A's older lot and then failed loadBatchForMovement's item check.
 */

const ORG = "org-1";
const ACTOR = { actor_type: "technician" as const, actor_id: "tech-1" };

type BatchRow = {
	id: string;
	organization_id: string;
	inventory_item_id: string;
	code: string;
	recalled_at: Date | null;
	received_at: Date;
	qty_in_warehouse: number;
};
type VsbRow = { id: string; vehicle_id: string; batch_id: string; qty_on_hand: number };

type VsbWhere = {
	vehicle_id?: string;
	batch_id?: string;
	qty_on_hand?: { gt?: number };
	batch?: { recalled_at?: null; inventory_item_id?: string };
};

function makeStore(batches: BatchRow[], vsb: VsbRow[]) {
	const batchById = new Map(batches.map((b) => [b.id, b]));
	const calls = {
		vsbFindMany: [] as VsbWhere[],
		vsbFindFirst: [] as VsbWhere[],
		vsbUpdates: [] as { id: string; delta: number }[],
		vsbCreates: [] as { vehicle_id: string; batch_id: string; qty_on_hand: number }[],
	};

	const vsbMatches = (r: VsbRow, where: VsbWhere) => {
		const b = batchById.get(r.batch_id)!;
		if (where.vehicle_id && r.vehicle_id !== where.vehicle_id) return false;
		if (where.qty_on_hand?.gt !== undefined && !(r.qty_on_hand > where.qty_on_hand.gt)) return false;
		if (where.batch_id && r.batch_id !== where.batch_id) return false;
		if (where.batch) {
			if ("recalled_at" in where.batch && where.batch.recalled_at === null && b.recalled_at !== null)
				return false;
			if (where.batch.inventory_item_id && b.inventory_item_id !== where.batch.inventory_item_id)
				return false;
		}
		return true;
	};
	const sortVsb = (rows: VsbRow[]) =>
		[...rows].sort((x, y) => {
			const bx = batchById.get(x.batch_id)!;
			const by = batchById.get(y.batch_id)!;
			return (
				bx.received_at.getTime() - by.received_at.getTime() || x.batch_id.localeCompare(y.batch_id)
			);
		});

	const tx = {
		$queryRaw: vi.fn().mockResolvedValue([]),
		inventory_item: {
			findMany: vi.fn().mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) =>
				where.id.in.map((id) => ({
					id,
					quantity: 100,
					low_stock_threshold: null,
					is_serialized: false,
					is_batch_tracked: true,
					unit: "each",
				})),
			),
			update: vi.fn().mockResolvedValue(undefined),
		},
		vehicle_stock_item: {
			upsert: vi.fn().mockResolvedValue(undefined),
			findMany: vi.fn().mockResolvedValue([]),
		},
		stock_movement: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
		stock_movement_serial: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
		stock_movement_batch: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
		serial_unit: { findMany: vi.fn().mockResolvedValue([]) },
		stock_batch: {
			findFirst: vi.fn().mockImplementation(
				async ({ where }: { where: { id: string; organization_id?: string; inventory_item_id?: string } }) => {
					const b = batchById.get(where.id);
					if (!b) return null;
					if (where.organization_id && b.organization_id !== where.organization_id) return null;
					if (where.inventory_item_id && b.inventory_item_id !== where.inventory_item_id) return null;
					return {
						code: b.code,
						inventory_item_id: b.inventory_item_id,
						recalled_at: b.recalled_at,
						qty_in_warehouse: new Prisma.Decimal(b.qty_in_warehouse),
					};
				},
			),
			findMany: vi.fn().mockResolvedValue([]),
			update: vi.fn().mockResolvedValue(undefined),
		},
		vehicle_stock_batch: {
			findMany: vi.fn().mockImplementation(async ({ where }: { where: VsbWhere }) => {
				calls.vsbFindMany.push(where);
				return sortVsb(vsb.filter((r) => vsbMatches(r, where))).map((r) => ({
					batch_id: r.batch_id,
					qty_on_hand: new Prisma.Decimal(r.qty_on_hand),
				}));
			}),
			findFirst: vi.fn().mockImplementation(async ({ where }: { where: VsbWhere }) => {
				calls.vsbFindFirst.push(where);
				const r = sortVsb(vsb.filter((x) => vsbMatches(x, where)))[0];
				return r ? { id: r.id, batch_id: r.batch_id, qty_on_hand: new Prisma.Decimal(r.qty_on_hand) } : null;
			}),
			update: vi.fn().mockImplementation(
				async ({ where, data }: { where: { id: string }; data: { qty_on_hand: { increment: Prisma.Decimal } } }) => {
					calls.vsbUpdates.push({ id: where.id, delta: Number(data.qty_on_hand.increment) });
				},
			),
			create: vi.fn().mockImplementation(
				async ({ data }: { data: { vehicle_id: string; batch_id: string; qty_on_hand: Prisma.Decimal } }) => {
					calls.vsbCreates.push({ ...data, qty_on_hand: Number(data.qty_on_hand) });
				},
			),
			upsert: vi.fn().mockResolvedValue(undefined),
		},
	};
	return { tx, calls };
}

const OLD = new Date("2026-01-01");
const NEW = new Date("2026-03-01");

const batch = (id: string, item: string, received_at: Date, recalled_at: Date | null = null): BatchRow => ({
	id,
	organization_id: ORG,
	inventory_item_id: item,
	code: `LOT-${id}`,
	recalled_at,
	received_at,
	qty_in_warehouse: 0,
});

const partsUsed = (item: string, qty: number): MovementInput => ({
	inventory_item_id: item,
	qty,
	from_location_type: "vehicle",
	from_vehicle_id: "v1",
	to_location_type: "consumed",
	reason: "parts_used",
	visit_id: "visit-1",
});

function allocationsOf(tx: ReturnType<typeof makeStore>["tx"]): [string, number][] {
	const call = tx.stock_movement_batch.createMany.mock.calls[0]?.[0] as
		| { data: { batch_id: string; qty: Prisma.Decimal }[] }
		| undefined;
	return (call?.data ?? []).map((j) => [j.batch_id, Number(j.qty)]);
}

describe("vehicle FIFO auto-allocation is scoped to the movement's item", () => {
	it("parts_used on item B with no batch picks item B's lot, not item A's older lot on the same truck", async () => {
		const { tx, calls } = makeStore(
			[batch("batch-A", "itemA", OLD), batch("batch-B", "itemB", NEW)],
			[
				{ id: "vsb-1", vehicle_id: "v1", batch_id: "batch-A", qty_on_hand: 10 },
				{ id: "vsb-2", vehicle_id: "v1", batch_id: "batch-B", qty_on_hand: 5 },
			],
		);

		await expect(recordMovements(tx as never, ORG, ACTOR, [partsUsed("itemB", 3)], { allowNegative: true }))
			.resolves.toBeTruthy();

		expect(allocationsOf(tx)).toEqual([["batch-B", 3]]);
		expect(calls.vsbUpdates).toEqual([{ id: "vsb-2", delta: -3 }]);
		// Every vehicle_stock_batch read (lock scan + FIFO candidates) constrained on the item.
		expect(calls.vsbFindMany.length).toBeGreaterThan(0);
		for (const w of calls.vsbFindMany) expect(w.batch?.inventory_item_id).toBe("itemB");
	});

	it("control: same movement still succeeds when item B's lot is the only lot on the truck", async () => {
		const { tx } = makeStore(
			[batch("batch-B", "itemB", NEW)],
			[{ id: "vsb-2", vehicle_id: "v1", batch_id: "batch-B", qty_on_hand: 5 }],
		);

		await expect(recordMovements(tx as never, ORG, ACTOR, [partsUsed("itemB", 3)], { allowNegative: true }))
			.resolves.toBeTruthy();
		expect(allocationsOf(tx)).toEqual([["batch-B", 3]]);
	});

	it("walks item B's lots oldest-first and skips item A's lots interleaved between them", async () => {
		const { tx } = makeStore(
			[
				batch("batch-A", "itemA", OLD),
				batch("batch-B1", "itemB", new Date("2026-02-01")),
				batch("batch-B2", "itemB", NEW),
			],
			[
				{ id: "vsb-1", vehicle_id: "v1", batch_id: "batch-A", qty_on_hand: 10 },
				{ id: "vsb-2", vehicle_id: "v1", batch_id: "batch-B1", qty_on_hand: 2 },
				{ id: "vsb-3", vehicle_id: "v1", batch_id: "batch-B2", qty_on_hand: 5 },
			],
		);

		await recordMovements(tx as never, ORG, ACTOR, [partsUsed("itemB", 4)], { allowNegative: true });

		expect(allocationsOf(tx)).toEqual([
			["batch-B1", 2],
			["batch-B2", 2],
		]);
	});
});

describe("vehicle FIFO shortfall with allowNegative", () => {
	it("allocation sums to the movement qty; the last lot picked absorbs the shortfall and goes negative", async () => {
		const { tx, calls } = makeStore(
			[batch("batch-A", "itemA", OLD), batch("batch-B1", "itemB", OLD), batch("batch-B2", "itemB", NEW)],
			[
				{ id: "vsb-1", vehicle_id: "v1", batch_id: "batch-A", qty_on_hand: 10 },
				{ id: "vsb-2", vehicle_id: "v1", batch_id: "batch-B1", qty_on_hand: 1 },
				{ id: "vsb-3", vehicle_id: "v1", batch_id: "batch-B2", qty_on_hand: 2 },
			],
		);

		await recordMovements(tx as never, ORG, ACTOR, [partsUsed("itemB", 5)], { allowNegative: true });

		const allocs = allocationsOf(tx);
		expect(allocs).toEqual([
			["batch-B1", 1],
			["batch-B2", 4], // 2 on hand + 2 shortfall
		]);
		expect(allocs.reduce((sum, [, q]) => sum + q, 0)).toBe(5);
		expect(calls.vsbUpdates).toEqual([
			{ id: "vsb-2", delta: -1 },
			{ id: "vsb-3", delta: -4 }, // 2 - 4 = -2 on the truck
		]);
	});

	it("findSinkBatch: item B at 0 on the truck charges the shortfall to item B's oldest lot, not item A's", async () => {
		const { tx, calls } = makeStore(
			[batch("batch-A", "itemA", OLD), batch("batch-B", "itemB", NEW)],
			[
				{ id: "vsb-1", vehicle_id: "v1", batch_id: "batch-A", qty_on_hand: 0 },
				{ id: "vsb-2", vehicle_id: "v1", batch_id: "batch-B", qty_on_hand: 0 },
			],
		);

		await expect(recordMovements(tx as never, ORG, ACTOR, [partsUsed("itemB", 2)], { allowNegative: true }))
			.resolves.toBeTruthy();

		expect(allocationsOf(tx)).toEqual([["batch-B", 2]]);
		expect(calls.vsbUpdates).toEqual([{ id: "vsb-2", delta: -2 }]);
		// The sink lookup (the findFirst that filters through the batch relation —
		// decrementVehicleBatch's own by-id read has no batch filter) named the item.
		const sinkLookups = calls.vsbFindFirst.filter((w) => w.batch !== undefined);
		expect(sinkLookups).toHaveLength(1);
		expect(sinkLookups[0].batch?.inventory_item_id).toBe("itemB");
	});

	it("never picks a recalled lot — neither as a FIFO candidate nor as the sink", async () => {
		const { tx } = makeStore(
			[
				batch("batch-B-recalled", "itemB", OLD, new Date("2026-02-15")),
				batch("batch-B-ok", "itemB", NEW),
			],
			[
				{ id: "vsb-1", vehicle_id: "v1", batch_id: "batch-B-recalled", qty_on_hand: 10 },
				{ id: "vsb-2", vehicle_id: "v1", batch_id: "batch-B-ok", qty_on_hand: 0 },
			],
		);

		await recordMovements(tx as never, ORG, ACTOR, [partsUsed("itemB", 3)], { allowNegative: true });

		// FIFO found nothing (the only stocked lot is recalled) and the sink skipped
		// it too — the shortfall lands on the non-recalled lot, which goes negative.
		expect(allocationsOf(tx)).toEqual([["batch-B-ok", 3]]);
	});

	it("throws the documented error when the item has no candidate lot on the truck at all", async () => {
		const { tx } = makeStore(
			[batch("batch-A", "itemA", OLD)],
			[{ id: "vsb-1", vehicle_id: "v1", batch_id: "batch-A", qty_on_hand: 10 }],
		);

		await expect(
			recordMovements(tx as never, ORG, ACTOR, [partsUsed("itemB", 2)], { allowNegative: true }),
		).rejects.toThrow(
			new TrackingValidationError("Batch-tracked item itemB has no batch to allocate the shortfall against"),
		);
		expect(tx.stock_movement.createMany).not.toHaveBeenCalled();
	});

	it("without allowNegative a shortfall is still an InsufficientBatchStockError (no sink)", async () => {
		const { tx } = makeStore(
			[batch("batch-B", "itemB", NEW)],
			[{ id: "vsb-2", vehicle_id: "v1", batch_id: "batch-B", qty_on_hand: 1 }],
		);

		await expect(recordMovements(tx as never, ORG, ACTOR, [partsUsed("itemB", 3)])).rejects.toThrow(
			/Insufficient batch stock/,
		);
	});
});
