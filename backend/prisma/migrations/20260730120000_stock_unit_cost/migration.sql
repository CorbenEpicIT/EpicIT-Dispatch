-- Per-receipt purchase cost capture.
--
-- Both columns are NULLABLE with no default and are deliberately NOT backfilled.
-- inventory_item.cost is the CURRENT configured cost, not what was paid on any
-- past receipt, so copying it backwards would fabricate history. Existing rows
-- therefore read as "cost unknown", and the price-history endpoint reports that
-- coverage honestly instead of averaging invented numbers.

ALTER TABLE "stock_movement" ADD COLUMN "unit_cost" DECIMAL(10,2);
ALTER TABLE "stock_batch"    ADD COLUMN "unit_cost" DECIMAL(10,2);
