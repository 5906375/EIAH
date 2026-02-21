import type { MembershipStatus } from "./tenantGovernance";

export type MembershipAction = "approve" | "reject" | "suspend" | "activate";

type TransitionResult =
  | { ok: true; next: MembershipStatus }
  | { ok: false; reason: "membership_transition_invalid" };

const transitions: Record<MembershipAction, MembershipStatus[]> = {
  approve: ["INVITED", "PENDING"],
  reject: ["INVITED", "PENDING"],
  suspend: ["ACTIVE"],
  activate: ["SUSPENDED", "DISABLED"],
};

export function canTransitionMembership(
  current: MembershipStatus,
  action: MembershipAction
): TransitionResult {
  const allowed = transitions[action] ?? [];
  if (!allowed.includes(current)) {
    return { ok: false, reason: "membership_transition_invalid" };
  }

  if (action === "approve" || action === "activate") {
    return { ok: true, next: "ACTIVE" };
  }
  if (action === "reject") {
    return { ok: true, next: "REJECTED" };
  }
  return { ok: true, next: "SUSPENDED" };
}

export function canSetMembershipStatus(
  current: MembershipStatus,
  next: MembershipStatus
): TransitionResult {
  if (current === next) {
    return { ok: true, next };
  }

  if (next === "ACTIVE") {
    if (current === "SUSPENDED" || current === "DISABLED") {
      return { ok: true, next: "ACTIVE" };
    }
    if (current === "INVITED" || current === "PENDING") {
      return { ok: true, next: "ACTIVE" };
    }
  }

  if (next === "SUSPENDED" || next === "DISABLED") {
    if (current === "ACTIVE") {
      return { ok: true, next };
    }
  }

  if (next === "REJECTED") {
    if (current === "INVITED" || current === "PENDING") {
      return { ok: true, next: "REJECTED" };
    }
  }

  return { ok: false, reason: "membership_transition_invalid" };
}
