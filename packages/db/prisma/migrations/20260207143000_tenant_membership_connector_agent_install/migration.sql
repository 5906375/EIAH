-- Enums
DO $$ BEGIN
  CREATE TYPE "TenantRole" AS ENUM ('TENANT_ADMIN', 'TENANT_OPERATOR', 'TENANT_VIEWER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'DISABLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "LifecycleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'DISABLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "WorkspaceStatus" AS ENUM ('ACTIVE', 'DISABLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Workspace status
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "status" "WorkspaceStatus" NOT NULL DEFAULT 'ACTIVE';

-- Tenant memberships
CREATE TABLE IF NOT EXISTS "tenant_memberships" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" "TenantRole" NOT NULL DEFAULT 'TENANT_OPERATOR',
  "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "tenant_memberships_tenant_id_user_id_key"
  ON "tenant_memberships"("tenant_id","user_id");
CREATE INDEX IF NOT EXISTS "tenant_memberships_tenant_id_idx" ON "tenant_memberships"("tenant_id");
CREATE INDEX IF NOT EXISTS "tenant_memberships_user_id_idx" ON "tenant_memberships"("user_id");

-- Connector instances
CREATE TABLE IF NOT EXISTS "connector_instances" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "workspace_id" TEXT NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "provider" TEXT NOT NULL,
  "allowed_resources" JSONB NOT NULL,
  "limits" JSONB NOT NULL,
  "vault_secret_ref" TEXT NOT NULL,
  "status" "LifecycleStatus" NOT NULL DEFAULT 'DRAFT',
  "created_by_user_id" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "connector_instances_tenant_id_idx" ON "connector_instances"("tenant_id");
CREATE INDEX IF NOT EXISTS "connector_instances_workspace_id_idx" ON "connector_instances"("workspace_id");

-- Agent installs
CREATE TABLE IF NOT EXISTS "agent_installs" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "workspace_id" TEXT NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "agent_id" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "config" JSONB NOT NULL,
  "status" "LifecycleStatus" NOT NULL DEFAULT 'DRAFT',
  "installed_by_user_id" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "agent_installs_tenant_id_idx" ON "agent_installs"("tenant_id");
CREATE INDEX IF NOT EXISTS "agent_installs_workspace_id_idx" ON "agent_installs"("workspace_id");
CREATE INDEX IF NOT EXISTS "agent_installs_agent_id_idx" ON "agent_installs"("agent_id");
