-- G4: Atomic "one pending restock per stock item" guard.
-- Prisma does not support conditional/partial unique indexes — this is raw SQL only.
CREATE UNIQUE INDEX vrr_one_pending_per_item
  ON vehicle_restock_request (stock_item_id)
  WHERE status = 'pending';

-- G8: Direct org scoping for vehicle_restock_request.
-- Backfill via the stock_item → vehicle join used by existing queries.
ALTER TABLE vehicle_restock_request
  ADD COLUMN organization_id TEXT NOT NULL DEFAULT '';

UPDATE vehicle_restock_request
SET organization_id = COALESCE(
  (
    SELECT v.organization_id
    FROM vehicle_stock_item vsi
    JOIN vehicle v ON vsi.vehicle_id = v.id
    WHERE vsi.id = vehicle_restock_request.stock_item_id
  ),
  ''
);

ALTER TABLE vehicle_restock_request
  ALTER COLUMN organization_id DROP DEFAULT;

CREATE INDEX vrr_organization_id_idx ON vehicle_restock_request (organization_id);

-- G10: Tech-side readiness confirmation path.
-- Make confirmed_by_id nullable so a tech can confirm via EOD auto-confirm.
ALTER TABLE vehicle_readiness
  ALTER COLUMN confirmed_by_id DROP NOT NULL;

ALTER TABLE vehicle_readiness
  ADD COLUMN confirmed_by_tech_id TEXT,
  ADD COLUMN eod_record_id        TEXT;

ALTER TABLE vehicle_readiness
  ADD CONSTRAINT vehicle_readiness_confirmed_by_tech_id_fkey
  FOREIGN KEY (confirmed_by_tech_id) REFERENCES technician(id)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE vehicle_readiness
  ADD CONSTRAINT vehicle_readiness_eod_record_id_fkey
  FOREIGN KEY (eod_record_id) REFERENCES vehicle_eod_record(id)
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Exactly one of confirmed_by_id or confirmed_by_tech_id must be set.
ALTER TABLE vehicle_readiness
  ADD CONSTRAINT vehicle_readiness_actor_check
  CHECK (
    (confirmed_by_id IS NOT NULL AND confirmed_by_tech_id IS NULL)
    OR
    (confirmed_by_id IS NULL     AND confirmed_by_tech_id IS NOT NULL)
  );
