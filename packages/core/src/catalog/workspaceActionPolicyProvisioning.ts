/**
 * Workspace Action Policy Provisioning Catalog — ADR-010, PR A2.
 *
 * Declares the default Agent Protocol action policies granted to a workspace
 * when a product/vertical is activated. Approved by Carlos Alberto Merlo on
 * 2026-10-01: for IMOB, only the registration ("cadastro") set.
 *
 * Mapping from IMOB dispatcher actions to protocol actions
 * (apps/api/src/services/imob/crm/imobPendingActionRuntime.ts):
 *   owner.register, property.create -> realestate.register_property
 *   lead.qualify                    -> realestate.qualify_lead
 *   documents.collect               -> realestate.collect_documents
 *     (documents.review shares this protocol action)
 *   imob.contract.intake            -> no protocol action (separate intake flow)
 *
 * Every other protocol action stays blocked until an explicit decision grants it.
 * This module declares data only; it does not authorize execution by itself.
 */

export const WORKSPACE_ACTION_POLICY_PROVISIONING_VERSION = 1;

export type ActionPolicyProvisionableProduct = "IMOB";

const PRODUCT_DEFAULT_ACTION_POLICIES: Readonly<Record<ActionPolicyProvisionableProduct, readonly string[]>> =
  Object.freeze({
    IMOB: Object.freeze([
      "realestate.register_property",
      "realestate.qualify_lead",
      "realestate.collect_documents",
    ]),
  });

/**
 * Protocol actions deliberately excluded from automatic provisioning. Kept
 * explicit so tests can prove they are never granted by activation.
 */
export const EXCLUDED_DEFAULT_ACTION_POLICIES: readonly string[] = Object.freeze([
  "realestate.activate_listing",
  "realestate.schedule_visit",
  "realestate.create_contract",
  "realestate.review_deal",
  "realestate.release_commission",
  "realestate.apply_adjustment",
]);

export function getProductDefaultActionPolicies(product: string): readonly string[] {
  const key = typeof product === "string" ? product.trim().toUpperCase() : "";
  if (!key || !Object.prototype.hasOwnProperty.call(PRODUCT_DEFAULT_ACTION_POLICIES, key)) {
    throw new Error(`workspace_action_policy_provisioning: product without approved action policy set: ${String(product)}`);
  }
  return PRODUCT_DEFAULT_ACTION_POLICIES[key as ActionPolicyProvisionableProduct];
}
