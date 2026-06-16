-- AlterTable
ALTER TABLE "invoice_line_item" ADD COLUMN     "inventory_item_id" TEXT;

-- CreateTable
CREATE TABLE "item_external_mapping" (
    "id" TEXT NOT NULL,
    "inventory_item_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,

    CONSTRAINT "item_external_mapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "item_external_mapping_inventory_item_id_idx" ON "item_external_mapping"("inventory_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "item_external_mapping_provider_external_id_key" ON "item_external_mapping"("provider", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "item_external_mapping_provider_inventory_item_id_key" ON "item_external_mapping"("provider", "inventory_item_id");

-- CreateIndex
CREATE INDEX "invoice_line_item_inventory_item_id_idx" ON "invoice_line_item"("inventory_item_id");

-- AddForeignKey
ALTER TABLE "item_external_mapping" ADD CONSTRAINT "item_external_mapping_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line_item" ADD CONSTRAINT "invoice_line_item_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
