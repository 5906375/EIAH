-- CreateTable
CREATE TABLE "wallet_identities" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "chain_id" INTEGER,
    "user_id" TEXT NOT NULL,
    "profile_id" TEXT,
    "tenant_id" TEXT NOT NULL,
    "workspace_id" TEXT,
    "last_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallet_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "siwe_nonces" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "siwe_nonces_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wallet_identities_address_key" ON "wallet_identities"("address");

-- CreateIndex
CREATE INDEX "wallet_identities_user_id_idx" ON "wallet_identities"("user_id");

-- CreateIndex
CREATE INDEX "wallet_identities_tenant_id_workspace_id_idx" ON "wallet_identities"("tenant_id", "workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "siwe_nonces_nonce_key" ON "siwe_nonces"("nonce");

-- CreateIndex
CREATE INDEX "siwe_nonces_address_idx" ON "siwe_nonces"("address");

-- CreateIndex
CREATE INDEX "siwe_nonces_expires_at_idx" ON "siwe_nonces"("expires_at");

-- AddForeignKey
ALTER TABLE "wallet_identities" ADD CONSTRAINT "wallet_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_identities" ADD CONSTRAINT "wallet_identities_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "user_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_identities" ADD CONSTRAINT "wallet_identities_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_identities" ADD CONSTRAINT "wallet_identities_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;
