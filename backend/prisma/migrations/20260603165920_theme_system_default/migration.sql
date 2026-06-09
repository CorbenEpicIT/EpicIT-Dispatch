-- AlterTable: Change default value for theme column from 'dark' to 'system' on technician and dispatcher tables
ALTER TABLE "technician" ALTER COLUMN "theme" SET DEFAULT 'system';

-- AlterTable
ALTER TABLE "dispatcher" ALTER COLUMN "theme" SET DEFAULT 'system';
