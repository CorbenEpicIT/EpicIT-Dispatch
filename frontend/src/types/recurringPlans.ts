import z from "zod";
import type { ClientSummary, ClientWithPrimaryContact } from "./clients";
import type { Coordinates } from "./location";
import type {
	Priority,
	BaseNote,
	LineItemType,
	DispatcherReference,
	TechReference,
} from "./common";
import { PriorityValues, PriorityLabels, PriorityColors, LineItemTypeValues } from "./common";
import type { JobSummary, VisitReference } from "./jobs";

// ============================================================================
// RECURRING PLAN-SPECIFIC TYPES
// ============================================================================

export const RecurringPlanStatusValues = ["Active", "Paused", "Completed", "Cancelled"] as const;

export type RecurringPlanStatus = (typeof RecurringPlanStatusValues)[number];

export const RecurringPlanStatusLabels: Record<RecurringPlanStatus, string> = {
	Active: "Active",
	Paused: "Paused",
	Completed: "Completed",
	Cancelled: "Cancelled",
};

export const RecurringPlanStatusColors: Record<RecurringPlanStatus, string> = {
	Active: "bg-green-500/20 text-green-400 border-green-500/30",
	Paused: "bg-amber-500/20 text-amber-400 border-amber-500/30",
	Completed: "bg-blue-500/20 text-blue-400 border-blue-500/30",
	Cancelled: "bg-red-500/20 text-red-400 border-red-500/30",
};

export const RecurringFrequencyValues = ["daily", "weekly", "monthly", "yearly"] as const;

export type RecurringFrequency = (typeof RecurringFrequencyValues)[number];

export const RecurringFrequencyLabels: Record<RecurringFrequency, string> = {
	daily: "Daily",
	weekly: "Weekly",
	monthly: "Monthly",
	yearly: "Yearly",
};

export const WeekdayValues = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
export type Weekday = (typeof WeekdayValues)[number];

export const WeekdayLabels: Record<Weekday, string> = {
	MO: "Monday",
	TU: "Tuesday",
	WE: "Wednesday",
	TH: "Thursday",
	FR: "Friday",
	SA: "Saturday",
	SU: "Sunday",
};

export const WeekdayShortLabels: Record<Weekday, string> = {
	MO: "Mon",
	TU: "Tue",
	WE: "Wed",
	TH: "Thu",
	FR: "Fri",
	SA: "Sat",
	SU: "Sun",
};

// Constraint-based schedule types
export const ArrivalConstraintValues = ["anytime", "at", "between", "by"] as const;
export type ArrivalConstraint = (typeof ArrivalConstraintValues)[number];

export const ArrivalConstraintLabels: Record<ArrivalConstraint, string> = {
	anytime: "Anytime",
	at: "At specific time",
	between: "Between times",
	by: "By deadline",
};

export const FinishConstraintValues = ["when_done", "at", "by"] as const;
export type FinishConstraint = (typeof FinishConstraintValues)[number];

export const FinishConstraintLabels: Record<FinishConstraint, string> = {
	when_done: "When done",
	at: "At specific time",
	by: "By deadline",
};

export const BillingModeValues = ["per_visit", "subscription", "none"] as const;
export type BillingMode = (typeof BillingModeValues)[number];

export const BillingModeLabels: Record<BillingMode, string> = {
	per_visit: "Per Visit",
	subscription: "Subscription",
	none: "None",
};

export const InvoiceTimingValues = ["on_completion", "on_schedule_date", "manual"] as const;
export type InvoiceTiming = (typeof InvoiceTimingValues)[number];

export const InvoiceTimingLabels: Record<InvoiceTiming, string> = {
	on_completion: "On Completion",
	on_schedule_date: "On Schedule Date",
	manual: "Manual",
};

export const OccurrenceStatusValues = [
	"planned",
	"generated",
	"skipped",
	"cancelled",
	"completed",
] as const;

export type OccurrenceStatus = (typeof OccurrenceStatusValues)[number];

export const OccurrenceStatusLabels: Record<OccurrenceStatus, string> = {
	planned: "Planned",
	generated: "Generated",
	skipped: "Skipped",
	cancelled: "Cancelled",
	completed: "Completed",
};

