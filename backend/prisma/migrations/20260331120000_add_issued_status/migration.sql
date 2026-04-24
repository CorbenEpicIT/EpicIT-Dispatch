-- Add "Issued" status to quote_status and invoice_status enums
-- Represents a finalized document that has not yet been delivered

-- PostgreSQL requires enum values to be added before first use.
-- Values inserted BEFORE 'Sent' so the ordering remains Draft → Issued → Sent → …

ALTER TYPE "quote_status" ADD VALUE 'Issued' BEFORE 'Sent';
ALTER TYPE "invoice_status" ADD VALUE 'Issued' BEFORE 'Sent';

-- Add issued_at timestamp columns (table names are lowercase, matching Prisma model names)
ALTER TABLE "quote" ADD COLUMN "issued_at" TIMESTAMP(3);
ALTER TABLE "invoice" ADD COLUMN "issued_at" TIMESTAMP(3);
