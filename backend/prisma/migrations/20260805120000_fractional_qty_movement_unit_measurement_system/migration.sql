-- Fractional warehouse quantities + stamped movement units + org measurement system.
--
-- Written by hand rather than via `prisma migrate dev` so the stock_movement.unit
-- backfill runs between ADD COLUMN and SET NOT NULL. All three changes ship as one
-- migration so there is a single file to apply.
--
-- AMENDED 2026-08-19, before this migration's first production deploy (PR #19
-- readiness review, finding F7 / 03-F4): the pre-flight check in step 0 was added
-- in front of the original ALTERs. Nothing below it changed. It is safe to amend
-- in place only because no environment has applied this migration yet — once it
-- has, changes go in a new migration.

-- 0. Pre-flight: refuse to run if the int -> numeric(10,2) widening would overflow.
--
-- numeric(10,2) holds at most 8 integer digits (99999999.99). An Int column can
-- hold up to 2147483647, so a row at or above 100000000 would make the ALTER
-- below fail mid-migration with a numeric field overflow (P3018) and leave the
-- deploy half-applied. Fail first, with a message that says what to fix.
-- low_stock_threshold is nullable; NULL compares as unknown and is skipped.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "inventory_item"
    WHERE "quantity" >= 100000000
       OR "low_stock_threshold" >= 100000000
  ) THEN
    RAISE EXCEPTION
      'inventory_item.quantity/low_stock_threshold must be < 100000000 before widening to numeric(10,2); fix the offending rows and re-run migrate deploy';
  END IF;
END
$$;

-- 1. inventory_item quantities become fractional.
--
-- The unit catalog sells ft / m / lb / kg / gal / L, but these two columns were
-- integer, so no measured unit could hold a real stock level. int -> numeric(10,2)
-- preserves every existing value exactly as long as it fits 8 integer digits —
-- which step 0 guarantees — and a client still sending whole numbers stays valid.
ALTER TABLE "inventory_item"
  ALTER COLUMN "quantity" TYPE numeric(10,2),
  ALTER COLUMN "quantity" SET DEFAULT 0;

ALTER TABLE "inventory_item"
  ALTER COLUMN "low_stock_threshold" TYPE numeric(10,2);

-- 2. stock_movement.unit — stamp the unit of measure on every ledger row.
--
-- Backfilled from the owning item's current unit. That is not a guess: it is
-- exactly what every read path already assumed implicitly, so the backfill writes
-- down today's semantics and freezes them. From here on, a later unit change stops
-- rewriting history.
--
-- The backfill cannot leave a NULL behind: stock_movement.inventory_item_id is
-- NOT NULL with an FK to inventory_item, so every row has exactly one item to read
-- from. SET NOT NULL therefore succeeds without needing a fallback default.
ALTER TABLE "stock_movement" ADD COLUMN "unit" TEXT;

UPDATE "stock_movement" m
  SET "unit" = i."unit"
  FROM "inventory_item" i
  WHERE m."inventory_item_id" = i."id";

ALTER TABLE "stock_movement" ALTER COLUMN "unit" SET NOT NULL;

-- 3. organization.measurement_system — orders the unit picker per region.
--
-- Ordering and default only: nothing is hidden and no stored quantity is converted.
-- 'imperial' matches existing behaviour, so every current org is unaffected.
ALTER TABLE "organization"
  ADD COLUMN "measurement_system" TEXT NOT NULL DEFAULT 'imperial';
