import { randomUUID } from "node:crypto";

/**
 * EIAH-GOV-BILLING-002 — fixture de TESTE para a autoridade financeira (AUTHZ-FIN-1, proposta).
 *
 * Nunca é usado pelo código de produção e nunca concede autoridade fora de um banco descartável: as designações são
 * inseridas direto na tabela (sem o concedente governado), exatamente como `installImobForTest` instala o IMOB sem passar
 * pela liberação real. O bootstrap da primeira autoridade segue BLOQUEADO (D1) e não é exercitado aqui.
 *
 * A tabela vem da migration `20261022120000_financial_authority_designation_v1` (BILLING-003); a fixture não cria DDL.
 * O desenho da tabela é o contrato: docs/ops/billing-financial-authority-spec.md §6.
 */
export const FIN_SCOPES = {
  limits: "billing.limits.manage",
  adjust: "billing.ledger.adjust",
} as const;
export type FinScope = (typeof FIN_SCOPES)[keyof typeof FIN_SCOPES];
export type FinRole = "holder" | "grantor";

export const FIN_TABLE = "financial_authority_designation";

export type DesignationState = "active" | "revoked" | "expired";

export async function insertFinancialDesignationForTest(
  prisma: any,
  params: {
    tenantId: string;
    userId: string;
    scope: FinScope;
    role?: FinRole;
    limits?: Record<string, unknown>;
    state?: DesignationState;
  },
): Promise<string> {
  const id = `fad_${randomUUID()}`;
  const state = params.state ?? "active";
  const now = Date.now();
  const validUntil = new Date(state === "expired" ? now - 3_600_000 : now + 30 * 86_400_000);
  const revokedAt = state === "revoked" ? new Date(now - 3_600_000) : null;
  await prisma.$executeRawUnsafe(
    `INSERT INTO ${FIN_TABLE}
       (id, tenant_id, beneficiary_user_id, scope, authority_role, limits, granted_by_user_id, evidence_ref, granted_at, valid_until, revoked_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11)`,
    id,
    params.tenantId,
    params.userId,
    params.scope,
    params.role ?? "holder",
    JSON.stringify(params.limits ?? {}),
    "fixture:test-seed",
    "FIXTURE-BILLING-002",
    new Date(now - 7_200_000),
    validUntil,
    revokedAt,
  );
  return id;
}

export async function revokeFinancialDesignationForTest(prisma: any, id: string) {
  await prisma.$executeRawUnsafe(`UPDATE ${FIN_TABLE} SET revoked_at = NOW(), revoke_reason = 'fixture' WHERE id = $1`, id);
}

/**
 * Injeção de falha por gatilho no banco (caixa-preta: não exige gancho no código de produção). Só roda em banco
 * descartável: exige BILLING_P0_FAULT_INJECTION=disposable e recusa os bancos de desenvolvimento conhecidos.
 */
export async function assertDisposableDatabaseForFaultInjection(prisma: any) {
  if (process.env.BILLING_P0_FAULT_INJECTION !== "disposable") {
    throw new Error("fault injection recusada: defina BILLING_P0_FAULT_INJECTION=disposable apenas com PostgreSQL descartável");
  }
  const rows = (await prisma.$queryRawUnsafe(`SELECT current_database() AS db`)) as Array<{ db: string }>;
  const db = rows[0]?.db ?? "";
  if (db === "eiah_builder" || db === "eiah_builder_shadow") {
    throw new Error(`fault injection recusada: banco de desenvolvimento (${db})`);
  }
}

export async function installAuditFailureTrigger(prisma: any) {
  await assertDisposableDatabaseForFaultInjection(prisma);
  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION p0_fail_billing_audit() RETURNS trigger AS $$
    BEGIN
      IF NEW.event_type LIKE 'billing.%' THEN RAISE EXCEPTION 'p0 test: audit store unavailable'; END IF;
      RETURN NEW;
    END; $$ LANGUAGE plpgsql`);
  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS p0_fail_billing_audit_trg ON guardrail_audit_ledger`);
  await prisma.$executeRawUnsafe(
    `CREATE TRIGGER p0_fail_billing_audit_trg BEFORE INSERT ON guardrail_audit_ledger FOR EACH ROW EXECUTE FUNCTION p0_fail_billing_audit()`,
  );
}

export async function removeAuditFailureTrigger(prisma: any) {
  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS p0_fail_billing_audit_trg ON guardrail_audit_ledger`).catch(() => undefined);
  await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS p0_fail_billing_audit()`).catch(() => undefined);
}

export async function installUsageFailureTrigger(prisma: any) {
  await assertDisposableDatabaseForFaultInjection(prisma);
  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION p0_fail_quota_usage() RETURNS trigger AS $$
    BEGIN RAISE EXCEPTION 'p0 test: quota usage store unavailable'; END; $$ LANGUAGE plpgsql`);
  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS p0_fail_quota_usage_trg ON tenant_quota_usage`);
  await prisma.$executeRawUnsafe(
    `CREATE TRIGGER p0_fail_quota_usage_trg BEFORE INSERT OR UPDATE ON tenant_quota_usage FOR EACH ROW EXECUTE FUNCTION p0_fail_quota_usage()`,
  );
}

export async function removeUsageFailureTrigger(prisma: any) {
  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS p0_fail_quota_usage_trg ON tenant_quota_usage`).catch(() => undefined);
  await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS p0_fail_quota_usage()`).catch(() => undefined);
}
