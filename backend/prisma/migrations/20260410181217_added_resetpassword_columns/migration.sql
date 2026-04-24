/*
  Warnings:

  - A unique constraint covering the columns `[password_reset_token]` on the table `dispatcher` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[password_reset_token]` on the table `technician` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "dispatcher" ADD COLUMN     "password_reset_token" TEXT,
ADD COLUMN     "password_reset_token_expires_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "technician" ADD COLUMN     "password_reset_token" TEXT,
ADD COLUMN     "password_reset_token_expires_at" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "dispatcher_password_reset_token_key" ON "dispatcher"("password_reset_token");

-- CreateIndex
CREATE UNIQUE INDEX "technician_password_reset_token_key" ON "technician"("password_reset_token");
