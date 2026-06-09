-- AlterTable: Change default value for theme column from 'dark' to 'system' on technician and dispatcher tables
ALTER TABLE "technician" ADD COLUMN "theme" TEXT NOT NULL DEFAULT 'system';

-- AlterTable
ALTER TABLE "dispatcher" ADD COLUMN "theme" TEXT NOT NULL DEFAULT 'system';