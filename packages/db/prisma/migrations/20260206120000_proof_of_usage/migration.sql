-- CreateEnum
CREATE TYPE "pou_status" AS ENUM ('PENDING', 'FINALIZED', 'FAILED', 'PENDING_TRUST');

-- CreateEnum
CREATE TYPE "pou_failure_reason" AS ENUM ('DB_ERROR', 'VALIDATION_ERROR', 'SIGNER_ERROR', 'UNKNOWN');

-- CreateTable
CREATE TABLE "proof_of_usage" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "workspace_id" TEXT,
    "run_id" TEXT NOT NULL,
    "action_id" TEXT NOT NULL,
    "intent_hash" TEXT NOT NULL,
    "params_hash" TEXT NOT NULL,
    "signature_hash" TEXT NOT NULL,
    "result_hash" TEXT NOT NULL,
    "trust_snapshot" JSONB,
    "composite_tx_id" TEXT NOT NULL,
    "status" "pou_status" NOT NULL DEFAULT 'PENDING',
    "attestation_key_id" TEXT,
    "attestation_signature" TEXT,
    "failure_reason" "pou_failure_reason",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalized_at" TIMESTAMP(3),

    CONSTRAINT "proof_of_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "proof_of_usage_run_id_action_id_key" ON "proof_of_usage"("run_id", "action_id");

-- CreateIndex
CREATE UNIQUE INDEX "proof_of_usage_composite_tx_id_key" ON "proof_of_usage"("composite_tx_id");

-- CreateIndex
CREATE INDEX "proof_of_usage_tenant_id_workspace_id_idx" ON "proof_of_usage"("tenant_id", "workspace_id");

-- CreateIndex
CREATE INDEX "proof_of_usage_composite_tx_id_idx" ON "proof_of_usage"("composite_tx_id");

-- AddForeignKey
ALTER TABLE "proof_of_usage" ADD CONSTRAINT "proof_of_usage_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proof_of_usage" ADD CONSTRAINT "proof_of_usage_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proof_of_usage" ADD CONSTRAINT "proof_of_usage_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
