import test from "node:test";
import assert from "node:assert/strict";

import { buildImobCrmCaseContextFromRecord } from "../services/imob/crm/imobCrmCaseContext";

test("IMOB CRM case context adds human journey and workflow metadata", () => {
  const now = new Date(Date.now() - 52 * 36e5);
  const context = buildImobCrmCaseContextFromRecord(
    {
      id: "case-1",
      flow: "proposal.create",
      stage: "pending_data",
      status: "blocked",
      ownerResponsible: "Corretor",
      nextStep: "coletar dados do comprador",
      blockers: ["document_packet_pending"],
      pendingItems: ["documento do comprador"],
      threadId: "thread-1",
      updatedAt: now,
      lead: { id: "lead-1", name: "Maria" },
    },
    () => ({
      journeyType: "proposal",
      recommendedActions: [
        {
          id: "proposal-follow-up",
          label: "Retomar proposta",
          actionType: "operational",
        },
      ],
      blockedActions: ["document_packet_pending"],
      missingContext: ["documento do comprador"],
      reasonCodes: ["BLOCKERS_PRESENT"],
    }),
  );

  assert.equal(context.humanJourney?.phase, "proposta");
  assert.match(context.humanJourney?.phaseObjective ?? "", /proposta viável/i);

  assert.equal(context.humanWorkflow?.waitingOn, "legal");
  assert.equal(context.humanWorkflow?.urgency, "high");
  assert.equal(context.humanWorkflow?.followUpRisk, "high");
  assert.equal(context.humanWorkflow?.nextActionOwner, "Corretor");
  assert.match(context.humanWorkflow?.doneDefinition ?? "", /proposta/i);
});
