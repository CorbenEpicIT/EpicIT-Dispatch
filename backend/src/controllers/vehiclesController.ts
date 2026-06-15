import { z, ZodError } from "zod";
import { Prisma } from "../../generated/prisma/client.js";
import { log } from "../services/appLogger.js";
import { logActivity, buildChanges } from "../services/logger.js";
import { db } from "../db.js";
import { getScopedDb, UserContext } from "../lib/context.js";
import { utcDayRange } from "../lib/dayRange.js";
import {
	recordMovements,
	lockInventoryRows,
	InsufficientStockError,
	type ActorInfo,
	type MovementInput,
} from "../services/stockMovements.js";
import { fireLowStockAlerts } from "../services/lowStockAlerts.js";
import { recomputeVisitTotals } from "../lib/recomputeDocumentTotals.js";

export type ReadinessState = "not_applicable" | "unknown" | "auto_ready" | "needs_action" | "confirmed";

export type ReadinessGap = {
	inventory_item_id: string;
	name: string;
	qty_needed: number;
	qty_on_hand: number;
	gap: number;
	visit_ids: string[];
};

export type ReadinessResult = {
	state: ReadinessState;
	date: string;
	gaps: ReadinessGap[];
	confirmed?: {
		id: string;
		confirmed_by: string;
		confirmed_at: string;
		notes: string | null;
	};
};

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

function toActor(context?: UserContext): ActorInfo {
	return {
		actor_type: context?.techId ? "technician" : context?.dispatcherId ? "dispatcher" : "system",
		actor_id: context?.techId || context?.dispatcherId,
	};
}

// ── Validation schemas ────────────────────────────────────────────────────────

const createVehicleSchema = z.object({
	name:          z.string().min(1).max(100),
	type:          z.string().min(1).max(50),
	license_plate: z.string().min(1).max(50),
	year:          z.number().int().min(1900).max(2100).nullable().optional(),
	make:          z.string().max(50).nullable().optional(),
	model:         z.string().max(50).nullable().optional(),
	color:         z.string().max(50).nullable().optional(),
	status:        z.enum(["active", "inactive"]).default("active"),
	notes:         z.string().max(1000).nullable().optional(),
});

const updateVehicleSchema = createVehicleSchema.partial();

const addStockItemSchema = z.object({
	inventory_item_id: z.string().uuid(),
	qty_on_hand:       z.number().min(0).default(0),
	qty_min:           z.number().min(0).default(0),
});

const updateStockItemSchema = z.object({
	qty_on_hand:  z.number().min(0).optional(),
	qty_min:      z.number().min(0).optional(),
	qty_standard: z.number().min(0).nullable().optional(),
});

const restockRequestSchema = z.object({
	qty_requested: z.number().positive().nullable().optional(),
	note:          z.string().max(500).nullable().optional(),
});

const completeEodSchema = z.object({
	notes: z.string().max(500).nullable().optional(),
	restock_lines: z
		.array(
			z.object({
				stock_item_id:  z.string().uuid(),
				qty_to_restock: z.number().int().min(0),
			}),
		)
		.refine(
			(lines) => new Set(lines.map((l) => l.stock_item_id)).size === lines.length,
			{ message: "Duplicate stock_item_id entries are not allowed" },
		),
});

// Single source of truth — prevents silent divergence from the Prisma enum
const ADJUSTMENT_TYPES = ["warehouse_exchange", "field_loss", "transfer", "audit", "supplier_purchase"] as const;

const adjustStockSchema = z
	.object({
		type: z.enum(ADJUSTMENT_TYPES),
		note: z.string().max(500).nullable().optional(),
		// Transfer counterparty — when set, transfer adjustments move stock
		// vehicle↔vehicle instead of vehicle↔adjustment
		target_vehicle_id: z.string().uuid().optional(),
		lines: z
			.array(
				z
					.object({
						stock_item_id:     z.string().uuid().optional(),
						inventory_item_id: z.string().uuid().optional(),
						new_item:          z.object({ name: z.string().min(1).max(200), cost: z.number().min(0) }).optional(),
						qty_after:         z.number().min(0),
					})
					.refine(
						(l) => {
							const identifiers = (l.stock_item_id ? 1 : 0) + (l.inventory_item_id ? 1 : 0) + (l.new_item ? 1 : 0);
							return identifiers === 1;
						},
						{ message: "Each line needs exactly one of stock_item_id, inventory_item_id, or new_item" },
					),
			)
			.min(1, "At least one line required")
			.refine(
				(lines) => {
					const ids = lines.map((l) => l.stock_item_id ?? l.inventory_item_id ?? l.new_item?.name);
					return new Set(ids).size === ids.length;
				},
				{ message: "Duplicate line entries are not allowed" },
			),
	})
	.superRefine((data, ctx) => {
		// Warehouse quantity is an Int column — fractional targets would produce
		// fractional warehouse movements, which the ledger rejects
		if (data.type === "warehouse_exchange") {
			data.lines.forEach((line, i) => {
				if (!Number.isInteger(line.qty_after)) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						path: ["lines", i, "qty_after"],
						message: "Warehouse exchange requires whole-number quantities",
					});
				}
			});
		} else if (data.type === "supplier_purchase") {
			// supplier_purchase lines must carry inventory_item_id OR new_item
			// (not stock_item_id), and must have an integer qty > 0
			data.lines.forEach((line, i) => {
				if (line.stock_item_id) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						path: ["lines", i, "stock_item_id"],
						message: "Validation failed: supplier_purchase lines must use inventory_item_id or new_item, not stock_item_id",
					});
				}
				if (line.new_item && !Number.isInteger(line.qty_after)) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						path: ["lines", i, "qty_after"],
						message: "Supplier purchase requires whole-number quantities",
					});
				}
			});
		} else {
			// Adding a new item from the catalog is only meaningful when stock
			// moves to/from the warehouse — reject it for every other type
			data.lines.forEach((line, i) => {
				if (line.inventory_item_id) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						path: ["lines", i, "inventory_item_id"],
						message: "Adding a new item is only allowed for warehouse exchange or supplier_purchase",
					});
				}
				if (line.new_item) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						path: ["lines", i, "new_item"],
						message: "new_item is only allowed for supplier_purchase",
					});
				}
			});
		}
	});

// ── Vehicle CRUD ──────────────────────────────────────────────────────────────

export const listVehicles = async (organizationId: string, status?: string) => {
	const sdb = getScopedDb(organizationId);
	return await sdb.vehicle.findMany({
		where: {
			...(status && { status }),
		},
		include: {
			stock_items: {
				include: { inventory_item: true },
			},
			current_technicians: {
				select: { id: true, name: true },
			},
		},
		orderBy: { name: "asc" },
	});
};

export const getVehicleById = async (id: string, organizationId: string) => {
	const sdb = getScopedDb(organizationId);
	return await sdb.vehicle.findFirst({
		where: { id },
		include: {
			stock_items: {
				include: { inventory_item: true },
				orderBy: [
					{ inventory_item: { category: "asc" } },
					{ inventory_item: { name: "asc" } },
				],
			},
			current_technicians: {
				select: { id: true, name: true },
			},
		},
	});
};

export const createVehicle = async (data: unknown, organizationId: string, context?: UserContext) => {
	try {
		const parsed = createVehicleSchema.parse(data);
		const sdb = getScopedDb(organizationId);
		const vehicle = await sdb.vehicle.create({
			data: {
				...parsed,
				organization_id: organizationId,
			},
		});
		await logActivity({
			event_type: "vehicle.created",
			action: "created",
			entity_type: "vehicle",
			entity_id: vehicle.id,
			organization_id: organizationId,
			...getActorInfo(context),
			changes: {
				name:          { old: null, new: vehicle.name },
				type:          { old: null, new: vehicle.type },
				license_plate: { old: null, new: vehicle.license_plate },
				status:        { old: null, new: vehicle.status },
			},
		});
		return { err: "", item: vehicle };
	} catch (e: unknown) {
		if (e instanceof ZodError) return { err: `Validation failed: ${e.issues.map((i) => i.message).join(", ")}` };
		log.error({ err: e }, "Failed to create vehicle");
		return { err: "Failed to create vehicle" };
	}
};

export const updateVehicle = async (id: string, data: unknown, organizationId: string, context?: UserContext) => {
	try {
		const parsed = updateVehicleSchema.parse(data);
		const sdb = getScopedDb(organizationId);
		const vehicle = await sdb.vehicle.update({
			where: { id },
			data: parsed,
		});
		await logActivity({
			event_type: "vehicle.updated",
			action: "updated",
			entity_type: "vehicle",
			entity_id: vehicle.id,
			organization_id: organizationId,
			...getActorInfo(context),
		});
		return { err: "", item: vehicle };
	} catch (e: unknown) {
		if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") return { err: "Vehicle not found" };
		if (e instanceof ZodError) return { err: `Validation failed: ${e.issues.map((i) => i.message).join(", ")}` };
		log.error({ err: e }, "Failed to update vehicle");
		return { err: "Failed to update vehicle" };
	}
};

// ── Vehicle Stock ─────────────────────────────────────────────────────────────

export const listVehicleStock = async (vehicleId: string, organizationId: string) => {
	const sdb = getScopedDb(organizationId);
	const vehicle = await sdb.vehicle.findFirst({ where: { id: vehicleId } });
	if (!vehicle) return { err: "Vehicle not found", items: null };

	const items = await sdb.vehicle_stock_item.findMany({
		where: { vehicle_id: vehicleId },
		include: { inventory_item: true },
		orderBy: [
			{ inventory_item: { category: "asc" } },
			{ inventory_item: { name: "asc" } },
		],
	});
	return { err: "", items };
};

