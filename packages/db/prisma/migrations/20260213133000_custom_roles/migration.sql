-- Custom roles per tenant
CREATE TABLE IF NOT EXISTS "tenant_role_customs" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "tenant_role_customs_tenant_id_name_key"
  ON "tenant_role_customs"("tenant_id","name");
CREATE INDEX IF NOT EXISTS "tenant_role_customs_tenant_id_idx" ON "tenant_role_customs"("tenant_id");

CREATE TABLE IF NOT EXISTS "role_permissions" (
  "id" TEXT PRIMARY KEY,
  "role_id" TEXT NOT NULL REFERENCES "tenant_role_customs"("id") ON DELETE CASCADE,
  "permission_key" TEXT NOT NULL,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "role_permissions_role_id_permission_key_key"
  ON "role_permissions"("role_id","permission_key");
CREATE INDEX IF NOT EXISTS "role_permissions_role_id_idx" ON "role_permissions"("role_id");

ALTER TABLE "tenant_memberships"
  ADD COLUMN IF NOT EXISTS "custom_role_id" TEXT REFERENCES "tenant_role_customs"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "tenant_memberships_custom_role_id_idx"
  ON "tenant_memberships"("custom_role_id");
