export const ReasonCatalog = [
  "approvals_not_available",
  "auth_context_missing",
  "cannot_delete_active",
  "cannot_delete_last",
  "delegation_forbidden",
  "delegation_invalid_status",
  "delegation_not_found",
  "identity_required_wallet",
  "invalid_decision",
  "invalid_payload",
  "membership_disabled",
  "membership_exists",
  "membership_inactive",
  "membership_invited",
  "membership_pending",
  "membership_rejected",
  "membership_suspended",
  "membership_transition_invalid",
  "not_found",
  "not_owner",
  "origin_missing",
  "origin_mismatch",
  "policy_denied",
  "policy_expired",
  "rbac_denied",
  "role_insufficient",
  "role_in_use",
  "role_name_exists",
  "role_not_found",
  "session_write_failed",
  "status_conflict",
  "trust_denied",
  "trust_insufficient",
  "unknown",
  "user_not_found",
  "workspace_out_of_tenant",
] as const;

export type ReasonCode = (typeof ReasonCatalog)[number];

export function isReason(value?: string | null): value is ReasonCode {
  if (!value) return false;
  return (ReasonCatalog as readonly string[]).includes(value);
}

export function assertReason(value?: string | null, fallback?: ReasonCode): ReasonCode {
  if (isReason(value)) return value;
  if (fallback) return fallback;
  throw new Error(`Unknown reason: ${value ?? "null"}`);
}

export function normalizeReason(
  value?: string | null,
  fallback: ReasonCode = "unknown"
): ReasonCode {
  return isReason(value) ? value : fallback;
}
