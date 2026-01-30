import type { RunAtivoReportingInput, RunAtivoRecommendation } from "../../runAtivoSchema";

function selectTopRecommendation(recommendations: RunAtivoRecommendation[]) {
  if (!recommendations.length) {
    return null;
  }

  return [...recommendations].sort((a, b) => {
    const priorityA = a.prioridade ?? 3;
    const priorityB = b.prioridade ?? 3;
    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }
    const scoreA = typeof a.score === "number" ? a.score : 0;
    const scoreB = typeof b.score === "number" ? b.score : 0;
    return scoreB - scoreA;
  })[0];
}

export function buildAlertPayload(payload: RunAtivoReportingInput) {
  const top = selectTopRecommendation(payload.recomendacoes);

  if (!top) {
    return {
      message: `Run ${payload.metadata.runId ?? ""}: sem recomendações para destacar.`,
      severity: "low" as const,
    };
  }

  const severity = ((): "low" | "medium" | "high" => {
    if ((top.prioridade ?? 3) <= 2) return "high";
    if ((top.prioridade ?? 3) === 3) return "medium";
    return "low";
  })();

  const resumo = payload.resumo ?? "Sem resumo";
  const message = [
    `Alerta ${severity === "high" ? "crítico" : severity === "medium" ? "prioritário" : "informativo"}`,
    `Run ${payload.metadata.runId ?? "—"} — ${top.titulo}`,
    top.proximosPassos ? `Próximo passo: ${top.proximosPassos}` : "",
    `Resumo: ${resumo}`,
  ]
    .filter(Boolean)
    .join(". ");

  return {
    message,
    severity,
    highlight: top.titulo,
  };
}
