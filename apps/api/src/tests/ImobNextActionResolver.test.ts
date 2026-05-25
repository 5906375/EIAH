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
      leadReady: false,
      leadReadinessScore: null,
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

test("next action resolver routes commercial activation through campaign approval when campaign is waiting for approval", () => {
  const nextAction = resolveImobNextAction({
    mission: "commercial_activation",
    context: buildContext({
      missionContext: {
        mission: "commercial_activation",
        lockedUntilExplicitChange: false,
      },
      entities: {
        campaign: { status: "awaiting_human_approval" },
      },
    }),
    operation: "campaign",
    flow: "listing.activate",
    pendingFields: [],
  });

  assert.equal(nextAction.operation, "campaign");
  assert.equal(nextAction.reasonCode, "CAMPAIGN_APPROVAL_REQUIRED");
  assert.equal(nextAction.targetAgent, "IMOB_FollowUpAgent");
});

test("next action resolver keeps lead in qualification when minimum fields are still missing", () => {
  const nextAction = resolveImobNextAction({
    mission: "qualify_and_match_lead",
    context: buildContext({
      missionContext: {
        mission: "qualify_lead",
        lockedUntilExplicitChange: false,
      },
      entities: {
        lead: { name: "Maria", desiredGoal: "locacao", desiredCity: "Itapema" },
      },
      readiness: {
        ownerReady: false,
        propertyReady: false,
        leadReady: false,
        leadReadinessScore: 48,
        documentsReady: false,
        seasonalRulesReady: false,
        operationalReady: false,
      },
    }),
    operation: "lead",
    flow: "lead.qualify",
    pendingFields: ["leadPhone", "budgetMax"],
  });

  assert.equal(nextAction.operation, "lead");
  assert.equal(nextAction.reasonCode, "LEAD_MISSING_REQUIRED_FIELD");
});

test("next action resolver asks for readiness review when lead is complete but still below threshold", () => {
  const nextAction = resolveImobNextAction({
    mission: "qualify_and_match_lead",
    context: buildContext({
      missionContext: {
        mission: "qualify_lead",
        lockedUntilExplicitChange: false,
      },
      entities: {
        lead: { id: "lead-1", name: "Maria", desiredGoal: "locacao", desiredCity: "Itapema" },
      },
      readiness: {
        ownerReady: false,
        propertyReady: false,
        leadReady: true,
        leadReadinessScore: 60,
        documentsReady: false,
        seasonalRulesReady: false,
        operationalReady: false,
      },
    }),
    operation: "lead",
    flow: "lead.qualify",
    pendingFields: [],
  });

  assert.equal(nextAction.operation, "lead");
  assert.equal(nextAction.reasonCode, "LEAD_READINESS_REVIEW_REQUIRED");
});

test("next action resolver promotes ready lead to property linking handoff", () => {
  const nextAction = resolveImobNextAction({
    mission: "qualify_and_match_lead",
    context: buildContext({
      missionContext: {
        mission: "qualify_lead",
        lockedUntilExplicitChange: false,
      },
      entities: {
        lead: { id: "lead-1", name: "Maria", desiredGoal: "locacao", desiredCity: "Itapema" },
      },
      readiness: {
        ownerReady: false,
        propertyReady: false,
        leadReady: true,
        leadReadinessScore: 76,
        documentsReady: false,
        seasonalRulesReady: false,
        operationalReady: false,
      },
    }),
    operation: "lead",
    flow: "lead.qualify",
    pendingFields: [],
  });

  assert.equal(nextAction.operation, "lead");
  assert.equal(nextAction.reasonCode, "LEAD_READY_TO_LINK");
});

test("next action resolver promotes ready lead with compatible property into visit scheduling", () => {
  const nextAction = resolveImobNextAction({
    mission: "qualify_and_match_lead",
    context: buildContext({
      missionContext: {
        mission: "qualify_lead",
        lockedUntilExplicitChange: false,
      },
      entities: {
        lead: { id: "lead-1", name: "Maria", desiredGoal: "locacao", desiredCity: "Itapema" },
        property: { id: "property-1", goal: "locacao", city: "Itapema", address: "Rua 700, 10" },
      },
      leadMatching: {
        status: "suggested",
        matchStrength: "high",
        propertyId: "property-1",
        propertyLabel: "Rua 700, 10",
        reasonCodes: ["MATCHING_GOAL_ALIGNED", "MATCHING_CITY_ALIGNED"],
        summary: "O imóvel Rua 700, 10 já está alinhado com cidade e objetivo do lead.",
        recommendedNextMove: "vincular lead ao imóvel compatível",
      },
      readiness: {
        ownerReady: false,
        propertyReady: false,
        leadReady: true,
        leadReadinessScore: 82,
        documentsReady: false,
        seasonalRulesReady: false,
        operationalReady: false,
      },
    }),
    operation: "lead",
    flow: "lead.qualify",
    pendingFields: [],
  });

  assert.equal(nextAction.operation, "visit");
  assert.equal(nextAction.reasonCode, "VISIT_REQUIRED");
});

