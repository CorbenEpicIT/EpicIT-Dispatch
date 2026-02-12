import z from "zod";
import type { Coordinates } from "./location";
import type { Client, ClientWithPrimaryContact } from "./clients";
import type { QuoteSummary } from "./quotes";

export const RequestStatusValues = [
  "New",
  "Reviewing",
  "Quoted",
  "QuoteApproved",
  "QuoteRejected",
  "ConvertedToJob",
  "Cancelled",
] as const;

export type RequestStatus = (typeof RequestStatusValues)[number];

export const RequestPriorityValues = [
  "Low",
  "Medium",
  "High",
  "Urgent",
  "Emergency",
] as const;

export type RequestPriority = (typeof RequestPriorityValues)[number];

export const RequestStatusLabels: Record<RequestStatus, string> = {
  New: "New",
  Reviewing: "Reviewing",
  Quoted: "Quoted",
  QuoteApproved: "Quote Approved",
  QuoteRejected: "Quote Rejected",
  ConvertedToJob: "Converted to Job",
  Cancelled: "Cancelled",
};

export const RequestPriorityLabels: Record<RequestPriority, string> = {
  Low: "Low",
  Medium: "Medium",
  High: "High",
  Urgent: "Urgent",
  Emergency: "Emergency",
};

export const RequestStatusColors: Record<RequestStatus, string> = {
  New: "bg-blue-600/20 text-blue-400 border-blue-700",
  Reviewing: "bg-yellow-600/20 text-yellow-400 border-yellow-700",
  Quoted: "bg-purple-600/20 text-purple-400 border-purple-700",
  QuoteApproved: "bg-green-600/20 text-green-400 border-green-700",
  QuoteRejected: "bg-red-600/20 text-red-400 border-red-700",
  ConvertedToJob: "bg-emerald-600/20 text-emerald-400 border-emerald-700",
  Cancelled: "bg-gray-600/20 text-gray-400 border-gray-700",
};

export const RequestPriorityColors: Record<RequestPriority, string> = {
  Low: "bg-gray-600/20 text-gray-400 border-gray-700",
  Medium: "bg-blue-600/20 text-blue-400 border-blue-700",
  High: "bg-orange-600/20 text-orange-400 border-orange-700",
  Urgent: "bg-red-600/20 text-red-400 border-red-700",
  Emergency: "bg-red-700/30 text-red-300 border-red-600 font-bold",
};

export interface RequestJobReference {
  id: string;
  name: string;
  status: string;
}

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
  quotes?: QuoteSummary[];
  job?: RequestJobReference | null;
  notes?: RequestNote[];
}

export interface CreateRequestInput {
  client_id: string;
  title: string;
  description: string;
  address?: string;
  coords?: Coordinates;
  priority?: RequestPriority;
  status?: RequestStatus;
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
  priority: z.enum(RequestPriorityValues).default("Medium"),
  status: z.enum(RequestStatusValues).optional(),
  requires_quote: z.boolean().default(false),
  estimated_value: z.number().min(0).optional().nullable(),
  source: z.string().optional().or(z.literal("")).nullable(),
  source_reference: z.string().optional().or(z.literal("")).nullable(),
});

export const UpdateRequestSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  priority: z.enum(RequestPriorityValues).optional(),
  status: z.enum(RequestStatusValues).optional(),
  requires_quote: z.boolean().optional(),
  estimated_value: z.number().min(0).optional().nullable(),
  source: z.string().optional().or(z.literal("")).nullable(),
  source_reference: z.string().optional().or(z.literal("")).nullable(),
  cancellation_reason: z.string().optional().or(z.literal("")).nullable(),
});

export interface RequestNote {
  id: string;
  request_id: string;
  content: string;
  created_at: Date;
  updated_at: Date;

  creator_tech_id: string | null;
  creator_dispatcher_id: string | null;
  creator_tech?: { id: string; name: string; email: string };
  creator_dispatcher?: { id: string; name: string; email: string };
  last_editor_tech_id: string | null;
  last_editor_dispatcher_id: string | null;
  last_editor_tech?: { id: string; name: string; email: string };
  last_editor_dispatcher?: { id: string; name: string; email: string };
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
