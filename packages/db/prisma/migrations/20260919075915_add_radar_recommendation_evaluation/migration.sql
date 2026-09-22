-- CreateTable
CREATE TABLE "radar_recommendation_evaluations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "contract_version" TEXT NOT NULL,
    "recommendation_id" TEXT NOT NULL,
    "evaluator_user_id" TEXT NOT NULL,
    "criteria_version" TEXT NOT NULL,
    "fundamentacao" TEXT NOT NULL,
    "clareza" TEXT NOT NULL,
    "utilidade" TEXT NOT NULL,
    "justificativa" TEXT,
    "comentario" TEXT,
    "supersedes_evaluation_id" TEXT,
    "operation_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "radar_recommendation_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "radar_recommendation_evaluations_tenant_id_workspace_id_rec_idx" ON "radar_recommendation_evaluations"("tenant_id", "workspace_id", "recommendation_id");

-- CreateIndex
CREATE UNIQUE INDEX "radar_recommendation_evaluations_id_tenant_id_workspace_id__key" ON "radar_recommendation_evaluations"("id", "tenant_id", "workspace_id", "recommendation_id", "evaluator_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "radar_recommendation_evaluations_tenant_id_workspace_id_rec_key" ON "radar_recommendation_evaluations"("tenant_id", "workspace_id", "recommendation_id", "evaluator_user_id", "operation_key");

-- CreateIndex
CREATE UNIQUE INDEX "radar_recommendation_evaluations_supersedes_evaluation_id_t_key" ON "radar_recommendation_evaluations"("supersedes_evaluation_id", "tenant_id", "workspace_id", "recommendation_id", "evaluator_user_id");

-- CreateIndex (edição manual, não gerada pelo schema.prisma — Prisma não
-- expressa índice único PARCIAL; mesma técnica já usada em
-- radar_analysis_attempts_one_active_per_request). Garante no máximo UMA
-- avaliação RAIZ (supersedes_evaluation_id IS NULL) por par
-- (recomendação, avaliador) — qualquer avaliação adicional da mesma pessoa
-- sobre a mesma recomendação precisa referenciar supersedes_evaluation_id,
-- nunca abrir uma segunda raiz independente.
CREATE UNIQUE INDEX "radar_recommendation_evaluations_one_root_per_recommendation_evaluator" ON "radar_recommendation_evaluations"("tenant_id", "workspace_id", "recommendation_id", "evaluator_user_id") WHERE "supersedes_evaluation_id" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "radar_recommendations_id_tenant_id_workspace_id_key" ON "radar_recommendations"("id", "tenant_id", "workspace_id");

-- AddForeignKey
ALTER TABLE "radar_recommendation_evaluations" ADD CONSTRAINT "radar_recommendation_evaluations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radar_recommendation_evaluations" ADD CONSTRAINT "radar_recommendation_evaluations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radar_recommendation_evaluations" ADD CONSTRAINT "radar_recommendation_evaluations_recommendation_id_tenant__fkey" FOREIGN KEY ("recommendation_id", "tenant_id", "workspace_id") REFERENCES "radar_recommendations"("id", "tenant_id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radar_recommendation_evaluations" ADD CONSTRAINT "radar_recommendation_evaluations_supersedes_evaluation_id__fkey" FOREIGN KEY ("supersedes_evaluation_id", "tenant_id", "workspace_id", "recommendation_id", "evaluator_user_id") REFERENCES "radar_recommendation_evaluations"("id", "tenant_id", "workspace_id", "recommendation_id", "evaluator_user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
