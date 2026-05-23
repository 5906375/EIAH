import test from "node:test";
import assert from "node:assert/strict";

import { evaluateProofGate } from "../services/imob/orchestrator/imobProofGate";
import type { ImobCaseState, ImobMissionPolicy } from "../services/imob/orchestrator/imobMissionTypes";

function createCaseReviewState(snapshotVersion: number): ImobCaseState<"case_review"> {
  return {
    schemaVersion: 1,
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    caseId: "case-1",
    mission: "case_review",
    missionStatus: "ready_for_transition",
    currentStep: "snapshot_ready",
    currentOperation: "case",
    entities: {},
    readiness: { proof: "ready" },
    blockers: [],
    pendingFields: [],
    nextAction: {
      id: "consult-case",
      label: "Consultar caso",
      operation: "case",
      targetAgent: "IMOB_ContinuityAgent",
      reasonCode: "CASE_REVIEW_SNAPSHOT_READY",
    },
    proof: {
      required: true,
      minimumProofSatisfied: true,
      missingProof: [],
      snapshotId: "snapshot-1",
      snapshotVersion,
    },
    audit: {
      version: 11,
      lastUpdatedAt: "2026-05-23T10:00:00.000Z",
      updatedByAgent: "IMOB",
    },
  };
}

test("case_review proof passes with authoritative snapshot version", () => {
  const state = createCaseReviewState(11);
  const policy: ImobMissionPolicy = {
    mission: "case_review",
    requiredEntities: [],
    requiredProof: ["snapshot_authoritative"],
    allowedOperations: ["case", "proof"],
    criticalActions: [],
    missionTier: "p0",
  };

  const result = evaluateProofGate("case_review", state, policy);
  assert.deepEqual(result, { ok: true, minimumProofSatisfied: true });
});

test("case_review proof fails with stale snapshot version", () => {
  const state = createCaseReviewState(10);
  const policy: ImobMissionPolicy = {
    mission: "case_review",
    requiredEntities: [],
    requiredProof: ["snapshot_authoritative"],
    allowedOperations: ["case", "proof"],
    criticalActions: [],
    missionTier: "p0",
  };

  const result = evaluateProofGate("case_review", state, policy);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reasonCode, "MISSING_REQUIRED_PROOF");
    assert.deepEqual(result.missingProof, ["snapshot_authoritative"]);
  }
});
