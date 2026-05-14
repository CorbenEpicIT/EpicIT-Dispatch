import { ZodError } from "zod";
import { db } from "../db.js";
import { getScopedDb, type UserContext } from "../lib/context.js";
import {
	createInvoiceSchema,
	updateInvoiceSchema,
	createInvoicePaymentSchema,
	createInvoiceNoteSchema,
	updateInvoiceNoteSchema,
} from "../lib/validate/invoices.js";
import { Request } from "express";
import { logActivity, buildChanges } from "../services/logger.js";
import { Prisma } from "../../generated/prisma/client.js";
import { log } from "../services/appLogger.js";
import { assertValidInvoiceTransition, InvalidTransitionError } from "../lib/statusTransitions.js";
import { ErrorCodes, createSuccessResponse, createErrorResponse } from "../types/responses.js";
import {
	type CreateInvoicePayload,
	createInvoiceRecord,
	syncBilledAmounts,
	syncInvoicePaymentTotals,
	invoiceInclude,
} from "../services/invoiceService.js";

// ============================================================================
// INVOICE CRUD
// ============================================================================

export const getAllInvoices = async (organizationId: string) => {
	const sdb = getScopedDb(organizationId);
	return await sdb.invoice.findMany({
		include: invoiceInclude,
		orderBy: { created_at: "desc" },
	});
};

export const getInvoiceById = async (id: string, organizationId: string) => {
	const sdb = getScopedDb(organizationId);
	return await sdb.invoice.findFirst({
		where: { id },
		include: invoiceInclude,
	});
};

export const getInvoicesByClientId = async (clientId: string, organizationId: string) => {
	const sdb = getScopedDb(organizationId);
	return await sdb.invoice.findMany({
		where: { client_id: clientId },
		include: invoiceInclude,
		orderBy: { created_at: "desc" },
	});
};

export const getInvoicesByJobId = async (jobId: string, organizationId: string) => {
	const sdb = getScopedDb(organizationId);
	return await sdb.invoice.findMany({
		where: { jobs: { some: { job_id: jobId } } },
		include: invoiceInclude,
		orderBy: { created_at: "desc" },
	});
};

export const getInvoicesByVisitId = async (visitId: string, organizationId: string) => {
	const sdb = getScopedDb(organizationId);
	return await sdb.invoice.findMany({
		where: { visits: { some: { visit_id: visitId } } },
		include: invoiceInclude,
		orderBy: { created_at: "desc" },
	});
};

export const insertInvoice = async (req: Request, organizationId: string, context?: UserContext) => {
	try {
		const parsed = createInvoiceSchema.parse(req.body);

		let created: Awaited<ReturnType<typeof db.invoice.findFirst>> | undefined;

		for (let attempt = 0; attempt < 5; attempt++) {
			try {
				created = await createInvoiceRecord(
					parsed,
					organizationId,
					context?.dispatcherId,
				);

				// Transaction committed — log outside so it is never rolled back
				if (created) {
					await logActivity({
						event_type: "invoice.created",
						action: "created",
						entity_type: "invoice",
						entity_id: created.id,
						organization_id: organizationId,
						actor_type: context?.dispatcherId
							? "dispatcher"
							: context?.techId
								? "technician"
								: "system",
						actor_id: context?.dispatcherId ?? context?.techId,
						changes: {
							invoice_number: {
								old: null,
								new: created.invoice_number,
							},
							client_id: { old: null, new: created.client_id },
							total: { old: null, new: created.total },
							status: { old: null, new: created.status },
						},
						ip_address: context?.ipAddress,
						user_agent: context?.userAgent,
					});
				}
				break; // success — exit retry loop
			} catch (e) {
				// Retry on invoice_number unique constraint collision
				if (
					attempt < 4 &&
					e instanceof Prisma.PrismaClientKnownRequestError &&
					e.code === "P2002" &&
					(e.meta?.target as string[] | undefined)?.includes(
						"invoice_number",
					)
				) {
					continue;
				}
				throw e;
			}
		}

		return { err: "", item: created ?? undefined };
	} catch (e) {
		if (e instanceof ZodError) {
			return {
				err: `Validation failed: ${e.issues.map((i) => i.message).join(", ")}`,
			};
		}
		if (e instanceof Error) return { err: e.message };
		log.error({ err: e }, "Insert invoice error");
		return { err: "Internal server error" };
	}
};

