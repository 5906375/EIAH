export type RoleKey =
  | "global_admin"
  | "global_auditor"
  | "tenant_admin"
  | "tenant_operator"
  | "tenant_viewer";

export const ROLE_PERMISSIONS: Record<RoleKey, string[]> = {
  global_admin: [
    "dashboard.overview.view",
    "runs.read",
    "runs.execute",
    "runs.view",
    "runs.export",
    "governance.view",
    "governance.trust.view",
    "governance.trust.manage",
    "governance.judge.view",
    "governance.judge.toggle",
    "governance.policy.publish",
    "ledger.view",
    "ledger.export",
    "integrity.view",
    "integrity.reconcile",
    "alerts.view",
    "alerts.ack",
    "alerts.manage",
    "approvals.view",
    "approvals.approve",
    "approvals.manage",
    "delegation.view",
    "delegation.manage",
    "iam.permission.manage",
    "ops.view",
    "dlq.view",
    "dlq.redrive",
    "dlq.policy.manage",
    "reports.view",
    "reports.export",
  ],
  global_auditor: [
    "dashboard.overview.view",
    "runs.view",
    "runs.export",
    "governance.view",
    "governance.trust.view",
    "governance.judge.view",
    "ledger.view",
    "ledger.export",
    "integrity.view",
    "alerts.view",
    "approvals.view",
    "delegation.view",
    "ops.view",
    "dlq.view",
    "reports.view",
    "reports.export",
    "approve_low",
    "approve_medium",
    "approve_high",
    "approve_critical",
    "approve_unknown",
  ],
  tenant_admin: [
    "tenant.manage",
    "members.manage",
    "workspace.manage",
    "connectors.manage",
    "agents.manage",
    "runs.read",
    "runs.execute",
    "governance.read",
    "governance.manage",
    "audit.read",
    "dashboard.overview.view",
    "runs.view",
    "runs.export",
    "governance.view",
    "governance.trust.view",
    "governance.trust.manage",
    "governance.judge.view",
    "governance.judge.toggle",
    "governance.policy.publish",
    "ledger.view",
    "ledger.export",
    "integrity.view",
    "integrity.reconcile",
    "alerts.view",
    "alerts.ack",
    "alerts.manage",
    "approvals.view",
    "approvals.approve",
    "approvals.manage",
    "delegation.view",
    "delegation.manage",
    "iam.permission.manage",
    "ops.view",
    "dlq.view",
    "dlq.redrive",
    "dlq.policy.manage",
    "reports.view",
    "reports.export",
    "approve_low",
    "approve_medium",
    "approve_high",
    "approve_critical",
    "approve_unknown",
  ],
  tenant_operator: [
    "runs.read",
    "runs.execute",
    "governance.read",
    "connectors.read",
    "agents.read",
    "dashboard.overview.view",
    "runs.view",
    "runs.export",
    "governance.view",
    "governance.trust.view",
    "governance.judge.view",
    "ledger.view",
    "ledger.export",
    "integrity.view",
    "alerts.view",
    "alerts.ack",
    "ops.view",
    "dlq.view",
    "dlq.redrive",
    "reports.view",
    "reports.export",
  ],
  tenant_viewer: [
    "runs.read",
    "governance.read",
    "reports.read",
    "reports.export",
    "dashboard.overview.view",
    "runs.view",
    "runs.export",
    "governance.view",
    "governance.trust.view",
    "governance.judge.view",
    "ledger.view",
    "ledger.export",
    "integrity.view",
    "alerts.view",
    "approvals.view",
    "delegation.view",
    "ops.view",
    "dlq.view",
    "reports.view",
    "reports.export",
  ],
};

function parseAllowList(raw?: string | null) {
  if (!raw) return [];
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function resolveRole(
  tokenId: string,
  isGlobalAdmin?: boolean,
  tenantRoleOverride?: "TENANT_ADMIN" | "TENANT_OPERATOR" | "TENANT_VIEWER"
): RoleKey {
  if (isGlobalAdmin) return "global_admin";
  if (tenantRoleOverride === "TENANT_ADMIN") return "tenant_admin";
  if (tenantRoleOverride === "TENANT_OPERATOR") return "tenant_operator";
  if (tenantRoleOverride === "TENANT_VIEWER") return "tenant_viewer";
  const auditorIds = parseAllowList(process.env.GLOBAL_AUDITOR_TOKEN_IDS);
  if (auditorIds.includes(tokenId)) return "global_auditor";
  const operatorIds = parseAllowList(process.env.TENANT_OPERATOR_TOKEN_IDS);
  if (operatorIds.includes(tokenId)) return "tenant_operator";
  const viewerIds = parseAllowList(process.env.TENANT_VIEWER_TOKEN_IDS);
  if (viewerIds.includes(tokenId)) return "tenant_viewer";
  return "tenant_admin";
}

type PermissionPolicy = Record<string, Partial<Record<RoleKey, string[]>>>;

let cachedPolicy: PermissionPolicy | null = null;
function loadPermissionPolicy(): PermissionPolicy {
  if (cachedPolicy) return cachedPolicy;
  const raw =
    process.env.TENANT_PERMISSION_POLICY?.trim() ||
    process.env.PERMISSION_POLICY?.trim() ||
    "";
  if (!raw) {
    cachedPolicy = {};
    return cachedPolicy;
  }
  try {
    const parsed = JSON.parse(raw) as PermissionPolicy;
    cachedPolicy = parsed ?? {};
    return cachedPolicy;
  } catch {
    cachedPolicy = {};
    return cachedPolicy;
  }
}

export function hasPermission(params: {
  role: RoleKey;
  permission: string;
  tenantId?: string | null;
}) {
  const base = ROLE_PERMISSIONS[params.role] ?? [];
  if (base.includes(params.permission)) return true;
  const tenantId = params.tenantId ?? null;
  if (!tenantId) return false;
  const policy = loadPermissionPolicy();
  const tenantPolicy = policy[tenantId] ?? policy["*"];
  if (!tenantPolicy) return false;
  const overrides = tenantPolicy[params.role] ?? [];
  return overrides.includes(params.permission);
}
