-- PR B: minimal entitlement layer (tenant contract + workspace activation)

CREATE TABLE "tenant_entitlements" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "agent_id" TEXT NOT NULL,
  "marketplace_id" TEXT,
  "plan_ref" TEXT,
  "quota_ref" TEXT,
  "status" "LifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
  "starts_at" TIMESTAMP(3),
  "ends_at" TIMESTAMP(3),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "tenant_entitlements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tenant_entitlements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "tenant_entitlements_marketplace_id_fkey" FOREIGN KEY ("marketplace_id") REFERENCES "marketplace_items"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "workspace_entitlements" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "agent_id" TEXT NOT NULL,
  "tenant_entitlement_id" TEXT,
  "status" "LifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
  "activated_by_user_id" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "workspace_entitlements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "workspace_entitlements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "workspace_entitlements_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "workspace_entitlements_tenant_entitlement_id_fkey" FOREIGN KEY ("tenant_entitlement_id") REFERENCES "tenant_entitlements"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "workspace_entitlements_activated_by_user_id_fkey" FOREIGN KEY ("activated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "unique_tenant_entitlement_agent" ON "tenant_entitlements"("tenant_id", "agent_id");
CREATE INDEX "tenant_entitlements_tenant_id_status_idx" ON "tenant_entitlements"("tenant_id", "status");
CREATE INDEX "tenant_entitlements_marketplace_id_idx" ON "tenant_entitlements"("marketplace_id");

CREATE UNIQUE INDEX "unique_workspace_entitlement_agent" ON "workspace_entitlements"("tenant_id", "workspace_id", "agent_id");
CREATE INDEX "workspace_entitlements_tenant_id_status_idx" ON "workspace_entitlements"("tenant_id", "status");
CREATE INDEX "workspace_entitlements_workspace_id_status_idx" ON "workspace_entitlements"("workspace_id", "status");
CREATE INDEX "workspace_entitlements_tenant_entitlement_id_idx" ON "workspace_entitlements"("tenant_entitlement_id");
