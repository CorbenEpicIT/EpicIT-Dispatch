-- CreateEnum
CREATE TYPE "invoice_schedule_frequency" AS ENUM ('weekly', 'biweekly', 'monthly', 'quarterly', 'on_visit_completion');

-- CreateEnum
CREATE TYPE "invoice_schedule_billing_basis" AS ENUM ('fixed_amount', 'visit_actuals', 'plan_line_items');

-- CreateEnum
CREATE TYPE "invoice_status" AS ENUM ('Draft', 'Sent', 'Viewed', 'PartiallyPaid', 'Paid', 'Disputed', 'Void');

-- AlterEnum
ALTER TYPE "form_draft_type" ADD VALUE 'invoice';

-- AlterTable
ALTER TABLE "client" ADD COLUMN     "is_tax_exempt" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tax_rate" DECIMAL(5,4);

-- AlterTable
ALTER TABLE "organization" ADD COLUMN     "tax_rate" DECIMAL(5,4) NOT NULL DEFAULT 0;

-- CreateTable
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
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "invoice_number" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "status" "invoice_status" NOT NULL DEFAULT 'Draft',
    "recurring_plan_id" TEXT,
    "issue_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_date" TIMESTAMP(3),
    "payment_terms_days" INTEGER,
    "sent_at" TIMESTAMP(3),
    "viewed_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "voided_at" TIMESTAMP(3),
    "void_reason" TEXT,
    "subtotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "tax_rate" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discount_type" "discount_type",
    "discount_value" DECIMAL(10,2),
    "discount_amount" DECIMAL(10,2),
    "total" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "amount_paid" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "balance_due" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "memo" TEXT,
    "internal_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_dispatcher_id" TEXT,

    CONSTRAINT "invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_line_item" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "source_job_id" TEXT,
    "source_visit_id" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DECIMAL(10,2) NOT NULL,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "item_type" "line_item_type",
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "invoice_line_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_job" (
    "invoice_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "billed_amount" DECIMAL(10,2),

    CONSTRAINT "invoice_job_pkey" PRIMARY KEY ("invoice_id","job_id")
);

-- CreateTable
CREATE TABLE "invoice_visit" (
    "invoice_id" TEXT NOT NULL,
    "visit_id" TEXT NOT NULL,
    "billed_amount" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "invoice_visit_pkey" PRIMARY KEY ("invoice_id","visit_id")
);

-- CreateTable
CREATE TABLE "invoice_payment" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" TEXT,
    "note" TEXT,
    "recorded_by_dispatcher_id" TEXT,
    "recorded_by_tech_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_note" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "invoice_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "creator_tech_id" TEXT,
    "creator_dispatcher_id" TEXT,
    "last_editor_tech_id" TEXT,
    "last_editor_dispatcher_id" TEXT,

    CONSTRAINT "invoice_note_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invoice_schedule_recurring_plan_id_key" ON "invoice_schedule"("recurring_plan_id");

-- CreateIndex
CREATE INDEX "invoice_schedule_recurring_plan_id_idx" ON "invoice_schedule"("recurring_plan_id");

-- CreateIndex
CREATE INDEX "invoice_schedule_is_active_idx" ON "invoice_schedule"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_invoice_number_key" ON "invoice"("invoice_number");

-- CreateIndex
CREATE INDEX "invoice_client_id_idx" ON "invoice"("client_id");

-- CreateIndex
CREATE INDEX "invoice_organization_id_idx" ON "invoice"("organization_id");

-- CreateIndex
CREATE INDEX "invoice_status_idx" ON "invoice"("status");

-- CreateIndex
CREATE INDEX "invoice_invoice_number_idx" ON "invoice"("invoice_number");

-- CreateIndex
CREATE INDEX "invoice_issue_date_idx" ON "invoice"("issue_date");

-- CreateIndex
CREATE INDEX "invoice_due_date_idx" ON "invoice"("due_date");

-- CreateIndex
CREATE INDEX "invoice_recurring_plan_id_idx" ON "invoice"("recurring_plan_id");

-- CreateIndex
CREATE INDEX "invoice_client_id_status_idx" ON "invoice"("client_id", "status");

-- CreateIndex
CREATE INDEX "invoice_line_item_invoice_id_idx" ON "invoice_line_item"("invoice_id");

-- CreateIndex
CREATE INDEX "invoice_line_item_sort_order_idx" ON "invoice_line_item"("sort_order");

-- CreateIndex
CREATE INDEX "invoice_job_job_id_idx" ON "invoice_job"("job_id");

-- CreateIndex
CREATE INDEX "invoice_job_invoice_id_idx" ON "invoice_job"("invoice_id");

-- CreateIndex
CREATE INDEX "invoice_visit_visit_id_idx" ON "invoice_visit"("visit_id");

-- CreateIndex
CREATE INDEX "invoice_visit_invoice_id_idx" ON "invoice_visit"("invoice_id");

-- CreateIndex
CREATE INDEX "invoice_payment_invoice_id_idx" ON "invoice_payment"("invoice_id");

-- CreateIndex
CREATE INDEX "invoice_payment_paid_at_idx" ON "invoice_payment"("paid_at");

-- CreateIndex
CREATE INDEX "invoice_payment_recorded_by_tech_id_idx" ON "invoice_payment"("recorded_by_tech_id");

-- CreateIndex
CREATE INDEX "invoice_note_invoice_id_idx" ON "invoice_note"("invoice_id");

-- CreateIndex
CREATE INDEX "client_is_tax_exempt_idx" ON "client"("is_tax_exempt");

-- AddForeignKey
ALTER TABLE "invoice_schedule" ADD CONSTRAINT "invoice_schedule_recurring_plan_id_fkey" FOREIGN KEY ("recurring_plan_id") REFERENCES "recurring_plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_recurring_plan_id_fkey" FOREIGN KEY ("recurring_plan_id") REFERENCES "recurring_plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_created_by_dispatcher_id_fkey" FOREIGN KEY ("created_by_dispatcher_id") REFERENCES "dispatcher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line_item" ADD CONSTRAINT "invoice_line_item_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_job" ADD CONSTRAINT "invoice_job_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_job" ADD CONSTRAINT "invoice_job_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_visit" ADD CONSTRAINT "invoice_visit_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_visit" ADD CONSTRAINT "invoice_visit_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "job_visit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_payment" ADD CONSTRAINT "invoice_payment_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_payment" ADD CONSTRAINT "invoice_payment_recorded_by_dispatcher_id_fkey" FOREIGN KEY ("recorded_by_dispatcher_id") REFERENCES "dispatcher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_payment" ADD CONSTRAINT "invoice_payment_recorded_by_tech_id_fkey" FOREIGN KEY ("recorded_by_tech_id") REFERENCES "technician"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_note" ADD CONSTRAINT "invoice_note_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_note" ADD CONSTRAINT "invoice_note_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_note" ADD CONSTRAINT "invoice_note_creator_tech_id_fkey" FOREIGN KEY ("creator_tech_id") REFERENCES "technician"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_note" ADD CONSTRAINT "invoice_note_creator_dispatcher_id_fkey" FOREIGN KEY ("creator_dispatcher_id") REFERENCES "dispatcher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_note" ADD CONSTRAINT "invoice_note_last_editor_tech_id_fkey" FOREIGN KEY ("last_editor_tech_id") REFERENCES "technician"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_note" ADD CONSTRAINT "invoice_note_last_editor_dispatcher_id_fkey" FOREIGN KEY ("last_editor_dispatcher_id") REFERENCES "dispatcher"("id") ON DELETE SET NULL ON UPDATE CASCADE;
