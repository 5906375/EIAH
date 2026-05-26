import test from "node:test";
import assert from "node:assert/strict";

import { buildImobCaseContextV1 } from "../services/imob/crm/imobCaseContextBuilder";

test("IMOB case context v1 builds canonical seasonal capture context from legacy case and operational state", () => {
  const context = buildImobCaseContextV1({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    caseId: "case-1",
    message: "quero cadastrar um proprietário para imóvel de temporada",
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
      flow: "property.create",
      propertyDraft: {
        propertyType: "kitnet",
        goal: "aluguel_por_temporada",
        city: "Balneário Camboriú",
        address: "Rua Alvin Bauer, 783 apto 101",
      },
    },
  });

  assert.equal(context.version, "1.0");
  assert.equal(context.missionContext?.mission, "capture_seasonal_property");
  assert.equal(context.missionContext?.defaultGoal, "aluguel_por_temporada");
  assert.equal(context.missionContext?.lockedUntilExplicitChange, true);
  assert.equal(context.readiness.ownerReady, true);
  assert.equal(context.readiness.propertyReady, true);
  assert.equal(context.links.ownerProperty?.status, "missing");
  assert.equal(context.legacyCompatibility?.migratedFromLegacy, true);
  assert.equal(context.canonicalCaseState?.currentStep, "owner_property_linking");
  assert.equal(context.recoverySnapshot?.primaryAction?.operation, "property.link_owner");
  assert.equal(context.crmProjection?.caseCard.ownerAgent, "IMOB_Orchestrator");
  assert.equal(context.crmProjection?.caseCard.targetAgent, "IMOB_PropertyAgent");
  assert.ok(context.blockers.some((blocker) => blocker.code === "owner_property_not_linked"));
});

test("IMOB case context v1 marks owner-property link as linked when property already carries owner", () => {
  const context = buildImobCaseContextV1({
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
        ownerId: "owner-1",
      },
    },
    operational: { flow: "property.create" },
  });

  assert.equal(context.links.ownerProperty?.status, "linked");
  assert.equal(context.readiness.ownerReady, true);
  assert.equal(context.readiness.propertyReady, true);
  assert.equal(context.canonicalCaseState?.currentStep, "verifying_docs");
  assert.equal(context.recoverySnapshot?.primaryAction?.operation, "documents.collect");
  assert.equal(context.crmProjection?.caseCard.currentOperation, "property");
  assert.equal(context.blockers.some((blocker) => blocker.code === "owner_property_not_linked"), false);
});

test("IMOB case context v1 builds a sale document checklist with explicit pending documents", () => {
  const context = buildImobCaseContextV1({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    caseId: "case-doc-1",
    caseContext: {
      caseId: "case-doc-1",
      flow: "documents.collect",
      property: {
        id: "property-1",
        propertyType: "apartamento",
        goal: "venda",
        city: "Itapema",
        address: "Rua 10, 100",
        ownerId: "owner-1",
      },
      owner: {
        id: "owner-1",
        name: "Carlos Alberto",
        document: "12345678900",
      },
    },
    operational: {
      flow: "documents.collect",
      documentDraft: {
        referenceId: "property-1",
        subjectType: "owner",
        documentTypes: ["cpf"],
        deliveryChannel: "upload",
      },
    },
  });

  assert.equal(context.documentChecklist?.operation, "venda");
  assert.deepEqual(context.documentChecklist?.collectedDocuments, ["cpf do proprietário"]);
  assert.ok(context.documentChecklist?.pendingDocuments.includes("matrícula ou escritura do imóvel"));
  assert.ok(context.documentChecklist?.pendingDocuments.includes("comprovante de endereço do proprietário"));
  assert.equal(context.readiness.documentsReady, false);
});

test("IMOB case context v1 derives document sufficiency for legal handoff when the packet is ready", () => {
  const context = buildImobCaseContextV1({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    caseId: "case-contract-1",
    caseContext: {
      caseId: "case-contract-1",
      flow: "contract.prepare",
    },
    operational: {
      flow: "contract.prepare",
      contractDraft: {
        propertyId: "property-1",
        counterpartyName: "Maria",
        contractType: "sale",
        documentPacketStatus: "ready",
        handoffTarget: "LEGAL",
        approvalRequired: true,
      },
    },
  });

  assert.equal(context.documentSufficiency?.packageStatus, "ready");
  assert.equal(context.documentSufficiency?.proofStatus, "ready");
  assert.equal(context.documentSufficiency?.handoffTarget, "LEGAL");
  assert.equal(context.documentSufficiency?.legalHandoffStatus, "pending");
});

