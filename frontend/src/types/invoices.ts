import type { ClientDetailsProps } from "../components/clients/ClientDetailsCard";
import type { BaseNote, TechReference, DispatcherReference, PricingBreakdown } from "./common";

// ============================================================================
// INVOICE STATUS
// ============================================================================

export const InvoiceStatusValues = [
	"Draft",
	"Issued",
	"Sent",
	"Viewed",
	"PartiallyPaid",
	"Paid",
	"Disputed",
	"Void",
] as const;

export type InvoiceStatus = (typeof InvoiceStatusValues)[number];

export const InvoiceStatusLabels: Record<InvoiceStatus, string> = {
	Draft: "Draft",
	Issued: "Issued",
	Sent: "Sent",
	Viewed: "Viewed",
	PartiallyPaid: "Partially Paid",
	Paid: "Paid",
	Disputed: "Disputed",
	Void: "Void",
};

export const InvoiceStatusColors: Record<InvoiceStatus, string> = {
	Draft:        "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
	Issued:       "bg-blue-500/20 text-blue-400 border-blue-500/30",
	Sent:         "bg-green-500/20 text-green-400 border-green-500/30",
	Viewed:       "bg-teal-500/20 text-teal-400 border-teal-500/30",
	PartiallyPaid:"bg-amber-500/20 text-amber-400 border-amber-500/30",
	Paid:         "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
	Disputed:     "bg-orange-500/20 text-orange-400 border-orange-500/30",
	Void:         "bg-red-500/20 text-red-400 border-red-500/30",
};

// Which statuses are auto-set by the system vs manually set by staff
export const AutoSetStatuses: InvoiceStatus[] = ["Issued", "PartiallyPaid", "Paid"];
export const ManualOnlyStatuses: InvoiceStatus[] = ["Disputed", "Void"];

// ============================================================================
// PAYMENT METHOD
// ============================================================================

export const PaymentMethodValues = ["cash", "check", "card", "bank_transfer", "other"] as const;

export type PaymentMethod = (typeof PaymentMethodValues)[number];

export const PaymentMethodLabels: Record<PaymentMethod, string> = {
	cash: "Cash",
	check: "Check",
	card: "Card",
	bank_transfer: "Bank Transfer",
	other: "Other",
};

// ============================================================================
// LIGHTWEIGHT REFERENCE TYPES
// ============================================================================

export interface InvoiceReference {
	id: string;
	invoice_number: string;
	status: InvoiceStatus;
	total: number;
	balance_due: number;
	issue_date: Date | string | null;
}

export interface JobReference {
	id: string;
	job_number: string;
	name: string;
	status: string;
}

export interface VisitReference {
	id: string;
	scheduled_start_at: Date | string;
	scheduled_end_at: Date | string;
	status: string;
	job: JobReference;
}

export interface RecurringPlanReference {
	id: string;
	name: string;
	status: string;
}

// ============================================================================
// LINE ITEMS
// ============================================================================

export interface InvoiceLineItem {
	id: string;
	invoice_id: string;
	name: string;
	description?: string | null;
	quantity: number;
	unit_price: number;
	total: number;
	item_type?: string | null;
	sort_order: number;
	// Soft traceability
	source_job_id?: string | null;
	source_visit_id?: string | null;
}

export interface CreateInvoiceLineItemInput {
	name: string;
	description?: string | null;
	quantity: number;
	unit_price: number;
	total?: number;
	item_type?: string | null;
	sort_order?: number;
	source_job_id?: string | null;
	source_visit_id?: string | null;
}

export interface UpdateInvoiceLineItemInput extends CreateInvoiceLineItemInput {
	id?: string; // undefined = create new
}

// ============================================================================
// PAYMENT
// ============================================================================

export interface InvoicePayment {
	id: string;
	invoice_id: string;
	amount: number;
	paid_at: Date | string;
	method?: PaymentMethod | null;
	note?: string | null;
	created_at: Date | string;
	recorded_by_dispatcher_id?: string | null;
	recorded_by_tech_id?: string | null;
	recorded_by_dispatcher?: { id: string; name: string } | null;
	recorded_by_tech?: { id: string; name: string } | null;
}

export interface CreateInvoicePaymentInput {
	amount: number;
	paid_at?: Date | string;
	method?: PaymentMethod | null;
	note?: string | null;
}

// ============================================================================
// NOTE
// ============================================================================

