import test from "node:test";
import assert from "node:assert/strict";

import { buildImobCaseContextV1 } from "../services/imob/crm/imobCaseContextBuilder";
import { resolveImobMissionStatus } from "../services/imob/orchestrator/imobCompletionEvaluator";

test("mission status is blocked instead of done when operationally ready but required proof is missing", () => {
  const status = resolveImobMissionStatus({
    mission: "case_review",
    context: {
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
        ownerReady: true,
        propertyReady: true,
        documentsReady: true,
        seasonalRulesReady: true,
        operationalReady: true,
      },
      blockers: [],
    },
    currentStep: "snapshot_ready",
    pendingFields: [],
    hasNextAction: true,
    proofRequired: true,
    proofSatisfied: false,
  });

  assert.equal(status, "blocked");
});

test("case review remains blocked until authoritative snapshot proof exists", () => {
  const context = buildImobCaseContextV1({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    caseId: "case-2",
    caseContext: {
      caseId: "case-2",
      flow: "case.review",
    },
    operational: {
      flow: "case.review",
      pendingFields: [],
    },
  });

  assert.equal(context.canonicalCaseState?.mission, "case_review");
  assert.equal(context.canonicalCaseState?.proof.required, true);
  assert.equal(context.canonicalCaseState?.proof.minimumProofSatisfied, false);
  assert.equal(context.canonicalCaseState?.readiness.proof, "blocked");
});
