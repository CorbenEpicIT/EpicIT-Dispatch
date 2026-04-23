-- AlterTable
ALTER TABLE "invoice" ALTER COLUMN "issue_date" DROP DEFAULT;
ALTER TABLE "invoice" ALTER COLUMN "issue_date" DROP NOT NULL;
