import assert from "node:assert/strict";
import test from "node:test";

import {
  PRE_DUIMP_ALLOWED_LIFECYCLE_TRANSITIONS_V1,
  PRE_DUIMP_CASE_LIFECYCLE_GATE_MISMATCH,
  PRE_DUIMP_CASE_TRANSITION_DENIED,
  validatePreDuimpLifecycleSnapshotV1,
  validatePreDuimpLifecycleTransitionV1,
  type PreDuimpGovernedCaseLifecycleV1,
} from "./preDuimpGovernedCaseLifecycle.js";

const lifecycles: PreDuimpGovernedCaseLifecycleV1[] = [
  "DISCOVERY",
  "ASSESSING",
  "AWAITING_REVIEW",
  "READY",
  "BLOCKED",
  "CLOSED",
];

test("lifecycle implements the complete approved fail-closed matrix", () => {
  for (const from of lifecycles) {
    for (const to of lifecycles) {
      const result = validatePreDuimpLifecycleTransitionV1(from, to);
      const expected = PRE_DUIMP_ALLOWED_LIFECYCLE_TRANSITIONS_V1[from].includes(to);
      assert.equal(result.ok, expected, from + " -> " + to);
      if (!result.ok) {
        assert.equal(result.reasonCode, PRE_DUIMP_CASE_TRANSITION_DENIED);
      }
    }
  }
});

test("CLOSED is terminal and lifecycle self-transitions are denied", () => {
  for (const lifecycle of lifecycles) {
    assert.equal(validatePreDuimpLifecycleTransitionV1(lifecycle, lifecycle).ok, false);
  }
  assert.deepEqual(PRE_DUIMP_ALLOWED_LIFECYCLE_TRANSITIONS_V1.CLOSED, []);
});

test("READY remains readiness-only and never becomes authorization", () => {
  const result = validatePreDuimpLifecycleSnapshotV1({
    lifecycle: "READY",
    gateDecision: {
      outcome: "READY",
      readinessOnly: true,
      authorizationState: "NOT_REQUESTED",
      externalTransmissionAllowed: false,
    },
    domainState: { externalTransmissionAllowed: false },
  } as never);
  assert.deepEqual(result, { ok: true });
});

test("READY, REVIEW and non-ready lifecycles fail closed on gate mismatch", () => {
  for (const [lifecycle, outcome] of [
    ["READY", "BLOCK"],
    ["AWAITING_REVIEW", "BLOCK"],
    ["ASSESSING", "READY"],
  ] as const) {
    const result = validatePreDuimpLifecycleSnapshotV1({
      lifecycle,
      gateDecision: {
        outcome,
        readinessOnly: true,
        authorizationState: "NOT_REQUESTED",
        externalTransmissionAllowed: false,
      },
      domainState: { externalTransmissionAllowed: false },
    } as never);
    assert.deepEqual(result, {
      ok: false,
      reasonCode: PRE_DUIMP_CASE_LIFECYCLE_GATE_MISMATCH,
    });
  }
});
