import { recordGuardrailAudit } from "@eiah/core/services/guardrailLedgerStore";
import { COMMERCIAL_AUTHORITY_SCOPE_CATALOG, COMMERCIAL_AUTHORITY_SCOPES } from "@eiah/core";

/**
 * Autoridade para contratar agentes (AUTHZ-SCOPE-1, escopo `marketplace.subscribe`).
 *
 * Contratar um agente pertence a uma identidade humana permissionada do tenant e workspace. Esta camada só decide e
 * registra; não cria assinatura, política nem delegação. Qualquer falha ou dúvida nega (fail-closed).
 *
 * A autorização exige DUAS atribuições expressas, nenhuma concedida por padrão:
 *  1. política `marketplace.subscribe` para o workspace exato (mecanismo canônico `TenantActionPolicy`);
 *  2. permissão `marketplace.subscribe` na membership ATIVA da pessoa naquele workspace.
 * Founder, administradores, `actions.admin` e `products.activate` não substituem nenhuma das duas.
 */
export const SUBSCRIBE_SCOPE = COMMERCIAL_AUTHORITY_SCOPES.marketplaceSubscribe;

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
  | "POLICY_NOT_GRANTED"
  | "POLICY_UNAVAILABLE"
  | "MEMBERSHIP_NOT_FOUND"
  | "MEMBERSHIP_NOT_ACTIVE"
  | "MEMBERSHIP_PERMISSION_MISSING"
  | "MEMBERSHIP_UNAVAILABLE";

export type SubscriptionAuthorityDecision = {
  allowed: boolean;
  reasonCode: SubscriptionAuthorityReason;
  /** Código bruto da política quando ela negou (ex.: TENANT_POLICY_DISABLED). Informativo. */
  policyReasonCode?: string;
};

export type SubscriptionMembership = { status: string | null; permissions: string[] } | null;

export type SubscriptionAuthorityDeps = {
  /**
   * Política explícita `marketplace.subscribe` para o workspace EXATO do token. Não herda política tenant-wide
   * (mesma regra estrita de `resolveExactWorkspaceScopeDecision`). Não escreve nada.
   */
  resolvePolicy: (actor: SubscriptionAuthorityActor) => Promise<{ allowed: boolean; reasonCode: string }>;
  readMembership: (actor: SubscriptionAuthorityActor) => Promise<SubscriptionMembership>;
};

type PrismaLike = { $queryRaw: (...args: any[]) => Promise<any> };

function parsePermissions(value: unknown): string[] {
  let source: unknown = value;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(source)) return [];
  return source.filter((item): item is string => typeof item === "string").map((item) => item.trim());
}

/**
 * Leitura SOMENTE LEITURA da membership (sem DDL, sem bootstrap de membership, sem promoção a Founder). Ausência de
 * linha ou tabela inexistente nunca cria autoridade.
 */
export function createDefaultSubscriptionAuthorityDeps(prisma: PrismaLike): SubscriptionAuthorityDeps {
  return {
    async resolvePolicy(actor) {
      const { TenantPolicyStore } = await import("@eiah/core/policy/TenantPolicyStore");
      const decision = await TenantPolicyStore.getInstance().resolveExactWorkspaceScopeDecision(
        actor.tenantId,
        actor.workspaceId,
        SUBSCRIBE_SCOPE,
      );
      return { allowed: decision.allowed === true, reasonCode: String(decision.reasonCode ?? "UNKNOWN") };
    },
    async readMembership(actor) {
      const rows = (await prisma.$queryRaw`
        SELECT status, permissions
        FROM eiah_workspace_memberships
        WHERE user_id = ${actor.userId}
          AND tenant_id = ${actor.tenantId}
          AND workspace_id = ${actor.workspaceId}
        LIMIT 1
      `) as Array<{ status?: unknown; permissions?: unknown }>;
      const row = rows[0];
      if (!row) return null;
      return { status: typeof row.status === "string" ? row.status : null, permissions: parsePermissions(row.permissions) };
    },
  };
}

/**
 * Seam de teste (mesmo padrão de `requireScopeDeps`): em produção resolve a política canônica e a membership real.
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

  let policy: { allowed: boolean; reasonCode: string };
  try {
    policy = await deps.resolvePolicy(scoped);
  } catch {
    return { allowed: false, reasonCode: "POLICY_UNAVAILABLE" };
  }
  if (policy.allowed !== true) {
    return {
      allowed: false,
      reasonCode: /UNAVAILABLE/.test(policy.reasonCode) ? "POLICY_UNAVAILABLE" : "POLICY_NOT_GRANTED",
      policyReasonCode: policy.reasonCode,
    };
  }

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
  if (!membership.permissions.includes(SUBSCRIBE_SCOPE)) {
    return { allowed: false, reasonCode: "MEMBERSHIP_PERMISSION_MISSING" };
  }
  return { allowed: true, reasonCode: "AUTHORITY_GRANTED" };
}

export const SUBSCRIBE_FORBIDDEN_ERROR = {
  code: "MARKETPLACE_SUBSCRIBE_FORBIDDEN",
  message:
    "Contratar um agente exige uma pessoa autorizada deste workspace (permissão marketplace.subscribe). A recomendação continua disponível; peça a aprovação a quem tem essa autoridade.",
} as const;

export type SubscriptionDecisionRecord = {
  prisma: Parameters<typeof recordGuardrailAudit>[0]["prisma"];
  actor: SubscriptionAuthorityActor;
  outcome: "authorized" | "denied";
  reasonCode: string;
  /** Rota/efeito pretendido, ex.: "marketplace.subscribe" ou "delegations.self_delegation". */
  action: string;
  target?: {
    marketplaceItemId?: string | null;
    agentName?: string | null;
    publisherId?: string | null;
    scope?: string | null;
    trustMin?: number | null;
    validUntil?: string | null;
  };
};

/**
 * Registro da decisão em GuardrailAuditLedger (mecanismo existente): identidade decisora, tenant, workspace, agente,
 * condições aceitas, horário e resultado. Retorna false se não conseguiu gravar; quem chama deve negar a contratação
 * quando `outcome === "authorized"` e o registro falhar.
 */
export async function recordSubscriptionDecision(record: SubscriptionDecisionRecord): Promise<boolean> {
  try {
    await recordGuardrailAudit({
      prisma: record.prisma,
      tenantId: record.actor.tenantId,
      workspaceId: record.actor.workspaceId,
      eventType: `${record.action}.${record.outcome}`,
      severity: record.outcome === "authorized" ? "info" : "warn",
      message: `${record.action} ${record.outcome} (${record.reasonCode})`,
      metadata: {
        decisionRef: COMMERCIAL_AUTHORITY_SCOPE_CATALOG[0].decisionRef,
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
    });
    return true;
  } catch {
    return false;
  }
}
