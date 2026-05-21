/**
 * Shared validation schemas reused across invoice and quote validators.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared enums
// ---------------------------------------------------------------------------

export const lineItemTypeEnum = z.enum(["labor", "material", "equipment", "other"]);

export const discountTypeEnum = z.enum(["percent", "amount"]);

// ---------------------------------------------------------------------------
// Base line item schema — common fields for both invoices and quotes
// ---------------------------------------------------------------------------

/**
 * Base line item fields shared between invoice and quote line items.
 * Callers extend this for model-specific fields (e.g. source traceability on invoices).
 */
export const baseLineItemSchema = z.object({
	name: z.string().min(1, "Item name is required"),
	description: z.string().optional().nullable(),
	quantity: z.number().positive("Quantity must be positive"),
	unit_price: z.number().min(0, "Unit price must be non-negative"),
	total: z.number().min(0, "Total must be non-negative").optional(),
	item_type: lineItemTypeEnum.optional().nullable(),
	sort_order: z.number().int().optional().default(0),
	tax_group_id: z.string().uuid().nullable().optional(),
	taxable: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Shared discount cross-field validation
// ---------------------------------------------------------------------------

/**
 * Refine callback that rejects percent discounts above 100.
 * Apply to any schema object that has discount_type + discount_value.
 */
export function validateDiscountRange<T extends { discount_type?: string | null; discount_value?: number | null }>(
	data: T,
	ctx: z.RefinementCtx,
): void {
	if (data.discount_type === "percent" && (data.discount_value ?? 0) > 100) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ["discount_value"],
			message: "Percent discount cannot exceed 100",
		});
	}
}
