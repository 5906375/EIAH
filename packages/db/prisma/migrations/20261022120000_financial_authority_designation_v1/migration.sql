-- AUTHZ-FIN-1 (proposta, EIAH-GOV-BILLING-003): designação explícita de autoridade financeira, por tenant.
-- Aditiva: só cria a tabela e seus índices. Nenhum dado é criado, nenhuma designação é concedida e não existe bootstrap.
-- A autoridade financeira NUNCA deriva de papel, permissão de membro, Founder, administrador ou token técnico: somente desta tabela.
CREATE TABLE IF NOT EXISTS "financial_authority_designation" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "beneficiary_user_id" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "authority_role" TEXT NOT NULL,
  "limits" JSONB NOT NULL DEFAULT '{}',
  "granted_by_user_id" TEXT NOT NULL,
  "grantor_designation_id" TEXT,
  "evidence_ref" TEXT NOT NULL,
  "granted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "valid_until" TIMESTAMPTZ(3) NOT NULL,
  "revoked_at" TIMESTAMPTZ(3),
  "revoked_by_user_id" TEXT,
  "revoke_reason" TEXT,
  "grant_audit_event_id" TEXT,
  "revoke_audit_event_id" TEXT,
  CONSTRAINT "financial_authority_designation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "financial_authority_designation_scope_check"
    CHECK ("scope" IN ('billing.limits.manage', 'billing.ledger.adjust')),
  CONSTRAINT "financial_authority_designation_role_check"
    CHECK ("authority_role" IN ('holder', 'grantor')),
  CONSTRAINT "financial_authority_designation_tenant_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "financial_authority_designation_beneficiary_fkey"
    FOREIGN KEY ("beneficiary_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "financial_authority_designation_lookup_idx"
  ON "financial_authority_designation"("tenant_id", "beneficiary_user_id", "scope");

-- No máximo uma designação ATIVA por pessoa, escopo e papel (as revogadas ficam no histórico).
CREATE UNIQUE INDEX IF NOT EXISTS "financial_authority_designation_active_uidx"
  ON "financial_authority_designation"("tenant_id", "beneficiary_user_id", "scope", "authority_role")
  WHERE "revoked_at" IS NULL;
