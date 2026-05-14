import { Router } from 'express';
import { ZodError } from 'zod';
import {
    ErrorCodes,
    createSuccessResponse,
    createErrorResponse,
} from "../types/responses.js";
import { getUserContext, getScopedDb } from '../lib/context.js';
import { logActivity } from '../services/logger.js';
import * as invoicesController from '../controllers/invoicesController.js';
import { createInvoiceRecord } from '../services/invoiceService.js';
import { generateInvoicePdf } from '../lib/pdf/pdfService.js';
import { sendInvoiceEmail } from '../services/emailService.js';
import { buildVisitInvoicePayload, buildRecurringPlanInvoicePayload } from '../services/invoiceGenerator.js';
import { overlapCheckSchema, generateInvoiceSchema } from '../lib/validate/invoices.js';
import { advanceNextInvoiceAt, calculateNextInvoiceAt, type ScheduleFrequency } from '../lib/invoiceSchedule.js';
import { Prisma } from '../../generated/prisma/client.js';

const router = Router();

router.get("/", async (req, res, next) => {
    try {
        const orgId = req.user!.organization_id as string;
        const invoices = await invoicesController.getAllInvoices(orgId);
        res.json(createSuccessResponse(invoices, { count: invoices.length }));
    } catch (err) {
        next(err);
    }
});

