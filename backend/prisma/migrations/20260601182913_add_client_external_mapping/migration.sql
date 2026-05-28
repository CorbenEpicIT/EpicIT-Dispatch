-- CreateTable
CREATE TABLE "client_external_mapping" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,

    CONSTRAINT "client_external_mapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_sync_log" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_sync_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_external_mapping_client_id_idx" ON "client_external_mapping"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "client_external_mapping_provider_external_id_key" ON "client_external_mapping"("provider", "external_id");

-- AddForeignKey
ALTER TABLE "client_external_mapping" ADD CONSTRAINT "client_external_mapping_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
