import test from "node:test";
import assert from "node:assert/strict";

import { buildImobControlSurface } from "../services/imob/control/imobControlSurface";
import type { ImobCaseContext, ImobResolvedBackingSpecialist } from "../services/imob/imobConversationContract";

function buildCaseContext(overrides: Partial<ImobCaseContext> = {}): ImobCaseContext {
  return {
    caseId: "case-1",
    flow: "proposal.create",
    stage: "proposal_review",
    status: "open",
    ownerResponsible: "Corretor",
    nextStep: "Retomar proposta com o lead",
    blocker: null,
    pendingItems: [],
    threadId: "thread-1",
    updatedAt: new Date().toISOString(),
    canonical: {
      journeyType: "proposal",
      recommendedActions: [],
      blockedActions: [],
      missingContext: [],
      reasonCodes: ["COMMERCIAL_PRIORITY"],
    },
    humanJourney: {
      phase: "proposta",
      phaseObjective: "Fechar condições mínimas para proposta viável",
    },
    humanWorkflow: {
      currentObjective: "Fechar a proposta com segurança",
      waitingOn: "lead",
      urgency: "high",
      agingHours: 52,
      followUpRisk: "high",
      nextActionOwner: "Corretor",
      lastMeaningfulContactAt: null,
      doneDefinition: "Proposta alinhada",
      likelyFailureMode: "Caso pode esfriar sem retomada",
    },
    ...overrides,
  };
}

function buildSpecialist(overrides: Partial<ImobResolvedBackingSpecialist> = {}): ImobResolvedBackingSpecialist {
  return {
    key: "commercial_intelligence",
    primaryAgentId: "I_BC",
    responsibility: "priorização comercial e próxima melhor abordagem",
    visibleToUserByDefault: false,
    escalationTriggers: ["lead quente"],
    rationale: "Priorizar a abordagem comercial da proposta.",
    reasonCode: "COMMERCIAL_PRIORITY",
    suggestedAction: "Revisar proposta e fazer a retomada hoje.",
    urgency: "high",
    outputType: "advice",
    requiredContext: ["case.nextStep"],
    ...overrides,
  };
}

test("IMOB control surface projects human workflow and specialist context", () => {
  const surface = buildImobControlSurface({
    caseContext: buildCaseContext(),
    specialists: [buildSpecialist()],
  });

  assert.equal(surface.caseId, "case-1");
  assert.equal(surface.threadId, "thread-1");
  assert.equal(surface.humanJourneyPhase, "proposta");
  assert.equal(surface.currentObjective, "Fechar a proposta com segurança");
  assert.equal(surface.waitingOn, "lead");
  assert.equal(surface.urgency, "high");
  assert.equal(surface.followUpRisk, "high");
  assert.equal(surface.nextActionOwner, "Corretor");
  assert.equal(surface.specialists[0]?.specialistId, "I_BC");
  assert.equal(surface.specialists[0]?.reasonCode, "COMMERCIAL_PRIORITY");
});

test("IMOB control surface falls back reasonCode from specialist catalog when omitted", () => {
  const surface = buildImobControlSurface({
    caseContext: buildCaseContext({
      humanJourney: {
        phase: "documentacao",
        phaseObjective: "Resolver pendências documentais",
      },
      humanWorkflow: {
        currentObjective: "Resolver documentação",
        waitingOn: "legal",
        urgency: "medium",
        agingHours: 18,
        followUpRisk: "medium",
        nextActionOwner: "Jurídico",
        lastMeaningfulContactAt: null,
        doneDefinition: "Documentos validados",
        likelyFailureMode: null,
      },
    }),
    specialists: [
      buildSpecialist({
        key: "legal",
        primaryAgentId: "J_360",
        responsibility: "contrato, cláusulas, matrícula e risco documental imobiliário",
        reasonCode: undefined,
        outputType: "validation",
      }),
    ],
  });

  assert.equal(surface.specialists[0]?.specialistId, "J_360");
  assert.equal(surface.specialists[0]?.reasonCode, "DOCUMENT_BLOCKER");
});
