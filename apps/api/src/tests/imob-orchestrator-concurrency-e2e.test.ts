import test from "node:test";
import assert from "node:assert/strict";

import { buildImobCaseContextV1 } from "../services/imob/crm/imobCaseContextBuilder";
import { applyCaseStateUpdate } from "../services/imob/orchestrator/imobCaseStateRuntime";
import { reserveSideEffectCommand } from "../services/imob/orchestrator/imobSideEffectDispatchGuard";

test("concurrency E2E accepts the first case update and rejects a stale follow-up command", () => {
  const context = buildImobCaseContextV1({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    caseId: "case-1",
    operational: {
      missionContext: {
        mission: "case_review",
      },
    },
  });

  const current = context.canonicalCaseState;
  assert.ok(current);

  const first = applyCaseStateUpdate(current, {
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    caseId: "case-1",
    expectedVersion: 1,
    patch: {
      currentStep: "snapshot_ready",
      missionStatus: "ready_for_transition",
    },
    reasonCode: "CASE_REVIEW_SNAPSHOT_READY",
    updatedByAgent: "IMOB_Orchestrator",
  });

  assert.equal(first.ok, true);
  if (!first.ok) return;

  const stale = applyCaseStateUpdate(first.state, {
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    caseId: "case-1",
    expectedVersion: 1,
    patch: {
      missionStatus: "done",
    },
    reasonCode: "MISSION_DONE",
    updatedByAgent: "IMOB_Orchestrator",
  });

  assert.equal(stale.ok, false);
  if (!stale.ok) {
    assert.equal(stale.reasonCode, "CASE_VERSION_CONFLICT");
    assert.equal(stale.latestState?.audit.version, 2);
  }
});

test("idempotency E2E blocks a duplicate side effect reservation for the same visit command", () => {
  const first = reserveSideEffectCommand({
    operationHasOwner: true,
    existingIdempotencyKeys: new Set<string>(),
    command: {
      commandId: "cmd-visit-1",
      idempotencyKey: "visit:case-1:slot-a",
      operation: "visit",
      caseId: "case-1",
      mission: "schedule_and_follow_visit",
      step: "confirming_participants",
      targetAgent: "IMOB_VisitAgent",
    },
  });

  assert.equal(first.ok, true);

  const duplicate = reserveSideEffectCommand({
    operationHasOwner: true,
    existingIdempotencyKeys: new Set<string>(["visit:case-1:slot-a"]),
    command: {
      commandId: "cmd-visit-2",
      idempotencyKey: "visit:case-1:slot-a",
      operation: "visit",
      caseId: "case-1",
      mission: "schedule_and_follow_visit",
      step: "confirming_participants",
      targetAgent: "IMOB_VisitAgent",
    },
  });

  assert.equal(duplicate.ok, false);
  if (!duplicate.ok) {
    assert.equal(duplicate.reasonCode, "DUPLICATE_SIDE_EFFECT_BLOCKED");
  }
});

