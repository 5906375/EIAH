export class PolicyNotFoundError extends Error {
  readonly code = "POLICY_NOT_FOUND" as const;
  readonly status = 403 as const;
  readonly reasonCode = "POLICY_NOT_FOUND" as const;
  readonly tenantId: string;
  readonly workspaceId: string;

  constructor(params: { tenantId: string; workspaceId: string }) {
    super("Ação bloqueada: policy explícita ausente para tenant/workspace.");
    this.name = "PolicyNotFoundError";
    this.tenantId = params.tenantId;
    this.workspaceId = params.workspaceId;
  }
}

function normalizeActionName(action: string) {
  return action.trim().toLowerCase();
}

export function resolveAllowedActionNames(params: {
  tenantId: string;
  workspaceId: string;
  dbPolicies: Array<{ actionName: string }>;
  catalogActions: Iterable<string>;
}) {
  const catalogActions = new Set(params.catalogActions);
  const allowedByPolicy = params.dbPolicies
    .map((item) => normalizeActionName(item.actionName))
    .filter((action) => catalogActions.has(action));

  if (allowedByPolicy.length > 0) {
    return new Set(allowedByPolicy);
  }

  if (params.dbPolicies.length > 0) {
    return new Set<string>();
  }

  throw new PolicyNotFoundError({
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
  });
}

export function buildPolicyNotFoundResponseBody() {
  return {
    ok: false,
    error: {
      code: "POLICY_NOT_FOUND",
      reasonCode: "POLICY_NOT_FOUND",
      message: "Ação bloqueada: policy explícita ausente para tenant/workspace.",
    },
  };
}
