import { Router } from "express";
import { ErrorCodes, createSuccessResponse, createErrorResponse } from "../types/responses.js";
import { getUserContext } from "../lib/context.js";
import {
	listVehicles,
	createVehicle,
	updateVehicle,
	listVehicleStock,
	addVehicleStockItem,
	updateVehicleStockItem,
	deleteVehicleStockItem,
	createRestockRequest,
} from "../controllers/vehiclesController.js";
import { requirePermission, requireAnyPermission } from "../lib/requirePermissions.js";

const router = Router();

router.get("/", requireAnyPermission("view_inventory", "manage_technicians", "use_inventory"), async (req, res, next) => {
	try {
		const orgId = req.user?.organization_id as string ?? undefined;
		const { status } = req.query as { status?: string };
		const vehicles = await listVehicles(orgId, status);
		res.json(createSuccessResponse(vehicles, { count: vehicles.length }));
	} catch (err) {
		next(err);
	}
});

router.post("/", requirePermission("manage_technicians"), async (req, res, next) => {
	try {
		const context = getUserContext(req);
		const orgId = req.user?.organization_id as string ?? undefined;
		const result = await createVehicle(req.body, orgId, context);
		if (result.err) {
			return res.status(400).json(createErrorResponse(ErrorCodes.VALIDATION_ERROR, result.err));
		}
		res.status(201).json(createSuccessResponse(result.item));
	} catch (err) {
		next(err);
	}
});

router.put("/:id", requirePermission("manage_technicians"), async (req, res, next) => {
	try {
		const id = req.params.id as string;
		const context = getUserContext(req);
		const orgId = req.user?.organization_id as string ?? undefined;
		const result = await updateVehicle(id, req.body, orgId, context);
		if (result.err) {
			const statusCode = result.err.includes("not found") ? 404 : 400;
			return res.status(statusCode).json(createErrorResponse(ErrorCodes.VALIDATION_ERROR, result.err));
		}
		res.json(createSuccessResponse(result.item));
	} catch (err) {
		next(err);
	}
});

router.get("/:id/stock", requireAnyPermission("view_inventory", "manage_technicians", "use_inventory"), async (req, res, next) => {
	try {
		const id = req.params.id as string;
		const orgId = req.user?.organization_id as string ?? undefined;
		const result = await listVehicleStock(id, orgId);
		if (result.err) {
			return res.status(404).json(createErrorResponse(ErrorCodes.NOT_FOUND, result.err));
		}
		res.json(createSuccessResponse(result.items, { count: result.items!.length }));
	} catch (err) {
		next(err);
	}
});

router.post("/:id/stock", requireAnyPermission("manage_inventory", "manage_technicians"), async (req, res, next) => {
	try {
		const id = req.params.id as string;
		const context = getUserContext(req);
		const orgId = req.user?.organization_id as string ?? undefined;
		const result = await addVehicleStockItem(id, req.body, orgId, context);
		if (result.err) {
			const statusCode = result.err.includes("not found") ? 404 : 400;
			return res.status(statusCode).json(createErrorResponse(ErrorCodes.VALIDATION_ERROR, result.err));
		}
		res.status(201).json(createSuccessResponse(result.item));
	} catch (err) {
		next(err);
	}
});

router.put("/:id/stock/:itemId", requireAnyPermission("manage_inventory", "manage_technicians"), async (req, res, next) => {
	try {
		const { id, itemId } = req.params as { id: string; itemId: string };
		const context = getUserContext(req);
		const orgId = req.user?.organization_id as string ?? undefined;
		const result = await updateVehicleStockItem(id, itemId, req.body, orgId, context);
		if (result.err) {
			const statusCode = result.err.includes("not found") ? 404 : 400;
			return res.status(statusCode).json(createErrorResponse(ErrorCodes.VALIDATION_ERROR, result.err));
		}
		res.json(createSuccessResponse(result.item));
	} catch (err) {
		next(err);
	}
});

router.delete("/:id/stock/:itemId", requireAnyPermission("manage_inventory", "manage_technicians"), async (req, res, next) => {
	try {
		const { id, itemId } = req.params as { id: string; itemId: string };
		const context = getUserContext(req);
		const orgId = req.user?.organization_id as string ?? undefined;
		const result = await deleteVehicleStockItem(id, itemId, orgId, context);
		if (result.err) {
			const statusCode = result.err.includes("not found") ? 404 : 400;
			return res.status(statusCode).json(createErrorResponse(ErrorCodes.DELETE_ERROR, result.err));
		}
		res.json(createSuccessResponse(null));
	} catch (err) {
		next(err);
	}
});

router.post("/:id/stock/:itemId/restock-request", requireAnyPermission("use_inventory", "manage_inventory"), async (req, res, next) => {
	try {
		const { id, itemId } = req.params as { id: string; itemId: string };
		const technicianId = req.user?.uid ?? "";
		const orgId = req.user?.organization_id as string ?? undefined;
		const result = await createRestockRequest(id, itemId, technicianId, req.body, orgId);
		if (result.err) {
			const statusCode = result.err.includes("not found") ? 404 : 400;
			return res.status(statusCode).json(createErrorResponse(ErrorCodes.VALIDATION_ERROR, result.err));
		}
		res.status(201).json(createSuccessResponse(result.item));
	} catch (err) {
		next(err);
	}
});

export default router;
