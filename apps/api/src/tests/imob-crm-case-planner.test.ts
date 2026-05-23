import test from "node:test";
import assert from "node:assert/strict";

import { planImobCase } from "../services/imob/crm/imobCrmCasePlanner";
import type { ImobCaseContextV1 } from "../services/imob/crm/imobCaseContextContract";

function seasonalContext(overrides: Partial<ImobCaseContextV1> = {}): ImobCaseContextV1 {
  return {
    version: "1.0",
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    caseId: "case-1",
    missionContext: {
      mission: "capture_seasonal_property",
      defaultGoal: "aluguel_por_temporada",
      lockedUntilExplicitChange: true,
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

test("IMOB case planner starts seasonal capture by collecting owner when owner is missing", () => {
  const plan = planImobCase(seasonalContext());

  assert.equal(plan.mission, "capture_seasonal_property");
  assert.equal(plan.stage, "owner_collecting");
  assert.equal(plan.primaryAction?.operation, "owner.create");
  assert.equal(plan.primaryAction?.label, "Cadastrar proprietário");
});

test("IMOB case planner asks for seasonal property when owner is ready and property is missing", () => {
  const plan = planImobCase(seasonalContext({
    entities: {
      owner: { id: "owner-1", name: "Carlos Alberto", document: "12345678900" },
    },
    readiness: {
      ownerReady: true,
      propertyReady: false,
      documentsReady: false,
      seasonalRulesReady: false,
      operationalReady: false,
    },
  }));

  assert.equal(plan.stage, "property_collecting");
  assert.equal(plan.primaryAction?.operation, "property.create");
  assert.equal(plan.primaryAction?.label, "Cadastrar imóvel de temporada");
  assert.ok(plan.suppressedActions.includes("owner.create"));
});

test("IMOB case planner makes owner-property linking the primary action when both entities are ready", () => {
  const plan = planImobCase(seasonalContext({
    entities: {
      owner: { id: "owner-1", name: "Carlos Alberto", document: "12345678900" },
      property: {
        id: "property-1",
        propertyType: "kitnet",
        goal: "aluguel_por_temporada",
        city: "Balneário Camboriú",
        address: "Rua Alvin Bauer, 783 apto 101",
      },
    },
    links: {
      ownerProperty: { ownerId: "owner-1", propertyId: "property-1", status: "missing" },
    },
    readiness: {
      ownerReady: true,
      propertyReady: true,
      documentsReady: false,
      seasonalRulesReady: false,
      operationalReady: false,
    },
  }));

  assert.equal(plan.stage, "owner_property_linking");
  assert.equal(plan.primaryAction?.operation, "property.link_owner");
  assert.equal(plan.primaryAction?.label, "Concluir vínculo");
  assert.ok(plan.suppressedActions.includes("owner.create"));
  assert.ok(plan.suppressedActions.includes("property.create"));
});

test("IMOB case planner advances seasonal capture to documents and rules after link", () => {
  const base = seasonalContext({
    entities: {
      owner: { id: "owner-1", name: "Carlos Alberto", document: "12345678900" },
      property: {
        id: "property-1",
        propertyType: "kitnet",
        goal: "aluguel_por_temporada",
        city: "Balneário Camboriú",
        address: "Rua Alvin Bauer, 783 apto 101",
        ownerId: "owner-1",
      },
    },
    links: {
      ownerProperty: { ownerId: "owner-1", propertyId: "property-1", status: "linked" },
    },
    readiness: {
      ownerReady: true,
      propertyReady: true,
      documentsReady: false,
      seasonalRulesReady: false,
      operationalReady: false,
    },
  });
  const documentsPlan = planImobCase(base);
  const rulesPlan = planImobCase({
    ...base,
    readiness: {
      ...base.readiness,
      documentsReady: true,
    },
  });

  assert.equal(documentsPlan.stage, "documents_collecting");
  assert.equal(documentsPlan.primaryAction?.operation, "documents.collect");
  assert.equal(rulesPlan.stage, "seasonal_rules");
  assert.equal(rulesPlan.primaryAction?.operation, "rules.configure");
});

test("IMOB case planner uses recovery snapshot fallback for case review mission", () => {
  const plan = planImobCase(seasonalContext({
    missionContext: {
      mission: "case_review",
      lockedUntilExplicitChange: false,
    },
    blockers: [
      { code: "owner_property_not_linked", severity: "blocking", message: "O imóvel ainda não está vinculado ao proprietário." },
    ],
    recoverySnapshot: {
      version: "1.0",
      mission: "case_review",
      stage: "blocked",
      blockers: [
        { code: "owner_property_not_linked", severity: "blocking", message: "O imóvel ainda não está vinculado ao proprietário." },
      ],
      missingItems: ["O imóvel ainda não está vinculado ao proprietário."],
      primaryAction: {
        id: "property-link-owner",
        operation: "property.link_owner",
        label: "Concluir vínculo",
        nextMessage: "concluir vínculo proprietário-imóvel",
        kind: "primary",
        reasonCode: "OWNER_PROPERTY_LINK_REQUIRED",
      },
      secondaryActions: [
        {
          id: "case-review",
          operation: "case.review",
          label: "Consultar caso",
          nextMessage: "consultar caso case-1",
          kind: "neutral",
          reasonCode: "case_review_available",
        },
      ],
      supportedIntents: ["consult_case", "resume_case", "what_is_missing", "next_step"],
      safeFallbackAction: {
        id: "case-review",
        operation: "case.review",
        label: "Consultar caso",
        nextMessage: "consultar caso case-1",
        kind: "neutral",
        reasonCode: "case_review_available",
      },
      reasonCode: "RECOVERY_BLOCKED",
    },
  }));

  assert.equal(plan.stage, "blocked");
  assert.equal(plan.primaryAction?.operation, "property.link_owner");
  assert.equal(plan.secondaryActions[0]?.operation, "case.review");
});
