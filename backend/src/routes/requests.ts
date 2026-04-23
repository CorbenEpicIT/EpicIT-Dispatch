import { Router } from 'express';
import {
    ErrorCodes,
    createSuccessResponse,
    createErrorResponse,
} from "../types/responses.js";
import {
    getAllRequests,
    getRequestById,
    insertRequest,
    updateRequest,
    deleteRequest
} from "../controllers/requestsController.js";
import { getUserContext } from '../lib/context.js';
import * as requestNotesController from '../controllers/requestNotesController.js';


const router = Router();

router.get("/", async (req, res, next) => {
    // requireRole("dispatcher"),           temp removal until further implementation
    try {
        const orgId = req.user!.organization_id as string;
        const requests = await getAllRequests(orgId);
        res.json(createSuccessResponse(requests, { count: requests.length }));
    } catch (err) {
        next(err);
    }
});

router.get("/:id", async (req, res, next) => {
    try {
        const { id } = req.params;
        const orgId = req.user!.organization_id as string;
        const request = await getRequestById(id, orgId);

        if (!request) {
            return res
                .status(404)
                .json(
                    createErrorResponse(
                        ErrorCodes.NOT_FOUND,
                        "Request not found",
                    ),
                );
        }

        res.json(createSuccessResponse(request));
    } catch (err) {
        next(err);
    }
});



router.post("/", async (req, res, next) => {
    try {
        const orgId = req.user!.organization_id as string;
        const context = getUserContext(req);
        const result = await insertRequest(req, orgId, context);

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
        const orgId = req.user!.organization_id as string;
        const context = getUserContext(req);
        const result = await updateRequest(req, orgId, context);

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
        const orgId = req.user!.organization_id as string;
        const context = getUserContext(req);
        const result = await deleteRequest(id, orgId, context);

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

// ============================================
// REQUEST NOTE ROUTES
// ============================================

router.get("/:requestId/notes", async (req, res, next) => {
    try {
        const { requestId } = req.params;
        const orgId = req.user!.organization_id as string;
        const notes = await requestNotesController.getRequestNotes(requestId, orgId);
        res.json(createSuccessResponse(notes, { count: notes.length }));
    } catch (err) {
        next(err);
    }
});

router.get("/:requestId/notes/:noteId", async (req, res, next) => {
    try {
        const { requestId, noteId } = req.params;
        const orgId = req.user!.organization_id as string;
        const note = await requestNotesController.getNoteById(
            requestId,
            noteId,
            orgId,
        );

        if (!note) {
            return res
                .status(404)
                .json(
                    createErrorResponse(ErrorCodes.NOT_FOUND, "Note not found"),
                );
        }

        res.json(createSuccessResponse(note));
    } catch (err) {
        next(err);
    }
});

router.post("/:requestId/notes", async (req, res, next) => {
    try {
        const { requestId } = req.params;
        const orgId = req.user!.organization_id as string;
        const context = getUserContext(req);
        const result = await requestNotesController.insertRequestNote(
            requestId,
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

        res.status(201).json(createSuccessResponse(result.item));
    } catch (err) {
        next(err);
    }
});

router.put("/:requestId/notes/:noteId", async (req, res, next) => {
    try {
        const { requestId, noteId } = req.params;
        const orgId = req.user!.organization_id as string;
        const context = getUserContext(req);
        const result = await requestNotesController.updateRequestNote(
            requestId,
            noteId,
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

router.delete("/:requestId/notes/:noteId", async (req, res, next) => {
    try {
        const { requestId, noteId } = req.params;
        const orgId = req.user!.organization_id as string;
        const context = getUserContext(req);
        const result = await requestNotesController.deleteRequestNote(
            requestId,
            noteId,
            orgId,
            context,
        );

        if (result.err) {
            const statusCode = result.err.includes("not found") ? 404 : 400;
            return res
                .status(statusCode)
                .json(createErrorResponse(ErrorCodes.DELETE_ERROR, result.err));
        }

        res.status(200).json(
            createSuccessResponse({ message: result.message }),
        );
    } catch (err) {
        next(err);
    }
});

export default router;
