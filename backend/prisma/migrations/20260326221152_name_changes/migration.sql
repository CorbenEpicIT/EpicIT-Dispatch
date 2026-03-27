/*
  Warnings:

  - You are about to drop the `JWTRefreshToken` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `OTPVerification` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "JWTRefreshToken";

-- DropTable
DROP TABLE "OTPVerification";

-- CreateTable
CREATE TABLE "otp_verification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "otp" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jwt_refresh_token" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jwt_refresh_token_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "otp_verification_userId_role_idx" ON "otp_verification"("userId", "role");

-- CreateIndex
CREATE INDEX "jwt_refresh_token_userId_role_idx" ON "jwt_refresh_token"("userId", "role");
