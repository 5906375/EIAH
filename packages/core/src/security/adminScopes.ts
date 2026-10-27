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
 * enforcement requires an ACTIVE workspace membership AND an explicit, unrevoked, unexpired designation of that person
 * (see `apps/api/src/services/commercialAuthority.ts`). Roles, member permissions, invitations, Founder, `actions.admin`
 * and `products.activate` never produce it. Granting it requires a distinct `grantor` designation.
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
      "POST /api/commercial-authority/designations",
      "POST /api/commercial-authority/designations/:id/revoke",
      "POST /api/commercial-authority/enablements/:id/revoke",
      "POST /api/actions/override (policy of an agent)",
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
 * Financial authority scopes (AUTHZ-FIN-1). PROPOSED technical contract (EIAH-GOV-BILLING-002/003): it is NOT ratified, so this
 * catalog deliberately does not claim `status: "ratified"` nor a ratification date, and `decisionRef` is only a provisional
 * label. See docs/ops/billing-financial-authority-spec.md.
 *
 * Authority lives in an explicit, per-tenant DESIGNATION (`financial_authority_designation`), never in a role, a membership
 * permission, `products.activate`, `actions.admin`, Founder, a platform-admin e-mail or `ADMIN_API_TOKEN`. Catalog
 * membership grants nothing to any token, user, role, tenant or workspace (`defaultGrant: "none"`).
 */
export const FINANCIAL_AUTHORITY_SCOPES = {
  limitsManage: "billing.limits.manage",
  ledgerAdjust: "billing.ledger.adjust",
} as const;

export type FinancialAuthorityScope =
  (typeof FINANCIAL_AUTHORITY_SCOPES)[keyof typeof FINANCIAL_AUTHORITY_SCOPES];

export type FinancialAuthorityScopeDefinition = Readonly<{
  scope: FinancialAuthorityScope;
  status: "proposed_pending_ratification";
  layer: "financial-authorization";
  description: string;
  routes: readonly string[];
  defaultGrant: "none";
  formalRatification: "pending";
  /** Provisional reference; not a ratification record. */
  decisionRef: "AUTHZ-FIN-1/proposta";
}>;

export const FINANCIAL_AUTHORITY_SCOPE_CATALOG = [
  {
    scope: FINANCIAL_AUTHORITY_SCOPES.limitsManage,
    status: "proposed_pending_ratification",
    layer: "financial-authorization",
    description:
      "Authorizes a designated person to change the tenant quota policy and the workspace quota grants. Does not authorize ledger adjustments.",
    routes: [
      "PATCH /api/billing/tenant/quotas",
      "PATCH /api/billing/tenant/workspaces/:id/grant",
    ],
    defaultGrant: "none",
    formalRatification: "pending",
    decisionRef: "AUTHZ-FIN-1/proposta",
  },
  {
    scope: FINANCIAL_AUTHORITY_SCOPES.ledgerAdjust,
    status: "proposed_pending_ratification",
    layer: "financial-authorization",
    description:
      "Authorizes a designated person, within a mandatory per-entry ceiling, to take part in a ledger adjustment. The adjustment route stays denied until the two-person approval mechanism is ratified.",
    routes: ["POST /api/billing/tenant/adjustment"],
    defaultGrant: "none",
    formalRatification: "pending",
    decisionRef: "AUTHZ-FIN-1/proposta",
  },
] as const satisfies readonly FinancialAuthorityScopeDefinition[];

export function isFinancialAuthorityScope(value: string): value is FinancialAuthorityScope {
  return Object.values(FINANCIAL_AUTHORITY_SCOPES).some((scope) => scope === value);
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
    Object.values(COMMERCIAL_AUTHORITY_SCOPES).some((scope) => scope === normalized) ||
    Object.values(FINANCIAL_AUTHORITY_SCOPES).some((scope) => scope === normalized)
  );
}
