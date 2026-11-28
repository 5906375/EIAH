-- INTERNAL: statically prepared residual; not executed or production-approved.
-- Baseline: 88c1fff5c69614f47f171b8cddfb0360765a3366.
-- A/B only: canonical main migrations, then NEW Radar/SignalForward tables.
-- C (any previously applied historical Radar migration) is unsupported here:
-- stop for a separately authorized compatibility/backfill procedure. Existing
-- tables intentionally cause CREATE TABLE to fail; no IF NOT EXISTS or repair.
-- Reuses main's UNIQUE runs(id, tenant_id, workspace_id), without recreating it.
-- Historical definitions remain recoverable at eb63d581 (nine 202609 migrations).
-- Final state only: origin_snapshot and fingerprint_version are NOT NULL from
-- creation, without fabricated snapshots, data rewrites or persistent defaults.
-- No backfill: these tables have no rows at creation in supported scenarios.
-- Runtime must explicitly supply the fingerprint contract version.
-- Partial indexes below are required and are not expressed by Prisma 7.2 schema.

CREATE TABLE "signal_forward_requests" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "source_run_id" TEXT NOT NULL,
    "destination_agent" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "request_fingerprint" TEXT NOT NULL,
    "requested_by_user_id" TEXT,
    "destination_run_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending_dispatch',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "signal_forward_requests_pkey" PRIMARY KEY ("id"),
    "origin_snapshot" JSONB NOT NULL,
    "fingerprint_version" TEXT NOT NULL,
    "active_human_confirmation_id" TEXT,
    "concluded_human_confirmation_id" TEXT
);

CREATE TABLE "human_confirmations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "signal_forward_request_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'awaiting_human_completion',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "suggested_prompt" TEXT NOT NULL,
    "suggested_prompt_rule_version" TEXT NOT NULL,
    "human_confirmation_contract_version" TEXT NOT NULL,
    "draft_final_prompt" TEXT,
    "draft_objective" TEXT,
    "draft_audience" TEXT,
    "draft_channels" JSONB,
    "draft_budget" TEXT,
    "draft_tone_profile" TEXT,
    "draft_tone_notes" TEXT,
    "draft_launch_date" TEXT,
    "draft_deadline" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "confirmed_at" TIMESTAMP(3),
    "confirmed_by_user_id" TEXT,
    "confirmed_payload_snapshot" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "human_confirmations_pkey" PRIMARY KEY ("id")
);

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

CREATE INDEX "signal_forward_requests_tenant_id_workspace_id_source_run_i_idx" ON "signal_forward_requests"("tenant_id", "workspace_id", "source_run_id");

CREATE UNIQUE INDEX "signal_forward_requests_tenant_id_workspace_id_destination__key" ON "signal_forward_requests"("tenant_id", "workspace_id", "destination_agent", "idempotency_key");

CREATE UNIQUE INDEX "signal_forward_requests_destination_run_id_tenant_id_worksp_key" ON "signal_forward_requests"("destination_run_id", "tenant_id", "workspace_id");

CREATE INDEX "human_confirmations_tenant_id_workspace_id_signal_forward_r_idx" ON "human_confirmations"("tenant_id", "workspace_id", "signal_forward_request_id", "status");

CREATE UNIQUE INDEX "signal_forward_requests_id_tenant_id_workspace_id_key" ON "signal_forward_requests"("id", "tenant_id", "workspace_id");

CREATE INDEX "radar_known_entities_tenant_id_workspace_id_status_idx" ON "radar_known_entities"("tenant_id", "workspace_id", "status");

CREATE UNIQUE INDEX "radar_known_entities_id_tenant_id_workspace_id_key" ON "radar_known_entities"("id", "tenant_id", "workspace_id");

CREATE UNIQUE INDEX "radar_known_entities_tenant_id_workspace_id_external_ref_key" ON "radar_known_entities"("tenant_id", "workspace_id", "external_ref");

CREATE INDEX "radar_materials_tenant_id_workspace_id_entity_id_idx" ON "radar_materials"("tenant_id", "workspace_id", "entity_id");

CREATE UNIQUE INDEX "radar_materials_id_tenant_id_workspace_id_entity_id_key" ON "radar_materials"("id", "tenant_id", "workspace_id", "entity_id");

CREATE UNIQUE INDEX "radar_materials_tenant_id_workspace_id_operation_key_key" ON "radar_materials"("tenant_id", "workspace_id", "operation_key");

CREATE UNIQUE INDEX "radar_materials_supersedes_material_id_tenant_id_workspace__key" ON "radar_materials"("supersedes_material_id", "tenant_id", "workspace_id", "entity_id");

CREATE INDEX "radar_analysis_requests_tenant_id_workspace_id_entity_id_idx" ON "radar_analysis_requests"("tenant_id", "workspace_id", "entity_id");

