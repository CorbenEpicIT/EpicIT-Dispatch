import { getScopedDb } from "../lib/context.js";
import { Prisma } from "../../generated/prisma/client.js";

// ============================================================================
// TYPES
// ============================================================================

export interface CreateInvoicePayload {
	client_id: string;
	recurring_plan_id?: string | null;
	issue_date?: Date | string | null;
	due_date?: Date | string | null;
	payment_terms_days?: number | null;
	subtotal?: number;
	tax_rate?: number;
	tax_amount?: number;             // advisory — service always recomputes
	discount_type?: "percent" | "amount" | null;
	discount_value?: number | null;
	discount_amount?: number | null; // advisory — service always recomputes
	total?: number;                  // advisory — service always recomputes
	memo?: string | null;
	internal_notes?: string | null;
	line_items?: Array<{
		name: string;
		description?: string | null;
		quantity: number;
		unit_price: number;
		total?: number;
		item_type?: "labor" | "material" | "equipment" | "other" | null;
		sort_order?: number;
		source_job_id?: string | null;
		source_visit_id?: string | null;
	}>;
	job_ids?: string[];
	job_billings?: Array<{ job_id: string; billed_amount: number }>;
	visit_billings?: Array<{ visit_id: string; billed_amount: number }>;
}

// ============================================================================
// SHARED INCLUDE — exported so controller and other read paths can reuse
// ============================================================================

