import assert from "node:assert/strict";
import test from "node:test";

import { buildJ360StructuredOutput } from "../workers/runWorkerJ360Output";

test("buildJ360StructuredOutput returns structured legal report for J_360 output", () => {
  const report = buildJ360StructuredOutput({
    agentId: "J_360",
    metadata: {
      linkedRecipe: {
        title: "Analise Juridica Trabalhista — Politica de Premiacao Treviso",
      },
    },
    outputText: `## Resumo executivo
Politica analisada com necessidade de ajustes antes de uso interno.

## Pontos fortes
- base legal indicada

## Riscos
- risco de habitualidade

## Recomendacoes
1. detalhar criterios de desempenho extraordinario

## Conclusao preliminar
Aprovado com ressalvas e ajustes recomendados.
`,
    recipeOrchestration: {
      schemaVersion: "recipe_orchestration.v1",
      source: "recipe_run",
      recipeId: "recipe-1",
      recipeTitle: "Analise juridica",
      recipeGoal: "Avaliar documento antes do uso interno.",
      recipeExpectedOutcome: null,
      recipeSteps: [],
      intent: "legal_review",
      domain: "legal",
      riskLevel: "high",
      primaryAgent: { key: "j_360", displayName: "J_360", selectionReason: "legal", confidence: 0.9 },
      requiresGuardianReview: false,
      guardianReviewReason: [],
      supportMode: "suggest_only",
      allowedSelfServiceAgents: ["j_360"],
      suggestedSelfServiceAgents: [],
      limitations: [],
      howToProceedNow: [],
      recommendedRecipes: [],
      externalPlatformsInvolved: [],
      nextBestImplementationAction: null,
      practicalSteps: [],
      readyForRerunWhen: [],
      governance: {
        tenantIdPresent: true,
        workspaceIdPresent: true,
        rbacEvaluated: false,
        entitlementEvaluated: false,
        trustScoreEvaluated: false,
        costGuardEvaluated: false,
        policyDecision: "allowed",
        reasonCode: null,
      },
      audit: {
        orchestrationDecisionId: null,
        selectedAt: null,
        basedOnPattern: "chat_imob_orchestrator",
      },
    },
  });

  assert.ok(report);
  assert.equal(report?.schemaVersion, "j360_legal_report.v1");
  assert.equal(report?.legalDecision, "APROVADO_COM_RESSALVAS");
  assert.equal(report?.nextBestImplementationAction?.length ? true : false, true);
  assert.deepEqual(report?.header, {
    number: null,
    interessado: null,
    assunto: "Analise Juridica Trabalhista — Politica de Premiacao Treviso",
  });
  assert.equal(report?.ementa?.includes("DIREITO DO TRABALHO") ?? false, true);
  assert.equal((report?.fundamentos.length ?? 0) >= 1, true);
  assert.equal((report?.references.cltRefs.length ?? 0) >= 1, true);
});

test("buildJ360StructuredOutput prioritizes JSON string from outputs over fallback envelope text", () => {
  const report = buildJ360StructuredOutput({
    agentId: "J_360",
    metadata: {},
    outputText: "{\"agent\":\"J_360\",\"recomendacoes\":[]}",
    outputs: [
      {
        stepId: "step-1",
        data: JSON.stringify({
          "Resumo Executivo": "Documento utilizavel com ajustes antes do uso interno.",
          Riscos: "Há risco de habitualidade e ambiguidade na base de cálculo.",
          Oportunidades: "Ajustes podem reforçar a natureza não salarial do prêmio.",
          Recomendacoes: "Revisar critérios de concessão e base de cálculo.",
          "Conclusao preliminar": "Aprovado com ressalvas e ajustes recomendados.",
        }),
      },
    ],
  });

  assert.ok(report);
  assert.equal(report?.summary, "Documento utilizavel com ajustes antes do uso interno.");
  assert.equal(report?.attentionPoints.length > 0, true);
  assert.equal(report?.recommendedAdjustments.length > 0, true);
  assert.equal(report?.riskMatrix[0]?.risk.includes("habitualidade"), true);
  assert.equal(report?.riskMatrix.every((item) => item.evidenceRefs.length >= 1), true);
});

test("buildJ360StructuredOutput ignores leading recommendation envelope when markdown legal sections follow", () => {
  const report = buildJ360StructuredOutput({
    agentId: "J_360",
    metadata: {},
    outputText: "{\"agent\":\"J_360\",\"recomendacoes\":[]}",
    outputs: [
      {
        stepId: "step-1",
        data: `{
  "agent": "J_360",
  "recomendacoes": [
    { "tatica": "Análise Jurídica da Política de Premiação" }
  ]
}

### Resumo Executivo
A política exige ajustes antes do uso interno.

### Riscos
- Critérios subjetivos podem reforçar risco de salarialização.
- A base de cálculo apresenta ambiguidade relevante.

### Recomendações
1. Revisar os critérios de concessão.
2. Revisar a base de cálculo.

### Conclusão preliminar
Aprovado com ressalvas e revisão jurídica humana recomendada.`,
      },
    ],
  });

  assert.ok(report);
  assert.equal(report?.summary, "A política exige ajustes antes do uso interno.");
  assert.equal(report?.summary.startsWith("{"), false);
  assert.equal(report?.attentionPoints.length >= 1, true);
  assert.equal(report?.recommendedAdjustments.length >= 1, true);
  assert.equal(report?.riskMatrix[0]?.risk.includes("Risco jurídico não estruturado explicitamente pelo modelo"), false);
});

test("buildJ360StructuredOutput ignores non-J_360 agents", () => {
  const report = buildJ360StructuredOutput({
    agentId: "guardian",
    metadata: {},
    outputText: "texto qualquer",
  });

  assert.equal(report, null);
});