CREATE UNIQUE INDEX "radar_analysis_requests_id_tenant_id_workspace_id_key" ON "radar_analysis_requests"("id", "tenant_id", "workspace_id");

CREATE UNIQUE INDEX "radar_analysis_requests_tenant_id_workspace_id_operation_ke_key" ON "radar_analysis_requests"("tenant_id", "workspace_id", "operation_key");

CREATE INDEX "radar_analysis_attempts_tenant_id_workspace_id_analysis_req_idx" ON "radar_analysis_attempts"("tenant_id", "workspace_id", "analysis_request_id", "status");

CREATE UNIQUE INDEX "radar_analysis_attempts_id_tenant_id_workspace_id_key" ON "radar_analysis_attempts"("id", "tenant_id", "workspace_id");

CREATE UNIQUE INDEX "radar_analysis_attempts_tenant_id_workspace_id_analysis_req_key" ON "radar_analysis_attempts"("tenant_id", "workspace_id", "analysis_request_id", "attempt_operation_key");

CREATE UNIQUE INDEX "radar_analysis_attempts_run_id_tenant_id_workspace_id_key" ON "radar_analysis_attempts"("run_id", "tenant_id", "workspace_id");

CREATE INDEX "radar_recommendations_tenant_id_workspace_id_idx" ON "radar_recommendations"("tenant_id", "workspace_id");

CREATE UNIQUE INDEX "radar_recommendations_attempt_id_tenant_id_workspace_id_key" ON "radar_recommendations"("attempt_id", "tenant_id", "workspace_id");

CREATE UNIQUE INDEX "radar_analysis_attempts_one_active_per_request" ON "radar_analysis_attempts"("tenant_id", "workspace_id", "analysis_request_id") WHERE "status" IN ('pending', 'running', 'provider_responded_pending_persistence');

CREATE INDEX "radar_entity_access_grants_tenant_id_workspace_id_entity_id_idx" ON "radar_entity_access_grants"("tenant_id", "workspace_id", "entity_id", "grantee_user_id", "enabled");

CREATE UNIQUE INDEX "radar_entity_access_grants_tenant_id_workspace_id_entity_id_key" ON "radar_entity_access_grants"("tenant_id", "workspace_id", "entity_id", "grantee_user_id", "operation");

CREATE INDEX "radar_provider_call_slots_tenant_id_workspace_id_status_idx" ON "radar_provider_call_slots"("tenant_id", "workspace_id", "status");

CREATE UNIQUE INDEX "radar_provider_call_slots_attempt_id_tenant_id_workspace_id_key" ON "radar_provider_call_slots"("attempt_id", "tenant_id", "workspace_id");

CREATE INDEX "radar_recommendation_evaluations_tenant_id_workspace_id_rec_idx" ON "radar_recommendation_evaluations"("tenant_id", "workspace_id", "recommendation_id");

CREATE UNIQUE INDEX "radar_recommendation_evaluations_id_tenant_id_workspace_id__key" ON "radar_recommendation_evaluations"("id", "tenant_id", "workspace_id", "recommendation_id", "evaluator_user_id");

CREATE UNIQUE INDEX "radar_recommendation_evaluations_tenant_id_workspace_id_rec_key" ON "radar_recommendation_evaluations"("tenant_id", "workspace_id", "recommendation_id", "evaluator_user_id", "operation_key");

CREATE UNIQUE INDEX "radar_recommendation_evaluations_supersedes_evaluation_id_t_key" ON "radar_recommendation_evaluations"("supersedes_evaluation_id", "tenant_id", "workspace_id", "recommendation_id", "evaluator_user_id");

CREATE UNIQUE INDEX "radar_recommendation_evaluations_one_root_per_recommendation_evaluator" ON "radar_recommendation_evaluations"("tenant_id", "workspace_id", "recommendation_id", "evaluator_user_id") WHERE "supersedes_evaluation_id" IS NULL;

CREATE UNIQUE INDEX "radar_recommendations_id_tenant_id_workspace_id_key" ON "radar_recommendations"("id", "tenant_id", "workspace_id");

