-- CreateTable
CREATE TABLE "agent_recommendation_state" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "state" JSONB NOT NULL,
    "last_run_id" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_recommendation_state_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_recommendation_state_agent_idx" ON "agent_recommendation_state"("agent");

-- CreateIndex
CREATE UNIQUE INDEX "agent_recommendation_state_tenant_id_workspace_id_agent_key" ON "agent_recommendation_state"("tenant_id", "workspace_id", "agent");
