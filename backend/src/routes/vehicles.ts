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
	createRestockRequestsBulk,
	listRestockRequests,
	listVehicleRestockRequests,
	fulfillRestockRequest,
	fulfillRestockRequestsBulk,
	confirmRestockReceipts,
	markRestockReceived,
	dismissRestockRequest,
	getFillPlan,
	applyFill,
	getUsageToday,
	getStockConflicts,
	completeEod,
	getEodToday,
	getEodHistory,
	adjustStock,
	getStockAdjustmentHistory,
	getVehicleReadiness,
	getFleetReadiness,
	confirmReadiness,
	revokeReadiness,
	getVehicleMovements,
} from "../controllers/vehiclesController.js";
import {
	requirePermission,
	requireAnyPermission,
	requireVehiclePermission,
} from "../lib/requirePermissions.js";

const router = Router();

router.get("/", requireAnyPermission("view_vehicles", "manage_vehicles", "use_vehicles"), async (req, res, next) => {
	try {
		const orgId = req.user?.organization_id as string ?? undefined;
		const { status } = req.query as { status?: string };
		const vehicles = await listVehicles(orgId, status);
		res.json(createSuccessResponse(vehicles, { count: vehicles.length }));
	} catch (err) {
		next(err);
	}
});

router.post("/", requirePermission("manage_vehicles"), async (req, res, next) => {
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

router.get(
	"/stock-conflicts",
	requireAnyPermission("view_inventory", "manage_technicians"),
	async (req, res, next) => {
		try {
			const orgId = req.user?.organization_id as string ?? undefined;
			const data = await getStockConflicts(orgId);
			res.json(createSuccessResponse(data, { count: data.length }));
		} catch (err) {
			next(err);
		}
	},
);

router.get(
	"/readiness",
	requireAnyPermission("view_inventory", "manage_technicians"),
	async (req, res, next) => {
		try {
			const orgId = req.user?.organization_id as string;
			const dateStr =
				typeof req.query.date === "string"
					? req.query.date
					: new Date().toISOString().slice(0, 10);
			const result = await getFleetReadiness(orgId, dateStr);
			if (result.err) {
				return res.status(500).json(createErrorResponse(ErrorCodes.SERVER_ERROR, result.err));
			}
			res.json(createSuccessResponse(result.items, { count: result.items!.length }));
		} catch (err) {
			next(err);
		}
	},
);

router.get(
	"/restock-requests",
	requireAnyPermission("manage_inventory", "manage_technicians"),
	async (req, res, next) => {
		try {
			const orgId = req.user?.organization_id as string;
			const { status, vehicleId } = req.query as { status?: string; vehicleId?: string };
			const result = await listRestockRequests(orgId, status, vehicleId);
			if (result.err) {
				return res.status(500).json(createErrorResponse(ErrorCodes.SERVER_ERROR, result.err));
			}
			res.json(createSuccessResponse(result.requests, { count: result.requests!.length }));
		} catch (err) {
			next(err);
		}
	},
);

router.post(
	"/restock-requests/:requestId/fulfill",
	requireAnyPermission("manage_inventory", "manage_technicians"),
	async (req, res, next) => {
		try {
			const requestId = req.params.requestId as string;
			const orgId = req.user?.organization_id as string;
			const context = getUserContext(req);
			const result = await fulfillRestockRequest(requestId, req.body ?? {}, orgId, context);
			if (result.err) {
				if (result.err === "insufficient_warehouse_stock") {
					return res.status(409).json(
						createErrorResponse(ErrorCodes.VALIDATION_ERROR, result.err, {
							available: result.available,
						}),
					);
				}
				if (result.err.includes("not found")) {
					return res.status(404).json(createErrorResponse(ErrorCodes.NOT_FOUND, result.err));
				}
				if (result.err.includes("already")) {
					return res.status(409).json(createErrorResponse(ErrorCodes.CONFLICT, result.err));
				}
				return res.status(400).json(createErrorResponse(ErrorCodes.VALIDATION_ERROR, result.err));
			}
			res.json(createSuccessResponse(result.request));
		} catch (err) {
			next(err);
		}
	},
);

router.post(
	"/restock-requests/fulfill-bulk",
	requireAnyPermission("manage_inventory", "manage_technicians"),
	async (req, res, next) => {
		try {
			const orgId = req.user?.organization_id as string;
			const context = getUserContext(req);
			const result = await fulfillRestockRequestsBulk(req.body ?? {}, orgId, context);
			if (result.err) {
				return res.status(400).json(createErrorResponse(ErrorCodes.VALIDATION_ERROR, result.err));
			}
			res.json(createSuccessResponse({ fulfilled: result.fulfilled, failed: result.failed }));
		} catch (err) {
			next(err);
		}
	},
);


router.post("/:id/restock-requests/confirm-receipt", requireAnyPermission("use_inventory", "manage_inventory"), async (req, res, next) => {
	try {
		const vehicleId = req.params.id as string;
		const orgId = req.user?.organization_id as string;
		const context = getUserContext(req);
		const result = await confirmRestockReceipts(vehicleId, req.body ?? {}, orgId, context);
		if (result.err) {
			if (result.err.includes("Only technicians") || result.err.includes("not assigned")) {
				return res.status(403).json(createErrorResponse(ErrorCodes.INVALID_CREDENTIALS, result.err));
			}
			return res.status(400).json(createErrorResponse(ErrorCodes.VALIDATION_ERROR, result.err));
		}
		res.json(createSuccessResponse({ confirmed: result.confirmed, failed: result.failed }));
	} catch (err) {
		next(err);
	}
});

router.post(
	"/restock-requests/:requestId/mark-received",
	requireAnyPermission("manage_inventory", "manage_technicians"),
	async (req, res, next) => {
		try {
			const requestId = req.params.requestId as string;
			const orgId = req.user?.organization_id as string;
			const context = getUserContext(req);
			const result = await markRestockReceived(requestId, orgId, context);
			if (result.err) {
				if (result.err.includes("not found")) {
					return res.status(404).json(createErrorResponse(ErrorCodes.NOT_FOUND, result.err));
				}
				return res.status(409).json(createErrorResponse(ErrorCodes.CONFLICT, result.err));
			}
			res.json(createSuccessResponse(result.request));
		} catch (err) {
			next(err);
		}
	},
);
router.post(
	"/restock-requests/:requestId/dismiss",
	requireAnyPermission("manage_inventory", "manage_technicians"),
	async (req, res, next) => {
		try {
			const requestId = req.params.requestId as string;
			const orgId = req.user?.organization_id as string;
			const context = getUserContext(req);
			const result = await dismissRestockRequest(requestId, orgId, context);
			if (result.err) {
				if (result.err.includes("not found")) {
					return res.status(404).json(createErrorResponse(ErrorCodes.NOT_FOUND, result.err));
				}
				if (result.err.includes("already")) {
					return res.status(409).json(createErrorResponse(ErrorCodes.CONFLICT, result.err));
				}
				return res.status(400).json(createErrorResponse(ErrorCodes.VALIDATION_ERROR, result.err));
			}
			res.json(createSuccessResponse(result.request));
		} catch (err) {
			next(err);
		}
	},
);

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

router.get("/:id/stock", requireAnyPermission("view_vehicles", "manage_vehicles", "use_vehicles"), async (req, res, next) => {
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

router.post("/:id/stock", requireVehiclePermission("stock_own_vehicle"), async (req, res, next) => {
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

router.get(
	"/:id/stock/fill-plan",
	requireVehiclePermission("stock_own_vehicle"),
	async (req, res, next) => {
		try {
			const id = req.params.id as string;
			const orgId = req.user?.organization_id as string;
			const result = await getFillPlan(id, orgId);
			if (result.err) {
				return res.status(404).json(createErrorResponse(ErrorCodes.NOT_FOUND, result.err));
			}
			res.json(createSuccessResponse(result.plan));
		} catch (err) {
			next(err);
		}
	},
);

router.post(
	"/:id/stock/fill",
	requireVehiclePermission("stock_own_vehicle"),
	async (req, res, next) => {
		try {
			const id = req.params.id as string;
			const orgId = req.user?.organization_id as string;
			const context = getUserContext(req);
			const result = await applyFill(id, req.body, orgId, context);
			if (result.err) {
				const status = result.err.includes("not found") ? 404 : 400;
				return res.status(status).json(createErrorResponse(ErrorCodes.VALIDATION_ERROR, result.err));
			}
			res.json(createSuccessResponse(result.lines));
		} catch (err) {
			next(err);
		}
	},
);

router.get(
	"/:id/usage-today",
	requireAnyPermission("view_inventory", "manage_technicians", "use_inventory"),
	async (req, res, next) => {
		try {
			const id = req.params.id as string;
			const orgId = req.user?.organization_id as string ?? undefined;
			const result = await getUsageToday(id, orgId);
			if (result.err) {
				return res.status(404).json(createErrorResponse(ErrorCodes.NOT_FOUND, result.err));
			}
			res.json(createSuccessResponse(result.data, { count: result.data!.length }));
		} catch (err) {
			next(err);
		}
	},
);

router.post(
	"/:id/eod",
	requireVehiclePermission("complete_own_eod"),
	async (req, res, next) => {
		try {
			const id = req.params.id as string;
			const orgId = req.user?.organization_id as string;
			const context = getUserContext(req);
			const result = await completeEod(id, req.body, orgId, context);
			if (result.err) {
				const status = result.err.includes("not found")
					? 404
					: result.err.includes("already completed")
					? 409
					: 400;
				return res.status(status).json(createErrorResponse(ErrorCodes.VALIDATION_ERROR, result.err));
			}
			return res.status(201).json(createSuccessResponse(result.record));
		} catch (err) {
			next(err);
		}
	},
);

router.get(
	"/:id/eod/today",
	requireAnyPermission("view_inventory", "manage_inventory", "manage_technicians", "use_inventory"),
	async (req, res, next) => {
		try {
			const id = req.params.id as string;
			const orgId = req.user?.organization_id as string;
			const result = await getEodToday(id, orgId);
			if (result.err) {
				return res.status(404).json(createErrorResponse(ErrorCodes.NOT_FOUND, result.err));
			}
			return res.json(createSuccessResponse(result.record));
		} catch (err) {
			next(err);
		}
	},
);

router.post(
	"/:id/stock/adjust",
	requireVehiclePermission("stock_own_vehicle"),
	async (req, res, next) => {
		try {
			const id = req.params.id as string;
			const orgId = req.user?.organization_id as string;
			const context = getUserContext(req);
			const result = await adjustStock(id, req.body, orgId, context);
			if (result.err) {
				if (result.err === "insufficient_warehouse_stock") {
					return res.status(409).json(
						createErrorResponse(ErrorCodes.VALIDATION_ERROR, result.err, {
							available: result.available,
						}),
					);
				}
				const status = result.err.includes("not found") ? 404 : 400;
				return res.status(status).json(createErrorResponse(ErrorCodes.VALIDATION_ERROR, result.err));
			}
			return res.status(201).json(createSuccessResponse(result.adjustment));
		} catch (err) {
			next(err);
		}
	},
);

router.get(
	"/:id/eod/history",
	requireAnyPermission("view_inventory", "manage_inventory", "manage_technicians", "use_inventory"),
	async (req, res, next) => {
		try {
			const id = req.params.id as string;
			const orgId = req.user?.organization_id as string;
			const result = await getEodHistory(id, orgId);
			if (result.err) {
				return res.status(404).json(createErrorResponse(ErrorCodes.NOT_FOUND, result.err));
			}
			return res.json(createSuccessResponse(result.records, { count: result.records!.length }));
		} catch (err) {
			next(err);
		}
	},
);

router.get(
	"/:id/stock/adjustments",
	requireAnyPermission("view_inventory", "manage_inventory", "manage_technicians", "use_inventory"),
	async (req, res, next) => {
		try {
			const id = req.params.id as string;
			const orgId = req.user?.organization_id as string;
			const result = await getStockAdjustmentHistory(id, orgId);
			if (result.err) {
				return res.status(404).json(createErrorResponse(ErrorCodes.NOT_FOUND, result.err));
			}
			return res.json(createSuccessResponse(result.adjustments, { count: result.adjustments!.length }));
		} catch (err) {
			next(err);
		}
	},
);

router.get(
	"/:id/readiness",
	requireAnyPermission("view_inventory", "manage_technicians"),
	async (req, res, next) => {
		try {
			const { id } = req.params;
			const dateStr =
				typeof req.query.date === "string"
					? req.query.date
					: new Date().toISOString().slice(0, 10);
			const orgId = req.user?.organization_id as string ?? undefined;
			const result = await getVehicleReadiness(id, orgId, dateStr);
			if (result.err) return res.status(404).json(createErrorResponse(ErrorCodes.NOT_FOUND, result.err));
			res.json(createSuccessResponse(result.item));
		} catch (err) {
			next(err);
		}
	}
);

router.post(
	"/:id/readiness",
	requireAnyPermission("manage_inventory", "manage_technicians"),
	async (req, res, next) => {
		try {
			const { id } = req.params;
			const orgId = req.user?.organization_id as string ?? undefined;
			const dispatcherId = req.user?.uid ?? "";
			const result = await confirmReadiness(id, orgId, dispatcherId, req.body);
			if (result.err) {
				const status = result.err.includes("already confirmed") ? 409 : 400;
				const code = result.err.includes("already confirmed")
					? ErrorCodes.CONFLICT
					: ErrorCodes.VALIDATION_ERROR;
				return res.status(status).json(createErrorResponse(code, result.err));
			}
			res.json(createSuccessResponse(result.item));
		} catch (err) {
			next(err);
		}
	}
);

router.delete(
	"/:id/readiness/:date",
	requireAnyPermission("manage_inventory", "manage_technicians"),
	async (req, res, next) => {
		try {
			const { id, date } = req.params;
			const orgId = req.user?.organization_id as string ?? undefined;
			const result = await revokeReadiness(id, orgId, date);
			if (result.err) return res.status(404).json(createErrorResponse(ErrorCodes.NOT_FOUND, result.err));
			res.json(createSuccessResponse(result.item));
		} catch (err) {
			next(err);
		}
	}
);

router.put("/:id/stock/:itemId", requireVehiclePermission("stock_own_vehicle"), async (req, res, next) => {
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

router.delete("/:id/stock/:itemId", requireVehiclePermission("stock_own_vehicle"), async (req, res, next) => {
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
		const orgId = req.user?.organization_id as string ?? undefined;
		const context = getUserContext(req);
		const result = await createRestockRequest(id, itemId, req.body, orgId, context);
		if (result.err) {
			if (result.err.includes("Only technicians") || result.err.includes("not assigned")) {
				return res.status(403).json(createErrorResponse(ErrorCodes.INVALID_CREDENTIALS, result.err));
			}
			if (result.err.includes("already requested")) {
				return res.status(409).json(createErrorResponse(ErrorCodes.CONFLICT, result.err));
			}
			const statusCode = result.err.includes("not found") ? 404 : 400;
			return res.status(statusCode).json(createErrorResponse(ErrorCodes.VALIDATION_ERROR, result.err));
		}
		res.status(201).json(createSuccessResponse(result.item));
	} catch (err) {
		next(err);
	}
});

router.post("/:id/restock-requests/bulk", requireAnyPermission("use_inventory", "manage_inventory"), async (req, res, next) => {
	try {
		const vehicleId = req.params.id as string;
		const orgId = req.user?.organization_id as string;
		const context = getUserContext(req);
		const result = await createRestockRequestsBulk(vehicleId, req.body, orgId, context);
		if (result.err) {
			if (result.err.includes("Only technicians") || result.err.includes("not assigned")) {
				return res.status(403).json(createErrorResponse(ErrorCodes.INVALID_CREDENTIALS, result.err));
			}
			return res.status(400).json(createErrorResponse(ErrorCodes.VALIDATION_ERROR, result.err));
		}
		res.status(201).json(createSuccessResponse({ created: result.created, skipped: result.skipped }));
	} catch (err) {
		next(err);
	}
});

router.get("/:id/restock-requests", requireAnyPermission("use_inventory", "manage_inventory"), async (req, res, next) => {
	try {
		const vehicleId = req.params.id as string;
		const orgId = req.user?.organization_id as string;
		const context = getUserContext(req);
		const result = await listVehicleRestockRequests(vehicleId, orgId, context);
		if (result.err) {
			if (result.err.includes("not assigned")) {
				return res.status(403).json(createErrorResponse(ErrorCodes.INVALID_CREDENTIALS, result.err));
			}
			return res.status(500).json(createErrorResponse(ErrorCodes.SERVER_ERROR, result.err));
		}
		res.json(createSuccessResponse(result.requests, { count: result.requests!.length }));
	} catch (err) {
		next(err);
	}
});

router.get("/:id/movements", requireAnyPermission("view_inventory", "manage_technicians"), async (req, res, next) => {
	try {
		const orgId = req.user?.organization_id as string ?? undefined;
		const { cursor, limit } = req.query as { cursor?: string; limit?: string };
		const result = await getVehicleMovements(
			req.params.id,
			orgId,
			cursor,
			limit ? parseInt(limit, 10) : 25,
		);
		if (result.err) {
			return res.status(404).json(createErrorResponse(ErrorCodes.NOT_FOUND, result.err));
		}
		res.json(createSuccessResponse({ movements: result.movements, nextCursor: result.nextCursor }));
	} catch (err) {
		next(err);
	}
});

export default router;
