-- AlterTable: add billing automation fields to invoice_schedule (IF EXISTS — table dropped in some environments)
ALTER TABLE IF EXISTS "invoice_schedule" ADD COLUMN IF NOT EXISTS "auto_send" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE IF EXISTS "invoice_schedule" ADD COLUMN IF NOT EXISTS "memo_template" TEXT;
ALTER TABLE IF EXISTS "invoice_schedule" ADD COLUMN IF NOT EXISTS "next_invoice_at" TIMESTAMP(3);
ALTER TABLE IF EXISTS "invoice_schedule" ADD COLUMN IF NOT EXISTS "last_invoiced_at" TIMESTAMP(3);

-- CreateIndex: composite index for cron job queries (only if invoice_schedule table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'invoice_schedule') THEN
    CREATE INDEX IF NOT EXISTS "invoice_schedule_is_active_next_invoice_at_idx" ON "invoice_schedule"("is_active", "next_invoice_at");
  END IF;
END $$;