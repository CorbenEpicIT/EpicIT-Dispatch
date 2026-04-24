import { Router } from 'express';
import {
    ErrorCodes,
    createSuccessResponse,
    createErrorResponse,
} from "../types/responses.js";
import {
    getAllQuotes,
    getQuoteById,
    insertQuote,
    updateQuote,
    deleteQuote,
    getQuoteItems,
    getQuoteItemById,
    insertQuoteItem,
    updateQuoteItem,
    deleteQuoteItem,
} from "../controllers/quotesController.js";
import { generateQuotePdf } from "../lib/pdf/pdfService.js";
import { sendQuoteEmail } from "../services/emailService.js";
import { getUserContext } from '../lib/context.js';
import * as quoteNotesController from '../controllers/quoteNotesController.js';

const router = Router();

router.get("/", async (req, res, next) => {
    try {
        const orgId = req.user!.organization_id as string;
        const quotes = await getAllQuotes(orgId);
        res.json(createSuccessResponse(quotes, { count: quotes.length }));
    } catch (err) {
        next(err);
    }
});

router.get("/:id", async (req, res, next) => {
    try {
        const { id } = req.params;
        const orgId = req.user!.organization_id as string;
        const quote = await getQuoteById(id, orgId);

        if (!quote) {
            return res
                .status(404)
                .json(
                    createErrorResponse(
                        ErrorCodes.NOT_FOUND,
                        "Quote not found",
                    ),
                );
        }

        res.json(createSuccessResponse(quote));
    } catch (err) {
        next(err);
    }
});

router.get("/:id/pdf", async (req, res, next) => {
    try {
        const orgId = req.user!.organization_id as string;
        const buffer = await generateQuotePdf(req.params.id, orgId);
        res.setHeader("Content-Type", "routerlication/pdf");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="quote-${req.params.id}.pdf"`,
        );
        res.send(buffer);
    } catch (err: any) {
        if (err?.status === 404)
            return res
                .status(404)
                .json(createErrorResponse(ErrorCodes.NOT_FOUND, "Quote not found"));
        next(err);
    }
});



router.post("/:id/send", async (req, res, next) => {
    try {
        const { id } = req.params;
        const recipientEmail: string | undefined = req.body?.recipient_email;
        if (!recipientEmail) {
            return res
                .status(400)
                .json(createErrorResponse(ErrorCodes.VALIDATION_ERROR, "recipient_email is required"));
        }

        const orgId = req.user!.organization_id as string;
        await sendQuoteEmail(id, recipientEmail, orgId);
        const context = getUserContext(req);
        const result = await updateQuote(
            { params: { id }, body: { status: "Sent" } } as any,
            orgId,
            context,
        );
        if (result.err) {
            const status = result.err.includes("not found") ? 404 : 400;
            return res
                .status(status)
                .json(createErrorResponse(ErrorCodes.VALIDATION_ERROR, result.err));
        }
        res.json(createSuccessResponse(result.item));
    } catch (err: any) {
        if (err?.status === 404)
            return res
                .status(404)
                .json(createErrorResponse(ErrorCodes.NOT_FOUND, err.message));
        next(err);
    }
});

router.post("/", async (req, res, next) => {
    try {
        const orgId = req.user!.organization_id as string;
        const context = getUserContext(req);
        const result = await insertQuote(req, orgId, context);

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
        const result = await updateQuote(req, orgId, context);

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
        const result = await deleteQuote(id, orgId, context);

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
// QUOTE LINE ITEM ROUTES
// ============================================

router.get("/:quoteId/line-items", async (req, res, next) => {
    try {
        const { quoteId } = req.params;
        const orgId = req.user!.organization_id as string;
        const items = await getQuoteItems(quoteId, orgId);
        res.json(createSuccessResponse(items, { count: items.length }));
    } catch (err) {
        next(err);
    }
});

router.get("/:quoteId/line-items/:itemId", async (req, res, next) => {
    try {
        const { quoteId, itemId } = req.params;
        const orgId = req.user!.organization_id as string;
        const item = await getQuoteItemById(quoteId, itemId, orgId);

        if (!item) {
            return res
                .status(404)
                .json(
                    createErrorResponse(
                        ErrorCodes.NOT_FOUND,
                        "Line item not found",
                    ),
                );
        }

        res.json(createSuccessResponse(item));
    } catch (err) {
        next(err);
    }
});

router.post("/:quoteId/line-items", async (req, res, next) => {
    try {
        const { quoteId } = req.params;
        const orgId = req.user!.organization_id as string;
        const context = getUserContext(req);
        const result = await insertQuoteItem(quoteId, req.body, orgId, context);

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

router.put("/:quoteId/line-items/:itemId", async (req, res, next) => {
    try {
        const { quoteId, itemId } = req.params;
        const orgId = req.user!.organization_id as string;
        const context = getUserContext(req);
        const result = await updateQuoteItem(
            quoteId,
            itemId,
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

router.delete("/:quoteId/line-items/:itemId", async (req, res, next) => {
    try {
        const { quoteId, itemId } = req.params;
        const context = getUserContext(req);
        const orgId = req.user!.organization_id as string;
        const result = await deleteQuoteItem(quoteId, itemId, orgId, context);

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

// ============================================
// QUOTE NOTE ROUTES
// ============================================

router.get("/:quoteId/notes", async (req, res, next) => {
    try {
        const { quoteId } = req.params;
        const orgId = req.user!.organization_id as string;
        const notes = await quoteNotesController.getQuoteNotes(quoteId, orgId);
        res.json(createSuccessResponse(notes, { count: notes.length }));
    } catch (err) {
        next(err);
    }
});

router.get("/:quoteId/notes/:noteId", async (req, res, next) => {
    try {
        const { quoteId, noteId } = req.params;
        const orgId = req.user!.organization_id as string;
        const note = await quoteNotesController.getNoteById(quoteId, noteId, orgId);

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

router.post("/:quoteId/notes", async (req, res, next) => {
    try {
        const { quoteId } = req.params;
        const orgId = req.user!.organization_id as string;
        const context = getUserContext(req);
        const result = await quoteNotesController.insertQuoteNote(
            quoteId,
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

router.put("/:quoteId/notes/:noteId", async (req, res, next) => {
    try {
        const { quoteId, noteId } = req.params;
        const orgId = req.user!.organization_id as string;
        const context = getUserContext(req);
        const result = await quoteNotesController.updateQuoteNote(
            quoteId,
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

router.delete("/:quoteId/notes/:noteId", async (req, res, next) => {
    try {
        const { quoteId, noteId } = req.params;
        const orgId = req.user!.organization_id as string;
        const context = getUserContext(req);
        const result = await quoteNotesController.deleteQuoteNote(
            quoteId,
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
