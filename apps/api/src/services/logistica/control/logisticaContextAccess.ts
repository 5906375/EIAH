import { LOGISTICA_CONTEXT_SCOPE, type LogisticaContextAccess } from "@eiah/contracts";
import type { ScopeDecision } from "@eiah/core/policy/TenantPolicyStore";
import type { PrismaClient } from "@repo/db";

type Identity = { tenantId: string; workspaceId: string; userId?: string | null };
type Installation = { tenantId: string; workspaceId: string; product: string; status: string };
type Approval = { tenantId: string; workspaceId: string; vertical: string; status: string; revocationMode: string | null };
export type LogisticaContextFacts = {
  identity: Identity;
  installation: Installation | null;
  approval: Approval | null;
  activeMember: boolean;
  /** Permissões GRAVADAS no vínculo ativo do membro (exatas, sem curinga). Vazio quando não há vínculo ativo. */
  memberPermissions: readonly string[];
  policy: ScopeDecision;
};

export function evaluateLogisticaContextAccess(facts: LogisticaContextFacts): LogisticaContextAccess {
  const base = { mode: "context_only", executionAllowed: false, externalTransmissionAllowed: false } as const;
  const denied = (reason: LogisticaContextAccess["reason"]): LogisticaContextAccess =>
    ({ ...base, allowed: false, usage: "blocked", reason });
  const { identity, installation: i, approval: a, policy: p } = facts;
  if (!identity.userId || !facts.activeMember) return denied("membership_required");
  // Vínculo ativo NÃO basta: o vínculo pode ter nascido do comportamento legado (bootstrap, leitura de perfil, papel padrão), que não
  // comprova aprovação humana. A capacidade de contexto precisa constar, de forma exata, nas permissões gravadas do próprio vínculo.
  if (!facts.memberPermissions.includes(LOGISTICA_CONTEXT_SCOPE)) return denied("membership_required");
  if (!i) return denied("installation_missing");
  if (i.tenantId !== identity.tenantId || i.workspaceId !== identity.workspaceId || i.product !== "LOGISTICA") return denied("unavailable");
  if (i.status !== "active") return denied("installation_inactive");
  if (!a || a.tenantId !== identity.tenantId || a.workspaceId !== identity.workspaceId || a.vertical !== "LOGISTICA") return denied("approval_required");
  let usage: LogisticaContextAccess["usage"] = "full";
  if (a.status === "revogado") {
    if (a.revocationMode === "sem_nova_ativacao") usage = "full";
    else if (a.revocationMode === "somente_leitura" || a.revocationMode === null) usage = "read_only";
    else return denied("revoked");
  } else if (a.status !== "aprovado") return denied("approval_required");
  if (!p.allowed || p.tenantId !== identity.tenantId || p.workspaceId !== identity.workspaceId || p.scope !== LOGISTICA_CONTEXT_SCOPE) return denied("policy_denied");
  return { ...base, allowed: true, usage, reason: "available" };
}

/**
 * Permissões gravadas no vínculo ATIVO da pessoa neste workspace (somente leitura: nunca cria, reativa nem promove vínculo).
 * `null` = sem vínculo ativo (ou sem pessoa identificada). Erro de leitura propaga: quem chama nega (fail-closed).
 */
export async function readLogisticaMemberPermissions(prisma: PrismaClient, identity: Identity): Promise<string[] | null> {
  if (!identity.userId) return null;
  const rows = await prisma.$queryRaw<Array<{ permissions: unknown }>>`SELECT permissions FROM eiah_workspace_memberships WHERE tenant_id=${identity.tenantId} AND workspace_id=${identity.workspaceId} AND user_id=${identity.userId} AND status='active' LIMIT 1`;
  if (!rows[0]) return null;
  return Array.isArray(rows[0].permissions) ? (rows[0].permissions as unknown[]).filter((value): value is string => typeof value === "string") : [];
}

/** Capacidade EXPLÍCITA do membro para um escopo canônico da Logística (leitura e escrita são escopos distintos). Falha ⇒ nega. */
export async function hasLogisticaMemberCapability(prisma: PrismaClient, identity: Identity, scope: string): Promise<boolean> {
  try {
    return (await readLogisticaMemberPermissions(prisma, identity))?.includes(scope) === true;
  } catch {
    return false;
  }
}

/** Reuses canonical installation, approval and exact-workspace policy stores. */
export async function resolveLogisticaContextAccess(prisma: PrismaClient, identity: Identity): Promise<LogisticaContextAccess> {
  try {
    const [{ readVerticalAccess }, { TenantPolicyStore }] = await Promise.all([
      import("../../products/verticalAccessApproval"), import("@eiah/core/policy/TenantPolicyStore"),
    ]);
    const [installations, approval, memberPermissions, policy] = await Promise.all([
      prisma.$queryRaw<Installation[]>`SELECT tenant_id AS "tenantId", workspace_id AS "workspaceId", product, status FROM tenant_product_installations WHERE tenant_id=${identity.tenantId} AND workspace_id=${identity.workspaceId} AND product='LOGISTICA' LIMIT 1`,
      readVerticalAccess({ prisma, tenantId: identity.tenantId, workspaceId: identity.workspaceId, vertical: "LOGISTICA" }),
      readLogisticaMemberPermissions(prisma, identity),
      TenantPolicyStore.getInstance().resolveExactWorkspaceScopeDecision(identity.tenantId, identity.workspaceId, LOGISTICA_CONTEXT_SCOPE),
    ]);
    return evaluateLogisticaContextAccess({ identity, installation: installations[0] ?? null, approval, activeMember: memberPermissions !== null, memberPermissions: memberPermissions ?? [], policy });
  } catch {
    return { allowed: false, mode: "context_only", usage: "blocked", reason: "unavailable", executionAllowed: false, externalTransmissionAllowed: false };
  }
}
