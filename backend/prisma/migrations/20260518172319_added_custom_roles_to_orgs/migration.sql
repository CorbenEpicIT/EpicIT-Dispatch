-- AlterTable
ALTER TABLE "dispatcher" ADD COLUMN     "organization_role_id" TEXT;

-- AlterTable
ALTER TABLE "technician" ADD COLUMN     "organization_role_id" TEXT;

-- CreateTable
CREATE TABLE "organization_role" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "name" TEXT NOT NULL,
    "base_tier" TEXT NOT NULL,
    "permissions" TEXT[],

    CONSTRAINT "organization_role_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "organization_role_organization_id_idx" ON "organization_role"("organization_id");

-- AddForeignKey
ALTER TABLE "organization_role" ADD CONSTRAINT "organization_role_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
