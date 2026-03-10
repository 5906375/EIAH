-- Sprint 3: Reputation + Disputes (P1-301..P1-303)

CREATE TABLE IF NOT EXISTS "agent_reputation" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "agent_id" TEXT NOT NULL,
  "completed_runs" INTEGER NOT NULL DEFAULT 0,
  "disputes_total" INTEGER NOT NULL DEFAULT 0,
  "dispute_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "trust_score" INTEGER NOT NULL DEFAULT 100,
  "verified_receipts" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "agent_reputation_tenant_workspace_agent_unique"
  ON "agent_reputation"("tenant_id","workspace_id","agent_id");

CREATE INDEX IF NOT EXISTS "agent_reputation_tenant_workspace_idx"
  ON "agent_reputation"("tenant_id","workspace_id");

CREATE TABLE IF NOT EXISTS "billing_disputes" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "payment_intent_id" TEXT NOT NULL,
  "run_id" TEXT NOT NULL,
  "agent_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "reason" TEXT,
  "resolution" TEXT,
  "created_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closed_at" TIMESTAMP(3)
);

CREATE INDEX IF NOT EXISTS "billing_disputes_tenant_workspace_status_idx"
  ON "billing_disputes"("tenant_id","workspace_id","status");

CREATE INDEX IF NOT EXISTS "billing_disputes_payment_intent_idx"
  ON "billing_disputes"("payment_intent_id");

CREATE TABLE IF NOT EXISTS "agent_reputation_events" (
  "id" TEXT PRIMARY KEY,
  "event_key" TEXT NOT NULL UNIQUE,
  "tenant_id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "agent_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "payload" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

