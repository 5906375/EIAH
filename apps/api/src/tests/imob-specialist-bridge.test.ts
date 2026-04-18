import test from "node:test";
import assert from "node:assert/strict";

import { resolveImobBackingSpecialists } from "../services/imob/imobSpecialistBridge";
import type { ImobCaseContext } from "../services/imob/imobConversationContract";

function buildCaseContext(overrides: Partial<ImobCaseContext> = {}): ImobCaseContext {
  return {
    caseId: "case-1",
    flow: null,
    stage: "active",
    status: "open",
    nextStep: "seguir atendimento",
    blocker: null,
    pendingItems: [],
    updatedAt: new Date().toISOString(),
    canonical: {
      journeyType: "lead_qualification",
      recommendedActions: [],
      blockedActions: [],
      missingContext: [],
      reasonCodes: [],
    },
    humanWorkflow: {
      currentObjective: "seguir atendimento",
      waitingOn: "broker",
      urgency: "medium",
      agingHours: 12,
      followUpRisk: "medium",
      nextActionOwner: "Corretor",
      lastMeaningfulContactAt: null,
      doneDefinition: "prosseguir",
      likelyFailureMode: null,
    },
    ...overrides,
  };
}

test("IMOB backing specialists enrich proposal flow with commercial guidance", () => {
  const specialists = resolveImobBackingSpecialists(
    buildCaseContext({
      flow: "proposal.create",
      canonical: {
        journeyType: "proposal",
        recommendedActions: [],
        blockedActions: [],
        missingContext: [],
        reasonCodes: [],
      },
    }),
  );

  assert.equal(specialists[0]?.primaryAgentId, "I_BC");
  assert.equal(specialists[0]?.outputType, "advice");
  assert.match(specialists[0]?.suggestedAction ?? "", /proposta/i);
  assert.deepEqual(specialists[0]?.requiredContext, ["case.nextStep", "case.stage", "lead.context"]);
  assert.match(specialists[0]?.ownershipBoundary ?? "", /não assume ownership do caso/i);
});

test("IMOB backing specialists use daily ops as contextual fallback for actionable cases", () => {
  const specialists = resolveImobBackingSpecialists(
    buildCaseContext({
      canonical: {
        journeyType: "service",
        recommendedActions: [{ id: "1", label: "Retomar atendimento", actionType: "operational" }],
        blockedActions: [],
        missingContext: [],
        reasonCodes: [],
      },
      humanWorkflow: {
        currentObjective: "retomar caso",
        waitingOn: "broker",
        urgency: "medium",
        agingHours: 36,
        followUpRisk: "high",
        nextActionOwner: "Corretor",
        lastMeaningfulContactAt: null,
        doneDefinition: "retomado",
        likelyFailureMode: "caso pode esfriar",
      },
    }),
  );

  assert.equal(specialists[0]?.primaryAgentId, "Diarias");
  assert.equal(specialists[0]?.outputType, "operational_support");
  assert.equal(specialists[0]?.urgency, "high");
  assert.match(specialists[0]?.ownershipBoundary ?? "", /não assume ownership do caso/i);
});

test("IMOB backing specialists classify legal, financial and audit support by blocker", () => {
  const legal = resolveImobBackingSpecialists(
    buildCaseContext({
      flow: "documents.collect",
      pendingItems: ["matricula do imóvel"],
      canonical: {
        journeyType: "documentation",
        recommendedActions: [],
        blockedActions: [],
        missingContext: [],
        reasonCodes: [],
      },
    }),
  );
  assert.equal(legal[0]?.primaryAgentId, "J_360");
  assert.equal(legal[0]?.outputType, "validation");

  const financial = resolveImobBackingSpecialists(
    buildCaseContext({
      blocker: "repasse e comissão pendentes",
      canonical: {
        journeyType: "commission",
        recommendedActions: [],
        blockedActions: [],
        missingContext: [],
        reasonCodes: [],
      },
    }),
  );
  assert.equal(financial[0]?.primaryAgentId, "fin-nexus");
  assert.equal(financial[0]?.outputType, "financial_check");

  const audit = resolveImobBackingSpecialists(
    buildCaseContext({
      blocker: "receipt e verify pendentes",
      canonical: {
        journeyType: "contract",
        recommendedActions: [],
        blockedActions: [],
        missingContext: [],
        reasonCodes: [],
      },
    }),
  );
  const auditSpecialist = audit.find((item) => item.primaryAgentId === "guardian");
  assert.ok(auditSpecialist);
  assert.equal(auditSpecialist.outputType, "evidence");
  assert.match(auditSpecialist.suggestedAction ?? "", /bundle|receipt|evidências/i);
  assert.match(auditSpecialist.ownershipBoundary ?? "", /não assume ownership do caso/i);
});
