import crypto from "node:crypto";
import { FINANCIAL_AUTHORITY_SCOPES, type FinancialAuthorityScope } from "@eiah/core";
import { readActiveMembershipStatus } from "./commercialAuthority";

/**
 * Autoridade financeira (AUTHZ-FIN-1, PROPOSTA técnica do BILLING-003; não ratificada): decide se uma pessoa pode exercer
 * `billing.limits.manage` ou `billing.ledger.adjust` no tenant do token. Especificação: docs/ops/billing-financial-authority-spec.md.
 *
 * A autoridade vive só numa DESIGNAÇÃO explícita (`financial_authority_designation`), por tenant. Founder, papel, permissão de
 * membro, `products.activate`, `actions.admin`, administrador por e-mail, `ADMIN_API_TOKEN` e token técnico NUNCA a produzem.
 * Pré-condições: pessoa identificada (`userId`) e vínculo ATIVO no workspace do token. Toda dúvida ou falha de leitura nega
 * (fail-closed). A leitura é feita a cada chamada, sem cache: a revogação vale na chamada seguinte.
 *
 * Este módulo NÃO concede, revoga nem cria designações e NÃO faz bootstrap da primeira autoridade (D1 segue bloqueado).
 */
export const FINANCIAL_CONTRACT_REF = "AUTHZ-FIN-1";
export const FINANCIAL_CONTRACT_VERSION = "proposal-1";
export const FINANCIAL_EVIDENCE_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/#@-]{2,119}$/;
export const INT32_MAX = 2_147_483_647;

type Prisma = any;

export type FinancialActor = {
  tenantId: string;
  workspaceId: string;
  userId?: string | null;
  tokenId?: string | null;
};

export type FinancialLimits = { maxAdjustmentCents?: number };

export type FinancialDenialCode =
  | "BILLING_IDENTITY_REQUIRED"
  | "BILLING_MEMBERSHIP_REQUIRED"
  | "BILLING_AUTHORITY_REQUIRED"
  | "BILLING_AUTHORITY_CHECK_UNAVAILABLE";

export type FinancialAuthorityGranted = {
  ok: true;
  designationId: string;
  scope: FinancialAuthorityScope;
  limits: FinancialLimits;
  actorUserId: string;
  tokenId: string | null;
  tenantId: string;
  workspaceId: string;
};

export type FinancialAuthorityDenied = {
  ok: false;
  status: 403 | 503;
  code: FinancialDenialCode;
  /** Motivo exato. Vai só para a auditoria; a resposta HTTP usa o `code` genérico. */
  reasonCode: string;
  message: string;
};

export type FinancialAuthorityDecision = FinancialAuthorityGranted | FinancialAuthorityDenied;

const MESSAGES: Record<FinancialDenialCode, string> = {
  BILLING_IDENTITY_REQUIRED: "A alteração financeira exige uma pessoa autenticada; token técnico não tem autoridade financeira.",
  BILLING_MEMBERSHIP_REQUIRED: "A alteração financeira exige vínculo ativo da pessoa com este workspace.",
  BILLING_AUTHORITY_REQUIRED: "Você não tem autoridade financeira designada para esta operação. Nada foi alterado.",
  BILLING_AUTHORITY_CHECK_UNAVAILABLE: "Não foi possível verificar a autoridade financeira. Nada foi alterado.",
};

function deny(status: 403 | 503, code: FinancialDenialCode, reasonCode: string): FinancialAuthorityDenied {
  return { ok: false, status, code, reasonCode, message: MESSAGES[code] };
}

/**
 * Limites vindos do banco. Para o ajuste, o teto por lançamento é OBRIGATÓRIO (inteiro > 0, cabendo em int4), sem valor padrão:
 * ausente ou inválido => a designação não vale como autoridade (null).
 */
export function normalizeFinancialLimits(scope: FinancialAuthorityScope, value: unknown): FinancialLimits | null {
  let source: unknown = value;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch {
      source = null;
    }
  }
  const raw = source && typeof source === "object" && !Array.isArray(source) ? (source as Record<string, unknown>) : {};
  if (scope === FINANCIAL_AUTHORITY_SCOPES.ledgerAdjust) {
    const cap = raw.maxAdjustmentCents;
    if (typeof cap !== "number" || !Number.isInteger(cap) || cap < 1 || cap > INT32_MAX) return null;
    return { maxAdjustmentCents: cap };
  }
  return {};
}

/** Designação `holder` ATIVA (não revogada, não expirada) da pessoa, NO TENANT do token. Erros de consulta propagam (quem chama nega). */
export async function readActiveFinancialDesignation(
  prisma: Prisma,
  scope: { tenantId: string; userId: string; scope: FinancialAuthorityScope; now?: Date },
): Promise<{ id: string; limits: unknown } | null> {
  const now = scope.now ?? new Date();
  const rows = (await prisma.$queryRaw`
    SELECT id, limits
    FROM financial_authority_designation
    WHERE tenant_id = ${scope.tenantId}
      AND beneficiary_user_id = ${scope.userId}
      AND scope = ${scope.scope}
      AND authority_role = 'holder'
      AND revoked_at IS NULL
      AND valid_until > ${now}
    LIMIT 1
  `) as Array<{ id?: unknown; limits?: unknown }>;
  const row = rows[0];
  if (!row || typeof row.id !== "string") return null;
  return { id: row.id, limits: row.limits };
}

