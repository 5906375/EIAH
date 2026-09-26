import assert from "node:assert/strict";
import test from "node:test";

import {
  J360_LEGAL_SOURCE_NOT_PROVIDED_MESSAGE,
  J360_LEGAL_SOURCE_UNKNOWN_MESSAGE,
} from "@eiah/core/actions/reporting/j360LegalReportRenderer";
import {
  buildJ360LegalReportHtmlBlock,
  type J360LegalReportView,
} from "./RunViewer";

function makeReport(
  sourceStatus: "provided" | "not_provided" | "unknown" | undefined,
): J360LegalReportView {
  return {
    schemaVersion: "j360_legal_report.v1",
    documentType: "contrato",
    analysisScope: "Revisão contratual",
    legalDecision: "APROVADO_COM_RESSALVAS",
    riskLevel: "medium",
    summary: "Revisão preliminar.",
    strengths: [],
    attentionPoints: [],
    riskMatrix: [
      {
        risk: "Cláusula ambígua",
        severity: "medium",
        relatedClause: null,
        impact: "Interpretação divergente.",
        mitigation: "Revisar redação.",
        evidenceRefs: [
          {
            document: sourceStatus === "provided" ? "Contrato real.pdf" : null,
            ...(sourceStatus ? { sourceStatus } : {}),
            page: sourceStatus === "provided" ? "4" : null,
            section: null,
            excerpt: null,
          },
        ],
      },
    ],
    ambiguities: [],
    recommendedAdjustments: [],
    recommendedEvidence: [],
    humanValidationQuestions: [],
    manualReviewRequired: true,
    executiveGuidance: {
      adjustNow: [],
      dependsOnHumanReview: [],
      rerunWhen: [],
      readyForInternalUseWhen: [],
    },
    howToProceedNow: [],
    nextBestImplementationAction: null,
    coverageMatrix: [],
  };
}

test("RunViewer HTML block renders provided, not_provided and unknown distinctly", () => {
  const providedHtml = buildJ360LegalReportHtmlBlock(makeReport("provided"));
  const notProvidedHtml = buildJ360LegalReportHtmlBlock(makeReport("not_provided"));
  const unknownHtml = buildJ360LegalReportHtmlBlock(makeReport("unknown"));

  assert.match(providedHtml, /Contrato real\.pdf/);
  assert.doesNotMatch(providedHtml, /Fonte não fornecida|Origem da fonte não registrada/);
  assert.match(notProvidedHtml, new RegExp(J360_LEGAL_SOURCE_NOT_PROVIDED_MESSAGE));
  assert.doesNotMatch(notProvidedHtml, new RegExp(J360_LEGAL_SOURCE_UNKNOWN_MESSAGE));
  assert.match(unknownHtml, new RegExp(J360_LEGAL_SOURCE_UNKNOWN_MESSAGE));
  assert.doesNotMatch(unknownHtml, new RegExp(J360_LEGAL_SOURCE_NOT_PROVIDED_MESSAGE));
});

test("RunViewer treats a legacy missing sourceStatus as unknown", () => {
  const html = buildJ360LegalReportHtmlBlock(makeReport(undefined));

  assert.match(html, new RegExp(J360_LEGAL_SOURCE_UNKNOWN_MESSAGE));
  assert.doesNotMatch(html, new RegExp(J360_LEGAL_SOURCE_NOT_PROVIDED_MESSAGE));
});
