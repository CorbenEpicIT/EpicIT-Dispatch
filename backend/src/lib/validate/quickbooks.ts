import { z } from "zod";

export const linkQBItemSchema = z.object({
    inventory_item_id: z.string().uuid(),
    qb_item_id: z.string().min(1),
});
