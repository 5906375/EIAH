import test from "node:test";
import assert from "node:assert/strict";

import { buildImobCrmCommandCenterMetrics } from "../services/imob/orchestrator/imobCrmCommandCenterMetrics";
import type { ImobCrmCaseProjectionV1 } from "../services/imob/crm/imobCaseContextContract";

function projection(overrides: Partial<ImobCrmCaseProjectionV1> = {}): ImobCrmCaseProjectionV1 {
  return {
    version: "1.0",
    derivedFrom: "canonical_case_state",
    caseCard: {
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      caseId: "case-1",
      mission: "case_review",
      missionStatus: "blocked",
      currentOperation: "case",
      ownerAgent: "IMOB_Orchestrator",
      targetAgent: "IMOB_ContinuityAgent",
      readiness: {},
      blockers: [{ code: "blocked", message: "Bloqueado." }],
      nextAction: null,
      proofStatus: "missing",
      lastActivityAt: "2026-05-23T10:00:00.000Z",
    },
    queues: [
      {
        queueId: "proof_queue",
        caseId: "case-1",
        reasonCode: "MISSING_REQUIRED_PROOF",
        summary: "Proof pendente.",
      },
      {
        queueId: "next_action_queue",
        caseId: "case-1",
        reasonCode: "NEXT_ACTION_UNRESOLVED",
        summary: "Sem próxima ação.",
      },
      {
        queueId: "blocker_queue",
        caseId: "case-1",
        reasonCode: "blocked",
        summary: "Bloqueado.",
      },
    ],
    ...overrides,
  };
}

test("IMOB CRM command center metrics aggregate queue depth and target agent load", () => {
  const metrics = buildImobCrmCommandCenterMetrics([
    projection(),
    projection({
      caseCard: {
        ...projection().caseCard,
        caseId: "case-2",
        missionStatus: "in_progress",
        targetAgent: "IMOB_LeadAgent",
        nextAction: {
          id: "lead-next",
          label: "Retomar lead",
          operation: "lead",
          targetAgent: "IMOB_LeadAgent",
          reasonCode: "LEAD_MISSING_REQUIRED_FIELD",
        },
        proofStatus: "not_required",
      },
      queues: [],
    }),
  ]);

  assert.equal(metrics.totalCases, 2);
  assert.equal(metrics.blockedCases, 1);
  assert.equal(metrics.missingProofCases, 1);
  assert.equal(metrics.nextActionMissingCases, 1);
  assert.equal(metrics.queueDepth.proof, 1);
  assert.equal(metrics.queueDepth.nextAction, 1);
  assert.equal(metrics.queueDepth.blocker, 1);
  assert.equal(metrics.targetAgentLoad.IMOB_ContinuityAgent, 1);
  assert.equal(metrics.targetAgentLoad.IMOB_LeadAgent, 1);
});
