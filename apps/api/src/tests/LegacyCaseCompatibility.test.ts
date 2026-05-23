import test from "node:test";
import assert from "node:assert/strict";

import { buildImobCaseContextV1 } from "../services/imob/crm/imobCaseContextBuilder";
import { resolveCanonicalCaseStateFromLegacy } from "../services/imob/orchestrator/imobLegacyCompatibilityResolver";

test("legacy IMOB case is normalized into canonical case state", () => {
  const context = buildImobCaseContextV1({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    caseId: "case-1",
    message: "quero cadastrar um proprietário para imóvel de temporada",
    caseContext: {
      caseId: "case-1",
      flow: "property.create",
      owner: {
        id: "owner-1",
        name: "Carlos Alberto",
        document: "12345678900",
      },
      property: {
        id: "property-1",
        propertyType: "kitnet",
        goal: "aluguel_por_temporada",
        city: "Balneário Camboriú",
        address: "Rua Alvin Bauer, 783 apto 101",
      },
    },
    operational: {
      flow: "property.create",
      pendingFields: [],
    },
  });

  assert.equal(context.legacyCompatibility?.migratedFromLegacy, true);
  assert.equal(context.canonicalCaseState?.mission, "capture_seasonal_property");
  assert.equal(context.canonicalCaseState?.currentStep, "owner_property_linking");
  assert.equal(context.canonicalCaseState?.nextAction.reasonCode, "OWNER_PROPERTY_LINK_REQUIRED");
});

test("legacy lead qualify flow maps to canonical qualify_and_match_lead mission", () => {
  const result = resolveCanonicalCaseStateFromLegacy({
    context: {
      version: "1.0",
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      caseId: "case-2",
      missionContext: {
        mission: "qualify_lead",
        lockedUntilExplicitChange: false,
      },
      entities: {
        lead: { id: "lead-1", name: "Maria" },
      },
      links: {
        ownerProperty: { status: "pending_confirmation" },
      },
      readiness: {
        ownerReady: false,
        propertyReady: false,
        documentsReady: false,
        seasonalRulesReady: false,
        operationalReady: false,
      },
      blockers: [],
    },
    operational: {
      flow: "lead.qualify",
      pendingFields: ["leadPhone"],
      nextAction: "ask_missing_lead_field",
    },
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.state.mission, "qualify_and_match_lead");
    assert.equal(result.state.currentOperation, "lead");
    assert.equal(result.state.currentStep, "gathering_signals");
  }
});
