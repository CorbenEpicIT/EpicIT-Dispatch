import { z, ZodError } from "zod";
import { Prisma } from "../../generated/prisma/client.js";
import { log } from "../services/appLogger.js";
import { getScopedDb, UserContext } from "../lib/context.js";

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
	qty_on_hand: z.number().min(0).optional(),
	qty_min:     z.number().min(0).optional(),
});

const restockRequestSchema = z.object({
	qty_requested: z.number().positive().nullable().optional(),
	note:          z.string().max(500).nullable().optional(),
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

export const createVehicle = async (data: unknown, organizationId: string) => {
	try {
		const parsed = createVehicleSchema.parse(data);
		const sdb = getScopedDb(organizationId);
		const vehicle = await sdb.vehicle.create({
			data: {
				...parsed,
				organization_id: organizationId,
			},
		});
		return { err: "", item: vehicle };
	} catch (e: unknown) {
		if (e instanceof ZodError) return { err: `Validation failed: ${e.issues.map((i) => i.message).join(", ")}` };
		log.error({ err: e }, "Failed to create vehicle");
		return { err: "Failed to create vehicle" };
	}
};

export const updateVehicle = async (id: string, data: unknown, organizationId: string) => {
	try {
		const parsed = updateVehicleSchema.parse(data);
		const sdb = getScopedDb(organizationId);
		const vehicle = await sdb.vehicle.update({
			where: { id },
			data: parsed,
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
	const vehicle = await sdb.vehicle.findUnique({ where: { id: vehicleId } });
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

export const addVehicleStockItem = async (vehicleId: string, data: unknown, organizationId: string) => {
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

		const item = await sdb.vehicle_stock_item.create({
			data: {
				vehicle_id:        vehicleId,
				inventory_item_id: parsed.inventory_item_id,
				qty_on_hand:       parsed.qty_on_hand,
				qty_min:           parsed.qty_min,
			},
			include: { inventory_item: true },
		});
		return { err: "", item };
	} catch (e: unknown) {
		if (e instanceof ZodError) return { err: `Validation failed: ${e.issues.map((i) => i.message).join(", ")}` };
		log.error({ err: e }, "Failed to add vehicle stock item");
		return { err: "Failed to add stock item" };
	}
};

export const updateVehicleStockItem = async (vehicleId: string, itemId: string, data: unknown, organizationId: string) => {
	try {
		const parsed = updateStockItemSchema.parse(data);
		const sdb = getScopedDb(organizationId);

		const existing = await sdb.vehicle_stock_item.findFirst({
			where: { id: itemId, vehicle_id: vehicleId },
		});
		if (!existing) return { err: "Stock item not found" };

		const item = await sdb.vehicle_stock_item.update({
			where: { id: itemId },
			data: {
				...(parsed.qty_on_hand !== undefined && { qty_on_hand: parsed.qty_on_hand }),
				...(parsed.qty_min !== undefined && { qty_min: parsed.qty_min }),
			},
			include: { inventory_item: true },
		});
		return { err: "", item };
	} catch (e: unknown) {
		if (e instanceof ZodError) return { err: `Validation failed: ${e.issues.map((i) => i.message).join(", ")}` };
		log.error({ err: e }, "Failed to update vehicle stock item");
		return { err: "Failed to update stock item" };
	}
};

export const deleteVehicleStockItem = async (vehicleId: string, itemId: string, organizationId: string) => {
	
	try {
		const sdb = getScopedDb(organizationId);
		const existing = await sdb.vehicle_stock_item.findFirst({
			where: { id: itemId, vehicle_id: vehicleId },
		});
		if (!existing) return { err: "Stock item not found" };

		await sdb.vehicle_stock_item.delete({ where: { id: itemId } });
		return { err: "" };
	} catch (e: unknown) {
		log.error({ err: e }, "Failed to delete vehicle stock item");
		return { err: "Failed to delete stock item" };
	}
};

export const createRestockRequest = async (vehicleId: string, itemId: string, technicianId: string, data: unknown, organizationId: string) => {
	try {
		const parsed = restockRequestSchema.parse(data);
		const sdb = getScopedDb(organizationId);

		const stockItem = await sdb.vehicle_stock_item.findFirst({
			where: { id: itemId, vehicle_id: vehicleId },
		});
		if (!stockItem) return { err: "Stock item not found" };

		const request = await sdb.vehicle_restock_request.create({
			data: {
				stock_item_id:  itemId,
				technician_id:  technicianId,
				qty_requested:  parsed.qty_requested ?? null,
				note:           parsed.note ?? null,
				status:         "pending",
			},
		});
		return { err: "", item: request };
	} catch (e: unknown) {
		if (e instanceof ZodError) return { err: `Validation failed: ${e.issues.map((i) => i.message).join(", ")}` };
		log.error({ err: e }, "Failed to create restock request");
		return { err: "Failed to create restock request" };
	}
};

// ── Technician vehicle assignment ─────────────────────────────────────────────

export const setTechnicianVehicle = async (technicianId: string, vehicleId: string | null, organizationId: string) => {
	
	try {
		const sdb = getScopedDb(organizationId);
		if (vehicleId !== null) {
			const vehicle = await sdb.vehicle.findUnique({ where: { id: vehicleId } });
			if (!vehicle) return { err: "Vehicle not found" };
		}

		const technician = await sdb.technician.update({
			where: { id: technicianId },
			data: { current_vehicle_id: vehicleId },
			select: { id: true, name: true, current_vehicle_id: true, current_vehicle: true },
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

		const stockItem = await sdb.vehicle_stock_item.findUnique({
			where: { id: parsed.stock_item_id },
			include: { inventory_item: true },
		});
		if (!stockItem) return { err: "Stock item not found" };

		const visit = await sdb.job_visit.findUnique({ where: { id: visitId } });
		if (!visit) return { err: "Visit not found" };

		const result = await sdb.$transaction(async (tx) => {
			// Decrement stock
			await tx.vehicle_stock_item.update({
				where: { id: parsed.stock_item_id },
				data: { qty_on_hand: { decrement: parsed.qty_used } },
			});

			// Create line item
			const unitPrice = stockItem.inventory_item.unit_price ?? 0;
			const qty = parsed.qty_used;
			const lineItem = await tx.job_visit_line_item.create({
				data: {
					visit_id:   visitId,
					name:       stockItem.inventory_item.name,
					quantity:   qty,
					unit_price: unitPrice,
					total:      Number(unitPrice) * qty,
					source:     "field_addition",
					item_type:  "material",
					sort_order: 0,
					inventory_item_id: stockItem.inventory_item_id,
				},
			});

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

			return { lineItem, usage };
		});

		return { err: "", item: result };
	} catch (e: unknown) {
		if (e instanceof ZodError) return { err: `Validation failed: ${e.issues.map((i) => i.message).join(", ")}` };
		log.error({ err: e }, "Failed to add parts used");
		return { err: "Failed to add parts used" };
	}
};