test("IMOB case context v1 exposes canonical evidence snapshot when mission proof is still pending", () => {
  const context = buildImobCaseContextV1({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    caseId: "case-proof-1",
    caseContext: {
      caseId: "case-proof-1",
      flow: "contract.prepare",
      proof: {
        required: true,
        ready: false,
        state: "pending",
        receiptPath: "/receipts/contract-case-1.json",
      },
    },
    operational: {
      flow: "contract.prepare",
      contractDraft: {
        propertyId: "property-1",
        counterpartyName: "Maria",
        contractType: "sale",
        documentPacketStatus: "pending",
        handoffTarget: "LEGAL",
        approvalRequired: true,
      },
    },
  });

  assert.equal(context.evidence?.mission, "prepare_contract");
  assert.equal(context.evidence?.required, true);
  assert.equal(context.evidence?.status, "missing");
  assert.equal(context.evidence?.minimumProofSatisfied, false);
  assert.deepEqual(context.evidence?.missingProof, ["pacote documental mínimo"]);
  assert.equal(context.evidence?.receiptId, "/receipts/contract-case-1.json");
  assert.match(context.evidence?.summary ?? "", /proof mínima ainda pendente/i);
});

test("IMOB case context v1 exposes canonical dedupe snapshot for pending owner review", () => {
  const context = buildImobCaseContextV1({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    caseId: "case-dedupe-1",
    caseContext: {
      caseId: "case-dedupe-1",
      flow: "owner.dedupe_review",
    },
    operational: {
      flow: "owner.dedupe_review",
      dedupeDecision: {
        status: "pending",
        flow: "owner.create",
        entityType: "owner",
        entityId: "owner-1",
        entityLabel: "Carlos Alberto",
      },
    },
  });

  assert.equal(context.dedupe?.entity, "owner");
  assert.equal(context.dedupe?.status, "pending_review");
  assert.equal(context.dedupe?.matchedEntityId, "owner-1");
  assert.ok(context.blockers.some((blocker) => blocker.code === "dedupe_pending"));
});

test("IMOB case context v1 drops stale market-scan blocker after property conversion and keeps owner follow-up as the real blocker", () => {
  const context = buildImobCaseContextV1({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    caseId: "case-1",
    caseContext: {
      caseId: "case-1",
      flow: "property.create",
      blocker: "Múltiplas cidades ou finalidades impedem um único cadastro automático do imóvel.",
      property: {
        id: "property-1",
        propertyType: "apartamento",
        goal: "venda",
        city: "Itapema",
        address: "Rua Batch 101",
      },
    },
    operational: {
      flow: "property.create",
      propertyDraft: {
        propertyType: "apartamento",
        goal: "venda",
        city: "Itapema",
        address: "Rua Batch 101",
      },
    },
  });

  assert.equal(
    context.blockers.some((blocker) => /múltiplas cidades|multiplas cidades/i.test(blocker.message)),
    false,
  );
  assert.ok(context.blockers.some((blocker) => blocker.code === "owner_missing_or_incomplete"));
  assert.equal(context.recoverySnapshot?.primaryAction?.operation, "owner.create");
});

test("IMOB case context v1 derives lead readiness base and blocks weak handoff", () => {
  const context = buildImobCaseContextV1({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    caseId: "case-1",
    message: "qualificar lead Maria para locação em Itapema",
    caseContext: {
      caseId: "case-1",
      flow: "lead.qualify",
      lead: {
        id: "lead-1",
        name: "Maria",
        goal: "locacao",
        targetCity: "Itapema",
        budgetMaxCents: 350000,
        discoverySignals: {
          urgency: "medium",
          painPoint: null,
          motivation: null,
          budgetFlexibility: null,
          decisionMaker: null,
          timeline: null,
          pendingSignals: ["painPoint", "motivation", "budgetFlexibility", "decisionMaker", "timeline"],
        },
      },
    },
    operational: {
      flow: "lead.qualify",
      leadDraft: {
        leadName: "Maria",
        desiredGoal: "locacao",
        desiredCity: "Itapema",
        budgetMax: 3500,
        leadPhone: "47999998888",
      },
    },
  });

  assert.equal(context.readiness.leadReady, true);
  assert.equal(context.readiness.leadReadinessScore, 65);
  assert.equal(context.entities.lead?.readinessBand, "WARM");
  assert.ok(context.blockers.some((blocker) => blocker.code === "lead_readiness_below_threshold"));
  assert.equal(context.canonicalCaseState?.nextAction.reasonCode, "LEAD_READINESS_REVIEW_REQUIRED");
});

