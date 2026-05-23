import test from "node:test";
import assert from "node:assert/strict";

import { buildImobCaseContextV1 } from "../services/imob/crm/imobCaseContextBuilder";
import {
  matchImobRecoveryIntent,
  resolveImobRecoveryResponse,
} from "../services/imob/orchestrator/imobRecoveryResolver";

function buildBlockedReviewCase() {
  return buildImobCaseContextV1({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    caseId: "case-1",
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
      missionContext: {
        mission: "case_review",
      },
      flow: "property.create",
    },
  });
}

test("recovery E2E answers consult, resume, missing-items and next-step from the same canonical blocked case", () => {
  const context = buildBlockedReviewCase();
  const intents = [
    "consultar caso",
    "retomar esse caso",
    "o que falta aqui?",
    "qual próximo passo?",
  ] as const;

  for (const message of intents) {
    const intent = matchImobRecoveryIntent(message);
    assert.ok(intent);

    const response = resolveImobRecoveryResponse({
      context,
      intent,
    });

    assert.equal(response.primaryAction?.operation, "property.link_owner");
    assert.equal(response.safeFallbackAction.operation, "case.review");
    assert.notEqual(response.reasonCode, "RECOVERY_NEXT_STEP_UNRESOLVED");
  }
});

test("recovery E2E never drops to an invalid path when the case is blocked by missing owner-property link", () => {
  const context = buildBlockedReviewCase();
  const response = resolveImobRecoveryResponse({
    context,
    intent: "what_is_missing",
  });

  assert.equal(response.reasonCode, "RECOVERY_MISSING_ITEMS_READY");
  assert.match(response.summary, /faltam|pendências/i);
  assert.ok(response.missingItems.some((item) => /vinculad/i.test(item)));
  assert.equal(response.primaryAction?.operation, "property.link_owner");
  assert.equal(response.safeFallbackAction.operation, "case.review");
});

