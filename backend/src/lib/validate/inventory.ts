import z from "zod";

// Trim and collapse empty/whitespace-only barcodes to null so "" never occupies
// a slot in the per-org (organization_id, barcode) unique index.
const barcodeField = z
	.string()
	.max(200)
	.nullable()
	.optional()
	.transform((v) => {
		if (v == null) return v;
		const trimmed = v.trim();
		return trimmed === "" ? null : trimmed;
	});

export const updateThresholdSchema = z.object({
    low_stock_threshold: z.number().int().min(0, "Threshold must not be negative").nullable().optional(),
});

export type UpdateThresholdInput = z.infer<typeof updateThresholdSchema>;

export const createInventoryItemSchema = z
	.object({
		name: z.string().min(1, "Name is required").max(255),
		description: z.string().max(5000).default(""),
		location: z.string().min(1, "Location is required").max(255),
		quantity: z.number().int().min(0, "Quantity must not be negative").default(0),
		unit: z.string().max(50).default("each"),
		unit_price: z.number().min(0).nullable().optional(),
		cost: z.number().min(0).nullable().optional(),
		sku: z.string().max(100).nullable().optional(),
		barcode: barcodeField,
		low_stock_threshold: z.number().int().min(0).nullable().optional(),
		image_urls: z.array(z.string().url()).default([]),
		alert_emails_enabled: z.boolean().default(false),
		alert_email: z.string().email().nullable().optional(),
		alt_ids: z.array(z.string()).default([]),
		is_serialized: z.boolean().default(false),
		is_batch_tracked: z.boolean().default(false),
	})
	// Plain create doesn't accept serial/batch capture data — a tracked item's
	// initial stock must go through POST /inventory/:id/receive instead, which
	// is the only place serial numbers / a lot get recorded alongside the qty.
	.refine((d) => !((d.is_serialized || d.is_batch_tracked) && d.quantity > 0), {
		message: "A serialized or batch-tracked item must be created with quantity 0 — add initial stock via POST /inventory/:id/receive",
		path: ["quantity"],
	});

export type CreateInventoryItemInput = z.infer<typeof createInventoryItemSchema>;

export const updateInventoryItemSchema = z.object({
	name: z.string().min(1).max(255).optional(),
	description: z.string().max(5000).optional(),
	location: z.string().min(1).max(255).optional(),
	// quantity intentionally omitted — stock changes go through adjustInventoryStock → recordMovements
	unit: z.string().max(50).optional(),
	unit_price: z.number().min(0).nullable().optional(),
	cost: z.number().min(0).nullable().optional(),
	sku: z.string().max(100).nullable().optional(),
	barcode: barcodeField,
	low_stock_threshold: z.number().int().min(0).nullable().optional(),
	image_urls: z.array(z.string().url()).optional(),
	alert_emails_enabled: z.boolean().optional(),
	alert_email: z.string().email().nullable().optional(),
	alt_ids: z.array(z.string()).optional(),
});

export type UpdateInventoryItemInput = z.infer<typeof updateInventoryItemSchema>;

// Loss (negative delta) on a tracked item must name which units/batches leave —
// serial_unit_ids for serialized items (length must equal abs(delta), enforced
// in the controller once is_serialized is known), batch_picks for batch-tracked
// (non-serialized) items (omit entirely to let the ledger's FIFO auto-allocate).
// Both are ignored for non-tracked items — existing callers are unaffected.
export const adjustStockSchema = z.object({
	delta: z.number().int().refine((v) => v !== 0, "Delta must not be zero"),
	serial_unit_ids: z.array(z.string().uuid()).optional(),
	batch_picks: z
		.array(z.object({ batch_id: z.string().uuid(), qty: z.number().positive() }))
		.optional(),
});

export type AdjustStockInput = z.infer<typeof adjustStockSchema>;

export const scanQuerySchema = z.object({
	code: z.string().trim().min(1, "Code is required").max(200),
});

export type ScanQueryInput = z.infer<typeof scanQuerySchema>;

export const createTagSchema = z.object({
	label: z.string().min(1, "Label is required").max(100),
});

export const updateTagSchema = z.object({
	label: z.string().min(1, "Label is required").max(100),
});

export const setItemTagsSchema = z.object({
	tag_ids: z.array(z.string()),
});
