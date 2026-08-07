-- AlterTable
ALTER TABLE "project" ADD COLUMN     "manager_dispatcher_id" TEXT;

-- CreateIndex
CREATE INDEX "project_manager_dispatcher_id_idx" ON "project"("manager_dispatcher_id");

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_manager_dispatcher_id_fkey" FOREIGN KEY ("manager_dispatcher_id") REFERENCES "dispatcher"("id") ON DELETE SET NULL ON UPDATE CASCADE;