export const updateInvoice = async (req: Request, organizationId: string, context?: UserContext) => {
	try {
		const id = req.params.id as string;
		const parsed = updateInvoiceSchema.parse(req.body);

		const sdb = getScopedDb(organizationId);
		const existing = await sdb.invoice.findFirst({
			where: { id },
			include: { line_items: true },
		});
		if (!existing) return { err: "Invoice not found" };

		if (existing.status === "Void") {
			return { err: "Void invoices cannot be modified" };
		}

		if (parsed.status === "Void" && !parsed.void_reason) {
			return { err: "void_reason is required when voiding an invoice" };
		}

		// Enforce valid status transitions
		if (parsed.status && parsed.status !== existing.status) {
			try {
				assertValidInvoiceTransition(existing.status, parsed.status);
			} catch (e) {
				if (e instanceof InvalidTransitionError) {
					return { err: e.message };
				}
				throw e;
			}
		}

		const { line_items: _li, ...parsedScalars } = parsed;

		const changes = buildChanges(existing, parsedScalars, [
			"status",
			"issue_date",
			"due_date",
			"payment_terms_days",
			"sent_at",
			"viewed_at",
			"subtotal",
			"tax_rate",
			"tax_amount",
			"discount_type",
			"discount_value",
			"discount_amount",
			"total",
			"memo",
			"internal_notes",
			"void_reason",
		] as const);

		const updated = await sdb.$transaction(async (tx) => {
			// ── Line item replacement ──────────────────────────────────────
			if (parsed.line_items !== undefined) {
				const incoming = parsed.line_items;
				const existingIds = new Set(
					existing.line_items.map((i) => i.id),
				);
				const incomingIds = new Set(
					incoming.filter((i) => i.id).map((i) => i.id!),
				);

				for (const item of existing.line_items) {
					if (!incomingIds.has(item.id)) {
						await tx.invoice_line_item.delete({
							where: { id: item.id },
						});
					}
				}

				for (const item of incoming) {
					if (item.id && existingIds.has(item.id)) {
						await tx.invoice_line_item.update({
							where: { id: item.id },
							data: {
								name: item.name,
								description: item.description ?? null,
								quantity: item.quantity,
								unit_price: item.unit_price,
								total:
									item.total !== undefined
										? item.total
										: item.quantity * item.unit_price,
								item_type: item.item_type ?? null,
								sort_order: item.sort_order ?? 0,
								source_job_id: item.source_job_id ?? null,
								source_visit_id: item.source_visit_id ?? null,
							},
						});
					} else {
						await tx.invoice_line_item.create({
							data: {
								invoice_id: id,
								name: item.name,
								description: item.description ?? null,
								quantity: item.quantity,
								unit_price: item.unit_price,
								total:
									item.total !== undefined
										? item.total
										: item.quantity * item.unit_price,
								item_type: item.item_type ?? null,
								sort_order: item.sort_order ?? 0,
								source_job_id: item.source_job_id ?? null,
								source_visit_id: item.source_visit_id ?? null,
							},
						});
					}
				}

				// Recompute billed_amount for all linked jobs and visits
				// from the now-current line items' source attribution.
				await syncBilledAmounts(id, tx as unknown as Prisma.TransactionClient);
			}

			const invoice = await tx.invoice.update({
				where: { id },
				data: {
					...(parsed.status !== undefined && {
						status: parsed.status,
					}),
					...(parsed.issue_date !== undefined && {
						issue_date: parsed.issue_date,
					}),
					...(parsed.due_date !== undefined && {
						due_date: parsed.due_date,
					}),
					...(parsed.payment_terms_days !== undefined && {
						payment_terms_days: parsed.payment_terms_days,
					}),
					...(parsed.sent_at !== undefined && {
						sent_at: parsed.sent_at,
					}),
					...(parsed.viewed_at !== undefined && {
						viewed_at: parsed.viewed_at,
					}),
					...(parsed.subtotal !== undefined && {
						subtotal: parsed.subtotal,
					}),
					...(parsed.tax_rate !== undefined && {
						tax_rate: parsed.tax_rate,
					}),
					...(parsed.tax_amount !== undefined && {
						tax_amount: parsed.tax_amount,
					}),
					...(parsed.discount_type !== undefined && {
						discount_type: parsed.discount_type,
					}),
					...(parsed.discount_value !== undefined && {
						discount_value: parsed.discount_value,
					}),
					...(parsed.discount_amount !== undefined && {
						discount_amount: parsed.discount_amount,
					}),
					...(parsed.total !== undefined && { total: parsed.total }),
					...(parsed.memo !== undefined && { memo: parsed.memo }),
					...(parsed.internal_notes !== undefined && {
						internal_notes: parsed.internal_notes,
					}),
					...(parsed.void_reason !== undefined && {
						void_reason: parsed.void_reason,
					}),
					...(parsed.status === "Issued" &&
						!existing.issued_at && { issued_at: new Date() }),
					...(parsed.status === "Sent" &&
						!existing.sent_at && { sent_at: new Date() }),
					...(parsed.status === "Sent" &&
						!existing.issue_date && { issue_date: new Date() }),
					...(parsed.status === "Void" && {
						voided_at: new Date(),
					}),
					...(parsed.total !== undefined && {
						balance_due: Math.max(
							0,
							parsed.total - Number(existing.amount_paid),
						),
					}),
				},
				include: invoiceInclude,
			});

			return invoice;
		});

		if (Object.keys(changes).length > 0) {
			await logActivity({
				event_type: "invoice.updated",
				action: "updated",
				entity_type: "invoice",
				entity_id: id,
				organization_id: organizationId,
				actor_type: context?.dispatcherId
					? "dispatcher"
					: context?.techId
						? "technician"
						: "system",
				actor_id: context?.dispatcherId ?? context?.techId,
				changes: { ...changes, _invoice_number: { old: null, new: existing.invoice_number } },
				ip_address: context?.ipAddress,
				user_agent: context?.userAgent,
			});
		}

		return { err: "", item: updated };
	} catch (e) {
		if (e instanceof ZodError) {
			return {
				err: `Validation failed: ${e.issues.map((i) => i.message).join(", ")}`,
			};
		}
		log.error({ err: e }, "Update invoice error");
		return { err: "Internal server error" };
	}
};

