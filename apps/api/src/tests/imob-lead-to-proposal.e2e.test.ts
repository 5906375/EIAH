import test from "node:test";
import assert from "node:assert/strict";

import { buildImobCaseContextV1 } from "../services/imob/crm/imobCaseContextBuilder";

test("IMOB E2E keeps scheduled visit waiting for explicit outcome before proposal preparation", () => {
  const context = buildImobCaseContextV1({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    caseId: "case-1",
    caseContext: {
      caseId: "case-1",
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
        preferredDate: "2026-05-30",
        preferredWindow: "tarde",
      },
    },
  });

  assert.equal(context.entities.visit?.status, "scheduled");
  assert.equal(context.canonicalCaseState?.mission, "schedule_and_follow_visit");
  assert.equal(context.visitOutcome?.status, "pending_result");
  assert.equal(context.canonicalCaseState?.nextAction.reasonCode, "VISIT_OUTCOME_REQUIRED");
});

test("IMOB E2E promotes positive post-visit outcome into proposal preparation", () => {
  const context = buildImobCaseContextV1({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    caseId: "case-1",
    caseContext: {
      caseId: "case-1",
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
        preferredDate: "2026-05-30",
        preferredWindow: "tarde",
        outcome: "proposal_ready",
      },
    },
  });

  assert.equal(context.visitOutcome?.status, "proposal_ready");
  assert.equal(context.canonicalCaseState?.nextAction.reasonCode, "PROPOSAL_REQUIRED");
});
