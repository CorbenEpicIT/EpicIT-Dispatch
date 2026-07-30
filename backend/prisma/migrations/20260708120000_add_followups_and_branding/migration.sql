-- CreateEnum
CREATE TYPE "followup_trigger_type" AS ENUM ('manual', 'date_based', 'quote_sent', 'invoice_sent', 'request_created', 'visit_scheduled');

-- CreateEnum
CREATE TYPE "followup_step_condition" AS ENUM ('always', 'if_previous_not_opened');

-- CreateEnum
CREATE TYPE "followup_enrollment_status" AS ENUM ('active', 'completed', 'stopped', 'failed');

-- CreateEnum
CREATE TYPE "followup_send_status" AS ENUM ('sent', 'skipped', 'failed');

-- CreateEnum
CREATE TYPE "email_template_category" AS ENUM ('followup', 'reminder', 'quote_chase', 'invoice_chase', 'request_ack', 'custom');

-- AlterTable
ALTER TABLE "organization" ADD COLUMN     "brand_color" TEXT DEFAULT '#1e3a5f',
ADD COLUMN     "followups_enabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "followup_sequence" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "trigger_type" "followup_trigger_type" NOT NULL DEFAULT 'manual',
    "trigger_config" JSONB,
    "stop_on_open" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_dispatcher_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "followup_sequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "followup_step" (
    "id" TEXT NOT NULL,
    "sequence_id" TEXT NOT NULL,
    "step_order" INTEGER NOT NULL,
    "category" "email_template_category" NOT NULL DEFAULT 'followup',
    "delay_amount" INTEGER NOT NULL DEFAULT 0,
    "delay_unit" TEXT NOT NULL DEFAULT 'days',
    "condition" "followup_step_condition" NOT NULL DEFAULT 'if_previous_not_opened',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "followup_step_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "followup_enrollment" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "sequence_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "recipient_email" TEXT NOT NULL,
    "status" "followup_enrollment_status" NOT NULL DEFAULT 'active',
    "current_step_order" INTEGER NOT NULL DEFAULT 0,
    "next_send_at" TIMESTAMP(3),
    "anchor_entity_type" TEXT,
    "anchor_entity_id" TEXT,
    "anchor_at" TIMESTAMP(3),
    "enrolled_by_dispatcher_id" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "stopped_at" TIMESTAMP(3),
    "stop_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "followup_enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "followup_send" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "enrollment_id" TEXT NOT NULL,
    "step_id" TEXT,
    "template_alias" TEXT,
    "recipient_email" TEXT NOT NULL,
    "postmark_message_id" TEXT,
    "status" "followup_send_status" NOT NULL DEFAULT 'sent',
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "opened_at" TIMESTAMP(3),
    "open_count" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "followup_send_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "followup_sequence_trigger_type_idx" ON "followup_sequence"("trigger_type");

-- CreateIndex
CREATE INDEX "followup_sequence_organization_id_trigger_type_is_active_idx" ON "followup_sequence"("organization_id", "trigger_type", "is_active");

-- CreateIndex
CREATE INDEX "followup_step_sequence_id_idx" ON "followup_step"("sequence_id");

-- CreateIndex
CREATE UNIQUE INDEX "followup_step_sequence_id_step_order_key" ON "followup_step"("sequence_id", "step_order");

-- CreateIndex
CREATE INDEX "followup_enrollment_organization_id_idx" ON "followup_enrollment"("organization_id");

-- CreateIndex
CREATE INDEX "followup_enrollment_status_next_send_at_idx" ON "followup_enrollment"("status", "next_send_at");

-- CreateIndex
CREATE INDEX "followup_enrollment_anchor_entity_type_anchor_entity_id_idx" ON "followup_enrollment"("anchor_entity_type", "anchor_entity_id");

-- CreateIndex
CREATE INDEX "followup_enrollment_sequence_id_idx" ON "followup_enrollment"("sequence_id");

-- CreateIndex
CREATE INDEX "followup_enrollment_client_id_idx" ON "followup_enrollment"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "followup_send_postmark_message_id_key" ON "followup_send"("postmark_message_id");

-- CreateIndex
CREATE INDEX "followup_send_enrollment_id_idx" ON "followup_send"("enrollment_id");

-- CreateIndex
CREATE INDEX "followup_send_organization_id_idx" ON "followup_send"("organization_id");

-- CreateIndex
CREATE INDEX "followup_send_step_id_idx" ON "followup_send"("step_id");

-- AddForeignKey
ALTER TABLE "followup_sequence" ADD CONSTRAINT "followup_sequence_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "followup_step" ADD CONSTRAINT "followup_step_sequence_id_fkey" FOREIGN KEY ("sequence_id") REFERENCES "followup_sequence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "followup_enrollment" ADD CONSTRAINT "followup_enrollment_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "followup_enrollment" ADD CONSTRAINT "followup_enrollment_sequence_id_fkey" FOREIGN KEY ("sequence_id") REFERENCES "followup_sequence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "followup_enrollment" ADD CONSTRAINT "followup_enrollment_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "followup_send" ADD CONSTRAINT "followup_send_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "followup_send" ADD CONSTRAINT "followup_send_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "followup_enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "followup_send" ADD CONSTRAINT "followup_send_step_id_fkey" FOREIGN KEY ("step_id") REFERENCES "followup_step"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Partial unique index: at most one ACTIVE enrollment per (sequence, anchor entity).
-- Prisma cannot express a WHERE-filtered unique index, so it lives in raw SQL here.
-- Prevents an auto-trigger (e.g. quote_sent firing twice) from double-enrolling the same anchor.
CREATE UNIQUE INDEX "followup_enrollment_one_active_per_anchor"
    ON "followup_enrollment" ("sequence_id", "anchor_entity_type", "anchor_entity_id")
    WHERE "status" = 'active' AND "anchor_entity_id" IS NOT NULL;

