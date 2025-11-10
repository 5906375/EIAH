import { test } from "node:test";
import assert from "node:assert/strict";

import { generateStatefulRecommendations } from "../statefulRecommendationEngine";

test("Smoke 1 - Não repetir adotadas", () => {
  const result = generateStatefulRecommendations({
    agentId: "MKT",
    runId: "run-smoke-1",
    candidates: [
      {
        key: "R_001",
        tatica: "Atribuição Multi-Touch",
        rationale: "Refinar modelo de atribuição",
      },
      {
        key: "R_010",
        tatica: "Teste de criativos",
        rationale: "Explorar novas variações",
      },
    ],
    previousRuns: [
      {
        id: "prev-1",
        createdAt: new Date().toISOString(),
        recomendacoes: [
          {
            key: "R_001",
            tatica: "Atribuição Multi-Touch",
            feedback: { explicit: "aceito" },
          },
        ],
      },
    ],
    agentState: {
      recommendations: {},
      version: 1,
    },
  });

  const keys = result.recomendacoes.map((item) => item.key);
  assert.ok(!keys.includes("R_001"), "Recomendação adotada não deve reaparecer");
  assert.ok(result.diagnostico.filtrados_adotados >= 1);
});

test("Smoke 2 - Evitar rejeitadas", () => {
  const result = generateStatefulRecommendations({
    agentId: "MKT",
    runId: "run-smoke-2",
    candidates: [
      {
        key: "R_002",
        tatica: "Influencers",
        rationale: "Retomar parcerias",
      },
      {
        key: "R_020",
        tatica: "Newsletter segmentada",
      },
    ],
    previousRuns: [
      {
        id: "prev-2",
        createdAt: new Date().toISOString(),
        recomendacoes: [
          {
            key: "R_002",
            tatica: "Influencers",
            feedback: { explicit: "rejeitado" },
          },
        ],
      },
    ],
    agentState: {
      recommendations: {},
      version: 1,
    },
  });

  const keys = result.recomendacoes.map((item) => item.key);
  assert.ok(!keys.includes("R_002"), "Recomendação rejeitada não deve aparecer");
  assert.ok(result.diagnostico.filtrados_rejeitados >= 1);
});
