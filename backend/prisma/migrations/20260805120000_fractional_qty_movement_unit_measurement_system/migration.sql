-- Fractional warehouse quantities + stamped movement units + org measurement system.
--
-- Written by hand rather than via `prisma migrate dev` so the stock_movement.unit
-- backfill runs between ADD COLUMN and SET NOT NULL. All three changes ship as one
-- migration so there is a single file to apply.

-- 1. inventory_item quantities become fractional.
--
-- The unit catalog sells ft / m / lb / kg / gal / L, but these two columns were
-- integer, so no measured unit could hold a real stock level. int -> numeric(10,2)
-- is a lossless widening: every existing value is preserved exactly, and a client
-- still sending whole numbers stays valid.
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
