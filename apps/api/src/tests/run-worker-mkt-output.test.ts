import assert from "node:assert/strict";
import test from "node:test";

import { buildMktStructuredOutput } from "../workers/runWorkerMktOutput";

test("buildMktStructuredOutput returns structured campaign report for MKT output", () => {
  const report = buildMktStructuredOutput({
    agentId: "MKT",
    metadata: {
      form: {
        goal: "Gerar pipeline qualificado de escritorios para a Vertical Legal.",
        audience: "- socios de escritorio\n- heads de inovacao",
        channels: ["LinkedIn", "Parcerias"],
        kpis: "Leads qualificados, reunioes agendadas",
        notes: "Evitar prometer capabilities nao homologadas.",
        toneNotes: "Linguagem executiva e consultiva.",
      },
      linkedRecipe: {
        title: "Campanha de Divulgacao e Prospeccao — Vertical Legal EIAH",
        agentId: "MKT",
      },
      workspaceName: "Workspace Legal",
    },
    outputText: `## 1. Resumo e KPIs
Campanha para divulgar a Vertical Legal com foco em LinkedIn e parcerias.

## 2. Timeline
- Semana 1 — Fechar ICP e scripts
- Semana 2 — Ativar outreach e parceiros

## 3. Canais e estratégias
- LinkedIn
- Parcerias

## 5. Próximos passos com datas-chave
1. Fechar ICP
2. Preparar one-pager
3. Iniciar outreach
`,
    recipeOrchestration: {
      schemaVersion: "recipe_orchestration.v1",
      source: "recipe_run",
      recipeId: "recipe-mkt",
      recipeTitle: "Campanha de Divulgacao e Prospeccao — Vertical Legal EIAH",
      recipeGoal: "Gerar pipeline qualificado.",
      recipeExpectedOutcome: "Plano de campanha executavel.",
      recipeSteps: [],
      intent: "marketing_campaign",
      domain: "marketing",
      riskLevel: "low",
      primaryAgent: { key: "mkt", displayName: "MKT", selectionReason: "marketing", confidence: 0.98 },
      requiresGuardianReview: false,
      guardianReviewReason: [],
      supportMode: "delegate_assisted",
      allowedSelfServiceAgents: ["mkt", "eiah", "pitch"],
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
  assert.equal(report?.schemaVersion, "mkt_campaign_report.v1");
  assert.equal(report?.campaignTitle, "Campanha de Divulgacao e Prospeccao — Vertical Legal EIAH");
  assert.equal(report?.priorityChannels.includes("linkedin"), true);
  assert.equal(report?.priorityChannels.includes("partnerships"), true);
  assert.equal(report?.offer?.includes("piloto guiado"), true);
  assert.equal(report?.outboundCadence.length >= 3, true);
  assert.equal(report?.followUpPlan.length >= 1, true);
  assert.equal(report?.prioritizationPlan.map((item) => item.horizonDays).join(","), "30,60,90");
  assert.equal(report?.complianceFlags.includes("oab_publicidade"), true);
  assert.equal(report?.valuePropositionByArea.length >= 3, true);
  assert.equal(report?.icpScoring.mqlThreshold, 60);
  assert.equal(report?.coldEmailTemplates.length >= 2, true);
  assert.equal(report?.launchChecklist.length >= 3, true);
  assert.equal(report?.timeline.length >= 1, true);
  assert.equal(report?.requiredAssets[0]?.name, "One-pager da Vertical Legal");
});

test("buildMktStructuredOutput ignores non-MKT agents", () => {
  const report = buildMktStructuredOutput({
    agentId: "J_360",
    metadata: {},
    outputText: "qualquer texto",
  });

  assert.equal(report, null);
});
