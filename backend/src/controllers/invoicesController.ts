// @ts-nocheck - Invoice models not yet in schema (halfbaked feature)
import { ZodError } from "zod";
import { db } from "../db.js";
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

export interface UserContext {
	techId?: string;
	dispatcherId?: string;
	ipAddress?: string;
	userAgent?: string;
}

// ============================================================================
// HELPERS
// ============================================================================

async function generateInvoiceNumber(
	tx: Prisma.TransactionClient,
): Promise<string> {
	const last = await tx.invoice.findFirst({
		where: { invoice_number: { startsWith: "INV-" } },
		orderBy: { created_at: "desc" },
	});

	let next = 1;
	if (last) {
		const match = last.invoice_number.match(/INV-(\d+)/);
		if (match) next = parseInt(match[1]) + 1;
	}

	return `INV-${next.toString().padStart(4, "0")}`;
}

/**
 * Resolve tax rate for a new invoice using the cascade:
 * client.is_tax_exempt → 0
 * client.tax_rate      → client rate
 * organization.tax_rate → org rate
 * fallback             → 0
 */
async function resolveTaxRate(clientId: string): Promise<number> {
	const client = await db.client.findUnique({
		where: { id: clientId },
		select: {
			is_tax_exempt: true,
			tax_rate: true,
			organization: { select: { tax_rate: true } },
		},
	});

	if (!client) return 0;
	if (client.is_tax_exempt) return 0;
	if (client.tax_rate !== null && client.tax_rate !== undefined)
		return Number(client.tax_rate);
	if (client.organization?.tax_rate !== undefined)
		return Number(client.organization.tax_rate);
	return 0;
}

/** Recalculate amount_paid, balance_due, and status after any payment change. */
async function syncInvoicePaymentTotals(
	invoiceId: string,
	tx: Prisma.TransactionClient,
): Promise<void> {
	const [invoice, payments] = await Promise.all([
		tx.invoice.findUnique({
			where: { id: invoiceId },
			select: { total: true, status: true },
		}),
		tx.invoice_payment.findMany({
			where: { invoice_id: invoiceId },
			select: { amount: true },
		}),
	]);

	if (!invoice) return;

	const total = Number(invoice.total);
	const amountPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
	const balanceDue = Math.max(0, total - amountPaid);

	// Only auto-transition to PartiallyPaid or Paid.
	// Disputed and Void are set manually and must not be overwritten here.
	// Draft/Sent/Viewed are preserved when payments are removed.
	let status = invoice.status;
	if (status !== "Disputed" && status !== "Void") {
		if (amountPaid <= 0) {
			// Only revert auto-set payment statuses; leave Draft/Sent/Viewed alone.
			if (status === "PartiallyPaid" || status === "Paid") {
				status = "Sent";
			}
		} else if (amountPaid >= total) {
			status = "Paid";
		} else {
			status = "PartiallyPaid";
		}
	}

	await tx.invoice.update({
		where: { id: invoiceId },
		data: {
			amount_paid: amountPaid,
			balance_due: balanceDue,
			status,
			...(status === "Paid" ? { paid_at: new Date() } : {}),
		},
	});
}

/**
 * Recompute billed_amount for every invoice_job and invoice_visit row
 * linked to this invoice by summing the line items attributed to each
 * via source_job_id / source_visit_id.
 *
 * Called after any line item replacement so the Linked Jobs & Visits
 * display always reflects current line item values.
 */
async function syncBilledAmounts(
	invoiceId: string,
	tx: Prisma.TransactionClient,
): Promise<void> {
	// Fetch all current line items for this invoice
	const lineItems = await tx.invoice_line_item.findMany({
		where: { invoice_id: invoiceId },
		select: {
			total: true,
			source_job_id: true,
			source_visit_id: true,
		},
	});

	// ── Visit billed amounts ──────────────────────────────────────────────
	// Sum line items where source_visit_id matches the linked visit.
	const linkedVisits = await tx.invoice_visit.findMany({
		where: { invoice_id: invoiceId },
		select: { visit_id: true },
	});

	for (const { visit_id } of linkedVisits) {
		const billedAmount = lineItems
			.filter((li) => li.source_visit_id === visit_id)
			.reduce((sum, li) => sum + Number(li.total), 0);

		await tx.invoice_visit.update({
			where: {
				invoice_id_visit_id: {
					invoice_id: invoiceId,
					visit_id,
				},
			},
			data: { billed_amount: billedAmount },
		});
	}

	// ── Job billed amounts ────────────────────────────────────────────────
	// Sum line items attributed to the job directly (source_job_id matches,
	// source_visit_id is null — visit-attributed items are counted on the visit,
	// not the job level).
	const linkedJobs = await tx.invoice_job.findMany({
		where: { invoice_id: invoiceId },
		select: { job_id: true },
	});

	for (const { job_id } of linkedJobs) {
		const billedAmount = lineItems
			.filter(
				(li) =>
					li.source_job_id === job_id && li.source_visit_id === null,
			)
			.reduce((sum, li) => sum + Number(li.total), 0);

		await tx.invoice_job.update({
			where: {
				invoice_id_job_id: {
					invoice_id: invoiceId,
					job_id,
				},
			},
			data: { billed_amount: billedAmount },
		});
	}
}

