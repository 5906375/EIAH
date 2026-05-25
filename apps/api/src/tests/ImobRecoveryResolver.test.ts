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

test("recovery response exposes operation-specific document checklist pending items", () => {
  const response = resolveImobRecoveryResponse({
    context: buildContext({
      missionContext: {
        mission: "collect_documents",
        lockedUntilExplicitChange: false,
      },
      documentChecklist: {
        operation: "locacao",
        requiredDocuments: [
          "cpf do proprietário",
          "matrícula ou escritura do imóvel",
          "comprovante de endereço do proprietário",
          "dados bancários do proprietário",
        ],
        collectedDocuments: ["cpf do proprietário"],
        pendingDocuments: [
          "matrícula ou escritura do imóvel",
          "comprovante de endereço do proprietário",
          "dados bancários do proprietário",
        ],
        blockingIssues: [
          "Falta matrícula ou escritura do imóvel.",
          "Falta comprovante de endereço do proprietário.",
          "Falta dados bancários do proprietário.",
        ],
        summary: "Checklist documental de locacao ainda está incompleto.",
        recommendedNextMove: "Completar matrícula ou escritura, comprovante de endereço e dados bancários antes de avançar.",
      },
      canonicalCaseState: {
        schemaVersion: 1,
        tenantId: "tenant-A",
        workspaceId: "workspace-A",
        caseId: "case-1",
        mission: "collect_documents",
        missionStatus: "in_progress",
        currentStep: "checking_document_sufficiency",
        currentOperation: "documents",
        entities: {},
        readiness: {
          documents: "incomplete",
          proof: "not_applicable",
        },
        blockers: [],
        pendingFields: [],
        nextAction: {
          id: "complete-document-checklist",
          label: "Completar checklist documental de locação",
          operation: "documents",
          targetAgent: "IMOB_DocumentAgent",
          reasonCode: "DOCUMENT_CHECKLIST_REQUIRED",
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
        propertyReady: false,
        leadReady: false,
        leadReadinessScore: null,
        documentsReady: false,
        seasonalRulesReady: false,
        operationalReady: false,
      },
      blockers: [
        { code: "document_checklist_matricula_ou_escritura_do_imovel", severity: "warning", message: "Checklist documental de locacao ainda pede matrícula ou escritura do imóvel." },
      ],
    }),
    intent: "what_is_missing",
  });

  assert.equal(response.primaryAction?.reasonCode, "DOCUMENT_CHECKLIST_REQUIRED");
  assert.ok(response.missingItems.some((item) => /matrícula|escritura/i.test(item)));
  assert.match(response.summary, /checklist documental de locacao/i);
});

test("recovery response explains legal handoff once document sufficiency is satisfied", () => {
  const response = resolveImobRecoveryResponse({
    context: buildContext({
      missionContext: {
        mission: "prepare_contract",
        lockedUntilExplicitChange: false,
      },
      documentSufficiency: {
        packageStatus: "ready",
        proofStatus: "ready",
        handoffTarget: "LEGAL",
        legalHandoffStatus: "pending",
        summary: "Pacote documental suficiente; caso pronto para handoff jurídico.",
        recommendedNextMove: "Encaminhar o caso para validação jurídica.",
      },
      readiness: {
        ownerReady: false,
        propertyReady: false,
        leadReady: false,
        leadReadinessScore: null,
        documentsReady: true,
        seasonalRulesReady: false,
        operationalReady: false,
      },
      canonicalCaseState: {
        schemaVersion: 1,
        tenantId: "tenant-A",
        workspaceId: "workspace-A",
        caseId: "case-1",
        mission: "prepare_contract",
        missionStatus: "in_progress",
        currentStep: "legal_handoff",
        currentOperation: "contract",
        entities: {
          documentPackageId: "document-package:property-1",
        },
        readiness: {
          documents: "ready",
          proof: "ready",
        },
        blockers: [],
        pendingFields: [],
        nextAction: {
          id: "legal-handoff",
          label: "Encaminhar para jurídico",
          operation: "contract",
          targetAgent: "IMOB_DocumentAgent",
          reasonCode: "LEGAL_HANDOFF_REQUIRED",
        },
        proof: {
          required: true,
          minimumProofSatisfied: true,
          missingProof: [],
        },
        audit: {
          version: 1,
          lastUpdatedAt: "2026-05-25T10:00:00.000Z",
          updatedByAgent: "IMOB",
        },
      },
    }),
    intent: "next_step",
  });

  assert.equal(response.primaryAction?.reasonCode, "LEGAL_HANDOFF_REQUIRED");
  assert.match(response.summary, /jurídico/i);
  assert.match(response.summary, /pacote documental suficiente/i);
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

test("recovery response explains why a visit is the next step for a ready lead with compatible property", () => {
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
          id: "schedule-visit-for-matched-lead",
          label: "Avançar para visita",
          operation: "visit",
          targetAgent: "IMOB_VisitAgent",
          reasonCode: "VISIT_REQUIRED",
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

  assert.equal(response.primaryAction?.reasonCode, "VISIT_REQUIRED");
  assert.equal(response.primaryAction?.operation, "visit.schedule");
  assert.match(response.summary, /Rua 700, 10/i);
  assert.match(response.summary, /cidade e objetivo/i);
});

test("recovery response points to proposal preparation after a scheduled visit", () => {
  const response = resolveImobRecoveryResponse({
    intent: "next_step",
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
      canonicalCaseState: {
        schemaVersion: 1,
        tenantId: "tenant-A",
        workspaceId: "workspace-A",
        caseId: "case-1",
        mission: "schedule_and_follow_visit",
        missionStatus: "ready_for_transition",
        currentStep: "scheduled",
        currentOperation: "visit",
        entities: {
          leadId: "lead-1",
          propertyId: "property-1",
          visitId: "visit-1",
        },
        readiness: {
          lead: "ready",
          property: "ready",
          visit: "ready",
          proof: "not_applicable",
        },
        blockers: [],
        pendingFields: [],
        nextAction: {
          id: "prepare-proposal",
          label: "Preparar proposta",
          operation: "lead",
          targetAgent: "IMOB_LeadAgent",
          reasonCode: "PROPOSAL_REQUIRED",
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

  assert.equal(response.primaryAction?.reasonCode, "PROPOSAL_REQUIRED");
  assert.equal(response.primaryAction?.operation, "proposal.create");
  assert.match(response.summary, /preparar proposta/i);
});

test("recovery response preserves disqualification reason without reopening resolved lead fields", () => {
  const response = resolveImobRecoveryResponse({
    intent: "consult_case",
    context: buildContext({
      missionContext: {
        mission: "qualify_lead",
        lockedUntilExplicitChange: false,
      },
      entities: {
        lead: { id: "lead-1", name: "Maria", desiredGoal: "locacao", desiredCity: "Itapema" },
      },
      leadLifecycle: {
        status: "disqualified",
        reason: "orcamento fora da faixa",
        nextTrigger: null,
        summary: "Lead desqualificado por orcamento fora da faixa.",
      },
      canonicalCaseState: {
        schemaVersion: 1,
        tenantId: "tenant-A",
        workspaceId: "workspace-A",
        caseId: "case-1",
        mission: "qualify_and_match_lead",
        missionStatus: "in_progress",
        currentStep: "disqualified",
        currentOperation: "lead",
        entities: {
          leadId: "lead-1",
        },
        readiness: {
          lead: "blocked",
          proof: "not_applicable",
        },
        blockers: [],
        pendingFields: [],
        nextAction: {
          id: "review-disqualified-lead",
          label: "Revisar desqualificação do lead",
          operation: "lead",
          targetAgent: "IMOB_LeadAgent",
          reasonCode: "LEAD_DISQUALIFIED",
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
        propertyReady: false,
        leadReady: true,
        leadReadinessScore: 82,
        documentsReady: false,
        seasonalRulesReady: false,
        operationalReady: false,
      },
    }),
  });

  assert.equal(response.primaryAction?.reasonCode, "LEAD_DISQUALIFIED");
  assert.match(response.summary, /orcamento fora da faixa/i);
  assert.doesNotMatch(response.summary, /leadPhone|budgetMax|desiredCity/i);
});

test("recovery response explains market scan recommendation for capture flow", () => {
  const response = resolveImobRecoveryResponse({
    intent: "next_step",
    context: buildContext({
      missionContext: {
        mission: "capture_sale_property",
        lockedUntilExplicitChange: false,
      },
      marketScanRecommendation: {
        sourceStatus: "completed",
        recommendedAction: "captar",
        comparableCount: 3,
        confidenceScore: 0.78,
        liquiditySignal: "high",
        pricingRisk: "low",
        priceRange: { min: 640000, max: 690000, currency: "BRL" },
        summary: "O scan encontrou base suficiente para seguir com captação, com 3 comparável(is) útil(is).",
        reasonCodes: ["MARKET_SCAN_ACTION_CAPTAR"],
        recommendedNextMove: "Preparar draft de captação e submeter para aprovação humana.",
      },
      canonicalCaseState: {
        schemaVersion: 1,
        tenantId: "tenant-A",
        workspaceId: "workspace-A",
        caseId: "case-1",
        mission: "capture_sale_property",
        missionStatus: "in_progress",
        currentStep: "registering_property",
        currentOperation: "market",
        entities: {},
        readiness: {
          owner: "incomplete",
          property: "incomplete",
          proof: "not_applicable",
        },
        blockers: [],
        pendingFields: [],
        nextAction: {
          id: "capture-from-market-scan",
          label: "Seguir com captação",
          operation: "property",
          targetAgent: "IMOB_PropertyAgent",
          reasonCode: "MARKET_SCAN_CAPTURE_RECOMMENDED",
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
        propertyReady: false,
        leadReady: false,
        leadReadinessScore: null,
        documentsReady: false,
        seasonalRulesReady: false,
        operationalReady: false,
      },
    }),
  });

  assert.equal(response.primaryAction?.reasonCode, "MARKET_SCAN_CAPTURE_RECOMMENDED");
  assert.equal(response.primaryAction?.operation, "property.create");
  assert.equal(response.primaryAction?.label, "Seguir com captação");
  assert.equal(response.primaryAction?.nextMessage, "confirmar captação do scan");
  assert.match(response.summary, /seguir com captação/i);
  assert.match(response.summary, /base suficiente/i);
});

test("recovery response for market scan capture does not treat recommendation as fake missing item", () => {
  const response = resolveImobRecoveryResponse({
    intent: "what_is_missing",
    context: buildContext({
      missionContext: {
        mission: "capture_sale_property",
        lockedUntilExplicitChange: false,
      },
      marketScanRecommendation: {
        sourceStatus: "completed",
        recommendedAction: "captar",
        comparableCount: 3,
        confidenceScore: 0.78,
        confidenceBand: "high",
        comparableSources: [{ providerId: "internal_crm", source: "internal_crm", count: 3 }],
        liquiditySignal: "high",
        pricingRisk: "low",
        priceRange: { min: 640000, max: 690000, currency: "BRL" },
        summary: "O scan encontrou base suficiente para seguir com captação, com 3 comparável(is) útil(is).",
        reasonCodes: ["MARKET_SCAN_ACTION_CAPTAR"],
        recommendedNextMove: "Preparar draft de captação e submeter para aprovação humana.",
      },
      blockers: [
        {
          code: "market_scan_captar",
          severity: "warning",
          message: "Scan recomenda seguir com captação: Preparar draft de captação e submeter para aprovação humana.",
        },
      ],
      canonicalCaseState: {
        schemaVersion: 1,
        tenantId: "tenant-A",
        workspaceId: "workspace-A",
        caseId: "case-1",
        mission: "capture_sale_property",
        missionStatus: "in_progress",
        currentStep: "market_scan_review",
        currentOperation: "market",
        entities: {},
        readiness: {
          owner: "incomplete",
          property: "incomplete",
          proof: "not_applicable",
        },
        blockers: [],
        pendingFields: [],
        nextAction: {
          id: "capture-from-market-scan",
          label: "Seguir com captação",
          operation: "property",
          targetAgent: "IMOB_PropertyAgent",
          reasonCode: "MARKET_SCAN_CAPTURE_RECOMMENDED",
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
        propertyReady: false,
        leadReady: false,
        leadReadinessScore: null,
        documentsReady: false,
        seasonalRulesReady: false,
        operationalReady: false,
      },
    }),
  });

  assert.equal(response.missingItems.length, 0);
  assert.equal(response.primaryAction?.label, "Seguir com captação");
  assert.match(response.summary, /não há pendências explícitas/i);
});

test("recovery response turns market scan document recommendation into real missing item", () => {
  const response = resolveImobRecoveryResponse({
    intent: "what_is_missing",
    context: buildContext({
      missionContext: {
        mission: "capture_sale_property",
        lockedUntilExplicitChange: false,
      },
      marketScanRecommendation: {
        sourceStatus: "completed",
        recommendedAction: "pedir_documento",
        comparableCount: 0,
        confidenceScore: 0.34,
        confidenceBand: "low",
        comparableSources: [],
        liquiditySignal: "unknown",
        pricingRisk: "unknown",
        priceRange: null,
        summary: "O scan recomenda pedir documentação ou evidência adicional antes de avançar.",
        reasonCodes: ["MARKET_SCAN_ACTION_PEDIR_DOCUMENTO"],
        recommendedNextMove: "Pedir documentação pendente antes de avançar.",
      },
      blockers: [
        {
          code: "market_scan_pedir_documento",
          severity: "warning",
          message: "Scan recomenda pedir documento: Pedir documentação pendente antes de avançar.",
        },
      ],
      canonicalCaseState: {
        schemaVersion: 1,
        tenantId: "tenant-A",
        workspaceId: "workspace-A",
        caseId: "case-1",
        mission: "capture_sale_property",
        missionStatus: "in_progress",
        currentStep: "market_scan_review",
        currentOperation: "market",
        entities: {},
        readiness: {
          owner: "incomplete",
          property: "incomplete",
          proof: "not_applicable",
        },
        blockers: [],
        pendingFields: [],
        nextAction: {
          id: "request-market-scan-document",
          label: "Pedir documentação",
          operation: "documents",
          targetAgent: "IMOB_DocumentAgent",
          reasonCode: "MARKET_SCAN_DOCUMENT_REQUIRED",
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
        propertyReady: false,
        leadReady: false,
        leadReadinessScore: null,
        documentsReady: false,
        seasonalRulesReady: false,
        operationalReady: false,
      },
    }),
  });

  assert.equal(response.primaryAction?.operation, "documents.collect");
  assert.ok(response.missingItems.some((item) => /documentação|evidência adicional/i.test(item)));
  assert.match(response.summary, /documentação|evidência adicional/i);
});
test("recovery response suggests reengagement when a disqualified lead already has a return trigger", () => {
  const response = resolveImobRecoveryResponse({
    intent: "next_step",
    context: buildContext({
      missionContext: {
        mission: "qualify_lead",
        lockedUntilExplicitChange: false,
      },
      entities: {
        lead: { id: "lead-1", name: "Maria", desiredGoal: "locacao", desiredCity: "Itapema" },
      },
      leadLifecycle: {
        status: "reengagement_ready",
        reason: "janela de decisão futura",
        nextTrigger: "decision_window",
        summary: "Lead desqualificado por janela de decisão futura e já com gatilho de retomada decision_window.",
      },
      canonicalCaseState: {
        schemaVersion: 1,
        tenantId: "tenant-A",
        workspaceId: "workspace-A",
        caseId: "case-1",
        mission: "qualify_and_match_lead",
        missionStatus: "in_progress",
        currentStep: "disqualified",
        currentOperation: "lead",
        entities: {
          leadId: "lead-1",
        },
        readiness: {
          lead: "blocked",
          proof: "not_applicable",
        },
        blockers: [],
        pendingFields: [],
        nextAction: {
          id: "reengage-disqualified-lead",
          label: "Retomar lead",
          operation: "lead",
          targetAgent: "IMOB_LeadAgent",
          reasonCode: "LEAD_REENGAGEMENT_REQUIRED",
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
        propertyReady: false,
        leadReady: true,
        leadReadinessScore: 82,
        documentsReady: false,
        seasonalRulesReady: false,
        operationalReady: false,
      },
    }),
  });

  assert.equal(response.primaryAction?.reasonCode, "LEAD_REENGAGEMENT_REQUIRED");
  assert.match(response.summary, /decision_window/i);
  assert.match(response.summary, /retomar lead/i);
});
