-- CreateIndex
CREATE INDEX "invoice_organization_id_created_at_idx" ON "invoice"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "invoice_organization_id_issue_date_idx" ON "invoice"("organization_id", "issue_date");

-- CreateIndex
CREATE INDEX "job_organization_id_created_at_idx" ON "job"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "job_visit_status_actual_end_at_idx" ON "job_visit"("status", "actual_end_at");

-- CreateIndex
CREATE INDEX "quote_organization_id_created_at_idx" ON "quote"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "request_organization_id_created_at_idx" ON "request"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "technician_shift_org_id_started_at_idx" ON "technician_shift"("org_id", "started_at");
