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
import {
	receiveInventorySchema,
	listSerialsQuerySchema,
	listBatchesQuerySchema,
	toggleTrackingSchema,
	updateBatchSchema,
	updateSerialSchema,
} from "../lib/validate/inventoryTracking.js";
import { logActivity, buildChanges } from "../services/logger.js";
import { log } from "../services/appLogger.js";
import { sendLowStockAlert } from "../services/lowStockAlerts.js";
import {
	recordMovements,
	InsufficientStockError,
	getOrCreateBatch,
	InsufficientBatchStockError,
	TrackingValidationError,
	lockInventoryRows,
	type ActorInfo,
	type MovementInput,
} from "../services/stockMovements.js";
import {
	shortCode,
	buildTrackingInputs,
	TrackingValidationError as RealTrackingValidationError,
	lockBatchRows,
	lockSerialRows,
	type ItemTrackingFlags,
} from "../services/inventoryTracking.js";
import { withStockStatus } from "../lib/inventory.js";
import { emitInventoryUpdated } from "../services/socketService.js";

function zodMessage(e: ZodError): string {
	return `Validation failed: ${e.issues.map((i) => i.message).join(", ")}`;
}

interface InventoryRecord {
	id: string;
	name: string;
	quantity: number;
	low_stock_threshold: number | null;
	alert_emails_enabled: boolean;
	alert_email: string | null;
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

// UPC-A (12 digits) and EAN-13 (13 digits, UPC-compatible when 0-prefixed) encode
// the same barcode — a scanner and the stored record can disagree on which form
// was kept. Only the barcode field gets this treatment; sku/alt_ids are opaque
// strings with no digit-form equivalence.
const barcodeCandidates = (trimmed: string): string[] => {
	const candidates = [trimmed];
	if (/^0\d{12}$/.test(trimmed)) candidates.push(trimmed.slice(1));
	if (/^\d{12}$/.test(trimmed)) candidates.push("0" + trimmed);
	return candidates;
};

// Resolve a scanned code to a single active inventory item. Lookup is
// prioritized so a match is deterministic even if the same string lives in
// more than one field: exact barcode → exact sku → alt_ids contains.
export const scanInventoryByCode = async (organizationId: string, code: string) => {
	const trimmed = code.trim();
	if (!trimmed) return { err: "Empty code" };

	const sdb = getScopedDb(organizationId);
	const item =
		(await sdb.inventory_item.findFirst({
			where: { is_active: true, provisional: false, barcode: { in: barcodeCandidates(trimmed) } },
			include: { tags: true },
		})) ??
		(await sdb.inventory_item.findFirst({
			where: { is_active: true, provisional: false, sku: trimmed },
			include: { tags: true },
		})) ??
		(await sdb.inventory_item.findFirst({
			where: { is_active: true, provisional: false, alt_ids: { has: trimmed } },
			include: { tags: true },
		}));

	if (!item) return { err: "NOT_FOUND" };
	return { err: "", item: withStockStatus(item) };
};

// Lenient, case-insensitive prefix matchers for serial/lot QR labels — accept
// both a colon and a hyphen as the separator (SN:, SN-, sn:, sn- / LOT:, LOT-, ...).
const SN_PREFIX = /^sn[-:]/i;
const LOT_PREFIX = /^lot[-:]/i;

type ResolvedItemPayload = Prisma.inventory_itemGetPayload<{ include: { tags: true } }>;
type ResolvedItem = ReturnType<typeof withStockStatus<ResolvedItemPayload>>;

type ResolveCodeResult =
	| { err: "Empty code" }
	| { err: "NOT_FOUND" }
	| { err: ""; type: "item"; item: ResolvedItem }
	| { err: ""; type: "serial"; code: string; serialUnitId: string; status: string; item: ResolvedItem }
	| { err: ""; type: "batch"; code: string; batchId: string; batchNumber: string; item: ResolvedItem };

// Fetches the parent inventory_item for a resolved serial/batch (org-scoped)
// and shapes it exactly like scanInventoryByCode's "item" variant.
async function fetchResolvedItem(organizationId: string, inventoryItemId: string): Promise<ResolvedItem | null> {
	const sdb = getScopedDb(organizationId);
	const item = await sdb.inventory_item.findFirst({
		where: { id: inventoryItemId },
		include: { tags: true },
	});
	return item ? withStockStatus(item) : null;
}

async function buildSerialResult(
	organizationId: string,
	unit: { id: string; code: string; status: string; inventory_item_id: string },
): Promise<ResolveCodeResult> {
	const item = await fetchResolvedItem(organizationId, unit.inventory_item_id);
	if (!item) return { err: "NOT_FOUND" };
	return {
		err: "",
		type: "serial",
		code: unit.code,
		serialUnitId: unit.id,
		status: unit.status,
		item,
	};
}

async function buildBatchResult(
	organizationId: string,
	batch: { id: string; code: string; batch_number: string; inventory_item_id: string },
): Promise<ResolveCodeResult> {
	const item = await fetchResolvedItem(organizationId, batch.inventory_item_id);
	if (!item) return { err: "NOT_FOUND" };
	return {
		err: "",
		type: "batch",
		code: batch.code,
		batchId: batch.id,
		batchNumber: batch.batch_number,
		item,
	};
}

// Scan-anything entry point (item/serial/batch). Typed prefixes (SN:, LOT:)
// resolve directly against the serial/batch tables — never fall through to
// item lookup, so a scanned unit/lot label reads as unambiguous. Unprefixed
// codes keep today's exact item-lookup behavior via scanInventoryByCode, and
// only fall back to a raw serial_number/batch_number match once that lookup
// has already missed.
export const resolveInventoryCode = async (organizationId: string, code: string): Promise<ResolveCodeResult> => {
	const trimmed = code.trim();
	if (!trimmed) return { err: "Empty code" };

	if (SN_PREFIX.test(trimmed)) {
		const sdb = getScopedDb(organizationId);
		const unit = await sdb.serial_unit.findFirst({ where: { code: trimmed.replace(SN_PREFIX, "") } });
		if (!unit) return { err: "NOT_FOUND" };
		return buildSerialResult(organizationId, unit);
	}

	if (LOT_PREFIX.test(trimmed)) {
		const sdb = getScopedDb(organizationId);
		const batch = await sdb.stock_batch.findFirst({ where: { code: trimmed.replace(LOT_PREFIX, "") } });
		if (!batch) return { err: "NOT_FOUND" };
		return buildBatchResult(organizationId, batch);
	}

	const result = await scanInventoryByCode(organizationId, trimmed);
	if (!result.err) {
		return { err: "", type: "item", item: result.item as ResolvedItem };
	}

	// Unprefixed fallback: item lookup missed — try a raw serial_number, then a
	// raw batch_number, exact match before giving up.
	const sdb = getScopedDb(organizationId);
	const serialHit = await sdb.serial_unit.findFirst({ where: { serial_number: trimmed } });
	if (serialHit) return buildSerialResult(organizationId, serialHit);

	const batchHit = await sdb.stock_batch.findFirst({ where: { batch_number: trimmed } });
	if (batchHit) return buildBatchResult(organizationId, batchHit);

	return { err: "NOT_FOUND" };
};

// Lazily assigns a printable code to items that predate barcode scanning —
// only called from the label-printing flow, never on read paths. The write is
// conditional on barcode still being null (updateMany, not update) so two
// concurrent calls on the same item never both "win" with different random
// codes — whichever commits first sticks, the loser's updateMany matches zero
// rows and both callers report the same final barcode. Retries the write on a
// cross-item unique conflict since the short base32 code space, while large,
// isn't collision-proof.
export const ensureItemCode = async (itemId: string, organizationId: string) => {
	try {
		const sdb = getScopedDb(organizationId);
		const existing = await sdb.inventory_item.findFirst({ where: { id: itemId } });
		if (!existing) return { err: "Inventory item not found" };

		if (!existing.barcode) {
			for (let attempt = 0; attempt < 5; attempt++) {
				try {
					await sdb.inventory_item.updateMany({
						where: { id: itemId, barcode: null },
						data: { barcode: shortCode("ITM") },
					});
					break; // claimed it (or another call already did) — fall through to the re-fetch below
				} catch (e) {
					if (uniqueConflictField(e) === "barcode") continue;
					throw e;
				}
			}
		}

		const final = await sdb.inventory_item.findFirst({ where: { id: itemId }, include: { tags: true } });
		if (!final) return { err: "Inventory item not found" };
		if (!final.barcode) return { err: "Failed to assign item code" };
		return { item: withStockStatus(final) };
	} catch (e) {
		console.error("Ensure item code error:", e);
		return { err: "Internal server error" };
	}
};

// Shared P2002 target-match idiom: true when the Prisma unique-constraint
// violation names `field`, checked three ways — the structured meta.target
// array, a raw string meta.target, and (when the @prisma/adapter-pg driver
// populates neither) a message-substring fallback.
function p2002TargetHits(e: unknown, field: string): boolean {
	if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== "P2002") return false;
	const target = e.meta?.target;
	return (
		(Array.isArray(target) && target.includes(field)) ||
		(typeof target === "string" && target.includes(field)) ||
		e.message.includes(field)
	);
}

