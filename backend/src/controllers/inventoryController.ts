import { ZodError } from "zod";
import { getScopedDb, type UserContext } from "../lib/context.js";
import type { PrismaClient } from "../../generated/prisma/client.js";
import {
	updateThresholdSchema,
	createInventoryItemSchema,
	updateInventoryItemSchema,
	adjustStockSchema,
} from "../lib/validate/inventory.js";
import { logActivity, buildChanges } from "../services/logger.js";
import { log } from "../services/appLogger.js";
import { sendEmail } from "../services/emailService.js";

type StockStatus = "sufficient" | "low" | "out_of_stock" | null;

interface InventoryRecord {
	id: string;
	name: string;
	quantity: number;
	low_stock_threshold: number | null;
	alert_emails_enabled: boolean;
	alert_email: string | null;
}

type TransactionClient = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

function getStockStatus(quantity: number, threshold: number | null): StockStatus {
	if (threshold === null) return null;
	if (quantity === 0) return "out_of_stock";
	if (quantity < threshold) return "low";
	return "sufficient";
}

function getActorInfo(context?: UserContext) {
	return {
		actor_type: context?.techId
			? "technician"
			: context?.dispatcherId
				? "dispatcher"
				: "system",
		actor_id: context?.techId || context?.dispatcherId,
		ip_address: context?.ipAddress,
		user_agent: context?.userAgent,
	};
}

function withStockStatus<T extends { quantity: number; low_stock_threshold: number | null }>(
	item: T,
): T & { stock_status: StockStatus } {
	return {
		...item,
		stock_status: getStockStatus(item.quantity, item.low_stock_threshold),
	};
}

export const getAllInventory = async (organizationId: string, sort?: string) => {
	let orderBy: Record<string, unknown> = { name: "asc" };

	switch (sort) {
		case "quantity_asc":
			orderBy = { quantity: "asc" };
			break;
		case "quantity_desc":
			orderBy = { quantity: "desc" };
			break;
		case "recently_added":
			orderBy = { created_at: "desc" };
			break;
		case "most_used":
			orderBy = { visit_line_items: { _count: "desc" } };
			break;
		case "name":
		default:
			orderBy = { name: "asc" };
			break;
	}

	const sdb = getScopedDb(organizationId);
	const items = await sdb.inventory_item.findMany({
		where: { is_active: true },
		orderBy,
		include: {
			_count: {
				select: { visit_line_items: true },
			},
		},
	});

	return items.map(withStockStatus);
};

export const getLowStockInventory = async (organizationId: string) => {
	const sdb = getScopedDb(organizationId);
	const items = await sdb.inventory_item.findMany({
		where: {
			is_active: true,
			low_stock_threshold: { not: null },
		},
	});

	return items
		.map(withStockStatus)
		.filter((item) => item.stock_status === "low" || item.stock_status === "out_of_stock")
		.sort((a, b) => {
			if (a.stock_status === "out_of_stock" && b.stock_status !== "out_of_stock") return -1;
			if (a.stock_status !== "out_of_stock" && b.stock_status === "out_of_stock") return 1;
			return a.quantity - b.quantity;
		});
};

