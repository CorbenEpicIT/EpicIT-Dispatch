import { z } from "zod";
import type { PaginateParams } from "../reports/filterEngine.js";

const columnTypeSchema = z.enum(["text", "number", "date", "currency"]);

const operatorSchema = z
	.enum([
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
	])
	// "eq" is a client alias for "equals"; collapse it here so both engines carry a single case.
	.transform((op) => (op === "eq" ? "equals" : op));

export const filterConditionSchema = z.object({
	id: z.string(),
	columnKey: z.string(),
	operator: operatorSchema,
	value: z.string(),
	value2: z.string().optional(),
	valueKind: z.enum(["literal", "field"]).optional(),
	columnType: columnTypeSchema.optional(),
});

export const paginateParamsSchema = z.object({
	search: z.string().optional(),
	searchTerms: z.array(z.string()).optional(),
	conditions: z.array(filterConditionSchema).optional(),
	join: z.enum(["and", "or"]).optional(),
	sortKey: z.string().optional(),
	sortDir: z.enum(["asc", "desc"]).optional(),
	sortType: columnTypeSchema.optional(),
	page: z.number().int().min(0).optional(),
	limit: z.number().int().min(1).max(200).optional(),
});

const asString = (v: unknown): string | undefined => (typeof v === "string" && v !== "" ? v : undefined);

const asNumber = (v: unknown): number | undefined => {
	if (typeof v !== "string" || v === "") return undefined;
	const n = Number(v);
	return Number.isFinite(n) ? n : undefined;
};

const parseConditions = (v: unknown): unknown => {
	if (typeof v !== "string" || v === "") return undefined;
	try {
		return JSON.parse(v);
	} catch {
		return undefined;
	}
};

export const parsePaginateQuery = (query: Record<string, unknown>): PaginateParams => {
	const parsed = paginateParamsSchema.safeParse({
		search: asString(query.search),
		searchTerms: parseConditions(query.searchTerms),
		conditions: parseConditions(query.conditions),
		join: asString(query.join),
		sortKey: asString(query.sortKey),
		sortDir: asString(query.sortDir),
		sortType: asString(query.sortType),
		page: asNumber(query.page),
		limit: asNumber(query.limit),
	});
	return parsed.success ? parsed.data : {};
};
