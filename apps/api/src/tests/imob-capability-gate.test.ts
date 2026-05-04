import test from "node:test";
import assert from "node:assert/strict";

import { resolveImobCapabilityGate } from "../services/imob/imobCapabilityGate";

test("sensitive outbound capability is blocked without consent, approval, evidence and policy", () => {
  const decision = resolveImobCapabilityGate({
    capabilityId: "outbound.owner_contact",
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.capability?.capabilityId, "outbound.owner_contact");
  assert.deepEqual(decision.reasonCodes, [
    "consent_required",
    "human_approval_required",
    "evidence_required",
    "policy_required",
  ]);
  assert.match(decision.blocked?.message ?? "", /consentimento obrigatório/i);
});

test("sensitive enrichment capability is allowed only when all gates are satisfied", () => {
  const decision = resolveImobCapabilityGate({
    capabilityId: "lead.enrichment_public",
    consentProvided: true,
    humanApprovalGranted: true,
    evidenceRefsCount: 2,
    policyAccepted: true,
  });

  assert.equal(decision.allowed, true);
  assert.equal(decision.reasonCodes.length, 0);
  assert.equal(decision.decisionTrail.every((item) => item.satisfied), true);
});

test("calendar capability blocks without approval and policy when evidence exists", () => {
  const decision = resolveImobCapabilityGate({
    capabilityId: "schedule.real_calendar",
    evidenceRefsCount: 1,
  });

  assert.equal(decision.allowed, false);
  assert.deepEqual(decision.reasonCodes, [
    "human_approval_required",
    "policy_required",
  ]);
});

test("listing publish capability blocks without evidence even with approval", () => {
  const decision = resolveImobCapabilityGate({
    capabilityId: "listing.ads_api_publish",
    humanApprovalGranted: true,
    policyAccepted: true,
  });

  assert.equal(decision.allowed, false);
  assert.deepEqual(decision.reasonCodes, ["evidence_required"]);
});

test("non-sensitive consultive capability does not block when gates are not required beyond evidence", () => {
  const decision = resolveImobCapabilityGate({
    capabilityId: "inventory.active_watch",
    evidenceRefsCount: 1,
  });

  assert.equal(decision.allowed, true);
  assert.equal(decision.capability?.capabilityId, "inventory.active_watch");
});

test("unknown capability returns explicit blocked result", () => {
  const decision = resolveImobCapabilityGate({
    capabilityId: "unknown.capability",
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.capability, null);
  assert.deepEqual(decision.reasonCodes, ["capability_not_found"]);
  assert.equal(decision.blocked?.code, "IMOB_CAPABILITY_GATED");
});