export const addVehicleStockItem = async (vehicleId: string, data: unknown, organizationId: string, context?: UserContext) => {
	try {
		const parsed = addStockItemSchema.parse(data);
		const sdb = getScopedDb(organizationId);

		const vehicle = await sdb.vehicle.findFirst({ where: { id: vehicleId } });
		if (!vehicle) return { err: "Vehicle not found" };

		const invItem = await sdb.inventory_item.findFirst({ where: { id: parsed.inventory_item_id } });
		if (!invItem) return { err: "Inventory item not found" };

		const existing = await sdb.vehicle_stock_item.findFirst({
			where: { vehicle_id: vehicleId, inventory_item_id: parsed.inventory_item_id },
		});
		if (existing) return { err: "This item is already in the vehicle's stock" };

		const item = await sdb.$transaction(async (tx) => {
			const created = await tx.vehicle_stock_item.create({
				data: {
					vehicle_id:        vehicleId,
					inventory_item_id: parsed.inventory_item_id,
					qty_on_hand:       0,
					qty_min:           parsed.qty_min,
				},
			});

			// Initial qty is ledgered as an audit correction (no warehouse impact —
			// matches prior UX where adding an item never deducted the warehouse)
			if (parsed.qty_on_hand > 0) {
				await recordMovements(tx, organizationId, toActor(context), [
					{
						inventory_item_id:  parsed.inventory_item_id,
						qty:                parsed.qty_on_hand,
						from_location_type: "adjustment",
						to_location_type:   "vehicle",
						to_vehicle_id:      vehicleId,
						reason:             "audit_correction",
						note:               "Initial quantity on stock item add",
					},
				]);
			}

			return tx.vehicle_stock_item.findUniqueOrThrow({
				where: { id: created.id },
				include: { inventory_item: true },
			});
		});
		await logActivity({
			event_type: "vehicle_stock.created",
			action: "created",
			entity_type: "vehicle_stock_item",
			entity_id: item.id,
			organization_id: organizationId,
			...getActorInfo(context),
			changes: {
				qty_on_hand: { old: null, new: item.qty_on_hand },
				qty_min:     { old: null, new: item.qty_min },
			},
		});
		return { err: "", item };
	} catch (e: unknown) {
		if (e instanceof ZodError) return { err: `Validation failed: ${e.issues.map((i) => i.message).join(", ")}` };
		log.error({ err: e }, "Failed to add vehicle stock item");
		return { err: "Failed to add stock item" };
	}
};

export const updateVehicleStockItem = async (vehicleId: string, itemId: string, data: unknown, organizationId: string, context?: UserContext) => {
	try {
		const parsed = updateStockItemSchema.parse(data);
		const sdb = getScopedDb(organizationId);

		const existing = await sdb.vehicle_stock_item.findFirst({
			where: { id: itemId, vehicle_id: vehicleId },
		});
		if (!existing) return { err: "Stock item not found" };

		const item = await sdb.$transaction(async (tx) => {
			// qty_min / qty_standard are metadata — direct writes are fine.
			// qty_on_hand changes go through the ledger as audit corrections
			// (no warehouse impact — manual edit asserts physical truth).
			await tx.vehicle_stock_item.update({
				where: { id: itemId },
				data: {
					...(parsed.qty_min !== undefined && { qty_min: parsed.qty_min }),
					...(parsed.qty_standard !== undefined && { qty_standard: parsed.qty_standard }),
				},
			});

			const delta =
				parsed.qty_on_hand !== undefined
					? parsed.qty_on_hand - Number(existing.qty_on_hand)
					: 0;
			if (delta !== 0) {
				await recordMovements(tx, organizationId, toActor(context), [
					{
						inventory_item_id:  existing.inventory_item_id,
						qty:                Math.abs(delta),
						from_location_type: delta > 0 ? "adjustment" : "vehicle",
						from_vehicle_id:    delta > 0 ? undefined : vehicleId,
						to_location_type:   delta > 0 ? "vehicle" : "adjustment",
						to_vehicle_id:      delta > 0 ? vehicleId : undefined,
						reason:             "audit_correction",
						note:               "Manual stock edit",
					},
				]);
			}

			return tx.vehicle_stock_item.findUniqueOrThrow({
				where: { id: itemId },
				include: { inventory_item: true },
			});
		});
		const changes = buildChanges(existing, parsed as Record<string, unknown>, ["qty_on_hand", "qty_min", "qty_standard"] as const);
		if (Object.keys(changes).length > 0) {
			await logActivity({
				event_type: "vehicle_stock.updated",
				action: "updated",
				entity_type: "vehicle_stock_item",
				entity_id: itemId,
				organization_id: organizationId,
				...getActorInfo(context),
				changes,
			});
		}
		return { err: "", item };
	} catch (e: unknown) {
		if (e instanceof ZodError) return { err: `Validation failed: ${e.issues.map((i) => i.message).join(", ")}` };
		log.error({ err: e }, "Failed to update vehicle stock item");
		return { err: "Failed to update stock item" };
	}
};

export const deleteVehicleStockItem = async (vehicleId: string, itemId: string, organizationId: string, context?: UserContext) => {
	try {
		const sdb = getScopedDb(organizationId);
		const existing = await sdb.vehicle_stock_item.findFirst({
			where: { id: itemId, vehicle_id: vehicleId },
		});
		if (!existing) return { err: "Stock item not found" };

		await sdb.vehicle_stock_item.delete({ where: { id: itemId } });
		await logActivity({
			event_type: "vehicle_stock.deleted",
			action: "deleted",
			entity_type: "vehicle_stock_item",
			entity_id: itemId,
			organization_id: organizationId,
			...getActorInfo(context),
		});
		return { err: "" };
	} catch (e: unknown) {
		log.error({ err: e }, "Failed to delete vehicle stock item");
		return { err: "Failed to delete stock item" };
	}
};

export const createRestockRequest = async (
	vehicleId: string,
	itemId: string,
	data: unknown,
	organizationId: string,
	context?: UserContext,
) => {
	try {
		const parsed = restockRequestSchema.parse(data);

		const ownershipErr = await requireTechOnVehicle(vehicleId, organizationId, context);
		if (ownershipErr) return { err: ownershipErr };
		const technicianId = context!.techId!;

		const stockItem = await db.vehicle_stock_item.findFirst({
			where: { id: itemId, vehicle_id: vehicleId, vehicle: { organization_id: organizationId } },
		});
		if (!stockItem) return { err: "Stock item not found" };

		// Best-effort dup guard — findFirst→create is not atomic; a partial unique
		// index on (stock_item_id) WHERE status='pending' would close the window
		const existing = await db.vehicle_restock_request.findFirst({
			where: { stock_item_id: itemId, status: "pending" },
		});
		if (existing) return { err: "Restock already requested for this item" };

		const request = await db.vehicle_restock_request.create({
			data: {
				stock_item_id:  itemId,
				technician_id:  technicianId,
				qty_requested:  parsed.qty_requested ?? null,
				note:           parsed.note ?? null,
				status:         "pending",
			},
		});
		await logActivity({
			event_type: "vehicle_restock.created",
			action: "created",
			entity_type: "vehicle_restock_request",
			entity_id: request.id,
			organization_id: organizationId,
			actor_type: "technician",
			actor_id: technicianId,
			changes: {
				qty_requested: { old: null, new: request.qty_requested },
				status:        { old: null, new: request.status },
			},
		});
		return { err: "", item: request };
	} catch (e: unknown) {
		if (e instanceof ZodError) return { err: `Validation failed: ${e.issues.map((i) => i.message).join(", ")}` };
		log.error({ err: e }, "Failed to create restock request");
		return { err: "Failed to create restock request" };
	}
};

const RESTOCK_BATCH_MAX = 50; // used by bulk endpoints (Tasks 4-7)

const bulkRestockRequestSchema = z.object({
	items: z
		.array(
			z.object({
				stock_item_id: z.string().uuid(),
				qty_requested: z.number().positive().nullable().optional(),
				note:          z.string().max(500).nullable().optional(),
			}),
		)
		.min(1)
		.max(RESTOCK_BATCH_MAX)
		.refine(
			(items) => new Set(items.map((i) => i.stock_item_id)).size === items.length,
			{ message: "Duplicate stock_item_id entries are not allowed" },
		),
});

export async function createRestockRequestsBulk(
	vehicleId: string,
	data: unknown,
	orgId: string,
	context?: UserContext,
): Promise<{
	err?: string;
	created?: object[];
	skipped?: { stock_item_id: string; reason: string }[];
}> {
	try {
		const parsed = bulkRestockRequestSchema.parse(data);

		const ownershipErr = await requireTechOnVehicle(vehicleId, orgId, context);
		if (ownershipErr) return { err: ownershipErr };
		const technicianId = context!.techId!;

		const result = await db.$transaction(async (tx) => {
			const ids = parsed.items.map((i) => i.stock_item_id);
			const stockItems = await tx.vehicle_stock_item.findMany({
				where: { id: { in: ids }, vehicle_id: vehicleId, vehicle: { organization_id: orgId } },
				select: { id: true },
			});
			const foundIds = new Set(stockItems.map((s: { id: string }) => s.id));

			const pending = await tx.vehicle_restock_request.findMany({
				where: { stock_item_id: { in: [...foundIds] }, status: "pending" },
				select: { stock_item_id: true },
			});
			const pendingIds = new Set(pending.map((p: { stock_item_id: string }) => p.stock_item_id));

			const skipped: { stock_item_id: string; reason: string }[] = [];
			const toCreate: {
				stock_item_id: string;
				technician_id: string;
				qty_requested: number | null;
				note: string | null;
				status: string;
			}[] = [];
			for (const item of parsed.items) {
				if (pendingIds.has(item.stock_item_id)) {
					skipped.push({ stock_item_id: item.stock_item_id, reason: "already_pending" });
				} else if (!foundIds.has(item.stock_item_id)) {
					skipped.push({ stock_item_id: item.stock_item_id, reason: "not_found" });
				} else {
					toCreate.push({
						stock_item_id: item.stock_item_id,
						technician_id: technicianId,
						qty_requested: item.qty_requested ?? null,
						note:          item.note ?? null,
						status:        "pending",
					});
				}
			}

			const created = toCreate.length
				? await tx.vehicle_restock_request.createManyAndReturn({ data: toCreate })
				: [];
			return { created, skipped };
		});

		if (result.created.length > 0) {
			await logActivity({
				event_type: "vehicle_restock.created",
				action: "created",
				entity_type: "vehicle_restock_request",
				entity_id: vehicleId, // batch — keyed to the vehicle
				organization_id: orgId,
				actor_type: "technician",
				actor_id: technicianId,
				changes: { batch_count: { old: null, new: result.created.length } },
			});
		}
		return { err: "", created: result.created, skipped: result.skipped };
	} catch (e: unknown) {
		if (e instanceof ZodError) return { err: `Validation failed: ${e.issues.map((i) => i.message).join(", ")}` };
		log.error({ err: e }, "Failed to create restock requests");
		return { err: "Failed to create restock requests" };
	}
}

// ── Restock request lifecycle (list / fulfill / dismiss) ──────────────────────

const fulfillRestockSchema = z.object({
	qty: z.number().int().positive().optional(),
});

// vehicle_restock_request has no organization_id column — org scoping goes
// through stock_item.vehicle (same pattern as getUsageToday).
const restockRequestScope = (orgId: string, extra: Record<string, unknown> = {}) => ({
	...extra,
	stock_item: { vehicle: { organization_id: orgId } },
});

async function requireTechOnVehicle(
	vehicleId: string,
	orgId: string,
	context?: UserContext,
): Promise<string | null> {
	if (!context?.techId) return "Only technicians can perform this action";
	const tech = await db.technician.findFirst({
		where: { id: context.techId, organization_id: orgId },
		select: { current_vehicle_id: true },
	});
	if (!tech || tech.current_vehicle_id !== vehicleId) {
		return "Technician is not assigned to this vehicle";
	}
	return null;
}