export const OccurrenceStatusColors: Record<OccurrenceStatus, string> = {
	planned: "bg-blue-500/20 text-blue-400 border-blue-500/30",
	generated: "bg-purple-500/20 text-purple-400 border-purple-500/30",
	skipped: "bg-amber-500/20 text-amber-400 border-amber-500/30",
	cancelled: "bg-red-500/20 text-red-400 border-red-500/30",
	completed: "bg-green-500/20 text-green-400 border-green-500/30",
};

// ============================================================================
// RECURRING PLAN TYPES
// ============================================================================

export interface RecurringRuleWeekday {
	id: string;
	recurring_rule_id: string;
	weekday: Weekday;
}

export interface RecurringRule {
	id: string;
	recurring_plan_id: string;
	frequency: RecurringFrequency;
	interval: number;
	by_weekday?: RecurringRuleWeekday[];
	by_month_day?: number | null;
	by_month?: number | null;

	arrival_constraint: ArrivalConstraint;
	finish_constraint: FinishConstraint;
	arrival_time?: string | null; // HH:MM format
	arrival_window_start?: string | null; // HH:MM format
	arrival_window_end?: string | null; // HH:MM format
	finish_time?: string | null; // HH:MM format

	created_at: Date | string;
}

export interface RecurringPlanLineItem {
	id: string;
	recurring_plan_id: string;
	name: string;
	description?: string | null;
	quantity: number;
	unit_price: number;
	item_type?: LineItemType | null;
	sort_order: number;
	created_at: Date | string;
	isNew?: boolean; // Frontend only - marks items created in form
	isDeleted?: boolean; // Frontend only - soft delete marker
}

export interface RecurringOccurrence {
	id: string;
	recurring_plan_id: string;
	occurrence_start_at: Date | string;
	occurrence_end_at: Date | string;
	status: OccurrenceStatus;
	job_visit_id?: string | null;
	job_visit?: VisitReference | null;
	generated_at?: Date | string | null;
	completed_at?: Date | string | null;
	skipped_at?: Date | string | null;
	skip_reason?: string | null;
	template_version: number;
	created_at: Date | string;
}

export interface RecurringPlanNote extends BaseNote {
	recurring_plan_id: string;
}

export interface RecurringPlanSummary {
	id: string;
	name: string;
	client_id: string;
	address: string;
	priority: Priority;
	status: RecurringPlanStatus;
	starts_at: Date | string;
	ends_at?: Date | string | null;
}

export interface RecurringPlan {
	id: string;
	organization_id?: string | null;
	client_id: string;
	name: string;
	description: string;
	address: string;
	coords?: Coordinates | null;
	priority: Priority;
	status: RecurringPlanStatus;
	starts_at: Date | string;
	ends_at?: Date | string | null;
	timezone: string;
	generation_window_days: number;
	min_advance_days: number;
	billing_mode: BillingMode;
	invoice_timing: InvoiceTiming;
	auto_invoice: boolean;
	created_at: Date | string;
	updated_at: Date | string;
	created_by_dispatcher_id?: string | null;

	client?: ClientWithPrimaryContact;
	job_container?: JobSummary | null;
	created_by_dispatcher?: DispatcherReference | null;
	rules?: RecurringRule[];
	line_items?: RecurringPlanLineItem[];
	occurrences?: RecurringOccurrence[];
	notes?: RecurringPlanNote[];
}

// ============================================================================
// RESPONSE TYPES
// ============================================================================

export interface OccurrenceGenerationResult {
	generated: number;
	skipped: number;
	start_date: Date | string;
	end_date: Date | string;
}

export interface VisitGenerationResult {
	visit_id: string;
	occurrence_id: string;
	scheduled_start_at: Date | string;
	scheduled_end_at: Date | string;
	template_version: number;
}

export interface RecurringPlanResponse {
	err: string;
	data: RecurringPlan[];
}

export interface RecurringOccurrenceResponse {
	err: string;
	data: RecurringOccurrence[];
}

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

