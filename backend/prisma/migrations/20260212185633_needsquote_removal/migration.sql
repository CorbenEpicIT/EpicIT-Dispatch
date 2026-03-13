/*
  Warnings:

  - The values [NeedsQuote] on the enum `request_status` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "request_status_new" AS ENUM ('New', 'Reviewing', 'Quoted', 'QuoteApproved', 'QuoteRejected', 'ConvertedToJob', 'Cancelled');
ALTER TABLE "public"."request" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "request" ALTER COLUMN "status" TYPE "request_status_new" USING ("status"::text::"request_status_new");
ALTER TYPE "request_status" RENAME TO "request_status_old";
ALTER TYPE "request_status_new" RENAME TO "request_status";
DROP TYPE "public"."request_status_old";
ALTER TABLE "request" ALTER COLUMN "status" SET DEFAULT 'New';
COMMIT;

-- AlterEnum
ALTER TYPE "visit_status" ADD VALUE 'Paused';
