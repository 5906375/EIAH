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
