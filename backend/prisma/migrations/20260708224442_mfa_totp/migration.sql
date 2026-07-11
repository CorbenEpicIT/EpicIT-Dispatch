-- AlterTable
ALTER TABLE "organization" ADD COLUMN     "mfa_required" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "vehicle_restock_line" RENAME CONSTRAINT "vehicle_eod_restock_line_pkey" TO "vehicle_restock_line_pkey";

-- AlterTable
ALTER TABLE "vehicle_restock_record" RENAME CONSTRAINT "vehicle_eod_record_pkey" TO "vehicle_restock_record_pkey";

-- CreateTable
CREATE TABLE "mfa_credential" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "enrolled_at" TIMESTAMP(3),
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mfa_credential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfa_recovery_code" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mfa_recovery_code_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mfa_credential_user_id_role_key" ON "mfa_credential"("user_id", "role");

-- CreateIndex
CREATE INDEX "mfa_recovery_code_user_id_role_idx" ON "mfa_recovery_code"("user_id", "role");

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
