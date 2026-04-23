-- CreateEnum
CREATE TYPE "DispatcherRole" AS ENUM ('dispatcher', 'admin');

-- AlterTable
ALTER TABLE "dispatcher" ADD COLUMN     "role" "DispatcherRole" NOT NULL DEFAULT 'dispatcher';
