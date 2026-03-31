ALTER TABLE "runs"
ADD COLUMN IF NOT EXISTS "agent_version" TEXT,
ADD COLUMN IF NOT EXISTS "assignment_id" TEXT;

CREATE TABLE IF NOT EXISTS "workspace_quota_usage" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "cycle_start" TIMESTAMP(3) NOT NULL,
  "cycle_end" TIMESTAMP(3) NOT NULL,
  "runs" INTEGER NOT NULL DEFAULT 0,
  "cost_cents" INTEGER NOT NULL DEFAULT 0,
  "tokens" INTEGER NOT NULL DEFAULT 0,
  "storage_mb" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "workspace_quota_usage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "workspace_agent_assignments" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "agent_key" TEXT NOT NULL,
  "agent_version" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "signed_by_user_id" TEXT,
  "signed_at" TIMESTAMP(3),
  "signature_ref" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "workspace_agent_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "run_usage_breakdowns" (
  "id" TEXT NOT NULL,
  "run_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "agent" TEXT NOT NULL,
  "agent_version" TEXT,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "pricing_version" TEXT NOT NULL,
  "request_id" TEXT NOT NULL,
  "trace_id" TEXT,
  "meter_type" TEXT NOT NULL,
  "request_class" TEXT NOT NULL,
  "prompt_tokens" INTEGER NOT NULL DEFAULT 0,
  "completion_tokens" INTEGER NOT NULL DEFAULT 0,
  "cached_tokens" INTEGER NOT NULL DEFAULT 0,
  "total_tokens" INTEGER NOT NULL DEFAULT 0,
  "amount_cents" INTEGER NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'BRL',
  "estimated" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "run_usage_breakdowns_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "workspace_quota_usage_cycle_unique"
ON "workspace_quota_usage"("tenant_id", "workspace_id", "cycle_start", "cycle_end");

CREATE INDEX IF NOT EXISTS "workspace_quota_usage_cycle_idx"
ON "workspace_quota_usage"("tenant_id", "workspace_id", "cycle_start", "cycle_end");

CREATE UNIQUE INDEX IF NOT EXISTS "workspace_agent_assignment_version_unique"
ON "workspace_agent_assignments"("tenant_id", "workspace_id", "agent_key", "agent_version");

CREATE INDEX IF NOT EXISTS "workspace_agent_assignment_lookup_idx"
ON "workspace_agent_assignments"("tenant_id", "workspace_id", "agent_key");

CREATE UNIQUE INDEX IF NOT EXISTS "run_usage_breakdown_idempotency_unique"
ON "run_usage_breakdowns"("run_id", "request_id", "meter_type");

CREATE INDEX IF NOT EXISTS "run_usage_breakdowns_run_idx"
ON "run_usage_breakdowns"("run_id");

CREATE INDEX IF NOT EXISTS "run_usage_breakdowns_scope_idx"
ON "run_usage_breakdowns"("tenant_id", "workspace_id");

CREATE INDEX IF NOT EXISTS "run_usage_breakdowns_request_idx"
ON "run_usage_breakdowns"("request_id");

CREATE INDEX IF NOT EXISTS "runs_assignment_id_idx"
ON "runs"("assignment_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'workspace_quota_usage_tenant_id_fkey'
  ) THEN
    ALTER TABLE "workspace_quota_usage"
    ADD CONSTRAINT "workspace_quota_usage_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'workspace_quota_usage_workspace_id_fkey'
  ) THEN
    ALTER TABLE "workspace_quota_usage"
    ADD CONSTRAINT "workspace_quota_usage_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'workspace_agent_assignments_tenant_id_fkey'
  ) THEN
    ALTER TABLE "workspace_agent_assignments"
    ADD CONSTRAINT "workspace_agent_assignments_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'workspace_agent_assignments_workspace_id_fkey'
  ) THEN
    ALTER TABLE "workspace_agent_assignments"
    ADD CONSTRAINT "workspace_agent_assignments_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'workspace_agent_assignments_signed_by_user_id_fkey'
  ) THEN
    ALTER TABLE "workspace_agent_assignments"
    ADD CONSTRAINT "workspace_agent_assignments_signed_by_user_id_fkey"
    FOREIGN KEY ("signed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'run_usage_breakdowns_run_id_fkey'
  ) THEN
    ALTER TABLE "run_usage_breakdowns"
    ADD CONSTRAINT "run_usage_breakdowns_run_id_fkey"
    FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'run_usage_breakdowns_tenant_id_fkey'
  ) THEN
    ALTER TABLE "run_usage_breakdowns"
    ADD CONSTRAINT "run_usage_breakdowns_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'run_usage_breakdowns_workspace_id_fkey'
  ) THEN
    ALTER TABLE "run_usage_breakdowns"
    ADD CONSTRAINT "run_usage_breakdowns_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'runs_assignment_id_fkey'
  ) THEN
    ALTER TABLE "runs"
    ADD CONSTRAINT "runs_assignment_id_fkey"
    FOREIGN KEY ("assignment_id") REFERENCES "workspace_agent_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
