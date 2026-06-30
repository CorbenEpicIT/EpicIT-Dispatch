import { Prisma } from "../../generated/prisma/client.js";

type TransactionClient = Prisma.TransactionClient;

export class InsufficientStockError extends Error {
	/** Per-item available quantities at the time of the check. */
	readonly available: Record<string, number>;

	constructor(available: Record<string, number>) {
		super("Insufficient warehouse stock for requested movements");
		this.name = "InsufficientStockError";
		this.available = available;
	}
}

export interface ActorInfo {
	actor_type: "technician" | "dispatcher" | "system";
	actor_id?: string;
}

export interface MovementInput {
	inventory_item_id: string;
	/** Must be > 0. Fractional qty rejected when movement touches warehouse (Int column). */
	qty: number;
	from_location_type: "warehouse" | "vehicle" | "consumed" | "adjustment" | "external";
	from_vehicle_id?: string;
	to_location_type: "warehouse" | "vehicle" | "consumed" | "adjustment" | "external";
	to_vehicle_id?: string;
	reason:
		| "receive"
		| "restock"
		| "return_to_warehouse"
		| "parts_used"
		| "direct_consumption"
		| "loss"
		| "audit_correction"
		| "transfer"
		| "reversal"
		| "initial"
		| "supplier_purchase";
	note?: string;
	visit_id?: string;
	visit_line_item_id?: string;
	restock_record_id?: string;
	adjustment_id?: string;
}

export interface RecordMovementsOpts {
	/** Allow warehouse qty to go negative. Default: false (throws InsufficientStockError). */
	allowNegative?: boolean;
}

/**
 * SELECT ... FOR UPDATE on inventory_item rows before reading warehouse quantities.
 * Prevents TOCTOU races in EOD cap math. itemIds must be sorted by caller.
 */
export async function lockInventoryRows(tx: TransactionClient, itemIds: string[]): Promise<void> {
	if (itemIds.length === 0) return;
	await tx.$queryRaw`
		SELECT id FROM inventory_item
		WHERE id = ANY(${itemIds}::text[])
		FOR UPDATE
	`;
}

/**
 * Single-writer service — the only place that updates inventory_item.quantity
 * and vehicle_stock_item.qty_on_hand. All callers use this inside a transaction.
 *
 * Deterministic sort on (inventory_item_id, from_vehicle_id, to_vehicle_id) prevents
 * deadlocks when multiple callers run concurrently.
 *
 * Returns lowStockItemIds for callers to fire alerts post-commit.
 */
