import crypto from "node:crypto";
import { COMMERCIAL_AUTHORITY_SCOPE_CATALOG } from "@eiah/core";
import {
  COMMERCIAL_SCOPE,
  commercialLimitViolation,
  readActiveDesignation,
  readActiveMembershipStatus,
  type AuthorityLimits,
  type Designation,
} from "./commercialAuthority";

/**
 * Autoridade para CONTRATAR agentes (AUTHZ-SCOPE-1, escopo `marketplace.subscribe`).
 *
 * Contratar pertence a uma pessoa humana com autoridade comercial EXPLICITAMENTE designada pelo tenant, no workspace
 * aplicável (ver `commercialAuthority.ts`). Esta camada só decide e registra; não cria assinatura, política nem
 * delegação. Qualquer falha ou dúvida nega (fail-closed).
 *
 * A autorização exige, ao mesmo tempo:
 *  1. pessoa autenticada (token de serviço/agente nunca contrata);
 *  2. membership ATIVA da pessoa no tenant/workspace do token;
 *  3. designação `holder` ATIVA (não revogada, não expirada) da pessoa para o workspace exato.
 * Founder, administradores, `actions.admin`, `products.activate`, papéis personalizados e permissões de membro NÃO
 * substituem a designação: a leitura é feita direto no registro de designações, sem cache.
 */
export const SUBSCRIBE_SCOPE = COMMERCIAL_SCOPE;

export type SubscriptionAuthorityActor = {
  tenantId: string;
  workspaceId: string;
  userId?: string | null;
  tokenId?: string | null;
};

export type SubscriptionAuthorityReason =
  | "AUTHORITY_GRANTED"
  | "IDENTITY_REQUIRED"
  | "CONTEXT_INVALID"
  | "DESIGNATION_NOT_FOUND"
  | "DESIGNATION_UNAVAILABLE"
  | "MEMBERSHIP_NOT_FOUND"
  | "MEMBERSHIP_NOT_ACTIVE"
  | "MEMBERSHIP_UNAVAILABLE";

export type SubscriptionAuthorityDecision = {
  allowed: boolean;
  reasonCode: SubscriptionAuthorityReason;
  /** Designação que fundamenta a autorização; só presente quando `allowed`. */
  designationId?: string;
  /** Limites comerciais da designação (escopos de delegação e prazo máximo); só presente quando `allowed`. */
  limits?: AuthorityLimits;
};

export type SubscriptionMembership = { status: string | null } | null;

export type SubscriptionAuthorityDeps = {
  readMembership: (actor: SubscriptionAuthorityActor) => Promise<SubscriptionMembership>;
  /** Designação `holder` ativa da pessoa no workspace exato. Não escreve nada. */
  readDesignation: (actor: SubscriptionAuthorityActor) => Promise<Pick<Designation, "id" | "limits"> | null>;
};

type PrismaLike = { $queryRaw: (...args: any[]) => Promise<any> };

/** Leituras SOMENTE LEITURA: sem DDL, sem bootstrap de membership, sem promoção a Founder. Ausência nunca cria autoridade. */
export function createDefaultSubscriptionAuthorityDeps(prisma: PrismaLike): SubscriptionAuthorityDeps {
  return {
    readMembership: (actor) =>
      readActiveMembershipStatus(prisma, { tenantId: actor.tenantId, workspaceId: actor.workspaceId, userId: String(actor.userId) }),
    readDesignation: (actor) =>
      readActiveDesignation(prisma, { tenantId: actor.tenantId, workspaceId: actor.workspaceId, userId: String(actor.userId), role: "holder" }),
  };
}

/**
 * Seam de teste (mesmo padrão de `requireScopeDeps`): em produção lê membership e designação reais.
 * Nunca é alimentado por request, header ou body.
 */
export const subscriptionAuthorityDeps = {
  forClient: (prisma: unknown): SubscriptionAuthorityDeps => createDefaultSubscriptionAuthorityDeps(prisma as PrismaLike),
};

