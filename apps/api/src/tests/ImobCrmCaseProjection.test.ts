import test from "node:test";
import assert from "node:assert/strict";

import type { ImobCaseContextV1 } from "../services/imob/crm/imobCaseContextContract";
import { buildImobCrmCaseProjection } from "../services/imob/orchestrator/imobCrmCaseProjection";

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

test("IMOB CRM case projection derives case card, target agent and queues from canonical state", () => {
  const projection = buildImobCrmCaseProjection(buildContext({
    legacyCompatibility: {
      migratedFromLegacy: true,
      sourceFlow: "owner.dedupe_review",
      sourceMission: "case_review",
    },
    canonicalCaseState: {
      schemaVersion: 1,
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      caseId: "case-1",
      mission: "case_review",
      missionStatus: "blocked",
      currentStep: "generating_snapshot",
      currentOperation: "owner",
      entities: {},
      readiness: {
        owner: "blocked",
        proof: "blocked",
      },
      blockers: [{ code: "dedupe_pending", message: "Revisão de dedupe pendente." }],
      pendingFields: [],
      nextAction: {
        id: "dedupe-review",
        label: "Revisar dedupe",
        operation: "owner",
        targetAgent: "IMOB_DedupeAgent",
        reasonCode: "DEDUPE_REVIEW_PENDING",
      },
      proof: {
        required: true,
        minimumProofSatisfied: false,
        missingProof: ["evidence_bundle"],
      },
      audit: {
        version: 3,
        lastUpdatedAt: "2026-05-23T12:00:00.000Z",
        updatedByAgent: "IMOB",
      },
    },
  }));

  assert.equal(projection.caseCard.ownerAgent, "IMOB_Orchestrator");
  assert.equal(projection.caseCard.targetAgent, "IMOB_DedupeAgent");
  assert.equal(projection.caseCard.proofStatus, "missing");
  assert.equal(projection.queues.some((item) => item.queueId === "dedupe_queue"), true);
  assert.equal(projection.queues.some((item) => item.queueId === "proof_queue"), true);
  assert.equal(projection.queues.some((item) => item.queueId === "blocker_queue"), true);
});
