import { Router } from 'express';
import {
    ErrorCodes,
    createSuccessResponse,
    createErrorResponse,
} from "../types/responses.js";
import { getUserContext } from '../lib/context.js';
import {
    getAllJobs,
    getJobById,
    insertJob,
    updateJob,
    deleteJob,
} from "../controllers/jobsController.js";
import {
    getJobNotes,
    getJobNotesByVisitId,
    insertJobNote,
    updateJobNote,
    deleteJobNote,
} from "../controllers/jobNotesController.js";
import {
    getJobVisitsByJobId,
} from "../controllers/jobVisitsController.js";
import * as invoicesController from '../controllers/invoicesController.js';
import * as recurringPlansController from "../controllers/recurringPlansController.js";
import * as recurringPlanNotesController from "../controllers/recurringPlanNotesController.js";

const router = Router();

router.get("/", async (req, res, next) => {
    try {
        const orgId = req.user!.organization_id as string;
        const jobs = await getAllJobs(orgId);
        res.json(createSuccessResponse(jobs, { count: jobs.length }));
    } catch (err) {
        next(err);
    }
});

router.get("/:id", async (req, res, next) => {
    try {
        const { id } = req.params;
        const orgId = req.user!.organization_id as string;
        const job = await getJobById(id, orgId);

        if (!job) {
            return res
                .status(404)
                .json(
                    createErrorResponse(ErrorCodes.NOT_FOUND, "Job not found"),
                );
        }

        res.json(createSuccessResponse(job));
    } catch (err) {
        next(err);
    }
});

