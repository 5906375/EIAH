import test from "node:test";
import assert from "node:assert/strict";

import { buildImobCaseContextV1 } from "../services/imob/crm/imobCaseContextBuilder";

test("IMOB E2E lead matching suggests only the compatible property already present in the active case", () => {
  const context = buildImobCaseContextV1({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    caseId: "case-1",
    message: "qualificar lead Maria para locação em Itapema",
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

  assert.equal(context.leadMatching?.status, "suggested");
  assert.equal(context.leadMatching?.propertyId, "property-1");
  assert.equal(context.canonicalCaseState?.nextAction.reasonCode, "LEAD_PROPERTY_MATCH_SUGGESTED");
  assert.equal(context.recoverySnapshot?.primaryAction?.operation, "lead.qualify");
});

test("IMOB E2E lead matching does not invent a property when the ready lead has no candidate in the case", () => {
  const context = buildImobCaseContextV1({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    caseId: "case-1",
    message: "qualificar lead Maria para locação em Itapema",
    caseContext: {
      caseId: "case-1",
      flow: "lead.qualify",
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

  assert.equal(context.leadMatching?.status, "awaiting_candidate");
  assert.equal(context.leadMatching?.propertyId ?? null, null);
  assert.equal(context.canonicalCaseState?.nextAction.reasonCode, "LEAD_PROPERTY_MATCH_PENDING");
  assert.match(context.recoverySnapshot?.primaryAction?.label ?? "", /buscar imovel|buscar imóvel/i);
});