export const deleteInvoice = async (id: string, organizationId: string, context?: UserContext) => {
	try {
		const sdb = getScopedDb(organizationId);
		const existing = await sdb.invoice.findFirst({ where: { id } });
		if (!existing) return { err: "Invoice not found" };

		if (existing.status !== "Draft") {
			return {
				err: "Only Draft invoices can be deleted. Void the invoice instead.",
			};
		}

		await sdb.invoice.delete({ where: { id } });

		await logActivity({
			event_type: "invoice.deleted",
			action: "deleted",
			entity_type: "invoice",
			entity_id: id,
			organization_id: organizationId,
			actor_type: context?.dispatcherId
				? "dispatcher"
				: context?.techId
					? "technician"
					: "system",
			actor_id: context?.dispatcherId ?? context?.techId,
			changes: {
				invoice_number: { old: existing.invoice_number, new: null },
				status: { old: existing.status, new: null },
				total: { old: existing.total, new: null },
			},
			ip_address: context?.ipAddress,
			user_agent: context?.userAgent,
		});

		return { err: "", item: { id } };
	} catch (e) {
		log.error({ err: e }, "Delete invoice error");
		return { err: "Internal server error" };
	}
};

// ============================================================================
// PAYMENTS
// ============================================================================

export const getInvoicePayments = async (invoiceId: string, organizationId: string) => {
	const sdb = getScopedDb(organizationId);
	return await sdb.invoice_payment.findMany({
		where: { invoice_id: invoiceId },
		orderBy: { paid_at: "asc" },
		include: {
			recorded_by_dispatcher: { select: { id: true, name: true } },
			recorded_by_tech: { select: { id: true, name: true } },
		},
	});
};