// Sum of restock movements linked to a request = the fulfilled quantity
// (the request row itself never stores it)
function sumFulfilledQty(movements: { qty: unknown }[]): number {
	return movements.reduce((sum, m) => sum + Number(m.qty), 0);
}

export async function listRestockRequests(
	orgId: string,
	status?: string,
	vehicleId?: string,
): Promise<{ err?: string; requests?: object[] }> {
	try {
		const requests = await db.vehicle_restock_request.findMany({
			where: {
				...(status ? { status } : {}),
				stock_item: {
					vehicle: { organization_id: orgId, ...(vehicleId ? { id: vehicleId } : {}) },
				},
			},
			include: {
				stock_item: {
					include: {
						inventory_item: { select: { id: true, name: true, unit: true, quantity: true } },
						vehicle: { select: { id: true, name: true } },
					},
				},
			},
			orderBy: { created_at: "desc" },
			take: 100,
		});

		// No technician relation on the model — merge names with a second query
		const techIds = [...new Set(requests.map((r) => r.technician_id))];
		const techs = techIds.length
			? await db.technician.findMany({
					where: { id: { in: techIds }, organization_id: orgId },
					select: { id: true, name: true },
				})
			: [];
		const techById = new Map(techs.map((t) => [t.id, t]));

		return {
			requests: requests.map((r) => ({
				...r,
				technician: techById.get(r.technician_id) ?? null,
			})),
		};
	} catch (e: unknown) {
		log.error({ err: e }, "Failed to list restock requests");
		return { err: "Failed to list restock requests" };
	}
}

const RESOLVED_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export async function listVehicleRestockRequests(
	vehicleId: string,
	orgId: string,
	context?: UserContext,
): Promise<{ err?: string; requests?: object[] }> {
	try {
		// Technicians must be on the vehicle; dispatch perms pass through unchecked
		if (context?.techId) {
			const ownershipErr = await requireTechOnVehicle(vehicleId, orgId, context);
			if (ownershipErr) return { err: ownershipErr };
		}

		const since = new Date(Date.now() - RESOLVED_WINDOW_MS);
		const requests = await db.vehicle_restock_request.findMany({
			where: {
				stock_item: { vehicle: { id: vehicleId, organization_id: orgId } },
				OR: [
					{ status: "pending" },
					{ status: "fulfilled", received_at: null },
					{ status: "fulfilled", received_at: { not: null }, fulfilled_at: { gte: since } },
					// dismissed rows have no resolution timestamp — created_at approximates the window
					{ status: "dismissed", created_at: { gte: since } },
				],
			},
			include: {
				stock_item: {
					include: {
						inventory_item: { select: { id: true, name: true, unit: true, quantity: true } },
					},
				},
				stock_movements: { where: { reason: "restock" }, select: { qty: true } },
			},
			orderBy: { created_at: "desc" },
			take: 200,
		});

		return {
			requests: requests.map((r) => ({
				...r,
				qty_fulfilled: r.stock_movements.length ? sumFulfilledQty(r.stock_movements) : null,
				stock_movements: undefined,
			})),
		};
	} catch (e: unknown) {
		log.error({ err: e }, "Failed to list vehicle restock requests");
		return { err: "Failed to list vehicle restock requests" };
	}
}

async function fulfillOne(
	requestId: string,
	qtyOverride: number | undefined,
	orgId: string,
	context?: UserContext,
): Promise<{ request: object; lowStockItemIds: string[] }> {
	let lowStockItemIds: string[] = [];

	const updated = await db.$transaction(async (tx) => {
		const request = await tx.vehicle_restock_request.findFirst({
			where: restockRequestScope(orgId, { id: requestId }),
			include: { stock_item: true },
		});
		if (!request) throw new StockItemNotFoundError("Restock request not found");
		if (request.status !== "pending") {
			throw new RequestNotPendingError(`Request is already ${request.status}`);
		}

		const qty = qtyOverride ?? (request.qty_requested !== null ? Math.ceil(Number(request.qty_requested)) : null);
		if (!qty || qty <= 0) throw new QuantityRequiredError("Quantity required to fulfill");

		// Guarded claim before any movement — a concurrent fulfill/dismiss that already
		// flipped the status makes count 0 and we bail with nothing recorded
		const claimed = await tx.vehicle_restock_request.updateMany({
			where: { id: requestId, status: "pending" },
			data: { status: "fulfilled", fulfilled_at: new Date() },
		});
		if (claimed.count === 0) {
			throw new RequestNotPendingError("Request is already fulfilled or dismissed");
		}

		const result = await recordMovements(tx, orgId, toActor(context), [
			{
				inventory_item_id:  request.stock_item.inventory_item_id,
				qty,
				from_location_type: "warehouse",
				to_location_type:   "vehicle",
				to_vehicle_id:      request.stock_item.vehicle_id,
				reason:             "restock",
				restock_request_id: requestId,
			},
		]);
		lowStockItemIds = result.lowStockItemIds;

		return tx.vehicle_restock_request.findFirst({ where: { id: requestId } });
	});

	await logActivity({
		event_type: "vehicle_restock.fulfilled",
		action: "updated",
		entity_type: "vehicle_restock_request",
		entity_id: requestId,
		organization_id: orgId,
		...getActorInfo(context),
		changes: { status: { old: "pending", new: "fulfilled" } },
	});

	return { request: updated!, lowStockItemIds };
}

export async function fulfillRestockRequest(
	requestId: string,
	data: unknown,
	orgId: string,
	context?: UserContext,
): Promise<{ err?: string; available?: Record<string, number>; request?: object }> {
	try {
		const parsed = fulfillRestockSchema.parse(data);
		const { request, lowStockItemIds } = await fulfillOne(requestId, parsed.qty, orgId, context);
		fireLowStockAlerts(lowStockItemIds, orgId).catch(() => {});
		return { request };
	} catch (e: unknown) {
		if (e instanceof ZodError) return { err: `Validation failed: ${e.issues.map((i) => i.message).join(", ")}` };
		if (e instanceof StockItemNotFoundError) return { err: e.message };
		if (e instanceof RequestNotPendingError) return { err: e.message };
		if (e instanceof QuantityRequiredError) return { err: e.message };
		if (e instanceof InsufficientStockError) {
			return { err: "insufficient_warehouse_stock", available: e.available };
		}
		log.error({ err: e }, "Failed to fulfill restock request");
		return { err: "Failed to fulfill restock request" };
	}
}

const bulkFulfillSchema = z.object({
	items: z
		.array(
			z.object({
				request_id: z.string().uuid(),
				qty:        z.number().int().positive(),
			}),
		)
		.min(1)
		.max(RESTOCK_BATCH_MAX)
		.refine(
			(items) => new Set(items.map((i) => i.request_id)).size === items.length,
			{ message: "Duplicate request_id entries are not allowed" },
		),
});

export async function fulfillRestockRequestsBulk(
	data: unknown,
	orgId: string,
	context?: UserContext,
): Promise<{
	err?: string;
	fulfilled?: object[];
	failed?: { request_id: string; error: string; available?: Record<string, number> }[];
}> {
	try {
		const parsed = bulkFulfillSchema.parse(data);
		const fulfilled: object[] = [];
		const failed: { request_id: string; error: string; available?: Record<string, number> }[] = [];
		const lowStock = new Set<string>();

		// Per-item transaction (best-effort) — one bad item never blocks the rest
		for (const item of parsed.items) {
			try {
				const r = await fulfillOne(item.request_id, item.qty, orgId, context);
				r.lowStockItemIds.forEach((id) => lowStock.add(id));
				fulfilled.push(r.request);
			} catch (e: unknown) {
				if (e instanceof InsufficientStockError) {
					failed.push({ request_id: item.request_id, error: "insufficient_warehouse_stock", available: e.available });
				} else if (
					e instanceof StockItemNotFoundError ||
					e instanceof RequestNotPendingError ||
					e instanceof QuantityRequiredError
				) {
					failed.push({ request_id: item.request_id, error: e.message });
				} else {
					throw e;
				}
			}
		}

		fireLowStockAlerts([...lowStock], orgId).catch(() => {});
		return { fulfilled, failed };
	} catch (e: unknown) {
		if (e instanceof ZodError) return { err: `Validation failed: ${e.issues.map((i) => i.message).join(", ")}` };
		log.error({ err: e }, "Failed to bulk fulfill restock requests");
		return { err: "Failed to bulk fulfill restock requests" };
	}
}


const confirmReceiptSchema = z.object({
	items: z
		.array(
			z.object({
				request_id:   z.string().uuid(),
				qty_received: z.number().int().min(0),
			}),
		)
		.min(1)
		.max(RESTOCK_BATCH_MAX)
		.refine(
			(items) => new Set(items.map((i) => i.request_id)).size === items.length,
			{ message: "Duplicate request_id entries are not allowed" },
		),
});

export async function confirmRestockReceipts(
	vehicleId: string,
	data: unknown,
	orgId: string,
	context?: UserContext,
): Promise<{
	err?: string;
	confirmed?: object[];
	failed?: { request_id: string; error: string }[];
}> {
	try {
		const parsed = confirmReceiptSchema.parse(data);

		const ownershipErr = await requireTechOnVehicle(vehicleId, orgId, context);
		if (ownershipErr) return { err: ownershipErr };

		const confirmed: object[] = [];
		const failed: { request_id: string; error: string }[] = [];

		for (const item of parsed.items) {
			try {
				const updated = await db.$transaction(async (tx) => {
					const request = await tx.vehicle_restock_request.findFirst({
						where: {
							id: item.request_id,
							stock_item: { vehicle: { id: vehicleId, organization_id: orgId } },
						},
						include: {
							stock_item: true,
							stock_movements: { where: { reason: "restock" }, select: { qty: true } },
						},
					});
					if (!request) throw new StockItemNotFoundError("Restock request not found");
					if (request.status !== "fulfilled") {
						throw new RequestNotPendingError("Request is not fulfilled");
					}

					const expected = sumFulfilledQty(request.stock_movements);
					const delta = item.qty_received - expected;

					// Guarded — double-confirm loses here, before any adjustment movement
					const claimed = await tx.vehicle_restock_request.updateMany({
						where: { id: item.request_id, received_at: null },
						data: {
							received_at:  new Date(),
							qty_received: item.qty_received,
							discrepant:   delta !== 0,
						},
					});
					if (claimed.count === 0) throw new RequestNotPendingError("Receipt already confirmed");

					if (delta !== 0) {
						await recordMovements(tx, orgId, toActor(context), [
							delta < 0
								? {
										inventory_item_id:  request.stock_item.inventory_item_id,
										qty:                -delta,
										from_location_type: "vehicle",
										from_vehicle_id:    vehicleId,
										to_location_type:   "adjustment",
										reason:             "audit_correction",
										restock_request_id: request.id,
									}
								: {
										inventory_item_id:  request.stock_item.inventory_item_id,
										qty:                delta,
										from_location_type: "adjustment",
										to_location_type:   "vehicle",
										to_vehicle_id:      vehicleId,
										reason:             "audit_correction",
										restock_request_id: request.id,
									},
						]);
					}

					return tx.vehicle_restock_request.findFirst({ where: { id: item.request_id } });
				});

				confirmed.push(updated!);
				await logActivity({
					event_type: "vehicle_restock.received",
					action: "updated",
					entity_type: "vehicle_restock_request",
					entity_id: item.request_id,
					organization_id: orgId,
					...getActorInfo(context),
					changes: { qty_received: { old: null, new: item.qty_received } },
				});
			} catch (e: unknown) {
				if (e instanceof StockItemNotFoundError || e instanceof RequestNotPendingError) {
					failed.push({ request_id: item.request_id, error: e.message });
				} else {
					throw e;
				}
			}
		}

		return { confirmed, failed };
	} catch (e: unknown) {
		if (e instanceof ZodError) return { err: `Validation failed: ${e.issues.map((i) => i.message).join(", ")}` };
		log.error({ err: e }, "Failed to confirm restock receipts");
		return { err: "Failed to confirm restock receipts" };
	}
}

