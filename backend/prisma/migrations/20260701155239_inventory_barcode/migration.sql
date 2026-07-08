-- AlterTable
ALTER TABLE "inventory_item" ADD COLUMN     "barcode" TEXT;

-- CreateIndex
CREATE INDEX "inventory_item_barcode_idx" ON "inventory_item"("barcode");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_item_organization_id_barcode_key" ON "inventory_item"("organization_id", "barcode");
