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

-- CreateEnum (new invoice schema)
CREATE TYPE "invoice_status" AS ENUM ('Draft', 'Sent', 'Viewed', 'PartiallyPaid', 'Paid', 'Disputed', 'Void');

CREATE TYPE "invoice_schedule_frequency" AS ENUM ('weekly', 'biweekly', 'monthly', 'quarterly', 'on_visit_completion');

CREATE TYPE "invoice_schedule_billing_basis" AS ENUM ('fixed_amount', 'visit_actuals', 'plan_line_items', 'invoice');

-- CreateTable (invoice_schedule with all final columns — migration 3 is a no-op)
CREATE TABLE "invoice_schedule" (
    "id" TEXT NOT NULL,
    "recurring_plan_id" TEXT NOT NULL,
    "frequency" "invoice_schedule_frequency" NOT NULL,
    "billing_basis" "invoice_schedule_billing_basis" NOT NULL,
    "fixed_amount" DECIMAL(10,2),
    "day_of_month" INTEGER,
    "day_of_week" "weekday",
    "generate_days_before" INTEGER NOT NULL DEFAULT 0,
    "payment_terms_days" INTEGER,
    "auto_send" BOOLEAN NOT NULL DEFAULT false,
    "memo_template" TEXT,
    "next_invoice_at" TIMESTAMP(3),
    "last_invoiced_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_schedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invoice_schedule_recurring_plan_id_key" ON "invoice_schedule"("recurring_plan_id");
CREATE INDEX "invoice_schedule_recurring_plan_id_idx" ON "invoice_schedule"("recurring_plan_id");
CREATE INDEX "invoice_schedule_is_active_idx" ON "invoice_schedule"("is_active");
CREATE INDEX "invoice_schedule_is_active_next_invoice_at_idx" ON "invoice_schedule"("is_active", "next_invoice_at");

-- AddForeignKey
ALTER TABLE "invoice_schedule" ADD CONSTRAINT "invoice_schedule_recurring_plan_id_fkey" FOREIGN KEY ("recurring_plan_id") REFERENCES "recurring_plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