export async function markRestockReceived(
	requestId: string,
	orgId: string,
	context?: UserContext,
): Promise<{ err?: string; request?: object }> {
	try {
		const updated = await db.$transaction(async (tx) => {
			const request = await tx.vehicle_restock_request.findFirst({
				where: restockRequestScope(orgId, { id: requestId }),
				include: { stock_movements: { where: { reason: "restock" }, select: { qty: true } } },
			});
			if (!request) throw new StockItemNotFoundError("Restock request not found");
			if (request.status !== "fulfilled") throw new RequestNotPendingError("Request is not fulfilled");

			const claimed = await tx.vehicle_restock_request.updateMany({
				where: { id: requestId, received_at: null },
				data: {
					received_at:  new Date(),
					qty_received: sumFulfilledQty(request.stock_movements),
				},
			});
			if (claimed.count === 0) throw new RequestNotPendingError("Receipt already confirmed");

			return tx.vehicle_restock_request.findFirst({ where: { id: requestId } });
		});

		await logActivity({
			event_type: "vehicle_restock.received",
			action: "updated",
			entity_type: "vehicle_restock_request",
			entity_id: requestId,
			organization_id: orgId,
			...getActorInfo(context),
			changes: { received_override: { old: null, new: true } },
		});

		return { request: updated! };
	} catch (e: unknown) {
		if (e instanceof StockItemNotFoundError) return { err: e.message };
		if (e instanceof RequestNotPendingError) return { err: e.message };
		log.error({ err: e }, "Failed to mark restock received");
		return { err: "Failed to mark restock received" };
	}
}
export async function dismissRestockRequest(
	requestId: string,
	orgId: string,
	context?: UserContext,
): Promise<{ err?: string; request?: object }> {
	try {
		const claimed = await db.vehicle_restock_request.updateMany({
			where: {
				id: requestId,
				status: "pending",
				stock_item: { vehicle: { organization_id: orgId } },
			},
			data: { status: "dismissed", dismissed_reason: "dispatch" },
		});
		if (claimed.count === 0) {
			const existing = await db.vehicle_restock_request.findFirst({
				where: restockRequestScope(orgId, { id: requestId }),
			});
			if (!existing) return { err: "Restock request not found" };
			return { err: `Request is already ${existing.status}` };
		}

		const updated = await db.vehicle_restock_request.findFirst({
			where: restockRequestScope(orgId, { id: requestId }),
		});

		await logActivity({
			event_type: "vehicle_restock.dismissed",
			action: "updated",
			entity_type: "vehicle_restock_request",
			entity_id: requestId,
			organization_id: orgId,
			...getActorInfo(context),
			changes: { status: { old: "pending", new: "dismissed" } },
		});

		return { request: updated! };
	} catch (e: unknown) {
		log.error({ err: e }, "Failed to dismiss restock request");
		return { err: "Failed to dismiss restock request" };
	}
}

// ── Technician vehicle assignment ─────────────────────────────────────────────

export const setTechnicianVehicle = async (technicianId: string, vehicleId: string | null, organizationId: string) => {
	try {
		const sdb = getScopedDb(organizationId);
		if (vehicleId !== null) {
			const vehicle = await sdb.vehicle.findFirst({ where: { id: vehicleId } });
			if (!vehicle) return { err: "Vehicle not found" };
		}

		const technician = await sdb.technician.update({
			where: { id: technicianId },
			data: { current_vehicle_id: vehicleId },
			select: { id: true, name: true, current_vehicle_id: true, current_vehicle: true },
		});
		await logActivity({
			event_type: "technician.vehicle_assigned",
			action: "updated",
			entity_type: "technician",
			entity_id: technicianId,
			organization_id: organizationId,
			actor_type: "system",
			actor_id: null,
			changes: { current_vehicle_id: { old: null, new: vehicleId } },
		});
		return { err: "", item: technician };
	} catch (e: unknown) {
		if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") return { err: "Technician not found" };
		log.error({ err: e }, "Failed to set technician vehicle");
		return { err: "Failed to set vehicle" };
	}
};

// ── Parts used (visit-level stock deduction) ──────────────────────────────────

const addPartsUsedSchema = z.object({
	stock_item_id: z.string().uuid(),
	qty_used:      z.number().positive(),
	technician_id: z.string().uuid(),
});

export const addPartsUsed = async (visitId: string, data: unknown, organizationId: string) => {
	try {
		const parsed = addPartsUsedSchema.parse(data);
		const sdb = getScopedDb(organizationId);

		const stockItem = await sdb.vehicle_stock_item.findFirst({
			where: { id: parsed.stock_item_id },
			include: { inventory_item: true },
		});
		if (!stockItem) return { err: "Stock item not found" };

		const visit = await sdb.job_visit.findFirst({ where: { id: visitId } });
		if (!visit) return { err: "Visit not found" };

		const result = await sdb.$transaction(async (tx) => {
			// Create line item first — the movement links to it
			const unitPrice = stockItem.inventory_item.unit_price ?? 0;
			const qty = parsed.qty_used;
			const lineItem = await tx.job_visit_line_item.create({
				data: {
					visit_id:           visitId,
					name:               stockItem.inventory_item.name,
					quantity:           qty,
					unit_price:         unitPrice,
					total:              Number(unitPrice) * qty,
					source:             "field_addition",
					item_type:          "material",
					sort_order:         0,
					inventory_item_id:  stockItem.inventory_item_id,
					fulfillment_status: "used",
				},
			});

			// Vehicle decrement happens inside recordMovements. allowNegative: field
			// truth wins — negatives surface as dispatcher discrepancies.
			await recordMovements(
				tx,
				organizationId,
				{ actor_type: "technician", actor_id: parsed.technician_id },
				[
					{
						inventory_item_id:  stockItem.inventory_item_id,
						qty:                parsed.qty_used,
						from_location_type: "vehicle",
						from_vehicle_id:    stockItem.vehicle_id,
						to_location_type:   "consumed",
						reason:             "parts_used",
						visit_id:           visitId,
						visit_line_item_id: lineItem.id,
					},
				],
				{ allowNegative: true },
			);

			// Record usage
			const usage = await tx.vehicle_stock_usage.create({
				data: {
					stock_item_id:      parsed.stock_item_id,
					visit_id:           visitId,
					technician_id:      parsed.technician_id,
					qty_used:           qty,
					visit_line_item_id: lineItem.id,
				},
			});

			await recomputeVisitTotals(visitId, organizationId, tx as unknown as Prisma.TransactionClient);

			return { lineItem, usage };
		});

		await logActivity({
			event_type: "vehicle_stock.parts_used",
			action: "updated",
			entity_type: "vehicle_stock_item",
			entity_id: parsed.stock_item_id,
			organization_id: organizationId,
			actor_type: "technician",
			actor_id: parsed.technician_id,
			changes: { qty_used: { old: null, new: parsed.qty_used } },
		});
		return { err: "", item: result };
	} catch (e: unknown) {
		if (e instanceof ZodError) return { err: `Validation failed: ${e.issues.map((i) => i.message).join(", ")}` };
		log.error({ err: e }, "Failed to add parts used");
		return { err: "Failed to add parts used" };
	}
};

// ── Apply Fill ────────────────────────────────────────────────────────────────

export interface FillToStandardLine {
	inventory_item_id: string;
	qty_moved: number;
	shortfall: number;
}

const applyFillSchema = z.object({
	lines: z
		.array(z.object({ inventory_item_id: z.string().uuid(), qty: z.number().int().positive() }))
		.min(1, "At least one line required"),
});

export async function applyFill(
	vehicleId: string,
	data: unknown,
	orgId: string,
	context?: UserContext,
): Promise<{ err?: string; lines?: FillToStandardLine[] }> {
	try {
		const parsed = applyFillSchema.parse(data);
		const sdb = getScopedDb(orgId);
		const vehicle = await sdb.vehicle.findFirst({ where: { id: vehicleId } });
		if (!vehicle) return { err: "Vehicle not found" };

		let lowStockItemIds: string[] = [];
		const lines = await sdb.$transaction(async (tx) => {
			const itemIds = [...new Set(parsed.lines.map((l) => l.inventory_item_id))].sort();
			await lockInventoryRows(tx, itemIds);
			const items = await tx.inventory_item.findMany({
				where: { id: { in: itemIds } },
				select: { id: true, quantity: true },
			});
			const availableById = new Map<string, number>(
				items.map((i: { id: string; quantity: number }) => [i.id, Number(i.quantity)]),
			);

			const computed: FillToStandardLine[] = [];
			const movements: MovementInput[] = [];
			for (const line of parsed.lines) {
				const available = Math.max(0, availableById.get(line.inventory_item_id) ?? 0);
				const moved = Math.min(line.qty, available);
				computed.push({
					inventory_item_id: line.inventory_item_id,
					qty_moved: moved,
					shortfall: line.qty - moved,
				});
				if (moved > 0) {
					availableById.set(line.inventory_item_id, available - moved);
					movements.push({
						inventory_item_id: line.inventory_item_id,
						qty: moved,
						from_location_type: "warehouse",
						to_location_type: "vehicle",
						to_vehicle_id: vehicleId,
						reason: "restock",
					});
				}
			}
			const result = await recordMovements(tx, orgId, toActor(context), movements);
			lowStockItemIds = result.lowStockItemIds;
			return computed;
		});

		fireLowStockAlerts(lowStockItemIds, orgId).catch(() => {});
		if (lines.some((l) => l.qty_moved > 0)) {
			await logActivity({
				event_type: "vehicle_stock.fill_to_standard",
				action: "updated",
				entity_type: "vehicle",
				entity_id: vehicleId,
				organization_id: orgId,
				...getActorInfo(context),
				changes: { lines_filled: { old: null, new: lines.filter((l) => l.qty_moved > 0).length } },
			});
		}

		return { lines };
	} catch (e: unknown) {
		if (e instanceof ZodError) return { err: `Validation failed: ${e.issues.map((i) => i.message).join(", ")}` };
		log.error({ err: e }, "Failed to apply fill");
		return { err: "Failed to apply fill" };
	}
}

