CREATE TABLE IF NOT EXISTS "tenant_product_installations" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "product" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "activated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "activated_by_user_id" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenant_product_installations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "tenant_product_installations_tenant_workspace_product_key"
  ON "tenant_product_installations"("tenant_id", "workspace_id", "product");

CREATE INDEX IF NOT EXISTS "tenant_product_installations_tenant_status_idx"
  ON "tenant_product_installations"("tenant_id", "status");

CREATE INDEX IF NOT EXISTS "tenant_product_installations_workspace_product_status_idx"
  ON "tenant_product_installations"("workspace_id", "product", "status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'tenant_product_installations_tenant_id_fkey'
      AND table_name = 'tenant_product_installations'
  ) THEN
    ALTER TABLE "tenant_product_installations"
      ADD CONSTRAINT "tenant_product_installations_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'tenant_product_installations_workspace_id_fkey'
      AND table_name = 'tenant_product_installations'
  ) THEN
    ALTER TABLE "tenant_product_installations"
      ADD CONSTRAINT "tenant_product_installations_workspace_id_fkey"
      FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'tenant_product_installations_activated_by_user_id_fkey'
      AND table_name = 'tenant_product_installations'
  ) THEN
    ALTER TABLE "tenant_product_installations"
      ADD CONSTRAINT "tenant_product_installations_activated_by_user_id_fkey"
      FOREIGN KEY ("activated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
