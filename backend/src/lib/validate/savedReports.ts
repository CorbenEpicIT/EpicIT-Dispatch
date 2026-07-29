import { z } from "zod";

const filterConditionSchema = z.object({
	id: z.string(),
	columnKey: z.string(),
	operator: z.enum([
		"contains",
		"equals",
		"eq",
		"gt",
		"lt",
		"gte",
		"lte",
		"before",
		"after",
		"between",
		"in_last_days",
		"in",
		"is_empty",
		"not_empty",
	]),
	value: z.string(),
	value2: z.string().optional(),
	valueKind: z.enum(["literal", "field"]).optional(),
});

const aggregateSpecSchema = z.object({
	columnKey: z.string(),
	fn: z.enum(["sum", "avg", "count", "min", "max"]),
});

const chartConfigSchema = z.object({
	type: z.enum(["bar", "line", "pie"]),
	xKey: z.string(),
	yKey: z.string(),
	yFn: z.enum(["sum", "avg", "count"]),
});

export const savedReportConfigSchema = z.object({
	hidden: z.array(z.string()),
	date: z.string(),
	search: z.string(),
	sortKey: z.string(),
	sortDir: z.enum(["asc", "desc"]),
	join: z.enum(["and", "or"]),
	conditions: z.array(filterConditionSchema),
	groupBy: z.string().optional(),
	aggregates: z.array(aggregateSpecSchema).optional(),
	totalsRow: z.boolean().optional(),
	chart: chartConfigSchema.optional(),
});

export const createSavedReportSchema = z.object({
	name: z.string().trim().min(1, "Name is required").max(120, "Name too long"),
	source: z.string().min(1, "Source is required"),
	description: z.string().max(500).optional().nullable(),
	config: savedReportConfigSchema,
});

export const updateSavedReportSchema = z.object({
	name: z.string().trim().min(1, "Name is required").max(120, "Name too long").optional(),
	description: z.string().max(500).optional().nullable(),
	config: savedReportConfigSchema.optional(),
});

export const createFavoriteSchema = z.object({
	kind: z.enum(["built_in", "saved"]),
	ref: z.string().min(1, "ref is required"),
});

export type SavedReportConfigInput = z.infer<typeof savedReportConfigSchema>;
export type CreateSavedReportInput = z.infer<typeof createSavedReportSchema>;
export type UpdateSavedReportInput = z.infer<typeof updateSavedReportSchema>;
export type CreateFavoriteInput = z.infer<typeof createFavoriteSchema>;