// ── Fill Plan (dry-run) ───────────────────────────────────────────────────────

export interface FillPlanLine {
	inventory_item_id: string;
	name: string;
	unit: string;
	on_hand: number;
	target: number;
	suggested_qty: number;
	warehouse_available: number;
}

export interface FillPlan {
	standard: FillPlanLine[];
	visits: FillPlanLine[];
}

export async function getFillPlan(
	vehicleId: string,
	orgId: string,
	_getReadiness: typeof getVehicleReadiness = getVehicleReadiness,
): Promise<{ err?: string; plan?: FillPlan }> {
	try {
		const sdb = getScopedDb(orgId);
		const vehicle = await sdb.vehicle.findFirst({ where: { id: vehicleId } });
		if (!vehicle) return { err: "Vehicle not found" };

		const stockItems = await sdb.vehicle_stock_item.findMany({
			where: { vehicle_id: vehicleId },
			include: { inventory_item: { select: { id: true, name: true, unit: true, quantity: true } } },
		});

		// Visit demand for today
		const today = new Date().toISOString().slice(0, 10);
		const readiness = await _getReadiness(vehicleId, orgId, today);
		if (readiness.err) return { err: readiness.err };
		const needByItem = new Map<string, { name: string; qty_needed: number }>();
		for (const g of readiness.item?.gaps ?? []) {
			needByItem.set(g.inventory_item_id, { name: g.name, qty_needed: g.qty_needed });
		}

		const standard: FillPlanLine[] = [];
		const visits: FillPlanLine[] = [];
		const seen = new Set<string>();

		for (const s of stockItems) {
			const invId = s.inventory_item.id;
			seen.add(invId);
			const onHand = Number(s.qty_on_hand);
			const std = s.qty_standard !== null ? Number(s.qty_standard) : null;
			const warehouse = Number(s.inventory_item.quantity);
			const standardFill = std !== null && onHand < std ? Math.ceil(std - onHand) : 0;
			const afterStandard = onHand + standardFill;
			const visitNeed = needByItem.get(invId)?.qty_needed ?? 0;
			const visitExtra = visitNeed > afterStandard ? Math.ceil(visitNeed - afterStandard) : 0;

			if (standardFill > 0) {
				standard.push({
					inventory_item_id: invId,
					name: s.inventory_item.name,
					unit: s.inventory_item.unit,
					on_hand: onHand,
					target: std!,
					suggested_qty: standardFill,
					warehouse_available: warehouse,
				});
			}
			if (visitExtra > 0) {
				visits.push({
					inventory_item_id: invId,
					name: s.inventory_item.name,
					unit: s.inventory_item.unit,
					on_hand: onHand,
					target: visitNeed,
					suggested_qty: visitExtra,
					warehouse_available: warehouse,
				});
			}
		}

		// Items needed by visits that aren't on the truck at all
		const missingIds = [...needByItem.keys()].filter((id) => !seen.has(id));
		if (missingIds.length) {
			const invs = await sdb.inventory_item.findMany({
				where: { id: { in: missingIds }, provisional: false },
				select: { id: true, name: true, unit: true, quantity: true },
			});
			for (const inv of invs) {
				const need = needByItem.get(inv.id)!.qty_needed;
				visits.push({
					inventory_item_id: inv.id,
					name: inv.name,
					unit: inv.unit,
					on_hand: 0,
					target: need,
					suggested_qty: Math.ceil(need),
					warehouse_available: Number(inv.quantity),
				});
			}
		}

		return { plan: { standard, visits } };
	} catch (e: unknown) {
		log.error({ err: e }, "Failed to compute fill plan");
		return { err: "Failed to compute fill plan" };
	}
}

// ── Complete EOD ──────────────────────────────────────────────────────────────

export async function completeEod(
	vehicleId: string,
	data: unknown,
	orgId: string,
	context?: UserContext,
): Promise<{ err?: string; record?: object }> {
	try {
		const parsed = completeEodSchema.parse(data);
		const sdb = getScopedDb(orgId);

		const vehicle = await sdb.vehicle.findFirst({ where: { id: vehicleId } });
		if (!vehicle) return { err: "Vehicle not found" };

		const actorId = context?.dispatcherId ?? context?.techId;
		if (!actorId) return { err: "Actor context required" };

		type EodComputedLine = {
			stock_item_id:     string;
			inventory_item_id: string;
			qty_restocked:     number;
			qty_shortfall:     number;
		};

		let lowStockItemIds: string[] = [];

		const record = await sdb.$transaction(async (tx) => {
			// Record created first — the (vehicle_id, day) unique constraint is the
			// duplicate-EOD guard, raced-safe unlike a pre-tx findFirst.
			const eodRecord = await tx.vehicle_eod_record.create({
				data: {
					vehicle_id:           vehicleId,
					organization_id:      orgId,
					completed_at:         new Date(),
					day:                  utcDayRange().start,
					completed_by_id:      context?.dispatcherId ?? null,
					completed_by_tech_id: context?.dispatcherId ? null : (context?.techId ?? null),
					notes:                parsed.notes ?? null,
				},
			});

			// Validate and compute inside the transaction to avoid TOCTOU
			const stockItemIds = parsed.restock_lines.map((l) => l.stock_item_id);
			const stockItems = await tx.vehicle_stock_item.findMany({
				where: { id: { in: stockItemIds }, vehicle_id: vehicleId },
			});

			// Validate all requested items belong to this vehicle
			if (stockItems.length !== new Set(stockItemIds).size) {
				throw new Error("One or more stock items not found on this vehicle");
			}

			// Lock warehouse rows, then read availability for cap math
			const itemIds = [...new Set(stockItems.map((s) => s.inventory_item_id))].sort();
			await lockInventoryRows(tx, itemIds);
			const items = await tx.inventory_item.findMany({
				where: { id: { in: itemIds } },
				select: { id: true, quantity: true },
			});
			const availableById = new Map(items.map((i: { id: string; quantity: number }) => [i.id, Number(i.quantity)]));

			const computedLines: EodComputedLine[] = parsed.restock_lines.map((line) => {
				const stockItem = stockItems.find((s) => s.id === line.stock_item_id);
				if (!stockItem) throw new Error(`Stock item ${line.stock_item_id} not found`);
				const available = Math.max(0, availableById.get(stockItem.inventory_item_id) ?? 0);
				const actual = Math.min(line.qty_to_restock, available);
				return {
					stock_item_id:     line.stock_item_id,
					inventory_item_id: stockItem.inventory_item_id,
					qty_restocked:     actual,
					qty_shortfall:     line.qty_to_restock - actual,
				};
			});

			const movements: MovementInput[] = computedLines
				.filter((l) => l.qty_restocked > 0)
				.map((l) => ({
					inventory_item_id:  l.inventory_item_id,
					qty:                l.qty_restocked,
					from_location_type: "warehouse",
					to_location_type:   "vehicle",
					to_vehicle_id:      vehicleId,
					reason:             "restock",
					eod_record_id:      eodRecord.id,
				}));
			const result = await recordMovements(tx, orgId, toActor(context), movements);
			lowStockItemIds = result.lowStockItemIds;

			await tx.vehicle_eod_restock_line.createMany({
				data: computedLines.map((l) => ({
					eod_record_id: eodRecord.id,
					stock_item_id: l.stock_item_id,
					qty_restocked: l.qty_restocked,
					qty_shortfall: l.qty_shortfall,
				})),
			});

			return tx.vehicle_eod_record.findUniqueOrThrow({
				where: { id: eodRecord.id },
				include: {
					restock_lines: true,
					completed_by: { select: { id: true, name: true } },
					completed_by_tech: { select: { id: true, name: true } },
				},
			});
		});

		fireLowStockAlerts(lowStockItemIds, orgId).catch(() => {});

		await logActivity({
			event_type: "vehicle_eod.completed",
			action: "created",
			entity_type: "vehicle_eod_record",
			entity_id: record.id,
			organization_id: orgId,
			...getActorInfo(context),
			changes: {
				restock_line_count: { old: null, new: record.restock_lines.length },
			},
		});

		return { record };
	} catch (e: unknown) {
		if (e instanceof ZodError) return { err: `Validation failed: ${e.issues.map((i) => i.message).join(", ")}` };
		if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
			return { err: "EOD already completed for today" };
		}
		log.error({ err: e }, "Failed to complete EOD");
		return { err: "Failed to complete EOD" };
	}
}

// ── Get EOD Today ─────────────────────────────────────────────────────────────

export async function getEodToday(
	vehicleId: string,
	orgId: string,
): Promise<{ err?: string; record?: object | null }> {
	const sdb = getScopedDb(orgId);

	const vehicle = await sdb.vehicle.findFirst({ where: { id: vehicleId } });
	if (!vehicle) return { err: "Vehicle not found" };

	const { start: startUTC, end: endUTC } = utcDayRange();

	const record = await sdb.vehicle_eod_record.findFirst({
		where: { vehicle_id: vehicleId, completed_at: { gte: startUTC, lt: endUTC } },
		include: {
			restock_lines: true,
			completed_by: { select: { id: true, name: true } },
			completed_by_tech: { select: { id: true, name: true } },
		},
	});

	return { record: record ?? null };
}

// ── Adjust Stock ──────────────────────────────────────────────────────────────

class StockItemNotFoundError extends Error {}
class RequestNotPendingError extends Error {}
class QuantityRequiredError extends Error {}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveOrCreateSupplierItem(
	tx: any,
	orgId: string,
	line: { inventory_item_id?: string; new_item?: { name: string; cost: number } },
	context?: UserContext,
): Promise<string> {
	if (line.inventory_item_id) {
		const inv = await tx.inventory_item.findFirst({
			where: { id: line.inventory_item_id, organization_id: orgId },
			select: { id: true },
		});
		if (!inv) throw new StockItemNotFoundError("Inventory item not found");
		return inv.id;
	}
	const created = await tx.inventory_item.create({
		data: {
			organization_id:    orgId,
			name:               line.new_item!.name,
			description:        "",
			location:           "",
			quantity:           0,
			cost:               line.new_item!.cost,
			unit_price:         line.new_item!.cost,
			provisional:        true,
			created_by_tech_id: context?.techId ?? null,
		},
		select: { id: true },
	});
	return created.id;
}

