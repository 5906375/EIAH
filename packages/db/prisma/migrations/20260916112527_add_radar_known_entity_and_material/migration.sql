-- CreateTable
CREATE TABLE "radar_known_entities" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "external_ref" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "radar_known_entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "radar_materials" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "conteudo" TEXT NOT NULL,
    "hash_do_material" TEXT NOT NULL,
    "fonte_declarada" TEXT NOT NULL,
    "capturado_em" DATE,
    "supersedes_material_id" TEXT,
    "operation_key" TEXT NOT NULL,
    "provided_by_user_id" TEXT NOT NULL,
    "recebido_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "radar_materials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "radar_known_entities_tenant_id_workspace_id_status_idx" ON "radar_known_entities"("tenant_id", "workspace_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "radar_known_entities_id_tenant_id_workspace_id_key" ON "radar_known_entities"("id", "tenant_id", "workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "radar_known_entities_tenant_id_workspace_id_external_ref_key" ON "radar_known_entities"("tenant_id", "workspace_id", "external_ref");

-- CreateIndex
CREATE INDEX "radar_materials_tenant_id_workspace_id_entity_id_idx" ON "radar_materials"("tenant_id", "workspace_id", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "radar_materials_id_tenant_id_workspace_id_entity_id_key" ON "radar_materials"("id", "tenant_id", "workspace_id", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "radar_materials_tenant_id_workspace_id_operation_key_key" ON "radar_materials"("tenant_id", "workspace_id", "operation_key");

-- CreateIndex
CREATE UNIQUE INDEX "radar_materials_supersedes_material_id_tenant_id_workspace__key" ON "radar_materials"("supersedes_material_id", "tenant_id", "workspace_id", "entity_id");

-- AddForeignKey
ALTER TABLE "radar_known_entities" ADD CONSTRAINT "radar_known_entities_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radar_known_entities" ADD CONSTRAINT "radar_known_entities_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radar_materials" ADD CONSTRAINT "radar_materials_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radar_materials" ADD CONSTRAINT "radar_materials_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radar_materials" ADD CONSTRAINT "radar_materials_entity_id_tenant_id_workspace_id_fkey" FOREIGN KEY ("entity_id", "tenant_id", "workspace_id") REFERENCES "radar_known_entities"("id", "tenant_id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radar_materials" ADD CONSTRAINT "radar_materials_supersedes_material_id_tenant_id_workspace_fkey" FOREIGN KEY ("supersedes_material_id", "tenant_id", "workspace_id", "entity_id") REFERENCES "radar_materials"("id", "tenant_id", "workspace_id", "entity_id") ON DELETE RESTRICT ON UPDATE CASCADE;
