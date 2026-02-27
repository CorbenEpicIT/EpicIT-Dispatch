import z from "zod";
import type { Coordinates } from "./location";
import type { ClientWithPrimaryContact } from "./clients";
import type { Priority, BaseNote, QuoteReference, JobReference } from "./common";
import { PriorityValues, PriorityLabels, PriorityColors } from "./common";

// ============================================================================
// REQUEST-SPECIFIC TYPES
// ============================================================================

export const RequestStatusValues = [
	"New",
	"Reviewing",
	"NeedsQuote",
	"Quoted",
	"QuoteApproved",
	"QuoteRejected",
	"ConvertedToJob",
	"Cancelled",
] as const;

export type RequestStatus = (typeof RequestStatusValues)[number];

export type RequestPriority = Priority;
export const RequestPriorityValues = PriorityValues;
export const RequestPriorityLabels = PriorityLabels;
export const RequestPriorityColors = PriorityColors;

export const RequestStatusLabels: Record<RequestStatus, string> = {
	New: "New",
	Reviewing: "Reviewing",
	NeedsQuote: "Needs Quote",
	Quoted: "Quoted",
	QuoteApproved: "Quote Approved",
	QuoteRejected: "Quote Rejected",
	ConvertedToJob: "Converted to Job",
	Cancelled: "Cancelled",
};

export const RequestStatusColors: Record<RequestStatus, string> = {
	New: "bg-blue-600/20 text-blue-400 border-blue-700",
	Reviewing: "bg-yellow-600/20 text-yellow-400 border-yellow-700",
	NeedsQuote: "bg-orange-600/20 text-orange-400 border-orange-700",
	Quoted: "bg-purple-600/20 text-purple-400 border-purple-700",
	QuoteApproved: "bg-green-600/20 text-green-400 border-green-700",
	QuoteRejected: "bg-red-600/20 text-red-400 border-red-700",
	ConvertedToJob: "bg-emerald-600/20 text-emerald-400 border-emerald-700",
	Cancelled: "bg-gray-600/20 text-gray-400 border-gray-700",
};

// ============================================================================
// REQUEST TYPES
// ============================================================================

export interface Request {
	id: string;
	client_id: string;
	title: string;
	description: string;
	address: string | null;
	coords: Coordinates;
	priority: RequestPriority;
	status: RequestStatus;
	requires_quote: boolean;
	estimated_value: number | null;
	source: string | null;
	source_reference: string | null;
	cancellation_reason: string | null;
	cancelled_at: Date | null;
	created_at: Date;
	updated_at: Date;

	client?: ClientWithPrimaryContact;
	quotes?: QuoteReference[];
	jobs?: JobReference[] | null;
	notes?: RequestNote[];
}

export interface CreateRequestInput {
	client_id: string;
	title: string;
	description: string;
	address?: string;
	coords?: Coordinates;
	priority?: RequestPriority;
	requires_quote?: boolean;
	estimated_value?: number | null;
	source?: string | null;
	source_reference?: string | null;
}

export interface UpdateRequestInput {
	title?: string;
	description?: string;
	address?: string;
	coords?: Coordinates;
	priority?: RequestPriority;
	status?: RequestStatus;
	requires_quote?: boolean;
	estimated_value?: number | null;
	source?: string | null;
	source_reference?: string | null;
	cancellation_reason?: string | null;
}

export const CreateRequestSchema = z.object({
	client_id: z.string().uuid("Invalid client ID"),
	title: z.string().min(1, "Title is required"),
	description: z.string().min(1, "Description is required"),
	priority: z.enum(PriorityValues).default("Medium"),
	requires_quote: z.boolean().default(false),
	estimated_value: z.number().min(0).optional().nullable(),
	source: z.string().optional().or(z.literal("")).nullable(),
	source_reference: z.string().optional().or(z.literal("")).nullable(),
});

export const UpdateRequestSchema = z.object({
	title: z.string().min(1, "Title is required").optional(),
	description: z.string().min(1, "Description is required").optional(),
	priority: z.enum(PriorityValues).optional(),
	status: z.enum(RequestStatusValues).optional(),
	requires_quote: z.boolean().optional(),
	estimated_value: z.number().min(0).optional().nullable(),
	source: z.string().optional().or(z.literal("")).nullable(),
	source_reference: z.string().optional().or(z.literal("")).nullable(),
	cancellation_reason: z.string().optional().or(z.literal("")).nullable(),
});

// ============================================================================
// REQUEST NOTES
// ============================================================================

export interface RequestNote extends BaseNote {
	request_id: string;
}

export interface CreateRequestNoteInput {
	content: string;
}

export interface UpdateRequestNoteInput {
	content: string;
}

export const CreateRequestNoteSchema = z.object({
	content: z.string().min(1, "Note content is required"),
});

export const UpdateRequestNoteSchema = z.object({
	content: z.string().min(1, "Note content is required"),
});