export async function adjustStock(
	vehicleId: string,
	data: unknown,
	orgId: string,
	context?: UserContext,
): Promise<{ err?: string; available?: Record<string, number>; adjustment?: object }> {
	try {
		const sdb = getScopedDb(orgId);

		const vehicle = await sdb.vehicle.findFirst({ where: { id: vehicleId } });
		if (!vehicle) return { err: "Vehicle not found" };

		const actorId = context?.dispatcherId ?? context?.techId;
		if (!actorId) return { err: "Actor context required" };

		const parsed = adjustStockSchema.parse(data);

		if (parsed.target_vehicle_id) {
			if (parsed.type !== "transfer") {
				return { err: "target_vehicle_id is only valid for transfer adjustments" };
			}
			if (parsed.target_vehicle_id === vehicleId) {
				return { err: "Transfer target must be a different vehicle" };
			}
			const target = await sdb.vehicle.findFirst({ where: { id: parsed.target_vehicle_id } });
			if (!target) return { err: "Target vehicle not found" };
		}

		type AdjustComputedLine = {
			stock_item_id:     string;
			inventory_item_id: string;
			qty_before:        number;
			qty_after:         number;
			delta:             number;
			inventory_impact:  number;
		};

		let lowStockItemIds: string[] = [];

		const adjustment = await sdb.$transaction(async (tx) => {
			// Existing on-truck lines reference a stock item directly; resolve and
			// validate they belong to this vehicle
			const existingIds = parsed.lines
				.filter((l) => l.stock_item_id)
				.map((l) => l.stock_item_id as string);
			const stockItems = existingIds.length
				? await tx.vehicle_stock_item.findMany({
						where: { id: { in: existingIds }, vehicle_id: vehicleId },
					})
				: [];

			if (stockItems.length !== new Set(existingIds).size) {
				throw new StockItemNotFoundError("One or more stock items not found on this vehicle");
			}

			const affectsWarehouse = parsed.type === "warehouse_exchange";

			// Resolve both kinds of line to a concrete stock item. "Add from
			// warehouse" lines carry an inventory_item_id for an item not yet on the
			// truck — upsert a zero-qty stock row so the adjustment line + movement
			// have something to key off.
			type ResolvedLine = {
				stock_item_id:     string;
				inventory_item_id: string;
				qty_before:        number;
				qty_after:         number;
			};
			const resolved: ResolvedLine[] = [];
			for (const line of parsed.lines) {
				if (line.stock_item_id) {
					const item = stockItems.find((s: { id: string }) => s.id === line.stock_item_id)!;
					resolved.push({
						stock_item_id:     item.id,
						inventory_item_id: item.inventory_item_id,
						qty_before:        Number(item.qty_on_hand),
						qty_after:         line.qty_after,
					});
				} else if (parsed.type === "supplier_purchase") {
					// supplier_purchase: resolve existing catalog item or create a
					// provisional one, then upsert a zero-qty vehicle stock row
					const invId = await resolveOrCreateSupplierItem(tx, orgId, line, context);
					const row = await tx.vehicle_stock_item.upsert({
						where: {
							vehicle_id_inventory_item_id: {
								vehicle_id:        vehicleId,
								inventory_item_id: invId,
							},
						},
						create: {
							vehicle_id:        vehicleId,
							inventory_item_id: invId,
							qty_on_hand:       0,
							qty_min:           0,
						},
						update: {},
					});
					const delta = line.qty_after - Number(row.qty_on_hand);
					if (delta <= 0) {
						throw new Error("Supplier purchase must increase quantity");
					}
					resolved.push({
						stock_item_id:     row.id,
						inventory_item_id: invId,
						qty_before:        Number(row.qty_on_hand),
						qty_after:         line.qty_after,
					});
				} else {
					const inv = await tx.inventory_item.findFirst({
						where: { id: line.inventory_item_id!, organization_id: orgId, provisional: false },
						select: { id: true },
					});
					if (!inv) throw new StockItemNotFoundError("Inventory item not found");
					const row = await tx.vehicle_stock_item.upsert({
						where: {
							vehicle_id_inventory_item_id: {
								vehicle_id:        vehicleId,
								inventory_item_id: line.inventory_item_id!,
							},
						},
						create: {
							vehicle_id:        vehicleId,
							inventory_item_id: line.inventory_item_id!,
							qty_on_hand:       0,
							qty_min:           0,
						},
						update: {},
					});
					resolved.push({
						stock_item_id:     row.id,
						inventory_item_id: line.inventory_item_id!,
						qty_before:        Number(row.qty_on_hand),
						qty_after:         line.qty_after,
					});
				}
			}

			const computedLines: AdjustComputedLine[] = resolved.map((line) => {
				const delta = line.qty_after - line.qty_before;
				const inventoryImpact = affectsWarehouse ? -delta : 0;
				return {
					stock_item_id:     line.stock_item_id,
					inventory_item_id: line.inventory_item_id,
					qty_before:        line.qty_before,
					qty_after:         line.qty_after,
					delta,
					inventory_impact:  inventoryImpact,
				};
			});

			const created = await tx.vehicle_stock_adjustment.create({
				data: {
					vehicle_id:         vehicleId,
					organization_id:    orgId,
					type:               parsed.type,
					note:               parsed.note ?? null,
					created_by_id:      context?.dispatcherId ?? null,
					created_by_tech_id: context?.dispatcherId ? null : (context?.techId ?? null),
					lines: {
						create: computedLines.map((l) => ({
							stock_item_id:    l.stock_item_id,
							qty_before:       l.qty_before,
							qty_after:        l.qty_after,
							inventory_impact: l.inventory_impact,
						})),
					},
				},
			});

			// D5 mapping: positive delta moves INTO this vehicle, negative OUT.
			// Counterparty: warehouse (warehouse_exchange), target vehicle
			// (transfer with target), or the adjustment bucket.
			const movements: MovementInput[] = [];
			for (const line of computedLines) {
				if (line.delta === 0) continue;
				const qty = Math.abs(line.delta);
				const into = line.delta > 0;

				if (parsed.type === "warehouse_exchange") {
					movements.push({
						inventory_item_id:  line.inventory_item_id,
						qty,
						from_location_type: into ? "warehouse" : "vehicle",
						from_vehicle_id:    into ? undefined : vehicleId,
						to_location_type:   into ? "vehicle" : "warehouse",
						to_vehicle_id:      into ? vehicleId : undefined,
						reason:             into ? "restock" : "return_to_warehouse",
						adjustment_id:      created.id,
					});
				} else if (parsed.type === "transfer" && parsed.target_vehicle_id) {
					movements.push({
						inventory_item_id:  line.inventory_item_id,
						qty,
						from_location_type: "vehicle",
						from_vehicle_id:    into ? parsed.target_vehicle_id : vehicleId,
						to_location_type:   "vehicle",
						to_vehicle_id:      into ? vehicleId : parsed.target_vehicle_id,
						reason:             "transfer",
						adjustment_id:      created.id,
					});
				} else if (parsed.type === "supplier_purchase") {
					movements.push({
						inventory_item_id:  line.inventory_item_id,
						qty,
						from_location_type: "external",
						to_location_type:   "vehicle",
						to_vehicle_id:      vehicleId,
						reason:             "supplier_purchase",
						adjustment_id:      created.id,
					});
				} else {
					const reason =
						parsed.type === "field_loss"
							? "loss"
							: parsed.type === "transfer"
								? "transfer"
								: "audit_correction";
					movements.push({
						inventory_item_id:  line.inventory_item_id,
						qty,
						from_location_type: into ? "adjustment" : "vehicle",
						from_vehicle_id:    into ? undefined : vehicleId,
						to_location_type:   into ? "vehicle" : "adjustment",
						to_vehicle_id:      into ? vehicleId : undefined,
						reason,
						adjustment_id:      created.id,
					});
				}
			}

			// Default overdraw guard protects warehouse_exchange; other types never
			// touch the warehouse (vehicle-side negatives are always permitted)
			const result = await recordMovements(tx, orgId, toActor(context), movements);
			lowStockItemIds = result.lowStockItemIds;

			return tx.vehicle_stock_adjustment.findUniqueOrThrow({
				where: { id: created.id },
				include: {
					lines: true,
					created_by: { select: { id: true, name: true } },
					created_by_tech: { select: { id: true, name: true } },
				},
			});
		});

		fireLowStockAlerts(lowStockItemIds, orgId).catch(() => {});

		await logActivity({
			event_type: "vehicle_stock.adjusted",
			action: "updated",
			entity_type: "vehicle_stock_adjustment",
			entity_id: adjustment.id,
			organization_id: orgId,
			...getActorInfo(context),
			changes: { type: { old: null, new: parsed.type }, line_count: { old: null, new: parsed.lines.length } },
		});

		return { adjustment };
	} catch (e: unknown) {
		if (e instanceof ZodError) return { err: `Validation failed: ${e.issues.map((i) => i.message).join(", ")}` };
		if (e instanceof StockItemNotFoundError) return { err: e.message };
		if (e instanceof InsufficientStockError) {
			return { err: "insufficient_warehouse_stock", available: e.available };
		}
		log.error({ err: e }, "Failed to adjust stock");
		return { err: "Failed to adjust stock" };
	}
}

// ── EOD History ───────────────────────────────────────────────────────────────

export async function getEodHistory(
	vehicleId: string,
	orgId: string,
): Promise<{ err?: string; records?: object[] }> {
	const sdb = getScopedDb(orgId);

	const vehicle = await sdb.vehicle.findFirst({ where: { id: vehicleId } });
	if (!vehicle) return { err: "Vehicle not found" };

	const records = await sdb.vehicle_eod_record.findMany({
		where: { vehicle_id: vehicleId },
		include: {
			restock_lines: true,
			completed_by: { select: { id: true, name: true } },
			completed_by_tech: { select: { id: true, name: true } },
		},
		orderBy: { completed_at: "desc" },
		take: 30,
	});

	return { records };
}

// ── Adjustment History ────────────────────────────────────────────────────────

