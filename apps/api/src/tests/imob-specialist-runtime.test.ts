import test from "node:test";
import assert from "node:assert/strict";

import {
  executeClosingSpecialist,
  executeInventoryWatchSpecialist,
  executeLeadProfileSpecialist,
  executeLeadScoringSpecialist,
  executeMissionOrchestrationSpecialist,
  executeReengagementSpecialist,
  executeRelationshipMemorySpecialist,
  executeViabilitySpecialist,
} from "../services/imob/specialists/imobCaseSpecialists";

const caseContext = {
  caseId: "case-1",
  flow: "lead.qualify",
  nextStep: "qualificar lead deste caso",
  blocker: null,
  lead: {
    goal: "locacao",
    targetCity: "Balneário Camboriú",
    budgetMaxCents: 200000,
  },
  property: {
    city: "Balneário Camboriú",
    askingPriceCents: 200000,
  },
} as any;

test("lead scoring specialist keeps capability mapping and output contract", () => {
  const execution = executeLeadScoringSpecialist({
    input: { caseContext },
    buildSnapshot: () => ({
      scoreBand: "HOT",
      scoreValue: 82,
      scoreVersion: "imob.lead_scoring.v1.1",
      summary: "Lead pronto para priorização.",
      confidence: "high",
      reasonCodes: ["lead_ready_hot", "urgency_high"],
      factors: [],
      shadowMode: true,
      generatedAt: "2026-05-03T10:00:00.000Z",
    }),
  });

  assert.equal(execution.specialistId, "imob.lead_scoring_agent");
  assert.equal(execution.capabilityId, "lead.scoring");
  assert.equal(execution.version, "imob.lead_scoring.v1.1");
  assert.equal(execution.output.scoreBand, "HOT");
  assert.ok(execution.evidenceRefs.length >= 3);
});

test("relationship memory specialist reuses decision rationale evidence when available", () => {
  const execution = executeRelationshipMemorySpecialist({
    input: {
      caseContext,
      decisionRationale: {
        summary: "Resumo",
        confidence: "high",
        reasonCodes: ["case_ready"],
        sourceRefs: [{ kind: "case_field", ref: "case.flow", label: "Fluxo", value: "lead.qualify" }],
        generatedAt: "2026-05-03T10:00:00.000Z",
      },
    },
    buildSnapshot: () => ({
      memoryVersion: "imob.commercial_memory.v1.1",
      summary: "Memória comercial consolidada.",
      confidence: "high",
      reasonCodes: ["trigger_follow_up"],
      preferences: [],
      objections: [],
      urgencySignals: [],
      lastUsefulAction: null,
      nextTrigger: { kind: "follow_up", summary: "Retomar" },
      generatedAt: "2026-05-03T10:00:00.000Z",
    }),
  });

  assert.equal(execution.specialistId, "imob.relationship_memory_agent");
  assert.equal(execution.capabilityId, "relationship.commercial_memory");
  assert.equal(execution.evidenceRefs[0]?.ref, "case.flow");
});

test("profile, viability and closing specialists expose typed versions", () => {
  const profile = executeLeadProfileSpecialist({
    input: { caseContext },
    buildSnapshot: () => ({
      profileVersion: "imob.lead_profile_report.v1",
      profileStatus: "ready",
      commercialReadiness: "high",
      financialReadiness: "medium",
      consentScope: "internal_only",
      summary: "Perfil pronto.",
      strengths: [],
      risks: [],
      missingEvidence: [],
      recommendedNextMove: "seguir",
      shadowMode: true,
      generatedAt: "2026-05-03T10:00:00.000Z",
    }),
  });
  const viability = executeViabilitySpecialist({
    input: { caseContext },
    buildSnapshot: () => ({
      analysisVersion: "imob.viability_market_analysis.v1",
      marketStatus: "viable",
      viabilityScore: 75,
      liquiditySignal: "high",
      priceConfidence: "high",
      summary: "Viável.",
      anchorSignals: [],
      missingEvidence: [],
      recommendedNextMove: "seguir",
      shadowMode: true,
      generatedAt: "2026-05-03T10:00:00.000Z",
    }),
  });
  const closing = executeClosingSpecialist({
    input: { caseContext },
    buildSnapshot: () => ({
      documentStateVersion: "imob.closing_documents_real.v1",
      readinessStatus: "ready",
      packetReadiness: "ready",
      legalHandoffRecommended: false,
      summary: "Pronto.",
      pendingDocuments: [],
      blockingIssues: [],
      nextValidationOwner: "corretor",
      recommendedNextMove: "validar",
      shadowMode: true,
      generatedAt: "2026-05-03T10:00:00.000Z",
    }),
  });

  assert.equal(profile.version, "imob.lead_profile_report.v1");
  assert.equal(viability.version, "imob.viability_market_analysis.v1");
  assert.equal(closing.version, "imob.closing_documents_real.v1");
});

test("reengagement, inventory and mission specialists keep IMOB ownership path", () => {
  const reengagement = executeReengagementSpecialist({
    input: { caseContext },
    buildSnapshot: () => ({
      reason: "decision_window",
      summary: "Retomar hoje.",
      recommendedTiming: "today",
      suggestedChannel: "internal",
      messageBase: "Olá",
      anchorSignals: [],
      shadowMode: true,
      generatedAt: "2026-05-03T10:00:00.000Z",
    }),
  });
  const inventory = executeInventoryWatchSpecialist({
    input: { caseContext },
    buildSnapshot: () => ({
      watchStatus: "matching",
      matchStrength: "high",
      watchVersion: "imob.inventory_watch.v1",
      summary: "Aderente.",
      anchorSignals: [],
      missingCriteria: [],
      recommendedNextMove: "retomar",
      shadowMode: true,
      generatedAt: "2026-05-03T10:00:00.000Z",
    }),
  });
  const mission = executeMissionOrchestrationSpecialist({
    input: { caseContext },
    buildSnapshot: () => ({
      missionVersion: "imob.mission_orchestration.v1",
      missionId: "mission-imob-case-1-inventory-active-watch",
      missionStatus: "ready",
      ownerAgentId: "IMOB",
      ownerCapability: "inventory.active_watch",
      supportingAgents: ["I_BC"],
      missionReasonCodes: ["watch_status_matching"],
      summary: "Missão pronta.",
      pendingHandoffs: [],
      blockingIssues: [],
      recommendedNextMove: "retomar",
      evidenceRefs: [{ kind: "case_field", ref: "case.flow", label: "Fluxo do caso", value: "lead.qualify" }],
      shadowMode: true,
      createdAt: "2026-05-03T10:00:00.000Z",
      closedAt: "2026-05-03T10:00:00.000Z",
      generatedAt: "2026-05-03T10:00:00.000Z",
    }),
  });

  assert.equal(reengagement?.capabilityId, "reengagement.continuous");
  assert.equal(inventory.capabilityId, "inventory.active_watch");
  assert.equal(mission.capabilityId, "multiagent.mission_orchestration");
  assert.equal(mission.output.ownerAgentId, "IMOB");
  assert.equal(mission.output.missionId, "mission-imob-case-1-inventory-active-watch");
});
