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

/**
 * Commercial authority scopes (AUTHZ-SCOPE-1). ADOPTED as a product decision on 2026-10-12; the formal, signed
 * ratification is still PENDING, so this catalog deliberately does not claim `status: "ratified"` nor a ratification
 * date. `decisionRef` is a provisional reference to be confirmed by the approver.
 *
 * They are distinct from the administrative scopes above and from any
 * operational execution permission: contracting an agent never implies running or publishing anything with it.
 *
 * Catalog membership grants nothing to any token, user, role, tenant or workspace (`defaultGrant: "none"`). The
 * enforcement requires BOTH an explicit tenant/workspace policy for the scope AND an explicit permission on the
 * acting person's active workspace membership.
 */
export const COMMERCIAL_AUTHORITY_SCOPES = {
  marketplaceSubscribe: "marketplace.subscribe",
} as const;

export type CommercialAuthorityScope =
  (typeof COMMERCIAL_AUTHORITY_SCOPES)[keyof typeof COMMERCIAL_AUTHORITY_SCOPES];

export type CommercialAuthorityScopeDefinition = Readonly<{
  scope: CommercialAuthorityScope;
  status: "adopted_pending_formal_ratification";
  layer: "commercial-authorization";
  description: string;
  routes: readonly string[];
  defaultGrant: "none";
  productDecisionBy: "Carlos Alberto Merlo";
  adoptedAt: "2026-10-12";
  formalRatification: "pending";
  /** Provisional reference; not a signed ratification record. */
  decisionRef: "AUTHZ-SCOPE-1/2026-10-12";
}>;

export const COMMERCIAL_AUTHORITY_SCOPE_CATALOG = [
  {
    scope: COMMERCIAL_AUTHORITY_SCOPES.marketplaceSubscribe,
    status: "adopted_pending_formal_ratification",
    layer: "commercial-authorization",
    description:
      "Authorizes a human identity to contract (subscribe to) a Marketplace agent for a tenant/workspace. Does not authorize executing or publishing anything with the agent.",
    routes: [
      "POST /api/marketplace/:id/subscribe",
      "POST /api/delegations (self-delegation of a Marketplace item)",
      "PATCH /api/delegations/:id (retargeting by the delegatee)",
    ],
    defaultGrant: "none",
    productDecisionBy: "Carlos Alberto Merlo",
    adoptedAt: "2026-10-12",
    formalRatification: "pending",
    decisionRef: "AUTHZ-SCOPE-1/2026-10-12",
  },
] as const satisfies readonly CommercialAuthorityScopeDefinition[];

export function isCommercialAuthorityScope(value: string): value is CommercialAuthorityScope {
  return Object.values(COMMERCIAL_AUTHORITY_SCOPES).some((scope) => scope === value);
}

/**
 * True when a name collides with any canonical scope. Marketplace item names become `TenantActionPolicy.actionName`
 * on subscription, so a reserved name would let a publisher mint a scope grant through a subscription.
 */
export function isReservedAuthorityScopeName(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  return (
    Object.values(ADMIN_SCOPES).some((scope) => scope === normalized) ||
    Object.values(COMMERCIAL_AUTHORITY_SCOPES).some((scope) => scope === normalized)
  );
}
