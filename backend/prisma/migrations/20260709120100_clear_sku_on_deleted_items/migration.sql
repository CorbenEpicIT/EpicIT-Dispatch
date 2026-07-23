UPDATE inventory_item
SET sku = NULL
WHERE is_active = false
  AND sku IS NOT NULL;
