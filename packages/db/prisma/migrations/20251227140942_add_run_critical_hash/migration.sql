-- DropIndex
DROP INDEX "scl_ledger_tenant_id_signed_at_idx";

-- AlterTable
ALTER TABLE "run_events" ADD COLUMN     "critical_hash" TEXT,
ADD COLUMN     "scl_tx_id" TEXT;

-- AlterTable
ALTER TABLE "runs" ADD COLUMN     "critical_hash" TEXT,
ADD COLUMN     "scl_tx_id" TEXT;

-- CreateTable
CREATE TABLE "PlanStepRecord" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "stepIndex" INTEGER NOT NULL,
    "stepType" TEXT NOT NULL,
    "input" JSONB,
    "output" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanStepRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tool_contracts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "inputSchema" JSONB NOT NULL,
    "outputSchema" JSONB,
    "executor" TEXT NOT NULL,
    "trustLevel" INTEGER NOT NULL,
    "policyId" TEXT,
    "limits" JSONB,
    "metadata" JSONB,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tool_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentMetadata" (
    "id" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "trustBaseline" DOUBLE PRECISION NOT NULL DEFAULT 0.85,
    "sclCritical" BOOLEAN NOT NULL DEFAULT false,
    "pricingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentMetadata_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlanStepRecord_runId_idx" ON "PlanStepRecord"("runId");

-- CreateIndex
CREATE INDEX "tool_contracts_tenant_id_name_version_idx" ON "tool_contracts"("tenant_id", "name", "version");

-- CreateIndex
CREATE UNIQUE INDEX "AgentMetadata_agent_key" ON "AgentMetadata"("agent");

-- CreateIndex
CREATE UNIQUE INDEX "AgentMetadata_pricingId_key" ON "AgentMetadata"("pricingId");

-- AddForeignKey
ALTER TABLE "tool_contracts" ADD CONSTRAINT "tool_contracts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentMetadata" ADD CONSTRAINT "AgentMetadata_pricingId_fkey" FOREIGN KEY ("pricingId") REFERENCES "pricing"("id") ON DELETE SET NULL ON UPDATE CASCADE;
