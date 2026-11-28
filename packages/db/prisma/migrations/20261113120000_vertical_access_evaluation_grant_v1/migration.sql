-- Avaliação gratuita da vertical (IMOB): colunas aditivas (todas nulas), estados `pre_ativacao` e `encerrado` e restrições.
-- Linhas existentes não mudam (grant_kind nulo). Espelha `ensureVerticalAccessStore` (DDL idempotente de runtime) e
-- `EVALUATION_CONSTRAINTS_SQL` em apps/api/src/services/products/verticalAccessApproval.ts: mudar um exige mudar o outro.
-- Preparada, NÃO executada em nenhum banco nesta entrega.

ALTER TABLE "vertical_access_approvals"
  ADD COLUMN IF NOT EXISTS "request_context" JSONB,
  ADD COLUMN IF NOT EXISTS "grant_kind" TEXT,
  ADD COLUMN IF NOT EXISTS "grant_terms" JSONB,
  ADD COLUMN IF NOT EXISTS "grant_terms_hash" TEXT,
  ADD COLUMN IF NOT EXISTS "grant_accepted_by" TEXT,
  ADD COLUMN IF NOT EXISTS "grant_accepted_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "grant_accepted_hash" TEXT,
  ADD COLUMN IF NOT EXISTS "grant_started_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "grant_valid_until" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "grant_closed_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "evaluation_used_at" TIMESTAMP(3);

ALTER TABLE "vertical_access_approval_events" ADD COLUMN IF NOT EXISTS "detail" JSONB;

DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'vertical_access_approvals_status_check' AND pg_get_constraintdef(oid) LIKE '%pre_ativacao%'
    ) THEN
      ALTER TABLE "vertical_access_approvals" DROP CONSTRAINT IF EXISTS "vertical_access_approvals_status_check";
      ALTER TABLE "vertical_access_approvals" ADD CONSTRAINT "vertical_access_approvals_status_check" CHECK (
        "status" IN ('pendente', 'em_analise', 'aguardando_humano', 'aprovado', 'recusado', 'revogado', 'pre_ativacao', 'encerrado')
      );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vertical_access_approvals_grant_kind_check') THEN
      ALTER TABLE "vertical_access_approvals" ADD CONSTRAINT "vertical_access_approvals_grant_kind_check" CHECK (
        "grant_kind" IS NULL OR "grant_kind" IN ('evaluation')
      );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vertical_access_approvals_grant_integrity_check') THEN
      ALTER TABLE "vertical_access_approvals" ADD CONSTRAINT "vertical_access_approvals_grant_integrity_check" CHECK (
        "grant_kind" IS NULL
        OR "status" NOT IN ('pre_ativacao', 'aprovado')
        OR (
          "grant_terms" IS NOT NULL AND "grant_terms_hash" IS NOT NULL
          AND (
            "status" <> 'aprovado'
            OR ("grant_accepted_hash" IS NOT NULL AND "grant_started_at" IS NOT NULL AND "grant_valid_until" IS NOT NULL)
          )
        )
      );
    END IF;
  END $$;
