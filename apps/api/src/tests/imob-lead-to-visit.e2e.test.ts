import test from "node:test";
import assert from "node:assert/strict";

import { buildImobCaseContextV1 } from "../services/imob/crm/imobCaseContextBuilder";

test("IMOB E2E promotes matched lead into visit scheduling", () => {
  const context = buildImobCaseContextV1({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    caseId: "case-1",
    caseContext: {
      caseId: "case-1",
      flow: "lead.qualify",
      property: {
        id: "property-1",
        propertyType: "apartamento",
        goal: "locacao",
        city: "Itapema",
        address: "Rua 700, 10",
      },
      lead: {
        id: "lead-1",
        name: "Maria",
        goal: "locacao",
        targetCity: "Itapema",
        budgetMaxCents: 350000,
        discoverySignals: {
          urgency: "high",
          painPoint: "mudança urgente",
          motivation: "trabalho",
          budgetFlexibility: "medium",
          decisionMaker: "self",
          timeline: "30d",
        },
      },
    },
    operational: {
      flow: "lead.qualify",
      leadDraft: {
        leadPhone: "47999998888",
      },
    },
  });

  assert.equal(context.canonicalCaseState?.currentStep, "ready_for_visit");
  assert.equal(context.canonicalCaseState?.nextAction.reasonCode, "VISIT_REQUIRED");
  assert.equal(context.recoverySnapshot?.primaryAction?.operation, "visit.schedule");
});
