import type { J360LegalReport } from "@eiah/core";
import type { RunAtivoInterpreter } from "../types";
import { buildBasePayload } from "./utils";

const buildSummary = (form: Record<string, unknown> = {}) => {
  const account = form.account ?? form.cliente ?? "Conta não informada";
  const icp = form.icpFit ?? form.segment ?? "ICP não informado";
  return `Conta: ${account} | ICP: ${icp}`;
};

const buildContext = (form: Record<string, unknown> = {}) => {
  const status = form.currentStatus ?? "Status não informado.";
  const stakeholders = form.stakeholders
    ? `Stakeholders: ${form.stakeholders}`
    : "Stakeholders não informados.";
  const nextMeeting = form.nextMeeting ? `Próxima reunião: ${form.nextMeeting}.` : "";
  return `${status} ${stakeholders} ${nextMeeting}`.trim();
};

export const interpretJ360: RunAtivoInterpreter = (input) => {
  const form = (input.form as Record<string, unknown>) ?? {};
  const report =
    input.metadata?.j360LegalReport && typeof input.metadata.j360LegalReport === "object"
      ? (input.metadata.j360LegalReport as J360LegalReport)
      : null;

  const reportRecommendations =
    report?.recommendedAdjustments.map((item, index) => ({
      prioridade: index + 1,
      titulo: item,
      descricao: item,
      proximosPassos: report.nextBestImplementationAction ?? item,
      tags: ["legal_review", "j_360"],
    })) ?? [];

  const recomendacoes =
    input.recommendations ??
    (reportRecommendations.length > 0
      ? reportRecommendations
      : [
          {
            prioridade: 1,
            titulo: "Agendar briefing com champion",
            descricao: "Refinar necessidades e definir plano de expansão.",
            proximosPassos: "Enviar agenda e confirmar presença dos decisores.",
            tags: ["conta", "expansão"],
          },
          {
            prioridade: 2,
            titulo: "Revisar riscos de churn",
            descricao: "Verificar últimos indicadores e QBR pendentes.",
            proximosPassos: "Consolidar dados de uso e planejar follow-up.",
            tags: ["risco", "qbr"],
          },
        ]);

  return buildBasePayload(input, {
    resumo: report?.summary ?? buildSummary(form),
    contexto:
      report != null
        ? `${report.analysisScope} · decisão ${report.legalDecision} · risco ${report.riskLevel}.`
        : buildContext(form),
    recomendacoes,
    insights: report
      ? [
          ...report.strengths.slice(0, 2),
          ...report.attentionPoints.slice(0, 2),
          ...(report.manualReviewRequired ? ["Revisão jurídica humana continua necessária antes do uso final."] : []),
        ]
      : input.insights ??
        [
          "Focar em comunicação proativa com champion.",
          "Mapear oportunidades de upsell para o próximo trimestre.",
        ],
    auditTrail: report
      ? [
          { titulo: "Decisão jurídica", detalhe: report.legalDecision },
          { titulo: "Risco consolidado", detalhe: report.riskLevel },
          { titulo: "Revisão humana", detalhe: report.manualReviewRequired ? "recomendada" : "não obrigatória" },
        ]
      : undefined,
    metadata: {
      ...input.metadata,
      ...(report ? { j360LegalReport: report } : {}),
    } as any,
  });
};