router.post("/", async (req, res, next) => {
    try {
        const context = getUserContext(req);
        const result = await insertJob(req, context);

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

router.patch("/:id", async (req, res, next) => {
    try {
        const orgId = req.user!.organization_id as string;
        const context = getUserContext(req);
        const result = await updateJob(req, orgId, context);

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

router.delete("/:id", async (req, res, next) => {
    try {
        const { id } = req.params;
        const orgId = req.user!.organization_id as string;
        const context = getUserContext(req);
        const result = await deleteJob(id, orgId, context);

        if (result.err) {
            return res
                .status(400)
                .json(createErrorResponse(ErrorCodes.DELETE_ERROR, result.err));
        }

        res.status(200).json(
            createSuccessResponse({ message: "Job deleted successfully", id }),
        );
    } catch (err) {
        next(err);
    }
});

router.get("/:jobId/visits", async (req, res, next) => {
    try {
        const { jobId } = req.params;
        const orgId = req.user!.organization_id as string;
        const visits = await getJobVisitsByJobId(jobId, orgId);
        res.json(createSuccessResponse(visits, { count: visits.length }));
    } catch (err) {
        next(err);
    }
});




// ─────────────────────────────────────────────────────────────────────────────

// ============================================
// JOB NOTES
// ============================================

router.get("/:jobId/notes", async (req, res, next) => {
    try {
        const { jobId } = req.params;
        const orgId = req.user!.organization_id as string;
        const notes = await getJobNotes(jobId, orgId);
        res.json(createSuccessResponse(notes, { count: notes.length }));
    } catch (err) {
        next(err);
    }
});

router.get("/:jobId/visits/:visitId/invoices", async (req, res, next) => {
    try {
        const orgId = req.user!.organization_id as string;
        const invoices = await invoicesController.getInvoicesByVisitId(
            req.params.visitId,
            orgId,
        );
        res.json(createSuccessResponse(invoices, { count: invoices.length }));
    } catch (err) {
        next(err);
    }
});

router.get("/:jobId/visits/:visitId/notes", async (req, res, next) => {
    try {
        const { jobId, visitId } = req.params;
        const orgId = req.user!.organization_id as string;
        const notes = await getJobNotesByVisitId(jobId, visitId, orgId);
        res.json(createSuccessResponse(notes, { count: notes.length }));
    } catch (err) {
        next(err);
    }
});

router.post("/:jobId/notes", async (req, res, next) => {
    try {
        const { jobId } = req.params;
        const orgId = req.user!.organization_id as string;
        const context = getUserContext(req);
        const result = await insertJobNote(jobId, req.body, orgId, context);

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

router.put("/:jobId/notes/:noteId", async (req, res, next) => {
    try {
        const { jobId, noteId } = req.params;
        const orgId = req.user!.organization_id as string;
        const context = getUserContext(req);
        const result = await updateJobNote(jobId, noteId, req.body, orgId, context);

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

router.delete("/:jobId/notes/:noteId", async (req, res, next) => {
    try {
        const { jobId, noteId } = req.params;
        const orgId = req.user!.organization_id as string;
        const context = getUserContext(req);
        const result = await deleteJobNote(jobId, noteId, orgId, context);

        if (result.err) {
            return res
                .status(400)
                .json(createErrorResponse(ErrorCodes.DELETE_ERROR, result.err));
        }

        res.status(200).json(
            createSuccessResponse({
                message: result.message || "Note deleted successfully",
            }),
        );
    } catch (err) {
        next(err);
    }
});

// invoices
router.get("/:jobId/invoices", async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id as string;
		const invoices = await invoicesController.getInvoicesByJobId(
			req.params.jobId,
			orgId,
		);
		res.json(createSuccessResponse(invoices, { count: invoices.length }));
	} catch (err) {
		next(err);
	}
});

// occurrences
router.get("/:jobId/occurrences", async (req, res, next) => {
    try {
        const { jobId } = req.params;
        const occurrences =
            await recurringPlansController.getOccurrencesByJobId(jobId, req.user!.organization_id as string,);
        res.json(
            createSuccessResponse(occurrences, { count: occurrences.length }),
        );
    } catch (err) {
        next(err);
    }
});

router.post("/:jobId/occurrences/generate", async (req, res, next) => {
    try {
        const { jobId } = req.params;
        const context = getUserContext(req);
        const result = await recurringPlansController.generateOccurrences(
            jobId,
            req.body,
            req.user!.organization_id as string,
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

// ============================================
// RECURRING PLAN NOTES ROUTES
// ============================================

router.get("/:jobId/recurring-plan/notes", async (req, res, next) => {
    try {
        const { jobId } = req.params;
        const orgId = req.user!.organization_id as string;

        const plan =
            await recurringPlansController.getRecurringPlanByJobId(jobId, orgId);

        if (!plan) {
            return res
                .status(404)
                .json(
                    createErrorResponse(
                        ErrorCodes.NOT_FOUND,
                        "Recurring plan not found",
                    ),
                );
        }

        const notes = await recurringPlanNotesController.getRecurringPlanNotes(
            plan.id,
            orgId,
        );
        res.json(createSuccessResponse(notes, { count: notes.length }));
    } catch (err) {
        next(err);
    }
});

router.post("/:jobId/recurring-plan/notes", async (req, res, next) => {
    try {
        const orgId = req.user!.organization_id as string;
        const context = getUserContext(req);
        const result =
            await recurringPlanNotesController.insertRecurringPlanNote(
                req,
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
});

router.put("/:jobId/recurring-plan/notes/:noteId", async (req, res, next) => {
    try {
        const orgId = req.user!.organization_id as string;
        const context = getUserContext(req);
        const result =
            await recurringPlanNotesController.updateRecurringPlanNote(
                req,
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

router.delete(
    "/:jobId/recurring-plan/notes/:noteId",
    async (req, res, next) => {
        try {
            const { jobId, noteId } = req.params;
            const orgId = req.user!.organization_id as string;
            const context = getUserContext(req);
            const result =
                await recurringPlanNotesController.deleteRecurringPlanNote(
                    jobId,
                    noteId,
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

            res.json(createSuccessResponse({ message: result.message }));
        } catch (err) {
            next(err);
        }
    },
);

// recurring plans
router.get("/:jobId/recurring-plan", async (req, res, next) => {
    try {
        const { jobId } = req.params;
        const orgId = req.user!.organization_id as string;
        const plan =
            await recurringPlansController.getRecurringPlanByJobId(jobId, orgId);

        if (!plan) {
            return res
                .status(404)
                .json(
                    createErrorResponse(
                        ErrorCodes.NOT_FOUND,
                        "Recurring plan not found",
                    ),
                );
        }

        res.json(createSuccessResponse(plan));
    } catch (err) {
        next(err);
    }
});

router.put("/:jobId/recurring-plan", async (req, res, next) => {
    try {
        const { jobId } = req.params;
        const orgId = req.user!.organization_id as string;
        const context = getUserContext(req);
        const result = await recurringPlansController.updateRecurringPlan(
            jobId,
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

router.put("/:jobId/recurring-plan/template", async (req, res, next) => {
    try {
        const { jobId } = req.params;
        const orgId = req.user!.organization_id as string;
        const context = getUserContext(req);
        const result =
            await recurringPlansController.updateRecurringPlanLineItems(
                jobId,
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

router.post("/:jobId/recurring-plan/pause", async (req, res, next) => {
    try {
        const { jobId } = req.params;
        const orgId = req.user!.organization_id as string;
        const context = getUserContext(req);
        const result = await recurringPlansController.pauseRecurringPlan(
            jobId,
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

router.post("/:jobId/recurring-plan/resume", async (req, res, next) => {
    try {
        const { jobId } = req.params;
        const orgId = req.user!.organization_id as string;
        const context = getUserContext(req);
        const result = await recurringPlansController.resumeRecurringPlan(
            jobId,
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

router.post("/:jobId/recurring-plan/cancel", async (req, res, next) => {
    try {
        const { jobId } = req.params;
        const orgId = req.user!.organization_id as string;
        const context = getUserContext(req);
        const result = await recurringPlansController.cancelRecurringPlan(
            jobId,
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

router.post("/:jobId/recurring-plan/complete", async (req, res, next) => {
    try {
        const { jobId } = req.params;
        const orgId = req.user!.organization_id as string;
        const context = getUserContext(req);
        const result = await recurringPlansController.completeRecurringPlan(
            jobId,
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

// ============================================
// RECURRING PLAN INVOICE SCHEDULE ROUTES
// ============================================

router.put(
    "/:jobId/recurring-plan/invoice-schedule",
    async (req, res, next) => {
        try {
            const { jobId } = req.params;
            const orgId = req.user!.organization_id as string;
            const result = await recurringPlansController.upsertInvoiceSchedule(
                jobId,
                req.body,
                orgId,
                getUserContext(req),
            );
            if (result.err) {
                res.status(400).json(
                    createErrorResponse("VALIDATION_ERROR", result.err),
                );
                return;
            }
            res.json(createSuccessResponse(result.item));
        } catch (err) {
            next(err);
        }
    },
);

router.delete(
    "/:jobId/recurring-plan/invoice-schedule",
    async (req, res, next) => {
        try {
            const { jobId } = req.params;
            const orgId = req.user!.organization_id as string;
            const result =
                await recurringPlansController.deleteInvoiceSchedule(jobId, orgId);
            if (result.err) {
                res.status(404).json(
                    createErrorResponse("NOT_FOUND", result.err),
                );
                return;
            }
            res.json(
                createSuccessResponse({ message: "Invoice schedule removed" }),
            );
        } catch (err) {
            next(err);
        }
    },
);

export default router;