export const CreateRecurringPlanSchema = z
	.object({
		client_id: z.string().uuid("Invalid client ID"),
		name: z.string().min(1, "Plan name is required"),
		description: z.string().min(1, "Description is required"),
		address: z.string().min(1, "Address is required"),
		coords: z
			.object({
				lat: z.number(),
				lon: z.number(),
			})
			.optional(),
		priority: z.enum(PriorityValues).default("Medium"),

		starts_at: z.string().datetime("Invalid start date"),
		ends_at: z.string().datetime("Invalid end date").optional().nullable(),
		timezone: z.string().default("America/Chicago"),
		generation_window_days: z.number().int().min(1).max(365).default(90),
		min_advance_days: z.number().int().min(1).max(90).default(14),

		billing_mode: z.enum(BillingModeValues).default("per_visit"),
		invoice_timing: z.enum(InvoiceTimingValues).default("on_completion"),
		auto_invoice: z.boolean().default(false),

		rule: z.object({
			frequency: z.enum(RecurringFrequencyValues),
			interval: z.number().int().min(1).max(365).default(1),
			by_weekday: z.array(z.enum(WeekdayValues)).optional().nullable(),
			by_month_day: z.number().int().min(1).max(31).optional().nullable(),
			by_month: z.number().int().min(1).max(12).optional().nullable(),

			arrival_constraint: z.enum(ArrivalConstraintValues),
			finish_constraint: z.enum(FinishConstraintValues),
			arrival_time: z
				.string()
				.regex(/^\d{2}:\d{2}$/, "Time must be in HH:MM format")
				.optional()
				.nullable(),
			arrival_window_start: z
				.string()
				.regex(/^\d{2}:\d{2}$/, "Time must be in HH:MM format")
				.optional()
				.nullable(),
			arrival_window_end: z
				.string()
				.regex(/^\d{2}:\d{2}$/, "Time must be in HH:MM format")
				.optional()
				.nullable(),
			finish_time: z
				.string()
				.regex(/^\d{2}:\d{2}$/, "Time must be in HH:MM format")
				.optional()
				.nullable(),
		}),

		line_items: z
			.array(
				z.object({
					name: z.string().min(1, "Item name is required"),
					description: z.string().optional().nullable(),
					quantity: z.number().positive("Quantity must be positive"),
					unit_price: z
						.number()
						.nonnegative("Unit price must be non-negative"),
					item_type: z.enum(LineItemTypeValues).optional().nullable(),
					sort_order: z.number().int().min(0).optional(),
				})
			)
			.optional(),
	})
	.refine(
		(data) => {
			if (
				data.rule.frequency === "weekly" &&
				(!data.rule.by_weekday || data.rule.by_weekday.length === 0)
			) {
				return false;
			}
			return true;
		},
		{
			message: "Weekly frequency requires at least one weekday",
			path: ["rule", "by_weekday"],
		}
	)
	.refine(
		(data) => {
			if (data.rule.frequency === "monthly" && !data.rule.by_month_day) {
				return false;
			}
			return true;
		},
		{
			message: "Monthly frequency requires by_month_day",
			path: ["rule", "by_month_day"],
		}
	)
	.refine(
		(data) => {
			if (data.rule.frequency === "yearly" && !data.rule.by_month) {
				return false;
			}
			return true;
		},
		{
			message: "Yearly frequency requires by_month",
			path: ["rule", "by_month"],
		}
	)
	.refine(
		(data) => {
			if (data.rule.arrival_constraint === "at" && !data.rule.arrival_time) {
				return false;
			}
			return true;
		},
		{
			message: "Arrival time is required when constraint is 'at'",
			path: ["rule", "arrival_time"],
		}
	)
	.refine(
		(data) => {
			if (
				data.rule.arrival_constraint === "between" &&
				(!data.rule.arrival_window_start || !data.rule.arrival_window_end)
			) {
				return false;
			}
			return true;
		},
		{
			message: "Arrival window start and end are required for 'between' constraint",
			path: ["rule", "arrival_window_start"],
		}
	)
	.refine(
		(data) => {
			if (
				data.rule.arrival_constraint === "by" &&
				!data.rule.arrival_window_end
			) {
				return false;
			}
			return true;
		},
		{
			message: "Arrival deadline is required for 'by' constraint",
			path: ["rule", "arrival_window_end"],
		}
	)
	.refine(
		(data) => {
			if (
				(data.rule.finish_constraint === "at" ||
					data.rule.finish_constraint === "by") &&
				!data.rule.finish_time
			) {
				return false;
			}
			return true;
		},
		{
			message: "Finish time is required for 'at' or 'by' constraint",
			path: ["rule", "finish_time"],
		}
	)
	.refine(
		(data) => {
			if (data.ends_at) {
				return new Date(data.ends_at) > new Date(data.starts_at);
			}
			return true;
		},
		{
			message: "End date must be after start date",
			path: ["ends_at"],
		}
	);