test("IMOB case context v1 promotes a ready lead with compatible property into visit scheduling without inventing inventory", () => {
  const context = buildImobCaseContextV1({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    caseId: "case-1",
    message: "qualificar lead Maria para locação em Itapema",
    caseContext: {
      caseId: "case-1",
      flow: "lead.qualify",
      property: {
        id: "property-1",
        propertyType: "apartamento",
        goal: "locacao",
        city: "Itapema",
        address: "Rua 700, 10",
      },
      lead: {
        id: "lead-1",
        name: "Maria",
        goal: "locacao",
        targetCity: "Itapema",
        budgetMaxCents: 350000,
        discoverySignals: {
          urgency: "high",
          painPoint: "mudança urgente",
          motivation: "trabalho",
          budgetFlexibility: "medium",
          decisionMaker: "self",
          timeline: "30d",
        },
      },
    },
    operational: {
      flow: "lead.qualify",
      leadDraft: {
        leadName: "Maria",
        desiredGoal: "locacao",
        desiredCity: "Itapema",
        budgetMax: 3500,
        leadPhone: "47999998888",
      },
    },
  });

  assert.equal(context.readiness.leadReady, true);
  assert.equal(context.readiness.leadReadinessScore, 90);
  assert.equal(context.leadMatching?.status, "suggested");
  assert.equal(context.leadMatching?.propertyId, "property-1");
  assert.match(context.leadMatching?.summary ?? "", /cidade e objetivo/i);
  assert.equal(context.canonicalCaseState?.currentStep, "ready_for_visit");
  assert.equal(context.canonicalCaseState?.nextAction.reasonCode, "VISIT_REQUIRED");
  assert.equal(context.recoverySnapshot?.primaryAction?.operation, "visit.schedule");
});

test("IMOB case context v1 preserves market scan recommendation and suppresses premature owner/property blockers during scan", () => {
  const context = buildImobCaseContextV1({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    caseId: "case-scan-1",
    message: "fazer varredura de mercado em Itajai para apartamentos de 2 quartos para venda",
    operational: {
      flow: "property.market_scan",
      missionContext: {
        mission: "capture_sale_property",
        lockedUntilExplicitChange: false,
      },
      marketScanSnapshot: {
        scanId: "scan-1",
        providerId: "internal_crm",
        sourceStatus: "completed",
        totalItems: 4,
        readOnly: true,
        generatedAt: "2026-05-25T12:00:00.000Z",
        intelligence: {
          comparableCount: 3,
          comparableSources: [
            { providerId: "internal_crm", source: "internal_crm", count: 3 },
          ],
          priceRange: { min: 640000, max: 690000, currency: "BRL" },
          liquidityScore: 0.72,
          pricingRisk: "low",
          sourceCoverageScore: 0.88,
          confidenceScore: 0.78,
          confidenceBand: "high",
        },
        groups: [],
      },
      marketScanOpportunity: {
        opportunityId: "opp-1",
        recommendedAction: "captar",
        confidenceScore: 0.78,
        sourceCoverageScore: 0.88,
        liquidityScore: 0.72,
        pricingRisk: "low",
        priceRange: { min: 640000, max: 690000, currency: "BRL" },
        nextStep: "Preparar draft de captação e submeter para aprovação humana.",
        requiresHumanApproval: true,
        evidenceBundleId: "ev-1",
      },
    },
  });

  assert.equal(context.marketScanRecommendation?.recommendedAction, "captar");
  assert.equal(context.marketScanRecommendation?.comparableCount, 3);
  assert.deepEqual(context.marketScanRecommendation?.comparableSources, [
    { providerId: "internal_crm", source: "internal_crm", count: 3 },
  ]);
  assert.equal(context.marketScanRecommendation?.confidenceBand, "high");
  assert.equal(context.marketScanRecommendation?.liquiditySignal, "high");
  assert.equal(context.canonicalCaseState?.nextAction.reasonCode, "MARKET_SCAN_CAPTURE_RECOMMENDED");
  assert.equal(context.recoverySnapshot?.primaryAction?.operation, "property.create");
  assert.equal(context.blockers.some((blocker) => blocker.code === "owner_missing_or_incomplete"), false);
  assert.equal(context.blockers.some((blocker) => blocker.code === "property_missing_or_incomplete"), false);
  assert.ok(context.blockers.some((blocker) => blocker.code === "market_scan_captar"));
});
test("IMOB case context v1 keeps scheduled visit in post-visit review until the outcome is explicit", () => {
  const context = buildImobCaseContextV1({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    caseId: "case-1",
    caseContext: {
      caseId: "case-1",
      flow: "visit.schedule",
      lead: {
        id: "lead-1",
        name: "Maria",
        goal: "locacao",
        targetCity: "Itapema",
        budgetMaxCents: 350000,
      },
      property: {
        id: "property-1",
        propertyType: "apartamento",
        goal: "locacao",
        city: "Itapema",
        address: "Rua 700, 10",
      },
    },
    operational: {
      flow: "visit.schedule",
      visitDraft: {
        propertyId: "property-1",
        visitorName: "Maria",
        visitorPhone: "47999998888",
        preferredDate: "2026-05-30",
        preferredWindow: "tarde",
      },
    },
  });

  assert.equal(context.missionContext?.mission, "schedule_visit");
  assert.equal(context.entities.visit?.status, "scheduled");
  assert.equal(context.visitOutcome?.status, "pending_result");
  assert.equal(context.canonicalCaseState?.nextAction.reasonCode, "VISIT_OUTCOME_REQUIRED");
});