ALTER TABLE "signal_forward_requests" ADD CONSTRAINT "signal_forward_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "signal_forward_requests" ADD CONSTRAINT "signal_forward_requests_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "signal_forward_requests" ADD CONSTRAINT "signal_forward_requests_source_run_id_tenant_id_workspace__fkey" FOREIGN KEY ("source_run_id", "tenant_id", "workspace_id") REFERENCES "runs"("id", "tenant_id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "signal_forward_requests" ADD CONSTRAINT "signal_forward_requests_destination_run_id_tenant_id_works_fkey" FOREIGN KEY ("destination_run_id", "tenant_id", "workspace_id") REFERENCES "runs"("id", "tenant_id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "human_confirmations" ADD CONSTRAINT "human_confirmations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "human_confirmations" ADD CONSTRAINT "human_confirmations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "human_confirmations" ADD CONSTRAINT "human_confirmations_signal_forward_request_id_tenant_id_wo_fkey" FOREIGN KEY ("signal_forward_request_id", "tenant_id", "workspace_id") REFERENCES "signal_forward_requests"("id", "tenant_id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "radar_known_entities" ADD CONSTRAINT "radar_known_entities_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "radar_known_entities" ADD CONSTRAINT "radar_known_entities_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "radar_materials" ADD CONSTRAINT "radar_materials_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "radar_materials" ADD CONSTRAINT "radar_materials_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "radar_materials" ADD CONSTRAINT "radar_materials_entity_id_tenant_id_workspace_id_fkey" FOREIGN KEY ("entity_id", "tenant_id", "workspace_id") REFERENCES "radar_known_entities"("id", "tenant_id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "radar_materials" ADD CONSTRAINT "radar_materials_supersedes_material_id_tenant_id_workspace_fkey" FOREIGN KEY ("supersedes_material_id", "tenant_id", "workspace_id", "entity_id") REFERENCES "radar_materials"("id", "tenant_id", "workspace_id", "entity_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "radar_analysis_requests" ADD CONSTRAINT "radar_analysis_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "radar_analysis_requests" ADD CONSTRAINT "radar_analysis_requests_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "radar_analysis_requests" ADD CONSTRAINT "radar_analysis_requests_entity_id_tenant_id_workspace_id_fkey" FOREIGN KEY ("entity_id", "tenant_id", "workspace_id") REFERENCES "radar_known_entities"("id", "tenant_id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "radar_analysis_requests" ADD CONSTRAINT "radar_analysis_requests_material_id_tenant_id_workspace_id_fkey" FOREIGN KEY ("material_id", "tenant_id", "workspace_id", "entity_id") REFERENCES "radar_materials"("id", "tenant_id", "workspace_id", "entity_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "radar_analysis_attempts" ADD CONSTRAINT "radar_analysis_attempts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "radar_analysis_attempts" ADD CONSTRAINT "radar_analysis_attempts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "radar_analysis_attempts" ADD CONSTRAINT "radar_analysis_attempts_analysis_request_id_tenant_id_work_fkey" FOREIGN KEY ("analysis_request_id", "tenant_id", "workspace_id") REFERENCES "radar_analysis_requests"("id", "tenant_id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "radar_analysis_attempts" ADD CONSTRAINT "radar_analysis_attempts_run_id_tenant_id_workspace_id_fkey" FOREIGN KEY ("run_id", "tenant_id", "workspace_id") REFERENCES "runs"("id", "tenant_id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "radar_recommendations" ADD CONSTRAINT "radar_recommendations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "radar_recommendations" ADD CONSTRAINT "radar_recommendations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "radar_recommendations" ADD CONSTRAINT "radar_recommendations_attempt_id_tenant_id_workspace_id_fkey" FOREIGN KEY ("attempt_id", "tenant_id", "workspace_id") REFERENCES "radar_analysis_attempts"("id", "tenant_id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "radar_entity_access_grants" ADD CONSTRAINT "radar_entity_access_grants_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "radar_entity_access_grants" ADD CONSTRAINT "radar_entity_access_grants_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "radar_entity_access_grants" ADD CONSTRAINT "radar_entity_access_grants_entity_id_tenant_id_workspace_i_fkey" FOREIGN KEY ("entity_id", "tenant_id", "workspace_id") REFERENCES "radar_known_entities"("id", "tenant_id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "radar_provider_call_slots" ADD CONSTRAINT "radar_provider_call_slots_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "radar_provider_call_slots" ADD CONSTRAINT "radar_provider_call_slots_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "radar_provider_call_slots" ADD CONSTRAINT "radar_provider_call_slots_attempt_id_tenant_id_workspace_i_fkey" FOREIGN KEY ("attempt_id", "tenant_id", "workspace_id") REFERENCES "radar_analysis_attempts"("id", "tenant_id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "radar_recommendation_evaluations" ADD CONSTRAINT "radar_recommendation_evaluations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "radar_recommendation_evaluations" ADD CONSTRAINT "radar_recommendation_evaluations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "radar_recommendation_evaluations" ADD CONSTRAINT "radar_recommendation_evaluations_recommendation_id_tenant__fkey" FOREIGN KEY ("recommendation_id", "tenant_id", "workspace_id") REFERENCES "radar_recommendations"("id", "tenant_id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "radar_recommendation_evaluations" ADD CONSTRAINT "radar_recommendation_evaluations_supersedes_evaluation_id__fkey" FOREIGN KEY ("supersedes_evaluation_id", "tenant_id", "workspace_id", "recommendation_id", "evaluator_user_id") REFERENCES "radar_recommendation_evaluations"("id", "tenant_id", "workspace_id", "recommendation_id", "evaluator_user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
