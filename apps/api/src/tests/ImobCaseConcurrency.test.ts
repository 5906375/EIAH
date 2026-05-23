import test from "node:test";
import assert from "node:assert/strict";

import { applyCaseStateUpdate } from "../services/imob/orchestrator/imobCaseStateRuntime";
import type { ImobCaseState } from "../services/imob/orchestrator/imobMissionTypes";

function createState(): ImobCaseState<"case_review"> {
  return {
    schemaVersion: 1,
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    caseId: "case-1",
    mission: "case_review",
    missionStatus: "in_progress",
    currentStep: "generating_snapshot",
    currentOperation: "case",
    entities: {},
    readiness: {},
    blockers: [],
    pendingFields: [],
    nextAction: {
      id: "next-review",
      label: "Gerar snapshot do caso",
      operation: "case",
      targetAgent: "IMOB_ContinuityAgent",
      reasonCode: "CASE_REVIEW_PENDING",
    },
    proof: {
      required: true,
      minimumProofSatisfied: false,
      missingProof: ["snapshot_authoritative"],
    },
    audit: {
      version: 3,
      lastUpdatedAt: "2026-05-23T10:00:00.000Z",
      updatedByAgent: "IMOB",
    },
  };
}

test("update with matching expectedVersion succeeds", () => {
  const result = applyCaseStateUpdate(createState(), {
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    caseId: "case-1",
    expectedVersion: 3,
    patch: { missionStatus: "ready_for_transition", currentStep: "snapshot_ready" },
    reasonCode: "CASE_REVIEW_SNAPSHOT_READY",
    updatedByAgent: "IMOB",
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.newVersion, 4);
    assert.equal(result.state.currentStep, "snapshot_ready");
  }
});

test("update with stale version fails with CASE_VERSION_CONFLICT", () => {
  const result = applyCaseStateUpdate(createState(), {
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    caseId: "case-1",
    expectedVersion: 2,
    patch: { missionStatus: "done" },
    reasonCode: "MISSION_DONE",
    updatedByAgent: "IMOB",
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reasonCode, "CASE_VERSION_CONFLICT");
    assert.equal(result.latestState?.audit.version, 3);
  }
});
