import {
  resolveOperationalEntitlementStatus,
  verticalAccessContractV1Schema,
  verticalAccessFactsV1Schema,
  verticalAccessRequestV1Schema,
} from "../../types/verticalEntitlementGateContract";

export type VerticalAccessReasonCode =
  | "VERTICAL_ACCESS_ALLOWED"
  | "VERTICAL_ACCESS_INVALID_INPUT"
  | "VERTICAL_ACCESS_UNKNOWN_VERTICAL"
  | "VERTICAL_ACCESS_SCOPE_MISMATCH"
  | "VERTICAL_ACCESS_CAPABILITY_DENIED"
  | "VERTICAL_ACCESS_INSTALLATION_MISSING"
  | "VERTICAL_ACCESS_INSTALLATION_INACTIVE"
  | "VERTICAL_ACCESS_PERMISSION_DENIED"
  | "VERTICAL_ACCESS_REVOKED"
  | "VERTICAL_ACCESS_STAGE_DENIED";

export type VerticalAccessDecisionV1 = {
  version: "vertical.access.decision.v1";
  allowed: boolean;
  reasonCode: VerticalAccessReasonCode;
  /** Every allow still needs independent Agent Protocol policy/RBAC/HITL gates. */
  actionAuthorization: "not_evaluated";
};

/** Pure, fail-closed evaluator over explicit contracts and server-read facts.
 * No DB, reads, writes, environment, clock, provisioning or policy fallback.
 * Installation/usage restrictions apply to capability access; historical evidence
 * retains its separate legacy read_history gate.
 */
export function resolveVerticalAccess(
  rawContracts: unknown,
  rawRequest: unknown,
  rawFacts: unknown,
): VerticalAccessDecisionV1 {
  const decision = (reasonCode: VerticalAccessReasonCode): VerticalAccessDecisionV1 => ({
    version: "vertical.access.decision.v1",
    allowed: reasonCode === "VERTICAL_ACCESS_ALLOWED",
    reasonCode,
    actionAuthorization: "not_evaluated",
  });
  const contracts = verticalAccessContractV1Schema.array().safeParse(rawContracts);
  const request = verticalAccessRequestV1Schema.safeParse(rawRequest);
  const facts = verticalAccessFactsV1Schema.safeParse(rawFacts);
  if (!contracts.success || !request.success || !facts.success) return decision("VERTICAL_ACCESS_INVALID_INPUT");
  if (new Set(contracts.data.map((entry) => entry.verticalId)).size !== contracts.data.length) {
    return decision("VERTICAL_ACCESS_INVALID_INPUT");
  }
  const contract = contracts.data.find((entry) => entry.verticalId === request.data.verticalId);
  if (!contract) return decision("VERTICAL_ACCESS_UNKNOWN_VERTICAL");
  const input = request.data;
  const state = facts.data;
  if (state.verticalId !== contract.verticalId || state.scope.tenantId !== input.scope.tenantId ||
      state.scope.workspaceId !== input.scope.workspaceId) return decision("VERTICAL_ACCESS_SCOPE_MISMATCH");
  const capability = contract.capabilities.find((entry) => entry.id === input.capabilityId);
  if (!capability || !capability.allowedModes.includes(input.mode)) return decision("VERTICAL_ACCESS_CAPABILITY_DENIED");
  if (contract.installationRequired) {
    if (!state.installation) return decision("VERTICAL_ACCESS_INSTALLATION_MISSING");
    if (state.installation.tenantId !== input.scope.tenantId || state.installation.workspaceId !== input.scope.workspaceId ||
        state.installation.product !== contract.productId) return decision("VERTICAL_ACCESS_SCOPE_MISMATCH");
    if (resolveOperationalEntitlementStatus({ installation: state.installation }) !== "active") {
      return decision("VERTICAL_ACCESS_INSTALLATION_INACTIVE");
    }
  }
  if (state.workspacePermission.key !== contract.workspacePermission || state.workspacePermission.allowed !== true) {
    return decision("VERTICAL_ACCESS_PERMISSION_DENIED");
  }
  if (state.usage === "blocked" || (state.usage === "read_only" && input.mode !== "read_only")) {
    return decision("VERTICAL_ACCESS_REVOKED");
  }
  if (contract.stagePolicy === "required" && (!input.stage || state.stagePermission?.stage !== input.stage ||
      state.stagePermission.allowed !== true)) return decision("VERTICAL_ACCESS_STAGE_DENIED");
  return decision("VERTICAL_ACCESS_ALLOWED");
}
