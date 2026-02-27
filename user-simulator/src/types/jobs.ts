import z from "zod";
import type { ClientSummary, ClientWithPrimaryContact } from "./clients";
import type { Coordinates } from "./location";
import {
  ArrivalConstraintValues,
  FinishConstraintValues,
  type ArrivalConstraint,
  type FinishConstraint,
} from "./recurringPlans";

// ============================================================================
// ENUMS
// ============================================================================

export const JobStatusValues = [
  "Unscheduled",
  "Scheduled",
  "InProgress",
  "Completed",
  "Cancelled",
] as const;
export type JobStatus = (typeof JobStatusValues)[number];

export const VisitStatusValues = [
  "Scheduled",
  "Driving",
  "OnSite",
  "InProgress",
  "Paused",
  "Delayed",
  "Completed",
  "Cancelled",
] as const;
export type VisitStatus = (typeof VisitStatusValues)[number];

export const JobPriorityValues = ["Low", "Normal", "Medium", "High"] as const;
export type JobPriority = (typeof JobPriorityValues)[number];

// Re-export constraint types for convenience (mirrors frontend)
export { ArrivalConstraintValues, FinishConstraintValues };
export type { ArrivalConstraint, FinishConstraint };

// ============================================================================
// JOB TYPES
// ============================================================================

export interface JobVisitTechnician {
  visit_id: string;
  tech_id: string;
  tech: {
    id: string;
    name: string;
    email: string;
    phone: string;
    title: string;
    status: string;
  };
}

export interface JobSummary {
  id: string;
  name: string;
  job_number: string;
  client_id: string;
  address: string;
  description: string;
  priority: JobPriority;
  status: JobStatus;
}

export interface VisitReference {
  id: string;
  name?: string;
  scheduled_start_at: Date | string;
  scheduled_end_at: Date | string;
  status: VisitStatus;
}

export interface Job {
  id: string;
  name: string;
  job_number: string;
  client_id: string;
  address: string;
  coords: Coordinates;
  description: string;
  priority: JobPriority;
  status: JobStatus;
  created_at: Date | string;

  updated_at?: Date | string;
  completed_at?: Date | string | null;
  cancelled_at?: Date | string | null;
  cancellation_reason?: string | null;

  client?: ClientWithPrimaryContact;
  visits?: JobVisit[];
  notes?: JobNote[];
}

// ============================================================================
// JOB VISIT TYPES
// ============================================================================

export interface JobVisit {
  id: string;
  job_id: string;

  name?: string;
  description?: string | null;

  arrival_constraint: ArrivalConstraint;
  finish_constraint: FinishConstraint;

  scheduled_start_at: Date | string;
  scheduled_end_at: Date | string;

  // HH:MM strings (nullable)
  arrival_time?: string | null;
  arrival_window_start?: string | null;
  arrival_window_end?: string | null;
  finish_time?: string | null;

  actual_start_at?: Date | string | null;
  actual_end_at?: Date | string | null;

  status: VisitStatus;
  cancellation_reason?: string | null;

  created_at?: Date | string;
  updated_at?: Date | string;

  job?: JobSummary & { client: ClientSummary; coords: Coordinates };
  visit_techs: JobVisitTechnician[];
  notes?: JobNote[];
}

// ============================================================================
// NOTE TYPES
// ============================================================================

export interface JobNote {
  id: string;
  job_id: string;
  content: string;
  visit_id?: string | null;
  creator_tech_id?: string | null;
  creator_dispatcher_id?: string | null;
  last_editor_tech_id?: string | null;
  last_editor_dispatcher_id?: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  creator_tech?: { id: string; name: string; email: string } | null;
  creator_dispatcher?: { id: string; name: string; email: string } | null;
  last_editor_tech?: { id: string; name: string; email: string } | null;
  last_editor_dispatcher?: { id: string; name: string; email: string } | null;
  visit?: VisitReference | null;
}

// ============================================================================
// INPUT TYPES
// ============================================================================

