// Gerador determinístico do suggestedPrompt (D6, seção 10/22.6) — puro,
// síncrono, sem I/O. Por exigência de D6, esta geração NÃO pode envolver
// nenhuma chamada ao LLM: nenhuma chamada é feita, nenhuma rede é usada.
// Template simples sobre os campos já validados de RadarSignalResultV1
// (D5-B) — não interpreta nem infere nada além do que já está no payload.
import type { RadarSignalResultV1 } from "./radarSignalResultValidator";

export const SUGGESTED_PROMPT_RULE_VERSION = "suggested-prompt-rule.v1" as const;

const SIGNAL_TYPE_LABELS: Record<RadarSignalResultV1["signalType"], string> = {
  lead_intent_signal: "sinal de intenção de lead",
  account_lifecycle_signal: "sinal de ciclo de vida de conta",
  competitive_context_signal: "sinal de contexto competitivo",
  content_engagement_signal: "sinal de engajamento de conteúdo",
};

/**
 * Gera o `suggestedPrompt` a partir de um `RadarSignalResultV1` já validado
 * (D5-B). Determinística: mesma entrada, mesma saída, sempre — nunca
 * modifica o objeto recebido, nunca lê relógio, banco, rede ou ambiente.
 */
export function generateSuggestedPrompt(radarSignal: RadarSignalResultV1): string {
  const lines: string[] = [];
  const typeLabel = SIGNAL_TYPE_LABELS[radarSignal.signalType] ?? radarSignal.signalType;

  lines.push(`Contexto: ${typeLabel}, confiança "${radarSignal.confidenceLevel}".`);
  lines.push(`Título do sinal: ${radarSignal.title}`);
  lines.push(`Resumo: ${radarSignal.summary}`);
  lines.push(`Sujeito referenciado (identificador interno): ${radarSignal.subject.subjectId}`);

  if (radarSignal.evidence && radarSignal.evidence.length > 0) {
    lines.push("Evidências reportadas pelo produtor:");
    radarSignal.evidence.forEach((item, index) => {
      lines.push(`  ${index + 1}. ${item.description}`);
    });
  }

  if (radarSignal.opportunity) {
    lines.push(`Oportunidade sugerida pelo produtor: ${radarSignal.opportunity.summary}`);
    if (radarSignal.opportunity.suggestedAction) {
      lines.push(`Ação sugerida pelo produtor: ${radarSignal.opportunity.suggestedAction}`);
    }
  }

  lines.push(
    "Revise o conteúdo acima e produza o prompt final e os campos de negócio " +
      "aplicáveis para a tarefa do agente MKT."
  );

  return lines.join("\n");
}
