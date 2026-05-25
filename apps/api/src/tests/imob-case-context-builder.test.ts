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

test("IMOB case context v1 promotes a scheduled visit into proposal preparation", () => {
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
  assert.equal(context.canonicalCaseState?.nextAction.reasonCode, "PROPOSAL_REQUIRED");
});