export const insertInvoicePayment = async (
	invoiceId: string,
	data: unknown,
	organizationId: string,
	context?: UserContext,
) => {
	try {
		const parsed = createInvoicePaymentSchema.parse(data);

		const sdb = getScopedDb(organizationId);
		const invoice = await sdb.invoice.findFirst({
			where: { id: invoiceId },
		});
		if (!invoice) return { err: "Invoice not found" };

		if (invoice.status === "Void") {
			return { err: "Cannot record payment on a void invoice" };
		}

		const created = await sdb.$transaction(async (tx) => {
			const payment = await tx.invoice_payment.create({
				data: {
					invoice_id: invoiceId,
					amount: parsed.amount,
					paid_at: parsed.paid_at ?? new Date(),
					method: parsed.method ?? null,
					note: parsed.note ?? null,
					recorded_by_dispatcher_id: context?.dispatcherId ?? null,
					recorded_by_tech_id: context?.techId ?? null,
				},
			});

			await syncInvoicePaymentTotals(invoiceId, tx as unknown as Prisma.TransactionClient);

			return payment;
		});

		await logActivity({
			event_type: "invoice_payment.created",
			action: "created",
			entity_type: "invoice_payment",
			entity_id: created.id,
			organization_id: organizationId,
			actor_type: context?.dispatcherId
				? "dispatcher"
				: context?.techId
					? "technician"
					: "system",
			actor_id: context?.dispatcherId ?? context?.techId,
			changes: {
				invoice_id: { old: null, new: invoiceId },
				amount: { old: null, new: parsed.amount },
				method: { old: null, new: parsed.method ?? null },
				_invoice_number: { old: null, new: invoice.invoice_number },
			},
			ip_address: context?.ipAddress,
			user_agent: context?.userAgent,
		});

		return { err: "", item: created };
	} catch (e) {
		if (e instanceof ZodError) {
			return {
				err: `Validation failed: ${e.issues.map((i) => i.message).join(", ")}`,
			};
		}
		log.error({ err: e }, "Insert invoice payment error");
		return { err: "Internal server error" };
	}
};

export const deleteInvoicePayment = async (
	invoiceId: string,
	paymentId: string,
	organizationId: string,
	context?: UserContext,
) => {
	try {
		const sdb = getScopedDb(organizationId);
		const existing = await sdb.invoice_payment.findFirst({
			where: { id: paymentId, invoice_id: invoiceId },
		});
		if (!existing) return { err: "Payment not found" };

		const invoice = await sdb.invoice.findFirst({
			where: { id: invoiceId },
		});
		if (invoice?.status === "Void") {
			return { err: "Cannot modify payments on a void invoice" };
		}

		await sdb.$transaction(async (tx) => {
			await tx.invoice_payment.delete({ where: { id: paymentId } });
			await syncInvoicePaymentTotals(invoiceId, tx as unknown as Prisma.TransactionClient);
		});

		await logActivity({
			event_type: "invoice_payment.deleted",
			action: "deleted",
			entity_type: "invoice_payment",
			entity_id: paymentId,
			organization_id: organizationId,
			actor_type: context?.dispatcherId
				? "dispatcher"
				: context?.techId
					? "technician"
					: "system",
			actor_id: context?.dispatcherId ?? context?.techId,
			changes: {
				invoice_id: { old: invoiceId, new: null },
				amount: { old: existing.amount, new: null },
			},
			ip_address: context?.ipAddress,
			user_agent: context?.userAgent,
		});

		return { err: "", item: { id: paymentId } };
	} catch (e) {
		log.error({ err: e }, "Delete invoice payment error");
		return { err: "Internal server error" };
	}
};

// ============================================================================
// NOTES
// ============================================================================

export const getInvoiceNotes = async (invoiceId: string, organizationId: string) => {
	const sdb = getScopedDb(organizationId);
	return await sdb.invoice_note.findMany({
		where: { invoice_id: invoiceId },
		orderBy: { created_at: "desc" },
		include: {
			creator_tech: { select: { id: true, name: true, email: true } },
			creator_dispatcher: {
				select: { id: true, name: true, email: true },
			},
			last_editor_tech: { select: { id: true, name: true, email: true } },
			last_editor_dispatcher: {
				select: { id: true, name: true, email: true },
			},
		},
	});
};

