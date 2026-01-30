/*
  Warnings:

  - Changed the type of `embedding` on the `embedding_chunks` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- Ensure pgvector extension exists for vector type usage.
CREATE EXTENSION IF NOT EXISTS vector;

-- AlterTable
ALTER TABLE "embedding_chunks" DROP COLUMN "embedding",
ADD COLUMN     "embedding" vector(1536) NOT NULL;

-- CreateTable
CREATE TABLE "marketplace_items" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "description" TEXT,
    "publisher_id" TEXT NOT NULL,
    "trust_score" DOUBLE PRECISION,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketplace_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delegation_policies" (
    "id" TEXT NOT NULL,
    "delegator_id" TEXT NOT NULL,
    "delegatee_id" TEXT NOT NULL,
    "marketplace_id" TEXT,
    "scope" TEXT NOT NULL,
    "trust_min" DOUBLE PRECISION NOT NULL,
    "valid_until" TIMESTAMP(3) NOT NULL,
    "policy_hash" TEXT NOT NULL,
    "signature_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delegation_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_trust_scores" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "workspace_id" TEXT,
    "agent_id" TEXT NOT NULL,
    "currentScore" INTEGER NOT NULL DEFAULT 100,
    "baseline" INTEGER NOT NULL DEFAULT 100,
    "lastDelta" INTEGER NOT NULL DEFAULT 0,
    "trend" TEXT NOT NULL DEFAULT 'stable',
    "last_updated" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_trust_scores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "marketplace_items_publisher_id_type_name_version_idx" ON "marketplace_items"("publisher_id", "type", "name", "version");

-- CreateIndex
CREATE INDEX "delegation_policies_delegator_id_delegatee_id_scope_idx" ON "delegation_policies"("delegator_id", "delegatee_id", "scope");

-- CreateIndex
CREATE INDEX "delegation_policies_marketplace_id_idx" ON "delegation_policies"("marketplace_id");

-- CreateIndex
CREATE INDEX "agent_trust_scores_tenant_id_agent_id_last_updated_idx" ON "agent_trust_scores"("tenant_id", "agent_id", "last_updated");

-- CreateIndex
CREATE UNIQUE INDEX "agent_trust_scores_tenant_id_workspace_id_agent_id_key" ON "agent_trust_scores"("tenant_id", "workspace_id", "agent_id");

-- AddForeignKey
ALTER TABLE "marketplace_items" ADD CONSTRAINT "marketplace_items_publisher_id_fkey" FOREIGN KEY ("publisher_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delegation_policies" ADD CONSTRAINT "delegation_policies_delegator_id_fkey" FOREIGN KEY ("delegator_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delegation_policies" ADD CONSTRAINT "delegation_policies_delegatee_id_fkey" FOREIGN KEY ("delegatee_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delegation_policies" ADD CONSTRAINT "delegation_policies_marketplace_id_fkey" FOREIGN KEY ("marketplace_id") REFERENCES "marketplace_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_trust_scores" ADD CONSTRAINT "agent_trust_scores_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_trust_scores" ADD CONSTRAINT "agent_trust_scores_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;
