-- DropIndex
DROP INDEX "inventory_item_sku_key";

-- CreateIndex
CREATE UNIQUE INDEX "inventory_item_organization_id_sku_key" ON "inventory_item"("organization_id", "sku");
