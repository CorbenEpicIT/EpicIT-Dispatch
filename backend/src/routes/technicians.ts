import { Router } from 'express';
import {
    getAllTechnicians,
    getTechnicianById,
    insertTechnician,
    updateTechnician,
    deleteTechnician
} from "../controllers/techniciansController.js";
import { requestPasswordReset } from '../controllers/authenticationController.js';
import {
	ErrorCodes,
	createSuccessResponse,
	createErrorResponse,
} from "../types/responses.js";
import { getUserContext } from '../lib/context.js';
import { getJobVisitsByTechId } from '../controllers/jobVisitsController.js';
import { getSocket } from "../services/socketService.js";
import { setTechnicianVehicle } from "../controllers/vehiclesController.js";

const router = Router();

router.get("/", async (req, res, next) => {
    try {
        const orgId = req.user!.organization_id as string;
        const technicians = await getAllTechnicians(orgId);
        res.json(
            createSuccessResponse(technicians, { count: technicians.length }),
        );
    } catch (err) {
        next(err);
    }
});

router.get("/:id", async (req, res, next) => {
    try {
        const { id } = req.params;
        const orgId = req.user!.organization_id as string;
        const technician = await getTechnicianById(id, orgId);

        if (!technician) {
            return res
                .status(404)
                .json(
                    createErrorResponse(
                        ErrorCodes.NOT_FOUND,
                        "Technician not found",
                    ),
                );
        }

        res.json(createSuccessResponse(technician));
    } catch (err) {
        next(err);
    }
});

router.post("/", async (req, res, next) => {
    try {
        const orgId = req.user!.organization_id as string;
        const context = getUserContext(req);
        const result = await insertTechnician(req.body, orgId, context);

        if (result.err) {
            const isDuplicate = result.err
                .toLowerCase()
                .includes("already exists");
            return res
                .status(isDuplicate ? 409 : 400)
                .json(
                    createErrorResponse(
                        isDuplicate
                            ? ErrorCodes.CONFLICT
                            : ErrorCodes.VALIDATION_ERROR,
                        result.err,
                    ),
                );
        }

        res.status(201).json(createSuccessResponse(result.item));
    } catch (err) {
        next(err);
    }
});

router.post("/:id/ping", async (req, res, next) => {
    try {
        const { id } = req.params;
        const orgId = req.user!.organization_id as string;
        const context = getUserContext(req);
        const result = await updateTechnician(id, req.body, orgId, context);

        if (result.err) {
            const isDuplicate = result.err
                .toLowerCase()
                .includes("already exists");
            return res
                .status(isDuplicate ? 409 : 400)
                .json(
                    createErrorResponse(
                        isDuplicate
                            ? ErrorCodes.CONFLICT
                            : ErrorCodes.VALIDATION_ERROR,
                        result.err,
                    ),
                );
        }

        const io = getSocket();
        io.emit("technician-update", result.item);
        res.json(createSuccessResponse(result.item));
    } catch (err) {
        next(err);
    }
});

router.put("/:id", async (req, res, next) => {
    try {
        const { id } = req.params;
        const orgId = req.user!.organization_id as string;
        const context = getUserContext(req);
        const result = await updateTechnician(id, req.body, orgId, context);

        if (result.err) {
            const isDuplicate = result.err
                .toLowerCase()
                .includes("already exists");
            return res
                .status(isDuplicate ? 409 : 400)
                .json(
                    createErrorResponse(
                        isDuplicate
                            ? ErrorCodes.CONFLICT
                            : ErrorCodes.VALIDATION_ERROR,
                        result.err,
                    ),
                );
        }

        res.json(createSuccessResponse(result.item));
    } catch (err) {
        next(err);
    }
});

router.post("/:id/reset-password", async (req, res, next) => {
    try {
        const { id } = req.params;
        const orgId = req.user!.organization_id as string;
        const user = await getTechnicianById(id, orgId);
        if (!user) {
            return res
                .status(404)
                .json(
                    createErrorResponse(
                        ErrorCodes.NOT_FOUND,
                        "Technician not found",
                    ),
                );
        }
        const result = await requestPasswordReset(user.email, "technician");

        if (result.err) {
            return res
                .status(400)
                .json(
                    createErrorResponse(
                        ErrorCodes.VALIDATION_ERROR,
                        result.err,
                    ),
                );
        }

        res.json(createSuccessResponse(null));
    } catch (err) {
        next(err);
    }
});

router.delete("/:id", async (req, res, next) => {
    try {
        const { id } = req.params;
        const orgId = req.user!.organization_id as string;
        const context = getUserContext(req);
        const result = await deleteTechnician(id, orgId, context);

        if (result.err) {
            return res
                .status(400)
                .json(createErrorResponse(ErrorCodes.DELETE_ERROR, result.err));
        }

        res.status(200).json(
            createSuccessResponse({
                message: result.message || "Technician deleted successfully",
                id,
            }),
        );
    } catch (err) {
        next(err);
    }
});

// Get job visits for a technician
router.get("/:techId/visits", async (req, res, next) => {
    try {
        const { techId } = req.params;
        const orgId = req.user!.organization_id as string;
        const visits = await getJobVisitsByTechId(techId, orgId);
        res.json(createSuccessResponse(visits, { count: visits.length }));
    } catch (err) {
        next(err);
    }
});

router.put("/:id/vehicle", async (req, res, next) => {
	try {
		const { id } = req.params;
		const orgId = req.user!.organization_id as string;
		const { vehicle_id } = req.body as { vehicle_id: string | null };
		const result = await setTechnicianVehicle(id, vehicle_id ?? null, orgId);
		if (result.err) {
			const statusCode = result.err.includes("not found") ? 404 : 400;
			return res.status(statusCode).json(createErrorResponse(ErrorCodes.VALIDATION_ERROR, result.err));
		}
		res.json(createSuccessResponse(result.item));
	} catch (err) {
		next(err);
	}
});

export default router;
