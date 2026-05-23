import test from "node:test";
import assert from "node:assert/strict";

import type { ImobCaseContextV1 } from "../services/imob/crm/imobCaseContextContract";
import { resolveImobNextAction } from "../services/imob/orchestrator/imobNextActionResolver";

function buildContext(overrides: Partial<ImobCaseContextV1> = {}): ImobCaseContextV1 {
  return {
    version: "1.0",
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    caseId: "case-1",
    missionContext: {
      mission: "capture_seasonal_property",
      lockedUntilExplicitChange: false,
    },
    entities: {},
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
    ...overrides,
  };
}

test("next action resolver prioritizes explicit lead continuity actions", () => {
  const nextAction = resolveImobNextAction({
    mission: "qualify_and_match_lead",
    context: buildContext({
      missionContext: {
        mission: "qualify_lead",
        lockedUntilExplicitChange: false,
      },
    }),
    operation: "lead",
    flow: "lead.qualify",
    legacyNextAction: "ask_missing_lead_field",
    pendingFields: ["leadPhone"],
  });

  assert.equal(nextAction.operation, "lead");
  assert.equal(nextAction.targetAgent, "IMOB_LeadAgent");
  assert.equal(nextAction.reasonCode, "LEAD_MISSING_REQUIRED_FIELD");
});

test("next action resolver returns owner-property linking when entities are ready but unlinked", () => {
  const nextAction = resolveImobNextAction({
    mission: "capture_seasonal_property",
    context: buildContext({
      entities: {
        owner: { id: "owner-1" },
        property: { id: "property-1" },
      },
      links: {
        ownerProperty: {
          ownerId: "owner-1",
          propertyId: "property-1",
          status: "missing",
        },
      },
      readiness: {
        ownerReady: true,
        propertyReady: true,
        documentsReady: false,
        seasonalRulesReady: false,
        operationalReady: false,
      },
    }),
    operation: "property",
    flow: "property.create",
    pendingFields: [],
  });

  assert.equal(nextAction.operation, "property");
  assert.equal(nextAction.reasonCode, "OWNER_PROPERTY_LINK_REQUIRED");
  assert.equal(nextAction.targetAgent, "IMOB_PropertyAgent");
});
