import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTenantRecipeContent,
  buildTenantRecipeInstructions,
  clampRecipeTags,
  createInitialTenantRecipeComposerState,
  inferSuggestedTags,
  recommendRecipeMode,
} from "./tenantRecipeComposer";

test("buildTenantRecipeInstructions serializes staged recipes into structured instructions", () => {
  const base = createInitialTenantRecipeComposerState("guardian");
  const instructions = buildTenantRecipeInstructions({
    ...base,
    mode: "staged",
    title: "Go-live EIAH",
    goal: "Levar o EIAH para produção controlada.",
    expectedOutcome: "Ter um GO com evidências completas.",
    goCondition: "Todas as etapas completas\nSem mistura de ambientes",
    blockCondition: "Falha de healthcheck\nFalta de rollback",
    steps: [
      {
        id: "step-1",
        title: "Segregação",
        objective: "Separar staging e produção",
        checks: "Produção não consome staging\nStaging não consome produção",
        evidence: "URLs efetivas\nEnv vars",
        blocking: true,
      },
    ],
  });

  assert.match(instructions, /Objetivo geral: Levar o EIAH para produção controlada\./);
  assert.match(instructions, /Etapa 1: Segregação/);
  assert.match(instructions, /Checks obrigatórios:\n- Produção não consome staging/);
  assert.match(instructions, /Bloqueia avanço: sim/);
  assert.match(instructions, /Condição final de GO:/);
});

test("clampRecipeTags normalizes, deduplicates and truncates the list", () => {
  const tags = clampRecipeTags([
    "Guardian",
    "guardian",
    "go-live",
    "",
    "frontend",
    "x".repeat(41),
  ]);

  assert.deepEqual(tags, ["guardian", "go-live", "frontend"]);
});

test("recommendRecipeMode suggests staged for multi-topic implementation plans", () => {
  const mode = recommendRecipeMode({
    title: "Go-live controlado",
    summary: "Validar staging, health, WAF e rollback",
    goal: "",
  });

  assert.equal(mode, "staged");
});

test("inferSuggestedTags extracts useful tags from the plan context", () => {
  const tags = inferSuggestedTags({
    agentId: "guardian",
    title: "Validar segregação app/api entre staging e produção",
    summary: "Com healthcheck e rollback do go-live controlado.",
    goal: "",
    steps: [],
  });

  assert.deepEqual(tags, [
    "guardian",
    "go-live",
    "staging",
    "production",
    "api",
    "frontend",
    "healthcheck",
    "rollback",
  ]);
});

test("buildTenantRecipeContent serializes staged steps into content v2", () => {
  const base = createInitialTenantRecipeComposerState("guardian");
  const content = buildTenantRecipeContent({
    ...base,
    mode: "staged",
    goal: "Executar go-live controlado.",
    expectedOutcome: "Receber GO do Guardian.",
    goCondition: "Healthcheck válido",
    blockCondition: "Sem rollback",
    steps: [
      {
        id: "step-1",
        title: "Health",
        objective: "Validar /api/health",
        checks: "HTTP 200\nDatabase connected",
        evidence: "Resposta do endpoint\nSnapshot",
        blocking: true,
      },
    ],
  });

  assert.equal(content.schemaVersion, "v2");
  assert.equal(content.mode, "staged");
  assert.deepEqual(content.steps, [
    {
      id: "step-1",
      title: "Health",
      objective: "Validar /api/health",
      checks: ["HTTP 200", "Database connected"],
      evidence: ["Resposta do endpoint", "Snapshot"],
      blocking: true,
    },
  ]);
});
