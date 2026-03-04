-- CreateEnum
CREATE TYPE "form_draft_type" AS ENUM ('request', 'quote', 'job', 'job_visit', 'recurring_plan');

-- CreateTable
CREATE TABLE "form_draft" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "form_type" "form_draft_type" NOT NULL,
    "label" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "entity_context_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "form_draft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "form_draft_form_type_idx" ON "form_draft"("form_type");

-- CreateIndex
CREATE INDEX "form_draft_organization_id_form_type_idx" ON "form_draft"("organization_id", "form_type");

-- CreateIndex
CREATE INDEX "form_draft_entity_context_id_idx" ON "form_draft"("entity_context_id");

-- CreateIndex
CREATE INDEX "form_draft_updated_at_idx" ON "form_draft"("updated_at");

-- AddForeignKey
ALTER TABLE "form_draft" ADD CONSTRAINT "form_draft_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
