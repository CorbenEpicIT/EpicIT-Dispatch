import { Router } from 'express';
import {
    ErrorCodes,
    createSuccessResponse,
    createErrorResponse,
} from "../types/responses.js";
import * as recurringPlansController from '../controllers/recurringPlansController.js';
import { getUserContext } from '../lib/context.js';
import { requirePermission } from '../lib/requirePermissions.js';

const router = Router();

router.post("/:occurrenceId/skip", requirePermission("manage_recurring_plans"), async (req, res, next) => {
    try {
        const occurrenceId = req.params.occurrenceId as string;
        const context = getUserContext(req);
        const orgId = req.user!.organization_id as string;
        const result = await recurringPlansController.skipOccurrence(
            occurrenceId,
            req.body,
            orgId,
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

router.put("/:occurrenceId/reschedule", requirePermission("manage_recurring_plans"), async (req, res, next) => {
    try {
        const occurrenceId = req.params.occurrenceId as string;
        const context = getUserContext(req);
        const orgId = req.user!.organization_id as string;
        const result = await recurringPlansController.rescheduleOccurrence(
            occurrenceId,
            req.body,
            orgId,
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

router.post("/bulk-skip", requirePermission("manage_recurring_plans"), async (req, res, next) => {
    try {
        const context = getUserContext(req);
        const orgId = req.user!.organization_id as string;
        const result = await recurringPlansController.bulkSkipOccurrences(
            req.body,
            orgId,
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
    requirePermission("manage_recurring_plans"),
    async (req, res, next) => {
        try {
            const occurrenceId = req.params.occurrenceId as string;
            const context = getUserContext(req);
            const orgId = req.user!.organization_id as string;
            const result =
                await recurringPlansController.generateVisitFromOccurrence(
                    occurrenceId,
                    orgId,
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