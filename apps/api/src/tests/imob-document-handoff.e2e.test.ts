import test from "node:test";
import assert from "node:assert/strict";

import { buildImobCaseContextV1 } from "../services/imob/crm/imobCaseContextBuilder";
import { resolveImobRecoveryResponse } from "../services/imob/orchestrator/imobRecoveryResolver";

test("document handoff e2e keeps legal handoff explicit once the package is sufficient", () => {
  const context = buildImobCaseContextV1({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    caseId: "case-contract-legal",
    caseContext: {
      caseId: "case-contract-legal",
      flow: "contract.prepare",
    },
    operational: {
      flow: "contract.prepare",
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
    context,
    intent: "next_step",
  });

  assert.equal(context.documentSufficiency?.packageStatus, "ready");
  assert.equal(context.documentSufficiency?.legalHandoffStatus, "pending");
  assert.equal(context.canonicalCaseState?.nextAction.reasonCode, "LEGAL_HANDOFF_REQUIRED");
  assert.equal(response.primaryAction?.operation, "contract.prepare");
  assert.match(response.summary, /jurídico/i);
});
