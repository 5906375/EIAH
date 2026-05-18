import test from "node:test";
import assert from "node:assert/strict";

import { resolveImobRecipeMissionContext } from "../services/imob/crm/imobRecipeMissionConfig";
import { planImobCase } from "../services/imob/crm/imobCrmCasePlanner";
import type { ImobCaseContextV1 } from "../services/imob/crm/imobCaseContextContract";

test("IMOB recipe configures seasonal mission without creating UI actions directly", () => {
  const missionContext = resolveImobRecipeMissionContext({
    recipeId: "recipe-temporada-1",
    agentId: "IMOB",
    status: "homologated",
    tags: ["imob", "temporada", "property.create"],
  });

  assert.equal(missionContext?.mission, "capture_seasonal_property");
  assert.equal(missionContext?.defaultGoal, "aluguel_por_temporada");
  assert.equal(missionContext?.recipeId, "recipe-temporada-1");
  assert.equal(missionContext?.lockedUntilExplicitChange, true);
});

test("IMOB recipe mission feeds planner through canonical context", () => {
  const missionContext = resolveImobRecipeMissionContext({
    recipeId: "recipe-temporada-1",
    agentId: "IMOB",
    status: "homologated",
    tags: ["imob", "temporada"],
  });
  const context: ImobCaseContextV1 = {
    version: "1.0",
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    caseId: "case-1",
    missionContext: missionContext ?? undefined,
    entities: {
      owner: { id: "owner-1", name: "Carlos Alberto", document: "12345678900" },
    },
    links: {
      ownerProperty: { ownerId: "owner-1", status: "pending_confirmation" },
    },
    readiness: {
      ownerReady: true,
      propertyReady: false,
      documentsReady: false,
      seasonalRulesReady: false,
      operationalReady: false,
    },
    blockers: [],
  };

  const plan = planImobCase(context);

  assert.equal(plan.mission, "capture_seasonal_property");
  assert.equal(plan.stage, "property_collecting");
  assert.equal(plan.primaryAction?.operation, "property.create");
  assert.equal(plan.primaryAction?.label, "Cadastrar imóvel de temporada");
});

test("IMOB recipe config ignores draft and non-IMOB recipes", () => {
  assert.equal(resolveImobRecipeMissionContext({
    recipeId: "draft-1",
    agentId: "IMOB",
    status: "draft",
    tags: ["temporada"],
  }), null);
  assert.equal(resolveImobRecipeMissionContext({
    recipeId: "legal-1",
    agentId: "LEGAL",
    status: "homologated",
    tags: ["temporada"],
  }), null);
});
