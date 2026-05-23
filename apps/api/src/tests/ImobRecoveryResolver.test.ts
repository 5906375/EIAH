import test from "node:test";
import assert from "node:assert/strict";

import type { ImobCaseContextV1 } from "../services/imob/crm/imobCaseContextContract";
import {
  matchImobRecoveryIntent,
  resolveImobRecoveryResponse,
  resolveImobRecoverySnapshot,
} from "../services/imob/orchestrator/imobRecoveryResolver";

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
      documentsReady: false,
      seasonalRulesReady: false,
      operationalReady: false,
    },
    blockers: [],
    ...overrides,
  };
}

test("recovery resolver matches canonical IMOB recovery intents", () => {
  assert.equal(matchImobRecoveryIntent("consultar caso"), "consult_case");
  assert.equal(matchImobRecoveryIntent("retomar esse caso"), "resume_case");
  assert.equal(matchImobRecoveryIntent("o que falta aqui?"), "what_is_missing");
  assert.equal(matchImobRecoveryIntent("qual próximo passo?"), "next_step");
});

test("recovery snapshot derives primary action from canonical nextAction", () => {
  const snapshot = resolveImobRecoverySnapshot(buildContext({
    missionContext: {
      mission: "qualify_lead",
      lockedUntilExplicitChange: false,
    },
    canonicalCaseState: {
      schemaVersion: 1,
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      caseId: "case-1",
      mission: "qualify_and_match_lead",
      missionStatus: "in_progress",
      currentStep: "gathering_signals",
      currentOperation: "lead",
      entities: {},
      readiness: {
        lead: "incomplete",
      },
      blockers: [],
      pendingFields: [{ field: "leadPhone", label: "telefone do lead" }],
      nextAction: {
        id: "ask-missing-lead-field",
        label: "Completar dados do lead",
        operation: "lead",
        targetAgent: "IMOB_LeadAgent",
        reasonCode: "LEAD_MISSING_REQUIRED_FIELD",
      },
      proof: {
        required: false,
        minimumProofSatisfied: true,
        missingProof: [],
      },
      audit: {
        version: 2,
        lastUpdatedAt: "2026-05-23T10:00:00.000Z",
        updatedByAgent: "IMOB",
      },
    },
  }));

  assert.equal(snapshot.stage, "lead_matching");
  assert.equal(snapshot.primaryAction?.operation, "lead.qualify");
  assert.equal(snapshot.primaryAction?.reasonCode, "LEAD_MISSING_REQUIRED_FIELD");
  assert.ok(snapshot.missingItems.includes("telefone do lead"));
});

test("recovery response for missing items never returns invalid path", () => {
  const context = buildContext({
    blockers: [
      { code: "owner_missing_or_incomplete", severity: "blocking", message: "Proprietário ainda não está completo." },
    ],
  });

  const response = resolveImobRecoveryResponse({
    context,
    intent: "what_is_missing",
  });

  assert.equal(response.reasonCode, "RECOVERY_MISSING_ITEMS_READY");
  assert.equal(response.primaryAction?.operation, "case.review");
  assert.match(response.summary, /faltam|pendências/i);
});
