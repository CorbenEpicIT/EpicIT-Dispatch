import { ZodError } from "zod";
import { db } from "../db.js";
import { updateThresholdSchema } from "../lib/validate/inventory.js";
import { logActivity, buildChanges } from "../services/logger.js";
import { log } from "../services/appLogger.js";

export interface UserContext {
	techId?: string;
	dispatcherId?: string;
	ipAddress?: string;
	userAgent?: string;
}

function getStockStatus(quantity: number, threshold: number | null): 'sufficient' | 'low' | 'out_of_stock' | null {
	if (threshold === null) return null;

	if (quantity === 0) return 'out_of_stock';
	if (quantity < threshold) return 'low';
	return 'sufficient';
}

export const getAllInventory = async () => {
	const items = await db.inventory_item.findMany({
		orderBy: { name: 'asc' },
	});

	return items.map(item => ({
		...item,
		stock_status: getStockStatus(item.quantity, item.low_stock_threshold),
	}));
};

export const getLowStockInventory = async () => {
	const items = await db.inventory_item.findMany({
		where: {
			is_active: true,
			low_stock_threshold: { not: null },
		},
	});

	const itemsWithStatus = items
		.map(item => ({
			...item,
			stock_status: getStockStatus(item.quantity, item.low_stock_threshold),
		}))
		.filter(item => item.stock_status === 'low' || item.stock_status === 'out_of_stock')
		.sort((a, b) => {
			if (a.stock_status === 'out_of_stock' && b.stock_status !== 'out_of_stock') return -1;
			if (a.stock_status !== 'out_of_stock' && b.stock_status === 'out_of_stock') return 1;
			return a.quantity - b.quantity;
		});

	return itemsWithStatus;
};

export const updateInventoryThreshold = async (
	itemId: string,
	data: unknown,
	context?: UserContext
) => {
	try {
		const parsed = updateThresholdSchema.parse(data);

		const existing = await db.inventory_item.findUnique({
			where: { id: itemId },
		});

		if (!existing) {
			return { err: "Inventory item not found" };
		}

		const updated = await db.$transaction(async (tx) => {
			const item = await tx.inventory_item.update({
				where: { id: itemId },
				data: { low_stock_threshold: parsed.low_stock_threshold },
			});

			await logActivity({
				event_type: "inventory_item.threshold_updated",
				action: "updated",
				entity_type: "inventory_item",
				entity_id: itemId,
				actor_type: context?.techId
					? "technician"
					: context?.dispatcherId
					? "dispatcher"
					: "system",
				actor_id: context?.techId || context?.dispatcherId,
				changes: buildChanges(
					existing,
					{ low_stock_threshold: parsed.low_stock_threshold },
					["low_stock_threshold"] as const
				),
				ip_address: context?.ipAddress,
				user_agent: context?.userAgent,
			});

			return item;
		});

		return {
			err: "",
			item: {
				...updated,
				stock_status: getStockStatus(updated.quantity, updated.low_stock_threshold),
			},
		};
	} catch (e) {
		log.error({ err: e }, "Update threshold error");
		if (e instanceof ZodError) {
			return {
				err: `Validation failed: ${e.issues.map((err) => err.message).join(", ")}`,
			};
		}
		return { err: "Internal server error" };
	}
};

