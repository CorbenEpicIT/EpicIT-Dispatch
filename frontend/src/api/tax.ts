import { api } from "./axiosClient";
import { z } from "zod";
import type { ApiResponse } from "../types/api";
import type { TaxRate, TaxGroup } from "../types/tax";

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const createTaxRateSchema = z.object({
	name: z.string().min(1, "Name is required").max(100, "Name must be at most 100 characters"),
	rate: z.number().min(0, "Rate cannot be negative").max(1, "Rate must be ≤ 1 (use 0.08 for 8%)"),
	description: z.string().optional().nullable(),
	jurisdiction: z.string().optional().nullable(),
	is_default: z.boolean().optional(),
});

const updateTaxRateSchema = z.object({
	name: z.string().min(1, "Name is required").max(100, "Name must be at most 100 characters").optional(),
	rate: z.number().min(0, "Rate cannot be negative").max(1, "Rate must be ≤ 1 (use 0.08 for 8%)").optional(),
	description: z.string().optional().nullable(),
	jurisdiction: z.string().optional().nullable(),
	is_default: z.boolean().optional(),
	is_active: z.boolean().optional(),
});

const uniqueRateIds = (ids: string[]) => new Set(ids).size === ids.length;

const createTaxGroupSchema = z.object({
	name: z.string().min(1, "Name is required").max(100, "Name must be at most 100 characters"),
	description: z.string().optional().nullable(),
	is_default: z.boolean().optional(),
	rate_ids: z
		.array(z.string().uuid("Invalid tax rate ID"))
		.optional()
		.refine((ids) => ids === undefined || uniqueRateIds(ids), {
			message: "Duplicate tax rate IDs are not allowed",
		}),
});

const updateTaxGroupSchema = z.object({
	name: z.string().min(1, "Name is required").max(100, "Name must be at most 100 characters").optional(),
	description: z.string().optional().nullable(),
	is_default: z.boolean().optional(),
	is_active: z.boolean().optional(),
	rate_ids: z
		.array(z.string().uuid("Invalid tax rate ID"))
		.optional()
		.refine((ids) => ids === undefined || uniqueRateIds(ids), {
			message: "Duplicate tax rate IDs are not allowed",
		}),
});

// ============================================================================
// INPUT TYPES
// ============================================================================

export type CreateTaxRateInput = z.infer<typeof createTaxRateSchema>;
export type UpdateTaxRateInput = z.infer<typeof updateTaxRateSchema>;
export type CreateTaxGroupInput = z.infer<typeof createTaxGroupSchema>;
export type UpdateTaxGroupInput = z.infer<typeof updateTaxGroupSchema>;

// ============================================================================
// TAX RATES API
// ============================================================================

export const getTaxRates = async (includeInactive?: boolean): Promise<TaxRate[]> => {
	const url = includeInactive ? "/tax/rates?include_inactive=true" : "/tax/rates";
	const response = await api.get<ApiResponse<TaxRate[]>>(url);
	return response.data.data || [];
};

export const createTaxRate = async (data: CreateTaxRateInput): Promise<TaxRate> => {
	createTaxRateSchema.parse(data);
	const response = await api.post<ApiResponse<TaxRate>>("/tax/rates", data);

	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to create tax rate");
	}

	return response.data.data!;
};

export const updateTaxRate = async (id: string, data: UpdateTaxRateInput): Promise<TaxRate> => {
	updateTaxRateSchema.parse(data);
	const response = await api.patch<ApiResponse<TaxRate>>(`/tax/rates/${id}`, data);

	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to update tax rate");
	}

	return response.data.data!;
};

export const deleteTaxRate = async (id: string): Promise<{ id: string }> => {
	const response = await api.delete<ApiResponse<{ id: string }>>(`/tax/rates/${id}`);

	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to delete tax rate");
	}

	return response.data.data || { id };
};

// ============================================================================
// TAX GROUPS API
// ============================================================================

export const getTaxGroups = async (includeInactive?: boolean): Promise<TaxGroup[]> => {
	const url = includeInactive ? "/tax/groups?include_inactive=true" : "/tax/groups";
	const response = await api.get<ApiResponse<TaxGroup[]>>(url);
	return response.data.data || [];
};

export const getDefaultTaxGroup = async (): Promise<TaxGroup | null> => {
	const response = await api.get<ApiResponse<TaxGroup>>("/tax/groups/default");
	return response.data.data ?? null;
};

export const createTaxGroup = async (data: CreateTaxGroupInput): Promise<TaxGroup> => {
	createTaxGroupSchema.parse(data);
	const response = await api.post<ApiResponse<TaxGroup>>("/tax/groups", data);

	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to create tax group");
	}

	return response.data.data!;
};

export const updateTaxGroup = async (id: string, data: UpdateTaxGroupInput): Promise<TaxGroup> => {
	updateTaxGroupSchema.parse(data);
	const response = await api.patch<ApiResponse<TaxGroup>>(`/tax/groups/${id}`, data);

	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to update tax group");
	}

	return response.data.data!;
};

export const deleteTaxGroup = async (id: string): Promise<{ id: string }> => {
	const response = await api.delete<ApiResponse<{ id: string }>>(`/tax/groups/${id}`);

	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to delete tax group");
	}

	return response.data.data || { id };
};
