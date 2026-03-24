-- AlterTable: add billing automation fields to invoice_schedule
ALTER TABLE "invoice_schedule" ADD COLUMN "auto_send" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "invoice_schedule" ADD COLUMN "memo_template" TEXT;
ALTER TABLE "invoice_schedule" ADD COLUMN "next_invoice_at" TIMESTAMP(3);
ALTER TABLE "invoice_schedule" ADD COLUMN "last_invoiced_at" TIMESTAMP(3);

-- CreateIndex: composite index for cron job queries (find active schedules due for generation)
CREATE INDEX "invoice_schedule_is_active_next_invoice_at_idx" ON "invoice_schedule"("is_active", "next_invoice_at");
