import type { RunAtivoInterpreter } from "../types";
import { buildBasePayload } from "./utils";

const buildSummary = (form: Record<string, unknown> = {}) => {
  const parts = [
    form.goal ? `Objetivo: ${form.goal}` : "",
    form.audience ? `Audiência: ${form.audience}` : "",
    form.channels ? `Canais: ${(form.channels as string[]).join(", ")}` : "",
    form.budget ? `Budget: ${form.budget}` : "",
    form.launchDate ? `Lançamento: ${form.launchDate}` : "",
    form.toneProfile ? `Tom: ${form.toneProfile}` : "",
  ].filter(Boolean);
  return parts.join(" | ") || "Nenhum briefing disponível.";
};

const buildContext = (form: Record<string, unknown> = {}) => {
  const notes = form.notes ? String(form.notes) : "Sem notas adicionais.";
  const deadline = form.deadline ? `Deadline informado: ${form.deadline}.` : "";
  return `${notes} ${deadline}`.trim();
};

const buildInsight = (form: Record<string, unknown> = {}) => {
  if (!form.channels) {
    return ["Nenhum canal destacado pelo formulário."];
  }
  const totalChannels = Array.isArray(form.channels) ? form.channels.length : 1;
  return [
    `Plano sugere atuação em ${totalChannels} canais com foco em ${
      form.toneProfile ?? "tom institucional"
    }.`,
  ];
};

export const interpretMkt: RunAtivoInterpreter = (input) => {
  const form = (input.form as Record<string, unknown>) ?? {};

  const recomendacoes =
    input.recommendations ??
    [
      {
        prioridade: 2,
        titulo: "Campanha segmentada por email",
        descricao: "Sequência nutridora focada no público informado.",
        proximosPassos: "Configurar automação e revisar GCLID antes de enviar.",
        tags: ["email", "nutrição"],
      },
      {
        prioridade: 3,
        titulo: "Criativos para LinkedIn + eventos",
        descricao: "Explorar conteúdo educativo antes do lançamento.",
        proximosPassos: "Listar tópicos e responsáveis por canal.",
        tags: ["LinkedIn", "Eventos"],
      },
    ];

  return buildBasePayload(input, {
    resumo: buildSummary(form),
    contexto: buildContext(form),
    insights: input.insights ?? buildInsight(form),
    recomendacoes,
  });
};