export interface InvoiceNote extends BaseNote {
	invoice_id: string;
}

export interface CreateInvoiceNoteInput {
	content: string;
}

export interface UpdateInvoiceNoteInput {
	content: string;
}

// ============================================================================
// JOB / VISIT BILLING LINKAGE
// ============================================================================

/** Job linked to an invoice. billed_amount null = traceability only. */
export interface InvoiceJob {
	invoice_id: string;
	job_id: string;
	billed_amount?: number | null;
	job: JobReference;
}

/** Visit linked to an invoice with explicit billed amount. */
export interface InvoiceVisit {
	invoice_id: string;
	visit_id: string;
	billed_amount: number;
	visit: VisitReference;
}

// ============================================================================
// MAIN INVOICE TYPE
// ============================================================================

export interface Invoice extends PricingBreakdown {
	id: string;
	invoice_number: string;
	client_id: string;
	status: InvoiceStatus;

	// Dates
	issue_date: Date | string | null;
	due_date?: Date | string | null;
	payment_terms_days?: number | null;
	issued_at?: Date | string | null;
	sent_at?: Date | string | null;
	viewed_at?: Date | string | null;
	paid_at?: Date | string | null;
	voided_at?: Date | string | null;

	// Payment totals (cached, backend-managed)
	amount_paid: number;
	balance_due: number;

	// Content
	memo?: string | null;
	internal_notes?: string | null;
	void_reason?: string | null;

	created_at: Date | string;
	updated_at: Date | string;
	created_by_dispatcher_id?: string | null;

	// Relations
	client?: (ClientDetailsProps["client"] & { id: string }) | null;
	created_by_dispatcher?: { id: string; name: string; email: string } | null;
	recurring_plan?: RecurringPlanReference | null;
	recurring_plan_id?: string | null;
	line_items?: InvoiceLineItem[];
	jobs?: InvoiceJob[];
	visits?: InvoiceVisit[];
	payments?: InvoicePayment[];
	notes?: InvoiceNote[];
}

// ============================================================================
// CREATE / UPDATE INPUTS
// ============================================================================

export interface CreateInvoiceInput extends PricingBreakdown {
	client_id: string;
	recurring_plan_id?: string | null;

	issue_date?: Date | string;
	due_date?: Date | string | null;
	payment_terms_days?: number | null;

	memo?: string | null;
	internal_notes?: string | null;

	line_items?: CreateInvoiceLineItemInput[];

	// Job linkage
	job_ids?: string[];
	job_billings?: Array<{ job_id: string; billed_amount: number }>;
	visit_billings?: Array<{ visit_id: string; billed_amount: number }>;
}

export interface UpdateInvoiceInput extends Partial<PricingBreakdown> {
	status?: InvoiceStatus;
	issue_date?: Date | string;
	due_date?: Date | string | null;
	payment_terms_days?: number | null;
	sent_at?: Date | string | null;
	viewed_at?: Date | string | null;
	memo?: string | null;
	internal_notes?: string | null;
	void_reason?: string | null;
	line_items?: UpdateInvoiceLineItemInput[];
}

// ============================================================================
// DERIVED / UTILITY TYPES
// ============================================================================

/** Summary shape used in lists / references — subset of full Invoice */
export interface InvoiceSummary {
	id: string;
	invoice_number: string;
	client_id: string;
	status: InvoiceStatus;
	total: number | null;
	amount_paid: number;
	balance_due: number;
	issue_date: Date | string | null;
	due_date?: Date | string | null;
}

export function isOverdue(invoice: Pick<Invoice, "status" | "due_date">): boolean {
	if (invoice.status === "Paid" || invoice.status === "Void") return false;
	if (!invoice.due_date) return false;
	return new Date(invoice.due_date) < new Date();
}

export function isEditable(status: InvoiceStatus): boolean {
	// Only Draft is editable; Issued and beyond are finalized
	return status === "Draft";
}

export function isDeletable(status: InvoiceStatus): boolean {
	return status === "Draft";
}

export function canRecordPayment(status: InvoiceStatus): boolean {
	return status !== "Void" && status !== "Paid";
}

export function getPaymentProgress(invoice: Pick<Invoice, "total" | "amount_paid">): number {
	const total = invoice.total ?? 0;
	if (total <= 0) return 0;
	return Math.min(1, invoice.amount_paid / total);
}
