-- CreateEnum
CREATE TYPE "serial_unit_status" AS ENUM ('in_warehouse', 'on_vehicle', 'consumed', 'lost', 'returned');

-- AlterTable
ALTER TABLE "inventory_item" ADD COLUMN     "is_batch_tracked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_serialized" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "serial_unit" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "inventory_item_id" TEXT NOT NULL,
    "serial_number" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "serial_unit_status" NOT NULL DEFAULT 'in_warehouse',
    "current_vehicle_id" TEXT,
    "consumed_at" TIMESTAMP(3),
    "consumed_visit_id" TEXT,
    "consumed_line_item_id" TEXT,
    "client_id" TEXT,
    "batch_id" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "serial_unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_batch" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "inventory_item_id" TEXT NOT NULL,
    "batch_number" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expires_at" DATE,
    "supplier" TEXT,
    "recalled_at" TIMESTAMP(3),
    "qty_received" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "qty_in_warehouse" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_stock_batch" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "qty_on_hand" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_stock_batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movement_serial" (
    "id" TEXT NOT NULL,
    "movement_id" TEXT NOT NULL,
    "serial_unit_id" TEXT NOT NULL,

    CONSTRAINT "stock_movement_serial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movement_batch" (
    "id" TEXT NOT NULL,
    "movement_id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "qty" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "stock_movement_batch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "serial_unit_code_key" ON "serial_unit"("code");

-- CreateIndex
CREATE INDEX "serial_unit_organization_id_status_idx" ON "serial_unit"("organization_id", "status");

-- CreateIndex
CREATE INDEX "serial_unit_inventory_item_id_status_idx" ON "serial_unit"("inventory_item_id", "status");

-- CreateIndex
CREATE INDEX "serial_unit_current_vehicle_id_idx" ON "serial_unit"("current_vehicle_id");

-- CreateIndex
CREATE INDEX "serial_unit_client_id_idx" ON "serial_unit"("client_id");

-- CreateIndex
CREATE INDEX "serial_unit_consumed_visit_id_idx" ON "serial_unit"("consumed_visit_id");

-- CreateIndex
CREATE INDEX "serial_unit_batch_id_idx" ON "serial_unit"("batch_id");

-- CreateIndex
CREATE INDEX "serial_unit_organization_id_serial_number_idx" ON "serial_unit"("organization_id", "serial_number");

-- CreateIndex
CREATE UNIQUE INDEX "serial_unit_organization_id_inventory_item_id_serial_number_key" ON "serial_unit"("organization_id", "inventory_item_id", "serial_number");

-- CreateIndex
CREATE UNIQUE INDEX "stock_batch_code_key" ON "stock_batch"("code");

-- CreateIndex
CREATE INDEX "stock_batch_inventory_item_id_received_at_idx" ON "stock_batch"("inventory_item_id", "received_at");

-- CreateIndex
CREATE INDEX "stock_batch_organization_id_idx" ON "stock_batch"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_batch_organization_id_inventory_item_id_batch_number_key" ON "stock_batch"("organization_id", "inventory_item_id", "batch_number");

-- CreateIndex
CREATE INDEX "vehicle_stock_batch_vehicle_id_idx" ON "vehicle_stock_batch"("vehicle_id");

-- CreateIndex
CREATE INDEX "vehicle_stock_batch_batch_id_idx" ON "vehicle_stock_batch"("batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_stock_batch_vehicle_id_batch_id_key" ON "vehicle_stock_batch"("vehicle_id", "batch_id");

-- CreateIndex
CREATE INDEX "stock_movement_serial_serial_unit_id_idx" ON "stock_movement_serial"("serial_unit_id");

-- CreateIndex
CREATE INDEX "stock_movement_serial_movement_id_idx" ON "stock_movement_serial"("movement_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movement_serial_movement_id_serial_unit_id_key" ON "stock_movement_serial"("movement_id", "serial_unit_id");

-- CreateIndex
CREATE INDEX "stock_movement_batch_batch_id_idx" ON "stock_movement_batch"("batch_id");

-- CreateIndex
CREATE INDEX "stock_movement_batch_movement_id_idx" ON "stock_movement_batch"("movement_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movement_batch_movement_id_batch_id_key" ON "stock_movement_batch"("movement_id", "batch_id");

-- AddForeignKey
ALTER TABLE "serial_unit" ADD CONSTRAINT "serial_unit_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "serial_unit" ADD CONSTRAINT "serial_unit_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "serial_unit" ADD CONSTRAINT "serial_unit_current_vehicle_id_fkey" FOREIGN KEY ("current_vehicle_id") REFERENCES "vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "serial_unit" ADD CONSTRAINT "serial_unit_consumed_visit_id_fkey" FOREIGN KEY ("consumed_visit_id") REFERENCES "job_visit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "serial_unit" ADD CONSTRAINT "serial_unit_consumed_line_item_id_fkey" FOREIGN KEY ("consumed_line_item_id") REFERENCES "job_visit_line_item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "serial_unit" ADD CONSTRAINT "serial_unit_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "serial_unit" ADD CONSTRAINT "serial_unit_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "stock_batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_batch" ADD CONSTRAINT "stock_batch_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_batch" ADD CONSTRAINT "stock_batch_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_stock_batch" ADD CONSTRAINT "vehicle_stock_batch_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_stock_batch" ADD CONSTRAINT "vehicle_stock_batch_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "stock_batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movement_serial" ADD CONSTRAINT "stock_movement_serial_movement_id_fkey" FOREIGN KEY ("movement_id") REFERENCES "stock_movement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movement_serial" ADD CONSTRAINT "stock_movement_serial_serial_unit_id_fkey" FOREIGN KEY ("serial_unit_id") REFERENCES "serial_unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movement_batch" ADD CONSTRAINT "stock_movement_batch_movement_id_fkey" FOREIGN KEY ("movement_id") REFERENCES "stock_movement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movement_batch" ADD CONSTRAINT "stock_movement_batch_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "stock_batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

