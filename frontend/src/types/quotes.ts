import z from "zod";
import type { ClientWithPrimaryContact } from "./clients";
import type { Coordinates } from "./location";
import type {
	Priority,
	BaseNote,
	RequestReference,
	JobReference,
	DispatcherReference,
	LineItemType,
	DiscountType,
} from "./common";
import { PriorityValues, PriorityLabels, PriorityColors } from "./common";

// ============================================================================
// QUOTE-SPECIFIC TYPES
// ============================================================================

export const QuoteStatusValues = [
	"Draft",
	"Sent",
	"Viewed",
	"Approved",
	"Rejected",
	"Revised",
	"Expired",
	"Cancelled",
] as const;

export type QuoteStatus = (typeof QuoteStatusValues)[number];

export type QuotePriority = Priority;
export const QuotePriorityValues = PriorityValues;
export const QuotePriorityLabels = PriorityLabels;
export const QuotePriorityColors = PriorityColors;

export const QuoteStatusLabels: Record<QuoteStatus, string> = {
	Draft: "Draft",
	Sent: "Sent",
	Viewed: "Viewed",
	Approved: "Approved",
	Rejected: "Rejected",
	Revised: "Revised",
	Expired: "Expired",
	Cancelled: "Cancelled",
};

export const QuoteStatusColors: Record<QuoteStatus, string> = {
	Draft: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
	Sent: "bg-blue-500/20 text-blue-400 border-blue-500/30",
	Viewed: "bg-purple-500/20 text-purple-400 border-purple-500/30",
	Approved: "bg-green-500/20 text-green-400 border-green-500/30",
	Rejected: "bg-red-500/20 text-red-400 border-red-500/30",
	Revised: "bg-amber-500/20 text-amber-400 border-amber-500/30",
	Expired: "bg-orange-500/20 text-orange-400 border-orange-500/30",
	Cancelled: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
};

// ============================================================================
// QUOTE SUMMARY TYPES (for listings and references)
// ============================================================================

export interface QuoteSummary {
	id: string;
	quote_number: string;
	title: string;
	status: QuoteStatus;
	total: number;
	created_at: Date;
	is_active: boolean;
}

export interface QuoteVersionReference {
	id: string;
	quote_number: string;
	version: number;
}

// ============================================================================
// QUOTE TYPES
// ============================================================================

export interface Quote {
	id: string;
	quote_number: string;
	client_id: string;
	request_id: string | null;
	title: string;
	description: string;
	status: QuoteStatus;
	address: string;
	coords: Coordinates | null;
	priority: QuotePriority;
	is_active: boolean;
	version: number;
	previous_quote_id: string | null;

	subtotal: number;
	tax_rate: number;
	tax_amount: number;
	discount_type?: DiscountType | null;
	discount_value?: number | null;
	discount_amount: number;
	total: number;

	// Timestamps
	created_at: Date;
	updated_at: Date;
	sent_at: Date | null;
	viewed_at: Date | null;
	approved_at: Date | null;
	rejected_at: Date | null;
	valid_until: Date | null;
	expires_at: Date | null;

	rejection_reason: string | null;
	created_by_dispatcher_id: string | null;

	client?: ClientWithPrimaryContact;
	request?: RequestReference | null;
	line_items?: QuoteLineItem[];
	notes?: QuoteNote[];
	job?: JobReference | null;
	previous_quote?: QuoteVersionReference | null;
	revised_quote?: QuoteVersionReference | null;
	created_by_dispatcher?: DispatcherReference | null;
}

export interface CreateQuoteInput {
	client_id: string;
	request_id?: string;
	title?: string;
	description?: string;
	address?: string;
	coords?: Coordinates;
	priority: QuotePriority;
	status?: QuoteStatus;
	subtotal?: number;
	tax_rate?: number;
	tax_amount?: number;
	discount_type?: DiscountType;
	discount_value?: number;
	discount_amount?: number;
	total?: number;
	valid_until?: Date | string;
	expires_at?: Date | string;
	created_by_dispatcher_id?: string;
	line_items?: CreateQuoteLineItemInput[];
}

