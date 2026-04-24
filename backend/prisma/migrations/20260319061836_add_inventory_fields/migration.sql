/*
  Warnings:

  - You are about to drop the column `is_tax_exempt` on the `client` table. All the data in the column will be lost.
  - You are about to drop the column `tax_rate` on the `client` table. All the data in the column will be lost.
  - You are about to drop the column `tax_rate` on the `organization` table. All the data in the column will be lost.
  - You are about to drop the `invoice` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `invoice_job` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `invoice_line_item` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `invoice_note` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `invoice_payment` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `invoice_schedule` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `invoice_visit` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `updated_at` to the `inventory_item` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey (IF EXISTS — invoice tables may not exist in all environments)
ALTER TABLE IF EXISTS "invoice" DROP CONSTRAINT IF EXISTS "invoice_client_id_fkey";
ALTER TABLE IF EXISTS "invoice" DROP CONSTRAINT IF EXISTS "invoice_created_by_dispatcher_id_fkey";
ALTER TABLE IF EXISTS "invoice" DROP CONSTRAINT IF EXISTS "invoice_organization_id_fkey";
ALTER TABLE IF EXISTS "invoice" DROP CONSTRAINT IF EXISTS "invoice_recurring_plan_id_fkey";
ALTER TABLE IF EXISTS "invoice_job" DROP CONSTRAINT IF EXISTS "invoice_job_invoice_id_fkey";
ALTER TABLE IF EXISTS "invoice_job" DROP CONSTRAINT IF EXISTS "invoice_job_job_id_fkey";
ALTER TABLE IF EXISTS "invoice_line_item" DROP CONSTRAINT IF EXISTS "invoice_line_item_invoice_id_fkey";
ALTER TABLE IF EXISTS "invoice_note" DROP CONSTRAINT IF EXISTS "invoice_note_creator_dispatcher_id_fkey";
ALTER TABLE IF EXISTS "invoice_note" DROP CONSTRAINT IF EXISTS "invoice_note_creator_tech_id_fkey";
ALTER TABLE IF EXISTS "invoice_note" DROP CONSTRAINT IF EXISTS "invoice_note_invoice_id_fkey";
ALTER TABLE IF EXISTS "invoice_note" DROP CONSTRAINT IF EXISTS "invoice_note_last_editor_dispatcher_id_fkey";
ALTER TABLE IF EXISTS "invoice_note" DROP CONSTRAINT IF EXISTS "invoice_note_last_editor_tech_id_fkey";
ALTER TABLE IF EXISTS "invoice_note" DROP CONSTRAINT IF EXISTS "invoice_note_organization_id_fkey";
ALTER TABLE IF EXISTS "invoice_payment" DROP CONSTRAINT IF EXISTS "invoice_payment_invoice_id_fkey";
ALTER TABLE IF EXISTS "invoice_payment" DROP CONSTRAINT IF EXISTS "invoice_payment_recorded_by_dispatcher_id_fkey";
ALTER TABLE IF EXISTS "invoice_payment" DROP CONSTRAINT IF EXISTS "invoice_payment_recorded_by_tech_id_fkey";
ALTER TABLE IF EXISTS "invoice_schedule" DROP CONSTRAINT IF EXISTS "invoice_schedule_recurring_plan_id_fkey";
ALTER TABLE IF EXISTS "invoice_visit" DROP CONSTRAINT IF EXISTS "invoice_visit_invoice_id_fkey";
ALTER TABLE IF EXISTS "invoice_visit" DROP CONSTRAINT IF EXISTS "invoice_visit_visit_id_fkey";

-- DropIndex
DROP INDEX IF EXISTS "client_is_tax_exempt_idx";

-- AlterTable
ALTER TABLE "client"
  DROP COLUMN IF EXISTS "is_tax_exempt",
  DROP COLUMN IF EXISTS "tax_rate";

-- AlterTable
ALTER TABLE "inventory_item" ADD COLUMN     "alert_email" TEXT,
ADD COLUMN     "alert_emails_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "image_urls" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "job" ADD COLUMN     "deduct_inventory_on" TEXT NOT NULL DEFAULT 'job_completion';

-- AlterTable
ALTER TABLE "job_visit_line_item" ADD COLUMN     "inventory_item_id" TEXT;

-- AlterTable
ALTER TABLE "organization" DROP COLUMN IF EXISTS "tax_rate";

-- DropTable (IF EXISTS — may not exist in all environments)
DROP TABLE IF EXISTS "invoice";
DROP TABLE IF EXISTS "invoice_job";
DROP TABLE IF EXISTS "invoice_line_item";
DROP TABLE IF EXISTS "invoice_note";
DROP TABLE IF EXISTS "invoice_payment";
DROP TABLE IF EXISTS "invoice_schedule";
DROP TABLE IF EXISTS "invoice_visit";

-- DropEnum (IF EXISTS)
DROP TYPE IF EXISTS "invoice_schedule_billing_basis";
DROP TYPE IF EXISTS "invoice_schedule_frequency";
DROP TYPE IF EXISTS "invoice_status";

-- CreateIndex
CREATE INDEX "inventory_item_created_at_idx" ON "inventory_item"("created_at");

-- CreateIndex
CREATE INDEX "job_visit_line_item_inventory_item_id_idx" ON "job_visit_line_item"("inventory_item_id");

-- AddForeignKey
ALTER TABLE "job_visit_line_item" ADD CONSTRAINT "job_visit_line_item_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
