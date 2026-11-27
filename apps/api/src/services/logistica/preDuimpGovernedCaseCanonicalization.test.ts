import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalizeGovernedJsonV1,
  computePreDuimpGovernedCaseSnapshotHash,
  PreDuimpCanonicalizationError,
} from "./preDuimpGovernedCaseCanonicalization.js";

const HASH = "sha256:" + "a".repeat(64);
const NOW = "2026-09-10T12:00:00.000Z";

function snapshot() {
  return {
    schemaVersion: "governed-case.v1",
    caseId: "case-1",
    caseType: "log.pre_duimp",
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    revision: 1,
    lifecycle: "DISCOVERY",
    subject: {
      referenceType: "INTERNAL_CASE_REFERENCE",
      referenceId: "reference-1",
    },
    facts: [],
    inconsistencies: [],
    regulatoryEvaluations: [],
    corporatePolicyEvaluations: [],
    riskAssessment: {
      schemaVersion: "risk-assessment.v1",
      assessmentId: "risk-1",
      methodVersion: "risk.v1",
      inputHash: HASH,
      level: "UNKNOWN",
      factors: [],
      evaluatedAt: NOW,
    },
    humanAuthorityDecisions: [],
    domainState: {
      operationMode: "READ_ONLY_DISCOVERY",
      preparationStage: "SOURCE_COLLECTION",
      sourceSnapshotIds: [],
      externalTransmissionAllowed: false,
    },
    gateDecision: {
      schemaVersion: "log.pre_duimp.gate-decision.v1",
      gateDecisionId: "gate-1",
      caseId: "case-1",
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      outcome: "BLOCK",
      reasonCodes: ["PRE_DUIMP_SOURCE_UNAVAILABLE"],
      inputHash: HASH,
      evaluatorVersion: "pre-duimp-gate.v1",
      inconsistencyIds: [],
      regulatoryEvaluationIds: [],
      corporatePolicyEvaluationIds: [],
      riskAssessmentId: "risk-1",
      humanAuthorityDecisionIds: [],
      readinessOnly: true,
      authorizationState: "NOT_REQUESTED",
      externalTransmissionAllowed: false,
      evaluatedAt: NOW,
    },
    runRefs: [],
    receiptRefs: [],
    evidenceRefs: [],
    eventRefs: [],
    createdAt: NOW,
    updatedAt: NOW,
  };
}

test("canonical JSON sorts object keys recursively", () => {
  const left = { z: [{ b: 2, a: 1 }], a: { d: false, c: null } };
  const right = { a: { c: null, d: false }, z: [{ a: 1, b: 2 }] };
  assert.equal(canonicalizeGovernedJsonV1(left), canonicalizeGovernedJsonV1(right));
});

test("canonical JSON preserves normative array order", () => {
  assert.notEqual(
    canonicalizeGovernedJsonV1({ values: [1, 2] }),
    canonicalizeGovernedJsonV1({ values: [2, 1] }),
  );
});

for (const invalid of [undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
  test("canonical JSON rejects non-JSON value " + String(invalid), () => {
    assert.throws(
      () => canonicalizeGovernedJsonV1({ invalid }),
      PreDuimpCanonicalizationError,
    );
  });
}

test("snapshot hash is deterministic, lowercase and contract-shaped", () => {
  const first = snapshot();
  const second = {
    ...snapshot(),
    subject: { referenceId: "reference-1", referenceType: "INTERNAL_CASE_REFERENCE" },
  };
  const firstHash = computePreDuimpGovernedCaseSnapshotHash(first);
  const secondHash = computePreDuimpGovernedCaseSnapshotHash(second);
  assert.equal(firstHash, secondHash);
  assert.match(firstHash, /^sha256:[a-f0-9]{64}$/);
});

test("snapshot hashing rejects a snapshot outside PreDuimpCaseV1", () => {
  assert.throws(
    () => computePreDuimpGovernedCaseSnapshotHash({ ...snapshot(), submit: true }),
    PreDuimpCanonicalizationError,
  );
});
