-- Provisional (tech-created, dispatch-approved) catalog items + supplier_purchase
-- enum values used by later phases. ADD VALUE is safe inside the migration tx on
-- PG16 because the new values are not used within this same migration.

ALTER TYPE "vehicle_adjustment_type" ADD VALUE IF NOT EXISTS 'supplier_purchase';
ALTER TYPE "stock_movement_reason"   ADD VALUE IF NOT EXISTS 'supplier_purchase';

ALTER TABLE "inventory_item"
  ADD COLUMN "provisional"        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "created_by_tech_id" TEXT,
  ADD COLUMN "approved_at"        TIMESTAMP(3),
  ADD COLUMN "approved_by_id"     TEXT;

CREATE INDEX "inventory_item_provisional_idx" ON "inventory_item"("provisional");

ALTER TABLE "inventory_item"
  ADD CONSTRAINT "inventory_item_created_by_tech_id_fkey"
  FOREIGN KEY ("created_by_tech_id") REFERENCES "technician"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "inventory_item"
  ADD CONSTRAINT "inventory_item_approved_by_id_fkey"
  FOREIGN KEY ("approved_by_id") REFERENCES "dispatcher"("id") ON DELETE SET NULL ON UPDATE CASCADE;
