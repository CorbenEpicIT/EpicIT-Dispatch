-- AlterTable: add tax fields to job_visit_line_item
ALTER TABLE "job_visit_line_item" ADD COLUMN "tax_group_id" TEXT,
ADD COLUMN "taxable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "tax_amount" DECIMAL(10,2);

-- AddForeignKey
ALTER TABLE "job_visit_line_item" ADD CONSTRAINT "job_visit_line_item_tax_group_id_fkey" FOREIGN KEY ("tax_group_id") REFERENCES "tax_group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "job_visit_line_item_tax_group_id_idx" ON "job_visit_line_item"("tax_group_id");

-- AlterTable: add tax_snapshot to job and job_visit
ALTER TABLE "job" ADD COLUMN "tax_snapshot" JSONB;
ALTER TABLE "job_visit" ADD COLUMN "tax_snapshot" JSONB;
