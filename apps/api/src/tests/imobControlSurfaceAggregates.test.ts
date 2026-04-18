import test from "node:test";
import assert from "node:assert/strict";

import {
  buildImobApprovalContext,
  buildImobApprovalContextResponse,
  buildImobBottleneckHeatmap,
  buildImobPriorityQueue,
  buildImobRescueIndex,
  buildImobSpecialistLoadBoard,
  buildImobWaitingOnBoard,
} from "../services/imob/control/imobControlSurfaceAggregates";
import type { ImobControlSurface } from "../services/imob/control/imobControlSurface";

function buildSurface(overrides: Partial<ImobControlSurface> = {}): ImobControlSurface {
  return {
    caseId: "case-1",
    threadId: "thread-1",
    humanJourneyPhase: "proposta",
    currentObjective: "Retomar proposta",
    waitingOn: "lead",
    urgency: "medium",
    agingHours: 20,
    followUpRisk: "medium",
    nextActionOwner: "Corretor",
    doneDefinition: "Proposta retomada",
    likelyFailureMode: null,
    nextStep: "Ligar para o lead",
    blocker: null,
    specialists: [],
    ...overrides,
  };
}

test("IMOB control surface aggregates sort priority queue by urgency and aging", () => {
  const items = buildImobPriorityQueue([
    buildSurface({ caseId: "case-low", urgency: "low", agingHours: 8, followUpRisk: "low" }),
    buildSurface({ caseId: "case-high", urgency: "high", agingHours: 55, followUpRisk: "high", waitingOn: "finance" }),
  ]);

  assert.equal(items[0]?.caseId, "case-high");
  assert.match(items[0]?.autoprompt ?? "", /tempo parado/i);
});

test("IMOB control surface aggregates group waiting on board by owner area", () => {
  const items = buildImobWaitingOnBoard([
    buildSurface({ caseId: "case-legal", waitingOn: "legal", urgency: "high" }),
    buildSurface({ caseId: "case-finance", waitingOn: "finance", urgency: "high" }),
    buildSurface({ caseId: "case-legal-2", waitingOn: "legal", urgency: "medium" }),
  ]);

  assert.equal(items[0]?.waitingOn, "legal");
  assert.equal(items[0]?.total, 2);
  assert.equal(items[1]?.waitingOn, "finance");
});

test("IMOB control surface aggregates heatmap by phase, reasonCode and waitingOn", () => {
  const items = buildImobBottleneckHeatmap([
    buildSurface({
      caseId: "case-doc-1",
      humanJourneyPhase: "documentacao",
      waitingOn: "legal",
      urgency: "high",
      specialists: [{ specialistId: "J_360", reasonCode: "DOCUMENT_BLOCKER", urgency: "high", outputType: "validation" }],
    }),
    buildSurface({
      caseId: "case-doc-2",
      humanJourneyPhase: "documentacao",
      waitingOn: "legal",
      urgency: "medium",
      specialists: [{ specialistId: "J_360", reasonCode: "DOCUMENT_BLOCKER", urgency: "medium", outputType: "validation" }],
    }),
    buildSurface({
      caseId: "case-fin-1",
      humanJourneyPhase: "fechamento",
      waitingOn: "finance",
      urgency: "high",
      specialists: [{ specialistId: "fin-nexus", reasonCode: "FINANCIAL_BLOCKER", urgency: "high", outputType: "financial_check" }],
    }),
  ]);

  assert.equal(items[0]?.phase, "documentacao");
  assert.equal(items[0]?.reasonCode, "DOCUMENT_BLOCKER");
  assert.equal(items[0]?.waitingOn, "legal");
  assert.equal(items[0]?.total, 2);
});

test("IMOB control surface aggregates specialist load by specialist and reasonCode", () => {
  const items = buildImobSpecialistLoadBoard([
    buildSurface({
      specialists: [{ specialistId: "I_BC", reasonCode: "COMMERCIAL_PRIORITY", urgency: "high", outputType: "advice" }],
    }),
    buildSurface({
      caseId: "case-2",
      specialists: [{ specialistId: "I_BC", reasonCode: "COMMERCIAL_PRIORITY", urgency: "medium", outputType: "advice" }],
    }),
    buildSurface({
      caseId: "case-3",
      specialists: [{ specialistId: "J_360", reasonCode: "DOCUMENT_BLOCKER", urgency: "high", outputType: "validation" }],
    }),
  ]);

  assert.equal(items[0]?.specialistId, "I_BC");
  assert.equal(items[0]?.reasonCode, "COMMERCIAL_PRIORITY");
  assert.equal(items[0]?.total, 2);
});

test("IMOB control surface aggregates rescue index from triggered cases and current risk", () => {
  const items = buildImobRescueIndex({
    items: [
      buildSurface({
        caseId: "case-rescued",
        humanJourneyPhase: "proposta",
        urgency: "medium",
        followUpRisk: "medium",
      }),
      buildSurface({
        caseId: "case-critical",
        humanJourneyPhase: "proposta",
        urgency: "high",
        followUpRisk: "high",
      }),
    ],
    recentTriggeredCaseIds: new Set(["case-rescued"]),
  });

  assert.equal(items[0]?.key, "proposta");
  assert.equal(items[0]?.rescued, 1);
  assert.equal(items[0]?.totalCritical, 2);
});

test("IMOB control surface aggregates approval context only for reason codes that require governance", () => {
  const items = buildImobApprovalContext({
    items: [
      buildSurface({
        caseId: "case-audit",
        urgency: "high",
        specialists: [{ specialistId: "guardian", reasonCode: "AUDIT_BLOCKER", urgency: "high", outputType: "evidence" }],
      }),
      buildSurface({
        caseId: "case-fin",
        specialists: [{ specialistId: "fin-nexus", reasonCode: "FINANCIAL_BLOCKER", urgency: "high", outputType: "financial_check" }],
      }),
      buildSurface({
        caseId: "case-commercial",
        specialists: [{ specialistId: "I_BC", reasonCode: "COMMERCIAL_PRIORITY", urgency: "medium", outputType: "advice" }],
      }),
    ],
    evidenceCountByCaseId: new Map([["case-fin", 2]]),
  });

  assert.equal(items.length, 2);
  assert.equal(items[0]?.caseId, "case-audit");
  assert.equal(items[0]?.requiresEvidence, true);
  assert.equal(items[1]?.caseId, "case-fin");
  assert.equal(items[1]?.evidenceCount, 2);
});

test("IMOB control surface exposes approval context as canonical response contract", () => {
  const response = buildImobApprovalContextResponse({
    items: [
      buildSurface({
        caseId: "case-audit",
        specialists: [{ specialistId: "guardian", reasonCode: "AUDIT_BLOCKER", urgency: "high", outputType: "evidence" }],
      }),
    ],
  });

  assert.equal(response.items.length, 1);
  assert.equal(response.items[0]?.reasonCode, "AUDIT_BLOCKER");
});
