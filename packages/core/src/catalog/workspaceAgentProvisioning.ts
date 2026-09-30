/**
 * Workspace Agent Provisioning Catalog — ADR-010, PR A.
 *
 * Declares which workspace agent assignments must exist when a workspace is
 * created (front door) and when a product/vertical is activated. It is the
 * single source for that mapping.
 *
 * This module declares data only. It does not authorize execution:
 * `assertWorkspaceAgentEnabled` remains the fail-closed gate for every run.
 * Products without an explicit, approved entry here are rejected (fail-closed)
 * instead of receiving a generic assignment.
 */

export const WORKSPACE_AGENT_PROVISIONING_VERSION = 1;

export type ProvisionedAgentCatalogMetadata = {
  readonly displayName: string;
  readonly category: string;
  readonly version: string;
};

export type ProvisionedAgent = {
  readonly agentKey: string;
  /**
   * Catalog metadata ensured (create-only) for agents without a core profile,
   * so the assignment gate can resolve their version. Never overwrites an
   * existing catalog entry.
   */
  readonly catalogMetadata?: ProvisionedAgentCatalogMetadata;
};

export type ProvisionableProduct = "IMOB";

/** Agents every workspace receives at creation: the EIAH front door. */
export const FRONT_DOOR_AGENTS: readonly ProvisionedAgent[] = Object.freeze([
  Object.freeze({ agentKey: "EIAH" }),
]);

const PRODUCT_AGENTS: Readonly<Record<ProvisionableProduct, readonly ProvisionedAgent[]>> = Object.freeze({
  // IMOB dispatcher actions run under EIAH; chat/CRM audit runs under imob-chat-audit.
  IMOB: Object.freeze([
    Object.freeze({ agentKey: "EIAH" }),
    Object.freeze({
      agentKey: "imob-chat-audit",
      catalogMetadata: Object.freeze({
        displayName: "IMOB Chat Audit",
        category: "audit",
        version: "1.0.0",
      }),
    }),
  ]),
});

export function listProvisionableProducts(): ProvisionableProduct[] {
  return Object.keys(PRODUCT_AGENTS) as ProvisionableProduct[];
}

export function getProductProvisionedAgents(product: string): readonly ProvisionedAgent[] {
  const key = typeof product === "string" ? product.trim().toUpperCase() : "";
  if (!key || !Object.prototype.hasOwnProperty.call(PRODUCT_AGENTS, key)) {
    throw new Error(`workspace_agent_provisioning: product without approved agent map: ${String(product)}`);
  }
  return PRODUCT_AGENTS[key as ProvisionableProduct];
}
