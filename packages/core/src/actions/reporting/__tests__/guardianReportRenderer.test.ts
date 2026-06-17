import assert from "node:assert/strict";
import test from "node:test";
import { GuardianReportSchema } from "../guardianReportSchema";
import { buildGuardianLandingPageHtml } from "../renderGuardianLandingPage/v1/template";
import { buildGuardianPdfHtml } from "../renderGuardianPdf/v1/template";

const basePayload = {
  metadata: {
    agente: "guardian",
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    runId: "run-guardian-1",
    traceId: "trace-1",
    status: "success",
    guardianReport: {
      route: "go_live_controlado.domain_dns_api_evidencias",
      runStatus: "success",
      guardianDecision: "DEGRADED",
      riskLevel: "high",
      reasonCode: "REVIEW_REQUIRED",
      evidenceStatus: "partial",
      exportStatus: "valid",
      piiStatus: "safe",
      finopsStatus: "not_calculated",
      summary: "Parecer DEGRADED por evidências parciais.",
      blockingIssues: [{ code: "REVIEW_REQUIRED", message: "Revisar evidências antes do avanço.", severity: "P2" }],
      checklist: [
        {
          item: "runtime_health",
          status: "complete",
          expectedEvidence: "Resposta válida do /api/health com database connected.",
          collectedEvidence: "/api/health",
          sha256: null,
          blocking: false,
        },
        {
          item: "rollback_readiness",
          status: "partial",
          expectedEvidence: "Plano de rollback documentado e disponível.",
          collectedEvidence: "runbook parcial",
          sha256: null,
          blocking: false,
        },
      ],
      coverageMatrix: [
        {
          whatParecerAsks: "Decidir se o go-live controlado pode avançar com base em gates, evidência e governança.",
          whatRunAnswered: "O Guardian concluiu DEGRADED com reasonCode REVIEW_REQUIRED.",
          whatStillNeedsManualReview: "A revisão arquitetural ampla ainda depende de conferência manual.",
        },
      ],
      nextSteps: ["Completar o rollback documentado.", "Reexecutar os checks obrigatórios."],
      finops: {
        model: "gpt-4.1",
        promptTokens: 1200,
        completionTokens: 400,
        totalTokens: 1600,
        estimatedCost: null,
        currency: null,
      },
      governance: {
        tenantIdPresent: true,
        workspaceIdPresent: true,
        rbacEvaluated: true,
        entitlementEvaluated: true,
        trustScoreEvaluated: true,
        costGuardEvaluated: true,
        policyDecision: "allowed",
        reasonCode: null,
        trustScore: 0.91,
        trustLevel: "high",
      },
      auditTrail: {
        runId: "run-guardian-1",
        traceId: "trace-1",
        receiptId: null,
        verifyUrl: null,
        evidenceBundleId: null,
      },
      environment: "prod",
      nextAction: "Completar evidências restantes.",
    },
  },
  usuario: {},
  resumo: "Resumo fallback",
  contexto: "Contexto fallback",
  recomendacoes: [],
  insights: [],
  linksUteis: [],
  auditTrail: [],
  timeline: [],
};

test("guardian landing page renderer avoids prohibited commercial terms", () => {
  const html = buildGuardianLandingPageHtml(basePayload);
  const prohibitedTerms = [
    "Produto, dor e CTA",
    "briefing original",
    "Deck no Figma",
    "Deck no Canva",
    "piloto supervisionado",
    "Resumo estratégico",
  ];

  for (const term of prohibitedTerms) {
    assert.equal(html.includes(term), false, `unexpected term in Guardian HTML: ${term}`);
  }

  assert.match(html, /EIAH Guardian — Parecer Probatório/);
  assert.match(html, /Decisão Guardian: DEGRADED/);
  assert.match(html, /REVIEW_REQUIRED/);
  assert.match(html, /Risco: high/);
  assert.match(html, /Governança aplicada/);
  assert.match(html, /RBAC/);
  assert.match(html, /Evidência esperada/);
  assert.match(html, /Evidência coletada/);
  assert.match(html, /Matriz de cobertura do parecer/);
  assert.match(html, /O que o parecer pede/);
  assert.match(html, /O que o run respondeu/);
  assert.match(html, /uso reportado, custo monetário não consolidado/);
});

test("guardian pdf renderer stays printable and fail-closed on missing payload", () => {
  const html = buildGuardianPdfHtml({
    ...basePayload,
    metadata: {
      ...basePayload.metadata,
      guardianReport: undefined,
    },
  });

  assert.match(html, /EXPORT_TEMPLATE_MISMATCH/);
  assert.match(html, /template_mismatch/);
  assert.match(html, /não reportados/);
  assert.equal(html.includes("Deck no Figma"), false);
});

test("guardian payload fixture matches schema v1", () => {
  const parsed = GuardianReportSchema.safeParse(basePayload.metadata.guardianReport);
  assert.equal(parsed.success, true);
});
