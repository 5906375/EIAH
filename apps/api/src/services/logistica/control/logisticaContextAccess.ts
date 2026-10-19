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
  policy: ScopeDecision;
};

export function evaluateLogisticaContextAccess(facts: LogisticaContextFacts): LogisticaContextAccess {
  const base = { mode: "context_only", executionAllowed: false, externalTransmissionAllowed: false } as const;
  const denied = (reason: LogisticaContextAccess["reason"]): LogisticaContextAccess =>
    ({ ...base, allowed: false, usage: "blocked", reason });
  const { identity, installation: i, approval: a, policy: p } = facts;
  if (!identity.userId || !facts.activeMember) return denied("membership_required");
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

/** Reuses canonical installation, approval and exact-workspace policy stores. */
export async function resolveLogisticaContextAccess(prisma: PrismaClient, identity: Identity): Promise<LogisticaContextAccess> {
  try {
    const [{ readVerticalAccess }, { TenantPolicyStore }] = await Promise.all([
      import("../../products/verticalAccessApproval"), import("@eiah/core/policy/TenantPolicyStore"),
    ]);
    const [installations, approval, members, policy] = await Promise.all([
      prisma.$queryRaw<Installation[]>`SELECT tenant_id AS "tenantId", workspace_id AS "workspaceId", product, status FROM tenant_product_installations WHERE tenant_id=${identity.tenantId} AND workspace_id=${identity.workspaceId} AND product='LOGISTICA' LIMIT 1`,
      readVerticalAccess({ prisma, tenantId: identity.tenantId, workspaceId: identity.workspaceId, vertical: "LOGISTICA" }),
      identity.userId ? prisma.$queryRaw<Array<{ active: boolean }>>`SELECT true AS active FROM eiah_workspace_memberships WHERE tenant_id=${identity.tenantId} AND workspace_id=${identity.workspaceId} AND user_id=${identity.userId} AND status='active' LIMIT 1` : Promise.resolve([]),
      TenantPolicyStore.getInstance().resolveExactWorkspaceScopeDecision(identity.tenantId, identity.workspaceId, LOGISTICA_CONTEXT_SCOPE),
    ]);
    return evaluateLogisticaContextAccess({ identity, installation: installations[0] ?? null, approval, activeMember: members[0]?.active === true, policy });
  } catch {
    return { allowed: false, mode: "context_only", usage: "blocked", reason: "unavailable", executionAllowed: false, externalTransmissionAllowed: false };
  }
}
