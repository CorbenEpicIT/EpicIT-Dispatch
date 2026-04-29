/*
  Warnings:

  - A unique constraint covering the columns `[organization_id,invoice_number]` on the table `invoice` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[organization_id,job_number]` on the table `job` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[organization_id,quote_number]` on the table `quote` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "invoice_invoice_number_key";

-- DropIndex
DROP INDEX "job_job_number_key";

-- DropIndex
DROP INDEX "quote_quote_number_key";

-- CreateIndex
CREATE UNIQUE INDEX "invoice_organization_id_invoice_number_key" ON "invoice"("organization_id", "invoice_number");

-- CreateIndex
CREATE UNIQUE INDEX "job_organization_id_job_number_key" ON "job"("organization_id", "job_number");

-- CreateIndex
CREATE UNIQUE INDEX "quote_organization_id_quote_number_key" ON "quote"("organization_id", "quote_number");
