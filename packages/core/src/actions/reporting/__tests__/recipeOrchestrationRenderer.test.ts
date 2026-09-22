import assert from "node:assert/strict";
import test from "node:test";

import { RunAtivoReportingInputSchema } from "../runAtivoSchema";
import { buildLandingPageHtml } from "../renderRunAtivoLandingPage/v1/template";
import { buildPdfHtml } from "../renderRunAtivoPdf/v1/template";
import { buildGuardianLandingPageHtml } from "../renderGuardianLandingPage/v1/template";

const baseOrchestration = {
  schemaVersion: "recipe_orchestration.v1" as const,
  source: "recipe_run" as const,
  recipeId: "recipe-1",
  recipeTitle: "Go-live controlado",
  recipeGoal: "Levar o EIAH para produção controlada.",
  recipeExpectedOutcome: "Receber GO com evidências completas.",
  recipeSteps: [
    {
      id: "step-1",
      title: "Healthcheck",
      objective: "Validar /api/health",
      checks: ["HTTP 200", "database connected"],
      evidence: ["resposta do endpoint"],
      blocking: true,
    },
  ],
  intent: "go_live_validation" as const,
  domain: "guardian" as const,
  riskLevel: "high" as const,
  primaryAgent: {
    key: "guardian" as const,
    displayName: "Guardian",
    selectionReason: "Receita crítica com healthcheck e evidência.",
    confidence: 0.95,
  },
  requiresGuardianReview: true,
  guardianReviewReason: ["Risco alto e material sensível."],
  supportMode: "delegate_assisted" as const,
  allowedSelfServiceAgents: ["guardian", "eiah", "j_360"],
  suggestedSelfServiceAgents: [
    {
      key: "eiah" as const,
      displayName: "EIAH",
      purpose: "Transformar a pendência em checklist prático.",
      canExecute: false,
      canAdvise: true,
      requiresApproval: false,
      requiredScope: null,
      estimatedCostStatus: "not_calculated" as const,
    },
  ],
  limitations: ["Sem delegação automática nesta fase."],
  howToProceedNow: ["Use o GO como validação do plano principal e siga para as plataformas externas."],
  recommendedRecipes: [
    {
      order: 1,
      title: "Validar publicação do app no Vercel",
      objective: "Confirmar domínio, build e env vars do frontend.",
      externalPlatform: "Vercel",
    },
  ],
  externalPlatformsInvolved: ["Vercel", "AWS", "Cloudflare"],
  nextBestImplementationAction: "Validar publicação do app no Vercel",
  practicalSteps: ["Coletar evidência de /api/health.", "Rerodar a receita."],
  readyForRerunWhen: ["Healthcheck anexado."],
  governance: {
    tenantIdPresent: true,
    workspaceIdPresent: true,
    rbacEvaluated: false,
    entitlementEvaluated: false,
    trustScoreEvaluated: false,
    costGuardEvaluated: false,
    policyDecision: "allowed" as const,
    reasonCode: null,
  },
  audit: {
    orchestrationDecisionId: "decision-1",
    selectedAt: "2026-06-03T00:00:00.000Z",
    basedOnPattern: "chat_imob_orchestrator" as const,
  },
};

test("generic landing/pdf render recipe orchestrator section when recipe payload exists", () => {
  const payload = RunAtivoReportingInputSchema.parse({
    metadata: {
      agente: "EIAH",
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      recipeOrchestration: baseOrchestration,
    },
    usuario: {},
    resumo: "Resumo",
    contexto: "Contexto",
    recomendacoes: [],
    insights: [],
    linksUteis: [],
    auditTrail: [],
    timeline: [],
  });

  const landing = buildLandingPageHtml(payload);
  const pdf = buildPdfHtml(payload);

  assert.match(landing, /Recipe_Orchestrator — Como concluir esta receita/);
  assert.match(landing, /LEGADO — ESTADO DE GOVERNANÇA NÃO VERIFICADO/);
  assert.match(landing, /not_evaluated/);
  assert.match(landing, /Agente líder recomendado/);
  assert.match(landing, /Apoio sugerido agora/);
  assert.match(landing, /Etapas estruturadas da recipe/);
  assert.match(landing, /Como seguir agora/);
  assert.match(landing, /Recipes recomendadas em ordem/);
  assert.match(landing, /Validar publicação do app no Vercel/);
  assert.match(landing, /Healthcheck/);
  assert.match(pdf, /Recipe_Orchestrator — Como concluir esta receita/);
  assert.match(pdf, /Próxima melhor ação para implementação/);
  assert.match(pdf, /Pronto para rerun quando/);
});

test("guardian landing renderer also includes recipe orchestrator section", () => {
  const payload = RunAtivoReportingInputSchema.parse({
    metadata: {
      agente: "guardian",
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      guardianReport: {
        route: "go_live_controlado.domain_dns_api_evidencias",
        runStatus: "success",
        guardianDecision: "NO-GO",
        reasonCode: "HEALTHCHECK_MISSING",
        evidenceStatus: "missing",
        exportStatus: "valid",
        piiStatus: "safe",
        finopsStatus: "not_calculated",
        summary: "Bloqueado por healthcheck ausente.",
        blockingIssues: [],
        checklist: [],
        nextSteps: ["Corrigir healthcheck."],
        finops: {
          model: null,
          promptTokens: null,
          completionTokens: null,
          totalTokens: null,
          estimatedCost: null,
          currency: null,
        },
        auditTrail: {
          runId: "run-1",
          traceId: "trace-1",
          receiptId: null,
          verifyUrl: null,
          evidenceBundleId: null,
        },
      },
      recipeOrchestration: baseOrchestration,
    },
    usuario: {},
    resumo: "Resumo",
    contexto: "Contexto",
    recomendacoes: [],
    insights: [],
    linksUteis: [],
    auditTrail: [],
    timeline: [],
  });

  const html = buildGuardianLandingPageHtml(payload);
  assert.match(html, /Recipe_Orchestrator — Como concluir esta receita/);
  assert.match(html, /Apoio sugerido agora/);
  assert.match(html, /Como seguir agora/);
  assert.match(html, /Guardian será acionado\?/);
});
