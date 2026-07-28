export const ADMIN_SCOPES = {
  actions: "actions.admin",
  tools: "tools.admin",
} as const;

export type AdminScope = (typeof ADMIN_SCOPES)[keyof typeof ADMIN_SCOPES];

export type AdminScopeDefinition = Readonly<{
  scope: AdminScope;
  status: "ratified";
  layer: "identity-authorization";
  description: string;
  routes: readonly string[];
  approver: "Carlos Alberto Merlo";
  ratifiedAt: "2026-07-28";
  decisionRef: "AUTHZ-SCOPE-0/2026-07-28";
}>;

/**
 * Canonical administrative scopes ratified in AUTHZ-SCOPE-0.
 *
 * Catalog membership does not grant a scope to any token. Runtime enforcement
 * remains fail-closed and must resolve an explicit tenant/workspace policy.
 */
export const ADMIN_SCOPE_CATALOG = [
  {
    scope: ADMIN_SCOPES.actions,
    status: "ratified",
    layer: "identity-authorization",
    description:
      "Administers the Actions catalog and tenant action policies on explicitly protected routes.",
    routes: [
      "POST /api/actions/version",
      "DELETE /api/actions/version/:version",
      "POST /api/actions/override",
      "GET /api/actions (administrative/global listing)",
    ],
    approver: "Carlos Alberto Merlo",
    ratifiedAt: "2026-07-28",
    decisionRef: "AUTHZ-SCOPE-0/2026-07-28",
  },
  {
    scope: ADMIN_SCOPES.tools,
    status: "ratified",
    layer: "identity-authorization",
    description:
      "Administers ToolContracts and administrative/global tool listings on explicitly protected routes.",
    routes: [
      "POST /api/tools",
      "GET /api/tools (administrative/global/cross-tenant listing)",
    ],
    approver: "Carlos Alberto Merlo",
    ratifiedAt: "2026-07-28",
    decisionRef: "AUTHZ-SCOPE-0/2026-07-28",
  },
] as const satisfies readonly AdminScopeDefinition[];

export function isAdminScope(value: string): value is AdminScope {
  return Object.values(ADMIN_SCOPES).some((scope) => scope === value);
}
