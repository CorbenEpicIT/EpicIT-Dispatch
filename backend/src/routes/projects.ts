import { Router } from "express";
import {
    ErrorCodes,
    createSuccessResponse,
    createErrorResponse,
} from "../types/responses.js";
import { 
    getProjects,
    getProjectById,
    insertProject,
    updateProject,
    deleteProject,
    attachJob,
    detachJob,
} from "../controllers/projectsController.js";
import { denyTechnicians, requirePermission, } from "../lib/requirePermissions.js";
import { getUserContext } from "../lib/context.js";
import { getEntityHistory, parseHistoryLimit, INVALID_HISTORY_LIMIT } from '../controllers/logsController.js';

const router = Router();

// Maps a controller `err` string onto an HTTP status + error code.
const projectFailure = (err: string) => {
    if (/not found/i.test(err)) {
        return { status: 404, code: ErrorCodes.NOT_FOUND };
    }
    if (/already attached|not attached/i.test(err)) {
        return { status: 409, code: ErrorCodes.CONFLICT };
    }
    if (/^Validation failed/i.test(err)) {
        return { status: 400, code: ErrorCodes.VALIDATION_ERROR };
    }
    return { status: 500, code: ErrorCodes.SERVER_ERROR };
};

// rejects all technicians trying to hit this endpoint
router.use(denyTechnicians);

router.get("/", requirePermission("view_projects"), async (req, res, next) => {
    try {
        const orgId = req.user!.organization_id as string;
        const result = await getProjects(orgId);
        if (!result) {
            return res
                .status(404)
                .json(createErrorResponse(ErrorCodes.NOT_FOUND, "No projects found",));
        }

        res.json(createSuccessResponse(result));
    } catch (err) {
        next(err);
    }
});

router.get("/:id", requirePermission("view_projects"), async (req, res, next) => {
    try {
        const projectId = req.params.id as string;
        const orgId = req.user!.organization_id as string;
        const result = await getProjectById(orgId, projectId);
        if (!result) {
            return res
                .status(404)
                .json(createErrorResponse(ErrorCodes.NOT_FOUND, "No projects found",));
        }

        res.json(createSuccessResponse(result));
    } catch (err) {
        next(err);
    }
});

router.post("/", requirePermission("create_projects"), async (req, res, next) => {
    try {
        const result = await insertProject(req, getUserContext(req));
        if (result.err || !result.project) {
            const { status, code } = projectFailure(result.err || "Failed to create project");
            return res
                .status(status)
                .json(createErrorResponse(code, result.err || "Failed to create project"));
        }

        res.status(201).json(createSuccessResponse(result.project));
    } catch (err) {
        next(err);
    }
});

router.put("/:id", requirePermission("edit_projects"), async (req, res, next) => {
    try {
        const result = await updateProject(req, getUserContext(req));
        if (result.err || !result.project) {
            const { status, code } = projectFailure(result.err || "Failed to update project");
            return res
                .status(status)
                .json(createErrorResponse(code, result.err || "Failed to update project"));
        }

        res.json(createSuccessResponse(result.project));
    } catch (err) {
        next(err);
    }
});

router.delete("/:id", requirePermission("delete_projects"), async (req, res, next) => {
    try {
        const projectId = req.params.id as string;
        const orgId = req.user!.organization_id as string;
        const result = await deleteProject(orgId, projectId, getUserContext(req));
        if (result.err) {
            const { status, code } = projectFailure(result.err);
            return res.status(status).json(createErrorResponse(code, result.err));
        }

        res.json(createSuccessResponse({ id: projectId }));
    } catch (err) {
        next(err);
    }
});

router.post("/:id/jobs/:jobId", requirePermission("edit_projects"), async (req, res, next) => {
    try {
        const result = await attachJob(req, getUserContext(req));
        if (result.err || !result.project) {
            const { status, code } = projectFailure(result.err || "Failed to attach job to project");
            return res
                .status(status)
                .json(createErrorResponse(code, result.err || "Failed to attach job to project"));
        }

        res.json(createSuccessResponse(result.project));
    } catch (err) {
        next(err);
    }
});

router.delete("/:id/jobs/:jobId", requirePermission("edit_projects"), async (req, res, next) => {
    try {
        const result = await detachJob(req, getUserContext(req));
        if (result.err || !result.job) {
            const { status, code } = projectFailure(result.err || "Failed to detach job from project");
            return res
                .status(status)
                .json(createErrorResponse(code, result.err || "Failed to detach job from project"));
        }

        res.json(createSuccessResponse(result.job));
    } catch (err) {
        next(err);
    }
});

router.get("/:id/changes", requirePermission("view_projects"), async (req, res, next) => {
    try {
        const id = req.params.id as string;
        const orgId = req.user!.organization_id as string;
        let limit: number;
        try {
            limit = parseHistoryLimit(req.query.limit);
        } catch {
            return res
                .status(400)
                .json(createErrorResponse(ErrorCodes.VALIDATION_ERROR, INVALID_HISTORY_LIMIT));
        }

        const results = await getEntityHistory(orgId, "project", id, limit);

        if (results.err) {
            return res
                .status(500)
                .json(createErrorResponse(ErrorCodes.SERVER_ERROR, results.err));
        }

        res.json(createSuccessResponse(results.rows, {
            count: results.rows.length,
            hasMore: results.hasMore,
            total: results.total,
        }));
    } catch (err) {
        next(err);
    }
});

export default router;