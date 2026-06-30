-- ============================================================================
-- vehicle_tabs_redesign + schema_cleanup
--
-- Replaces the "End of Day" tab with "Restock" (with Prepare for Tomorrow mode)
-- and replaces "Requests" tab with "Alerts".
-- Renames vehicle_eod_record → vehicle_restock_record and related tables/columns.
--
-- Changes:
--  1. vehicle_eod_record: add mode column, drop one-per-day unique constraint
--  2. vehicle_restock_request: drop fulfilled/received fields, add acknowledged/resolved fields
--  3. stock_movement: drop restock_request_id FK + index (no longer linked)
--  4. Rename vehicle_eod_record → vehicle_restock_record and related tables/columns
-- ============================================================================


-- ============================================================================
-- 0. Create restock_record_mode enum
-- ============================================================================

CREATE TYPE "restock_record_mode" AS ENUM ('restock', 'prepare');


-- ============================================================================
-- 1. vehicle_eod_record: add mode column, drop @@unique([vehicle_id, day])
-- ============================================================================

-- Add mode column (default "restock" for existing records)
ALTER TABLE "vehicle_eod_record" ADD COLUMN "mode" "restock_record_mode" NOT NULL DEFAULT 'restock';

-- Drop the one-EOD-per-vehicle-per-day unique constraint
-- (multiple records per day are now allowed, e.g. restock + prepare)
DROP INDEX IF EXISTS "vehicle_eod_record_vehicle_id_day_key";


-- ============================================================================
-- 2. vehicle_restock_request: schema redesign
--    Remove: fulfilled_at, received_at, qty_received, discrepant
--    Add: acknowledged_at, acknowledged_by_id, resolved_at, resolved_note
-- ============================================================================

-- Drop old fulfilled/received columns (data loss accepted — dev environment reset)
ALTER TABLE "vehicle_restock_request"
  DROP COLUMN IF EXISTS "fulfilled_at",
  DROP COLUMN IF EXISTS "received_at",
  DROP COLUMN IF EXISTS "qty_received",
  DROP COLUMN IF EXISTS "discrepant";

-- Add new acknowledged/resolved columns
ALTER TABLE "vehicle_restock_request"
  ADD COLUMN "acknowledged_at"    TIMESTAMP(3),
  ADD COLUMN "acknowledged_by_id" TEXT,
  ADD COLUMN "resolved_at"        TIMESTAMP(3),
  ADD COLUMN "resolved_note"      TEXT;

-- Add FK for acknowledged_by → dispatcher
ALTER TABLE "vehicle_restock_request"
  ADD CONSTRAINT "vehicle_restock_request_acknowledged_by_id_fkey"
  FOREIGN KEY ("acknowledged_by_id") REFERENCES "dispatcher"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;


-- ============================================================================
-- 3. stock_movement: drop restock_request_id column + FK + index
-- ============================================================================

-- Drop FK first (must precede column drop)
ALTER TABLE "stock_movement"
  DROP CONSTRAINT IF EXISTS "stock_movement_restock_request_id_fkey";

-- Drop index
DROP INDEX IF EXISTS "stock_movement_restock_request_id_idx";

-- Drop column (data loss accepted — dev environment reset)
ALTER TABLE "stock_movement"
  DROP COLUMN IF EXISTS "restock_request_id";


-- ============================================================================
-- 4. Rename vehicle_eod_record → vehicle_restock_record and related tables/columns
-- ============================================================================

ALTER TABLE "vehicle_eod_record" RENAME TO "vehicle_restock_record";
ALTER TABLE "vehicle_eod_restock_line" RENAME TO "vehicle_restock_line";

ALTER TABLE "vehicle_restock_line" RENAME COLUMN "eod_record_id" TO "restock_record_id";
ALTER TABLE "stock_movement" RENAME COLUMN "eod_record_id" TO "restock_record_id";
ALTER TABLE "vehicle_readiness" RENAME COLUMN "eod_record_id" TO "restock_record_id";