export interface CreateJobInput {
  name: string;
  client_id: string;
  address: string;
  coords: Coordinates;
  description: string;
  priority?: JobPriority;
  status?: JobStatus;
}

export interface CreateJobVisitInput {
  job_id: string;

  name: string;
  description?: string | null;

  arrival_constraint: ArrivalConstraint;
  finish_constraint: FinishConstraint;

  scheduled_start_at: Date | string;
  scheduled_end_at: Date | string;

  arrival_time?: string | null;
  arrival_window_start?: string | null;
  arrival_window_end?: string | null;
  finish_time?: string | null;

  tech_ids?: string[];
}

export interface UpdateJobVisitInput {
  name?: string;
  description?: string | null;

  arrival_constraint?: ArrivalConstraint;
  finish_constraint?: FinishConstraint;

  scheduled_start_at?: Date | string;
  scheduled_end_at?: Date | string;

  arrival_time?: string | null;
  arrival_window_start?: string | null;
  arrival_window_end?: string | null;
  finish_time?: string | null;

  actual_start_at?: Date | string | null;
  actual_end_at?: Date | string | null;

  status?: VisitStatus;
  cancellation_reason?: string | null;

  tech_ids?: string[];
}

export interface CreateJobNoteInput {
  content: string;
  visit_id?: string | null;
}

export interface UpdateJobNoteInput {
  content?: string;
  visit_id?: string | null;
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

export interface JobResponse {
  err: string;
  data: Job[];
}

export interface JobVisitResponse {
  err: string;
  data: JobVisit[];
}

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

export const CreateJobSchema = z.object({
  name: z.string().min(1, "Job name is required"),
  client_id: z.string().min(1, "Please select a client"),
  address: z.string().default(""),
  description: z.string().default(""),
  priority: z.enum(JobPriorityValues).default("Normal"),
  status: z.enum(JobStatusValues).default("Unscheduled"),
});

const HHMM = z.string().regex(/^\d{2}:\d{2}$/, "Time must be in HH:MM format");

export const CreateJobVisitSchema = z
  .object({
    job_id: z.string().uuid("Invalid job ID"),

    name: z.string().min(1, "Visit name is required").max(255),
    description: z.string().optional().nullable(),

    arrival_constraint: z.enum(ArrivalConstraintValues),
    finish_constraint: z.enum(FinishConstraintValues),

    scheduled_start_at: z.coerce.date({ message: "Start time is required" }),
    scheduled_end_at: z.coerce.date({ message: "End time is required" }),

    arrival_time: HHMM.optional().nullable(),
    arrival_window_start: HHMM.optional().nullable(),
    arrival_window_end: HHMM.optional().nullable(),
    finish_time: HHMM.optional().nullable(),

    tech_ids: z.array(z.string().uuid()).optional(),
  })
  .refine((data) => data.scheduled_end_at > data.scheduled_start_at, {
    message: "End time must be after start time",
    path: ["scheduled_end_at"],
  })
  .refine(
    (data) => {
      if (data.arrival_constraint === "at" && !data.arrival_time) return false;
      return true;
    },
    {
      message: "Arrival time is required when constraint is 'at'",
      path: ["arrival_time"],
    },
  )
  .refine(
    (data) => {
      if (
        data.arrival_constraint === "between" &&
        (!data.arrival_window_start || !data.arrival_window_end)
      ) {
        return false;
      }
      return true;
    },
    {
      message:
        "Arrival window start and end are required for 'between' constraint",
      path: ["arrival_window_start"],
    },
  )
  .refine(
    (data) => {
      if (data.arrival_constraint === "by" && !data.arrival_window_end)
        return false;
      return true;
    },
    {
      message: "Arrival deadline is required for 'by' constraint",
      path: ["arrival_window_end"],
    },
  )
  .refine(
    (data) => {
      if (
        (data.finish_constraint === "at" || data.finish_constraint === "by") &&
        !data.finish_time
      ) {
        return false;
      }
      return true;
    },
    {
      message: "Finish time is required for 'at' or 'by' constraint",
      path: ["finish_time"],
    },
  )
  .refine(
    (data) => {
      // If between, ensure end > start
      if (
        data.arrival_constraint === "between" &&
        data.arrival_window_start &&
        data.arrival_window_end
      ) {
        const [sh, sm] = data.arrival_window_start.split(":").map(Number);
        const [eh, em] = data.arrival_window_end.split(":").map(Number);
        return eh * 60 + em > sh * 60 + sm;
      }
      return true;
    },
    {
      message: "Arrival window end must be after arrival window start",
      path: ["arrival_window_end"],
    },
  );

export const UpdateJobVisitSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    description: z.string().optional().nullable(),

