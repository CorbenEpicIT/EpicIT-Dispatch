/*
  Warnings:

  - A unique constraint covering the columns `[email_verification_token]` on the table `dispatcher` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "dispatcher" ADD COLUMN     "email_verification_token" TEXT,
ADD COLUMN     "email_verified_at" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "dispatcher_email_verification_token_key" ON "dispatcher"("email_verification_token");
