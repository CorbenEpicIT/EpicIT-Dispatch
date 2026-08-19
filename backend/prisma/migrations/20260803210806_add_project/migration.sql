-- CreateEnum
CREATE TYPE "project_status" AS ENUM ('Planning', 'Active', 'OnHold', 'Completed', 'Cancelled');

-- AlterTable
ALTER TABLE "job" ADD COLUMN     "project_id" TEXT;

-- CreateTable
CREATE TABLE "project" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "project_number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "project_status" NOT NULL DEFAULT 'Planning',
    "priority" "priority" NOT NULL DEFAULT 'Medium',
    "address" TEXT,
    "coords" JSONB,
    "client_id" TEXT NOT NULL,
    "budget" DECIMAL(12,2),
    "starts_at" TIMESTAMP(3),
    "target_end_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancellation_reason" TEXT,

    CONSTRAINT "project_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_client_id_idx" ON "project"("client_id");

-- CreateIndex
CREATE INDEX "project_status_idx" ON "project"("status");

-- CreateIndex
CREATE INDEX "project_organization_id_created_at_idx" ON "project"("organization_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "project_organization_id_project_number_key" ON "project"("organization_id", "project_number");

-- CreateIndex
CREATE INDEX "job_project_id_idx" ON "job"("project_id");

-- AddForeignKey
ALTER TABLE "job" ADD CONSTRAINT "job_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
