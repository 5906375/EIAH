-- CreateTable
CREATE TABLE "radar_analysis_requests" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "additional_context" TEXT,
    "requested_by_user_id" TEXT NOT NULL,
    "operation_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "radar_analysis_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "radar_analysis_attempts" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "analysis_request_id" TEXT NOT NULL,
    "attempt_operation_key" TEXT NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "claimed_by_worker_id" TEXT,
    "claim_token" TEXT,
    "claimed_at" TIMESTAMP(3),
    "run_id" TEXT,
    "cancel_requested_at" TIMESTAMP(3),
    "failure_reason_code" TEXT,
    "generation_config" JSONB NOT NULL,
    "preserved_result_payload" JSONB,
    "preserved_result_hash" TEXT,
    "preserved_result_version" TEXT,
    "preserved_result_provider" TEXT,
    "preserved_result_model" TEXT,
    "preserved_result_provider_request_id" TEXT,
    "preserved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "radar_analysis_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "radar_recommendations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "attempt_id" TEXT NOT NULL,
    "recommendation_type" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "statements" JSONB NOT NULL,
    "references" JSONB NOT NULL,
    "limitations" TEXT,
    "suggested_action" TEXT,
    "insufficient_evidence_reason" TEXT,
    "do_not_act_reason" TEXT,
    "provenance" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "radar_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "radar_analysis_requests_tenant_id_workspace_id_entity_id_idx" ON "radar_analysis_requests"("tenant_id", "workspace_id", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "radar_analysis_requests_id_tenant_id_workspace_id_key" ON "radar_analysis_requests"("id", "tenant_id", "workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "radar_analysis_requests_tenant_id_workspace_id_operation_ke_key" ON "radar_analysis_requests"("tenant_id", "workspace_id", "operation_key");

-- CreateIndex
CREATE INDEX "radar_analysis_attempts_tenant_id_workspace_id_analysis_req_idx" ON "radar_analysis_attempts"("tenant_id", "workspace_id", "analysis_request_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "radar_analysis_attempts_id_tenant_id_workspace_id_key" ON "radar_analysis_attempts"("id", "tenant_id", "workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "radar_analysis_attempts_tenant_id_workspace_id_analysis_req_key" ON "radar_analysis_attempts"("tenant_id", "workspace_id", "analysis_request_id", "attempt_operation_key");

-- CreateIndex
CREATE UNIQUE INDEX "radar_analysis_attempts_run_id_tenant_id_workspace_id_key" ON "radar_analysis_attempts"("run_id", "tenant_id", "workspace_id");

-- CreateIndex
CREATE INDEX "radar_recommendations_tenant_id_workspace_id_idx" ON "radar_recommendations"("tenant_id", "workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "radar_recommendations_attempt_id_tenant_id_workspace_id_key" ON "radar_recommendations"("attempt_id", "tenant_id", "workspace_id");

-- AddForeignKey
ALTER TABLE "radar_analysis_requests" ADD CONSTRAINT "radar_analysis_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radar_analysis_requests" ADD CONSTRAINT "radar_analysis_requests_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radar_analysis_requests" ADD CONSTRAINT "radar_analysis_requests_entity_id_tenant_id_workspace_id_fkey" FOREIGN KEY ("entity_id", "tenant_id", "workspace_id") REFERENCES "radar_known_entities"("id", "tenant_id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radar_analysis_requests" ADD CONSTRAINT "radar_analysis_requests_material_id_tenant_id_workspace_id_fkey" FOREIGN KEY ("material_id", "tenant_id", "workspace_id", "entity_id") REFERENCES "radar_materials"("id", "tenant_id", "workspace_id", "entity_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radar_analysis_attempts" ADD CONSTRAINT "radar_analysis_attempts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radar_analysis_attempts" ADD CONSTRAINT "radar_analysis_attempts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radar_analysis_attempts" ADD CONSTRAINT "radar_analysis_attempts_analysis_request_id_tenant_id_work_fkey" FOREIGN KEY ("analysis_request_id", "tenant_id", "workspace_id") REFERENCES "radar_analysis_requests"("id", "tenant_id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radar_analysis_attempts" ADD CONSTRAINT "radar_analysis_attempts_run_id_tenant_id_workspace_id_fkey" FOREIGN KEY ("run_id", "tenant_id", "workspace_id") REFERENCES "runs"("id", "tenant_id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radar_recommendations" ADD CONSTRAINT "radar_recommendations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radar_recommendations" ADD CONSTRAINT "radar_recommendations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radar_recommendations" ADD CONSTRAINT "radar_recommendations_attempt_id_tenant_id_workspace_id_fkey" FOREIGN KEY ("attempt_id", "tenant_id", "workspace_id") REFERENCES "radar_analysis_attempts"("id", "tenant_id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreatePartialIndex (adição manual: Prisma 7.2.0 não expressa índice único
-- parcial via schema.prisma nativamente — decisão técnica já registrada em
-- docs/architecture/radar-social-construction-plan-v1.md, Atualização 1.12,
-- seção C "Guardas indispensáveis", corrigida na Atualização 1.20). Garante
-- no máximo UMA tentativa NÃO TERMINAL por solicitação — pending, running e
-- provider_responded_pending_persistence contam para esta unicidade, porque
-- todas as três representam trabalho em curso ou resultado ainda não
-- concluído; apenas completed/failed/cancelled (terminais) ficam fora do
-- filtro e podem conviver livremente. Correção da Atualização 1.20: a versão
-- original cobria só ('pending','running') e permitia criar uma segunda
-- tentativa intencional (nova attemptOperationKey) enquanto a primeira ainda
-- aguardava conclusão com resultado durável já preservado — reproduzido e
-- corrigido nesta rodada (ver teste de regressão em
-- E-analysis-request-and-attempt-lifecycle.test.ts).
CREATE UNIQUE INDEX "radar_analysis_attempts_one_active_per_request" ON "radar_analysis_attempts"("tenant_id", "workspace_id", "analysis_request_id") WHERE "status" IN ('pending', 'running', 'provider_responded_pending_persistence');
