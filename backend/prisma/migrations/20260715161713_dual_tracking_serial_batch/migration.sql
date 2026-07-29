-- DropForeignKey
ALTER TABLE "inventory_item" DROP CONSTRAINT "inventory_item_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "vehicle" DROP CONSTRAINT "vehicle_organization_id_fkey";

-- AddForeignKey
ALTER TABLE "inventory_item" ADD CONSTRAINT "inventory_item_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle" ADD CONSTRAINT "vehicle_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
