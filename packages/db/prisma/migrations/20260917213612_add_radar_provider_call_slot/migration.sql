-- CreateTable
CREATE TABLE "radar_provider_call_slots" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "attempt_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'occupied',
    "occupied_at" TIMESTAMP(3) NOT NULL,
    "released_at" TIMESTAMP(3),

    CONSTRAINT "radar_provider_call_slots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "radar_provider_call_slots_tenant_id_workspace_id_status_idx" ON "radar_provider_call_slots"("tenant_id", "workspace_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "radar_provider_call_slots_attempt_id_tenant_id_workspace_id_key" ON "radar_provider_call_slots"("attempt_id", "tenant_id", "workspace_id");

-- AddForeignKey
ALTER TABLE "radar_provider_call_slots" ADD CONSTRAINT "radar_provider_call_slots_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radar_provider_call_slots" ADD CONSTRAINT "radar_provider_call_slots_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radar_provider_call_slots" ADD CONSTRAINT "radar_provider_call_slots_attempt_id_tenant_id_workspace_i_fkey" FOREIGN KEY ("attempt_id", "tenant_id", "workspace_id") REFERENCES "radar_analysis_attempts"("id", "tenant_id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;