export const insertInvoiceNote = async (
	invoiceId: string,
	data: unknown,
	organizationId: string,
	context?: UserContext,
) => {
	try {
		const parsed = createInvoiceNoteSchema.parse(data);

		const sdb = getScopedDb(organizationId);
		const invoice = await sdb.invoice.findFirst({
			where: { id: invoiceId },
		});
		if (!invoice) return { err: "Invoice not found" };

		const created = await sdb.invoice_note.create({
			data: {
				organization_id: organizationId,
				invoice_id: invoiceId,
				content: parsed.content,
				creator_tech_id: context?.techId ?? null,
				creator_dispatcher_id: context?.dispatcherId ?? null,
				last_editor_tech_id: context?.techId ?? null,
				last_editor_dispatcher_id: context?.dispatcherId ?? null,
			},
			include: {
				creator_tech: {
					select: { id: true, name: true, email: true },
				},
				creator_dispatcher: {
					select: { id: true, name: true, email: true },
				},
			},
		});

		await logActivity({
			event_type: "invoice_note.created",
			action: "created",
			entity_type: "invoice_note",
			entity_id: created.id,
			organization_id: organizationId,
			actor_type: context?.dispatcherId
				? "dispatcher"
				: context?.techId
					? "technician"
					: "system",
			actor_id: context?.dispatcherId ?? context?.techId,
			changes: {
				invoice_id: { old: null, new: invoiceId },
				content: { old: null, new: parsed.content },
			},
			ip_address: context?.ipAddress,
			user_agent: context?.userAgent,
		});

		return { err: "", item: created };
	} catch (e) {
		if (e instanceof ZodError) {
			return {
				err: `Validation failed: ${e.issues.map((i) => i.message).join(", ")}`,
			};
		}
		log.error({ err: e }, "Insert invoice note error");
		return { err: "Internal server error" };
	}
};

export const updateInvoiceNote = async (
	invoiceId: string,
	noteId: string,
	data: unknown,
	organizationId: string,
	context?: UserContext,
) => {
	try {
		const parsed = updateInvoiceNoteSchema.parse(data);

		const sdb = getScopedDb(organizationId);
		const existing = await sdb.invoice_note.findFirst({
			where: { id: noteId, invoice_id: invoiceId },
		});
		if (!existing) return { err: "Note not found" };

		const updated = await sdb.invoice_note.update({
			where: { id: noteId },
			data: {
				...(parsed.content !== undefined && {
					content: parsed.content,
				}),
				last_editor_tech_id: context?.techId ?? null,
				last_editor_dispatcher_id: context?.dispatcherId ?? null,
			},
			include: {
				creator_tech: {
					select: { id: true, name: true, email: true },
				},
				creator_dispatcher: {
					select: { id: true, name: true, email: true },
				},
				last_editor_tech: {
					select: { id: true, name: true, email: true },
				},
				last_editor_dispatcher: {
					select: { id: true, name: true, email: true },
				},
			},
		});

		if (parsed.content !== undefined) {
			await logActivity({
				event_type: "invoice_note.updated",
				action: "updated",
				entity_type: "invoice_note",
				entity_id: noteId,
				organization_id: organizationId,
				actor_type: context?.dispatcherId
					? "dispatcher"
					: context?.techId
						? "technician"
						: "system",
				actor_id: context?.dispatcherId ?? context?.techId,
				changes: {
					content: { old: existing.content, new: parsed.content },
				},
				ip_address: context?.ipAddress,
				user_agent: context?.userAgent,
			});
		}

		return { err: "", item: updated };
	} catch (e) {
		if (e instanceof ZodError) {
			return {
				err: `Validation failed: ${e.issues.map((i) => i.message).join(", ")}`,
			};
		}
		log.error({ err: e }, "Update invoice note error");
		return { err: "Internal server error" };
	}
};

export const deleteInvoiceNote = async (
	invoiceId: string,
	noteId: string,
	organizationId: string,
	context?: UserContext,
) => {
	try {
		const sdb = getScopedDb(organizationId);
		const existing = await sdb.invoice_note.findFirst({
			where: { id: noteId, invoice_id: invoiceId },
		});
		if (!existing) return { err: "Note not found" };

		await sdb.invoice_note.delete({ where: { id: noteId } });

		await logActivity({
			event_type: "invoice_note.deleted",
			action: "deleted",
			entity_type: "invoice_note",
			entity_id: noteId,
			organization_id: organizationId,
			actor_type: context?.dispatcherId
				? "dispatcher"
				: context?.techId
					? "technician"
					: "system",
			actor_id: context?.dispatcherId ?? context?.techId,
			changes: {
				invoice_id: { old: invoiceId, new: null },
				content: { old: existing.content, new: null },
			},
			ip_address: context?.ipAddress,
			user_agent: context?.userAgent,
		});

		return { err: "", message: "Note deleted successfully" };
	} catch (e) {
		log.error({ err: e }, "Delete invoice note error");
		return { err: "Internal server error" };
	}
};
