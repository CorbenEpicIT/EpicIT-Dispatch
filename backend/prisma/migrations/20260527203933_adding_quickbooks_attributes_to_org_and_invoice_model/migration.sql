/*
  Warnings:

  - A unique constraint covering the columns `[qb_invoice_id]` on the table `invoice` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "qb_sync_status" AS ENUM ('not_synced', 'synced', 'failed');

-- DropIndex
DROP INDEX "job_visit_line_item_tax_group_id_idx";

-- AlterTable
ALTER TABLE "invoice" ADD COLUMN     "qb_invoice_id" TEXT,
ADD COLUMN     "qb_sync_status" "qb_sync_status" NOT NULL DEFAULT 'not_synced';

-- AlterTable
ALTER TABLE "invoice_line_item" ALTER COLUMN "tax_amount" DROP NOT NULL,
ALTER COLUMN "tax_amount" DROP DEFAULT;

-- AlterTable
ALTER TABLE "job_line_item" ALTER COLUMN "tax_amount" DROP NOT NULL,
ALTER COLUMN "tax_amount" DROP DEFAULT;

-- AlterTable
ALTER TABLE "organization" ADD COLUMN     "qb_access_token" TEXT,
ADD COLUMN     "qb_realm_id" TEXT,
ADD COLUMN     "qb_refresh_token" TEXT,
ADD COLUMN     "qb_token_expires_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "quote_line_item" ALTER COLUMN "tax_amount" DROP NOT NULL,
ALTER COLUMN "tax_amount" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX "invoice_qb_invoice_id_key" ON "invoice"("qb_invoice_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "technician_shift_tech_id_ended_at_idx" ON "technician_shift"("tech_id", "ended_at");

-- AddForeignKey
ALTER TABLE "technician" ADD CONSTRAINT "technician_organization_role_id_fkey" FOREIGN KEY ("organization_role_id") REFERENCES "organization_role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatcher" ADD CONSTRAINT "dispatcher_organization_role_id_fkey" FOREIGN KEY ("organization_role_id") REFERENCES "organization_role"("id") ON DELETE SET NULL ON UPDATE CASCADE;