export async function getStockAdjustmentHistory(
	vehicleId: string,
	orgId: string,
): Promise<{ err?: string; adjustments?: object[] }> {
	const sdb = getScopedDb(orgId);

	const vehicle = await sdb.vehicle.findFirst({ where: { id: vehicleId } });
	if (!vehicle) return { err: "Vehicle not found" };

	const adjustments = await sdb.vehicle_stock_adjustment.findMany({
		where: { vehicle_id: vehicleId },
		include: {
			lines: true,
			created_by: { select: { id: true, name: true } },
			created_by_tech: { select: { id: true, name: true } },
		},
		orderBy: { created_at: "desc" },
		take: 50,
	});

	return { adjustments };
}

// ── Usage today ───────────────────────────────────────────────────────────────

interface UsageTodayItem {
	itemName: string;
	qtyUsed: number;
}

interface UsageTodayGroup {
	visitId: string;
	visitName: string;
	scheduledAt: string | null;
	items: UsageTodayItem[];
}

export async function getUsageToday(
	vehicleId: string,
	orgId: string,
): Promise<{ err?: string; data?: UsageTodayGroup[] }> {
	const sdb = getScopedDb(orgId);

	const vehicle = await sdb.vehicle.findFirst({ where: { id: vehicleId } });
	if (!vehicle) return { err: "Vehicle not found" };

	const { start: startOfToday, end: endOfToday } = utcDayRange();

	// Usage now answers from the ledger: actual consumption only — vehicle
	// parts-used plus warehouse direct-consumption at completion for this
	// vehicle's techs. Planned-but-unconsumed lines no longer appear.
	const movements = await db.stock_movement.findMany({
		where: {
			organization_id: orgId,
			created_at: { gte: startOfToday, lt: endOfToday },
			OR: [
				{ from_vehicle_id: vehicleId, reason: "parts_used" },
				{
					reason: "direct_consumption",
					visit: { visit_techs: { some: { tech: { current_vehicle_id: vehicleId } } } },
				},
			],
		},
		include: {
			inventory_item: { select: { name: true } },
			visit: {
				select: {
					id: true,
					scheduled_start_at: true,
					job: { select: { name: true } },
				},
			},
		},
		orderBy: { created_at: "asc" },
	});

	const byVisit = new Map<string, UsageTodayGroup>();

	for (const m of movements) {
		const visitId = m.visit_id ?? "no-visit";
		if (!byVisit.has(visitId)) {
			byVisit.set(visitId, {
				visitId,
				visitName: m.visit?.job?.name ?? "Unknown visit",
				scheduledAt: m.visit?.scheduled_start_at?.toISOString() ?? null,
				items: [],
			});
		}
		byVisit.get(visitId)!.items.push({
			itemName: m.inventory_item.name,
			qtyUsed: Number(m.qty),
		});
	}

	return { data: Array.from(byVisit.values()) };
}

// ── Vehicle Readiness ─────────────────────────────────────────────────────────

type ReadinessLineItem = {
	visit_id: string;
	inventory_item_id: string | null;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	quantity: any;
	inventory_item: { id: string; name: string } | null;
};

function computeGapsFromLineItems(
	lineItems: ReadinessLineItem[],
	onHandByItem: Map<string, number>,
): ReadinessGap[] {
	const qtyNeeded = new Map<string, { name: string; qty: number; visit_ids: string[] }>();
	for (const li of lineItems) {
		if (!li.inventory_item_id || !li.inventory_item) continue;
		const existing = qtyNeeded.get(li.inventory_item_id);
		if (existing) {
			existing.qty += Number(li.quantity);
			if (!existing.visit_ids.includes(li.visit_id)) existing.visit_ids.push(li.visit_id);
		} else {
			qtyNeeded.set(li.inventory_item_id, {
				name: li.inventory_item.name,
				qty: Number(li.quantity),
				visit_ids: [li.visit_id],
			});
		}
	}

	return [...qtyNeeded.entries()].map(([inv_id, { name, qty, visit_ids }]) => {
		const on_hand = onHandByItem.get(inv_id) ?? 0;
		return {
			inventory_item_id: inv_id,
			name,
			qty_needed: qty,
			qty_on_hand: on_hand,
			gap: Math.max(0, qty - on_hand),
			visit_ids,
		};
	});
}

/**
 * Batched readiness for many vehicles in 4 queries (records, techs, visits,
 * stock). A visit with techs on two vehicles counts toward both — same
 * semantics as the per-vehicle computation it replaced.
 */
async function computeReadinessForVehicles(
	orgId: string,
	vehicleIds: string[],
	dateStr: string,
): Promise<Map<string, ReadinessResult>> {
	const targetDate = new Date(dateStr + "T00:00:00.000Z");
	const nextDate = new Date(targetDate);
	nextDate.setUTCDate(nextDate.getUTCDate() + 1);

	const [records, techs] = await Promise.all([
		db.vehicle_readiness.findMany({
			where: { vehicle_id: { in: vehicleIds }, date: targetDate },
			include: { confirmed_by: { select: { name: true } } },
		}),
		db.technician.findMany({
			where: { current_vehicle_id: { in: vehicleIds }, organization_id: orgId },
			select: { id: true, current_vehicle_id: true },
		}),
	]);

	const recordByVehicle = new Map(records.map((r) => [r.vehicle_id, r]));
	const vehicleByTech = new Map(techs.map((t) => [t.id, t.current_vehicle_id!]));

	const visits =
		techs.length > 0
			? await db.job_visit.findMany({
					where: {
						scheduled_start_at: { gte: targetDate, lt: nextDate },
						status: { notIn: ["Completed", "Cancelled"] },
						visit_techs: { some: { tech_id: { in: [...vehicleByTech.keys()] } } },
						job: { organization_id: orgId },
					},
					include: {
						line_items: {
							where: { inventory_item_id: { not: null } },
							include: { inventory_item: { select: { id: true, name: true } } },
						},
						visit_techs: { select: { tech_id: true } },
					},
				})
			: [];

	// Map visits to the vehicles their techs are on
	const visitsByVehicle = new Map<string, typeof visits>();
	for (const visit of visits) {
		const seen = new Set<string>();
		for (const vt of visit.visit_techs) {
			const vehicleId = vehicleByTech.get(vt.tech_id);
			if (!vehicleId || seen.has(vehicleId)) continue;
			seen.add(vehicleId);
			const list = visitsByVehicle.get(vehicleId);
			if (list) list.push(visit);
			else visitsByVehicle.set(vehicleId, [visit]);
		}
	}

	// One stock read across every (vehicle, needed item) pair
	const neededItemIds = [
		...new Set(
			visits.flatMap((v) => v.line_items.map((li) => li.inventory_item_id)).filter(Boolean),
		),
	] as string[];
	const stockItems = neededItemIds.length
		? await db.vehicle_stock_item.findMany({
				where: { vehicle_id: { in: vehicleIds }, inventory_item_id: { in: neededItemIds } },
				select: { vehicle_id: true, inventory_item_id: true, qty_on_hand: true },
			})
		: [];
	const stockByVehicle = new Map<string, Map<string, number>>();
	for (const s of stockItems) {
		let m = stockByVehicle.get(s.vehicle_id);
		if (!m) {
			m = new Map();
			stockByVehicle.set(s.vehicle_id, m);
		}
		m.set(s.inventory_item_id, Number(s.qty_on_hand));
	}

	const results = new Map<string, ReadinessResult>();
	for (const vehicleId of vehicleIds) {
		const record = recordByVehicle.get(vehicleId);
		const vehicleVisits = visitsByVehicle.get(vehicleId) ?? [];
		const hasTechs = techs.some((t) => t.current_vehicle_id === vehicleId);
		const lineItems = vehicleVisits.flatMap((v) => v.line_items);
		const onHand = stockByVehicle.get(vehicleId) ?? new Map<string, number>();

		if (record) {
			results.set(vehicleId, {
				state: "confirmed",
				date: dateStr,
				gaps: computeGapsFromLineItems(lineItems, onHand),
				confirmed: {
					id: record.id,
					confirmed_by: record.confirmed_by.name,
					confirmed_at: record.confirmed_at.toISOString(),
					notes: record.notes,
				},
			});
			continue;
		}

		if (!hasTechs || vehicleVisits.length === 0) {
			results.set(vehicleId, { state: "not_applicable", date: dateStr, gaps: [] });
			continue;
		}

		if (lineItems.length === 0) {
			results.set(vehicleId, { state: "unknown", date: dateStr, gaps: [] });
			continue;
		}

		const gaps = computeGapsFromLineItems(lineItems, onHand);
		const state: ReadinessState = gaps.some((g) => g.gap > 0) ? "needs_action" : "auto_ready";
		results.set(vehicleId, { state, date: dateStr, gaps });
	}

	return results;
}

export const getVehicleReadiness = async (
	vehicleId: string,
	organizationId: string,
	dateStr: string,
): Promise<{ err: string; item?: ReadinessResult }> => {
	const sdb = getScopedDb(organizationId);

	const vehicle = await sdb.vehicle.findFirst({ where: { id: vehicleId } });
	if (!vehicle) return { err: "Vehicle not found" };

	const results = await computeReadinessForVehicles(organizationId, [vehicleId], dateStr);
	return { err: "", item: results.get(vehicleId)! };
};

export const getFleetReadiness = async (
	organizationId: string,
	dateStr: string,
): Promise<{ err: string; items?: Array<{ vehicle_id: string } & ReadinessResult> }> => {
	const sdb = getScopedDb(organizationId);

	const vehicles = await sdb.vehicle.findMany({
		where: { status: "active" },
		select: { id: true },
	});
	const ids = vehicles.map((v: { id: string }) => v.id);
	if (ids.length === 0) return { err: "", items: [] };

	const results = await computeReadinessForVehicles(organizationId, ids, dateStr);
	return {
		err: "",
		items: ids.map((id: string) => ({ vehicle_id: id, ...results.get(id)! })),
	};
};

// ── Confirm / Revoke Readiness ────────────────────────────────────────────────

const confirmReadinessSchema = z.object({
	date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
	notes: z.string().optional(),
});

export const confirmReadiness = async (
	vehicleId: string,
	organizationId: string,
	dispatcherId: string,
	body: unknown,
): Promise<{ err: string; item?: ReadinessResult }> => {
	const sdb = getScopedDb(organizationId);

	const vehicle = await sdb.vehicle.findFirst({ where: { id: vehicleId } });
	if (!vehicle) return { err: "Vehicle not found" };

	let parsed: z.infer<typeof confirmReadinessSchema>;
	try {
		parsed = confirmReadinessSchema.parse(body);
	} catch (e) {
		if (e instanceof ZodError) return { err: e.issues.map((i) => i.message).join(", ") };
		return { err: "Invalid input" };
	}

	const targetDate = new Date(parsed.date + "T00:00:00.000Z");

	const existing = await db.vehicle_readiness.findFirst({
		where: { vehicle_id: vehicleId, date: targetDate },
	});
	if (existing) return { err: "Vehicle is already confirmed ready for this date" };

	await db.vehicle_readiness.create({
		data: {
			vehicle_id: vehicleId,
			organization_id: organizationId,
			date: targetDate,
			confirmed_by_id: dispatcherId,
			notes: parsed.notes ?? null,
		},
	});

	return getVehicleReadiness(vehicleId, organizationId, parsed.date);
};

