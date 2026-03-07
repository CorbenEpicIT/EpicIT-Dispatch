import { z } from "zod";

export const FORM_DRAFT_TYPES = [
	"request",
	"quote",
	"job",
	"job_visit",
	"recurring_plan",
] as const;

export type FormDraftType = (typeof FORM_DRAFT_TYPES)[number];

/**
 * The payload is opaque to the backend — it stores whatever the frontend
 * form state contains. We only validate that it is a non-null object.
 * Shape correctness is enforced on the frontend when reconstructing the form.
 */
const payloadSchema = z
	.record(z.string(), z.unknown())
	.refine((val) => val !== null && typeof val === "object", {
		message: "Payload must be a non-null object",
	});

export const createDraftSchema = z.object({
	form_type: z.enum(FORM_DRAFT_TYPES, {
		error: `form_type must be one of: ${FORM_DRAFT_TYPES.join(", ")}`,
	}),
	payload: payloadSchema,
	entity_context_id: z
		.string()
		.uuid("Invalid entity_context_id")
		.optional()
		.nullable(),
});

export const updateDraftSchema = z.object({
	payload: payloadSchema,
});

export const listDraftsQuerySchema = z.object({
	form_type: z.enum(FORM_DRAFT_TYPES).optional(),
	entity_context_id: z.string().uuid().optional(),
});

export type CreateDraftInput = z.infer<typeof createDraftSchema>;
export type UpdateDraftInput = z.infer<typeof updateDraftSchema>;
export type ListDraftsQuery = z.infer<typeof listDraftsQuerySchema>;
