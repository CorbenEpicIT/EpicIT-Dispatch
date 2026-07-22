DO $$
DECLARE
  bad_items    INTEGER;
  bad_vehicles INTEGER;
BEGIN
  SELECT count(*) INTO bad_items    FROM inventory_item WHERE organization_id IS NULL;
  SELECT count(*) INTO bad_vehicles FROM vehicle         WHERE organization_id IS NULL;

  IF bad_items > 0 OR bad_vehicles > 0 THEN
    RAISE EXCEPTION
      'Cannot enforce NOT NULL: % inventory_item row(s) and % vehicle row(s) have NULL organization_id. Backfill them first, then re-run.',
      bad_items, bad_vehicles;
  END IF;
END $$;

ALTER TABLE inventory_item
  ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE vehicle
  ALTER COLUMN organization_id SET NOT NULL;
