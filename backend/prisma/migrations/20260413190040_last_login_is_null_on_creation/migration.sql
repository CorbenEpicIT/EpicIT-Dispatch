-- AlterTable
ALTER TABLE "dispatcher" ALTER COLUMN "last_login" DROP NOT NULL,
ALTER COLUMN "last_login" DROP DEFAULT;

-- AlterTable
ALTER TABLE "technician" ALTER COLUMN "last_login" DROP NOT NULL,
ALTER COLUMN "last_login" DROP DEFAULT;