test("IMOB case context v1 exposes a pending visit scheduling snapshot before the slot is confirmed", () => {
  const context = buildImobCaseContextV1({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    caseId: "case-visit-1",
    caseContext: {
      caseId: "case-visit-1",
      flow: "visit.schedule",
      lead: {
        id: "lead-1",
        name: "Maria",
        goal: "locacao",
        targetCity: "Itapema",
        budgetMaxCents: 350000,
      },
      property: {
        id: "property-1",
        propertyType: "apartamento",
        goal: "locacao",
        city: "Itapema",
        address: "Rua 700, 10",
      },
    },
    operational: {
      flow: "visit.schedule",
      pendingFields: ["preferredDate"],
      visitDraft: {
        propertyId: "property-1",
        visitorName: "Maria",
        visitorPhone: "47999998888",
      },
    },
  });

  assert.equal(context.visitScheduling?.status, "pending_confirmation");
  assert.match(context.visitScheduling?.summary ?? "", /agenda da visita/i);
  assert.equal(context.canonicalCaseState?.nextAction.reasonCode, "VISIT_SCHEDULING_PENDING");
  assert.equal(context.recoverySnapshot?.primaryAction?.operation, "visit.schedule");
});

test("IMOB case context v1 keeps visit cancellation review explicit before reopening the funnel", () => {
  const context = buildImobCaseContextV1({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    caseId: "case-visit-2",
    caseContext: {
      caseId: "case-visit-2",
      flow: "visit.schedule",
      lead: {
        id: "lead-1",
        name: "Maria",
        goal: "locacao",
        targetCity: "Itapema",
        budgetMaxCents: 350000,
      },
      property: {
        id: "property-1",
        propertyType: "apartamento",
        goal: "locacao",
        city: "Itapema",
        address: "Rua 700, 10",
      },
    },
    operational: {
      flow: "visit.schedule",
      pendingFields: [],
      visitDraft: {
        propertyId: "property-1",
        visitorName: "Maria",
        visitorPhone: "47999998888",
        preferredDate: "2026-06-05",
        status: "cancel_requested",
      },
    },
  });

  assert.equal(context.visitScheduling?.status, "cancel_requested");
  assert.match(context.visitScheduling?.summary ?? "", /cancelamento/i);
  assert.equal(context.canonicalCaseState?.nextAction.reasonCode, "VISIT_CANCELLATION_REVIEW_REQUIRED");
});

