-- ============================================================================
-- Vehicle stock + inventory ledger (consolidated squash)
--
-- Single fresh-install migration covering the whole vehicle-stock / inventory
-- feature set. Squashed from the originally-separate migrations:
--   theme cols + system default, vehicle EOD records, vehicle stock adjustments,
--   EOD per-day unique, vehicle readiness, inventory movement ledger,
--   restock-request receipt confirmation.
-- Theme columns are created with their final 'system' default here, superseding
-- the former theme_system_default migration (which altered the default after the
-- fact and depended on the column already existing).
--
-- Applies cleanly to an empty database. Tables are created in their final
-- shape (nullable dual actor FKs, UTC (vehicle_id, day) EOD uniqueness) rather
-- than created-then-altered.
-- ============================================================================


-- ============================================================================
-- 1. Theme preferences + per-vehicle standard load
-- ============================================================================

ALTER TABLE "technician" ADD COLUMN IF NOT EXISTS "theme" TEXT NOT NULL DEFAULT 'system';
ALTER TABLE "dispatcher" ADD COLUMN IF NOT EXISTS "theme" TEXT NOT NULL DEFAULT 'system';

-- qty_standard drives EOD fill-to-standard logic
ALTER TABLE "vehicle_stock_item" ADD COLUMN "qty_standard" DECIMAL(10,2);


-- ============================================================================
-- 2. Vehicle EOD records (final shape: UTC day uniqueness, dual actor FKs)
-- ============================================================================

CREATE TABLE "vehicle_eod_record" (
    "id"                   TEXT NOT NULL,
    "organization_id"      TEXT NOT NULL,
    "vehicle_id"           TEXT NOT NULL,
    "completed_at"         TIMESTAMP(3) NOT NULL,
    "day"                  DATE NOT NULL,
    "completed_by_id"      TEXT,
    "completed_by_tech_id" TEXT,
    "notes"                TEXT,
    "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_eod_record_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "vehicle_eod_restock_line" (
    "id"            TEXT NOT NULL,
    "eod_record_id" TEXT NOT NULL,
    "stock_item_id" TEXT NOT NULL,
    "qty_restocked" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "qty_shortfall" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_eod_restock_line_pkey" PRIMARY KEY ("id")
);

-- Authoritative duplicate-EOD guard: one record per vehicle per UTC day.
CREATE UNIQUE INDEX "vehicle_eod_record_vehicle_id_day_key"
  ON "vehicle_eod_record"("vehicle_id", "day");

CREATE INDEX "vehicle_eod_record_vehicle_id_idx" ON "vehicle_eod_record"("vehicle_id");
CREATE INDEX "vehicle_eod_record_organization_id_idx" ON "vehicle_eod_record"("organization_id");
CREATE INDEX "vehicle_eod_record_completed_at_idx" ON "vehicle_eod_record"("completed_at");
CREATE INDEX "vehicle_eod_restock_line_eod_record_id_idx" ON "vehicle_eod_restock_line"("eod_record_id");
CREATE INDEX "vehicle_eod_restock_line_stock_item_id_idx" ON "vehicle_eod_restock_line"("stock_item_id");

ALTER TABLE "vehicle_eod_record" ADD CONSTRAINT "vehicle_eod_record_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vehicle_eod_record" ADD CONSTRAINT "vehicle_eod_record_completed_by_id_fkey"
  FOREIGN KEY ("completed_by_id") REFERENCES "dispatcher"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "vehicle_eod_record" ADD CONSTRAINT "vehicle_eod_record_completed_by_tech_id_fkey"
  FOREIGN KEY ("completed_by_tech_id") REFERENCES "technician"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "vehicle_eod_restock_line" ADD CONSTRAINT "vehicle_eod_restock_line_eod_record_id_fkey"
  FOREIGN KEY ("eod_record_id") REFERENCES "vehicle_eod_record"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vehicle_eod_restock_line" ADD CONSTRAINT "vehicle_eod_restock_line_stock_item_id_fkey"
  FOREIGN KEY ("stock_item_id") REFERENCES "vehicle_stock_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ============================================================================
-- 3. Vehicle stock adjustments (final shape: dual actor FKs)
-- ============================================================================

CREATE TYPE "vehicle_adjustment_type" AS ENUM ('warehouse_exchange', 'field_loss', 'transfer', 'audit');

