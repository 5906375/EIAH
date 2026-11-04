import assert from "node:assert/strict";
import test from "node:test";

import {
  buildJ360LandingPageHtml,
  buildJ360PdfHtml,
  extractJ360LegalReport,
  J360_LEGAL_SOURCE_NOT_PROVIDED_MESSAGE,
  J360_LEGAL_SOURCE_UNKNOWN_MESSAGE,
  shouldUseJ360LegalRenderer,
} from "../j360LegalReportRenderer";
import { J360LegalReportSchema } from "../j360LegalReportSchema";
import { buildJ360LandingTemplateHtml } from "../renderJ360LandingPage/v1/template";
import { buildJ360PdfTemplateHtml } from "../renderJ360Pdf/v1/template";

const payload = {
  metadata: {
    agente: "J_360",
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    runId: "run-j360-1",
    recipeOrchestration: {
      intent: "legal_review",
      domain: "legal",
      riskLevel: "high",
      supportMode: "delegate_assisted",
      primaryAgent: {
        key: "j_360",
        displayName: "J_360",
        selectionReason: "Receita jurídica estruturada.",
        confidence: 0.88,
      },
      recipeSteps: [],
      governance: {
        tenantIdPresent: true,
        workspaceIdPresent: true,
        rbacEvaluated: true,
        entitlementEvaluated: true,
        trustScoreEvaluated: true,
        costGuardEvaluated: true,
        policyDecision: "allowed",
        reasonCode: null,
      },
      limitations: ["Apêndice técnico apenas para rastreabilidade."],
      howToProceedNow: [],
      recommendedRecipes: [],
      externalPlatformsInvolved: [],
      nextBestImplementationAction: null,
      practicalSteps: [],
      readyForRerunWhen: [],
      guardianReviewReason: [],
      requiresGuardianReview: false,
      allowedSelfServiceAgents: [],
      suggestedSelfServiceAgents: [],
      audit: {
        orchestrationDecisionId: null,
        selectedAt: null,
        basedOnPattern: "chat_imob_orchestrator",
      },
    },
    j360LegalReport: {
      schemaVersion: "j360_legal_report.v1",
      documentType: "politica_trabalhista",
      analysisScope: "Analise Juridica Trabalhista — Politica de Premiacao Treviso",
      workspaceBrand: {
        name: "Workspace Jurídico Treviso",
        logoUrl: "https://example.com/treviso-logo.png",
        primaryColor: "#0f4c81",
        accentColor: "#123456",
      },
      documentIdentity: {
        documentName: "Politica de Premiacao Treviso.pdf",
        generatedAt: "2026-06-05T15:00:00.000Z",
        reportVersion: "v1",
      },
      header: {
        number: "042/2026",
        interessado: "Treviso Transportes",
        assunto: "Politica de premiacao",
      },
      ementa: "DIREITO DO TRABALHO. POLITICA DE PREMIACAO. APROVADO COM RESSALVAS.",
      relatorioFactual: "A consulente busca avaliar a minuta antes do uso interno.",
      fundamentos: [
        {
          topic: "Natureza juridica da premiacao",
          analysis: "A redacao ainda exige reforco de liberalidade e desempenho extraordinario.",
          cltRefs: ["art. 457, §2º"],
          tstRefs: [],
          ojRefs: [],
          evidenceRefs: [
            {
              document: "Politica de Premiacao Treviso.pdf",
              sourceStatus: "provided",
              page: "2",
              section: "Natureza juridica da premiacao",
            },
          ],
        },
      ],
      references: {
        cltRefs: ["art. 457, §2º", "art. 457, §4º"],
        tstRefs: [],
        ojRefs: [],
      },
      executiveGuidance: {
        adjustNow: ["Revisar critérios de desempenho extraordinário."],
        dependsOnHumanReview: ["Validar a redação final com advogado trabalhista."],
        rerunWhen: ["Após revisar a base de cálculo e anexar a nova minuta."],
        readyForInternalUseWhen: ["Quando a versão final revisada for validada juridicamente."],
      },
      jurimetria: {
        riskOfLoss: "high",
        rationale: "Risco alto se a pratica real remunerar apenas desempenho ordinario.",
      },
      legalDecision: "APROVADO_COM_RESSALVAS",
      riskLevel: "high",
      summary: "Documento utilizavel com ajustes antes de uso interno.",
      strengths: ["base legal indicada"],
      attentionPoints: ["criterios ainda parecem ordinarios"],
      riskMatrix: [
        {
          risk: "habitualidade",
          severity: "high",
          relatedClause: null,
          impact: "pode haver passivo trabalhista",
          mitigation: "explicitar desempenho extraordinario",
          evidenceRefs: [
            {
              document: "Politica de Premiacao Treviso.pdf",
              sourceStatus: "provided",
              page: "3",
              section: "Base de cálculo, coerência e ambiguidades",
            },
          ],
        },
      ],
      ambiguities: ["base de calculo ambigua"],
      recommendedAdjustments: ["revisar redacao das reducoes"],
      recommendedEvidence: ["relatorio mensal de apuracao"],
      humanValidationQuestions: ["a pratica real segue os criterios descritos?"],
      manualReviewRequired: true,
      howToProceedNow: ["ajustar a minuta e rerodar a analise"],
      nextBestImplementationAction: "revisar criterios de desempenho extraordinario",
      coverageMatrix: [
        {
          whatParecerAsks: "natureza juridica da premiacao",
          whatRunAnswered: "o run encontrou risco de habitualidade",
          whatStillNeedsManualReview: "validar redacao final com advogado trabalhista",
        },
      ],
      conclusaoFormal: "Conclui-se pela aprovacao com ressalvas e revisao humana obrigatoria antes do uso final.",
    },
  },
  usuario: {},
  resumo: "resumo",
  contexto: "contexto",
  recomendacoes: [],
  insights: [],
  linksUteis: [],
  auditTrail: [],
  timeline: [],
} as const;

