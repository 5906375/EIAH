import type { GuardianReport, RunAtivoInterpreter } from "@eiah/core";
import { buildBasePayload } from "./utils";

function asGuardianReport(input: unknown): GuardianReport | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const record = input as Record<string, unknown>;
  if (
    typeof record.route !== "string" ||
    typeof record.guardianDecision !== "string" ||
    typeof record.reasonCode !== "string"
  ) {
    return null;
  }
  return record as unknown as GuardianReport;
}

function buildGuardianInsights(report: GuardianReport) {
  const insights = [
    `Decisão Guardian: ${report.guardianDecision}.`,
    `Status das evidências: ${report.evidenceStatus}.`,
    `PII / dados sensíveis: ${report.piiStatus}.`,
  ];
  if (report.blockingIssues.length > 0) {
    insights.push(`Bloqueios críticos: ${report.blockingIssues.map((item) => item.code).join(", ")}.`);
  }
  return insights;
}

export const interpretGuardian: RunAtivoInterpreter = (input) => {
  const report = asGuardianReport(input.metadata?.guardianReport);

  const fallbackSummary =
    typeof input.resumo === "string" && input.resumo.trim().length > 0
      ? input.resumo
      : "Parecer Guardian indisponível. O payload probatório não foi normalizado.";

  return buildBasePayload(input, {
    resumo: report?.summary ?? fallbackSummary,
    contexto: report
      ? `Rota ${report.route} · runStatus ${report.runStatus} · decisão ${report.guardianDecision} · evidências ${report.evidenceStatus}.`
      : "Fluxo Guardian sem parecer probatório estruturado.",
    insights: report ? buildGuardianInsights(report) : ["Payload Guardian ausente ou incompatível para export probatório."],
    cta: {
      titulo: "Próxima ação recomendada",
      descricao: report?.nextAction ?? report?.nextSteps[0] ?? "Reexecutar a validação com evidências completas.",
    },
    linksUteis: [],
    auditTrail: report
      ? [
          { titulo: "ReasonCode", detalhe: report.reasonCode },
          { titulo: "Trace ID", detalhe: report.auditTrail.traceId ?? "não informado" },
          { titulo: "Verify URL", detalhe: report.auditTrail.verifyUrl ?? "não informado" },
        ]
      : [],
    metadata: {
      ...input.metadata,
      guardianReport: report,
    } as any,
  });
};
