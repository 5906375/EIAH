import test from "node:test";
import assert from "node:assert/strict";
import { buildTenantRecipeContract, tenantRecipeContentSchema } from "../types/tenantRecipeContract";

test("tenant recipe contract accepts optional content v2", () => {
  const recipe = buildTenantRecipeContract({
    id: "recipe-1",
    tenantId: "tenant-A",
    agentId: "guardian",
    title: "Go-live controlado",
    summary: "Plano principal de produção.",
    instructions: "Objetivo geral: validar a produção.",
    status: "draft",
    workspaceScope: {
      mode: "selected_workspaces",
      workspaceIds: ["workspace-A"],
    },
    tags: ["guardian", "go-live"],
    content: {
      schemaVersion: "v2",
      mode: "staged",
      goal: "Executar go-live controlado.",
      expectedOutcome: "Receber GO.",
      goCondition: "Tudo validado.",
      blockCondition: "Pendências críticas.",
      steps: [
        {
          id: "step-1",
          title: "Segregação",
          objective: "Separar staging e produção",
          checks: ["Produção não consome staging"],
          evidence: ["Snapshot de env vars"],
          blocking: true,
        },
      ],
    },
    createdByUserId: null,
    updatedByUserId: null,
    homologatedAt: null,
    deprecatedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  assert.equal(recipe.content?.schemaVersion, "v2");
  assert.equal(recipe.content?.steps[0]?.title, "Segregação");
});

test("tenant recipe content schema rejects more than 12 steps", () => {
  const parsed = tenantRecipeContentSchema.safeParse({
    schemaVersion: "v2",
    mode: "staged",
    goal: "",
    expectedOutcome: "",
    goCondition: "",
    blockCondition: "",
    steps: Array.from({ length: 13 }, (_, index) => ({
      id: `step-${index + 1}`,
      title: `Etapa ${index + 1}`,
      objective: "",
      checks: [],
      evidence: [],
      blocking: true,
    })),
  });

  assert.equal(parsed.success, false);
});
