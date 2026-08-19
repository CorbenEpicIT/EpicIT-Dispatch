// Plain-JSON response shapes for inventory_item — Prisma's generated model type
// is the source of truth for field names; only Decimal/Date fields get converted
// so the wire format is real numbers/ISO strings instead of Decimal-as-string.
import type { inventory_item } from "../../../generated/prisma/client.js";

export type InventoryItemDTO = Omit<
	inventory_item,
	| "quantity"
	| "low_stock_threshold"
	| "unit_price"
	| "cost"
	| "created_at"
	| "updated_at"
	| "approved_at"
> & {
	quantity: number;
	low_stock_threshold: number | null;
	unit_price: number | null;
	cost: number | null;
	created_at: string;
	updated_at: string;
	approved_at: string | null;
};

export function mapInventoryItem(item: inventory_item): InventoryItemDTO {
	return {
		...item,
		// numeric(10,2) columns come back as Prisma Decimal, which JSON.stringify renders as a string.
		quantity: Number(item.quantity),
		low_stock_threshold:
			item.low_stock_threshold == null ? null : Number(item.low_stock_threshold),
		unit_price: item.unit_price == null ? null : Number(item.unit_price),
		cost: item.cost == null ? null : Number(item.cost),
		created_at: item.created_at.toISOString(),
		updated_at: item.updated_at.toISOString(),
		approved_at: item.approved_at ? item.approved_at.toISOString() : null,
	};
}
