import test from "node:test";
import assert from "node:assert/strict";

import { buildImobCaseContextV1 } from "../services/imob/crm/imobCaseContextBuilder";
import { resolveImobRecoveryResponse } from "../services/imob/orchestrator/imobRecoveryResolver";

test("IMOB post-visit e2e routes explicit follow-up after the visit before proposal handoff", () => {
  const context = buildImobCaseContextV1({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    caseId: "case-post-visit-1",
    caseContext: {
      caseId: "case-post-visit-1",
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
      visitDraft: {
        propertyId: "property-1",
        visitorName: "Maria",
        visitorPhone: "47999998888",
        preferredDate: "2026-06-05",
        preferredWindow: "tarde",
        outcome: "follow_up_required",
      },
    },
  });

  const response = resolveImobRecoveryResponse({
    context,
    intent: "next_step",
  });

  assert.equal(context.visitOutcome?.status, "follow_up_required");
  assert.equal(context.canonicalCaseState?.nextAction.reasonCode, "VISIT_FOLLOW_UP_REQUIRED");
  assert.equal(response.primaryAction?.operation, "lead.qualify");
  assert.match(response.summary, /follow-up/i);
});
