-- Syncs pre-existing schema.prisma drift that was committed without a migration.
-- These changes belong to the vehicle-readiness / EOD-record, inventory, and
-- stock-movement features (not QuickBooks). Separated out so the QB payment
-- migration stays clean. NOTE: the vehicle_readiness eod_record_id unique
-- constraint can fail if duplicate values exist on a non-reset/production DB.

-- DropForeignKey
ALTER TABLE "vehicle_readiness" DROP CONSTRAINT "vehicle_readiness_confirmed_by_id_fkey";
-- DropForeignKey
ALTER TABLE "vehicle_readiness" DROP CONSTRAINT "vehicle_readiness_confirmed_by_tech_id_fkey";
-- DropIndex
DROP INDEX "inventory_item_provisional_idx";
-- CreateIndex
CREATE UNIQUE INDEX "vehicle_readiness_eod_record_id_key" ON "vehicle_readiness"("eod_record_id");
-- AddForeignKey
ALTER TABLE "vehicle_readiness" ADD CONSTRAINT "vehicle_readiness_confirmed_by_id_fkey" FOREIGN KEY ("confirmed_by_id") REFERENCES "dispatcher"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "vehicle_readiness" ADD CONSTRAINT "vehicle_readiness_confirmed_by_tech_id_fkey" FOREIGN KEY ("confirmed_by_tech_id") REFERENCES "technician"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- RenameIndex
ALTER INDEX "stock_movement_organization_id_inventory_item_id_created_a_idx" RENAME TO "stock_movement_organization_id_inventory_item_id_created_at_idx";
-- RenameIndex
ALTER INDEX "vrr_organization_id_idx" RENAME TO "vehicle_restock_request_organization_id_idx";
