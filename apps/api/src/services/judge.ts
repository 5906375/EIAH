/**
 * judge.ts
 * AI-as-a-Judge / Heurístico — avalia resultados antes de persistir em memória.
 * Faz detecção de PII e aplica mascaramento preventivo (defense-in-depth).
 */

import { maskText } from "./masker";
import * as trustScoreEngine from "./trustScoreEngine";
import { emitRunEvent } from "./runEventEmitter";

interface JudgeResult {
  maskedText: string;
  flags: string[];
  score: number;
  reason?: string;
}

type JudgeContext = {
  runId: string;
  tenantId: string;
  workspaceId: string;
  userId?: string | null;
};

export async function judgeResult(
  agentId: string,
  resultText: string,
  context?: JudgeContext
): Promise<JudgeResult> {
  const flags: string[] = [];
  let masked = resultText ?? "";

  // Regras heurísticas de PII
  const piiRules = [
    { regex: /\b\d{3}\.\d{3}\.\d{3}\-\d{2}\b/g, label: "CPF" },
    { regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z]{2,}\b/gi, label: "EMAIL" },
    { regex: /\b\d{2}\s?\d{4,5}\-?\d{4}\b/g, label: "PHONE" },
    { regex: /token|secret|password|key/gi, label: "SECRET" },
  ];

  for (const { regex, label } of piiRules) {
    if (regex.test(masked)) {
      masked = maskText(masked, regex);
      flags.push(label);
    }
  }

  // Determina score: penaliza PII ou falha aparente
  const score = flags.length > 0 ? -2 : 1;
  const reason = flags.length > 0 ? `PII detected: ${flags.join(", ")}` : "Clean result";

  if (context) {
    await emitRunEvent({
      runId: context.runId,
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      userId: context.userId ?? undefined,
      type: "run.action.judge",
      payload: { agentId, flags, score, reason, masked: flags.length > 0 },
    });
  }

  // Atualiza confiança
  if (score < 0) {
    await trustScoreEngine.decrement(agentId, Math.abs(score), "pii_detected", context);
  } else {
    await trustScoreEngine.increment(agentId, score, "result_clean", context);
  }

  return { maskedText: masked, flags, score, reason };
}