export interface UpdateQuoteInput {
	title?: string;
	description?: string;
	address?: string;
	coords?: Coordinates;
	priority?: QuotePriority;
	status?: QuoteStatus;
	subtotal?: number;
	tax_rate?: number;
	tax_amount?: number;
	discount_type?: DiscountType;
	discount_value?: number;
	discount_amount?: number;
	total?: number;
	valid_until?: Date | string | null;
	expires_at?: Date | string | null;
	rejection_reason?: string | null;
	is_active?: boolean;
}

export const CreateQuoteSchema = z.object({
	client_id: z.string().uuid("Invalid client ID"),
	request_id: z.string().uuid().optional(),
	title: z.string().min(1, "Title is required"),
	description: z.string().min(1, "Description is required"),
	address: z.string().min(1, "Address is required"),
	priority: z.enum(PriorityValues).default("Medium"),
	status: z.enum(QuoteStatusValues).default("Draft"),
	subtotal: z.number().min(0, "Subtotal must be positive"),
	tax_rate: z.number().min(0).max(1).optional(),
	tax_amount: z.number().min(0).optional(),
	discount_amount: z.number().min(0).optional(),
	total: z.number().min(0, "Total must be positive"),
	valid_until: z.coerce.date().optional(),
	expires_at: z.coerce.date().optional(),
	created_by_dispatcher_id: z.string().uuid().optional(),
});

export const UpdateQuoteSchema = z.object({
	title: z.string().min(1).optional(),
	description: z.string().min(1).optional(),
	address: z.string().min(1).optional(),
	priority: z.enum(PriorityValues).optional(),
	status: z.enum(QuoteStatusValues).optional(),
	subtotal: z.number().min(0).optional(),
	tax_rate: z.number().min(0).max(1).optional(),
	tax_amount: z.number().min(0).optional(),
	discount_amount: z.number().min(0).optional(),
	total: z.number().min(0).optional(),
	valid_until: z.coerce.date().optional().nullable(),
	expires_at: z.coerce.date().optional().nullable(),
	rejection_reason: z.string().optional().nullable(),
	is_active: z.boolean().optional(),
});

// ============================================================================
// LINE ITEM TYPES
// ============================================================================

export interface QuoteLineItem {
	id: string;
	quote_id: string;
	name: string;
	description: string | null;
	quantity: number;
	unit_price: number;
	total: number;
	item_type: LineItemType | null;
	sort_order: number;
}

export interface CreateQuoteLineItemInput {
	name: string;
	description?: string;
	quantity: number;
	unit_price: number;
	total: number;
	item_type?: LineItemType;
	sort_order?: number;
}

export interface UpdateQuoteLineItemInput {
	name?: string;
	description?: string | null;
	quantity?: number;
	unit_price?: number;
	total?: number;
	item_type?: LineItemType | null;
	sort_order?: number;
}

// ============================================================================
// QUOTE NOTES
// ============================================================================

export interface QuoteNote extends BaseNote {
	quote_id: string;
}

export interface CreateQuoteNoteInput {
	content: string;
}

export interface UpdateQuoteNoteInput {
	content: string;
}

export const CreateQuoteNoteSchema = z.object({
	content: z.string().min(1, "Note content is required"),
});

export const UpdateQuoteNoteSchema = z.object({
	content: z.string().min(1, "Note content is required"),
});

// ============================================================================
// QUOTE STATISTICS
// ============================================================================

export interface QuoteStatistics {
	total_quotes: number;
	draft_quotes: number;
	pending_quotes: number;
	sent_quotes: number;
	approved_quotes: number;
	rejected_quotes: number;
	expired_quotes: number;
	total_value: number;
	approved_value: number;
	pending_value: number;
}
