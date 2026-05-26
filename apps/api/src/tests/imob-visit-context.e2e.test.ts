import test from "node:test";
import assert from "node:assert/strict";

import { buildImobCaseContextV1 } from "../services/imob/crm/imobCaseContextBuilder";
import { resolveImobRecoveryResponse } from "../services/imob/orchestrator/imobRecoveryResolver";

test("visit context e2e keeps pending scheduling explicit in the active case", () => {
  const context = buildImobCaseContextV1({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    caseId: "case-visit-1",
    caseContext: {
      caseId: "case-visit-1",
      flow: "visit.schedule",
      lead: {
        id: "lead-1",
        name: "Maria",
        goal: "locacao",
        targetCity: "Itapema",
        budgetMaxCents: 350000,
      },
      property: {
        id: "property-1",
        propertyType: "apartamento",
        goal: "locacao",
        city: "Itapema",
        address: "Rua 700, 10",
      },
    },
    operational: {
      flow: "visit.schedule",
      pendingFields: ["preferredDate"],
      visitDraft: {
        propertyId: "property-1",
        visitorName: "Maria",
        visitorPhone: "47999998888",
      },
    },
  });

  const response = resolveImobRecoveryResponse({
    context,
    intent: "what_is_missing",
  });

  assert.equal(context.visitScheduling?.status, "pending_confirmation");
  assert.equal(context.canonicalCaseState?.nextAction.reasonCode, "VISIT_SCHEDULING_PENDING");
  assert.equal(response.primaryAction?.operation, "visit.schedule");
  assert.match(response.summary, /agenda da visita/i);
});
