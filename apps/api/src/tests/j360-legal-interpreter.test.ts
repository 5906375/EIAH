import assert from "node:assert/strict";
import test from "node:test";

import { buildJ360LegalReport } from "../services/runAtivoUniversalAgent/interpreters/j360LegalInterpreter";

test("buildJ360LegalReport normalizes legal analysis into structured report", () => {
  const report = buildJ360LegalReport({
    outputText: `# Analise Juridica

## Resumo executivo
Documento utilizavel apenas com ajustes relevantes antes do uso interno.

## Pontos fortes
- menciona art. 457 da CLT
- afirma nao incorporacao salarial

## Pontos de atencao juridicos
- criterios de concessao ainda podem parecer ordinarios
- reducoes podem ser interpretadas como penalidade indireta

## Inconsistencias ou ambiguidades
- base de calculo mistura salario-base e faturamento

## Recomendacoes de ajuste
1. explicitar desempenho extraordinario
2. revisar redacao das reducoes

## Evidencias/documentos complementares recomendados
- relatorio mensal de apuracao

## Perguntas para validacao humana
- a pratica real segue os criterios descritos?

## Conclusao preliminar
Aprovado com ressalvas e ajustes recomendados. Revisao humana recomendada antes do uso final.
`,
    metadata: {
      workspaceId: "workspace-A",
      workspaceBrand: {
        name: "Workspace A",
        logoUrl: "https://example.com/logo.png",
        primaryColor: "#0f172a",
        accentColor: "#2563eb",
      },
    },
    recipeOrchestration: {
      schemaVersion: "recipe_orchestration.v1",
      source: "recipe_run",
      recipeId: "recipe-1",
      recipeTitle: "Analise juridica trabalhista",
      recipeGoal: "Avaliar politica de premiacao para uso interno.",
      recipeExpectedOutcome: null,
      recipeSteps: [
        {
          id: "step-1",
          title: "Natureza juridica da premiacao",
          objective: "Verificar natureza nao salarial",
          checks: ["natureza de premio"],
          evidence: [],
          blocking: true,
        },
      ],
      intent: "legal_review",
      domain: "legal",
      riskLevel: "high",
      primaryAgent: { key: "j_360", displayName: "J_360", selectionReason: "legal", confidence: 0.95 },
      requiresGuardianReview: true,
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

  assert.equal(report.legalDecision, "APROVADO_COM_RESSALVAS");
  assert.equal(report.riskLevel, "high");
  assert.equal(report.manualReviewRequired, true);
  assert.equal(report.strengths.length >= 1, true);
  assert.equal(report.recommendedAdjustments.length >= 1, true);
  assert.equal(report.coverageMatrix.length, 1);
  assert.equal(report.riskMatrix.every((item) => item.evidenceRefs.length >= 1), true);
  assert.equal(report.ementa?.includes("DIREITO DO TRABALHO") ?? false, true);
  assert.equal(report.fundamentos.length >= 1, true);
  assert.equal(report.references.cltRefs.length >= 1, true);
  assert.equal(report.executiveGuidance.adjustNow.length >= 1, true);
  assert.equal(report.executiveGuidance.rerunWhen.length >= 1, true);
  assert.equal(report.executiveGuidance.readyForInternalUseWhen.length >= 1, true);
  assert.equal(report.documentIdentity.reportVersion, "v1");
  assert.equal(report.reportSections.length >= 5, true);
  assert.equal(report.tableOfContents.length, report.reportSections.length);
  assert.equal(report.workspaceBrand.name, "Workspace A");
});

test("buildJ360LegalReport keeps legal decision conservative for high-risk legal reviews", () => {
  const report = buildJ360LegalReport({
    rawOutput: JSON.stringify({
      "Resumo Executivo":
        "A política exige ajustes antes do uso interno para reduzir risco trabalhista e alinhar a redação com a prática operacional.",
      Riscos: [
        "Risco relevante de verba salarial se a prática real remunerar desempenho ordinário.",
        "Ambiguidade na base de cálculo pode gerar questionamento trabalhista.",
        "Necessidade de revisão jurídica humana antes da versão final.",
      ],
      Recomendações: [
        "Explicitar critérios objetivos e desempenho extraordinário.",
        "Revisar base de cálculo e forma de demonstrativo ao empregado.",
      ],
    }),
    recipeOrchestration: {
      schemaVersion: "recipe_orchestration.v1",
      source: "recipe_run",
      recipeId: "recipe-2",
      recipeTitle: "Analise juridica trabalhista",
      recipeGoal: "Avaliar politica de premiacao para uso interno.",
      recipeExpectedOutcome: null,
      recipeSteps: [],
      intent: "legal_review",
      domain: "legal",
      riskLevel: "high",
      primaryAgent: { key: "j_360", displayName: "J_360", selectionReason: "legal", confidence: 0.95 },
      requiresGuardianReview: true,
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

  assert.equal(report.legalDecision, "APROVADO_COM_RESSALVAS");
  assert.equal(report.manualReviewRequired, true);
  assert.equal(report.humanValidationQuestions.length >= 1, true);
  assert.equal(report.ambiguities.length >= 1, true);
  assert.equal(report.howToProceedNow.length >= 2, true);
  assert.equal(report.fundamentos.length >= 1, true);
  assert.equal(report.references.cltRefs.length >= 1, true);
  assert.equal(report.executiveGuidance.dependsOnHumanReview.length >= 1, true);
  assert.equal(report.reportSections.some((section) => section.id === "fundamentacao"), true);
  assert.equal(report.tableOfContents.some((item) => item.anchor === "conclusao"), true);
});

test("buildJ360LegalReport marks ambiguous calculation basis as high risk with deduped evidence refs", () => {
  const report = buildJ360LegalReport({
    rawOutput: JSON.stringify({
      "Resumo Executivo": "Documento utilizável apenas com ressalvas.",
      Riscos: [
        "Base de cálculo ambígua ou contraditória na política.",
        "Base de cálculo ambígua ou contraditória na política.",
      ],
      Recomendações: [
        "Verificar a coerência da base de cálculo e reduzir ambiguidades.",
        "Submeter a versão final à revisão humana.",
      ],
    }),
    metadata: {
      documents: [
        {
          name: "Política de Premiação Treviso.pdf",
        },
      ],
    },
    documentEvidence: {
      document: "Política de Premiação Treviso.pdf",
      pageCount: 1,
      pages: [
        {
          page: 1,
          lines: [
            "Base de cálculo, coerência e ambiguidades",
            "A fórmula considera salário-base e faturamento do período.",
          ],
          text: "Base de cálculo, coerência e ambiguidades\nA fórmula considera salário-base e faturamento do período.",
        },
      ],
      sections: [
        {
          page: 1,
          title: "Base de cálculo, coerência e ambiguidades",
          excerpt: "A fórmula considera salário-base e faturamento do período.",
        },
      ],
      fullText: "Base de cálculo, coerência e ambiguidades\nA fórmula considera salário-base e faturamento do período.",
    },
    recipeOrchestration: {
      schemaVersion: "recipe_orchestration.v1",
      source: "recipe_run",
      recipeId: "recipe-3",
      recipeTitle: "Analise juridica trabalhista",
      recipeGoal: "Avaliar politica de premiacao para uso interno.",
      recipeExpectedOutcome: null,
      recipeSteps: [
        {
          id: "step-3",
          title: "Base de cálculo, coerência e ambiguidades",
          objective: "Avaliar coerência entre base de cálculo e fórmula.",
          checks: ["coerência entre base e fórmula"],
          evidence: ["trechos com fórmula"],
          blocking: true,
        },
      ],
      intent: "legal_review",
      domain: "legal",
      riskLevel: "high",
      primaryAgent: { key: "j_360", displayName: "J_360", selectionReason: "legal", confidence: 0.95 },
      requiresGuardianReview: true,
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

  assert.equal(report.legalDecision, "APROVADO_COM_RESSALVAS");
  assert.equal(report.riskMatrix.length, 1);
  assert.equal(report.riskMatrix[0]?.severity, "high");
  assert.match(report.riskMatrix[0]?.risk ?? "", /Base de cálculo/i);
  assert.equal(report.riskMatrix[0]?.evidenceRefs[0]?.document, "Política de Premiação Treviso.pdf");
  assert.equal(report.riskMatrix[0]?.evidenceRefs[0]?.page, "1");
  assert.match(report.riskMatrix[0]?.evidenceRefs[0]?.section ?? "", /Base de cálculo/i);
  assert.match(report.riskMatrix[0]?.evidenceRefs[0]?.excerpt ?? "", /salário-base e faturamento/i);
  assert.match(report.riskMatrix[0]?.impact ?? "", /Trecho sensível observado/i);
  assert.match(report.riskMatrix[0]?.mitigation ?? "", /cláusula\/seção Base de cálculo/i);
  assert.equal(report.fundamentos.some((item) => /Base de cálculo/i.test(item.topic)), true);
  assert.equal(report.references.cltRefs.includes("CLT art. 457"), true);
  assert.match(report.coverageMatrix[0]?.whatRunAnswered ?? "", /p\. 1/i);
  assert.match(report.coverageMatrix[0]?.whatStillNeedsManualReview ?? "", /revisão jurídica humana/i);
  assert.equal(report.documentIdentity.documentName, "Política de Premiação Treviso.pdf");
  assert.equal(report.reportSections.find((section) => section.id === "riscos")?.status, "available");
});