// ============================================================================
// SHARED INCLUDE — used by all reads for consistent shape
// ============================================================================

const invoiceInclude = {
	client: {
		select: {
			id: true,
			name: true,
			address: true,
			is_active: true,
			contacts: {
				where: { is_primary: true },
				include: {
					contact: {
						select: {
							id: true,
							name: true,
							email: true,
							phone: true,
							title: true,
						},
					},
				},
				take: 1,
			},
		},
	},
	created_by_dispatcher: {
		select: { id: true, name: true, email: true },
	},
	line_items: { orderBy: { sort_order: "asc" as const } },
	jobs: {
		include: {
			job: {
				select: {
					id: true,
					job_number: true,
					name: true,
					status: true,
				},
			},
		},
	},
	visits: {
		include: {
			visit: {
				select: {
					id: true,
					scheduled_start_at: true,
					scheduled_end_at: true,
					status: true,
					job: { select: { id: true, job_number: true, name: true } },
				},
			},
		},
	},
	payments: {
		orderBy: { paid_at: "asc" as const },
		include: {
			recorded_by_dispatcher: {
				select: { id: true, name: true },
			},
			recorded_by_tech: {
				select: { id: true, name: true },
			},
		},
	},
	notes: {
		orderBy: { created_at: "desc" as const },
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
	},
	recurring_plan: {
		select: { id: true, name: true, status: true },
	},
} satisfies Prisma.invoiceInclude;

// ============================================================================
// INVOICE CRUD
// ============================================================================

export const getAllInvoices = async () => {
	return await db.invoice.findMany({
		include: invoiceInclude,
		orderBy: { created_at: "desc" },
	});
};

export const getInvoiceById = async (id: string) => {
	return await db.invoice.findUnique({
		where: { id },
		include: invoiceInclude,
	});
};

export const getInvoicesByClientId = async (clientId: string) => {
	return await db.invoice.findMany({
		where: { client_id: clientId },
		include: invoiceInclude,
		orderBy: { created_at: "desc" },
	});
};

export const getInvoicesByJobId = async (jobId: string) => {
	return await db.invoice.findMany({
		where: { jobs: { some: { job_id: jobId } } },
		include: invoiceInclude,
		orderBy: { created_at: "desc" },
	});
};

export const getInvoicesByVisitId = async (visitId: string) => {
	return await db.invoice.findMany({
		where: { visits: { some: { visit_id: visitId } } },
		include: invoiceInclude,
		orderBy: { created_at: "desc" },
	});
};