router.get("/:id", async (req, res, next) => {
    try {
        const orgId = req.user!.organization_id as string;
        const invoice = await invoicesController.getInvoiceById(req.params.id, orgId);
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
        const orgId = req.user!.organization_id as string;
        const buffer = await generateInvoicePdf(req.params.id, orgId);
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

        const orgId = req.user!.organization_id as string;
        await sendInvoiceEmail(id, recipientEmail, orgId);
        const context = getUserContext(req);
        const result = await invoicesController.updateInvoice(
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

// ── Pipeline: overlap check ───────────────────────────────────────────────────

router.post("/overlap-check", async (req, res, next) => {
    try {
        const { visit_ids } = overlapCheckSchema.parse(req.body);
        const orgId = req.user!.organization_id as string;
        const sdb = getScopedDb(orgId);
        const { warnings } = await buildVisitInvoicePayload(visit_ids, sdb);
        res.json(createSuccessResponse({ warnings }));
    } catch (err) {
        if (err instanceof ZodError)
            return res.status(400).json(createErrorResponse(ErrorCodes.VALIDATION_ERROR, err.issues[0].message));
        if (err instanceof Error && err.message.includes("same client"))
            return res.status(400).json(createErrorResponse(ErrorCodes.VALIDATION_ERROR, err.message));
        next(err);
    }
});

// ── Pipeline: generate invoice from recurring plan ────────────────────────────

router.post("/generate", async (req, res, next) => {
    try {
        const parsed = generateInvoiceSchema.parse(req.body);
        const orgId = req.user!.organization_id as string;
        const context = getUserContext(req);
        const sdb = getScopedDb(orgId);

        // Read schedule first — both the payload builder and the CAS guard must
        // use the same last_invoiced_at snapshot to prevent stale-scope bypass.
        const schedule = await sdb.invoice_schedule.findFirst({ where: { recurring_plan_id: parsed.plan_id } });

        const { payload, warnings } = await buildRecurringPlanInvoicePayload(
            parsed.plan_id,
            sdb,
            schedule ? { last_invoiced_at: schedule.last_invoiced_at } : undefined,
        );
        if (parsed.memo) payload.memo = parsed.memo;
        if (parsed.payment_terms_days != null) payload.payment_terms_days = parsed.payment_terms_days;

        // Retry loop guards against invoice_number unique-constraint collision
        // on concurrent requests. CAS guard inside the transaction prevents
        // double-invoice on the same plan.
        let inv;
        for (let attempt = 0; attempt < 5; attempt++) {
            try {
                inv = await sdb.$transaction(async (tx) => {
                    const created = await createInvoiceRecord(payload, orgId, context.dispatcherId, tx as unknown as Prisma.TransactionClient);
                    if (schedule && schedule.frequency !== "on_visit_completion") {
                        // Advance from the scheduled anchor date so a late run
                        // doesn't skip billing periods (advanceNextInvoiceAt vs
                        // calculateNextInvoiceAt which defaults from=now).
                        const nextInvoiceAt = schedule.next_invoice_at
                            ? advanceNextInvoiceAt(
                                schedule.frequency as ScheduleFrequency,
                                schedule.day_of_month ?? null,
                                schedule.day_of_week ?? null,
                                schedule.generate_days_before ?? 0,
                                schedule.next_invoice_at,
                            )
                            : calculateNextInvoiceAt(
                                schedule.frequency as ScheduleFrequency,
                                schedule.day_of_month ?? null,
                                schedule.day_of_week ?? null,
                                schedule.generate_days_before ?? 0,
                            );
                        const updateResult = await tx.invoice_schedule.updateMany({
                            where: {
                                id: schedule.id,
                                last_invoiced_at: schedule.last_invoiced_at,
                            },
                            data: { last_invoiced_at: new Date(), next_invoice_at: nextInvoiceAt },
                        });
                        if (updateResult.count === 0) {
                            throw new Error("Invoice generation already in progress for this plan — try again");
                        }
                    }
                    return created;
                });
                break;
            } catch (e) {
                if (
                    attempt < 4 &&
                    e instanceof Prisma.PrismaClientKnownRequestError &&
                    e.code === "P2002" &&
                    (e.meta?.target as string[] | undefined)?.includes("invoice_number")
                ) {
                    continue;
                }
                throw e;
            }
        }

        if (!inv) throw new Error("Invoice creation failed");

        await logActivity({
            event_type: "invoice.created",
            action: "created",
            entity_type: "invoice",
            entity_id: inv.id,
            organization_id: orgId,
            actor_type: "dispatcher",
            actor_id: context.dispatcherId ?? null,
            changes: {
                invoice_number: { old: null, new: inv.invoice_number },
                client_id: { old: null, new: inv.client_id },
                total: { old: null, new: inv.total },
                status: { old: null, new: inv.status },
                recurring_plan_id: { old: null, new: inv.recurring_plan_id ?? null },
            },
            ip_address: context.ipAddress,
            user_agent: context.userAgent,
        });

        res.status(201).json(createSuccessResponse({ invoice: inv, warnings }));
    } catch (err) {
        if (err instanceof ZodError)
            return res.status(400).json(createErrorResponse(ErrorCodes.VALIDATION_ERROR, err.issues[0].message));
        if (err instanceof Error && err.message.startsWith("Invoice generation already in progress"))
            return res.status(409).json(createErrorResponse(ErrorCodes.CONFLICT, err.message));
        next(err);
    }
});

router.post("/", async (req, res, next) => {
    try {
        const orgId = req.user!.organization_id as string;
        const context = getUserContext(req);
        const result = await invoicesController.insertInvoice(req, orgId, context);
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
        const orgId = req.user!.organization_id as string;
        const context = getUserContext(req);
        const result = await invoicesController.updateInvoice(req, orgId, context);
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
        const orgId = req.user!.organization_id as string;
        const context = getUserContext(req);
        const result = await invoicesController.deleteInvoice(
            req.params.id,
            orgId,
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
            req.params.invoiceId, req.user!.organization_id as string,
        );
        res.json(createSuccessResponse(payments, { count: payments.length }));
    } catch (err) {
        next(err);
    }
});

router.post("/:invoiceId/payments", async (req, res, next) => {
    try {
        const orgId = req.user!.organization_id as string;
        const context = getUserContext(req);
        const result = await invoicesController.insertInvoicePayment(
            req.params.invoiceId,
            req.body,
            orgId,
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
            const orgId = req.user!.organization_id as string;
            const context = getUserContext(req);
            const result = await invoicesController.deleteInvoicePayment(
                req.params.invoiceId,
                req.params.paymentId,
                orgId,
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
        const orgId = req.user!.organization_id as string;
        const notes = await invoicesController.getInvoiceNotes(
            req.params.invoiceId,
            orgId,
        );
        res.json(createSuccessResponse(notes, { count: notes.length }));
    } catch (err) {
        next(err);
    }
});

router.post("/:invoiceId/notes", async (req, res, next) => {
    try {
        const orgId = req.user!.organization_id as string;
        const context = getUserContext(req);
        const result = await invoicesController.insertInvoiceNote(
            req.params.invoiceId,
            req.body,
            orgId,
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
        const orgId = req.user!.organization_id as string;
        const context = getUserContext(req);
        const result = await invoicesController.updateInvoiceNote(
            req.params.invoiceId,
            req.params.noteId,
            req.body,
            orgId,
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
        const orgId = req.user!.organization_id as string;
        const context = getUserContext(req);
        const result = await invoicesController.deleteInvoiceNote(
            req.params.invoiceId,
            req.params.noteId,
            orgId,
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
