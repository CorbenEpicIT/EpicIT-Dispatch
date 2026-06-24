/*
  Warnings:

  - A unique constraint covering the columns `[provider,account_id,external_id]` on the table `client_external_mapping` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[account_id,qb_invoice_id]` on the table `invoice` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[account_id,qb_payment_id]` on the table `invoice_payment` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[provider,external_id,account_id]` on the table `item_external_mapping` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[provider,inventory_item_id,account_id]` on the table `item_external_mapping` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "client_external_mapping_provider_external_id_key";

-- DropIndex
DROP INDEX "invoice_qb_invoice_id_key";

-- DropIndex
DROP INDEX "invoice_payment_qb_payment_id_key";

-- DropIndex
DROP INDEX "item_external_mapping_provider_external_id_key";

-- DropIndex
DROP INDEX "item_external_mapping_provider_inventory_item_id_key";

-- AlterTable
ALTER TABLE "client_external_mapping" ADD COLUMN     "account_id" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "invoice" ADD COLUMN     "account_id" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "invoice_payment" ADD COLUMN     "account_id" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "item_external_mapping" ADD COLUMN     "account_id" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE UNIQUE INDEX "client_external_mapping_provider_account_id_external_id_key" ON "client_external_mapping"("provider", "account_id", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_account_id_qb_invoice_id_key" ON "invoice"("account_id", "qb_invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_payment_account_id_qb_payment_id_key" ON "invoice_payment"("account_id", "qb_payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "item_external_mapping_provider_external_id_account_id_key" ON "item_external_mapping"("provider", "external_id", "account_id");

-- CreateIndex
CREATE UNIQUE INDEX "item_external_mapping_provider_inventory_item_id_account_id_key" ON "item_external_mapping"("provider", "inventory_item_id", "account_id");
