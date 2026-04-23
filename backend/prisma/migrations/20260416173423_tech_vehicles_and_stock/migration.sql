-- AlterTable
ALTER TABLE "inventory_item" ADD COLUMN     "category" TEXT,
ADD COLUMN     "unit" TEXT NOT NULL DEFAULT 'each';

-- AlterTable
ALTER TABLE "job_note" ADD COLUMN     "notify_technician" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "technician" ADD COLUMN     "current_vehicle_id" TEXT;

-- CreateTable
CREATE TABLE "vehicle" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "license_plate" TEXT,
    "year" INTEGER,
    "make" TEXT,
    "model" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "color" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_stock_item" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "inventory_item_id" TEXT NOT NULL,
    "qty_on_hand" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "qty_min" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_stock_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_stock_usage" (
    "id" TEXT NOT NULL,
    "stock_item_id" TEXT NOT NULL,
    "visit_id" TEXT NOT NULL,
    "technician_id" TEXT NOT NULL,
    "qty_used" DECIMAL(10,2) NOT NULL,
    "visit_line_item_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_stock_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_restock_request" (
    "id" TEXT NOT NULL,
    "stock_item_id" TEXT NOT NULL,
    "technician_id" TEXT NOT NULL,
    "qty_requested" DECIMAL(10,2),
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fulfilled_at" TIMESTAMP(3),

    CONSTRAINT "vehicle_restock_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "technician_notification" (
    "id" TEXT NOT NULL,
    "technician_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "action_url" TEXT,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "technician_notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vehicle_organization_id_idx" ON "vehicle"("organization_id");

-- CreateIndex
CREATE INDEX "vehicle_status_idx" ON "vehicle"("status");

-- CreateIndex
CREATE INDEX "vehicle_stock_item_vehicle_id_idx" ON "vehicle_stock_item"("vehicle_id");

-- CreateIndex
CREATE INDEX "vehicle_stock_item_inventory_item_id_idx" ON "vehicle_stock_item"("inventory_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_stock_item_vehicle_id_inventory_item_id_key" ON "vehicle_stock_item"("vehicle_id", "inventory_item_id");

-- CreateIndex
CREATE INDEX "vehicle_stock_usage_stock_item_id_idx" ON "vehicle_stock_usage"("stock_item_id");

-- CreateIndex
CREATE INDEX "vehicle_stock_usage_visit_id_idx" ON "vehicle_stock_usage"("visit_id");

-- CreateIndex
CREATE INDEX "vehicle_stock_usage_technician_id_idx" ON "vehicle_stock_usage"("technician_id");

-- CreateIndex
CREATE INDEX "vehicle_restock_request_stock_item_id_idx" ON "vehicle_restock_request"("stock_item_id");

-- CreateIndex
CREATE INDEX "vehicle_restock_request_technician_id_idx" ON "vehicle_restock_request"("technician_id");

-- CreateIndex
CREATE INDEX "vehicle_restock_request_status_idx" ON "vehicle_restock_request"("status");

-- CreateIndex
CREATE INDEX "technician_notification_technician_id_idx" ON "technician_notification"("technician_id");

-- CreateIndex
CREATE INDEX "technician_notification_technician_id_read_at_idx" ON "technician_notification"("technician_id", "read_at");

-- CreateIndex
CREATE INDEX "technician_notification_created_at_idx" ON "technician_notification"("created_at");

-- AddForeignKey
ALTER TABLE "technician" ADD CONSTRAINT "technician_current_vehicle_id_fkey" FOREIGN KEY ("current_vehicle_id") REFERENCES "vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle" ADD CONSTRAINT "vehicle_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_stock_item" ADD CONSTRAINT "vehicle_stock_item_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_stock_item" ADD CONSTRAINT "vehicle_stock_item_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_stock_usage" ADD CONSTRAINT "vehicle_stock_usage_stock_item_id_fkey" FOREIGN KEY ("stock_item_id") REFERENCES "vehicle_stock_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_stock_usage" ADD CONSTRAINT "vehicle_stock_usage_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "job_visit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_restock_request" ADD CONSTRAINT "vehicle_restock_request_stock_item_id_fkey" FOREIGN KEY ("stock_item_id") REFERENCES "vehicle_stock_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technician_notification" ADD CONSTRAINT "technician_notification_technician_id_fkey" FOREIGN KEY ("technician_id") REFERENCES "technician"("id") ON DELETE CASCADE ON UPDATE CASCADE;
