import { Router } from 'express';
import {
    ErrorCodes,
    createSuccessResponse,
    createErrorResponse,
} from "../types/responses.js";
import * as recurringPlansController from '../controllers/recurringPlansController.js';
import { getUserContext } from '../lib/context.js';

const router = Router();

router.post("/:occurrenceId/skip", async (req, res, next) => {
    try {
        const { occurrenceId } = req.params;
        const context = getUserContext(req);
        const result = await recurringPlansController.skipOccurrence(
            occurrenceId,
            req.body,
            context,
        );

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

router.put("/:occurrenceId/reschedule", async (req, res, next) => {
    try {
        const { occurrenceId } = req.params;
        const context = getUserContext(req);
        const result = await recurringPlansController.rescheduleOccurrence(
            occurrenceId,
            req.body,
            context,
        );

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

router.post("/bulk-skip", async (req, res, next) => {
    try {
        const context = getUserContext(req);
        const result = await recurringPlansController.bulkSkipOccurrences(
            req.body,
            context,
        );

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

        res.json(createSuccessResponse(result.item));
    } catch (err) {
        next(err);
    }
});

router.post(
    "/:occurrenceId/generate-visit",
    async (req, res, next) => {
        try {
            const { occurrenceId } = req.params;
            const context = getUserContext(req);
            const result =
                await recurringPlansController.generateVisitFromOccurrence(
                    occurrenceId,
                    context,
                );

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

            res.status(201).json(createSuccessResponse(result.item));
        } catch (err) {
            next(err);
        }
    },
);

export default router;