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

*/
-- DropForeignKey
ALTER TABLE "invoice" DROP CONSTRAINT "invoice_client_id_fkey";

-- DropForeignKey
ALTER TABLE "invoice" DROP CONSTRAINT "invoice_created_by_dispatcher_id_fkey";

-- DropForeignKey
ALTER TABLE "invoice" DROP CONSTRAINT "invoice_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "invoice" DROP CONSTRAINT "invoice_recurring_plan_id_fkey";

-- DropForeignKey
ALTER TABLE "invoice_job" DROP CONSTRAINT "invoice_job_invoice_id_fkey";

-- DropForeignKey
ALTER TABLE "invoice_job" DROP CONSTRAINT "invoice_job_job_id_fkey";

-- DropForeignKey
ALTER TABLE "invoice_line_item" DROP CONSTRAINT "invoice_line_item_invoice_id_fkey";

-- DropForeignKey
ALTER TABLE "invoice_note" DROP CONSTRAINT "invoice_note_creator_dispatcher_id_fkey";

-- DropForeignKey
ALTER TABLE "invoice_note" DROP CONSTRAINT "invoice_note_creator_tech_id_fkey";

-- DropForeignKey
ALTER TABLE "invoice_note" DROP CONSTRAINT "invoice_note_invoice_id_fkey";

-- DropForeignKey
ALTER TABLE "invoice_note" DROP CONSTRAINT "invoice_note_last_editor_dispatcher_id_fkey";

-- DropForeignKey
ALTER TABLE "invoice_note" DROP CONSTRAINT "invoice_note_last_editor_tech_id_fkey";

-- DropForeignKey
ALTER TABLE "invoice_note" DROP CONSTRAINT "invoice_note_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "invoice_payment" DROP CONSTRAINT "invoice_payment_invoice_id_fkey";

-- DropForeignKey
ALTER TABLE "invoice_payment" DROP CONSTRAINT "invoice_payment_recorded_by_dispatcher_id_fkey";

-- DropForeignKey
ALTER TABLE "invoice_payment" DROP CONSTRAINT "invoice_payment_recorded_by_tech_id_fkey";

-- DropForeignKey
ALTER TABLE "invoice_schedule" DROP CONSTRAINT "invoice_schedule_recurring_plan_id_fkey";

-- DropForeignKey
ALTER TABLE "invoice_visit" DROP CONSTRAINT "invoice_visit_invoice_id_fkey";

-- DropForeignKey
ALTER TABLE "invoice_visit" DROP CONSTRAINT "invoice_visit_visit_id_fkey";

-- DropIndex
DROP INDEX "client_is_tax_exempt_idx";

-- AlterTable
ALTER TABLE "client" DROP COLUMN "is_tax_exempt",
DROP COLUMN "tax_rate";

-- AlterTable
ALTER TABLE "organization" DROP COLUMN "tax_rate";

-- DropTable
DROP TABLE "invoice";

-- DropTable
DROP TABLE "invoice_job";

-- DropTable
DROP TABLE "invoice_line_item";

-- DropTable
DROP TABLE "invoice_note";

-- DropTable
DROP TABLE "invoice_payment";

-- DropTable
DROP TABLE "invoice_schedule";

-- DropTable
DROP TABLE "invoice_visit";

-- DropEnum
DROP TYPE "invoice_schedule_billing_basis";

-- DropEnum
DROP TYPE "invoice_schedule_frequency";

-- DropEnum
DROP TYPE "invoice_status";
