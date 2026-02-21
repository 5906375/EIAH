import { describe, expect, it } from "vitest";
import { canSetMembershipStatus, canTransitionMembership } from "../services/membershipTransitions";

describe("membership transitions", () => {
  it("approves invited/pending to active", () => {
    expect(canTransitionMembership("INVITED", "approve")).toEqual({
      ok: true,
      next: "ACTIVE",
    });
    expect(canTransitionMembership("PENDING", "approve")).toEqual({
      ok: true,
      next: "ACTIVE",
    });
  });

  it("rejects invited/pending to rejected", () => {
    expect(canTransitionMembership("INVITED", "reject")).toEqual({
      ok: true,
      next: "REJECTED",
    });
  });

  it("suspends active only", () => {
    expect(canTransitionMembership("ACTIVE", "suspend")).toEqual({
      ok: true,
      next: "SUSPENDED",
    });
    expect(canTransitionMembership("PENDING", "suspend")).toEqual({
      ok: false,
      reason: "membership_transition_invalid",
    });
  });

  it("activates suspended or disabled", () => {
    expect(canTransitionMembership("SUSPENDED", "activate")).toEqual({
      ok: true,
      next: "ACTIVE",
    });
    expect(canTransitionMembership("DISABLED", "activate")).toEqual({
      ok: true,
      next: "ACTIVE",
    });
  });

  it("validates direct status changes", () => {
    expect(canSetMembershipStatus("ACTIVE", "SUSPENDED")).toEqual({
      ok: true,
      next: "SUSPENDED",
    });
    expect(canSetMembershipStatus("ACTIVE", "DISABLED")).toEqual({
      ok: true,
      next: "DISABLED",
    });
    expect(canSetMembershipStatus("PENDING", "ACTIVE")).toEqual({
      ok: true,
      next: "ACTIVE",
    });
    expect(canSetMembershipStatus("ACTIVE", "REJECTED")).toEqual({
      ok: false,
      reason: "membership_transition_invalid",
    });
  });
});
