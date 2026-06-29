type RunApprovalStatus = "not_required" | "pending" | "approved" | "rejected";

export type ImobApprovalPolicyCriticality = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type ImobApprovalGateReasonCode =
  | "APPROVAL_GRANTED"
  | "APPROVAL_REQUIRED"
  | "APPROVAL_EXPIRED"
  | "APPROVAL_INVALID"
  | "APPROVAL_SCOPE_MISMATCH";

export type ImobApprovalGateInput = {
  tenantId: string;
  workspaceId: string;
  runId: string;
  actorId?: string | null;
  actionType: string;
  policyCriticality: ImobApprovalPolicyCriticality;
  approvalId?: string | null;
  approvalStatus?: RunApprovalStatus | null;
  approvedBy?: string | null;
  approvedAt?: Date | string | null;
  approvalExpiresAt?: Date | string | null;
  approvalScopeTenantId?: string | null;
  approvalScopeWorkspaceId?: string | null;
  now?: Date;
};

export type ImobApprovalGateDecision = {
  allowed: boolean;
  reasonCode: ImobApprovalGateReasonCode;
  approvalId: string | null;
};

function requiresApproval(policyCriticality: ImobApprovalPolicyCriticality) {
  return policyCriticality === "HIGH" || policyCriticality === "CRITICAL";
}

function parseDate(input: Date | string | null | undefined) {
  if (!input) return null;
  const value = input instanceof Date ? input : new Date(input);
  return Number.isNaN(value.getTime()) ? null : value;
}

export function resolveImobApprovalGate(
  input: ImobApprovalGateInput,
): ImobApprovalGateDecision {
  if (!requiresApproval(input.policyCriticality)) {
    return {
      allowed: true,
      reasonCode: "APPROVAL_GRANTED",
      approvalId: input.approvalId ?? null,
    };
  }

  if (
    (input.approvalScopeTenantId && input.approvalScopeTenantId !== input.tenantId) ||
    (input.approvalScopeWorkspaceId && input.approvalScopeWorkspaceId !== input.workspaceId)
  ) {
    return {
      allowed: false,
      reasonCode: "APPROVAL_SCOPE_MISMATCH",
      approvalId: input.approvalId ?? null,
    };
  }

  if (input.approvalStatus !== "approved") {
    return {
      allowed: false,
      reasonCode: input.approvalStatus === "rejected" ? "APPROVAL_INVALID" : "APPROVAL_REQUIRED",
      approvalId: input.approvalId ?? null,
    };
  }

  const approvedAt = parseDate(input.approvedAt);
  if (!approvedAt || !input.approvedBy?.trim()) {
    return {
      allowed: false,
      reasonCode: "APPROVAL_INVALID",
      approvalId: input.approvalId ?? null,
    };
  }

  const approvalExpiresAt = parseDate(input.approvalExpiresAt);
  if (input.approvalExpiresAt && !approvalExpiresAt) {
    return {
      allowed: false,
      reasonCode: "APPROVAL_INVALID",
      approvalId: input.approvalId ?? null,
    };
  }

  const now = input.now ?? new Date();
  if (approvalExpiresAt && approvalExpiresAt.getTime() < now.getTime()) {
    return {
      allowed: false,
      reasonCode: "APPROVAL_EXPIRED",
      approvalId: input.approvalId ?? null,
    };
  }

  return {
    allowed: true,
    reasonCode: "APPROVAL_GRANTED",
    approvalId: input.approvalId ?? null,
  };
}