test("next action resolver asks to find compatible property when lead is ready but case has no candidate property", () => {
  const nextAction = resolveImobNextAction({
    mission: "qualify_and_match_lead",
    context: buildContext({
      missionContext: {
        mission: "qualify_lead",
        lockedUntilExplicitChange: false,
      },
      entities: {
        lead: { id: "lead-1", name: "Maria", desiredGoal: "locacao", desiredCity: "Itapema" },
      },
      leadMatching: {
        status: "awaiting_candidate",
        matchStrength: "unknown",
        propertyId: null,
        propertyLabel: null,
        reasonCodes: ["MATCHING_PROPERTY_CANDIDATE_MISSING"],
        summary: "O lead já está pronto, mas o caso ainda não tem um imóvel candidato explícito para comparação.",
        recommendedNextMove: "buscar imóvel compatível para este lead",
      },
      readiness: {
        ownerReady: false,
        propertyReady: false,
        leadReady: true,
        leadReadinessScore: 82,
        documentsReady: false,
        seasonalRulesReady: false,
        operationalReady: false,
      },
    }),
    operation: "lead",
    flow: "lead.qualify",
    pendingFields: [],
  });

  assert.equal(nextAction.operation, "lead");
  assert.equal(nextAction.reasonCode, "LEAD_PROPERTY_MATCH_PENDING");
});

test("next action resolver promotes scheduled visit into proposal preparation", () => {
  const nextAction = resolveImobNextAction({
    mission: "schedule_and_follow_visit",
    context: buildContext({
      missionContext: {
        mission: "schedule_visit",
        lockedUntilExplicitChange: false,
      },
      entities: {
        lead: { id: "lead-1", name: "Maria", desiredGoal: "locacao", desiredCity: "Itapema" },
        property: { id: "property-1", goal: "locacao", city: "Itapema", address: "Rua 700, 10" },
        visit: { id: "visit-1", status: "scheduled" },
      },
      readiness: {
        ownerReady: false,
        propertyReady: true,
        leadReady: true,
        leadReadinessScore: 82,
        documentsReady: false,
        seasonalRulesReady: false,
        operationalReady: false,
      },
    }),
    operation: "visit",
    flow: "visit.schedule",
    pendingFields: [],
  });

  assert.equal(nextAction.operation, "lead");
  assert.equal(nextAction.reasonCode, "PROPOSAL_REQUIRED");
});

test("next action resolver preserves disqualified lead review before reopening the funnel", () => {
  const nextAction = resolveImobNextAction({
    mission: "qualify_and_match_lead",
    context: buildContext({
      missionContext: {
        mission: "qualify_lead",
        lockedUntilExplicitChange: false,
      },
      entities: {
        lead: { id: "lead-1", name: "Maria" },
      },
      leadLifecycle: {
        status: "disqualified",
        reason: "orcamento fora da faixa",
        nextTrigger: null,
        summary: "Lead desqualificado por orcamento fora da faixa.",
      },
      readiness: {
        ownerReady: false,
        propertyReady: false,
        leadReady: true,
        leadReadinessScore: 82,
        documentsReady: false,
        seasonalRulesReady: false,
        operationalReady: false,
      },
    }),
    operation: "lead",
    flow: "lead.qualify",
    pendingFields: [],
  });

  assert.equal(nextAction.operation, "lead");
  assert.equal(nextAction.reasonCode, "LEAD_DISQUALIFIED");
});

test("next action resolver promotes reengagement when a disqualified lead already has a return trigger", () => {
  const nextAction = resolveImobNextAction({
    mission: "qualify_and_match_lead",
    context: buildContext({
      missionContext: {
        mission: "qualify_lead",
        lockedUntilExplicitChange: false,
      },
      entities: {
        lead: { id: "lead-1", name: "Maria" },
      },
      leadLifecycle: {
        status: "reengagement_ready",
        reason: "janela de decisão futura",
        nextTrigger: "decision_window",
        summary: "Lead desqualificado por janela de decisão futura e já com gatilho de retomada decision_window.",
      },
      readiness: {
        ownerReady: false,
        propertyReady: false,
        leadReady: true,
        leadReadinessScore: 82,
        documentsReady: false,
        seasonalRulesReady: false,
        operationalReady: false,
      },
    }),
    operation: "lead",
    flow: "lead.qualify",
    pendingFields: [],
  });

  assert.equal(nextAction.operation, "lead");
  assert.equal(nextAction.reasonCode, "LEAD_REENGAGEMENT_REQUIRED");
});
