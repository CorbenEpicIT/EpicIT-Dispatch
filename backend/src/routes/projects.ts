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

const router = Router();

const jobLinkFailure = (err: string) => {
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
        if (!result) {
            return res
                .status(404)
                .json(createErrorResponse(ErrorCodes.SERVER_ERROR, "Error creating project",));
        }

        res.json(createSuccessResponse(result));
    } catch (err) {
        next(err);
    }
});

router.put("/:id", requirePermission("edit_projects"), async (req, res, next) => {
    try {
        const result = await updateProject(req, getUserContext(req));
        if (!result) {
            return res
                .status(404)
                .json(createErrorResponse(ErrorCodes.SERVER_ERROR, "Error updating project",));
        }

        res.json(createSuccessResponse(result));
    } catch (err) {
        next(err);
    }
});

router.delete("/:id", requirePermission("delete_projects"), async (req, res, next) => {
    try {
        const projectId = req.params.id as string;
        const orgId = req.user!.organization_id as string;
        const result = await deleteProject(orgId, projectId, getUserContext(req));
        if (!result) {
            return res
                .status(404)
                .json(createErrorResponse(ErrorCodes.SERVER_ERROR, "Error deleting project",));
        }

        res.json(createSuccessResponse(result));
    } catch (err) {
        next(err);
    }
});

router.post("/:id/jobs/:jobId", requirePermission("edit_projects"), async (req, res, next) => {
    try {
        const result = await attachJob(req, getUserContext(req));
        if (result.err) {
            const { status, code } = jobLinkFailure(result.err);
            return res.status(status).json(createErrorResponse(code, result.err));
        }

        res.json(createSuccessResponse(result));
    } catch (err) {
        next(err);
    }
});

router.delete("/:id/jobs/:jobId", requirePermission("edit_projects"), async (req, res, next) => {
    try {
        const result = await detachJob(req, getUserContext(req));
        if (result.err) {
            const { status, code } = jobLinkFailure(result.err);
            return res.status(status).json(createErrorResponse(code, result.err));
        }

        res.json(createSuccessResponse(result));
    } catch (err) {
        next(err);
    }
});


export default router;