import * as XLSX from "xlsx";
import { z, ZodError } from "zod";
import { getScopedDb, type UserContext } from "../lib/context.js";
import { db } from "../db.js";
import { Prisma } from "../../generated/prisma/client.js";
import {
	updateThresholdSchema,
	createInventoryItemSchema,
	updateInventoryItemSchema,
	adjustStockSchema,
} from "../lib/validate/inventory.js";
import { logActivity, buildChanges } from "../services/logger.js";
import { log } from "../services/appLogger.js";
import { sendLowStockAlert } from "../services/lowStockAlerts.js";
import { recordMovements, InsufficientStockError, type ActorInfo } from "../services/stockMovements.js";

type StockStatus = "sufficient" | "low" | "out_of_stock" | null;

interface InventoryRecord {
	id: string;
	name: string;
	quantity: number;
	low_stock_threshold: number | null;
	alert_emails_enabled: boolean;
	alert_email: string | null;
}


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

function toActorInfo(context?: UserContext): ActorInfo {
	return {
		actor_type: context?.techId ? "technician" : context?.dispatcherId ? "dispatcher" : "system",
		actor_id: context?.techId || context?.dispatcherId,
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
		where: { is_active: true, provisional: false },
		orderBy,
		include: {
			_count: { select: { visit_line_items: true } },
			tags: { orderBy: { label: "asc" } },
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

// sku is globally unique — a P2002 on inventory_item means another item
// (possibly in another org) already holds the sku. Surface a clear 4xx, not 500.
// `sku` is the ONLY unique constraint on inventory_item, so any P2002 on this
// model is a sku conflict. The @prisma/adapter-pg driver populates neither
// meta.target nor the field name in the message for transaction-scoped P2002s,
// so match on meta.modelName (with target/message kept as extra signals).
const isSkuConflict = (e: unknown): boolean => {
	if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== "P2002") {
		return false;
	}
	if (e.meta?.modelName === "inventory_item") return true;
	const target = e.meta?.target;
	if (Array.isArray(target) && target.includes("sku")) return true;
	if (typeof target === "string" && target.includes("sku")) return true;
	return e.message.includes("sku");
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
					quantity: 0, // recordMovements sets the initial qty below
					unit_price: parsed.unit_price ?? null,
					cost: parsed.cost ?? null,
					sku: parsed.sku ?? null,
					low_stock_threshold: parsed.low_stock_threshold ?? null,
					image_urls: parsed.image_urls,
					alert_emails_enabled: parsed.alert_emails_enabled,
					alert_email: parsed.alert_email ?? null,
				},
				include: { tags: true },
			});

			if (parsed.quantity > 0) {
				await recordMovements(tx, organizationId, toActorInfo(context), [
					{
						inventory_item_id: created.id,
						qty: parsed.quantity,
						from_location_type: "external",
						to_location_type: "warehouse",
						reason: "receive",
					},
				]);
			}

			await logActivity({
				event_type: "inventory_item.created",
				action: "created",
				entity_type: "inventory_item",
				entity_id: created.id,
				organization_id: organizationId,
				...getActorInfo(context),
				changes: {
					name: { old: null, new: created.name },
					quantity: { old: null, new: parsed.quantity },
					location: { old: null, new: created.location },
				},
			});

			// quantity was set to 0 at create; recordMovements incremented it to parsed.quantity.
			// Return with the known final quantity to avoid an extra round-trip.
			return { ...created, quantity: parsed.quantity };
		});

		return { err: "", item: withStockStatus(item) };
	} catch (e) {
		// Expected validation outcomes — not internal errors, don't log a stack trace.
		if (e instanceof ZodError) {
			return {
				err: `Validation failed: ${e.issues.map((err) => err.message).join(", ")}`,
			};
		}
		if (isSkuConflict(e)) {
			return { err: "SKU already in use" };
		}
		console.error("Create inventory item error:", e);
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
				include: { tags: true },
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
		// Expected validation outcomes — not internal errors, don't log a stack trace.
		if (e instanceof ZodError) {
			return {
				err: `Validation failed: ${e.issues.map((err) => err.message).join(", ")}`,
			};
		}
		if (isSkuConflict(e)) {
			return { err: "SKU already in use" };
		}
		console.error("Update inventory item error:", e);
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

			// Soft delete skips cascade; clean up QB mappings manually.
			await tx.item_external_mapping.deleteMany({
				where: { inventory_item_id: itemId },
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

		const qty = Math.abs(parsed.delta);
		const isReceive = parsed.delta > 0;
		const actor = toActorInfo(context);

		let lowStockItemIds: string[] = [];

		const updated = await sdb.$transaction(async (tx) => {
			const result = await recordMovements(tx, organizationId, actor, [
				{
					inventory_item_id: itemId,
					qty,
					from_location_type: isReceive ? "external" : "warehouse",
					to_location_type: isReceive ? "warehouse" : "adjustment",
					reason: isReceive ? "receive" : "loss",
				},
			]);
			lowStockItemIds = result.lowStockItemIds;

			const item = await tx.inventory_item.findUnique({ where: { id: itemId } });

			await logActivity({
				event_type: "inventory_item.stock_adjusted",
				action: "updated",
				entity_type: "inventory_item",
				entity_id: itemId,
				organization_id: organizationId,
				...getActorInfo(context),
				changes: {
					quantity: { old: existing.quantity, new: item?.quantity },
					delta: { old: null, new: parsed.delta },
				},
			});

			return item!;
		});

		// Only alert when quantity first crosses below threshold, not on every deduction
		if (
			lowStockItemIds.includes(itemId) &&
			existing.quantity > (existing.low_stock_threshold ?? 0)
		) {
			sendLowStockAlert(updated as InventoryRecord).catch(() => {});
		}

		return { err: "", item: withStockStatus(updated) };
	} catch (e) {
		if (e instanceof InsufficientStockError) {
			return { err: "Stock cannot go below zero" };
		}
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
	organizationId: string,
	context?: UserContext,
): Promise<{ lowStockItemIds: string[] }> => {
	// Lines already consumed from vehicle stock (fulfillment_status "used") are
	// skipped — their warehouse impact happened at restock. NULL must be matched
	// explicitly: Prisma `not` excludes NULL rows (SQL semantics).
	const lineItems = await tx.job_visit_line_item.findMany({
		where: {
			visit_id: visitId,
			inventory_item_id: { not: null },
			OR: [{ fulfillment_status: null }, { fulfillment_status: { not: "used" } }],
		},
	});
	if (lineItems.length === 0) return { lowStockItemIds: [] };

	// Billed quantities can be fractional; warehouse is Int — consume at least
	// what was billed (ceil). allowNegative: completion must never block; a
	// truthful negative surfaces the discrepancy instead of hiding it.
	const movements = (lineItems as { id: string; inventory_item_id: string; quantity: unknown }[])
		.map((li) => ({
			inventory_item_id: li.inventory_item_id,
			qty: Math.ceil(Number(li.quantity)),
			from_location_type: "warehouse" as const,
			to_location_type: "consumed" as const,
			reason: "direct_consumption" as const,
			visit_id: visitId,
			visit_line_item_id: li.id,
		}))
		.filter((m) => m.qty > 0);

	const { lowStockItemIds } = await recordMovements(
		tx,
		organizationId,
		toActorInfo(context),
		movements,
		{ allowNegative: true },
	);

	await tx.job_visit_line_item.updateMany({
		where: { id: { in: lineItems.map((li: { id: string }) => li.id) } },
		data: { fulfillment_status: "used" },
	});

	await logActivity({
		event_type: "inventory_item.stock_adjusted",
		action: "updated",
		entity_type: "job_visit",
		entity_id: visitId,
		organization_id: organizationId,
		...getActorInfo(context),
		changes: {
			lines_consumed: { old: null, new: movements.length },
			reason: { old: null, new: `Inventory consumed at completion of visit ${visitId}` },
		},
	});

	return { lowStockItemIds };
};

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

// ── Bulk import ───────────────────────────────────────────────────────────────

export const importInventoryFromFile = async (
	buffer: Buffer,
	orgId: string,
	context?: UserContext,
): Promise<{ imported: number; skipped: { row: number; reason: string }[] }> => {
	const workbook = XLSX.read(buffer, { type: "buffer" });
	const sheet = workbook.Sheets[workbook.SheetNames[0]];
	const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

	const skipped: { row: number; reason: string }[] = [];
	let imported = 0;

	const str = (v: unknown) => String(v ?? "").trim();
	const toNum = (v: unknown) => { const n = parseFloat(str(v)); return isNaN(n) ? undefined : n; };
	const toInt = (v: unknown) => { const n = parseInt(str(v), 10); return isNaN(n) ? undefined : n; };

	const sdb = getScopedDb(orgId);

	const resolveTagIds = async (rawTags: string): Promise<string[]> => {
		const labels = rawTags.split(",").map((s) => s.trim()).filter(Boolean);
		if (labels.length === 0) return [];
		const ids: string[] = [];
		for (const label of labels) {
			const existing = await sdb.inventory_tag.findFirst({
				where: { organization_id: orgId, label: { equals: label, mode: "insensitive" } },
			});
			if (existing) {
				ids.push(existing.id);
			} else {
				const created = await sdb.inventory_tag.create({
					data: { organization_id: orgId, label },
				});
				ids.push(created.id);
			}
		}
		return ids;
	};

	for (let i = 0; i < rows.length; i++) {
		const row = rows[i];
		const rowNum = i + 2;

		const name = str(row["name"] ?? row["name*"]);
		const location = str(row["location"] ?? row["location*"]);

		if (!name) { skipped.push({ row: rowNum, reason: "Missing required field: name" }); continue; }
		if (!location) { skipped.push({ row: rowNum, reason: "Missing required field: location" }); continue; }

		const data = {
			name,
			location,
			description: str(row["description"]) || "",
			sku: str(row["sku"]) || null,
			quantity: toInt(row["quantity"]) ?? 0,
			unit_price: toNum(row["unit_price"]) ?? null,
			cost: toNum(row["cost"]) ?? null,
			low_stock_threshold: toInt(row["low_stock_threshold"]) ?? null,
			alert_email: str(row["alert_email"]) || null,
			alert_emails_enabled: false,
			image_urls: [],
		};

		const result = await createInventoryItem(data, orgId, context);
		if (result.err) {
			skipped.push({ row: rowNum, reason: result.err });
		} else {
			const rawTags = str(row["tags"]);
			if (rawTags) {
				const tagIds = await resolveTagIds(rawTags);
				if (tagIds.length > 0) {
					await sdb.inventory_item.update({
						where: { id: result.item!.id },
						data: { tags: { set: tagIds.map((id) => ({ id })) } },
					});
				}
			}
			imported++;
		}
	}

	return { imported, skipped };
};

// ── Low-stock export ──────────────────────────────────────────────────────────

export const exportLowStockToXlsx = async (orgId: string): Promise<Buffer> => {
	const items = await getLowStockInventory(orgId);

	const statusLabel = (s: string | null) =>
		s === "out_of_stock" ? "Out of Stock" : s === "low" ? "Low" : "";

	const rows = items.map((item) => ({
		Name: item.name,
		SKU: item.sku ?? "",
		Location: item.location,
		Quantity: item.quantity,
		Unit: (item as Record<string, unknown>)["unit"] ?? "each",
		"Low Stock Threshold": item.low_stock_threshold ?? "",
		"Stock Status": statusLabel(item.stock_status),
		"Unit Price": item.unit_price != null ? Number(item.unit_price) : "",
		Cost: item.cost != null ? Number(item.cost) : "",
	}));

	const ws = XLSX.utils.json_to_sheet(rows);
	ws["!cols"] = [22, 14, 20, 10, 8, 18, 14, 12, 12].map((wch) => ({ wch }));
	const wb = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(wb, ws, "Low Stock Report");

	return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
};

// ── Movement history ──────────────────────────────────────────────────────────

const MOVEMENT_INCLUDE = {
	from_vehicle: { select: { id: true, name: true } },
	to_vehicle: { select: { id: true, name: true } },
} as const;

export const getInventoryMovements = async (
	itemId: string,
	organizationId: string,
	cursor?: string,
	limit = 25,
) => {
	const sdb = getScopedDb(organizationId);

	const existing = await sdb.inventory_item.findFirst({ where: { id: itemId } });
	if (!existing) return { err: "Inventory item not found" as const };

	const take = Math.min(Math.max(Number.isFinite(limit) ? Math.floor(limit) : 25, 1), 100);

	const movements = await sdb.stock_movement.findMany({
		where: { inventory_item_id: itemId },
		include: MOVEMENT_INCLUDE,
		orderBy: [{ created_at: "desc" }, { id: "desc" }],
		take: take + 1,
		...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
	});

	const hasNext = movements.length > take;
	const page = hasNext ? movements.slice(0, take) : movements;
	const nextCursor = hasNext ? page[page.length - 1].id : null;

	return { err: "", movements: page, nextCursor };
};

// ── Import template ───────────────────────────────────────────────────────────

// ── Provisional items ─────────────────────────────────────────────────────────

export async function listProvisionalItems(orgId: string): Promise<{ err?: string; items?: object[] }> {
	try {
		const items = await db.inventory_item.findMany({
			where: { organization_id: orgId, provisional: true },
			include: {
				created_by_tech: { select: { id: true, name: true } },
				vehicle_stocks: {
					select: { qty_on_hand: true, vehicle: { select: { id: true, name: true } } },
				},
			},
			orderBy: { created_at: "desc" },
			take: 200,
		});
		return { items };
	} catch (e: unknown) {
		log.error({ err: e }, "Failed to list provisional items");
		return { err: "Failed to list provisional items" };
	}
}

export async function approveProvisionalItem(
	itemId: string,
	orgId: string,
	context?: UserContext,
): Promise<{ err?: string; item?: object }> {
	try {
		const claimed = await db.inventory_item.updateMany({
			where: { id: itemId, organization_id: orgId, provisional: true },
			data: { provisional: false, approved_at: new Date(), approved_by_id: context?.dispatcherId ?? null },
		});
		if (claimed.count === 0) return { err: "Provisional item not found" };
		const item = await db.inventory_item.findFirst({ where: { id: itemId } });
		await logActivity({
			event_type: "inventory_item.approved",
			action: "updated",
			entity_type: "inventory_item",
			entity_id: itemId,
			organization_id: orgId,
			...getActorInfo(context),
			changes: { provisional: { old: true, new: false } },
		});
		return { item: item! };
	} catch (e: unknown) {
		log.error({ err: e }, "Failed to approve provisional item");
		return { err: "Failed to approve provisional item" };
	}
}

export async function rejectProvisionalItem(
	itemId: string,
	orgId: string,
	context?: UserContext,
): Promise<{ err?: string }> {
	try {
		const claimed = await db.inventory_item.updateMany({
			where: { id: itemId, organization_id: orgId, provisional: true },
			data: { provisional: false, is_active: false, approved_at: new Date(), approved_by_id: context?.dispatcherId ?? null },
		});
		if (claimed.count === 0) return { err: "Provisional item not found" };
		await logActivity({
			event_type: "inventory_item.rejected",
			action: "updated",
			entity_type: "inventory_item",
			entity_id: itemId,
			organization_id: orgId,
			...getActorInfo(context),
			changes: { is_active: { old: true, new: false }, provisional: { old: true, new: false } },
		});
		return {};
	} catch (e: unknown) {
		log.error({ err: e }, "Failed to reject provisional item");
		return { err: "Failed to reject provisional item" };
	}
}

const mergeSchema = z.object({ target_inventory_item_id: z.string().uuid() });

export async function mergeProvisionalItem(
	itemId: string,
	data: unknown,
	orgId: string,
	context?: UserContext,
): Promise<{ err?: string }> {
	try {
		const parsed = mergeSchema.parse(data);
		if (parsed.target_inventory_item_id === itemId) return { err: "Target must be a different item" };
		await db.$transaction(async (tx) => {
			const prov = await tx.inventory_item.findFirst({
				where: { id: itemId, organization_id: orgId, provisional: true },
			});
			if (!prov) throw new Error("Provisional item not found");

			const target = await tx.inventory_item.findFirst({
				where: { id: parsed.target_inventory_item_id, organization_id: orgId, provisional: false },
			});
			if (!target) throw new Error("Target item not found");

			const provStocks = await tx.vehicle_stock_item.findMany({ where: { inventory_item_id: itemId } });
			for (const ps of provStocks) {
				const existing = await tx.vehicle_stock_item.findFirst({
					where: { vehicle_id: ps.vehicle_id, inventory_item_id: target.id },
				});
				if (existing) {
					await tx.vehicle_stock_item.update({
						where: { id: existing.id },
						data: { qty_on_hand: { increment: ps.qty_on_hand } },
					});
					await tx.vehicle_stock_usage.updateMany({
						where: { stock_item_id: ps.id },
						data: { stock_item_id: existing.id },
					});
					await tx.vehicle_restock_request.updateMany({
						where: { stock_item_id: ps.id },
						data: { stock_item_id: existing.id },
					});
					await tx.vehicle_stock_item.delete({ where: { id: ps.id } });
				} else {
					await tx.vehicle_stock_item.update({
						where: { id: ps.id },
						data: { inventory_item_id: target.id },
					});
				}
			}
			await tx.stock_movement.updateMany({
				where: { inventory_item_id: itemId },
				data: { inventory_item_id: target.id },
			});
			await tx.job_visit_line_item.updateMany({
				where: { inventory_item_id: itemId },
				data: { inventory_item_id: target.id },
			});
			await tx.inventory_item.delete({ where: { id: itemId } });
		});
		await logActivity({
			event_type: "inventory_item.merged",
			action: "deleted",
			entity_type: "inventory_item",
			entity_id: itemId,
			organization_id: orgId,
			...getActorInfo(context),
			changes: { merged_into: { old: null, new: parsed.target_inventory_item_id } },
		});
		return {};
	} catch (e: unknown) {
		if (e instanceof ZodError)
			return { err: `Validation failed: ${e.issues.map((i) => i.message).join(", ")}` };
		if (
			e instanceof Error &&
			(e.message.includes("not found") || e.message.includes("Target"))
		)
			return { err: e.message };
		log.error({ err: e }, "Failed to merge provisional item");
		return { err: "Failed to merge provisional item" };
	}
}

export const getInventoryImportTemplate = (): Buffer => {
	const headers = [
		"name*", "sku", "description", "location*",
		"quantity", "unit_price", "cost", "low_stock_threshold", "alert_email", "tags",
	];
	const example = [
		"HVAC Filter 20x20", "FLT-2020", "Standard 20x20 air filter", "Warehouse A",
		"50", "12.99", "8.00", "10", "alerts@company.com", "filters, warehouse",
	];

	const ws = XLSX.utils.aoa_to_sheet([headers, example]);
	ws["!cols"] = [20, 12, 28, 16, 10, 12, 10, 18, 26, 22].map((wch) => ({ wch }));
	const wb = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(wb, ws, "Inventory Import Template");

	return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
};
