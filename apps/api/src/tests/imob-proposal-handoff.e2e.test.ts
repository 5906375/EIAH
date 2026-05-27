import test from "node:test";
import assert from "node:assert/strict";

import { buildImobCaseContextV1 } from "../services/imob/crm/imobCaseContextBuilder";
import { resolveImobRecoveryResponse } from "../services/imob/orchestrator/imobRecoveryResolver";

test("proposal handoff E2E advances accepted proposal into contract preparation", () => {
  const context = buildImobCaseContextV1({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    caseId: "proposal-handoff-1",
    caseContext: {
      caseId: "proposal-handoff-1",
      flow: "proposal.create",
    },
    operational: {
      flow: "proposal.create",
      proposalDraft: {
        propertyId: "property-1",
        buyerName: "Maria",
        buyerPhone: "47999998888",
        offerAmount: 420000,
        contractType: "sale",
        negotiationStatus: "accepted",
      },
      contractDraft: {
        propertyId: "property-1",
        counterpartyName: "Maria",
        contractType: "sale",
        documentPacketStatus: "ready",
        handoffTarget: "LEGAL",
        approvalRequired: true,
      },
    },
  });

  const response = resolveImobRecoveryResponse({
    intent: "next_step",
    context,
  });

  assert.equal(context.canonicalCaseState?.nextAction.operation, "contract");
  assert.equal(context.canonicalCaseState?.nextAction.reasonCode, "LEGAL_HANDOFF_REQUIRED");
  assert.equal(response.primaryAction?.operation, "contract.prepare");
  assert.equal(response.primaryAction?.label, "Encaminhar para jurídico");
});

test("proposal handoff E2E turns rejected proposal into explicit commercial reengagement", () => {
  const context = buildImobCaseContextV1({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    caseId: "proposal-handoff-2",
    caseContext: {
      caseId: "proposal-handoff-2",
      flow: "proposal.create",
    },
    operational: {
      flow: "proposal.create",
      proposalDraft: {
        propertyId: "property-1",
        buyerName: "Maria",
        buyerPhone: "47999998888",
        offerAmount: 420000,
        contractType: "sale",
        negotiationStatus: "rejected",
      },
    },
  });

  const response = resolveImobRecoveryResponse({
    intent: "next_step",
    context,
  });

  assert.equal(context.commercialFollowUp?.source, "proposal_negotiation");
  assert.equal(context.canonicalCaseState?.nextAction.reasonCode, "FOLLOW_UP_REENGAGEMENT_REQUIRED");
  assert.equal(response.primaryAction?.operation, "lead.qualify");
  assert.equal(response.primaryAction?.label, "Retomar proposta com o lead");
});
