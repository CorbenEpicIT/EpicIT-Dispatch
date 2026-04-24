import z from "zod";

// ============================================================================
// ENUMS (mirrors schema exactly)
// ============================================================================

const invoiceStatusEnum = z.enum([
	"Draft",
	"Issued",
	"Sent",
	"Viewed",
	"PartiallyPaid",
	"Paid",
	"Disputed",
	"Void",
]);

const discountTypeEnum = z.enum(["percent", "amount"]);

const lineItemTypeEnum = z.enum(["labor", "material", "equipment", "other"]);

// ============================================================================
// LINE ITEM (reusable sub-schema)
// ============================================================================

const invoiceLineItemInputSchema = z.object({
	name: z.string().min(1, "Item name is required"),
	description: z.string().optional().nullable(),
	quantity: z.number().positive("Quantity must be positive"),
	unit_price: z.number().min(0, "Unit price must be non-negative"),
	total: z.number().min(0, "Total must be non-negative").optional(),
	item_type: lineItemTypeEnum.optional().nullable(),
	sort_order: z.number().int().optional(),
	// Soft traceability — informational only
	source_job_id: z.string().uuid().optional().nullable(),
	source_visit_id: z.string().uuid().optional().nullable(),
});

// ============================================================================
// CREATE INVOICE
// ============================================================================

export const createInvoiceSchema = z
	.object({
		client_id: z.string().uuid("Invalid client ID"),

		// Optional linkage
		recurring_plan_id: z.string().uuid().optional().nullable(),

		// Dates
		issue_date: z.coerce.date().optional(),
		due_date: z.coerce.date().optional().nullable(),
		payment_terms_days: z.number().int().min(0).optional().nullable(),

		// Financials
		subtotal: z.number().min(0).optional(),
		tax_rate: z.number().min(0).max(1).optional(),
		tax_amount: z.number().min(0).optional(),
		discount_type: discountTypeEnum.optional().nullable(),
		discount_value: z.number().min(0).optional().nullable(),
		discount_amount: z.number().min(0).optional().nullable(),
		total: z.number().min(0).optional(),

		// Content
		memo: z.string().optional().nullable(),
		internal_notes: z.string().optional().nullable(),

		// Line items (snapshot at creation time)
		line_items: z.array(invoiceLineItemInputSchema).optional(),

		// Job / visit linkage
		// job_ids: jobs linked to this invoice for traceability
		// visit_billings: visits with explicit billed_amount for per-visit billing
		// job_billings: jobs with explicit billed_amount for flat-rate job billing
		job_ids: z.array(z.string().uuid()).optional(),
		visit_billings: z
			.array(
				z.object({
					visit_id: z.string().uuid("Invalid visit ID"),
					billed_amount: z
						.number()
						.min(0, "Billed amount must be non-negative"),
				}),
			)
			.optional(),
		job_billings: z
			.array(
				z.object({
					job_id: z.string().uuid("Invalid job ID"),
					billed_amount: z
						.number()
						.min(0, "Billed amount must be non-negative"),
				}),
			)
			.optional(),
	})
	.transform((data) => ({
		...data,
		recurring_plan_id: data.recurring_plan_id ?? undefined,
		due_date: data.due_date ?? undefined,
		payment_terms_days: data.payment_terms_days ?? undefined,
		subtotal: data.subtotal ?? undefined,
		tax_rate: data.tax_rate ?? undefined,
		tax_amount: data.tax_amount ?? undefined,
		discount_type: data.discount_type ?? undefined,
		discount_value: data.discount_value ?? undefined,
		discount_amount: data.discount_amount ?? undefined,
		total: data.total ?? undefined,
		memo: data.memo ?? undefined,
		internal_notes: data.internal_notes ?? undefined,
		line_items: data.line_items ?? undefined,
		job_ids: data.job_ids ?? undefined,
		visit_billings: data.visit_billings ?? undefined,
		job_billings: data.job_billings ?? undefined,
	}));

// ============================================================================
// UPDATE INVOICE
// ============================================================================

export const updateInvoiceSchema = z
	.object({
		status: invoiceStatusEnum.optional(),

		// Dates
		issue_date: z.coerce.date().optional(),
		due_date: z.coerce.date().optional().nullable(),
		payment_terms_days: z.number().int().min(0).optional().nullable(),
		sent_at: z.coerce.date().optional().nullable(),
		viewed_at: z.coerce.date().optional().nullable(),

		// Financials
		subtotal: z.number().min(0).optional(),
		tax_rate: z.number().min(0).max(1).optional(),
		tax_amount: z.number().min(0).optional(),
		discount_type: discountTypeEnum.optional().nullable(),
		discount_value: z.number().min(0).optional().nullable(),
		discount_amount: z.number().min(0).optional().nullable(),
		total: z.number().min(0).optional(),

		// Content
		memo: z.string().optional().nullable(),
		internal_notes: z.string().optional().nullable(),
		void_reason: z.string().optional().nullable(),

		// Line items — full replacement array (same pattern as job update)
		line_items: z
			.array(
				invoiceLineItemInputSchema.extend({
					id: z.string().uuid().optional(), // undefined = create new
				}),
			)
			.optional(),
	})
	;

// ============================================================================
// PAYMENT
// ============================================================================

export const createInvoicePaymentSchema = z
	.object({
		amount: z.number().positive("Payment amount must be positive"),
		paid_at: z.coerce.date().optional(),
		method: z
			.enum(["cash", "check", "card", "bank_transfer", "other"])
			.optional()
			.nullable(),
		note: z.string().optional().nullable(),
	})
	.transform((data) => ({
		...data,
		paid_at: data.paid_at ?? undefined,
		method: data.method ?? undefined,
		note: data.note ?? undefined,
	}));

// ============================================================================
// NOTE
// ============================================================================

export const createInvoiceNoteSchema = z.object({
	content: z.string().min(1, "Content is required"),
});

export const updateInvoiceNoteSchema = z.object({
	content: z.string().min(1, "Content is required").optional(),
});

// ============================================================================
// TYPES
// ============================================================================

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;
export type CreateInvoicePaymentInput = z.infer<
	typeof createInvoicePaymentSchema
>;
export type CreateInvoiceNoteInput = z.infer<typeof createInvoiceNoteSchema>;
export type UpdateInvoiceNoteInput = z.infer<typeof updateInvoiceNoteSchema>;
