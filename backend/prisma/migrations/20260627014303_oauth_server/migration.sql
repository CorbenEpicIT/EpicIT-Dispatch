-- CreateTable
CREATE TABLE "oauth_client" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "client_secret" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "redirect_uris" TEXT[],
    "is_confidential" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_auth_code" (
    "id" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "organization_id" TEXT,
    "redirect_uri" TEXT NOT NULL,
    "scope" TEXT,
    "code_challenge" TEXT,
    "code_challenge_method" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_auth_code_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_refresh_token" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "organization_id" TEXT,
    "scope" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "replaced_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_refresh_token_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "oauth_client_client_id_key" ON "oauth_client"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_auth_code_code_hash_key" ON "oauth_auth_code"("code_hash");

-- CreateIndex
CREATE INDEX "oauth_auth_code_client_id_idx" ON "oauth_auth_code"("client_id");

-- CreateIndex
CREATE INDEX "oauth_auth_code_expires_at_idx" ON "oauth_auth_code"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_refresh_token_token_hash_key" ON "oauth_refresh_token"("token_hash");

-- CreateIndex
CREATE INDEX "oauth_refresh_token_user_id_role_idx" ON "oauth_refresh_token"("user_id", "role");

-- CreateIndex
CREATE INDEX "oauth_refresh_token_client_id_idx" ON "oauth_refresh_token"("client_id");

-- AddForeignKey
ALTER TABLE "oauth_auth_code" ADD CONSTRAINT "oauth_auth_code_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "oauth_client"("client_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_refresh_token" ADD CONSTRAINT "oauth_refresh_token_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "oauth_client"("client_id") ON DELETE CASCADE ON UPDATE CASCADE;
