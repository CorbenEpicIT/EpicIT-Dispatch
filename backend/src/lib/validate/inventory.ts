import z from "zod";

export const updateThresholdSchema = z.object({
    low_stock_threshold: z.number().int().min(0, "Threshold must not be negative").nullable().optional(),
});

export type UpdateThresholdInput = z.infer<typeof updateThresholdSchema>;

export const createInventoryItemSchema = z.object({
	name: z.string().min(1, "Name is required").max(255),
	description: z.string().max(5000).default(""),
	location: z.string().min(1, "Location is required").max(255),
	quantity: z.number().int().min(0, "Quantity must not be negative").default(0),
	unit_price: z.number().min(0).nullable().optional(),
	cost: z.number().min(0).nullable().optional(),
	sku: z.string().max(100).nullable().optional(),
	low_stock_threshold: z.number().int().min(0).nullable().optional(),
	image_urls: z.array(z.string().url()).default([]),
	alert_emails_enabled: z.boolean().default(false),
	alert_email: z.string().email().nullable().optional(),
});

export type CreateInventoryItemInput = z.infer<typeof createInventoryItemSchema>;

export const updateInventoryItemSchema = z.object({
	name: z.string().min(1).max(255).optional(),
	description: z.string().max(5000).optional(),
	location: z.string().min(1).max(255).optional(),
	quantity: z.number().int().min(0).optional(),
	unit_price: z.number().min(0).nullable().optional(),
	cost: z.number().min(0).nullable().optional(),
	sku: z.string().max(100).nullable().optional(),
	low_stock_threshold: z.number().int().min(0).nullable().optional(),
	image_urls: z.array(z.string().url()).optional(),
	alert_emails_enabled: z.boolean().optional(),
	alert_email: z.string().email().nullable().optional(),
});

export type UpdateInventoryItemInput = z.infer<typeof updateInventoryItemSchema>;

export const adjustStockSchema = z.object({
	delta: z.number().int().refine((v) => v !== 0, "Delta must not be zero"),
});

export type AdjustStockInput = z.infer<typeof adjustStockSchema>;