export const revokeReadiness = async (
	vehicleId: string,
	organizationId: string,
	dateStr: string,
): Promise<{ err: string; item?: ReadinessResult }> => {
	const sdb = getScopedDb(organizationId);

	const vehicle = await sdb.vehicle.findFirst({ where: { id: vehicleId } });
	if (!vehicle) return { err: "Vehicle not found" };

	const targetDate = new Date(dateStr + "T00:00:00.000Z");

	const record = await db.vehicle_readiness.findFirst({
		where: { vehicle_id: vehicleId, date: targetDate },
	});
	if (!record) return { err: "No readiness confirmation found for this date" };

	await db.vehicle_readiness.delete({ where: { id: record.id } });

	return getVehicleReadiness(vehicleId, organizationId, dateStr);
};

// ── Stock conflicts ───────────────────────────────────────────────────────────

interface StockConflictItem {
	inventoryItemId: string;
	itemName: string;
	qtyNeeded: number;
	qtyOnHand: number;
}

interface StockConflict {
	visitId: string;
	vehicleId: string;
	vehicleName: string;
	techNames: string[];
	visitName: string;
	clientName: string;
	scheduledAt: string;
	severity: "out" | "low";
	conflicts: StockConflictItem[];
}

export async function getStockConflicts(orgId: string): Promise<StockConflict[]> {
	// Today + tomorrow, UTC day boundaries (matches EOD/usage day math)
	const { start: startOfToday, end: endOfTomorrow } = utcDayRange(new Date(), 2);

	const visits = await db.job_visit.findMany({
		where: {
			job: { organization_id: orgId },
			scheduled_start_at: { gte: startOfToday, lt: endOfTomorrow },
			status: { notIn: ["Completed", "Cancelled"] },
			visit_techs: { some: {} },
			line_items: { some: { inventory_item_id: { not: null } } },
		},
		include: {
			job: { include: { client: { select: { name: true } } } },
			line_items: {
				where: { inventory_item_id: { not: null } },
				select: { inventory_item_id: true, quantity: true, name: true },
			},
			visit_techs: {
				include: {
					tech: {
						select: {
							id: true,
							name: true,
							current_vehicle_id: true,
							current_vehicle: {
								select: {
									id: true,
									name: true,
									stock_items: {
										select: { inventory_item_id: true, qty_on_hand: true },
									},
								},
							},
						},
					},
				},
			},
		},
	});

	const conflicts: StockConflict[] = [];

	for (const visit of visits) {
		const vehicleMap = new Map<string, typeof visit.visit_techs[0]["tech"]["current_vehicle"]>();
		const techsByVehicle = new Map<string, string[]>();

		for (const vt of visit.visit_techs) {
			const tech = vt.tech;
			if (!tech.current_vehicle_id || !tech.current_vehicle) continue;
			vehicleMap.set(tech.current_vehicle_id, tech.current_vehicle);
			const existing = techsByVehicle.get(tech.current_vehicle_id) ?? [];
			existing.push(tech.name);
			techsByVehicle.set(tech.current_vehicle_id, existing);
		}

		for (const [vehicleId, vehicle] of vehicleMap) {
			if (!vehicle) continue;
			const stockByItemId = new Map(
				vehicle.stock_items.map((s) => [s.inventory_item_id, Number(s.qty_on_hand)]),
			);

			const itemConflicts: StockConflictItem[] = [];
			for (const li of visit.line_items) {
				if (!li.inventory_item_id) continue;
				const onHand = stockByItemId.get(li.inventory_item_id) ?? 0;
				const needed = Number(li.quantity);
				if (onHand < needed) {
					itemConflicts.push({
						inventoryItemId: li.inventory_item_id,
						itemName: li.name,
						qtyNeeded: needed,
						qtyOnHand: onHand,
					});
				}
			}

			if (itemConflicts.length === 0) continue;

			const severity = itemConflicts.some((c) => c.qtyOnHand === 0) ? "out" : "low";

			conflicts.push({
				visitId: visit.id,
				vehicleId,
				vehicleName: vehicle.name,
				techNames: techsByVehicle.get(vehicleId) ?? [],
				visitName: visit.job.name,
				clientName: visit.job.client?.name ?? "",
				scheduledAt: visit.scheduled_start_at?.toISOString() ?? "",
				severity,
				conflicts: itemConflicts,
			});
		}
	}

	return conflicts;
}

// ── Supplier Part Used (shortcut: external → vehicle → consumed) ──────────────

const supplierPartUsedSchema = z
	.object({
		technician_id:     z.string().uuid(),
		qty_used:          z.number().positive(),
		inventory_item_id: z.string().uuid().optional(),
		new_item:          z.object({ name: z.string().min(1).max(200), cost: z.number().min(0) }).optional(),
	})
	.refine(
		(d) => (d.inventory_item_id ? 1 : 0) + (d.new_item ? 1 : 0) === 1,
		{ message: "Provide exactly one of inventory_item_id or new_item" },
	);

export async function addSupplierPartUsed(
	vehicleId: string,
	visitId: string,
	data: unknown,
	orgId: string,
	context?: UserContext,
) {
	try {
		const parsed = supplierPartUsedSchema.parse(data);

		const ownershipErr = await requireTechOnVehicle(vehicleId, orgId, context);
		if (ownershipErr) return { err: ownershipErr };

		const sdb = getScopedDb(orgId);

		const visit = await sdb.job_visit.findFirst({ where: { id: visitId } });
		if (!visit) return { err: "Visit not found" };

		const result = await sdb.$transaction(async (tx) => {
			// Resolve or provision the inventory item
			const inventoryItemId = parsed.inventory_item_id
				? await resolveOrCreateSupplierItem(tx, orgId, { inventory_item_id: parsed.inventory_item_id }, context)
				: await resolveOrCreateSupplierItem(tx, orgId, { new_item: parsed.new_item }, context);

			const inv = await tx.inventory_item.findFirstOrThrow({
				where: { id: inventoryItemId },
				select: { name: true, unit_price: true },
			});

			// 1) Part enters the truck from the supplier
			await recordMovements(tx, orgId, toActor(context), [
				{
					inventory_item_id:  inventoryItemId,
					qty:                parsed.qty_used,
					from_location_type: "external",
					to_location_type:   "vehicle",
					to_vehicle_id:      vehicleId,
					reason:             "supplier_purchase",
				},
			]);

			// 2) Line item + consumption from the truck
			const unitPrice = Number(inv.unit_price ?? 0);
			const lineItem = await tx.job_visit_line_item.create({
				data: {
					visit_id:           visitId,
					name:               inv.name,
					quantity:           parsed.qty_used,
					unit_price:         unitPrice,
					total:              unitPrice * parsed.qty_used,
					source:             "field_addition",
					item_type:          "material",
					sort_order:         0,
					inventory_item_id:  inventoryItemId,
					fulfillment_status: "used",
				},
			});

			await recordMovements(
				tx,
				orgId,
				{ actor_type: "technician", actor_id: parsed.technician_id },
				[
					{
						inventory_item_id:  inventoryItemId,
						qty:                parsed.qty_used,
						from_location_type: "vehicle",
						from_vehicle_id:    vehicleId,
						to_location_type:   "consumed",
						reason:             "parts_used",
						visit_id:           visitId,
						visit_line_item_id: lineItem.id,
					},
				],
				{ allowNegative: true },
			);

			// Ensure a stock row exists for the usage record (upsert zero-qty row if absent)
			await tx.vehicle_stock_item.upsert({
				where: {
					vehicle_id_inventory_item_id: {
						vehicle_id:        vehicleId,
						inventory_item_id: inventoryItemId,
					},
				},
				create: {
					vehicle_id:        vehicleId,
					inventory_item_id: inventoryItemId,
					qty_on_hand:       0,
					qty_min:           0,
				},
				update: {},
			});

			const stockRow = await tx.vehicle_stock_item.findFirstOrThrow({
				where: { vehicle_id: vehicleId, inventory_item_id: inventoryItemId },
				select: { id: true },
			});

			await tx.vehicle_stock_usage.create({
				data: {
					stock_item_id:      stockRow.id,
					visit_id:           visitId,
					technician_id:      parsed.technician_id,
					qty_used:           parsed.qty_used,
					visit_line_item_id: lineItem.id,
				},
			});

			await recomputeVisitTotals(visitId, orgId, tx as unknown as Prisma.TransactionClient);

			return { lineItem };
		});

		await logActivity({
			event_type:      "vehicle_stock.supplier_part_used",
			action:          "updated",
			entity_type:     "job_visit",
			entity_id:       visitId,
			organization_id: orgId,
			actor_type:      "technician",
			actor_id:        parsed.technician_id,
			changes:         { qty_used: { old: null, new: parsed.qty_used } },
		});

		return { err: "", item: result };
	} catch (e: unknown) {
		if (e instanceof ZodError) return { err: `Validation failed: ${e.issues.map((i) => i.message).join(", ")}` };
		if (e instanceof StockItemNotFoundError) return { err: e.message };
		log.error({ err: e }, "Failed to add supplier part");
		return { err: "Failed to add supplier part" };
	}
}

// ── Movement history ──────────────────────────────────────────────────────────

export const getVehicleMovements = async (
	vehicleId: string,
	organizationId: string,
	cursor?: string,
	limit = 25,
) => {
	const sdb = getScopedDb(organizationId);

	const vehicle = await sdb.vehicle.findFirst({ where: { id: vehicleId } });
	if (!vehicle) return { err: "Vehicle not found" as const };

	const take = Math.min(Math.max(Number.isFinite(limit) ? Math.floor(limit) : 25, 1), 100);

	const movements = await sdb.stock_movement.findMany({
		where: {
			OR: [{ from_vehicle_id: vehicleId }, { to_vehicle_id: vehicleId }],
		},
		include: {
			inventory_item: { select: { id: true, name: true, unit: true } },
			from_vehicle: { select: { id: true, name: true } },
			to_vehicle: { select: { id: true, name: true } },
		},
		orderBy: [{ created_at: "desc" }, { id: "desc" }],
		take: take + 1,
		...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
	});

	const hasNext = movements.length > take;
	const page = hasNext ? movements.slice(0, take) : movements;
	const nextCursor = hasNext ? page[page.length - 1].id : null;

	return { err: "", movements: page, nextCursor };
};