export const UpdateRecurringPlanSchema = z
	.object({
		name: z.string().min(1, "Plan name is required").optional(),
		description: z.string().min(1, "Description is required").optional(),
		address: z.string().min(1, "Address is required").optional(),
		coords: z
			.object({
				lat: z.number(),
				lon: z.number(),
			})
			.optional(),
		priority: z.enum(PriorityValues).optional(),
		starts_at: z.string().datetime("Invalid start date").optional(),
		ends_at: z.string().datetime("Invalid end date").optional().nullable(),
		timezone: z.string().optional(),
		generation_window_days: z.number().int().min(1).max(365).optional(),
		min_advance_days: z.number().int().min(1).max(90).optional(),
		billing_mode: z.enum(BillingModeValues).optional(),
		invoice_timing: z.enum(InvoiceTimingValues).optional(),
		auto_invoice: z.boolean().optional(),
		status: z.enum(RecurringPlanStatusValues).optional(),

		rule: z
			.object({
				frequency: z.enum(RecurringFrequencyValues),
				interval: z.number().int().min(1).max(365).default(1),
				by_weekday: z.array(z.enum(WeekdayValues)).optional().nullable(),
				by_month_day: z.number().int().min(1).max(31).optional().nullable(),
				by_month: z.number().int().min(1).max(12).optional().nullable(),

				arrival_constraint: z.enum(ArrivalConstraintValues),
				finish_constraint: z.enum(FinishConstraintValues),
				arrival_time: z
					.string()
					.regex(/^\d{2}:\d{2}$/, "Time must be in HH:MM format")
					.optional()
					.nullable(),
				arrival_window_start: z
					.string()
					.regex(/^\d{2}:\d{2}$/, "Time must be in HH:MM format")
					.optional()
					.nullable(),
				arrival_window_end: z
					.string()
					.regex(/^\d{2}:\d{2}$/, "Time must be in HH:MM format")
					.optional()
					.nullable(),
				finish_time: z
					.string()
					.regex(/^\d{2}:\d{2}$/, "Time must be in HH:MM format")
					.optional()
					.nullable(),
			})
			.optional(),

		line_items: z
			.array(
				z.object({
					id: z.string().uuid().optional(),
					name: z.string().min(1, "Item name is required"),
					description: z.string().optional().nullable(),
					quantity: z.number().positive("Quantity must be positive"),
					unit_price: z
						.number()
						.nonnegative("Unit price must be non-negative"),
					item_type: z.enum(LineItemTypeValues).optional().nullable(),
					sort_order: z.number().int().min(0).optional(),
				})
			)
			.optional(),
	})
	.refine(
		(data) => {
			if (data.starts_at && data.ends_at) {
				return new Date(data.ends_at) > new Date(data.starts_at);
			}
			return true;
		},
		{
			message: "End date must be after start date",
			path: ["ends_at"],
		}
	)
	.refine(
		(data) => {
			if (
				data.rule &&
				data.rule.frequency === "weekly" &&
				(!data.rule.by_weekday || data.rule.by_weekday.length === 0)
			) {
				return false;
			}
			return true;
		},
		{
			message: "Weekly frequency requires at least one weekday",
			path: ["rule", "by_weekday"],
		}
	)
	.refine(
		(data) => {
			if (
				data.rule &&
				data.rule.frequency === "monthly" &&
				!data.rule.by_month_day
			) {
				return false;
			}
			return true;
		},
		{
			message: "Monthly frequency requires by_month_day",
			path: ["rule", "by_month_day"],
		}
	)
	.refine(
		(data) => {
			if (data.rule && data.rule.frequency === "yearly" && !data.rule.by_month) {
				return false;
			}
			return true;
		},
		{
			message: "Yearly frequency requires by_month",
			path: ["rule", "by_month"],
		}
	)
	.refine(
		(data) => {
			if (!data.rule) return true;
			if (data.rule.arrival_constraint === "at" && !data.rule.arrival_time) {
				return false;
			}
			return true;
		},
		{
			message: "Arrival time is required when constraint is 'at'",
			path: ["rule", "arrival_time"],
		}
	)
	.refine(
		(data) => {
			if (!data.rule) return true;
			if (
				data.rule.arrival_constraint === "between" &&
				(!data.rule.arrival_window_start || !data.rule.arrival_window_end)
			) {
				return false;
			}
			return true;
		},
		{
			message: "Arrival window start and end are required for 'between' constraint",
			path: ["rule", "arrival_window_start"],
		}
	)
	.refine(
		(data) => {
			if (!data.rule) return true;
			if (
				data.rule.arrival_constraint === "by" &&
				!data.rule.arrival_window_end
			) {
				return false;
			}
			return true;
		},
		{
			message: "Arrival deadline is required for 'by' constraint",
			path: ["rule", "arrival_window_end"],
		}
	)
	.refine(
		(data) => {
			if (!data.rule) return true;
			if (
				(data.rule.finish_constraint === "at" ||
					data.rule.finish_constraint === "by") &&
				!data.rule.finish_time
			) {
				return false;
			}
			return true;
		},
		{
			message: "Finish time is required for 'at' or 'by' constraint",
			path: ["rule", "finish_time"],
		}
	);

