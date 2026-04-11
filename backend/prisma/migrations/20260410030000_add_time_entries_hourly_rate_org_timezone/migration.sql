-- AlterTable: add cancellation_reason to job_visit
ALTER TABLE "job_visit" ADD COLUMN "cancellation_reason" TEXT;

-- AlterTable: add hourly_rate to technician
ALTER TABLE "technician" ADD COLUMN "hourly_rate" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable: add timezone to organization
ALTER TABLE "organization" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'America/Chicago';

-- CreateTable
CREATE TABLE "visit_tech_time_entry" (
    "id" TEXT NOT NULL,
    "visit_id" TEXT NOT NULL,
    "tech_id" TEXT NOT NULL,
    "clocked_in_at" TIMESTAMP(3) NOT NULL,
    "clocked_out_at" TIMESTAMP(3),
    "hours_worked" DECIMAL(8,4),
    "line_item_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visit_tech_time_entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "visit_tech_time_entry_line_item_id_key" ON "visit_tech_time_entry"("line_item_id");

-- CreateIndex
CREATE INDEX "visit_tech_time_entry_visit_id_idx" ON "visit_tech_time_entry"("visit_id");

-- CreateIndex
CREATE INDEX "visit_tech_time_entry_tech_id_idx" ON "visit_tech_time_entry"("tech_id");

-- CreateIndex
CREATE INDEX "visit_tech_time_entry_visit_id_tech_id_idx" ON "visit_tech_time_entry"("visit_id", "tech_id");

-- CreateIndex
CREATE INDEX "visit_tech_time_entry_clocked_out_at_idx" ON "visit_tech_time_entry"("clocked_out_at");

-- AddForeignKey
ALTER TABLE "visit_tech_time_entry" ADD CONSTRAINT "visit_tech_time_entry_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "job_visit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_tech_time_entry" ADD CONSTRAINT "visit_tech_time_entry_tech_id_fkey" FOREIGN KEY ("tech_id") REFERENCES "technician"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_tech_time_entry" ADD CONSTRAINT "visit_tech_time_entry_line_item_id_fkey" FOREIGN KEY ("line_item_id") REFERENCES "job_visit_line_item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