export async function evaluateSubscriptionAuthority(
  actor: SubscriptionAuthorityActor,
  deps: SubscriptionAuthorityDeps,
): Promise<SubscriptionAuthorityDecision> {
  const tenantId = typeof actor.tenantId === "string" ? actor.tenantId.trim() : "";
  const workspaceId = typeof actor.workspaceId === "string" ? actor.workspaceId.trim() : "";
  if (!tenantId || !workspaceId) return { allowed: false, reasonCode: "CONTEXT_INVALID" };
  const userId = typeof actor.userId === "string" ? actor.userId.trim() : "";
  // Token sem pessoa associada (serviço, agente, automação) nunca contrata.
  if (!userId) return { allowed: false, reasonCode: "IDENTITY_REQUIRED" };
  const scoped = { ...actor, tenantId, workspaceId, userId };

  let membership: SubscriptionMembership;
  try {
    membership = await deps.readMembership(scoped);
  } catch {
    return { allowed: false, reasonCode: "MEMBERSHIP_UNAVAILABLE" };
  }
  if (!membership) return { allowed: false, reasonCode: "MEMBERSHIP_NOT_FOUND" };
  if (String(membership.status ?? "").trim().toLowerCase() !== "active") {
    return { allowed: false, reasonCode: "MEMBERSHIP_NOT_ACTIVE" };
  }

  let designation: Pick<Designation, "id" | "limits"> | null;
  try {
    designation = await deps.readDesignation(scoped);
  } catch {
    return { allowed: false, reasonCode: "DESIGNATION_UNAVAILABLE" };
  }
  if (!designation) return { allowed: false, reasonCode: "DESIGNATION_NOT_FOUND" };
  return { allowed: true, reasonCode: "AUTHORITY_GRANTED", designationId: designation.id, limits: designation.limits };
}

/**
 * Aplica os limites comerciais da designação a uma contratação concreta (escopo de delegação e prazo). Retorna o
 * motivo da violação ou null. Sem limites conhecidos, nega.
 */
export function subscriptionLimitViolation(
  decision: SubscriptionAuthorityDecision,
  request: { scope: string; validUntil: Date },
): string | null {
  if (!decision.allowed || !decision.limits) return "LIMITS_UNKNOWN";
  return commercialLimitViolation(decision.limits, request);
}

export const SUBSCRIBE_FORBIDDEN_ERROR = {
  code: "MARKETPLACE_SUBSCRIBE_FORBIDDEN",
  message:
    "Contratar um agente exige uma pessoa com autoridade comercial designada neste workspace (marketplace.subscribe). A recomendação continua disponível; peça a aprovação a quem tem essa autoridade.",
} as const;

export const COMMERCIAL_LIMIT_ERROR = {
  code: "COMMERCIAL_LIMIT_EXCEEDED",
  message: "A contratação excede os limites da sua autoridade comercial (escopo de delegação ou prazo).",
} as const;

export type SubscriptionDecisionRecord = {
  prisma: { guardrailAuditLedger: { create: (args: any) => Promise<unknown> } };
  actor: SubscriptionAuthorityActor;
  outcome: "authorized" | "denied";
  reasonCode: string;
  /** Rota/efeito pretendido, ex.: "marketplace.subscribe", "delegations.self_delegation" ou "actions.override.commercial". */
  action: string;
  target?: {
    marketplaceItemId?: string | null;
    agentName?: string | null;
    publisherId?: string | null;
    scope?: string | null;
    trustMin?: number | null;
    validUntil?: string | null;
    /** Designação comercial que fundamentou a decisão. */
    designationId?: string | null;
  };
};

/**
 * Registro da decisão em GuardrailAuditLedger (mecanismo existente): identidade decisora, designação, tenant, workspace,
 * agente, condições aceitas, horário e resultado. Devolve o id do evento (que a habilitação passa a referenciar) ou
 * null se não conseguiu gravar; quem chama deve negar o efeito quando `outcome === "authorized"` e o retorno for null.
 * Só ids: nunca token, JWT, senha ou credencial.
 */
export async function recordSubscriptionDecision(record: SubscriptionDecisionRecord): Promise<string | null> {
  try {
    const id = crypto.randomUUID();
    await record.prisma.guardrailAuditLedger.create({
      data: {
        id,
        tenantId: record.actor.tenantId,
        workspaceId: record.actor.workspaceId,
        eventType: `${record.action}.${record.outcome}`,
        severity: record.outcome === "authorized" ? "info" : "warn",
        message: `${record.action} ${record.outcome} (${record.reasonCode})`,
        metadata: {
          decisionRef: COMMERCIAL_AUTHORITY_SCOPE_CATALOG[0].decisionRef,
          formalRatification: "pending",
          authorityScope: SUBSCRIBE_SCOPE,
          decidedBy: record.actor.userId ?? null,
          tokenId: record.actor.tokenId ?? null,
          tenantId: record.actor.tenantId,
          workspaceId: record.actor.workspaceId,
          outcome: record.outcome,
          reasonCode: record.reasonCode,
          target: record.target ?? null,
          decidedAt: new Date().toISOString(),
        },
      },
    });
    return id;
  } catch {
    return null;
  }
}