export async function recordMovements(
	tx: TransactionClient,
	orgId: string,
	actor: ActorInfo,
	movements: MovementInput[],
	opts: RecordMovementsOpts = {},
): Promise<{ lowStockItemIds: string[] }> {
	if (movements.length === 0) return { lowStockItemIds: [] };

	// 1. Validate qty
	for (const m of movements) {
		if (m.qty <= 0) throw new Error(`Movement qty must be > 0; got ${m.qty}`);

		const touchesWarehouse =
			m.from_location_type === "warehouse" || m.to_location_type === "warehouse";
		if (touchesWarehouse && !Number.isInteger(m.qty)) {
			throw new Error(
				`Fractional qty (${m.qty}) rejected for warehouse movement on item ${m.inventory_item_id}; inventory_item.quantity is Int`,
			);
		}
	}

	// 2. Deterministic sort — prevents deadlocks
	const sorted = [...movements].sort((a, b) => {
		const item = a.inventory_item_id.localeCompare(b.inventory_item_id);
		if (item !== 0) return item;
		const from = (a.from_vehicle_id ?? "").localeCompare(b.from_vehicle_id ?? "");
		if (from !== 0) return from;
		return (a.to_vehicle_id ?? "").localeCompare(b.to_vehicle_id ?? "");
	});

	// 3. Aggregate cache deltas
	const itemDeltas = new Map<string, number>(); // inventory_item.quantity
	// vehicle key = `${vehicle_id}::${item_id}`
	const vehicleItemDeltaMap = new Map<
		string,
		{ vehicle_id: string; inventory_item_id: string; delta: number }
	>();

	for (const m of sorted) {
		if (m.from_location_type === "warehouse") {
			itemDeltas.set(m.inventory_item_id, (itemDeltas.get(m.inventory_item_id) ?? 0) - m.qty);
		}
		if (m.to_location_type === "warehouse") {
			itemDeltas.set(m.inventory_item_id, (itemDeltas.get(m.inventory_item_id) ?? 0) + m.qty);
		}
		if (m.from_vehicle_id) {
			const key = `${m.from_vehicle_id}::${m.inventory_item_id}`;
			const e = vehicleItemDeltaMap.get(key);
			if (e) e.delta -= m.qty;
			else vehicleItemDeltaMap.set(key, { vehicle_id: m.from_vehicle_id, inventory_item_id: m.inventory_item_id, delta: -m.qty });
		}
		if (m.to_vehicle_id) {
			const key = `${m.to_vehicle_id}::${m.inventory_item_id}`;
			const e = vehicleItemDeltaMap.get(key);
			if (e) e.delta += m.qty;
			else vehicleItemDeltaMap.set(key, { vehicle_id: m.to_vehicle_id, inventory_item_id: m.inventory_item_id, delta: m.qty });
		}
	}

	// 4. Lock warehouse-touched item rows (SELECT FOR UPDATE)
	const itemIds = [...itemDeltas.keys()].sort();
	await lockInventoryRows(tx, itemIds);

	// 5. Warehouse overdraw guard
	if (!opts.allowNegative) {
		const deductions = itemIds.filter((id) => (itemDeltas.get(id) ?? 0) < 0);
		if (deductions.length > 0) {
			const rows = await tx.inventory_item.findMany({
				where: { id: { in: deductions } },
				select: { id: true, quantity: true },
			});

			const insufficient: Record<string, number> = {};
			for (const row of rows) {
				const projected = Number(row.quantity) + itemDeltas.get(row.id)!;
				if (projected < 0) insufficient[row.id] = Number(row.quantity);
			}
			if (Object.keys(insufficient).length > 0) throw new InsufficientStockError(insufficient);
		}
	}

	// 6. Apply inventory_item deltas (deterministic order)
	for (const itemId of itemIds) {
		const delta = itemDeltas.get(itemId)!;
		if (delta === 0) continue;
		await tx.inventory_item.update({
			where: { id: itemId },
			data: { quantity: { increment: delta } },
		});
	}

	// 7. Apply vehicle_stock_item deltas (upsert — row may not exist for new restocks)
	const vehicleEntries = [...vehicleItemDeltaMap.values()].sort((a, b) => {
		const v = a.vehicle_id.localeCompare(b.vehicle_id);
		return v !== 0 ? v : a.inventory_item_id.localeCompare(b.inventory_item_id);
	});

	for (const entry of vehicleEntries) {
		if (entry.delta === 0) continue;
		await tx.vehicle_stock_item.upsert({
			where: {
				vehicle_id_inventory_item_id: {
					vehicle_id: entry.vehicle_id,
					inventory_item_id: entry.inventory_item_id,
				},
			},
			create: {
				vehicle_id: entry.vehicle_id,
				inventory_item_id: entry.inventory_item_id,
				qty_on_hand: new Prisma.Decimal(entry.delta),
				qty_min: 0,
			},
			update: {
				qty_on_hand: { increment: new Prisma.Decimal(entry.delta) },
			},
		});
	}

	// 7b. Auto-resolve pending/acknowledged restock requests for items restocked onto a vehicle
	const inboundVehicleEntries = [...vehicleItemDeltaMap.values()].filter((e) => e.delta > 0);
	if (inboundVehicleEntries.length > 0) {
		// Find stock_item IDs for (vehicle_id, inventory_item_id) pairs receiving stock
		const stockItemRows = await tx.vehicle_stock_item.findMany({
			where: {
				OR: inboundVehicleEntries.map((e) => ({
					vehicle_id: e.vehicle_id,
					inventory_item_id: e.inventory_item_id,
				})),
			},
			select: { id: true },
		});
		const stockItemIds = stockItemRows.map((s: { id: string }) => s.id);
		if (stockItemIds.length > 0) {
			const resolvedNote = `Auto-resolved by stock movement (${actor.actor_type}${actor.actor_id ? ` · ${actor.actor_id}` : ""})`;
			await tx.vehicle_restock_request.updateMany({
				where: {
					stock_item_id: { in: stockItemIds },
					status: { in: ["pending", "acknowledged"] },
				},
				data: {
					status: "resolved",
					resolved_at: new Date(),
					resolved_note: resolvedNote,
				},
			});
		}
	}

	// 8. Insert movement rows
	await tx.stock_movement.createMany({
		data: sorted.map((m) => ({
			organization_id: orgId,
			inventory_item_id: m.inventory_item_id,
			qty: new Prisma.Decimal(m.qty),
			from_location_type: m.from_location_type,
			from_vehicle_id: m.from_vehicle_id ?? null,
			to_location_type: m.to_location_type,
			to_vehicle_id: m.to_vehicle_id ?? null,
			reason: m.reason,
			note: m.note ?? null,
			actor_type: actor.actor_type,
			actor_id: actor.actor_id ?? null,
			visit_id: m.visit_id ?? null,
			visit_line_item_id: m.visit_line_item_id ?? null,
			restock_record_id: m.restock_record_id ?? null,
			adjustment_id: m.adjustment_id ?? null,
		})),
	});

	// 9. Return low-stock item IDs for caller to fire alerts post-commit
	if (itemIds.length === 0) return { lowStockItemIds: [] };

	const updatedItems = await tx.inventory_item.findMany({
		where: { id: { in: itemIds } },
		select: { id: true, quantity: true, low_stock_threshold: true },
	});

	const lowStockItemIds = updatedItems
		.filter(
			(item) =>
				item.low_stock_threshold !== null &&
				Number(item.quantity) <= item.low_stock_threshold,
		)
		.map((item) => item.id);

	return { lowStockItemIds };
}
