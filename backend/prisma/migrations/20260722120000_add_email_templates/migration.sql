-- CreateTable
CREATE TABLE "email_template" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "category" "email_template_category" NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "updated_by_dispatcher_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_template_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_template_organization_id_idx" ON "email_template"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "email_template_organization_id_category_key" ON "email_template"("organization_id", "category");

-- AddForeignKey
ALTER TABLE "email_template" ADD CONSTRAINT "email_template_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
