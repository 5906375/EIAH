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

  const recomendacoes =
    input.recommendations ??
    [
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
    ];

  return buildBasePayload(input, {
    resumo: buildSummary(form),
    contexto: buildContext(form),
    recomendacoes,
    insights:
      input.insights ??
      [
        "Focar em comunicação proativa com champion.",
        "Mapear oportunidades de upsell para o próximo trimestre.",
      ],
  });
};
