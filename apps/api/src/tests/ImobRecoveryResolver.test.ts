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

test("recovery response prioritizes owner follow-up after market-scan conversion instead of stale scan blocker", () => {
  const context = buildContext({
    missionContext: {
      mission: "capture_sale_property",
      lockedUntilExplicitChange: true,
    },
    entities: {
      property: {
        id: "property-1",
        propertyType: "apartamento",
        goal: "venda",
        city: "Itapema",
        address: "Rua Batch 101",
      },
    },
    readiness: {
      ownerReady: false,
      propertyReady: true,
      documentsReady: false,
      seasonalRulesReady: false,
      operationalReady: false,
    },
    blockers: [
      { code: "owner_missing_or_incomplete", severity: "blocking", message: "Proprietário ainda não está completo." },
    ],
    canonicalCaseState: {
      schemaVersion: 1,
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      caseId: "case-1",
      mission: "capture_sale_property",
      missionStatus: "blocked",
      currentStep: "collecting_owner",
      currentOperation: "owner",
      entities: {
        propertyId: "property-1",
      },
      readiness: {
        owner: "incomplete",
        property: "ready",
        proof: "not_applicable",
      },
      blockers: [
        { code: "owner_missing_or_incomplete", message: "Proprietário ainda não está completo." },
      ],
      pendingFields: [],
      nextAction: {
        id: "create-owner",
        label: "Cadastrar proprietário",
        operation: "owner",
        targetAgent: "IMOB_OwnerAgent",
        reasonCode: "OWNER_REQUIRED_FOR_CAPTURE",
      },
      proof: {
        required: false,
        minimumProofSatisfied: true,
        missingProof: [],
      },
      audit: {
        version: 1,
        lastUpdatedAt: "2026-05-23T10:00:00.000Z",
        updatedByAgent: "IMOB",
      },
    },
  });

  const response = resolveImobRecoveryResponse({
    context,
    intent: "what_is_missing",
  });

  assert.equal(response.primaryAction?.operation, "owner.create");
  assert.match(response.summary, /proprietário/i);
  assert.equal(response.missingItems.some((item) => /multiplas cidades|múltiplas cidades/i.test(item)), false);
});

test("recovery snapshot exposes lead readiness blockers before matching handoff", () => {
  const snapshot = resolveImobRecoverySnapshot(buildContext({
    missionContext: {
      mission: "qualify_lead",
      lockedUntilExplicitChange: false,
    },
    entities: {
      lead: {
        id: "lead-1",
        name: "Maria",
        desiredGoal: "locacao",
        desiredCity: "Itapema",
        readinessScore: 60,
        readinessBand: "WARM",
      },
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
    blockers: [
      {
        code: "lead_readiness_below_threshold",
        severity: "warning",
        message: "O lead já está completo, mas ainda precisa consolidar readiness comercial antes do próximo handoff.",
      },
    ],
    canonicalCaseState: {
      schemaVersion: 1,
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      caseId: "case-1",
      mission: "qualify_and_match_lead",
      missionStatus: "in_progress",
      currentStep: "matching_inventory",
      currentOperation: "lead",
      entities: {
        leadId: "lead-1",
      },
      readiness: {
        lead: "blocked",
        proof: "not_applicable",
      },
      blockers: [
        {
          code: "lead_readiness_below_threshold",
          message: "O lead já está completo, mas ainda precisa consolidar readiness comercial antes do próximo handoff.",
        },
      ],
      pendingFields: [],
      nextAction: {
        id: "review-lead-readiness",
        label: "Consolidar readiness do lead",
        operation: "lead",
        targetAgent: "IMOB_LeadAgent",
        reasonCode: "LEAD_READINESS_REVIEW_REQUIRED",
      },
      proof: {
        required: false,
        minimumProofSatisfied: true,
        missingProof: [],
      },
      audit: {
        version: 1,
        lastUpdatedAt: "2026-05-25T10:00:00.000Z",
        updatedByAgent: "IMOB",
      },
    },
  }));

  assert.equal(snapshot.primaryAction?.operation, "lead.qualify");
  assert.equal(snapshot.primaryAction?.reasonCode, "LEAD_READINESS_REVIEW_REQUIRED");
  assert.ok(snapshot.missingItems.some((item) => /readiness comercial/i.test(item)));
});

test("recovery response explains why a property match is suggested for a ready lead", () => {
  const response = resolveImobRecoveryResponse({
    intent: "next_step",
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
      canonicalCaseState: {
        schemaVersion: 1,
        tenantId: "tenant-A",
        workspaceId: "workspace-A",
        caseId: "case-1",
        mission: "qualify_and_match_lead",
        missionStatus: "ready_for_transition",
        currentStep: "matching_inventory",
        currentOperation: "lead",
        entities: {
          leadId: "lead-1",
          propertyId: "property-1",
        },
        readiness: {
          lead: "ready",
          property: "ready",
          proof: "not_applicable",
        },
        blockers: [],
        pendingFields: [],
        nextAction: {
          id: "link-lead-to-suggested-property",
          label: "Vincular lead ao imóvel compatível",
          operation: "lead",
          targetAgent: "IMOB_LeadAgent",
          reasonCode: "LEAD_PROPERTY_MATCH_SUGGESTED",
        },
        proof: {
          required: false,
          minimumProofSatisfied: true,
          missingProof: [],
        },
        audit: {
          version: 1,
          lastUpdatedAt: "2026-05-25T10:00:00.000Z",
          updatedByAgent: "IMOB",
        },
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
  });

  assert.equal(response.primaryAction?.reasonCode, "LEAD_PROPERTY_MATCH_SUGGESTED");
  assert.match(response.summary, /Rua 700, 10/i);
  assert.match(response.summary, /cidade e objetivo/i);
});
