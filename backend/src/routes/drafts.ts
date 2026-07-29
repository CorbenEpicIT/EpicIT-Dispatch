import { Router } from 'express';
import {
    ErrorCodes,
    createSuccessResponse,
    createErrorResponse,
} from "../types/responses.js";
import * as draftsController from "../controllers/draftsController.js";
import { requireAnyPermission } from '../lib/requirePermissions.js';

const router = Router();

router.get("/", requireAnyPermission("create_jobs", "create_quotes", "create_requests"), async (req, res, next) => {
    try {
        const result = await draftsController.getAllDrafts(req);

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

        res.json(
            createSuccessResponse(result.items, {
                count: result.items!.length,
            }),
        );
    } catch (err) {
        next(err);
    }
});

router.get("/:id", requireAnyPermission("create_jobs", "create_quotes", "create_requests"), async (req, res, next) => {
    try {
        const id = req.params.id as string;
        const orgId = req.user!.organization_id as string;
        const result = await draftsController.getDraftById(id, orgId);

        if (result.err) {
            const statusCode = result.err.includes("not found") ? 404 : 400;
            return res
                .status(statusCode)
                .json(createErrorResponse(ErrorCodes.NOT_FOUND, result.err));
        }

        res.json(createSuccessResponse(result.item));
    } catch (err) {
        next(err);
    }
});

router.post("/", requireAnyPermission("create_jobs", "create_quotes", "create_requests"), async (req, res, next) => {
    try {
        const result = await draftsController.insertDraft(req);

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

        res.status(201).json(createSuccessResponse(result.item));
    } catch (err) {
        next(err);
    }
});

router.put("/:id", requireAnyPermission("create_jobs", "create_quotes", "create_requests"), async (req, res, next) => {
    try {
        const id = req.params.id as string;
        const result = await draftsController.updateDraft(id, req);

        if (result.err) {
            const statusCode = result.err.includes("not found") ? 404 : 400;
            return res
                .status(statusCode)
                .json(
                    createErrorResponse(
                        ErrorCodes.VALIDATION_ERROR,
                        result.err,
                    ),
                );
        }

        res.json(createSuccessResponse(result.item));
    } catch (err) {
        next(err);
    }
});

router.delete("/:id", requireAnyPermission("create_jobs", "create_quotes", "create_requests"), async (req, res, next) => {
    try {
        const id = req.params.id as string;
        const orgId = req.user!.organization_id as string;
        const result = await draftsController.deleteDraft(id, orgId);

        if (result.err) {
            const statusCode = result.err.includes("not found") ? 404 : 400;
            return res
                .status(statusCode)
                .json(createErrorResponse(ErrorCodes.DELETE_ERROR, result.err));
        }

        res.status(200).json(createSuccessResponse(result.item));
    } catch (err) {
        next(err);
    }
});

export default router;