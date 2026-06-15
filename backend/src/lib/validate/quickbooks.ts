import { z } from "zod";

export const linkQBItemSchema = z.object({
    inventory_item_id: z.string().uuid(),
    qb_item_id: z.string().min(1),
});

export const importQBItemSchema = z.object({
    qb_item_id: z.string().min(1),
});

export const linkQBTaxCodeSchema = z.object({
    tax_group_id: z.string().uuid(),
    qb_tax_code_id: z.string().min(1).nullable(), // unlink when null
});