export const createInventoryItem = async (data: unknown, organizationId: string, context?: UserContext) => {
	try {
		const parsed = createInventoryItemSchema.parse(data);
		const sdb = getScopedDb(organizationId);
		const item = await sdb.$transaction(async (tx) => {
			const created = await tx.inventory_item.create({
				data: {
					organization_id: organizationId,
					name: parsed.name,
					description: parsed.description,
					location: parsed.location,
					quantity: parsed.quantity,
					unit_price: parsed.unit_price ?? null,
					cost: parsed.cost ?? null,
					sku: parsed.sku ?? null,
					low_stock_threshold: parsed.low_stock_threshold ?? null,
					image_urls: parsed.image_urls,
					alert_emails_enabled: parsed.alert_emails_enabled,
					alert_email: parsed.alert_email ?? null,
				},
			});

			await logActivity({
				event_type: "inventory_item.created",
				action: "created",
				entity_type: "inventory_item",
				entity_id: created.id,
				organization_id: organizationId,
				...getActorInfo(context),
				changes: {
					name: { old: null, new: created.name },
					quantity: { old: null, new: created.quantity },
					location: { old: null, new: created.location },
				},
			});

			return created;
		});

		return { err: "", item: withStockStatus(item) };
	} catch (e) {
		console.error("Create inventory item error:", e);
		if (e instanceof ZodError) {
			return {
				err: `Validation failed: ${e.issues.map((err) => err.message).join(", ")}`,
			};
		}
		return { err: "Internal server error" };
	}
};

export const updateInventoryItem = async (
	itemId: string,
	data: unknown,
	organizationId: string,
	context?: UserContext,
) => {
	try {
		const parsed = updateInventoryItemSchema.parse(data);

		const sdb = getScopedDb(organizationId);
		const existing = await sdb.inventory_item.findFirst({
			where: { id: itemId },
		});

		if (!existing) {
			return { err: "Inventory item not found" };
		}

		const changes = buildChanges(existing, parsed, [
			"name",
			"description",
			"location",
			"quantity",
			"unit_price",
			"cost",
			"sku",
			"low_stock_threshold",
			"image_urls",
			"alert_emails_enabled",
			"alert_email",
		] as const);

		const updated = await sdb.$transaction(async (tx) => {
			const item = await tx.inventory_item.update({
				where: { id: itemId },
				data: parsed,
			});

			if (Object.keys(changes).length > 0) {
				await logActivity({
					event_type: "inventory_item.updated",
					action: "updated",
					entity_type: "inventory_item",
					entity_id: itemId,
					organization_id: organizationId,
					...getActorInfo(context),
					changes,
				});
			}

			return item;
		});

		return { err: "", item: withStockStatus(updated) };
	} catch (e) {
		console.error("Update inventory item error:", e);
		if (e instanceof ZodError) {
			return {
				err: `Validation failed: ${e.issues.map((err) => err.message).join(", ")}`,
			};
		}
		return { err: "Internal server error" };
	}
};

export const deleteInventoryItem = async (itemId: string, organizationId: string, context?: UserContext) => {
	try {
		const sdb = getScopedDb(organizationId);
		const existing = await sdb.inventory_item.findFirst({
			where: { id: itemId },
		});

		if (!existing) {
			return { err: "Inventory item not found" };
		}

		await sdb.$transaction(async (tx) => {
			await tx.inventory_item.update({
				where: { id: itemId },
				data: { is_active: false },
			});

			await logActivity({
				event_type: "inventory_item.deleted",
				action: "deleted",
				entity_type: "inventory_item",
				entity_id: itemId,
				organization_id: organizationId,
				...getActorInfo(context),
				changes: {
					is_active: { old: true, new: false },
					name: { old: existing.name, new: null },
				},
			});
		});

		return { err: "", message: "Inventory item deleted successfully" };
	} catch (e) {
		console.error("Delete inventory item error:", e);
		return { err: "Internal server error" };
	}
};

