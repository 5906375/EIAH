import assert from "node:assert/strict";
import test from "node:test";
import { alignCandidatesToRecipe } from "../workers/runWorkerRecipeAlignment";

test("guardian recipe alignment builds deterministic recommendation from executed checklist steps", () => {
  const result = alignCandidatesToRecipe({
    agentId: "guardian",
    metadata: {
      executionInput: {
        requestType: "go_live_controlado.domain_dns_api_evidencias",
        objective: "Validar cada etapa do go-live",
      },
      linkedRecipe: {
        id: "recipe-guardian-1",
        title: "Go-live Controlado EIAH",
        summary: "Checklist de domain, DNS, health e rollback.",
      },
    },
    outputs: [
      {
        stepId: "run-1-step-1",
        data: {
          step: "runtime_health",
          status: "verified",
          summary: "Health respondeu com runtime pronto.",
          evidenceRefs: ["/api/health"],
        },
      },
      {
        stepId: "run-1-step-2",
        data: {
          step: "rollback_readiness",
          status: "missing",
          summary: "Plano de rollback ausente.",
          nextAction: "Documentar rollback antes de seguir para produção.",
          evidenceRefs: [],
        },
      },
    ],
    candidates: [],
  });

  assert.equal(result.length, 1);
  assert.match(result[0]?.tatica ?? "", /NO_GO/i);
  assert.match(result[0]?.rationale ?? "", /Go-live Controlado EIAH/i);
  assert.match(result[0]?.proximos_passos ?? "", /rollback/i);
  assert.equal(result[0]?.metadata?.recipeId, "recipe-guardian-1");
  assert.equal(result[0]?.metadata?.checklistSteps?.length, 2);
});

test("non-guardian recipe alignment preserves candidate and only annotates recipe metadata", () => {
  const result = alignCandidatesToRecipe({
    agentId: "eiah",
    metadata: {
      linkedRecipe: {
        id: "recipe-1",
        title: "Ajuda de pricing",
      },
    },
    outputs: [],
    candidates: [
      {
        key: "pricing-help",
        tatica: "Explicar pricing oficial",
        rationale: "Consolidar resposta comercial.",
        proximos_passos: "1. Revisar plano. 2. Confirmar billing.",
        execucao: {
          api_sugerida: "GPT_4_1",
          tipo_tarefa: "ESTRATEGIA_COMPLEXA",
          custo_estimado_tokens: 300,
        },
      },
    ],
  });

  assert.equal(result.length, 1);
  assert.equal(result[0]?.tatica, "Explicar pricing oficial");
  assert.equal(result[0]?.metadata?.recipeId, "recipe-1");
  assert.equal(result[0]?.metadata?.recipeTitle, "Ajuda de pricing");
});
