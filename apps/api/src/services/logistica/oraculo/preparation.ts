import {
  ORACULO_PREPARATION_FIELDS,
  oraculoEmptyReturnPreparationV1Schema,
  type OraculoPreparationFieldKey,
  type OraculoPreparationScope,
} from "@eiah/contracts";

export const ORACULO_EMPTY_RETURN_PREPARATION_CONTRACT = Object.freeze({
  id: "oraculo.empty-return-preparation.v1",
  owner: "Oráculo SC",
  fields: ORACULO_PREPARATION_FIELDS,
  fieldLabels: Object.freeze({ port: "Porto", depot: "Depósito", flow: "Fluxo pretendido" }),
  executionAllowed: false,
  authorizationState: "NOT_REQUESTED",
  externalTransmissionAllowed: false,
} as const);

/**
 * Pure domain assessment, following IMOB's collecting/review separation.
 * HTTP adapters must supply trustedScope from authenticated server context.
 * This function authenticates nobody, saves nothing and never builds an S1 intent.
 */
export function assessEmptyReturnPreparation(trustedScope: OraculoPreparationScope, input: unknown) {
  if (!trustedScope.tenantId?.trim() || !trustedScope.workspaceId?.trim()) {
    throw new Error("Authenticated preparation scope is required");
  }
  const draft = oraculoEmptyReturnPreparationV1Schema.parse(input);
  if (draft.tenantId !== trustedScope.tenantId || draft.workspaceId !== trustedScope.workspaceId) {
    throw new Error("Preparation does not belong to the authenticated scope");
  }

  const pendingFields: OraculoPreparationFieldKey[] = [];
  const reviewFields: OraculoPreparationFieldKey[] = [];
  for (const key of ORACULO_PREPARATION_FIELDS) {
    const field = draft.context[key];
    if (field.status === "not_informed" || field.status === "to_confirm") pendingFields.push(key);
    // A user's non-applicability claim requires review; it is not a policy exemption.
    if (field.status === "not_applicable") reviewFields.push(key);
  }
  const assessment = pendingFields.length
    ? "context_indeterminate"
    : reviewFields.length ? "context_review_required" : "context_described";

  return {
    draft,
    preparationAllowed: true as const,
    assessment,
    pendingFields,
    reviewFields,
    // All information being described is never regulatory readiness or authority.
    ...ORACULO_EMPTY_RETURN_PREPARATION_CONTRACT,
  };
}
