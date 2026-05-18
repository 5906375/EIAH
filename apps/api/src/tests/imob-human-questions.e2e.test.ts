import test from "node:test";
import assert from "node:assert/strict";

import { planImobCase } from "../services/imob/crm/imobCrmCasePlanner";
import type { ImobCaseContextV1 } from "../services/imob/crm/imobCaseContextContract";

function seasonalContext(overrides: Partial<ImobCaseContextV1> = {}): ImobCaseContextV1 {
  return {
    version: "1.0",
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    caseId: "case-seasonal-1",
    missionContext: {
      mission: "capture_seasonal_property",
      defaultGoal: "aluguel_por_temporada",
      startedFromMessage: "quero cadastrar um proprietário para imóvel de temporada",
      recipeId: "recipe-temporada-1",
      lockedUntilExplicitChange: true,
    },
    entities: {},
    links: {
      ownerProperty: {
        status: "pending_confirmation",
      },
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

test("IMOB E2E pergunta humana inicia captação de temporada pela coleta do proprietário", () => {
  const plan = planImobCase(seasonalContext());

  assert.equal(plan.mission, "capture_seasonal_property");
  assert.equal(plan.stage, "owner_collecting");
  assert.equal(plan.primaryAction?.operation, "owner.create");
  assert.equal(plan.primaryAction?.nextMessage, "cadastrar proprietário para imóvel de temporada");
});

test("IMOB E2E proprietário existente suprime owner.create e avança para imóvel de temporada", () => {
  const plan = planImobCase(seasonalContext({
    entities: {
      owner: {
        id: "owner-1",
        name: "Carlos Alberto",
        document: "12345678900",
      },
    },
    links: {
      ownerProperty: {
        ownerId: "owner-1",
        status: "pending_confirmation",
      },
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

test("IMOB E2E imóvel existente suprime property.create quando falta só vínculo", () => {
  const plan = planImobCase(seasonalContext({
    entities: {
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
    links: {
      ownerProperty: {
        ownerId: "owner-1",
        propertyId: "property-1",
        status: "missing",
      },
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
  assert.ok(!plan.secondaryActions.some((action) => action.operation === "property.create"));
});

test("IMOB E2E vínculo concluído avança para documentos sem reabrir proprietário ou imóvel", () => {
  const plan = planImobCase(seasonalContext({
    entities: {
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
    links: {
      ownerProperty: {
        ownerId: "owner-1",
        propertyId: "property-1",
        status: "linked",
      },
    },
    readiness: {
      ownerReady: true,
      propertyReady: true,
      documentsReady: false,
      seasonalRulesReady: false,
      operationalReady: false,
    },
  }));

  assert.equal(plan.stage, "documents_collecting");
  assert.equal(plan.primaryAction?.operation, "documents.collect");
  assert.ok(plan.suppressedActions.includes("owner.create"));
  assert.ok(plan.suppressedActions.includes("property.create"));
  assert.ok(plan.suppressedActions.includes("property.link_owner"));
});

test("IMOB E2E consultar caso é sempre uma ação válida de recuperação", () => {
  const plan = planImobCase(seasonalContext({
    entities: {
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
    links: {
      ownerProperty: {
        ownerId: "owner-1",
        propertyId: "property-1",
        status: "missing",
      },
    },
    readiness: {
      ownerReady: true,
      propertyReady: true,
      documentsReady: false,
      seasonalRulesReady: false,
      operationalReady: false,
    },
  }));

  assert.equal(plan.primaryAction?.operation, "property.link_owner");
  assert.ok(plan.secondaryActions.some((action) => action.operation === "case.review"));
});
