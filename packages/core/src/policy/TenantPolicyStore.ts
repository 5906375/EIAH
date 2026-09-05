export type ScopeDecisionReasonCode =
  | "SCOPE_ALLOWED"
  | "POLICY_NOT_FOUND"
  | "SCOPE_NOT_ALLOWED"
  | "WORKSPACE_SCOPE_MISMATCH"
  | "TENANT_POLICY_DISABLED"
  | "POLICY_STORE_UNAVAILABLE";

export type ScopeDecision =
  | {
      allowed: true;
      reasonCode: "SCOPE_ALLOWED";
      tenantId: string;
      workspaceId: string;
      scope: string;
      policyVersion?: string;
    }
  | {
      allowed: false;
      reasonCode:
        | "POLICY_NOT_FOUND"
        | "SCOPE_NOT_ALLOWED"
        | "WORKSPACE_SCOPE_MISMATCH"
        | "TENANT_POLICY_DISABLED"
        | "POLICY_STORE_UNAVAILABLE";
      tenantId: string;
      workspaceId: string;
      scope: string;
      policyVersion?: string;
    };

type TenantActionPolicyRow = {
  workspaceId: string | null;
  allowed: boolean;
  maxVersion: number | null;
};

async function loadPrismaGlobal() {
  const { prismaGlobal } = await import("@repo/db");
  return prismaGlobal;
}

function normalizeScope(scope: string) {
  return scope.trim().toLowerCase();
}

function toPolicyVersion(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `v${value}` : undefined;
}

function buildDecision(params: {
  allowed: boolean;
  reasonCode: ScopeDecisionReasonCode;
  tenantId: string;
  workspaceId: string;
  scope: string;
  policyVersion?: string;
}): ScopeDecision {
  return {
    allowed: params.allowed,
    reasonCode: params.reasonCode as ScopeDecision["reasonCode"],
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    scope: params.scope,
    ...(params.policyVersion ? { policyVersion: params.policyVersion } : {}),
  } as ScopeDecision;
}

export class TenantPolicyStore {
  private static instance: TenantPolicyStore | null = null;

  static getInstance() {
    if (!TenantPolicyStore.instance) {
      TenantPolicyStore.instance = new TenantPolicyStore();
    }
    return TenantPolicyStore.instance;
  }

  async resolveScopeDecision(tenantId: string, workspaceId: string, scope: string): Promise<ScopeDecision> {
    const normalizedScope = normalizeScope(scope);
    if (!tenantId.trim() || !workspaceId.trim() || !normalizedScope) {
      return buildDecision({
        allowed: false,
        reasonCode: "SCOPE_NOT_ALLOWED",
        tenantId,
        workspaceId,
        scope: normalizedScope || scope.trim(),
      });
    }

    try {
      const prismaGlobal = await loadPrismaGlobal();
      const rows = (await prismaGlobal.tenantActionPolicy.findMany({
        where: {
          tenantId,
          actionName: normalizedScope,
        },
        select: {
          workspaceId: true,
          allowed: true,
          maxVersion: true,
        },
      })) as TenantActionPolicyRow[];

      const exactWorkspacePolicies = rows.filter((row) => row.workspaceId === workspaceId);
      const tenantWidePolicies = rows.filter((row) => row.workspaceId === null);
      const otherWorkspacePolicy = rows.find((row) => row.workspaceId !== null && row.workspaceId !== workspaceId) ?? null;

      // The schema does not currently enforce uniqueness for tenant/workspace/action.
      // Conflicting authority must not be selected by nondeterministic row order.
      if (exactWorkspacePolicies.length > 1 || (exactWorkspacePolicies.length === 0 && tenantWidePolicies.length > 1)) {
        return buildDecision({
          allowed: false,
          reasonCode: "POLICY_STORE_UNAVAILABLE",
          tenantId,
          workspaceId,
          scope: normalizedScope,
        });
      }

      const exactWorkspacePolicy = exactWorkspacePolicies[0] ?? null;
      const tenantWidePolicy = tenantWidePolicies[0] ?? null;

      if (exactWorkspacePolicy) {
        if (!exactWorkspacePolicy.allowed) {
          return buildDecision({
            allowed: false,
            reasonCode: "TENANT_POLICY_DISABLED",
            tenantId,
            workspaceId,
            scope: normalizedScope,
            policyVersion: toPolicyVersion(exactWorkspacePolicy.maxVersion),
          });
        }

        return buildDecision({
          allowed: true,
          reasonCode: "SCOPE_ALLOWED",
          tenantId,
          workspaceId,
          scope: normalizedScope,
          policyVersion: toPolicyVersion(exactWorkspacePolicy.maxVersion),
        });
      }

      if (tenantWidePolicy) {
        if (!tenantWidePolicy.allowed) {
          return buildDecision({
            allowed: false,
            reasonCode: "TENANT_POLICY_DISABLED",
            tenantId,
            workspaceId,
            scope: normalizedScope,
            policyVersion: toPolicyVersion(tenantWidePolicy.maxVersion),
          });
        }

        return buildDecision({
          allowed: true,
          reasonCode: "SCOPE_ALLOWED",
          tenantId,
          workspaceId,
          scope: normalizedScope,
          policyVersion: toPolicyVersion(tenantWidePolicy.maxVersion),
        });
      }

      if (otherWorkspacePolicy) {
        return buildDecision({
          allowed: false,
          reasonCode: "WORKSPACE_SCOPE_MISMATCH",
          tenantId,
          workspaceId,
          scope: normalizedScope,
          policyVersion: toPolicyVersion(otherWorkspacePolicy.maxVersion),
        });
      }

      return buildDecision({
        allowed: false,
        reasonCode: "POLICY_NOT_FOUND",
        tenantId,
        workspaceId,
        scope: normalizedScope,
      });
    } catch {
      return buildDecision({
        allowed: false,
        reasonCode: "POLICY_STORE_UNAVAILABLE",
        tenantId,
        workspaceId,
        scope: normalizedScope,
      });
    }
  }

  async isScopeAllowed(tenantId: string, workspaceId: string, scope: string) {
    const decision = await this.resolveScopeDecision(tenantId, workspaceId, scope);
    return decision.allowed;
  }
}

export async function closeTenantPolicyStoreResources() {
  return Promise.resolve();
}
