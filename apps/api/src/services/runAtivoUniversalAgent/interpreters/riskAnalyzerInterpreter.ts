import type { RunAtivoInterpreter } from "../types";
import { buildBasePayload } from "./utils";

const buildSummary = (form: Record<string, unknown> = {}) => {
  const context =
    typeof form.context === "string" && form.context.trim()
      ? form.context
      : "Sem contexto declarado";
  const jurisdiction =
    typeof form.jurisdiction === "string" && form.jurisdiction.trim()
      ? form.jurisdiction
      : "Juridição não informada";
  return `Contexto: ${context} | Jurisdições: ${jurisdiction}`;
};

export const interpretRiskAnalyzer: RunAtivoInterpreter = (input) => {
  const form = (input.form as Record<string, unknown>) ?? {};

  const recomendacoes =
    input.recommendations ??
    [
      {
        prioridade: 2,
        titulo: "Atualizar checklist regulatório",
        descricao: "Validar exigências para as jurisdições listadas.",
        proximosPassos: "Revisar com jurídico e publicar checklist final.",
        tags: ["compliance"],
      },
      {
        prioridade: 3,
        titulo: "Implementar guardrails adicionais",
        descricao: "Mapear assets sensíveis e definir controles.",
        proximosPassos: "Registrar plano de mitigação e owners.",
        tags: ["governanca"],
      },
    ];

  const insights =
    input.insights ??
    [
      "Reforçar logging e trilhas de auditoria para eventos críticos.",
      "Adicionar testes de conformidade automatizados antes de produção.",
    ];

  return buildBasePayload(input, {
    resumo: buildSummary(form),
    contexto:
      typeof form.controls === "string" && form.controls.trim()
        ? form.controls
        : "Nenhum controle existente informado. Recomenda-se adicionar políticas mínimas.",
    recomendacoes,
    insights,
  });
};