// inventory_item now has two per-org unique constraints: sku and barcode.
// Surface a clear 4xx on conflict, not a 500. The @prisma/adapter-pg driver
// often populates neither meta.target nor the field name in the message for
// transaction-scoped P2002s — when it does, we can name the exact field;
// otherwise we fall back to a combined message so the user still gets a 4xx.
// Returns: "sku" | "barcode" when identifiable, "unknown" for an
// inventory_item P2002 we can't attribute, or null when it isn't our conflict.
const uniqueConflictField = (e: unknown): "sku" | "barcode" | "unknown" | null => {
	if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== "P2002") {
		return null;
	}
	if (p2002TargetHits(e, "barcode")) return "barcode";
	if (p2002TargetHits(e, "sku")) return "sku";
	if (e.meta?.modelName === "inventory_item") return "unknown";
	return null;
};

const conflictMessage = (field: "sku" | "barcode" | "unknown"): string =>
	field === "barcode"
		? "Barcode already in use"
		: field === "sku"
			? "SKU already in use"
			: "SKU or barcode already in use";

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
					barcode: parsed.barcode ?? null,
					low_stock_threshold: parsed.low_stock_threshold ?? null,
					image_urls: parsed.image_urls,
					alert_emails_enabled: parsed.alert_emails_enabled,
					alert_email: parsed.alert_email ?? null,
					alt_ids: parsed.alt_ids.map((s) => s.trim()).filter(Boolean),
					is_serialized: parsed.is_serialized,
					is_batch_tracked: parsed.is_batch_tracked,
				},
				include: { tags: true },
			});

			if (parsed.quantity > 0) {
				await recordMovements(tx as unknown as Prisma.TransactionClient, organizationId, toActorInfo(context), [
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

		emitInventoryUpdated(organizationId, { itemId: item.id });

		return { err: "", item: withStockStatus(item) };
	} catch (e) {
		// Expected validation outcomes — not internal errors, don't log a stack trace.
		if (e instanceof ZodError) {
			return {
				err: zodMessage(e),
			};
		}
		const createConflict = uniqueConflictField(e);
		if (createConflict) {
			return { err: conflictMessage(createConflict) };
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
			"barcode",
			"low_stock_threshold",
			"image_urls",
			"alert_emails_enabled",
			"alert_email",
			"alt_ids",
		] as const);

		const updated = await sdb.$transaction(async (tx) => {
			const item = await tx.inventory_item.update({
				where: { id: itemId },
				data: {
					...parsed,
					...(parsed.alt_ids !== undefined && {
						alt_ids: parsed.alt_ids.map((s) => s.trim()).filter(Boolean),
					}),
				},
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

		emitInventoryUpdated(organizationId, { itemId });

		return { err: "", item: withStockStatus(updated) };
	} catch (e) {
		// Expected validation outcomes — not internal errors, don't log a stack trace.
		if (e instanceof ZodError) {
			return {
				err: zodMessage(e),
			};
		}
		const updateConflict = uniqueConflictField(e);
		if (updateConflict) {
			return { err: conflictMessage(updateConflict) };
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
				// Null sku + barcode on soft-delete — both org-scoped unique
				// constraints aren't partial, so a deleted item would otherwise
				// permanently block those values from ever being reassigned.
				data: { is_active: false, barcode: null, sku: null },
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
					sku: { old: existing.sku, new: null },
					barcode: { old: existing.barcode, new: null },
				},
			});
		});

		emitInventoryUpdated(organizationId, { itemId });

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
		const isTracked = existing.is_serialized || existing.is_batch_tracked;

		// Positive delta on a tracked item can't say which units/lot it's adding —
		// that capture only exists on the dedicated receive endpoint.
		if (isTracked && isReceive) {
			return { err: "Use POST /inventory/:id/receive to add stock for a tracked item" };
		}

		// Serial/batch tracking — uncapped/strict; resolved BEFORE the transaction
		// opens so a validation failure never opens one. Only meaningful on the
		// loss/deduction side — a positive delta on a tracked item is already
		// rejected above. buildTrackingInputs is imported directly from
		// inventoryTracking.js (real, unmocked even in this file's tests) rather
		// than via stockMovements.js, matching the existing shortCode import — see
		// task-1 report for why the resulting TrackingValidationError is caught
		// locally via RealTrackingValidationError instead of the (test-mocked)
		// TrackingValidationError used by the outer catch below.
		let tracking: { serial?: MovementInput["serial"]; batch_allocations?: MovementInput["batch_allocations"] } = {};
		if (!isReceive) {
			try {
				const [resolvedLine] = await buildTrackingInputs(
					null as unknown as Prisma.TransactionClient,
					organizationId,
					new Map<string, ItemTrackingFlags>([
						[itemId, { is_serialized: existing.is_serialized, is_batch_tracked: existing.is_batch_tracked }],
					]),
					[
						{
							inventory_item_id: itemId,
							qty,
							raw: { serial_unit_ids: parsed.serial_unit_ids, batch_picks: parsed.batch_picks },
						},
					],
				);
				tracking = resolvedLine.tracking;
			} catch (e) {
				if (e instanceof RealTrackingValidationError) return { err: e.message };
				throw e;
			}
		}

		const actor = toActorInfo(context);

		let lowStockItemIds: string[] = [];

		const updated = await sdb.$transaction(async (tx) => {
			const movement: MovementInput = {
				inventory_item_id: itemId,
				qty,
				from_location_type: isReceive ? "external" : "warehouse",
				to_location_type: isReceive ? "warehouse" : "adjustment",
				reason: isReceive ? "receive" : "loss",
				serial: tracking.serial,
				batch_allocations: tracking.batch_allocations,
			};

			const result = await recordMovements(tx as unknown as Prisma.TransactionClient, organizationId, actor, [
				movement,
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

		emitInventoryUpdated(organizationId, { itemId });

		return { err: "", item: withStockStatus(updated) };
	} catch (e) {
		if (e instanceof ZodError) {
			return {
				err: zodMessage(e),
			};
		}
		if (e instanceof InsufficientStockError) {
			return { err: "Stock cannot go below zero" };
		}
		if (e instanceof InsufficientBatchStockError || e instanceof TrackingValidationError) {
			return { err: e.message };
		}
		console.error("Adjust inventory stock error:", e);
		return { err: "Internal server error" };
	}
};

// Receives new stock into the warehouse for one item — optionally capturing
// per-unit serial numbers (serialized items) or a lot/batch (batch-tracked
// items). Plain (non-tracked) items behave exactly like createInventoryItem's
// initial-qty path. Serial/batch inputs on a non-tracked item are rejected by
// applyTracking (via recordMovements) — not duplicated here.
export const receiveInventoryItem = async (
	itemId: string,
	data: unknown,
	organizationId: string,
	context?: UserContext,
) => {
	try {
		const sdb = getScopedDb(organizationId);
		const existing = await sdb.inventory_item.findFirst({ where: { id: itemId } });

		if (!existing) {
			return { err: "Inventory item not found" };
		}

		const parsed = receiveInventorySchema.parse(data);

		// Auto-assign: for a serialized item opted into auto_serial, synthesize one
		// AUTO- serial number per unit so downstream (tracking-input build + the
		// post-receive re-fetch) treats them exactly like caller-supplied numbers.
		// A non-integer qty for a serialized item still fails the service's
		// count === qty guard, so no extra check is needed here.
		const serialNumbers =
			existing.is_serialized && parsed.auto_serial
				? Array.from({ length: parsed.qty }, () => shortCode("AUTO"))
				: parsed.serial_numbers;

		// Serial tracking — uncapped/strict; resolved BEFORE the transaction opens
		// so a validation failure never opens one (inventoryController.test.ts
		// "...no partial writes" / "$transaction not toHaveBeenCalled"). This caller
		// always CREATES brand-new units (never references existing ones), so
		// parsed.serial_numbers maps onto the helper's new_serials slot, not
		// serial_unit_ids. buildTrackingInputs only sets `serial_number` on each
		// created entry — resolvedBatch?.id is merged in afterward, once the batch
		// is resolved inside the transaction. The batch-tracked "provide either
		// batch or batch_id" presence check stays controller-side: it doesn't
		// depend on translating raw input, and resolvedBatch itself isn't known
		// until the transaction resolves it (getOrCreateBatch/stock_batch.findFirst
		// both need the live tx), so there's nothing for the helper to do here.
		let newSerialTracking: MovementInput["serial"];
		if (existing.is_serialized) {
			try {
				const [resolvedLine] = await buildTrackingInputs(
					null as unknown as Prisma.TransactionClient,
					organizationId,
					new Map<string, ItemTrackingFlags>([
						[itemId, { is_serialized: true, is_batch_tracked: existing.is_batch_tracked }],
					]),
					[{ inventory_item_id: itemId, qty: parsed.qty, raw: { new_serials: serialNumbers } }],
					{ serialIdField: "serial_numbers" },
				);
				newSerialTracking = resolvedLine.tracking.serial;
			} catch (e) {
				if (e instanceof RealTrackingValidationError) return { err: e.message };
				throw e;
			}
		}
		if (existing.is_batch_tracked && !parsed.batch && !parsed.batch_id) {
			return { err: "Provide either batch or batch_id for a batch-tracked item" };
		}

		const actor = toActorInfo(context);

		const { item, createdSerials, batchInfo } = await sdb.$transaction(async (tx) => {
			let resolvedBatch: { id: string; code: string; batch_number: string } | undefined;

			if (parsed.batch) {
				const created = await getOrCreateBatch(tx as unknown as Prisma.TransactionClient, organizationId, {
					inventory_item_id: itemId,
					batch_number: parsed.batch.batch_number,
					expires_at: parsed.batch.expires_at ? new Date(parsed.batch.expires_at) : null,
					supplier: parsed.batch.supplier ?? null,
				});
				resolvedBatch = { id: created.id, code: created.code, batch_number: parsed.batch.batch_number };
			} else if (parsed.batch_id) {
				const batchRow = await tx.stock_batch.findFirst({
					where: { id: parsed.batch_id, organization_id: organizationId, inventory_item_id: itemId },
					select: { id: true, code: true, batch_number: true },
				});
				if (!batchRow) throw new Error("Batch not found");
				resolvedBatch = { id: batchRow.id, code: batchRow.code, batch_number: batchRow.batch_number };
			}

			const movement: MovementInput = {
				inventory_item_id: itemId,
				qty: parsed.qty,
				from_location_type: "external",
				to_location_type: "warehouse",
				reason: "receive",
				note: parsed.note,
				serial: newSerialTracking
					? {
							create: (newSerialTracking.create ?? []).map((c) => ({
								...c,
								batch_id: resolvedBatch?.id,
							})),
						}
					: undefined,
				batch_allocations:
					existing.is_batch_tracked && !existing.is_serialized && resolvedBatch
						? [{ batch_id: resolvedBatch.id, qty: parsed.qty }]
						: undefined,
			};

			await recordMovements(tx as unknown as Prisma.TransactionClient, organizationId, actor, [movement]);

			let createdSerials: { id: string; code: string; serial_number: string; status: string }[] = [];
			if (existing.is_serialized && serialNumbers) {
				createdSerials = await tx.serial_unit.findMany({
					where: {
						organization_id: organizationId,
						inventory_item_id: itemId,
						serial_number: { in: serialNumbers },
					},
					orderBy: { created_at: "desc" },
					select: { id: true, code: true, serial_number: true, status: true },
				});
			}

			const updatedItem = await tx.inventory_item.findUnique({ where: { id: itemId } });

			await logActivity({
				event_type: "inventory_item.stock_adjusted",
				action: "updated",
				entity_type: "inventory_item",
				entity_id: itemId,
				organization_id: organizationId,
				...getActorInfo(context),
				changes: {
					quantity: { old: existing.quantity, new: updatedItem?.quantity },
					received: { old: null, new: parsed.qty },
				},
			});

			return { item: updatedItem!, createdSerials, batchInfo: resolvedBatch };
		});

		emitInventoryUpdated(organizationId, { itemId });

		return {
			err: "",
			item: withStockStatus(item),
			created_serials: createdSerials.length > 0 ? createdSerials : undefined,
			batch: batchInfo,
		};
	} catch (e) {
		if (e instanceof ZodError) {
			return { err: zodMessage(e) };
		}
		if (e instanceof InsufficientBatchStockError || e instanceof TrackingValidationError) {
			return { err: e.message };
		}
		if (e instanceof Error && e.message === "Batch not found") {
			return { err: e.message };
		}
		if (isSerialNumberConflict(e)) {
			return { err: "One or more serial numbers already exist for this item", conflict: true };
		}
		console.error("Receive inventory item error:", e);
		return { err: "Internal server error" };
	}
};

// A re-receive of an already-known serial_number hits serial_unit's
// [organization_id, inventory_item_id, serial_number] unique index and
// throws P2002. Distinguished from the `code` mint-collision (transparently
// retried inside inventoryTracking.ts — never reaches here) by inspecting
// e.meta.target for the serial_number column specifically. Same house idiom
// as uniqueConflictField above.
const isSerialNumberConflict = (e: unknown): boolean => p2002TargetHits(e, "serial_number");

// Business-rule failure raised inside the tracking-toggle transaction when the
// item still has stock on hand. Thrown from inside $transaction so nothing
// commits, then mapped to a 400-style { err } result in the outer catch below
// (this file's convention — see InsufficientBatchStockError/
// TrackingValidationError handling in receiveInventoryItem above).
class TrackingStockNotZeroError extends Error {}

// PATCH /inventory/:id/tracking — flips is_serialized/is_batch_tracked. Gated
// on zero total on-hand stock (warehouse quantity + every vehicle's
// qty_on_hand for this item) so serial_unit/stock_batch rows never desync
// from physical stock. Provisional items can never be tracked.
export const updateItemTracking = async (
	itemId: string,
	data: unknown,
	organizationId: string,
	context?: UserContext,
) => {
	try {
		const sdb = getScopedDb(organizationId);
		const existing = await sdb.inventory_item.findFirst({ where: { id: itemId } });

		if (!existing) {
			return { err: "Inventory item not found" };
		}

		const parsed = toggleTrackingSchema.parse(data);

		if (existing.provisional) {
			return { err: "Provisional items cannot be tracked" };
		}

		const changesToApply: Record<string, { old: boolean; new: boolean }> = {};
		if (parsed.is_serialized !== undefined && parsed.is_serialized !== existing.is_serialized) {
			changesToApply.is_serialized = { old: existing.is_serialized, new: parsed.is_serialized };
		}
		if (
			parsed.is_batch_tracked !== undefined &&
			parsed.is_batch_tracked !== existing.is_batch_tracked
		) {
			changesToApply.is_batch_tracked = {
				old: existing.is_batch_tracked,
				new: parsed.is_batch_tracked,
			};
		}

		if (Object.keys(changesToApply).length === 0) {
			return { err: "", item: withStockStatus(existing) };
		}

		const updated = await sdb.$transaction(async (tx) => {
			await lockInventoryRows(tx as unknown as Prisma.TransactionClient, [itemId]);

			const locked = await tx.inventory_item.findUnique({ where: { id: itemId } });
			const vehicleSum = await tx.vehicle_stock_item.aggregate({
				where: { inventory_item_id: itemId, vehicle: { organization_id: organizationId } },
				_sum: { qty_on_hand: true },
			});

			const totalOnHand =
				Number(locked?.quantity ?? 0) + Number(vehicleSum._sum.qty_on_hand ?? 0);

			if (totalOnHand !== 0) {
				throw new TrackingStockNotZeroError(
					`Cannot change tracking settings while ${totalOnHand} units are on hand (warehouse + vehicles) — reduce to zero first`,
				);
			}

			// "Block unless empty": turning OFF (or switching away from) an
			// already-tracked dimension is only allowed when no serial/batch rows
			// survive — even consumed/lost/returned serials or zeroed-out lots
			// carry recall/audit history that disabling would orphan. Enabling on
			// an untracked item can't hit this (it has no such rows). Mirrors
			// deleteBatch's "empty everywhere incl. no serials" reasoning.
			const disablingTracked =
				(changesToApply.is_serialized?.old === true &&
					changesToApply.is_serialized?.new === false) ||
				(changesToApply.is_batch_tracked?.old === true &&
					changesToApply.is_batch_tracked?.new === false);

			if (disablingTracked) {
				const [serialCount, batchCount] = await Promise.all([
					tx.serial_unit.count({
						where: { inventory_item_id: itemId, organization_id: organizationId },
					}),
					tx.stock_batch.count({
						where: { inventory_item_id: itemId, organization_id: organizationId },
					}),
				]);
				if (serialCount > 0 || batchCount > 0) {
					throw new TrackingStockNotZeroError(
						`Cannot disable or switch tracking while ${serialCount} serial unit(s) and ${batchCount} batch(es) still exist for this item — remove them first`,
					);
				}
			}

			const item = await tx.inventory_item.update({
				where: { id: itemId },
				data: {
					...(parsed.is_serialized !== undefined ? { is_serialized: parsed.is_serialized } : {}),
					...(parsed.is_batch_tracked !== undefined
						? { is_batch_tracked: parsed.is_batch_tracked }
						: {}),
				},
			});

			await logActivity({
				event_type: "inventory_item.tracking_updated",
				action: "updated",
				entity_type: "inventory_item",
				entity_id: itemId,
				organization_id: organizationId,
				...getActorInfo(context),
				changes: changesToApply,
			});

			return item;
		});

		emitInventoryUpdated(organizationId, { itemId });

		return { err: "", item: withStockStatus(updated) };
	} catch (e) {
		if (e instanceof ZodError) {
			return { err: zodMessage(e) };
		}
		if (e instanceof TrackingStockNotZeroError) {
			return { err: e.message };
		}
		console.error("Update item tracking error:", e);
		return { err: "Internal server error" };
	}
};

export const deductInventoryForVisit = async (
	visitId: string,
	tx: Prisma.TransactionClient,
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
				err: zodMessage(e),
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

// ── Serial/batch listings ─────────────────────────────────────────────────────
// Cursor pagination follows the same convention as getInventoryMovements/
// getVehicleMovements: limit defaults to 25 and is clamped to 100, cursor is
// the id of the last row from the previous page, take+1 detects a next page.

export const listItemSerials = async (
	itemId: string,
	query: unknown,
	organizationId: string,
) => {
	const sdb = getScopedDb(organizationId);

	const existing = await sdb.inventory_item.findFirst({ where: { id: itemId } });
	if (!existing) return { err: "Inventory item not found" as const };

	let parsed;
	try {
		parsed = listSerialsQuerySchema.parse(query);
	} catch (e) {
		if (e instanceof ZodError) {
			return { err: zodMessage(e) };
		}
		throw e;
	}

	const take = Math.min(Math.max(parsed.limit ?? 25, 1), 100);

	const serials = await sdb.serial_unit.findMany({
		where: {
			inventory_item_id: itemId,
			...(parsed.status ? { status: parsed.status } : {}),
			...(parsed.vehicle_id ? { current_vehicle_id: parsed.vehicle_id } : {}),
			...(parsed.search
				? {
						OR: [
							{ serial_number: { contains: parsed.search, mode: "insensitive" } },
							{ code: { contains: parsed.search, mode: "insensitive" } },
						],
					}
				: {}),
		},
		// id tiebreaker — serials from one receive share an exact received_at
		// (single createMany), so a non-unique sort key alone makes cursor
		// pagination skip/duplicate rows across pages (matches getInventoryMovements).
		orderBy: [{ received_at: "desc" }, { id: "desc" }],
		take: take + 1,
		...(parsed.cursor ? { cursor: { id: parsed.cursor }, skip: 1 } : {}),
	});

	const hasNext = serials.length > take;
	const page = hasNext ? serials.slice(0, take) : serials;
	const nextCursor = hasNext ? page[page.length - 1].id : null;

	return { err: "", serials: page, nextCursor };
};

export const listItemBatches = async (itemId: string, organizationId: string, query: unknown = {}) => {
	const sdb = getScopedDb(organizationId);

	const existing = await sdb.inventory_item.findFirst({ where: { id: itemId } });
	if (!existing) return { err: "Inventory item not found" as const };

	let parsed;
	try {
		parsed = listBatchesQuerySchema.parse(query);
	} catch (e) {
		if (e instanceof ZodError) {
			return { err: zodMessage(e) };
		}
		throw e;
	}

	const batches = await sdb.stock_batch.findMany({
		where: {
			inventory_item_id: itemId,
			...(parsed.search
				? {
						OR: [
							{ batch_number: { contains: parsed.search, mode: "insensitive" } },
							{ code: { contains: parsed.search, mode: "insensitive" } },
						],
					}
				: {}),
		},
		orderBy: { received_at: "asc" }, // FIFO order, matches how batches are consumed
		include: {
			vehicle_batches: { include: { vehicle: { select: { id: true, name: true } } } },
		},
	});

	const mapped = batches.map((b) => ({
		id: b.id,
		code: b.code,
		batch_number: b.batch_number,
		expires_at: b.expires_at ? b.expires_at.toISOString() : null,
		supplier: b.supplier,
		recalled_at: b.recalled_at ? b.recalled_at.toISOString() : null,
		qty_received: Number(b.qty_received),
		qty_in_warehouse: Number(b.qty_in_warehouse),
		vehicles: b.vehicle_batches.map((vb) => ({
			vehicle_id: vb.vehicle_id,
			vehicle_name: vb.vehicle.name,
			qty_on_hand: Number(vb.qty_on_hand),
		})),
	}));

	return { err: "", batches: mapped };
};

// GET /inventory/:itemId/tracking-summary — per-item rollups for the Serials/
// Batches page header: serial_unit counts bucketed by status, plus batch lot
// count and summed warehouse/vehicle quantities. Aggregated with groupBy/count/
// aggregate (no per-row fetch — not N+1). serial_unit.groupBy is NOT auto-scoped
// by getScopedDb (the query extension only covers findMany/count/aggregate), so
// the org filter is pinned explicitly; stock_batch/vehicle_stock_batch aggregate
// calls ARE scoped by the extension.
export const getItemTrackingSummary = async (itemId: string, organizationId: string) => {
	const sdb = getScopedDb(organizationId);

	const existing = await sdb.inventory_item.findFirst({ where: { id: itemId } });
	if (!existing) return { err: "Inventory item not found" as const };

	const [serialGroups, lots, warehouseAgg, vehicleAgg] = await Promise.all([
		sdb.serial_unit.groupBy({
			by: ["status"],
			where: { inventory_item_id: itemId, organization_id: organizationId },
			_count: { _all: true },
		}),
		sdb.stock_batch.count({ where: { inventory_item_id: itemId } }),
		sdb.stock_batch.aggregate({
			where: { inventory_item_id: itemId },
			_sum: { qty_in_warehouse: true },
		}),
		sdb.vehicle_stock_batch.aggregate({
			where: { batch: { inventory_item_id: itemId } },
			_sum: { qty_on_hand: true },
		}),
	]);

	const serials = { in_warehouse: 0, on_vehicle: 0, consumed: 0, lost: 0, returned: 0 };
	for (const g of serialGroups) {
		const status = g.status as keyof typeof serials;
		if (status in serials) serials[status] = g._count._all;
	}

	return {
		err: "",
		summary: {
			serials,
			batches: {
				lots,
				qty_in_warehouse: Number(warehouseAgg._sum.qty_in_warehouse ?? 0),
				qty_on_vehicles: Number(vehicleAgg._sum.qty_on_hand ?? 0),
			},
		},
	};
};

// ── Batch edit (metadata + recall flag) ───────────────────────────────────────
// batch_number carries a per-item unique index ([organization_id,
// inventory_item_id, batch_number]); a rename collision surfaces as a P2002.
// Same house idiom as isSerialNumberConflict / uniqueConflictField above.
const isBatchNumberConflict = (e: unknown): boolean => p2002TargetHits(e, "batch_number");

// PATCH /inventory/batches/:batchId — edit lot METADATA only (batch_number,
// expires_at, supplier, note) plus the recall flag. Touches NO stock quantities,
// so a direct prisma update is correct (mirrors how serial `note` is a direct
// update). qty_received / qty_in_warehouse remain the exclusive domain of
// recordMovements.
export async function updateBatch(
	batchId: string,
	data: unknown,
	organizationId: string,
	context?: UserContext,
): Promise<{ err?: string; batch?: object }> {
	const sdb = getScopedDb(organizationId);

	const existing = await sdb.stock_batch.findFirst({ where: { id: batchId } });
	if (!existing) return { err: "Batch not found" };

	let parsed;
	try {
		parsed = updateBatchSchema.parse(data);
	} catch (e) {
		if (e instanceof ZodError) return { err: zodMessage(e) };
		throw e;
	}

	const wasRecalled = existing.recalled_at !== null;
	let updated;
	try {
		updated = await sdb.stock_batch.update({
			where: { id: batchId },
			data: {
				...(parsed.batch_number !== undefined ? { batch_number: parsed.batch_number } : {}),
				...(parsed.expires_at !== undefined ? { expires_at: parsed.expires_at ? new Date(parsed.expires_at) : null } : {}),
				...(parsed.supplier !== undefined ? { supplier: parsed.supplier } : {}),
				...(parsed.note !== undefined ? { note: parsed.note } : {}),
				...(parsed.recalled !== undefined
					? { recalled_at: parsed.recalled ? (existing.recalled_at ?? new Date()) : null }
					: {}),
			},
		});
	} catch (e) {
		if (isBatchNumberConflict(e)) return { err: "Batch number already in use for this item" };
		throw e;
	}

	// Audit the metadata edit (recall toggle keeps its own dedicated event below).
	const metaChanges: Record<string, { old: unknown; new: unknown }> = {};
	if (parsed.batch_number !== undefined && parsed.batch_number !== existing.batch_number)
		metaChanges.batch_number = { old: existing.batch_number, new: updated.batch_number };
	if (parsed.supplier !== undefined && parsed.supplier !== existing.supplier)
		metaChanges.supplier = { old: existing.supplier, new: updated.supplier };
	if (parsed.expires_at !== undefined) {
		const oldIso = existing.expires_at ? existing.expires_at.toISOString() : null;
		const newIso = updated.expires_at ? updated.expires_at.toISOString() : null;
		if (oldIso !== newIso) metaChanges.expires_at = { old: oldIso, new: newIso };
	}
	if (Object.keys(metaChanges).length > 0) {
		await logActivity({
			event_type: "stock_batch.updated",
			action: "updated",
			entity_type: "stock_batch",
			entity_id: batchId,
			organization_id: organizationId,
			...getActorInfo(context),
			changes: metaChanges,
		});
	}

	if (parsed.recalled !== undefined && parsed.recalled !== wasRecalled) {
		await logActivity({
			event_type: "stock_batch.recall_toggled",
			action: "updated",
			entity_type: "stock_batch",
			entity_id: batchId,
			organization_id: organizationId,
			...getActorInfo(context),
			changes: { recalled_at: { old: existing.recalled_at, new: updated.recalled_at } },
		});
	}

	emitInventoryUpdated(organizationId, { itemId: existing.inventory_item_id });

	return {
		batch: {
			id: updated.id,
			code: updated.code,
			batch_number: updated.batch_number,
			expires_at: updated.expires_at ? updated.expires_at.toISOString() : null,
			supplier: updated.supplier,
			note: updated.note,
			recalled_at: updated.recalled_at ? updated.recalled_at.toISOString() : null,
			qty_received: Number(updated.qty_received),
			qty_in_warehouse: Number(updated.qty_in_warehouse),
		},
	};
}

// DELETE /inventory/batches/:batchId — hard-delete an EMPTY lot record. Mirrors
// deleteSerial's conservative stance: reject anything that isn't safe rather than
// forcing. A batch is deletable ONLY when it holds zero stock everywhere and has
// no downstream references that the FK graph would corrupt on delete:
//   • qty_in_warehouse must be 0                       (else 4xx — reduce first)
//   • every vehicle's qty_on_hand must be 0            (else 4xx — remove first)
//   • no serial_unit references it (FK is SET NULL)    (else 4xx — would silently
//     drop per-unit recall linkage)
//   • never moved: no stock_movement_batch join at all (STRICT — any movement
//     history, not just "consumed", blocks the delete; that join IS the recall/
//     audit trail, symmetric with the serial "never-moved" rule)
// All guards re-run INSIDE the tx against a locked row (SELECT … FOR UPDATE) so a
// concurrent bump between the pre-tx existence check and the delete can't slip past.
// Because the batch is already zero everywhere, NO compensating movement is needed
// (unlike deleteSerial, which zeroes a still-held unit) — deletion writes no stock
// quantity at all. Residual zero-qty vehicle_stock_batch rows persist after a
// return-to-warehouse (they are decremented, never deleted) and would block the
// delete via the RESTRICT FK, so they are cleared inside the transaction; all are
// zero (guarded above) so removing those cache rows changes no quantity.
class BatchNotDeletableError extends Error {}

export const deleteBatch = async (
	batchId: string,
	organizationId: string,
	context?: UserContext,
) => {
	try {
		const sdb = getScopedDb(organizationId);
		// Cheap existence + org-scope check for the not-found fast path (and to
		// carry inventory_item_id out for the socket emit). All deletability guards
		// are re-run INSIDE the tx against the locked row — see below.
		const exists = await sdb.stock_batch.findFirst({
			where: { id: batchId },
			select: { id: true, inventory_item_id: true },
		});
		if (!exists) return { err: "Batch not found" };

		await sdb.$transaction(async (tx) => {
			// TOCTOU: lock the batch row FIRST, then re-read + re-run every guard
			// against that locked snapshot so a concurrent stock bump / movement
			// insert between the pre-tx check and the delete cannot slip through.
			await lockBatchRows(tx as unknown as Prisma.TransactionClient, [batchId]);

			const batch = await tx.stock_batch.findFirst({
				where: { id: batchId },
				include: {
					vehicle_batches: { select: { id: true, qty_on_hand: true } },
					_count: { select: { serial_units: true } },
				},
			});
			if (!batch) throw new BatchNotDeletableError("Batch not found");

			const warehouseQty = Number(batch.qty_in_warehouse);
			if (warehouseQty !== 0)
				throw new BatchNotDeletableError(
					`Cannot delete a batch with ${warehouseQty} unit(s) still in the warehouse — reduce to zero first`,
				);

			const vehicleQty = batch.vehicle_batches.reduce((s, vb) => s + Number(vb.qty_on_hand), 0);
			if (vehicleQty !== 0)
				throw new BatchNotDeletableError(
					`Cannot delete a batch still held on a vehicle (${vehicleQty} unit(s)) — remove from vehicles first`,
				);

			if (batch._count.serial_units > 0)
				throw new BatchNotDeletableError(
					"Cannot delete a batch with associated serial units — delete or reassign them first",
				);

			// STRICT policy: ANY movement-history join blocks the delete (not just
			// "consumed"). That join IS the recall/audit trail — symmetric with the
			// serial "never-moved" rule.
			const movementJoins = await tx.stock_movement_batch.count({ where: { batch_id: batchId } });
			if (movementJoins > 0)
				throw new BatchNotDeletableError(
					"Cannot delete a batch with movement history — it is needed for recall reporting",
				);

			if (batch.vehicle_batches.length > 0) {
				await tx.vehicle_stock_batch.deleteMany({ where: { batch_id: batchId } });
			}

			await tx.stock_batch.delete({ where: { id: batchId } });

			await logActivity({
				event_type: "stock_batch.deleted",
				action: "deleted",
				entity_type: "stock_batch",
				entity_id: batchId,
				organization_id: organizationId,
				...getActorInfo(context),
				changes: {
					batch_number: { old: batch.batch_number, new: null },
				},
			});
		});

		emitInventoryUpdated(organizationId, { itemId: exists.inventory_item_id });

		return { err: "" };
	} catch (e) {
		if (e instanceof BatchNotDeletableError) return { err: e.message };
		console.error("Delete batch error:", e);
		return { err: "Internal server error" };
	}
};

// ── Recall report ──────────────────────────────────────────────────────────────
// Serial-level consumption reads serial_unit.status directly (a reversal already
// clears the consumption snapshot in place — see applyTracking's isReversal
// branch — so no netting is needed there). Qty-only batch allocations have no
// per-unit row, so consumption vs. reversal is netted by visit_line_item_id
// (movements carry no back-reference to the movement they reverse).

export async function getBatchImpact(batchId: string, organizationId: string) {
	const sdb = getScopedDb(organizationId);

	const batch = await sdb.stock_batch.findFirst({
		where: { id: batchId },
		include: {
			inventory_item: { select: { id: true, name: true, is_serialized: true } },
			vehicle_batches: { include: { vehicle: { select: { id: true, name: true } } } },
		},
	});
	if (!batch) return { err: "Batch not found" as const };

	const remaining_vehicles = batch.vehicle_batches.map((vb) => ({
		vehicle_id: vb.vehicle_id,
		vehicle_name: vb.vehicle.name,
		qty_on_hand: Number(vb.qty_on_hand),
	}));
	const remaining_warehouse = Number(batch.qty_in_warehouse);
	const remaining_total = remaining_warehouse + remaining_vehicles.reduce((s, v) => s + v.qty_on_hand, 0);

	const consumedSerials = batch.inventory_item.is_serialized
		? await sdb.serial_unit.findMany({
				where: { batch_id: batchId, status: "consumed" },
				select: {
					id: true,
					code: true,
					serial_number: true,
					consumed_at: true,
					client: { select: { id: true, name: true } },
					consumed_visit: {
						select: { id: true, name: true, job: { select: { id: true, job_number: true, name: true } } },
					},
				},
			})
		: [];

	const allocs = await sdb.stock_movement_batch.findMany({
		where: { batch_id: batchId },
		include: {
			movement: {
				select: {
					reason: true,
					to_location_type: true,
					visit_line_item: { select: { id: true, name: true } },
					visit: {
						select: {
							id: true,
							name: true,
							job: {
								select: {
									id: true,
									job_number: true,
									name: true,
									client: { select: { id: true, name: true } },
								},
							},
						},
					},
				},
			},
		},
	});

	interface LineItemImpact {
		visit_line_item_id: string;
		line_item_name: string;
		visit_id: string;
		visit_name: string | null;
		job_id: string;
		job_number: string;
		job_name: string;
		client_id: string;
		client_name: string;
		consumed_qty: number;
		reversed_qty: number;
	}
	const byLineItem = new Map<string, LineItemImpact>();

	for (const alloc of allocs) {
		const mv = alloc.movement;
		const lineItemId = mv.visit_line_item?.id;
		if (!lineItemId || !mv.visit) continue; // only line-item-attributed consumption is recall-relevant
		if (mv.to_location_type !== "consumed" && mv.reason !== "reversal") continue;

		let entry = byLineItem.get(lineItemId);
		if (!entry) {
			entry = {
				visit_line_item_id: lineItemId,
				line_item_name: mv.visit_line_item?.name ?? "Line item",
				visit_id: mv.visit.id,
				visit_name: mv.visit.name,
				job_id: mv.visit.job.id,
				job_number: mv.visit.job.job_number,
				job_name: mv.visit.job.name,
				client_id: mv.visit.job.client.id,
				client_name: mv.visit.job.client.name,
				consumed_qty: 0,
				reversed_qty: 0,
			};
			byLineItem.set(lineItemId, entry);
		}
		const qty = Number(alloc.qty);
		if (mv.to_location_type === "consumed") entry.consumed_qty += qty;
		else entry.reversed_qty += qty;
	}

	const affected_jobs = [...byLineItem.values()].map((e) => ({
		...e,
		net_qty: e.consumed_qty - e.reversed_qty,
		fully_reversed: e.consumed_qty - e.reversed_qty <= 0,
	}));

	const affected_serials = consumedSerials.map((s) => ({
		id: s.id,
		code: s.code,
		serial_number: s.serial_number,
		consumed_at: s.consumed_at ? s.consumed_at.toISOString() : null,
		client: s.client,
		visit: s.consumed_visit
			? { id: s.consumed_visit.id, name: s.consumed_visit.name, job: s.consumed_visit.job }
			: null,
	}));

	return {
		err: "" as const,
		batch: {
			id: batch.id,
			code: batch.code,
			batch_number: batch.batch_number,
			item_id: batch.inventory_item.id,
			item_name: batch.inventory_item.name,
			expires_at: batch.expires_at ? batch.expires_at.toISOString() : null,
			recalled_at: batch.recalled_at ? batch.recalled_at.toISOString() : null,
		},
		remaining: { warehouse: remaining_warehouse, vehicles: remaining_vehicles, total: remaining_total },
		affected_serials,
		affected_jobs,
	};
}

export async function exportBatchImpactToXlsx(
	batchId: string,
	organizationId: string,
): Promise<{ err?: string; buffer?: Buffer }> {
	const result = await getBatchImpact(batchId, organizationId);
	if (result.err) return { err: result.err };

	const rows = [
		...result.affected_jobs!.map((j) => ({
			Type: "Job/Visit",
			Client: j.client_name,
			Job: `${j.job_number} — ${j.job_name}`,
			"Visit/Line Item": j.line_item_name,
			"Qty Consumed": j.consumed_qty,
			"Qty Reversed": j.reversed_qty,
			"Net Qty": j.net_qty,
			Status: j.fully_reversed ? "Reversed" : "Active",
		})),
		...result.affected_serials!.map((s) => ({
			Type: "Serial",
			Client: s.client?.name ?? "",
			Job: s.visit?.job ? `${s.visit.job.job_number} — ${s.visit.job.name}` : "",
			"Visit/Line Item": s.serial_number,
			"Qty Consumed": 1,
			"Qty Reversed": 0,
			"Net Qty": 1,
			Status: "Active",
		})),
	];

	const ws = XLSX.utils.json_to_sheet(rows);
	ws["!cols"] = [12, 20, 30, 24, 12, 12, 10, 10].map((wch) => ({ wch }));
	const wb = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(wb, ws, "Batch Recall Report");

	return { buffer: Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" })) };
}

// ── Serial lifecycle ────────────────────────────────────────────────────────────

export async function getSerialHistory(serialId: string, organizationId: string) {
	const sdb = getScopedDb(organizationId);

	const serial = await sdb.serial_unit.findFirst({
		where: { id: serialId },
		include: {
			inventory_item: { select: { id: true, name: true } },
			current_vehicle: { select: { id: true, name: true } },
			client: { select: { id: true, name: true } },
			consumed_visit: {
				select: { id: true, name: true, job: { select: { id: true, job_number: true, name: true } } },
			},
			batch: { select: { id: true, batch_number: true, code: true } },
		},
	});
	if (!serial) return { err: "Serial unit not found" as const };

	const joins = await sdb.stock_movement_serial.findMany({
		where: { serial_unit_id: serialId },
		include: {
			movement: {
				select: {
					id: true,
					reason: true,
					from_location_type: true,
					from_vehicle: { select: { id: true, name: true } },
					to_location_type: true,
					to_vehicle: { select: { id: true, name: true } },
					note: true,
					actor_type: true,
					created_at: true,
					visit: { select: { id: true, name: true, job: { select: { id: true, job_number: true, name: true } } } },
				},
			},
		},
	});

	const timeline = joins
		.map((j) => j.movement)
		.sort((a, b) => a.created_at.getTime() - b.created_at.getTime())
		.map((m) => ({
			id: m.id,
			reason: m.reason,
			from_location_type: m.from_location_type,
			from_vehicle: m.from_vehicle,
			to_location_type: m.to_location_type,
			to_vehicle: m.to_vehicle,
			note: m.note,
			actor_type: m.actor_type,
			created_at: m.created_at.toISOString(),
			visit: m.visit ? { id: m.visit.id, name: m.visit.name, job: m.visit.job } : null,
		}));

	return {
		err: "" as const,
		serial: {
			id: serial.id,
			code: serial.code,
			serial_number: serial.serial_number,
			status: serial.status,
			item: serial.inventory_item,
			current_vehicle: serial.current_vehicle,
			batch: serial.batch,
			received_at: serial.received_at.toISOString(),
			consumed_at: serial.consumed_at ? serial.consumed_at.toISOString() : null,
			client: serial.client,
			consumed_visit: serial.consumed_visit
				? { id: serial.consumed_visit.id, name: serial.consumed_visit.name, job: serial.consumed_visit.job }
				: null,
			note: serial.note,
		},
		timeline,
	};
}

// ── Serial edit (status change / note) ────────────────────────────────────────
// Business-rule failure raised inside the serial-edit/delete transactions.
// Thrown from inside $transaction so nothing commits, then mapped to a
// 400-style { err } result in the outer catch (same house convention as
// TrackingStockNotZeroError above).
class SerialNotDeletableError extends Error {}

// PATCH /inventory/serials/:serialId — mark an in-warehouse unit lost/returned
// and/or edit its note. Status changes go through recordMovements so
// inventory_item.quantity (written ONLY there) stays truthful: "lost" is a
// warehouse→adjustment loss; "returned" is a warehouse→external audit_correction
// (the reason enum has no return-to-supplier reason — audit_correction is the
// agreed choice). Only in-warehouse units can change status.
export const updateSerial = async (
	serialId: string,
	data: unknown,
	organizationId: string,
	context?: UserContext,
) => {
	try {
		const sdb = getScopedDb(organizationId);
		const serial = await sdb.serial_unit.findFirst({ where: { id: serialId } });

		if (!serial) {
			return { err: "Serial unit not found" };
		}

		const parsed = updateSerialSchema.parse(data);
		const actor = toActorInfo(context);

		const updated = await sdb.$transaction(async (tx) => {
			if (parsed.status !== undefined) {
				if (serial.status !== "in_warehouse") {
					throw new TrackingValidationError(
						"Only in-warehouse units can be marked lost or returned",
					);
				}
				const movement: MovementInput =
					parsed.status === "lost"
						? {
								inventory_item_id: serial.inventory_item_id,
								qty: 1,
								from_location_type: "warehouse",
								to_location_type: "adjustment",
								reason: "loss",
								serial: { unit_ids: [serialId] },
							}
						: {
								inventory_item_id: serial.inventory_item_id,
								qty: 1,
								from_location_type: "warehouse",
								to_location_type: "external",
								reason: "audit_correction",
								serial: { unit_ids: [serialId] },
							};
				await recordMovements(
					tx as unknown as Prisma.TransactionClient,
					organizationId,
					actor,
					[movement],
				);
			}

			if (parsed.note !== undefined) {
				await tx.serial_unit.update({
					where: { id: serialId },
					data: { note: parsed.note },
				});
			}

			const after = await tx.serial_unit.findFirst({ where: { id: serialId } });

			await logActivity({
				event_type: "serial_unit.updated",
				action: "updated",
				entity_type: "serial_unit",
				entity_id: serialId,
				organization_id: organizationId,
				...getActorInfo(context),
				changes: {
					...(parsed.status !== undefined
						? { status: { old: serial.status, new: after?.status } }
						: {}),
					...(parsed.note !== undefined
						? { note: { old: serial.note, new: parsed.note } }
						: {}),
				},
			});

			return after!;
		});

		emitInventoryUpdated(organizationId, { itemId: serial.inventory_item_id });

		return { err: "", serial: updated };
	} catch (e) {
		if (e instanceof ZodError) {
			return { err: zodMessage(e) };
		}
		if (e instanceof InsufficientBatchStockError || e instanceof TrackingValidationError) {
			return { err: e.message };
		}
		console.error("Update serial error:", e);
		return { err: "Internal server error" };
	}
};

// DELETE /inventory/serials/:serialId — hard-delete a serial ONLY when it has
// never moved beyond its initial receive. A compensating warehouse-out movement
// runs first so inventory_item.quantity (written ONLY by recordMovements) stays
// truthful; the stock_movement_serial join rows cascade on the delete itself
// (schema onDelete: Cascade).
export const deleteSerial = async (
	serialId: string,
	organizationId: string,
	context?: UserContext,
) => {
	try {
		const sdb = getScopedDb(organizationId);
		// Cheap existence + org-scope check for the not-found fast path (and to
		// carry inventory_item_id out for the socket emit). Eligibility itself is
		// computed INSIDE the tx from the locked re-read — see below.
		const exists = await sdb.serial_unit.findFirst({
			where: { id: serialId },
			select: { id: true, inventory_item_id: true },
		});

		if (!exists) {
			return { err: "Serial unit not found" };
		}

		const actor = toActorInfo(context);

		await sdb.$transaction(async (tx) => {
			// TOCTOU: lock the serial row FIRST, then re-fetch it + its movement
			// joins and compute eligibility from THAT locked read. Using the pre-tx
			// snapshot would let a concurrent move (e.g. a restock) between read and
			// tx slip past the "never-moved" guard.
			await lockSerialRows(tx as unknown as Prisma.TransactionClient, [serialId]);

			const serial = await tx.serial_unit.findFirst({
				where: { id: serialId },
				include: {
					movement_serials: { include: { movement: { select: { reason: true } } } },
				},
			});
			if (!serial) throw new SerialNotDeletableError("Serial unit not found");

			const initialReasons = new Set(["receive", "initial", "supplier_purchase"]);
			const eligible =
				serial.status === "in_warehouse" &&
				serial.consumed_at == null &&
				serial.current_vehicle_id == null &&
				serial.movement_serials.every((ms) => initialReasons.has(ms.movement.reason));

			if (!eligible) {
				throw new SerialNotDeletableError(
					"Only never-moved, in-warehouse units can be deleted.",
				);
			}

			const movement: MovementInput = {
				inventory_item_id: serial.inventory_item_id,
				qty: 1,
				from_location_type: "warehouse",
				to_location_type: "adjustment",
				reason: "audit_correction",
				serial: { unit_ids: [serialId] },
			};
			await recordMovements(
				tx as unknown as Prisma.TransactionClient,
				organizationId,
				actor,
				[movement],
			);

			await tx.serial_unit.delete({ where: { id: serialId } });

			await logActivity({
				event_type: "serial_unit.deleted",
				action: "deleted",
				entity_type: "serial_unit",
				entity_id: serialId,
				organization_id: organizationId,
				...getActorInfo(context),
				changes: {
					serial_number: { old: serial.serial_number, new: null },
				},
			});
		});

		emitInventoryUpdated(organizationId, { itemId: exists.inventory_item_id });

		return { err: "" };
	} catch (e) {
		if (e instanceof SerialNotDeletableError) {
			return { err: e.message };
		}
		console.error("Delete serial error:", e);
		return { err: "Internal server error" };
	}
};

// ── Tracking reconciliation ──────────────────────────────────────────────────────
// Safety-net report, not a hot path: per-item cache-vs-truth drift + a feed of
// [TRACKING_GAP] movements (visit completions that skipped serial/batch capture,
// see services/inventoryTracking.ts's allowUntracked branch).

export async function getTrackingReconciliation(organizationId: string) {
	const sdb = getScopedDb(organizationId);

	const items = await sdb.inventory_item.findMany({
		where: { is_active: true, OR: [{ is_serialized: true }, { is_batch_tracked: true }] },
		select: {
			id: true,
			name: true,
			quantity: true,
			is_serialized: true,
			is_batch_tracked: true,
			vehicle_stocks: { select: { vehicle_id: true, qty_on_hand: true, vehicle: { select: { name: true } } } },
		},
	});

	interface Drift {
		item_id: string;
		item_name: string;
		scope: "warehouse" | "vehicle";
		vehicle_id?: string;
		vehicle_name?: string;
		expected: number;
		actual: number;
	}
	const drifts: Drift[] = [];

	const serializedItemIds = items.filter((i) => i.is_serialized).map((i) => i.id);
	const batchTrackedItemIds = items.filter((i) => i.is_batch_tracked).map((i) => i.id);

	// Bulk serial warehouse+vehicle counts: one groupBy for every tracked item,
	// diffed against the items+vehicle_stocks in memory below. NOTE: groupBy is
	// not covered by getScopedDb's org-scoping extension, so organization_id is
	// added to the where clause explicitly (matches reportsController's usage).
	const serialCountMap = new Map<string, number>();
	if (serializedItemIds.length > 0) {
		const serialGroups = await sdb.serial_unit.groupBy({
			by: ["inventory_item_id", "status", "current_vehicle_id"],
			where: {
				organization_id: organizationId,
				inventory_item_id: { in: serializedItemIds },
				status: { in: ["in_warehouse", "on_vehicle"] },
			},
			_count: { id: true },
		});
		for (const g of serialGroups) {
			const key = `${g.inventory_item_id}|${g.status}|${g.current_vehicle_id ?? ""}`;
			serialCountMap.set(key, g._count.id);
		}
	}

	// Bulk batch quantities: one findMany for every batch-tracked item, grouped
	// in memory into warehouse sums + per-vehicle sums.
	const batchWarehouseByItem = new Map<string, number>();
	const batchVehicleByItem = new Map<string, Map<string, number>>();
	if (batchTrackedItemIds.length > 0) {
		const batches = await sdb.stock_batch.findMany({
			where: { inventory_item_id: { in: batchTrackedItemIds } },
			select: {
				inventory_item_id: true,
				qty_in_warehouse: true,
				vehicle_batches: { select: { vehicle_id: true, qty_on_hand: true } },
			},
		});
		for (const b of batches) {
			batchWarehouseByItem.set(
				b.inventory_item_id,
				(batchWarehouseByItem.get(b.inventory_item_id) ?? 0) + Number(b.qty_in_warehouse),
			);
			let vehicleSums = batchVehicleByItem.get(b.inventory_item_id);
			if (!vehicleSums) {
				vehicleSums = new Map<string, number>();
				batchVehicleByItem.set(b.inventory_item_id, vehicleSums);
			}
			for (const vb of b.vehicle_batches) {
				vehicleSums.set(vb.vehicle_id, (vehicleSums.get(vb.vehicle_id) ?? 0) + Number(vb.qty_on_hand));
			}
		}
	}

	for (const item of items) {
		if (item.is_serialized) {
			const warehouseCount = serialCountMap.get(`${item.id}|in_warehouse|`) ?? 0;
			if (warehouseCount !== item.quantity) {
				drifts.push({
					item_id: item.id,
					item_name: item.name,
					scope: "warehouse",
					expected: item.quantity,
					actual: warehouseCount,
				});
			}
			for (const vs of item.vehicle_stocks) {
				const vehicleCount = serialCountMap.get(`${item.id}|on_vehicle|${vs.vehicle_id}`) ?? 0;
				if (vehicleCount !== Number(vs.qty_on_hand)) {
					drifts.push({
						item_id: item.id,
						item_name: item.name,
						scope: "vehicle",
						vehicle_id: vs.vehicle_id,
						vehicle_name: vs.vehicle.name,
						expected: Number(vs.qty_on_hand),
						actual: vehicleCount,
					});
				}
			}
		}

		if (item.is_batch_tracked) {
			const batchWarehouseSum = batchWarehouseByItem.get(item.id) ?? 0;
			if (batchWarehouseSum !== item.quantity) {
				drifts.push({
					item_id: item.id,
					item_name: item.name,
					scope: "warehouse",
					expected: item.quantity,
					actual: batchWarehouseSum,
				});
			}
			const vehicleBatchSums = batchVehicleByItem.get(item.id);
			for (const vs of item.vehicle_stocks) {
				const batchSum = vehicleBatchSums?.get(vs.vehicle_id) ?? 0;
				if (batchSum !== Number(vs.qty_on_hand)) {
					drifts.push({
						item_id: item.id,
						item_name: item.name,
						scope: "vehicle",
						vehicle_id: vs.vehicle_id,
						vehicle_name: vs.vehicle.name,
						expected: Number(vs.qty_on_hand),
						actual: batchSum,
					});
				}
			}
		}
	}

	const gaps = await sdb.stock_movement.findMany({
		where: { note: { contains: "[TRACKING_GAP]" } },
		orderBy: { created_at: "desc" },
		take: 50,
		include: {
			inventory_item: { select: { id: true, name: true } },
			visit: { select: { id: true, name: true, job: { select: { id: true, job_number: true, name: true } } } },
		},
	});

	return {
		err: "" as const,
		drifts,
		gaps: gaps.map((g) => ({
			id: g.id,
			item: g.inventory_item,
			qty: Number(g.qty),
			reason: g.reason,
			note: g.note,
			created_at: g.created_at.toISOString(),
			visit: g.visit ? { id: g.visit.id, name: g.visit.name, job: g.visit.job } : null,
		})),
	};
}

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

const approveProvisionalSchema = z.object({
	initial_warehouse_qty: z.number().int().min(0).optional(),
});

export async function approveProvisionalItem(
	itemId: string,
	orgId: string,
	data: unknown,
	context?: UserContext,
): Promise<{ err?: string; item?: object }> {
	try {
		const parsed = approveProvisionalSchema.parse(data ?? {});
		const item = await db.$transaction(async (tx) => {
			const claimed = await tx.inventory_item.updateMany({
				where: { id: itemId, organization_id: orgId, provisional: true },
				data: { provisional: false, approved_at: new Date(), approved_by_id: context?.dispatcherId ?? null },
			});
			if (claimed.count === 0) throw new Error("Provisional item not found");

			if (parsed.initial_warehouse_qty && parsed.initial_warehouse_qty > 0) {
				await recordMovements(
					tx,
					orgId,
					{ actor_type: context?.dispatcherId ? "dispatcher" : "system", actor_id: context?.dispatcherId },
					[{
						inventory_item_id:  itemId,
						qty:                parsed.initial_warehouse_qty,
						from_location_type: "external",
						to_location_type:   "warehouse",
						reason:             "receive",
						note:               "Initial warehouse stock set at approval",
					}],
				);
			}

			return tx.inventory_item.findFirst({ where: { id: itemId } });
		});

		await logActivity({
			event_type: "inventory_item.approved",
			action: "updated",
			entity_type: "inventory_item",
			entity_id: itemId,
			organization_id: orgId,
			...getActorInfo(context),
			changes: {
				provisional: { old: true, new: false },
				...(parsed.initial_warehouse_qty ? { initial_warehouse_qty: { old: 0, new: parsed.initial_warehouse_qty } } : {}),
			},
		});
		return { item: item! };
	} catch (e: unknown) {
		if (e instanceof Error && e.message === "Provisional item not found") return { err: e.message };
		if (e instanceof ZodError) return { err: zodMessage(e) };
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
		if (e instanceof ZodError) return { err: zodMessage(e) };
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
