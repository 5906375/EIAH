import test from "node:test";
import assert from "node:assert/strict";

import type { ImobCaseContextV1 } from "../services/imob/crm/imobCaseContextContract";
import { resolveImobMissionStatus } from "../services/imob/orchestrator/imobCompletionEvaluator";

function buildContext(overrides: Partial<ImobCaseContextV1> = {}): ImobCaseContextV1 {
  return {
    version: "1.0",
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    caseId: "case-1",
    missionContext: {
      mission: "case_review",
      lockedUntilExplicitChange: false,
    },
    entities: {},
    links: {
      ownerProperty: { status: "pending_confirmation" },
    },
    readiness: {
      ownerReady: false,
      propertyReady: false,
      documentsReady: false,
      seasonalRulesReady: false,
      operationalReady: false,
    },
    blockers: [],
    ...overrides,
  };
}

test("completion evaluator marks case review snapshot as ready_for_transition", () => {
  const status = resolveImobMissionStatus({
    mission: "case_review",
    context: buildContext(),
    currentStep: "snapshot_ready",
    pendingFields: [],
    hasNextAction: true,
  });

  assert.equal(status, "ready_for_transition");
});

test("completion evaluator marks blocked cases fail-closed", () => {
  const status = resolveImobMissionStatus({
    mission: "capture_seasonal_property",
    context: buildContext({
      blockers: [
        { code: "owner_missing_or_incomplete", severity: "blocking", message: "Owner missing." },
      ],
    }),
    currentStep: "collecting_owner",
    pendingFields: ["ownerDocument"],
    hasNextAction: true,
  });

  assert.equal(status, "blocked");
});

test("completion evaluator promotes qualified lead mission to ready_for_transition", () => {
  const status = resolveImobMissionStatus({
    mission: "qualify_and_match_lead",
    context: buildContext({
      missionContext: {
        mission: "qualify_lead",
        lockedUntilExplicitChange: false,
      },
      entities: {
        lead: { id: "lead-1", name: "Maria" },
      },
    }),
    currentStep: "matching_inventory",
    pendingFields: [],
    hasNextAction: true,
  });

  assert.equal(status, "ready_for_transition");
});
