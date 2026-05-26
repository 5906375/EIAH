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

test("visit context e2e keeps visit cancellation explicit before post-visit handoff", () => {
  const context = buildImobCaseContextV1({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    caseId: "case-visit-2",
    caseContext: {
      caseId: "case-visit-2",
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
      pendingFields: [],
      visitDraft: {
        propertyId: "property-1",
        visitorName: "Maria",
        visitorPhone: "47999998888",
        preferredDate: "2026-06-05",
        status: "cancel_requested",
      },
    },
  });

  const response = resolveImobRecoveryResponse({
    context,
    intent: "next_step",
  });

  assert.equal(context.visitScheduling?.status, "cancel_requested");
  assert.equal(context.canonicalCaseState?.nextAction.reasonCode, "VISIT_CANCELLATION_REVIEW_REQUIRED");
  assert.equal(response.primaryAction?.operation, "visit.schedule");
  assert.match(response.summary, /cancelamento da visita/i);
});
