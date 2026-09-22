-- CreateTable
CREATE TABLE "radar_entity_access_grants" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "grantee_user_id" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "granted_by_user_id" TEXT NOT NULL,
    "granted_at" TIMESTAMP(3) NOT NULL,
    "revoked_by_user_id" TEXT,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "radar_entity_access_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "radar_entity_access_grants_tenant_id_workspace_id_entity_id_idx" ON "radar_entity_access_grants"("tenant_id", "workspace_id", "entity_id", "grantee_user_id", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "radar_entity_access_grants_tenant_id_workspace_id_entity_id_key" ON "radar_entity_access_grants"("tenant_id", "workspace_id", "entity_id", "grantee_user_id", "operation");

-- AddForeignKey
ALTER TABLE "radar_entity_access_grants" ADD CONSTRAINT "radar_entity_access_grants_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radar_entity_access_grants" ADD CONSTRAINT "radar_entity_access_grants_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radar_entity_access_grants" ADD CONSTRAINT "radar_entity_access_grants_entity_id_tenant_id_workspace_i_fkey" FOREIGN KEY ("entity_id", "tenant_id", "workspace_id") REFERENCES "radar_known_entities"("id", "tenant_id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;
