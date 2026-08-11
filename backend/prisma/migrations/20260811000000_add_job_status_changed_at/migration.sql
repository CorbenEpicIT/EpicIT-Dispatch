
ALTER TABLE "job"
  ADD COLUMN "status_changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;


UPDATE "job"
SET "status_changed_at" = CASE
  WHEN "status" = 'Unscheduled' THEN "created_at"
  ELSE "updated_at"
END;

-- CreateIndex
CREATE INDEX "job_organization_id_status_idx" ON "job"("organization_id", "status");
