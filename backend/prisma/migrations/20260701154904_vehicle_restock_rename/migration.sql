-- AlterTable
ALTER TABLE "vehicle_restock_line" RENAME CONSTRAINT "vehicle_eod_restock_line_pkey" TO "vehicle_restock_line_pkey";

-- AlterTable
ALTER TABLE "vehicle_restock_record" RENAME CONSTRAINT "vehicle_eod_record_pkey" TO "vehicle_restock_record_pkey";

-- RenameForeignKey
ALTER TABLE "stock_movement" RENAME CONSTRAINT "stock_movement_eod_record_id_fkey" TO "stock_movement_restock_record_id_fkey";

-- RenameForeignKey
ALTER TABLE "vehicle_readiness" RENAME CONSTRAINT "vehicle_readiness_eod_record_id_fkey" TO "vehicle_readiness_restock_record_id_fkey";

-- RenameForeignKey
ALTER TABLE "vehicle_restock_line" RENAME CONSTRAINT "vehicle_eod_restock_line_eod_record_id_fkey" TO "vehicle_restock_line_restock_record_id_fkey";

-- RenameForeignKey
ALTER TABLE "vehicle_restock_line" RENAME CONSTRAINT "vehicle_eod_restock_line_stock_item_id_fkey" TO "vehicle_restock_line_stock_item_id_fkey";

-- RenameForeignKey
ALTER TABLE "vehicle_restock_record" RENAME CONSTRAINT "vehicle_eod_record_completed_by_id_fkey" TO "vehicle_restock_record_completed_by_id_fkey";

-- RenameForeignKey
ALTER TABLE "vehicle_restock_record" RENAME CONSTRAINT "vehicle_eod_record_completed_by_tech_id_fkey" TO "vehicle_restock_record_completed_by_tech_id_fkey";

-- RenameForeignKey
ALTER TABLE "vehicle_restock_record" RENAME CONSTRAINT "vehicle_eod_record_vehicle_id_fkey" TO "vehicle_restock_record_vehicle_id_fkey";

-- RenameIndex
ALTER INDEX "stock_movement_eod_record_id_idx" RENAME TO "stock_movement_restock_record_id_idx";

-- RenameIndex
ALTER INDEX "vehicle_readiness_eod_record_id_key" RENAME TO "vehicle_readiness_restock_record_id_key";

-- RenameIndex
ALTER INDEX "vehicle_eod_restock_line_eod_record_id_idx" RENAME TO "vehicle_restock_line_restock_record_id_idx";

-- RenameIndex
ALTER INDEX "vehicle_eod_restock_line_stock_item_id_idx" RENAME TO "vehicle_restock_line_stock_item_id_idx";

-- RenameIndex
ALTER INDEX "vehicle_eod_record_completed_at_idx" RENAME TO "vehicle_restock_record_completed_at_idx";

-- RenameIndex
ALTER INDEX "vehicle_eod_record_organization_id_idx" RENAME TO "vehicle_restock_record_organization_id_idx";

-- RenameIndex
ALTER INDEX "vehicle_eod_record_vehicle_id_idx" RENAME TO "vehicle_restock_record_vehicle_id_idx";