export const adjustInventoryStock = async (
	itemId: string,
	data: unknown,
	organizationId: string,
	context?: UserContext,
) => {
	try {
		const parsed = adjustStockSchema.parse(data);

		const sdb = getScopedDb(organizationId);
		const existing = await sdb.inventory_item.findFirst({
			where: { id: itemId },
		});

		if (!existing) {
			return { err: "Inventory item not found" };
		}

		const newQuantity = existing.quantity + parsed.delta;
		if (newQuantity < 0) {
			return { err: "Stock cannot go below zero" };
		}

		const updated = await sdb.$transaction(async (tx) => {
			const item = await tx.inventory_item.update({
				where: { id: itemId },
				data: { quantity: newQuantity },
			});

			await logActivity({
				event_type: "inventory_item.stock_adjusted",
				action: "updated",
				entity_type: "inventory_item",
				entity_id: itemId,
				organization_id: organizationId,
				...getActorInfo(context),
				changes: {
					quantity: { old: existing.quantity, new: newQuantity },
					delta: { old: null, new: parsed.delta },
				},
			});

			return item;
		});

		if (
			updated.low_stock_threshold !== null &&
			updated.quantity <= updated.low_stock_threshold &&
			existing.quantity > (existing.low_stock_threshold ?? 0)
		) {
			await triggerLowStockAlert(updated as InventoryRecord);
		}

		return { err: "", item: withStockStatus(updated) };
	} catch (e) {
		console.error("Adjust inventory stock error:", e);
		if (e instanceof ZodError) {
			return {
				err: `Validation failed: ${e.issues.map((err) => err.message).join(", ")}`,
			};
		}
		return { err: "Internal server error" };
	}
};

export const deductInventoryForVisit = async (
	visitId: string,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	tx: any,
	context?: UserContext,
) => {
	const lineItems = await tx.job_visit_line_item.findMany({
		where: {
			visit_id: visitId,
			inventory_item_id: { not: null },
		},
	});

	for (const li of lineItems) {
		const item = await tx.inventory_item.findUnique({
			where: { id: li.inventory_item_id! },
		});
		if (!item) continue;

		const delta = -Number(li.quantity);
		const newQty = Math.max(0, item.quantity + delta);

		await tx.inventory_item.update({
			where: { id: item.id },
			data: { quantity: newQty },
		});

		await logActivity({
			event_type: "inventory_item.stock_adjusted",
			action: "updated",
			entity_type: "inventory_item",
			entity_id: item.id,
			...getActorInfo(context),
			changes: {
				quantity: { old: item.quantity, new: newQty },
				reason: { old: null, new: `Deducted from visit ${visitId}` },
			},
		});

		if (
			item.low_stock_threshold !== null &&
			newQty <= item.low_stock_threshold &&
			item.quantity > item.low_stock_threshold
		) {
			triggerLowStockAlert({ ...item, quantity: newQty } as InventoryRecord).catch(
				() => {},
			);
		}
	}
};

async function triggerLowStockAlert(item: InventoryRecord) {
	if (!item.alert_emails_enabled || !item.alert_email) return;

	try {
		await sendEmail(item.alert_email, "low-stock-alert", {
			item_name: item.name,
			current_quantity: item.quantity,
			threshold: item.low_stock_threshold,
			inventory_url: `${process.env.FRONTEND_URL || "http://localhost:5173"}/dispatch/inventory`,
		});
	} catch (e) {
		console.error("Failed to send low stock alert email:", e);
	}
}

export const updateInventoryThreshold = async (
	itemId: string,
	data: unknown,
	organizationId: string,
	context?: UserContext,
) => {
	try {
		const parsed = updateThresholdSchema.parse(data);

		const sdb = getScopedDb(organizationId);
		const existing = await sdb.inventory_item.findFirst({
			where: { id: itemId },
		});

		if (!existing) {
			return { err: "Inventory item not found" };
		}

		const updated = await sdb.$transaction(async (tx) => {
			const item = await tx.inventory_item.update({
				where: { id: itemId },
				data: { low_stock_threshold: parsed.low_stock_threshold },
			});

			await logActivity({
				event_type: "inventory_item.threshold_updated",
				action: "updated",
				entity_type: "inventory_item",
				entity_id: itemId,
				organization_id: organizationId,
				...getActorInfo(context),
				changes: buildChanges(
					existing,
					{ low_stock_threshold: parsed.low_stock_threshold },
					["low_stock_threshold"] as const,
				),
			});

			return item;
		});

		return { err: "", item: withStockStatus(updated) };
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
