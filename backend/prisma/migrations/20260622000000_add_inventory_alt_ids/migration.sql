-- AlterTable
ALTER TABLE "inventory_item" ADD COLUMN "alt_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
