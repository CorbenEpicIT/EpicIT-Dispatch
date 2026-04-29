-- DropIndex
DROP INDEX "job_job_number_key";

-- CreateIndex
CREATE UNIQUE INDEX "job_organization_id_job_number_key" ON "job"("organization_id", "job_number");
