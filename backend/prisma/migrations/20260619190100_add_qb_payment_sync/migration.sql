-- QuickBooks payment outbound sync.
-- invoice_payment.qb_payment_id: stores the pushed QB Payment Id and serves as
-- the idempotency / echo-prevention key (unique). external_sync_log gains
-- organization_id + indexes to scope the QB sync audit log per org.

-- AlterTable
ALTER TABLE "external_sync_log" ADD COLUMN     "organization_id" TEXT;
-- AlterTable
ALTER TABLE "invoice_payment" ADD COLUMN     "qb_payment_id" TEXT;
-- CreateIndex
CREATE INDEX "external_sync_log_organization_id_created_at_idx" ON "external_sync_log"("organization_id", "created_at");
-- CreateIndex
CREATE INDEX "external_sync_log_provider_external_id_idx" ON "external_sync_log"("provider", "external_id");
-- CreateIndex
CREATE UNIQUE INDEX "invoice_payment_qb_payment_id_key" ON "invoice_payment"("qb_payment_id");
