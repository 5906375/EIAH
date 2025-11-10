-- Create tenants table
CREATE TABLE IF NOT EXISTS "tenants" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create workspaces table
CREATE TABLE IF NOT EXISTS "workspaces" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "workspaces_tenant_id_name_idx"
  ON "workspaces" ("tenant_id", "name");

-- Create users table
CREATE TABLE IF NOT EXISTS "users" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "email" TEXT NOT NULL UNIQUE,
  "display_name" TEXT,
  "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "users_tenant_id_email_idx"
  ON "users" ("tenant_id", "email");

-- Create api_tokens table
CREATE TABLE IF NOT EXISTS "api_tokens" (
  "id" TEXT PRIMARY KEY,
  "token" TEXT NOT NULL UNIQUE,
  "tenant_id" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "workspace_id" TEXT NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "user_id" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
  "description" TEXT,
  "expires_at" TIMESTAMP WITH TIME ZONE,
  "revoked" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "api_tokens_tenant_workspace_idx"
  ON "api_tokens" ("tenant_id", "workspace_id");
CREATE INDEX IF NOT EXISTS "api_tokens_user_id_idx"
  ON "api_tokens" ("user_id");

-- Ensure legacy tenant/workspace exist before altering runs
INSERT INTO "tenants" ("id", "name")
VALUES ('legacy-tenant', 'Legacy Tenant')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "workspaces" ("id", "tenant_id", "name")
VALUES ('legacy-workspace', 'legacy-tenant', 'Legacy Workspace')
ON CONFLICT ("id") DO NOTHING;

-- Create a workspace per existing project_id (if any)
INSERT INTO "workspaces" ("id", "tenant_id", "name")
SELECT DISTINCT "projectId", 'legacy-tenant', COALESCE("projectId", 'Legacy Workspace')
FROM "runs"
WHERE "projectId" IS NOT NULL
ON CONFLICT ("id") DO NOTHING;

-- Alter runs table: add tenant/workspace/user columns
ALTER TABLE "runs"
  ADD COLUMN IF NOT EXISTS "tenant_id" TEXT,
  ADD COLUMN IF NOT EXISTS "workspace_id" TEXT,
  ADD COLUMN IF NOT EXISTS "user_id" TEXT;

-- Backfill runs with legacy data
UPDATE "runs"
SET
  "tenant_id" = COALESCE("tenant_id", 'legacy-tenant'),
  "workspace_id" = COALESCE("workspace_id", COALESCE("projectId", 'legacy-workspace'));

-- Enforce NOT NULL after backfill
ALTER TABLE "runs"
  ALTER COLUMN "tenant_id" SET NOT NULL,
  ALTER COLUMN "workspace_id" SET NOT NULL;

-- Drop legacy project_id column if present
ALTER TABLE "runs"
  DROP COLUMN IF EXISTS "projectId";

-- Add foreign keys for runs
ALTER TABLE "runs"
  ADD CONSTRAINT "runs_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "runs_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "runs_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;

-- Update indexes on runs
CREATE INDEX IF NOT EXISTS "runs_tenant_workspace_agent_created_idx"
  ON "runs" ("tenant_id", "workspace_id", "agent", "createdAt");

-- Create run_events table
CREATE TABLE IF NOT EXISTS "run_events" (
  "id" TEXT PRIMARY KEY,
  "run_id" TEXT NOT NULL REFERENCES "runs"("id") ON DELETE CASCADE,
  "tenant_id" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "workspace_id" TEXT NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "user_id" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
  "type" TEXT NOT NULL,
  "payload" JSONB,
  "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "run_events_run_created_idx"
  ON "run_events" ("run_id", "created_at");
CREATE INDEX IF NOT EXISTS "run_events_tenant_workspace_created_idx"
  ON "run_events" ("tenant_id", "workspace_id", "created_at");
