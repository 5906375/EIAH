-- ADR-011 §2.1: liberação de vertical pela EIAH por tenant + workspace + vertical, com auditoria.
-- Somente tabelas. A marcação "aprovado na migração" das instalações já ativas é feita pelo
-- servidor de forma idempotente (services/products/verticalAccessApproval.ts).
CREATE TABLE IF NOT EXISTS "vertical_access_approvals" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "vertical" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "revocation_mode" TEXT,
  "requested_by_user_id" TEXT,
  "requested_at" TIMESTAMP(3),
  "decided_by" TEXT,
  "decided_at" TIMESTAMP(3),
  "note" TEXT,
  "score" INTEGER,
  "recommendation" TEXT,
  "score_reasons" JSONB,
  "score_rule_version" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "vertical_access_approvals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "vertical_access_approvals_status_check" CHECK (
    "status" IN ('pendente', 'em_analise', 'aguardando_humano', 'aprovado', 'recusado', 'revogado')
  ),
  CONSTRAINT "vertical_access_approvals_source_check" CHECK ("source" IN ('request', 'migration')),
  CONSTRAINT "vertical_access_approvals_score_check" CHECK ("score" IS NULL OR ("score" >= 0 AND "score" <= 100))
);
CREATE UNIQUE INDEX IF NOT EXISTS "vertical_access_approvals_scope_key"
  ON "vertical_access_approvals"("tenant_id", "workspace_id", "vertical");
CREATE INDEX IF NOT EXISTS "vertical_access_approvals_status_idx"
  ON "vertical_access_approvals"("status", "updated_at");

CREATE TABLE IF NOT EXISTS "vertical_access_approval_events" (
  "id" TEXT NOT NULL,
  "approval_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "vertical" TEXT NOT NULL,
  "from_status" TEXT,
  "to_status" TEXT NOT NULL,
  "actor" TEXT NOT NULL,
  "note" TEXT,
  "score" INTEGER,
  "recommendation" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "vertical_access_approval_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "vertical_access_approval_events_approval_idx"
  ON "vertical_access_approval_events"("approval_id", "created_at");