export const insertInvoice = async (req: Request, context?: UserContext) => {
	try {
		const parsed = createInvoiceSchema.parse(req.body);

		let created: Awaited<ReturnType<typeof db.invoice.findUnique>> | undefined;

		for (let attempt = 0; attempt < 5; attempt++) {
			try {
				created = await db.$transaction(async (tx) => {
					// Validate client exists
					const client = await tx.client.findUnique({
						where: { id: parsed.client_id },
					});
					if (!client) throw new Error("Client not found");

					// Validate recurring plan if provided
					if (parsed.recurring_plan_id) {
						const plan = await tx.recurring_plan.findUnique({
							where: { id: parsed.recurring_plan_id },
						});
						if (!plan) throw new Error("Recurring plan not found");
					}

					// Validate all linked jobs belong to this client
					const allJobIds = [
						...(parsed.job_ids ?? []),
						...(parsed.job_billings?.map((jb) => jb.job_id) ?? []),
					];
					const uniqueJobIds = [...new Set(allJobIds)];

					if (uniqueJobIds.length > 0) {
						const jobs = await tx.job.findMany({
							where: { id: { in: uniqueJobIds } },
							select: { id: true, client_id: true },
						});
						if (jobs.length !== uniqueJobIds.length) {
							throw new Error("One or more jobs not found");
						}
						const wrongClient = jobs.find(
							(j) => j.client_id !== parsed.client_id,
						);
						if (wrongClient) {
							throw new Error(
								"All linked jobs must belong to the same client",
							);
						}
					}

					// Validate all linked visits
					const allVisitIds =
						parsed.visit_billings?.map((vb) => vb.visit_id) ?? [];
					if (allVisitIds.length > 0) {
						const visits = await tx.job_visit.findMany({
							where: { id: { in: allVisitIds } },
							select: {
								id: true,
								job: { select: { client_id: true } },
							},
						});
						if (visits.length !== allVisitIds.length) {
							throw new Error("One or more visits not found");
						}
						const wrongVisitClient = visits.find(
							(v) => v.job.client_id !== parsed.client_id,
						);
						if (wrongVisitClient) {
							throw new Error(
								"All linked visits must belong to the same client",
							);
						}
					}

					// Resolve tax rate via cascade if not explicitly provided
					const taxRate =
						parsed.tax_rate !== undefined
							? parsed.tax_rate
							: await resolveTaxRate(parsed.client_id);

					const invoiceNumber = await generateInvoiceNumber(tx);

					// Calculate due_date from payment_terms_days if due_date not provided
					let dueDate = parsed.due_date;
					if (!dueDate && parsed.payment_terms_days) {
						const base = parsed.issue_date ?? new Date();
						dueDate = new Date(base);
						dueDate.setDate(
							dueDate.getDate() + parsed.payment_terms_days,
						);
					}

					const invoice = await tx.invoice.create({
						data: {
							invoice_number: invoiceNumber,
							client_id: parsed.client_id,
							recurring_plan_id: parsed.recurring_plan_id ?? null,
							status: "Draft",
							issue_date: parsed.issue_date ?? new Date(),
							due_date: dueDate ?? null,
							payment_terms_days:
								parsed.payment_terms_days ?? null,
							subtotal: parsed.subtotal ?? 0,
							tax_rate: taxRate,
							tax_amount: parsed.tax_amount ?? 0,
							discount_type: parsed.discount_type ?? null,
							discount_value: parsed.discount_value ?? null,
							discount_amount: parsed.discount_amount ?? null,
							total: parsed.total ?? 0,
							amount_paid: 0,
							balance_due: parsed.total ?? 0,
							memo: parsed.memo ?? null,
							internal_notes: parsed.internal_notes ?? null,
							created_by_dispatcher_id:
								context?.dispatcherId ?? null,
						},
					});

					// Create line items
					if (parsed.line_items && parsed.line_items.length > 0) {
						await tx.invoice_line_item.createMany({
							data: parsed.line_items.map((item, idx) => ({
								invoice_id: invoice.id,
								name: item.name,
								description: item.description ?? null,
								quantity: item.quantity,
								unit_price: item.unit_price,
								total:
									item.total !== undefined
										? item.total
										: item.quantity * item.unit_price,
								item_type: item.item_type ?? null,
								sort_order: item.sort_order ?? idx,
								source_job_id: item.source_job_id ?? null,
								source_visit_id: item.source_visit_id ?? null,
							})),
						});
					}

					// Link jobs (traceability-only — no billed_amount)
					if (parsed.job_ids && parsed.job_ids.length > 0) {
						const billedJobIds = new Set(
							parsed.job_billings?.map((jb) => jb.job_id) ?? [],
						);
						const tracingOnlyJobIds = parsed.job_ids.filter(
							(id) => !billedJobIds.has(id),
						);
						if (tracingOnlyJobIds.length > 0) {
							await tx.invoice_job.createMany({
								data: tracingOnlyJobIds.map((job_id) => ({
									invoice_id: invoice.id,
									job_id,
									billed_amount: null,
								})),
							});
						}
					}

					// Link jobs with explicit billed_amount
					if (parsed.job_billings && parsed.job_billings.length > 0) {
						await tx.invoice_job.createMany({
							data: parsed.job_billings.map((jb) => ({
								invoice_id: invoice.id,
								job_id: jb.job_id,
								billed_amount: jb.billed_amount,
							})),
						});
					}

					// Link visits with explicit billed_amount
					if (
						parsed.visit_billings &&
						parsed.visit_billings.length > 0
					) {
						await tx.invoice_visit.createMany({
							data: parsed.visit_billings.map((vb) => ({
								invoice_id: invoice.id,
								visit_id: vb.visit_id,
								billed_amount: vb.billed_amount,
							})),
						});
					}

					await tx.client.update({
						where: { id: parsed.client_id },
						data: { last_activity: new Date() },
					});

					return tx.invoice.findUnique({
						where: { id: invoice.id },
						include: invoiceInclude,
					});
				});

				// Transaction committed — log outside so it is never rolled back
				if (created) {
					await logActivity({
						event_type: "invoice.created",
						action: "created",
						entity_type: "invoice",
						entity_id: created.id,
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
		console.error("Insert invoice error:", e);
		return { err: "Internal server error" };
	}
};

export const updateInvoice = async (req: Request, context?: UserContext) => {
	try {
		const id = req.params.id as string;
		const parsed = updateInvoiceSchema.parse(req.body);

		const existing = await db.invoice.findUnique({
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

		const updated = await db.$transaction(async (tx) => {
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
				await syncBilledAmounts(id, tx);
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
					...(parsed.status === "Sent" &&
						!existing.sent_at && { sent_at: new Date() }),
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
				actor_type: context?.dispatcherId
					? "dispatcher"
					: context?.techId
						? "technician"
						: "system",
				actor_id: context?.dispatcherId ?? context?.techId,
				changes,
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
		console.error("Update invoice error:", e);
		return { err: "Internal server error" };
	}
};

export const deleteInvoice = async (id: string, context?: UserContext) => {
	try {
		const existing = await db.invoice.findUnique({ where: { id } });
		if (!existing) return { err: "Invoice not found" };

		if (existing.status !== "Draft") {
			return {
				err: "Only Draft invoices can be deleted. Void the invoice instead.",
			};
		}

		await db.invoice.delete({ where: { id } });

		await logActivity({
			event_type: "invoice.deleted",
			action: "deleted",
			entity_type: "invoice",
			entity_id: id,
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
		console.error("Delete invoice error:", e);
		return { err: "Internal server error" };
	}
};

// ============================================================================
// PAYMENTS
// ============================================================================

export const getInvoicePayments = async (invoiceId: string) => {
	return await db.invoice_payment.findMany({
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
	context?: UserContext,
) => {
	try {
		const parsed = createInvoicePaymentSchema.parse(data);

		const invoice = await db.invoice.findUnique({
			where: { id: invoiceId },
		});
		if (!invoice) return { err: "Invoice not found" };

		if (invoice.status === "Void") {
			return { err: "Cannot record payment on a void invoice" };
		}

		const created = await db.$transaction(async (tx) => {
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

			await syncInvoicePaymentTotals(invoiceId, tx);

			return payment;
		});

		await logActivity({
			event_type: "invoice_payment.created",
			action: "created",
			entity_type: "invoice_payment",
			entity_id: created.id,
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
		console.error("Insert invoice payment error:", e);
		return { err: "Internal server error" };
	}
};

export const deleteInvoicePayment = async (
	invoiceId: string,
	paymentId: string,
	context?: UserContext,
) => {
	try {
		const existing = await db.invoice_payment.findFirst({
			where: { id: paymentId, invoice_id: invoiceId },
		});
		if (!existing) return { err: "Payment not found" };

		const invoice = await db.invoice.findUnique({
			where: { id: invoiceId },
		});
		if (invoice?.status === "Void") {
			return { err: "Cannot modify payments on a void invoice" };
		}

		await db.$transaction(async (tx) => {
			await tx.invoice_payment.delete({ where: { id: paymentId } });
			await syncInvoicePaymentTotals(invoiceId, tx);
		});

		await logActivity({
			event_type: "invoice_payment.deleted",
			action: "deleted",
			entity_type: "invoice_payment",
			entity_id: paymentId,
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
		console.error("Delete invoice payment error:", e);
		return { err: "Internal server error" };
	}
};

// ============================================================================
// NOTES
// ============================================================================

export const getInvoiceNotes = async (invoiceId: string) => {
	return await db.invoice_note.findMany({
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
	context?: UserContext,
) => {
	try {
		const parsed = createInvoiceNoteSchema.parse(data);

		const invoice = await db.invoice.findUnique({
			where: { id: invoiceId },
		});
		if (!invoice) return { err: "Invoice not found" };

		const created = await db.invoice_note.create({
			data: {
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
		console.error("Insert invoice note error:", e);
		return { err: "Internal server error" };
	}
};

export const updateInvoiceNote = async (
	invoiceId: string,
	noteId: string,
	data: unknown,
	context?: UserContext,
) => {
	try {
		const parsed = updateInvoiceNoteSchema.parse(data);

		const existing = await db.invoice_note.findFirst({
			where: { id: noteId, invoice_id: invoiceId },
		});
		if (!existing) return { err: "Note not found" };

		const updated = await db.invoice_note.update({
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
		console.error("Update invoice note error:", e);
		return { err: "Internal server error" };
	}
};

export const deleteInvoiceNote = async (
	invoiceId: string,
	noteId: string,
	context?: UserContext,
) => {
	try {
		const existing = await db.invoice_note.findFirst({
			where: { id: noteId, invoice_id: invoiceId },
		});
		if (!existing) return { err: "Note not found" };

		await db.invoice_note.delete({ where: { id: noteId } });

		await logActivity({
			event_type: "invoice_note.deleted",
			action: "deleted",
			entity_type: "invoice_note",
			entity_id: noteId,
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
		console.error("Delete invoice note error:", e);
		return { err: "Internal server error" };
	}
};