export async function evaluateFinancialAuthority(
  prisma: Prisma,
  actor: FinancialActor,
  scope: FinancialAuthorityScope,
  now: Date = new Date(),
): Promise<FinancialAuthorityDecision> {
  const tenantId = typeof actor.tenantId === "string" ? actor.tenantId.trim() : "";
  const workspaceId = typeof actor.workspaceId === "string" ? actor.workspaceId.trim() : "";
  if (!tenantId || !workspaceId) return deny(403, "BILLING_AUTHORITY_REQUIRED", "CONTEXT_INVALID");
  const userId = typeof actor.userId === "string" ? actor.userId.trim() : "";
  // Token sem pessoa associada (serviço, agente, automação) nunca exerce autoridade financeira.
  if (!userId) return deny(403, "BILLING_IDENTITY_REQUIRED", "IDENTITY_REQUIRED");

  let membership: { status: string | null } | null;
  try {
    membership = await readActiveMembershipStatus(prisma, { tenantId, workspaceId, userId });
  } catch {
    return deny(503, "BILLING_AUTHORITY_CHECK_UNAVAILABLE", "MEMBERSHIP_UNAVAILABLE");
  }
  if (!membership) return deny(403, "BILLING_MEMBERSHIP_REQUIRED", "MEMBERSHIP_NOT_FOUND");
  if (String(membership.status ?? "").trim().toLowerCase() !== "active") {
    return deny(403, "BILLING_MEMBERSHIP_REQUIRED", "MEMBERSHIP_NOT_ACTIVE");
  }

  let designation: { id: string; limits: unknown } | null;
  try {
    designation = await readActiveFinancialDesignation(prisma, { tenantId, userId, scope, now });
  } catch {
    return deny(503, "BILLING_AUTHORITY_CHECK_UNAVAILABLE", "DESIGNATION_UNAVAILABLE");
  }
  if (!designation) return deny(403, "BILLING_AUTHORITY_REQUIRED", "DESIGNATION_NOT_FOUND");

  const limits = normalizeFinancialLimits(scope, designation.limits);
  if (!limits) return deny(403, "BILLING_AUTHORITY_REQUIRED", "DESIGNATION_LIMITS_INVALID");

  return {
    ok: true,
    designationId: designation.id,
    scope,
    limits,
    actorUserId: userId,
    tokenId: actor.tokenId ?? null,
    tenantId,
    workspaceId,
  };
}

/** Falha ao gravar a evidência: o efeito financeiro NÃO pode permanecer (a transação inteira é desfeita). */
export class FinancialAuditError extends Error {
  constructor(cause?: unknown) {
    super("financial audit event could not be recorded");
    this.name = "FinancialAuditError";
    (this as { cause?: unknown }).cause = cause;
  }
}

export type FinancialAuditEvent = {
  eventType: "billing.quota.updated" | "billing.workspace_grant.updated" | "billing.adjustment.applied" | "billing.authority.denied";
  severity?: "info" | "warn";
  message: string;
  metadata: Record<string, unknown> & { tenantId: string; workspaceId: string };
};

/** Gravador do evento. Seam de teste/injeção: em produção grava em `GuardrailAuditLedger` pelo cliente (ou transação) recebido. */
export type FinancialAuditWriter = (tx: Prisma, event: FinancialAuditEvent) => Promise<string>;

export const writeFinancialAuditEvent: FinancialAuditWriter = async (tx, event) => {
  const id = crypto.randomUUID();
  try {
    await tx.guardrailAuditLedger.create({
      data: {
        id,
        tenantId: event.metadata.tenantId,
        workspaceId: event.metadata.workspaceId,
        eventType: event.eventType,
        severity: event.severity ?? "info",
        message: event.message,
        metadata: event.metadata,
      },
    });
  } catch (error) {
    throw new FinancialAuditError(error);
  }
  return id;
};

/** Metadados comuns de um efeito AUTORIZADO. Só ids: nunca token, JWT, senha ou credencial. */
export function financialAppliedMetadata(
  granted: FinancialAuthorityGranted,
  details: { operation: string; reason: string; evidenceRef: string } & Record<string, unknown>,
  now: Date = new Date(),
) {
  return {
    contractRef: FINANCIAL_CONTRACT_REF,
    contractVersion: FINANCIAL_CONTRACT_VERSION,
    tenantId: granted.tenantId,
    workspaceId: granted.workspaceId,
    actorUserId: granted.actorUserId,
    tokenId: granted.tokenId,
    designationId: granted.designationId,
    scope: granted.scope,
    outcome: "applied",
    reasonCode: "AUTHORITY_GRANTED",
    decidedAt: now.toISOString(),
    ...details,
  };
}

/** Negativas são registradas em MELHOR ESFORÇO: a negação nunca depende do registro e nunca vira permissão. */
export async function recordFinancialDenial(
  prisma: Prisma,
  actor: FinancialActor,
  scope: FinancialAuthorityScope,
  denial: { reasonCode: string; code: string; operation: string },
  now: Date = new Date(),
) {
  try {
    await writeFinancialAuditEvent(prisma, {
      eventType: "billing.authority.denied",
      severity: "warn",
      message: `billing.authority denied (${denial.code})`,
      metadata: {
        contractRef: FINANCIAL_CONTRACT_REF,
        contractVersion: FINANCIAL_CONTRACT_VERSION,
        tenantId: actor.tenantId,
        workspaceId: actor.workspaceId,
        actorUserId: actor.userId ?? null,
        tokenId: actor.tokenId ?? null,
        scope,
        operation: denial.operation,
        outcome: "denied",
        reasonCode: denial.reasonCode,
        code: denial.code,
        decidedAt: now.toISOString(),
      },
    });
  } catch {
    /* melhor esforço */
  }
}
