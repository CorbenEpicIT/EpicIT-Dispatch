import { Router } from 'express';
import {
    ErrorCodes,
    createSuccessResponse,
    createErrorResponse,
} from "../types/responses.js";
import { getUserContext } from '../lib/context.js';
import * as invoicesController from '../controllers/invoicesController.js';
import { generateInvoicePdf } from '../lib/pdf/pdfService.js';
import { sendInvoiceEmail } from '../services/emailService.js';

const router = Router();

router.get("/", async (req, res, next) => {
    try {
        const invoices = await invoicesController.getAllInvoices();
        res.json(createSuccessResponse(invoices, { count: invoices.length }));
    } catch (err) {
        next(err);
    }
});

router.get("/:id", async (req, res, next) => {
    try {
        const invoice = await invoicesController.getInvoiceById(req.params.id);
        if (!invoice)
            return res
                .status(404)
                .json(
                    createErrorResponse(
                        ErrorCodes.NOT_FOUND,
                        "Invoice not found",
                    ),
                );
        res.json(createSuccessResponse(invoice));
    } catch (err) {
        next(err);
    }
});

router.get("/:id/pdf", async (req, res, next) => {
    try {
        const buffer = await generateInvoicePdf(req.params.id);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="invoice-${req.params.id}.pdf"`,
        );
        res.send(buffer);
    } catch (err: any) {
        if (err?.status === 404)
            return res
                .status(404)
                .json(createErrorResponse(ErrorCodes.NOT_FOUND, "Invoice not found"));
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

        await sendInvoiceEmail(id, recipientEmail);

        const context = getUserContext(req);
        const result = await invoicesController.updateInvoice(
            { params: { id }, body: { status: "Sent" } } as any,
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
        const context = getUserContext(req);
        const result = await invoicesController.insertInvoice(req, context);
        if (result.err)
            return res
                .status(400)
                .json(
                    createErrorResponse(
                        ErrorCodes.VALIDATION_ERROR,
                        result.err,
                    ),
                );
        res.status(201).json(createSuccessResponse(result.item));
    } catch (err) {
        next(err);
    }
});

router.patch("/:id", async (req, res, next) => {
    try {
        const context = getUserContext(req);
        const result = await invoicesController.updateInvoice(req, context);
        if (result.err) {
            const status = result.err.includes("not found") ? 404 : 400;
            return res
                .status(status)
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
        const context = getUserContext(req);
        const result = await invoicesController.deleteInvoice(
            req.params.id,
            context,
        );
        if (result.err) {
            const status = result.err.includes("not found") ? 404 : 400;
            return res
                .status(status)
                .json(createErrorResponse(ErrorCodes.DELETE_ERROR, result.err));
        }
        res.status(200).json(createSuccessResponse(result.item));
    } catch (err) {
        next(err);
    }
});

// ── Payments ─────────────────────────────────────────────────────────────────

router.get("/:invoiceId/payments", async (req, res, next) => {
    try {
        const payments = await invoicesController.getInvoicePayments(
            req.params.invoiceId,
        );
        res.json(createSuccessResponse(payments, { count: payments.length }));
    } catch (err) {
        next(err);
    }
});

router.post("/:invoiceId/payments", async (req, res, next) => {
    try {
        const context = getUserContext(req);
        const result = await invoicesController.insertInvoicePayment(
            req.params.invoiceId,
            req.body,
            context,
        );
        if (result.err) {
            const status = result.err.includes("not found") ? 404 : 400;
            return res
                .status(status)
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

router.delete(
    "/:invoiceId/payments/:paymentId",
    async (req, res, next) => {
        try {
            const context = getUserContext(req);
            const result = await invoicesController.deleteInvoicePayment(
                req.params.invoiceId,
                req.params.paymentId,
                context,
            );
            if (result.err) {
                const status = result.err.includes("not found") ? 404 : 400;
                return res
                    .status(status)
                    .json(
                        createErrorResponse(
                            ErrorCodes.DELETE_ERROR,
                            result.err,
                        ),
                    );
            }
            res.status(200).json(createSuccessResponse(result.item));
        } catch (err) {
            next(err);
        }
    },
);

// ── Notes ─────────────────────────────────────────────────────────────────────

router.get("/:invoiceId/notes", async (req, res, next) => {
    try {
        const notes = await invoicesController.getInvoiceNotes(
            req.params.invoiceId,
        );
        res.json(createSuccessResponse(notes, { count: notes.length }));
    } catch (err) {
        next(err);
    }
});

router.post("/:invoiceId/notes", async (req, res, next) => {
    try {
        const context = getUserContext(req);
        const result = await invoicesController.insertInvoiceNote(
            req.params.invoiceId,
            req.body,
            context,
        );
        if (result.err) {
            const status = result.err.includes("not found") ? 404 : 400;
            return res
                .status(status)
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

router.put("/:invoiceId/notes/:noteId", async (req, res, next) => {
    try {
        const context = getUserContext(req);
        const result = await invoicesController.updateInvoiceNote(
            req.params.invoiceId,
            req.params.noteId,
            req.body,
            context,
        );
        if (result.err) {
            const status = result.err.includes("not found") ? 404 : 400;
            return res
                .status(status)
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

router.delete("/:invoiceId/notes/:noteId", async (req, res, next) => {
    try {
        const context = getUserContext(req);
        const result = await invoicesController.deleteInvoiceNote(
            req.params.invoiceId,
            req.params.noteId,
            context,
        );
        if (result.err) {
            const status = result.err.includes("not found") ? 404 : 400;
            return res
                .status(status)
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