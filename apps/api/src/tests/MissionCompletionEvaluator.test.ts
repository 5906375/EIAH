import test from "node:test";
import assert from "node:assert/strict";

import type { ImobCaseContextV1 } from "../services/imob/crm/imobCaseContextContract";
import { resolveImobMissionStatus } from "../services/imob/orchestrator/imobCompletionEvaluator";

function buildContext(overrides: Partial<ImobCaseContextV1> = {}): ImobCaseContextV1 {
  return {
    version: "1.0",
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    caseId: "case-1",
    missionContext: {
      mission: "case_review",
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

test("completion evaluator marks case review snapshot as ready_for_transition", () => {
  const status = resolveImobMissionStatus({
    mission: "case_review",
    context: buildContext(),
    currentStep: "snapshot_ready",
    pendingFields: [],
    hasNextAction: true,
  });

  assert.equal(status, "ready_for_transition");
});

test("completion evaluator marks blocked cases fail-closed", () => {
  const status = resolveImobMissionStatus({
    mission: "capture_seasonal_property",
    context: buildContext({
      blockers: [
        { code: "owner_missing_or_incomplete", severity: "blocking", message: "Owner missing." },
      ],
    }),
    currentStep: "collecting_owner",
    pendingFields: ["ownerDocument"],
    hasNextAction: true,
  });

  assert.equal(status, "blocked");
});

test("completion evaluator promotes qualified lead mission to ready_for_transition", () => {
  const status = resolveImobMissionStatus({
    mission: "qualify_and_match_lead",
    context: buildContext({
      missionContext: {
        mission: "qualify_lead",
        lockedUntilExplicitChange: false,
      },
      entities: {
        lead: { id: "lead-1", name: "Maria" },
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
    currentStep: "matching_inventory",
    pendingFields: [],
    hasNextAction: true,
  });

  assert.equal(status, "ready_for_transition");
});

test("completion evaluator marks commercial activation as ready_for_transition when publish gates are cleared", () => {
  const status = resolveImobMissionStatus({
    mission: "commercial_activation",
    context: buildContext({
      missionContext: {
        mission: "commercial_activation",
        lockedUntilExplicitChange: false,
      },
      entities: {
        campaign: { id: "campaign-1", status: "ready_to_publish" },
      },
    }),
    currentStep: "ready_to_publish",
    pendingFields: [],
    hasNextAction: true,
  });

  assert.equal(status, "ready_for_transition");
});

test("completion evaluator keeps incomplete lead mission in progress", () => {
  const status = resolveImobMissionStatus({
    mission: "qualify_and_match_lead",
    context: buildContext({
      missionContext: {
        mission: "qualify_lead",
        lockedUntilExplicitChange: false,
      },
      entities: {
        lead: { name: "Maria" },
      },
      readiness: {
        ownerReady: false,
        propertyReady: false,
        leadReady: false,
        leadReadinessScore: 32,
        documentsReady: false,
        seasonalRulesReady: false,
        operationalReady: false,
      },
    }),
    currentStep: "gathering_signals",
    pendingFields: ["leadPhone", "budgetMax"],
    hasNextAction: true,
  });

  assert.equal(status, "in_progress");
});

test("completion evaluator keeps complete but low-readiness lead below transition threshold", () => {
  const status = resolveImobMissionStatus({
    mission: "qualify_and_match_lead",
    context: buildContext({
      missionContext: {
        mission: "qualify_lead",
        lockedUntilExplicitChange: false,
      },
      entities: {
        lead: { id: "lead-1", name: "Maria" },
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
    currentStep: "matching_inventory",
    pendingFields: [],
    hasNextAction: true,
  });

  assert.equal(status, "in_progress");
});

test("completion evaluator promotes matched lead to ready_for_transition before visit scheduling", () => {
  const status = resolveImobMissionStatus({
    mission: "qualify_and_match_lead",
    context: buildContext({
      missionContext: {
        mission: "qualify_lead",
        lockedUntilExplicitChange: false,
      },
      entities: {
        lead: { id: "lead-1", name: "Maria" },
        property: { id: "property-1", city: "Itapema", goal: "locacao" as any },
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
        propertyReady: true,
        leadReady: true,
        leadReadinessScore: 82,
        documentsReady: false,
        seasonalRulesReady: false,
        operationalReady: false,
      },
    }),
    currentStep: "ready_for_visit",
    pendingFields: [],
    hasNextAction: true,
  });

  assert.equal(status, "ready_for_transition");
});

test("completion evaluator keeps scheduled visit in progress until the post-visit outcome is explicit", () => {
  const status = resolveImobMissionStatus({
    mission: "schedule_and_follow_visit",
    context: buildContext({
      missionContext: {
        mission: "schedule_visit",
        lockedUntilExplicitChange: false,
      },
      entities: {
        visit: { id: "visit-1", status: "scheduled" },
      },
      visitScheduling: {
        status: "scheduled",
        summary: "A visita já está agendada.",
        recommendedNextMove: "confirmar resultado da visita e preparar o próximo movimento comercial",
      },
      visitOutcome: {
        status: "pending_result",
        summary: "A visita está agendada, mas o resultado ainda não foi registrado no caso.",
        recommendedNextMove: "registrar o resultado da visita antes de decidir proposta ou follow-up",
      },
    }),
    currentStep: "post_visit",
    pendingFields: [],
    hasNextAction: true,
  });

  assert.equal(status, "in_progress");
});

test("completion evaluator promotes visit mission when the post-visit outcome is proposal_ready", () => {
  const status = resolveImobMissionStatus({
    mission: "schedule_and_follow_visit",
    context: buildContext({
      missionContext: {
        mission: "schedule_visit",
        lockedUntilExplicitChange: false,
      },
      entities: {
        visit: { id: "visit-1", status: "scheduled" },
      },
      visitScheduling: {
        status: "scheduled",
        summary: "A visita já está agendada.",
        recommendedNextMove: "confirmar resultado da visita e preparar o próximo movimento comercial",
      },
      visitOutcome: {
        status: "proposal_ready",
        summary: "A visita confirmou avanço comercial e o caso já pode seguir para proposta.",
        recommendedNextMove: "preparar proposta com base no interesse confirmado na visita",
      },
    }),
    currentStep: "post_visit",
    pendingFields: [],
    hasNextAction: true,
  });

  assert.equal(status, "ready_for_transition");
});

test("completion evaluator keeps disqualified lead mission in progress while preserving reengagement path", () => {
  const status = resolveImobMissionStatus({
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
    currentStep: "disqualified",
    pendingFields: [],
    hasNextAction: true,
  });

  assert.equal(status, "in_progress");
});
