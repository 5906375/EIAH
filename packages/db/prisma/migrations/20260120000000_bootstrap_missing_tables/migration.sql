-- Bootstrap: creates tables referenced by 20260213141438 that were never committed
-- to the migration history. These tables were created in a local DB outside the
-- Prisma workflow and their create-migrations were lost.

-- Old enum types (lowercase versions dropped by 20260213141438 after column swap)
CREATE TYPE "approval_decision" AS ENUM ('approved', 'rejected');
CREATE TYPE "pou_status" AS ENUM ('pending', 'finalized', 'failed', 'pending_trust');
CREATE TYPE "pou_failure_reason" AS ENUM ('db_write_failed', 'validation_error', 'signer_error', 'output_unavailable', 'hash_error', 'attestation_failed', 'unknown');

-- tenant_role_customs — depended on by role_permissions and tenant_memberships
CREATE TABLE "tenant_role_customs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "tenant_role_customs_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "tenant_role_customs"
    ADD CONSTRAINT "tenant_role_customs_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- role_permissions — depends on tenant_role_customs
CREATE TABLE "role_permissions" (
    "id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "role_permissions"
    ADD CONSTRAINT "role_permissions_role_id_fkey"
    FOREIGN KEY ("role_id") REFERENCES "tenant_role_customs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- tenant_memberships — depends on tenants, users, tenant_role_customs
CREATE TABLE "tenant_memberships" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "custom_role_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "tenant_memberships_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "tenant_memberships"
    ADD CONSTRAINT "tenant_memberships_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tenant_memberships"
    ADD CONSTRAINT "tenant_memberships_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tenant_memberships"
    ADD CONSTRAINT "tenant_memberships_custom_role_id_fkey"
    FOREIGN KEY ("custom_role_id") REFERENCES "tenant_role_customs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- wallet_identities — depends on users, tenants
CREATE TABLE "wallet_identities" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "wallet_address" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "wallet_identities_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "wallet_identities"
    ADD CONSTRAINT "wallet_identities_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "wallet_identities"
    ADD CONSTRAINT "wallet_identities_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- connector_instances — depends on tenants, workspaces, users
CREATE TABLE "connector_instances" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "connector" TEXT NOT NULL,
    "config" JSONB,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "connector_instances_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "connector_instances"
    ADD CONSTRAINT "connector_instances_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "connector_instances"
    ADD CONSTRAINT "connector_instances_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "connector_instances"
    ADD CONSTRAINT "connector_instances_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- agent_installs — depends on tenants, workspaces, users
CREATE TABLE "agent_installs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "agent_slug" TEXT NOT NULL,
    "installed_by_user_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "agent_installs_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "agent_installs"
    ADD CONSTRAINT "agent_installs_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "agent_installs"
    ADD CONSTRAINT "agent_installs_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "agent_installs"
    ADD CONSTRAINT "agent_installs_installed_by_user_id_fkey"
    FOREIGN KEY ("installed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- approval_records — has "decision" column of old enum type (swapped in 20260213141438)
CREATE TABLE "approval_records" (
    "id" TEXT NOT NULL,
    "run_id" TEXT,
    "tenant_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "decision" "approval_decision" NOT NULL,
    "decided_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "approval_records_pkey" PRIMARY KEY ("id")
);

-- proof_of_usage — "status" and "failure_reason" swapped to new enums in 20260213141438
CREATE TABLE "proof_of_usage" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "status" "pou_status" NOT NULL DEFAULT 'pending',
    "failure_reason" "pou_failure_reason",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "proof_of_usage_pkey" PRIMARY KEY ("id")
);

-- run_execution_locks — "created_at" dropped, holder_id/expires_at defaults dropped,
-- index "uniq_run_execution_lock" renamed in 20260213141438
CREATE TABLE "run_execution_locks" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "holder_id" TEXT NOT NULL DEFAULT '',
    "expires_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "run_execution_locks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uniq_run_execution_lock"
    ON "run_execution_locks"("tenant_id", "workspace_id", "run_id");
