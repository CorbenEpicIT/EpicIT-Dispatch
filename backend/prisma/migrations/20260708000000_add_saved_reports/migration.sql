-- AlterTable
ALTER TABLE "dispatcher" ADD COLUMN     "report_layout" JSONB;

-- CreateTable
CREATE TABLE "saved_report" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "source" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_favorite" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "dispatcher_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_favorite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "saved_report_organization_id_idx" ON "saved_report"("organization_id");

-- CreateIndex
CREATE INDEX "saved_report_created_by_id_idx" ON "saved_report"("created_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "saved_report_organization_id_name_key" ON "saved_report"("organization_id", "name");

-- CreateIndex
CREATE INDEX "report_favorite_dispatcher_id_idx" ON "report_favorite"("dispatcher_id");

-- CreateIndex
CREATE INDEX "report_favorite_organization_id_idx" ON "report_favorite"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "report_favorite_dispatcher_id_kind_ref_key" ON "report_favorite"("dispatcher_id", "kind", "ref");

-- AddForeignKey
ALTER TABLE "saved_report" ADD CONSTRAINT "saved_report_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_favorite" ADD CONSTRAINT "report_favorite_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
