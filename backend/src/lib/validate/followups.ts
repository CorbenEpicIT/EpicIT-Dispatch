import { z } from "zod";

const EmailTemplateCategory = z.enum([
	"followup",
	"reminder",
	"quote_chase",
	"invoice_chase",
	"request_ack",
	"custom",
]);

const FollowupTriggerType = z.enum([
	"manual",
	"date_based",
	"quote_sent",
	"invoice_sent",
	"request_created",
	"visit_scheduled",
]);

const FollowupStepCondition = z.enum(["always", "if_previous_not_opened"]);

const DelayUnit = z.enum(["hours", "days"]);

const sequenceStepSchema = z.object({
	// The category IS the Postmark template alias sent for this step.
	category: EmailTemplateCategory.default("followup"),
	step_order: z.number().int().min(1, "step_order must be at least 1"),
	delay_amount: z.number().int().min(0, "delay_amount must be at least 0").default(0),
	delay_unit: DelayUnit.default("days"),
	condition: FollowupStepCondition.default("if_previous_not_opened"),
});

// Reject duplicate step_order up front — otherwise the DB unique constraint
// (@@unique([sequence_id, step_order])) surfaces as an opaque 500.
const hasUniqueStepOrders = (steps: { step_order: number }[]): boolean =>
	new Set(steps.map((s) => s.step_order)).size === steps.length;
const uniqueStepOrderMsg = { message: "Step orders must be unique", path: ["steps"] };

export const createSequenceSchema = z
	.object({
		name: z.string().min(1, "Name is required"),
		description: z.string().nullable().optional(),
		trigger_type: FollowupTriggerType.default("manual"),
		trigger_config: z.any().nullable().optional(),
		stop_on_open: z.boolean().default(true),
		is_active: z.boolean().default(true),
		steps: z.array(sequenceStepSchema).min(1, "At least one step is required"),
	})
	.refine((data) => hasUniqueStepOrders(data.steps), uniqueStepOrderMsg);

export const updateSequenceSchema = z
	.object({
		name: z.string().min(1, "Name is required").optional(),
		description: z.string().nullable().optional(),
		trigger_type: FollowupTriggerType.optional(),
		trigger_config: z.any().nullable().optional(),
		stop_on_open: z.boolean().optional(),
		is_active: z.boolean().optional(),
		steps: z.array(sequenceStepSchema).min(1, "At least one step is required").optional(),
	})
	.refine(
		(data) =>
			data.name !== undefined ||
			data.description !== undefined ||
			data.trigger_type !== undefined ||
			data.trigger_config !== undefined ||
			data.stop_on_open !== undefined ||
			data.is_active !== undefined ||
			data.steps !== undefined,
		{ message: "At least one field must be provided for update" },
	)
	.refine((data) => data.steps === undefined || hasUniqueStepOrders(data.steps), uniqueStepOrderMsg);

export const enrollSchema = z.object({
	sequence_id: z.string().min(1, "sequence_id is required"),
	client_id: z.string().min(1, "client_id is required"),
	contact_id: z.string().nullable().optional(),
	recipient_email: z.string().email("Valid email is required").nullable().optional(),
	scheduled_at: z.coerce.date().nullable().optional(),
});

export type SequenceStepInput = z.infer<typeof sequenceStepSchema>;
export type CreateSequenceInput = z.infer<typeof createSequenceSchema>;
export type UpdateSequenceInput = z.infer<typeof updateSequenceSchema>;
export type EnrollInput = z.infer<typeof enrollSchema>;