test("shouldUseJ360LegalRenderer activates for J_360 payload", () => {
  assert.equal(shouldUseJ360LegalRenderer(payload as any), true);
  const report = extractJ360LegalReport(payload as any);
  assert.ok(report);
  assert.equal(report?.header.number, "042/2026");
  assert.equal(report?.jurimetria.riskOfLoss, "high");
});

test("buildJ360LandingPageHtml renders clear legal sections", () => {
  const html = buildJ360LandingPageHtml(payload as any);
  assert.match(html, /Menu do parecer/i);
  assert.match(html, /href="#identificacao"/i);
  assert.match(html, /href="#fundamentacao"/i);
  assert.match(html, /Workspace Jurídico Treviso/i);
  assert.match(html, /treviso-logo\.png/i);
  assert.match(html, /border-bottom: 3px solid #0f4c81/i);
  assert.match(html, /Voltar ao topo/i);
  assert.match(html, /classList\.toggle\('is-active'/i);
  assert.match(html, /Ver evidências referenciadas/i);
  assert.match(html, /Identificação do parecer/i);
  assert.match(html, /01<\/span>[\s\S]*Ementa/i);
  assert.match(html, /I<\/span>[\s\S]*Relatório/i);
  assert.match(html, /II<\/span>[\s\S]*Fundamentação/i);
  assert.match(html, /Encaminhamento executivo/i);
  assert.match(html, /Quando o documento pode voltar para rerun/i);
  assert.match(html, /VI<\/span>[\s\S]*Conclusão/i);
  assert.match(html, /VII<\/span>[\s\S]*Ressalvas e revisão humana/i);
  assert.match(html, /VIII<\/span>[\s\S]*Encaminhamento executivo/i);
  assert.match(html, /IX<\/span>[\s\S]*Matriz de cobertura do parecer/i);
  assert.match(html, /Evidência referenciada/i);
  assert.doesNotMatch(html, /Deck no Figma|Deck no Canva|piloto supervisionado|API healthcheck/i);
  // E: documento real (sourceStatus "provided") continua sendo apresentado normalmente na lista de evidências.
  assert.match(html, /<li><strong>Politica de Premiacao Treviso\.pdf<\/strong>/i);
  assert.doesNotMatch(html, /Fonte não fornecida/i);
});

test("buildJ360LandingPageHtml flags evidence as not provided when no real document is resolved", () => {
  const notProvidedPayload = {
    ...payload,
    metadata: {
      ...payload.metadata,
      j360LegalReport: {
        ...payload.metadata.j360LegalReport,
        riskMatrix: [
          {
            risk: "habitualidade",
            severity: "high",
            relatedClause: null,
            impact: "pode haver passivo trabalhista",
            mitigation: "explicitar desempenho extraordinario",
            evidenceRefs: [
              {
                document: null,
                sourceStatus: "not_provided",
                page: null,
                section: null,
                excerpt: null,
              },
            ],
          },
        ],
      },
    },
  };

  const html = buildJ360LandingPageHtml(notProvidedPayload as any);
  // C: o placeholder fictício nunca é apresentado como se fosse uma evidência real.
  assert.doesNotMatch(html, /Documento jurídico anexado/i);
  // D: aviso explícito de ausência de fonte é exibido no lugar do placeholder.
  assert.match(html, /Fonte não fornecida/i);
  assert.match(html, /análise sem documento anexado real/i);
});

test("buildJ360PdfHtml renders coverage matrix", () => {
  const html = buildJ360PdfHtml(payload as any);
  assert.match(html, /Parecer Jurídico Trabalhista/i);
  assert.match(html, /Workspace Jurídico Treviso/i);
  assert.match(html, /treviso-logo\.png/i);
  assert.match(html, /Referências jurídicas consolidadas/i);
  assert.match(html, /O que ainda depende de advogado humano/i);
  assert.match(html, /Matriz de cobertura do parecer/i);
  assert.match(html, /revisão jurídica humana/i);
  assert.match(html, /@page\s*\{\s*size:\s*A4;\s*margin:\s*3cm 2cm 2cm 3cm;/i);
  assert.match(html, /font-family:\s*"Times New Roman", Times, serif/i);
  assert.match(html, /Parecer preliminar estruturado em formato documental, pronto para impressão e arquivo\./i);
  assert.match(html, /Versão do relatório/i);
  assert.doesNotMatch(html, /Deck no Figma|Deck no Canva|piloto supervisionado|API healthcheck/i);
});

function payloadWithEvidenceStatus(sourceStatus: "provided" | "not_provided" | "unknown") {
  const evidenceRef =
    sourceStatus === "provided"
      ? {
          document: "Politica de Premiacao Treviso.pdf",
          sourceStatus,
          page: "3",
          section: "Base de cálculo",
          excerpt: null,
        }
      : {
          document: null,
          sourceStatus,
          page: null,
          section: null,
          excerpt: null,
        };

  return {
    ...payload,
    metadata: {
      ...payload.metadata,
      j360LegalReport: {
        ...payload.metadata.j360LegalReport,
        fundamentos: payload.metadata.j360LegalReport.fundamentos.map((item) => ({
          ...item,
          evidenceRefs: [evidenceRef],
        })),
        riskMatrix: payload.metadata.j360LegalReport.riskMatrix.map((item) => ({
          ...item,
          evidenceRefs: [evidenceRef],
        })),
      },
    },
  };
}

test("legacy evidence source parses as unknown without inferring from document", () => {
  const legacyReport = JSON.parse(JSON.stringify(payload.metadata.j360LegalReport));
  delete legacyReport.riskMatrix[0].evidenceRefs[0].sourceStatus;
  delete legacyReport.fundamentos[0].evidenceRefs[0].sourceStatus;

  const parsed = J360LegalReportSchema.parse(legacyReport);

  assert.equal(parsed.riskMatrix[0]?.evidenceRefs[0]?.sourceStatus, "unknown");
  assert.equal(parsed.fundamentos[0]?.evidenceRefs[0]?.sourceStatus, "unknown");
  assert.equal(parsed.riskMatrix[0]?.evidenceRefs[0]?.document, "Politica de Premiacao Treviso.pdf");
});

test("legacy parse followed by serialization does not write back sourceStatus", () => {
  const legacyReport = JSON.parse(JSON.stringify(payload.metadata.j360LegalReport));
  delete legacyReport.riskMatrix[0].evidenceRefs[0].sourceStatus;
  delete legacyReport.fundamentos[0].evidenceRefs[0].sourceStatus;

  const serialized = JSON.stringify(J360LegalReportSchema.parse(legacyReport));

  assert.doesNotMatch(serialized, /"sourceStatus"/);
});

test("core landing and PDF render all source states without collapsing unknown", () => {
  const renderers = [
    buildJ360LandingPageHtml,
    buildJ360PdfHtml,
  ];

  for (const render of renderers) {
    const providedHtml = render(payloadWithEvidenceStatus("provided") as any);
    const notProvidedHtml = render(payloadWithEvidenceStatus("not_provided") as any);
    const unknownHtml = render(payloadWithEvidenceStatus("unknown") as any);

    assert.match(providedHtml, /Politica de Premiacao Treviso\.pdf/);
    assert.doesNotMatch(providedHtml, new RegExp(J360_LEGAL_SOURCE_NOT_PROVIDED_MESSAGE));
    assert.doesNotMatch(providedHtml, new RegExp(J360_LEGAL_SOURCE_UNKNOWN_MESSAGE));
    assert.match(notProvidedHtml, new RegExp(J360_LEGAL_SOURCE_NOT_PROVIDED_MESSAGE));
    assert.doesNotMatch(notProvidedHtml, new RegExp(J360_LEGAL_SOURCE_UNKNOWN_MESSAGE));
    assert.match(unknownHtml, new RegExp(J360_LEGAL_SOURCE_UNKNOWN_MESSAGE));
    assert.doesNotMatch(unknownHtml, new RegExp(J360_LEGAL_SOURCE_NOT_PROVIDED_MESSAGE));
  }
});

test("thin landing and PDF template wrappers preserve unknown source semantics", () => {
  const unknownPayload = payloadWithEvidenceStatus("unknown") as any;
  const landingHtml = buildJ360LandingTemplateHtml(unknownPayload);
  const pdfHtml = buildJ360PdfTemplateHtml(unknownPayload);

  for (const html of [landingHtml, pdfHtml]) {
    assert.match(html, new RegExp(J360_LEGAL_SOURCE_UNKNOWN_MESSAGE));
    assert.doesNotMatch(html, new RegExp(J360_LEGAL_SOURCE_NOT_PROVIDED_MESSAGE));
  }
});