export const UpdateRecurringPlanLineItemsSchema = z.object({
	line_items: z
		.array(
			z.object({
				id: z.string().uuid().optional(),
				name: z.string().min(1, "Item name is required"),
				description: z.string().optional().nullable(),
				quantity: z.number().positive("Quantity must be positive"),
				unit_price: z
					.number()
					.nonnegative("Unit price must be non-negative"),
				item_type: z.enum(LineItemTypeValues).optional().nullable(),
				sort_order: z.number().int().min(0).optional(),
			})
		)
		.min(1, "At least one line item is required"),
});

export const GenerateOccurrencesSchema = z.object({
	days_ahead: z.number().int().min(1).max(365).default(30),
});

export const SkipOccurrenceSchema = z.object({
	skip_reason: z.string().min(1, "Skip reason is required"),
});

export const RescheduleOccurrenceSchema = z.object({
	new_start_at: z.string().datetime("Invalid start date"),
	new_end_at: z.string().datetime("Invalid end date").optional(),
});

export const BulkSkipOccurrencesSchema = z.object({
	occurrence_ids: z.array(z.string().uuid()).min(1, "At least one occurrence ID required"),
	skip_reason: z.string().min(1, "Skip reason is required"),
});

export const BulkRescheduleOccurrencesSchema = z.object({
	occurrence_ids: z.array(z.string().uuid()).min(1, "At least one occurrence ID required"),
	offset_days: z.number().int().min(-365).max(365),
});

export const CreateRecurringPlanNoteSchema = z.object({
	content: z.string().min(1, "Note content is required"),
});

export const UpdateRecurringPlanNoteSchema = z.object({
	content: z.string().min(1, "Note content is required"),
});

// ============================================================================
// TYPE EXPORTS FROM ZOD SCHEMAS
// ============================================================================