export const invoiceInclude = {
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
// PRIVATE HELPERS
// ============================================================================

async function generateInvoiceNumber(
	tx: Prisma.TransactionClient,
	organizationId: string,
): Promise<string> {
	const last = await tx.invoice.findFirst({
		where: {
			organization_id: organizationId,
			invoice_number: { startsWith: "INV-" },
		},
		orderBy: { invoice_number: "desc" },
	});

	let next = 1;
	if (last) {
		const match = last.invoice_number.match(/INV-(\d+)/);
		if (match) next = parseInt(match[1]) + 1;
	}

	return `INV-${next.toString().padStart(6, "0")}`;
}

async function resolveTaxRate(
	clientId: string,
	organizationId: string,
	tx: Prisma.TransactionClient,
): Promise<number> {
	const client = await tx.client.findFirst({
		where: { id: clientId, organization_id: organizationId },
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

// ============================================================================
// EXPORTED HELPERS — used by invoicesController
// ============================================================================

/** Recalculate amount_paid, balance_due, and status after any payment change. */
export async function syncInvoicePaymentTotals(
	invoiceId: string,
	tx: Prisma.TransactionClient,
): Promise<void> {
	const [invoice, payments] = await Promise.all([
		tx.invoice.findFirst({
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
	// Draft/Issued/Sent/Viewed are preserved when payments are removed.
	let status = invoice.status;
	if (status !== "Disputed" && status !== "Void") {
		if (amountPaid <= 0) {
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
 */
export async function syncBilledAmounts(
	invoiceId: string,
	tx: Prisma.TransactionClient,
): Promise<void> {
	const lineItems = await tx.invoice_line_item.findMany({
		where: { invoice_id: invoiceId },
		select: {
			total: true,
			source_job_id: true,
			source_visit_id: true,
		},
	});

	const linkedVisits = await tx.invoice_visit.findMany({
		where: { invoice_id: invoiceId },
		select: { visit_id: true },
	});

	for (const { visit_id } of linkedVisits) {
		const billedAmount = lineItems
			.filter((li) => li.source_visit_id === visit_id)
			.reduce((sum, li) => sum + Number(li.total), 0);

		await tx.invoice_visit.update({
			where: { invoice_id_visit_id: { invoice_id: invoiceId, visit_id } },
			data: { billed_amount: billedAmount },
		});
	}

	const linkedJobs = await tx.invoice_job.findMany({
		where: { invoice_id: invoiceId },
		select: { job_id: true },
	});

	for (const { job_id } of linkedJobs) {
		const billedAmount = lineItems
			.filter(
				(li) => li.source_job_id === job_id && li.source_visit_id === null,
			)
			.reduce((sum, li) => sum + Number(li.total), 0);

		await tx.invoice_job.update({
			where: { invoice_id_job_id: { invoice_id: invoiceId, job_id } },
			data: { billed_amount: billedAmount },
		});
	}
}

// ============================================================================
// MAIN: createInvoiceRecord
// ============================================================================

export async function createInvoiceRecord(
	payload: CreateInvoicePayload,
	organizationId: string,
	createdByDispatcherId?: string | null,
	existingTx?: Prisma.TransactionClient,
) {
	const doWork = async (tx: Prisma.TransactionClient) => {
		// Validate client exists and belongs to this org
		const client = await tx.client.findFirst({
			where: { id: payload.client_id, organization_id: organizationId },
		});
		if (!client) throw new Error("Client not found");

		// Validate recurring plan if provided
		if (payload.recurring_plan_id) {
			const plan = await tx.recurring_plan.findFirst({
				where: { id: payload.recurring_plan_id, organization_id: organizationId },
			});
			if (!plan) throw new Error("Recurring plan not found");
		}

		// Validate all linked jobs belong to this client and org
		const allJobIds = [
			...(payload.job_ids ?? []),
			...(payload.job_billings?.map((jb) => jb.job_id) ?? []),
		];
		const uniqueJobIds = [...new Set(allJobIds)];

		if (uniqueJobIds.length > 0) {
			const jobs = await tx.job.findMany({
				where: { id: { in: uniqueJobIds }, organization_id: organizationId },
				select: { id: true, client_id: true },
			});
			if (jobs.length !== uniqueJobIds.length) {
				throw new Error("One or more jobs not found");
			}
			const wrongClient = jobs.find((j) => j.client_id !== payload.client_id);
			if (wrongClient) {
				throw new Error("All linked jobs must belong to the same client");
			}
		}

		// Validate all linked visits belong to this org (via parent job)
		const allVisitIds = payload.visit_billings?.map((vb) => vb.visit_id) ?? [];
		if (allVisitIds.length > 0) {
			const visits = await tx.job_visit.findMany({
				where: {
					id: { in: allVisitIds },
					job: { organization_id: organizationId },
				},
				select: {
					id: true,
					job: { select: { client_id: true } },
				},
			});
			if (visits.length !== allVisitIds.length) {
				throw new Error("One or more visits not found");
			}
			const wrongVisitClient = visits.find(
				(v) => v.job.client_id !== payload.client_id,
			);
			if (wrongVisitClient) {
				throw new Error("All linked visits must belong to the same client");
			}
		}

		// Resolve tax rate — use payload.tax_rate if explicitly provided, else cascade
		const taxRate =
			payload.tax_rate !== undefined
				? payload.tax_rate
				: await resolveTaxRate(payload.client_id, organizationId, tx);

		// Server always recomputes financial totals from source values
		const subtotal = payload.subtotal ?? 0;
		let discountAmount = 0;
		if (payload.discount_type === "percent" && payload.discount_value != null) {
			discountAmount = (subtotal * payload.discount_value) / 100;
		} else if (payload.discount_type === "amount" && payload.discount_value != null) {
			discountAmount = payload.discount_value;
		}
		// Clamp: discount cannot exceed subtotal or go negative
		discountAmount = Math.min(Math.max(0, discountAmount), Math.max(0, subtotal));
		const taxable = subtotal - discountAmount;
		const taxAmount = Math.round(taxable * (taxRate / 100) * 100) / 100;
		const total = Math.round((taxable + taxAmount) * 100) / 100;

		const invoiceNumber = await generateInvoiceNumber(tx, organizationId);

		// Calculate due_date from payment_terms_days if due_date not provided
		let dueDate = payload.due_date;
		if (!dueDate && payload.payment_terms_days) {
			const base = payload.issue_date ?? new Date();
			dueDate = new Date(base);
			dueDate.setDate(dueDate.getDate() + payload.payment_terms_days);
		}

		const invoice = await tx.invoice.create({
			data: {
				organization_id: organizationId,
				invoice_number: invoiceNumber,
				client_id: payload.client_id,
				recurring_plan_id: payload.recurring_plan_id ?? null,
				status: "Draft",
				...(payload.issue_date !== undefined && { issue_date: payload.issue_date }),
				due_date: dueDate ?? null,
				payment_terms_days: payload.payment_terms_days ?? null,
				subtotal,
				tax_rate: taxRate,
				tax_amount: taxAmount,
				discount_type: payload.discount_type ?? null,
				discount_value: payload.discount_value ?? null,
				discount_amount: discountAmount,
				total,
				amount_paid: 0,
				balance_due: total,
				memo: payload.memo ?? null,
				internal_notes: payload.internal_notes ?? null,
				created_by_dispatcher_id: createdByDispatcherId ?? null,
			},
		});

		// Create line items
		if (payload.line_items && payload.line_items.length > 0) {
			await tx.invoice_line_item.createMany({
				data: payload.line_items.map((item, idx) => ({
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
		if (payload.job_ids && payload.job_ids.length > 0) {
			const billedJobIds = new Set(
				payload.job_billings?.map((jb) => jb.job_id) ?? [],
			);
			const tracingOnlyJobIds = payload.job_ids.filter(
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
		if (payload.job_billings && payload.job_billings.length > 0) {
			await tx.invoice_job.createMany({
				data: payload.job_billings.map((jb) => ({
					invoice_id: invoice.id,
					job_id: jb.job_id,
					billed_amount: jb.billed_amount,
				})),
			});
		}

		// Link visits with explicit billed_amount
		if (payload.visit_billings && payload.visit_billings.length > 0) {
			await tx.invoice_visit.createMany({
				data: payload.visit_billings.map((vb) => ({
					invoice_id: invoice.id,
					visit_id: vb.visit_id,
					billed_amount: vb.billed_amount,
				})),
			});
		}

		await tx.client.update({
			where: { id: payload.client_id },
			data: { last_activity: new Date() },
		});

		const created = await tx.invoice.findFirst({
			where: { id: invoice.id },
			include: invoiceInclude,
		});
		if (!created) throw new Error("Invoice not found after creation");
		return created;
	};

	if (existingTx) return doWork(existingTx);
	const sdb = getScopedDb(organizationId);
	// Prisma $extends changes the tx callback type; cast is safe — runtime methods are identical
	return sdb.$transaction((tx) => doWork(tx as unknown as Prisma.TransactionClient));
}
