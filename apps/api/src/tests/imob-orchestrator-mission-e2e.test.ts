import test from "node:test";
import assert from "node:assert/strict";

import { buildImobCaseContextV1 } from "../services/imob/crm/imobCaseContextBuilder";
import { planImobCase } from "../services/imob/crm/imobCrmCasePlanner";
import { resolveImobOperationRouteLoose } from "../services/imob/orchestrator/imobOperationRouter";

test("seasonal capture E2E keeps orchestrator ownership and points the journey to owner-property linking", () => {
  const context = buildImobCaseContextV1({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    caseId: "case-1",
    message: "quero captar um imóvel de temporada",
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
    },
  });

  const plan = planImobCase(context);
  const route = resolveImobOperationRouteLoose(
    context.canonicalCaseState?.currentOperation,
    context.caseContext?.workflowState ?? null,
  );

  assert.equal(context.canonicalCaseState?.mission, "capture_seasonal_property");
  assert.equal(context.canonicalCaseState?.currentStep, "owner_property_linking");
  assert.equal(context.canonicalCaseState?.missionStatus, "blocked");
  assert.equal(context.canonicalCaseState?.nextAction.reasonCode, "OWNER_PROPERTY_LINK_REQUIRED");
  assert.equal(context.recoverySnapshot?.primaryAction?.operation, "property.link_owner");
  assert.equal(plan.stage, "owner_property_linking");
  assert.equal(plan.primaryAction?.operation, "property.link_owner");
  assert.equal(context.crmProjection?.caseCard.ownerAgent, "IMOB_Orchestrator");
  assert.equal(context.crmProjection?.caseCard.targetAgent, "IMOB_PropertyAgent");
  assert.equal(route?.ownerAgentId, "IMOB_Orchestrator");
  assert.equal(route?.dispatchedAgentId, "IMOB_PropertyAgent");
});

test("lead qualification E2E keeps a single lead next action and a read-only CRM projection", () => {
  const context = buildImobCaseContextV1({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    caseId: "lead-case-1",
    caseContext: {
      caseId: "lead-case-1",
      flow: "lead.qualify",
      lead: {
        id: "lead-1",
        name: "Fernanda",
        email: "fernanda@example.com",
      },
    },
    operational: {
      flow: "lead.qualify",
      pendingFields: ["leadPhone"],
      leadDraft: {
        leadName: "Fernanda",
        leadEmail: "fernanda@example.com",
      },
    },
  });

  const plan = planImobCase(context);
  const route = resolveImobOperationRouteLoose(context.canonicalCaseState?.currentOperation);

  assert.equal(context.canonicalCaseState?.mission, "qualify_and_match_lead");
  assert.equal(context.canonicalCaseState?.currentOperation, "lead");
  assert.equal(context.canonicalCaseState?.missionStatus, "in_progress");
  assert.equal(context.canonicalCaseState?.nextAction.operation, "lead");
  assert.equal(context.canonicalCaseState?.nextAction.targetAgent, "IMOB_LeadAgent");
  assert.equal(context.recoverySnapshot?.primaryAction?.operation, "lead.qualify");
  assert.equal(plan.primaryAction?.operation, "lead.qualify");
  assert.equal(context.crmProjection?.caseCard.ownerAgent, "IMOB_Orchestrator");
  assert.equal(context.crmProjection?.caseCard.targetAgent, "IMOB_LeadAgent");
  assert.equal(context.crmProjection?.caseCard.nextAction.operation, "lead");
  assert.equal(route?.dispatchedAgentId, "IMOB_LeadAgent");
});

