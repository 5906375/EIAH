CREATE TABLE IF NOT EXISTS "helpdesk_sessions" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "run_id" TEXT,
  "intent" TEXT NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL,
  "fallback_reason" TEXT,
  "message" TEXT NOT NULL,
  "response" TEXT NOT NULL,
  "recommended_plan" TEXT,
  "estimated_value" DOUBLE PRECISION,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "helpdesk_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "helpdesk_sessions_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "helpdesk_sessions_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "helpdesk_sessions_tenant_workspace_created_idx"
  ON "helpdesk_sessions"("tenant_id", "workspace_id", "created_at");

CREATE INDEX IF NOT EXISTS "helpdesk_sessions_intent_created_idx"
  ON "helpdesk_sessions"("intent", "created_at");
