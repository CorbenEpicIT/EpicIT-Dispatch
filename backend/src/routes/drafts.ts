import { Router } from 'express';
import {
    ErrorCodes,
    createSuccessResponse,
    createErrorResponse,
} from "../types/responses.js";
import * as draftsController from "../controllers/draftsController.js";
const router = Router();

router.get("/", async (req, res, next) => {
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

router.get("/:id", async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await draftsController.getDraftById(id);

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

router.post("/", async (req, res, next) => {
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

router.put("/:id", async (req, res, next) => {
    try {
        const { id } = req.params;
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

router.delete("/:id", async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await draftsController.deleteDraft(id);

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