test("IMOB case context v1 requires explicit post-visit outcome before preparing proposal", () => {
  const context = buildImobCaseContextV1({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    caseId: "case-visit-3",
    caseContext: {
      caseId: "case-visit-3",
      flow: "visit.schedule",
      lead: {
        id: "lead-1",
        name: "Maria",
        goal: "locacao",
        targetCity: "Itapema",
        budgetMaxCents: 350000,
      },
      property: {
        id: "property-1",
        propertyType: "apartamento",
        goal: "locacao",
        city: "Itapema",
        address: "Rua 700, 10",
      },
    },
    operational: {
      flow: "visit.schedule",
      visitDraft: {
        propertyId: "property-1",
        visitorName: "Maria",
        visitorPhone: "47999998888",
        preferredDate: "2026-06-05",
        preferredWindow: "tarde",
      },
    },
  });

  assert.equal(context.visitScheduling?.status, "scheduled");
  assert.equal(context.visitOutcome?.status, "pending_result");
  assert.equal(context.canonicalCaseState?.nextAction.reasonCode, "VISIT_OUTCOME_REQUIRED");
});

test("IMOB case context v1 promotes post-visit proposal handoff only after explicit positive outcome", () => {
  const context = buildImobCaseContextV1({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    caseId: "case-visit-4",
    caseContext: {
      caseId: "case-visit-4",
      flow: "visit.schedule",
      lead: {
        id: "lead-1",
        name: "Maria",
        goal: "locacao",
        targetCity: "Itapema",
        budgetMaxCents: 350000,
      },
      property: {
        id: "property-1",
        propertyType: "apartamento",
        goal: "locacao",
        city: "Itapema",
        address: "Rua 700, 10",
      },
    },
    operational: {
      flow: "visit.schedule",
      visitDraft: {
        propertyId: "property-1",
        visitorName: "Maria",
        visitorPhone: "47999998888",
        preferredDate: "2026-06-05",
        preferredWindow: "tarde",
        outcome: "proposal_ready",
      },
    },
  });

  assert.equal(context.visitOutcome?.status, "proposal_ready");
  assert.equal(context.canonicalCaseState?.nextAction.reasonCode, "PROPOSAL_REQUIRED");
});

test("IMOB case context v1 preserves lead disqualification reason in canonical recovery", () => {
  const context = buildImobCaseContextV1({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    caseId: "case-1",
    caseContext: {
      caseId: "case-1",
      flow: "lead.qualify",
      lead: {
        id: "lead-1",
        name: "Maria",
        status: "disqualified",
        disqualificationReason: "orcamento fora da faixa",
        goal: "locacao",
        targetCity: "Itapema",
        budgetMaxCents: 350000,
      },
    },
    operational: {
      flow: "lead.qualify",
      leadDraft: {
        leadName: "Maria",
        leadPhone: "47999998888",
        desiredGoal: "locacao",
        desiredCity: "Itapema",
        budgetMax: 3500,
      },
    },
  });

  assert.equal(context.leadLifecycle?.status, "disqualified");
  assert.match(context.leadLifecycle?.summary ?? "", /orcamento fora da faixa/i);
  assert.equal(context.canonicalCaseState?.currentStep, "disqualified");
  assert.equal(context.canonicalCaseState?.nextAction.reasonCode, "LEAD_DISQUALIFIED");
});

test("IMOB case context v1 promotes reengagement without reopening resolved lead fields", () => {
  const context = buildImobCaseContextV1({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    caseId: "case-1",
    caseContext: {
      caseId: "case-1",
      flow: "lead.qualify",
      lead: {
        id: "lead-1",
        name: "Maria",
        status: "disqualified",
        disqualificationReason: "janela de decisão futura",
        reengagementTrigger: "decision_window",
        goal: "locacao",
        targetCity: "Itapema",
        budgetMaxCents: 350000,
      },
    },
    operational: {
      flow: "lead.qualify",
      leadDraft: {
        leadName: "Maria",
        leadPhone: "47999998888",
        desiredGoal: "locacao",
        desiredCity: "Itapema",
        budgetMax: 3500,
      },
    },
  });

  assert.equal(context.leadLifecycle?.status, "reengagement_ready");
  assert.equal(context.readiness.leadReady, true);
  assert.equal(context.canonicalCaseState?.nextAction.reasonCode, "LEAD_REENGAGEMENT_REQUIRED");
});
