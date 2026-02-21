import { type ReasonCode } from "@eiah/core";
import type { MembershipStatus } from "./tenantGovernance";

export function resolveMembershipReason(status?: MembershipStatus | null): ReasonCode {
  switch (status) {
    case "INVITED":
      return "membership_invited";
    case "PENDING":
      return "membership_pending";
    case "SUSPENDED":
      return "membership_suspended";
    case "REJECTED":
      return "membership_rejected";
    case "DISABLED":
      return "membership_disabled";
    case "ACTIVE":
      return "membership_inactive";
    default:
      return "membership_inactive";
  }
}
