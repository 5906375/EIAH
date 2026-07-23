-- DropIndex
DROP INDEX "tool_contracts_tenant_id_name_version_idx";

-- CreateIndex
CREATE UNIQUE INDEX "tool_contracts_tenant_id_name_version_key"
ON "tool_contracts"("tenant_id", "name", "version");