CREATE TABLE "vehicle_stock_adjustment" (
    "id"                 TEXT NOT NULL,
    "organization_id"    TEXT NOT NULL,
    "vehicle_id"         TEXT NOT NULL,
    "type"               "vehicle_adjustment_type" NOT NULL,
    "note"               TEXT,
    "created_by_id"      TEXT,
    "created_by_tech_id" TEXT,
    "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_stock_adjustment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "vehicle_stock_adjustment_line" (
    "id"               TEXT NOT NULL,
    "adjustment_id"    TEXT NOT NULL,
    "stock_item_id"    TEXT NOT NULL,
    "qty_before"       DECIMAL(10,2) NOT NULL,
    "qty_after"        DECIMAL(10,2) NOT NULL,
    "inventory_impact" DECIMAL(10,2) NOT NULL DEFAULT 0,

    CONSTRAINT "vehicle_stock_adjustment_line_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "vehicle_stock_adjustment_vehicle_id_idx" ON "vehicle_stock_adjustment"("vehicle_id");
CREATE INDEX "vehicle_stock_adjustment_organization_id_idx" ON "vehicle_stock_adjustment"("organization_id");
CREATE INDEX "vehicle_stock_adjustment_created_at_idx" ON "vehicle_stock_adjustment"("created_at");
CREATE INDEX "vehicle_stock_adjustment_line_adjustment_id_idx" ON "vehicle_stock_adjustment_line"("adjustment_id");
CREATE INDEX "vehicle_stock_adjustment_line_stock_item_id_idx" ON "vehicle_stock_adjustment_line"("stock_item_id");

ALTER TABLE "vehicle_stock_adjustment" ADD CONSTRAINT "vehicle_stock_adjustment_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vehicle_stock_adjustment" ADD CONSTRAINT "vehicle_stock_adjustment_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "dispatcher"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "vehicle_stock_adjustment" ADD CONSTRAINT "vehicle_stock_adjustment_created_by_tech_id_fkey"
  FOREIGN KEY ("created_by_tech_id") REFERENCES "technician"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "vehicle_stock_adjustment_line" ADD CONSTRAINT "vehicle_stock_adjustment_line_adjustment_id_fkey"
  FOREIGN KEY ("adjustment_id") REFERENCES "vehicle_stock_adjustment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vehicle_stock_adjustment_line" ADD CONSTRAINT "vehicle_stock_adjustment_line_stock_item_id_fkey"
  FOREIGN KEY ("stock_item_id") REFERENCES "vehicle_stock_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ============================================================================
-- 4. Vehicle readiness + recurring-plan inventory linking
-- ============================================================================

ALTER TABLE "recurring_plan_line_item" ADD COLUMN "inventory_item_id" TEXT;

ALTER TABLE "recurring_plan_line_item"
  ADD CONSTRAINT "recurring_plan_line_item_inventory_item_id_fkey"
  FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_item"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "recurring_plan_line_item_inventory_item_id_idx"
  ON "recurring_plan_line_item"("inventory_item_id");

CREATE TABLE "vehicle_readiness" (
    "id"              TEXT         NOT NULL,
    "vehicle_id"      TEXT         NOT NULL,
    "organization_id" TEXT         NOT NULL,
    "date"            DATE         NOT NULL,
    "confirmed_by_id" TEXT         NOT NULL,
    "confirmed_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes"           TEXT,
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_readiness_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vehicle_readiness_vehicle_id_date_key" ON "vehicle_readiness"("vehicle_id", "date");
CREATE INDEX "vehicle_readiness_vehicle_id_idx" ON "vehicle_readiness"("vehicle_id");
CREATE INDEX "vehicle_readiness_organization_id_idx" ON "vehicle_readiness"("organization_id");
CREATE INDEX "vehicle_readiness_date_idx" ON "vehicle_readiness"("date");

ALTER TABLE "vehicle_readiness" ADD CONSTRAINT "vehicle_readiness_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vehicle_readiness" ADD CONSTRAINT "vehicle_readiness_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vehicle_readiness" ADD CONSTRAINT "vehicle_readiness_confirmed_by_id_fkey"
  FOREIGN KEY ("confirmed_by_id") REFERENCES "dispatcher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ============================================================================
-- 5. Inventory movement ledger
--    stock_movement becomes the source of truth for all stock changes. Cached
--    quantities (inventory_item.quantity, vehicle_stock_item.qty_on_hand) are
--    derived, updated only by recordMovements().
-- ============================================================================

CREATE TYPE "stock_location_type" AS ENUM ('warehouse', 'vehicle', 'consumed', 'adjustment', 'external');
CREATE TYPE "stock_movement_reason" AS ENUM ('receive', 'restock', 'return_to_warehouse', 'parts_used', 'direct_consumption', 'loss', 'audit_correction', 'transfer', 'reversal', 'initial');
CREATE TYPE "restock_mode" AS ENUM ('tech_self_serve', 'dispatch_prepared');
CREATE TYPE "line_item_fulfillment" AS ENUM ('planned', 'used', 'voided');

-- restock_mode is a UX-emphasis default only — never read by a backend guard
ALTER TABLE "organization" ADD COLUMN "restock_mode" "restock_mode" NOT NULL DEFAULT 'tech_self_serve';

-- consumption is event-driven under the ledger (fires on visit Completed)
ALTER TABLE "job" DROP COLUMN "deduct_inventory_on";

ALTER TABLE "job_visit_line_item" ADD COLUMN "fulfillment_status" "line_item_fulfillment",
ADD COLUMN "qty_planned" DECIMAL(10,2),
ADD COLUMN "reconciled_at" TIMESTAMP(3),
ADD COLUMN "reconciled_by_tech_id" TEXT;

CREATE INDEX "job_visit_line_item_visit_id_fulfillment_status_idx"
  ON "job_visit_line_item"("visit_id", "fulfillment_status");

CREATE TABLE "stock_movement" (
    "id"                 TEXT NOT NULL,
    "organization_id"    TEXT NOT NULL,
    "inventory_item_id"  TEXT NOT NULL,
    "qty"                DECIMAL(10,2) NOT NULL,
    "from_location_type" "stock_location_type" NOT NULL,
    "from_vehicle_id"    TEXT,
    "to_location_type"   "stock_location_type" NOT NULL,
    "to_vehicle_id"      TEXT,
    "reason"             "stock_movement_reason" NOT NULL,
    "note"               TEXT,
    "actor_type"         TEXT NOT NULL,
    "actor_id"           TEXT,
    "visit_id"           TEXT,
    "visit_line_item_id" TEXT,
    "eod_record_id"      TEXT,
    "adjustment_id"      TEXT,
    "restock_request_id" TEXT,
    "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "stock_movement_organization_id_inventory_item_id_created_a_idx" ON "stock_movement"("organization_id", "inventory_item_id", "created_at");
CREATE INDEX "stock_movement_organization_id_created_at_idx" ON "stock_movement"("organization_id", "created_at");
CREATE INDEX "stock_movement_from_vehicle_id_created_at_idx" ON "stock_movement"("from_vehicle_id", "created_at");
CREATE INDEX "stock_movement_to_vehicle_id_created_at_idx" ON "stock_movement"("to_vehicle_id", "created_at");
CREATE INDEX "stock_movement_visit_id_idx" ON "stock_movement"("visit_id");
CREATE INDEX "stock_movement_eod_record_id_idx" ON "stock_movement"("eod_record_id");
CREATE INDEX "stock_movement_adjustment_id_idx" ON "stock_movement"("adjustment_id");
CREATE INDEX "stock_movement_restock_request_id_idx" ON "stock_movement"("restock_request_id");

ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_from_vehicle_id_fkey" FOREIGN KEY ("from_vehicle_id") REFERENCES "vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_to_vehicle_id_fkey" FOREIGN KEY ("to_vehicle_id") REFERENCES "vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "job_visit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_visit_line_item_id_fkey" FOREIGN KEY ("visit_line_item_id") REFERENCES "job_visit_line_item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_eod_record_id_fkey" FOREIGN KEY ("eod_record_id") REFERENCES "vehicle_eod_record"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_adjustment_id_fkey" FOREIGN KEY ("adjustment_id") REFERENCES "vehicle_stock_adjustment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_restock_request_id_fkey" FOREIGN KEY ("restock_request_id") REFERENCES "vehicle_restock_request"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ----------------------------------------------------------------------------
-- Backfill: make SUM(ledger) == cached quantities from day one
-- ----------------------------------------------------------------------------

-- Warehouse quantities → initial movements (external → warehouse)
INSERT INTO "stock_movement"
  ("id", "organization_id", "inventory_item_id", "qty",
   "from_location_type", "to_location_type", "reason", "note", "actor_type")
SELECT
  gen_random_uuid(), ii."organization_id", ii."id", ii."quantity",
  'external', 'warehouse', 'initial', 'Ledger backfill from inventory_item.quantity', 'system'
FROM "inventory_item" ii
WHERE ii."quantity" > 0 AND ii."organization_id" IS NOT NULL;

-- Vehicle on-hand quantities → initial movements (external → vehicle)
INSERT INTO "stock_movement"
  ("id", "organization_id", "inventory_item_id", "qty",
   "from_location_type", "to_location_type", "to_vehicle_id", "reason", "note", "actor_type")
SELECT
  gen_random_uuid(), v."organization_id", vsi."inventory_item_id", vsi."qty_on_hand",
  'external', 'vehicle', vsi."vehicle_id", 'initial', 'Ledger backfill from vehicle_stock_item.qty_on_hand', 'system'
FROM "vehicle_stock_item" vsi
JOIN "vehicle" v ON v."id" = vsi."vehicle_id"
WHERE vsi."qty_on_hand" > 0 AND v."organization_id" IS NOT NULL;

-- Inventory-linked visit line items become planned reservations…
UPDATE "job_visit_line_item"
SET "fulfillment_status" = 'planned', "qty_planned" = "quantity"
WHERE "inventory_item_id" IS NOT NULL;

-- …except lines on already-completed visits, which the completion sweep must not re-consume
UPDATE "job_visit_line_item"
SET "fulfillment_status" = 'used'
WHERE "inventory_item_id" IS NOT NULL
  AND "visit_id" IN (SELECT "id" FROM "job_visit" WHERE "status" = 'Completed');


-- ============================================================================
-- 6. Restock-request receipt confirmation + dismissal attribution
-- ============================================================================

ALTER TABLE "vehicle_restock_request"
ADD COLUMN "received_at" TIMESTAMP(3),
ADD COLUMN "qty_received" INTEGER,
ADD COLUMN "discrepant" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "dismissed_reason" TEXT;
