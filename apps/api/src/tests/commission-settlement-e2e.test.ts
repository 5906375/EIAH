import test from "node:test";
import assert from "node:assert/strict";

import { buildImobCaseContextV1 } from "../services/imob/crm/imobCaseContextBuilder";
import { planImobCase } from "../services/imob/crm/imobCrmCasePlanner";
import { resolveImobOperationRouteLoose } from "../services/imob/orchestrator/imobOperationRouter";

test("settle commission E2E keeps the mission blocked while settlement is still pending", () => {
  const context = buildImobCaseContextV1({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    caseId: "commission-case-1",
    caseContext: {
      caseId: "commission-case-1",
      flow: "commission.settle",
    },
    operational: {
      flow: "commission.settle",
      pendingFields: [],
      commissionDraft: {
        dealId: "deal-7788",
        brokerRef: "broker-joao",
        amountCents: 1250000,
        settlementStatus: "pending",
        payoutChannel: "pix",
        approvalRequired: true,
      },
    },
  });

  const plan = planImobCase(context);
  const route = resolveImobOperationRouteLoose(context.canonicalCaseState?.nextAction.operation);

  assert.equal(context.canonicalCaseState?.mission, "settle_commission");
  assert.equal(context.canonicalCaseState?.currentStep, "awaiting_approval");
  assert.equal(context.canonicalCaseState?.missionStatus, "blocked");
  assert.equal(context.canonicalCaseState?.nextAction.operation, "commission");
  assert.equal(context.canonicalCaseState?.nextAction.reasonCode, "COMMISSION_REVIEW_REQUIRED");
  assert.equal(context.canonicalCaseState?.proof.required, true);
  assert.equal(context.canonicalCaseState?.proof.minimumProofSatisfied, false);
  assert.deepEqual(context.canonicalCaseState?.proof.missingProof, ["commission_record"]);
  assert.equal(context.recoverySnapshot?.primaryAction?.operation, "commission.settle");
  assert.equal(plan.primaryAction?.operation, "commission.settle");
  assert.equal(context.crmProjection?.caseCard.targetAgent, "IMOB_ContinuityAgent");
  assert.equal(route?.dispatchedAgentId, "IMOB_ContinuityAgent");
});

test("settle commission E2E marks the mission done when payout is already paid and recorded", () => {
  const context = buildImobCaseContextV1({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    caseId: "commission-case-2",
    caseContext: {
      caseId: "commission-case-2",
      flow: "commission.settle",
    },
    operational: {
      flow: "commission.settle",
      pendingFields: [],
      commissionDraft: {
        dealId: "deal-7788",
        brokerRef: "broker-joao",
        amountCents: 1250000,
        settlementStatus: "paid",
        payoutChannel: "pix",
        approvalRequired: true,
      },
    },
  });

  assert.equal(context.canonicalCaseState?.mission, "settle_commission");
  assert.equal(context.canonicalCaseState?.currentStep, "reconciled");
  assert.equal(context.canonicalCaseState?.missionStatus, "done");
  assert.equal(context.canonicalCaseState?.proof.required, true);
  assert.equal(context.canonicalCaseState?.proof.minimumProofSatisfied, true);
  assert.equal(context.crmProjection?.caseCard.proofStatus, "satisfied");
  assert.equal(context.recoverySnapshot?.primaryAction?.operation, "commission.settle");
});
