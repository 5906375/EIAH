-- PR1: Tenant Billing V1 (data model + safe backfill)

CREATE TABLE IF NOT EXISTS "tenant_billing_account" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL UNIQUE,
  "plan_code" TEXT NOT NULL DEFAULT 'starter',
  "currency" TEXT NOT NULL DEFAULT 'BRL',
  "status" TEXT NOT NULL DEFAULT 'active',
  "cycle_anchor_day" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenant_billing_account_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "tenant_billing_account_tenant_id_status_idx"
  ON "tenant_billing_account"("tenant_id", "status");

CREATE TABLE IF NOT EXISTS "tenant_quota_policy" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL UNIQUE,
  "soft_limit_pct" INTEGER NOT NULL DEFAULT 80,
  "hard_limit_pct" INTEGER NOT NULL DEFAULT 100,
  "monthly_runs_limit" INTEGER,
  "monthly_cost_cents_limit" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenant_quota_policy_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "tenant_quota_policy_tenant_id_idx"
  ON "tenant_quota_policy"("tenant_id");

CREATE TABLE IF NOT EXISTS "tenant_quota_usage" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "cycle_start" TIMESTAMP(3) NOT NULL,
  "cycle_end" TIMESTAMP(3) NOT NULL,
  "runs" INTEGER NOT NULL DEFAULT 0,
  "cost_cents" INTEGER NOT NULL DEFAULT 0,
  "tokens" INTEGER NOT NULL DEFAULT 0,
  "storage_mb" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenant_quota_usage_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "tenant_quota_usage_cycle_unique"
  ON "tenant_quota_usage"("tenant_id", "cycle_start", "cycle_end");

CREATE INDEX IF NOT EXISTS "tenant_quota_usage_tenant_cycle_idx"
  ON "tenant_quota_usage"("tenant_id", "cycle_start", "cycle_end");

CREATE TABLE IF NOT EXISTS "workspace_quota_grant" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "local_run_limit" INTEGER,
  "local_cost_cents_limit" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workspace_quota_grant_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "workspace_quota_grant_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "workspace_quota_grant_unique"
  ON "workspace_quota_grant"("tenant_id", "workspace_id");

CREATE INDEX IF NOT EXISTS "workspace_quota_grant_tenant_enabled_idx"
  ON "workspace_quota_grant"("tenant_id", "enabled");

CREATE INDEX IF NOT EXISTS "workspace_quota_grant_workspace_idx"
  ON "workspace_quota_grant"("workspace_id");

CREATE TABLE IF NOT EXISTS "billing_ledger" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "workspace_id" TEXT,
  "run_id" TEXT,
  "type" TEXT NOT NULL,
  "amount_cents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "description" TEXT,
  "request_id" TEXT,
  "provider" TEXT,
  "model" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "billing_ledger_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "billing_ledger_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "billing_ledger_run_id_fkey"
    FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "billing_ledger_tenant_created_idx"
  ON "billing_ledger"("tenant_id", "created_at");

CREATE INDEX IF NOT EXISTS "billing_ledger_tenant_workspace_created_idx"
  ON "billing_ledger"("tenant_id", "workspace_id", "created_at");

CREATE INDEX IF NOT EXISTS "billing_ledger_run_idx"
  ON "billing_ledger"("run_id");

-- Ledger imutavel (append-only)
CREATE OR REPLACE FUNCTION prevent_billing_ledger_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'billing_ledger is append-only; UPDATE is not allowed';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION prevent_billing_ledger_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'billing_ledger is append-only; DELETE is not allowed';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_billing_ledger_no_update ON "billing_ledger";
CREATE TRIGGER trg_billing_ledger_no_update
BEFORE UPDATE ON "billing_ledger"
FOR EACH ROW
EXECUTE FUNCTION prevent_billing_ledger_update();

DROP TRIGGER IF EXISTS trg_billing_ledger_no_delete ON "billing_ledger";
CREATE TRIGGER trg_billing_ledger_no_delete
BEFORE DELETE ON "billing_ledger"
FOR EACH ROW
EXECUTE FUNCTION prevent_billing_ledger_delete();

-- Backfill default por tenant/workspace existente
INSERT INTO "tenant_billing_account" (
  "id", "tenant_id", "plan_code", "currency", "status", "cycle_anchor_day", "created_at", "updated_at"
)
SELECT
  'tba_' || substr(md5(random()::text || clock_timestamp()::text || t.id), 1, 24),
  t.id,
  'starter',
  'BRL',
  'active',
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "tenants" t
WHERE NOT EXISTS (
  SELECT 1 FROM "tenant_billing_account" b WHERE b."tenant_id" = t.id
);

INSERT INTO "tenant_quota_policy" (
  "id", "tenant_id", "soft_limit_pct", "hard_limit_pct", "created_at", "updated_at"
)
SELECT
  'tqp_' || substr(md5(random()::text || clock_timestamp()::text || t.id), 1, 24),
  t.id,
  80,
  100,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "tenants" t
WHERE NOT EXISTS (
  SELECT 1 FROM "tenant_quota_policy" p WHERE p."tenant_id" = t.id
);

INSERT INTO "tenant_quota_usage" (
  "id", "tenant_id", "cycle_start", "cycle_end", "runs", "cost_cents", "tokens", "storage_mb", "created_at", "updated_at"
)
SELECT
  'tqu_' || substr(md5(random()::text || clock_timestamp()::text || t.id), 1, 24),
  t.id,
  date_trunc('month', CURRENT_TIMESTAMP),
  date_trunc('month', CURRENT_TIMESTAMP) + INTERVAL '1 month',
  0,
  0,
  0,
  0,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "tenants" t
WHERE NOT EXISTS (
  SELECT 1 FROM "tenant_quota_usage" u
  WHERE u."tenant_id" = t.id
    AND u."cycle_start" = date_trunc('month', CURRENT_TIMESTAMP)
    AND u."cycle_end" = date_trunc('month', CURRENT_TIMESTAMP) + INTERVAL '1 month'
);

INSERT INTO "workspace_quota_grant" (
  "id", "tenant_id", "workspace_id", "enabled", "created_at", "updated_at"
)
SELECT
  'wqg_' || substr(md5(random()::text || clock_timestamp()::text || w.id), 1, 24),
  w."tenant_id",
  w.id,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "workspaces" w
WHERE NOT EXISTS (
  SELECT 1
  FROM "workspace_quota_grant" g
  WHERE g."tenant_id" = w."tenant_id"
    AND g."workspace_id" = w.id
);