    arrival_constraint: z.enum(ArrivalConstraintValues).optional(),
    finish_constraint: z.enum(FinishConstraintValues).optional(),

    scheduled_start_at: z.coerce.date().optional(),
    scheduled_end_at: z.coerce.date().optional(),

    arrival_time: HHMM.optional().nullable(),
    arrival_window_start: HHMM.optional().nullable(),
    arrival_window_end: HHMM.optional().nullable(),
    finish_time: HHMM.optional().nullable(),

    actual_start_at: z.coerce.date().optional().nullable(),
    actual_end_at: z.coerce.date().optional().nullable(),

    status: z.enum(VisitStatusValues).optional(),
    cancellation_reason: z.string().optional().nullable(),

    tech_ids: z.array(z.string().uuid()).optional(),
  })
  .refine(
    (data) => {
      if (data.scheduled_start_at && data.scheduled_end_at) {
        return data.scheduled_end_at > data.scheduled_start_at;
      }
      return true;
    },
    {
      message: "End time must be after start time",
      path: ["scheduled_end_at"],
    },
  )
  .refine(
    (data) => {
      if (data.actual_start_at && data.actual_end_at) {
        return data.actual_end_at > data.actual_start_at;
      }
      return true;
    },
    {
      message: "Actual end time must be after actual start time",
      path: ["actual_end_at"],
    },
  )
  .refine(
    (data) => {
      if (data.arrival_constraint === "at" && data.arrival_time === undefined) {
        return false;
      }
      return true;
    },
    {
      message: "Arrival time is required when constraint is 'at'",
      path: ["arrival_time"],
    },
  )
  .refine(
    (data) => {
      if (
        data.arrival_constraint === "between" &&
        (data.arrival_window_start === undefined ||
          data.arrival_window_end === undefined)
      ) {
        return false;
      }
      return true;
    },
    {
      message:
        "Arrival window start and end are required for 'between' constraint",
      path: ["arrival_window_start"],
    },
  )
  .refine(
    (data) => {
      if (
        data.arrival_constraint === "by" &&
        data.arrival_window_end === undefined
      ) {
        return false;
      }
      return true;
    },
    {
      message: "Arrival deadline is required for 'by' constraint",
      path: ["arrival_window_end"],
    },
  )
  .refine(
    (data) => {
      if (
        (data.finish_constraint === "at" || data.finish_constraint === "by") &&
        data.finish_time === undefined
      ) {
        return false;
      }
      return true;
    },
    {
      message: "Finish time is required for 'at' or 'by' constraint",
      path: ["finish_time"],
    },
  )
  .refine(
    (data) => {
      if (data.arrival_window_start && data.arrival_window_end) {
        const [sh, sm] = data.arrival_window_start.split(":").map(Number);
        const [eh, em] = data.arrival_window_end.split(":").map(Number);
        return eh * 60 + em > sh * 60 + sm;
      }
      return true;
    },
    {
      message: "Arrival window end must be after arrival window start",
      path: ["arrival_window_end"],
    },
  );

export const CreateJobNoteSchema = z.object({
  content: z.string().min(1, "Note content is required"),
  visit_id: z.string().uuid().optional().nullable(),
});

export const UpdateJobNoteSchema = z.object({
  content: z.string().min(1, "Note content is required").optional(),
  visit_id: z.string().uuid().optional().nullable(),
});