export type CreateRecurringPlanInput = z.infer<typeof CreateRecurringPlanSchema>;
export type UpdateRecurringPlanInput = z.infer<typeof UpdateRecurringPlanSchema>;
export type UpdateRecurringPlanLineItemsInput = z.infer<typeof UpdateRecurringPlanLineItemsSchema>;
export type GenerateOccurrencesInput = z.infer<typeof GenerateOccurrencesSchema>;
export type SkipOccurrenceInput = z.infer<typeof SkipOccurrenceSchema>;
export type RescheduleOccurrenceInput = z.infer<typeof RescheduleOccurrenceSchema>;
export type BulkSkipOccurrencesInput = z.infer<typeof BulkSkipOccurrencesSchema>;
export type BulkRescheduleOccurrencesInput = z.infer<typeof BulkRescheduleOccurrencesSchema>;
export type CreateRecurringPlanNoteInput = z.infer<typeof CreateRecurringPlanNoteSchema>;
export type UpdateRecurringPlanNoteInput = z.infer<typeof UpdateRecurringPlanNoteSchema>;

// ============================================================================
// TYPE GUARDS & HELPERS
// ============================================================================

export function isActiveRecurringPlan(plan: RecurringPlan | RecurringPlanSummary): boolean {
	return plan.status === "Active";
}

export function isPausedRecurringPlan(plan: RecurringPlan | RecurringPlanSummary): boolean {
	return plan.status === "Paused";
}

export function isCompletedRecurringPlan(plan: RecurringPlan | RecurringPlanSummary): boolean {
	return plan.status === "Completed";
}

export function isCancelledRecurringPlan(plan: RecurringPlan | RecurringPlanSummary): boolean {
	return plan.status === "Cancelled";
}

export function isPlannedOccurrence(occurrence: RecurringOccurrence): boolean {
	return occurrence.status === "planned";
}

export function isGeneratedOccurrence(occurrence: RecurringOccurrence): boolean {
	return occurrence.status === "generated";
}

export function formatRecurringSchedule(rule: RecurringRule): string {
	const { frequency, interval, by_weekday, by_month_day, by_month } = rule;

	if (frequency === "daily") {
		return interval === 1 ? "Daily" : `Every ${interval} days`;
	}

	if (frequency === "weekly") {
		const days = by_weekday?.map((wd) => WeekdayShortLabels[wd.weekday]).join(", ");
		return interval === 1 ? `Weekly on ${days}` : `Every ${interval} weeks on ${days}`;
	}

	if (frequency === "monthly") {
		const day = by_month_day;
		return interval === 1
			? `Monthly on day ${day}`
			: `Every ${interval} months on day ${day}`;
	}

	if (frequency === "yearly") {
		const monthNames = [
			"Jan",
			"Feb",
			"Mar",
			"Apr",
			"May",
			"Jun",
			"Jul",
			"Aug",
			"Sep",
			"Oct",
			"Nov",
			"Dec",
		];
		const month = by_month ? monthNames[by_month - 1] : "";
		const day = by_month_day;
		return interval === 1
			? `Yearly on ${month} ${day}`
			: `Every ${interval} years on ${month} ${day}`;
	}

	return "Unknown schedule";
}

export function calculateTemplateTotal(lineItems: RecurringPlanLineItem[]): number {
	return lineItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
}

export function formatScheduleConstraints(rule: RecurringRule): string {
	const {
		arrival_constraint,
		finish_constraint,
		arrival_time,
		arrival_window_start,
		arrival_window_end,
		finish_time,
	} = rule;

	let arrivalStr = "";
	switch (arrival_constraint) {
		case "anytime":
			arrivalStr = "Arrive anytime";
			break;
		case "at":
			arrivalStr = `Arrive at ${arrival_time}`;
			break;
		case "between":
			arrivalStr = `Arrive between ${arrival_window_start} - ${arrival_window_end}`;
			break;
		case "by":
			arrivalStr = `Arrive by ${arrival_window_end}`;
			break;
	}

	let finishStr = "";
	switch (finish_constraint) {
		case "when_done":
			finishStr = "finish when done";
			break;
		case "at":
			finishStr = `finish at ${finish_time}`;
			break;
		case "by":
			finishStr = `finish by ${finish_time}`;
			break;
	}

	return `${arrivalStr}, ${finishStr}`;
}
