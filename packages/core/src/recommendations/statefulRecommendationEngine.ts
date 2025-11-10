import crypto from "node:crypto";

type FeedbackStatus = "ADOTADO" | "REJEITADO" | "PENDENTE";

export type RecommendationFeedback = {
  explicit?: string | null;
  click?: boolean | null;
  status?: string | null;
};

export type PreviousRecommendation = {
  key?: string | null;
  tatica?: string | null;
  prioridade?: number | null;
  score?: number | null;
  adopted?: boolean | null;
  status?: string | null;
  feedback?: RecommendationFeedback | null;
  rationale?: string | null;
  proximos_passos?: string | null;
  motivo_da_priorizacao?: {
    accepts?: number;
    rejects?: number;
    w?: number;
    s?: number;
    score?: number;
  } | null;
  execucao?: RecommendationExecution | null;
  parametros?: unknown;
  parameters?: unknown;
};

export type PreviousRun = {
  id?: string;
  createdAt?: string;
  recomendacoes?: PreviousRecommendation[] | null;
};

export type RecommendationExecution = {
  api_sugerida: string;
  tipo_tarefa: string;
  custo_estimado_tokens: number;
  modelo_alternativo?: string;
};

export type RecommendationCandidate = {
  key?: string | null;
  tatica: string;
  rationale?: string;
  proximos_passos?: string;
  execucao?: RecommendationExecution;
  parametros?: unknown;
  metadata?: {
    exploration?: boolean;
    preferredModel?: string;
    preferredTaskType?: string;
  };
};

export type RecommendationStateEntry = {
  adopted: boolean;
  accepts: number;
  rejects: number;
  lastAcceptedAt: string | null;
  lastSuggestedAt: string | null;
  score: number;
  status: FeedbackStatus;
};

export type AgentRecommendationState = {
  recommendations: Record<string, RecommendationStateEntry>;
  client_preferences?: Record<string, boolean>;
  best_performing_tactics?: string[];
  version: number;
};

export type GenerateRecommendationsInput = {
  agentId: string;
  runId: string;
  candidates: RecommendationCandidate[];
  previousRuns?: PreviousRun[] | null;
  agentState?: AgentRecommendationState | null;
  maxRecommendations?: number;
  explorationPercentage?: number;
  now?: Date;
};

export type GeneratedRecommendation = {
  key: string;
  tatica: string;
  prioridade: number;
  score: number;
  adopted: boolean;
  rationale: string;
  proximos_passos: string;
  motivo_da_priorizacao: {
    accepts: number;
    rejects: number;
    w: number;
    s: number;
    score: number;
  };
  execucao: RecommendationExecution;
};

export type GenerateRecommendationsResult = {
  agent: string;
  run_id: string;
  recomendacoes: GeneratedRecommendation[];
  diagnostico: {
    total_prev_runs: number;
    itens_avaliados: number;
    exploracao_pct: number;
    filtrados_adotados: number;
    filtrados_rejeitados: number;
  };
  agentState: AgentRecommendationState;
};

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function defaultStateEntry(): RecommendationStateEntry {
  return {
    adopted: false,
    accepts: 0,
    rejects: 0,
    lastAcceptedAt: null,
    lastSuggestedAt: null,
    score: 0.5,
    status: "PENDENTE",
  };
}

function toIsoString(date: Date) {
  return date.toISOString();
}

function safeParseDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function deriveKey(rec: PreviousRecommendation | RecommendationCandidate) {
  if (rec.key && typeof rec.key === "string" && rec.key.trim().length > 0) {
    return rec.key;
  }

  const basePayload = {
    tatica: rec.tatica ?? "desconhecida",
    parametros: (rec as PreviousRecommendation).parametros ?? (rec as RecommendationCandidate).parametros ?? null,
  };

  const hash = crypto
    .createHash("sha1")
    .update(JSON.stringify(basePayload))
    .digest("hex")
    .slice(0, 12);

  return `auto_${hash}`;
}

function isAcceptance(feedback: RecommendationFeedback | null | undefined) {
  if (!feedback) return false;
  if (feedback.explicit && feedback.explicit.toLowerCase() === "aceito") return true;
  if (feedback.click === true) return true;
  if (feedback.status) {
    const normalized = feedback.status.toLowerCase();
    if (["implementado", "em_execucao", "em execução"].includes(normalized)) return true;
  }
  return false;
}

function isRejection(feedback: RecommendationFeedback | null | undefined) {
  if (!feedback) return false;
  if (feedback.explicit && feedback.explicit.toLowerCase() === "rejeitado") return true;
  if (feedback.status) {
    const normalized = feedback.status.toLowerCase();
    if (["rejeitado", "cancelado", "descartado"].includes(normalized)) return true;
  }
  return false;
}

function computeDecayWeight(now: Date, entry: RecommendationStateEntry) {
  const reference =
    safeParseDate(entry.lastAcceptedAt ?? undefined) ??
    safeParseDate(entry.lastSuggestedAt ?? undefined);
  if (!reference) {
    return 0.5;
  }
  const deltaMs = now.getTime() - reference.getTime();
  const deltaDays = Math.max(0, deltaMs / MS_PER_DAY);
  return Math.exp(-deltaDays / 30);
}

function computeQualityScore(entry: RecommendationStateEntry) {
  const accepts = entry.accepts;
  const rejects = entry.rejects;
  return (accepts + 1) / (accepts + rejects + 2);
}

function adjustScoreForPreferences(
  score: number,
  tatica: string,
  preferences?: Record<string, boolean>
) {
  if (!preferences) return score;
  const normalized = tatica.toLowerCase();
  let adjustment = 0;

  Object.entries(preferences).forEach(([key, liked]) => {
    if (normalized.includes(key.toLowerCase())) {
      adjustment += liked ? 0.1 : -0.1;
    }
  });

  return clamp(score + adjustment, 0, 1);
}

function inferExecution(tatica: string, candidate?: RecommendationCandidate): RecommendationExecution {
  if (candidate?.execucao) {
    return candidate.execucao;
  }

  const normalized = tatica.toLowerCase();
  if (normalized.includes("copy") || normalized.includes("email") || normalized.includes("social")) {
    return {
      api_sugerida: "GPT_3_5_TURBO",
      tipo_tarefa: "COPYWRITING_HIGH_VOLUME",
      custo_estimado_tokens: 600,
      modelo_alternativo: "GEMINI_PRO",
    };
  }

  if (normalized.includes("atribuição") || normalized.includes("estrategia") || normalized.includes("strategy")) {
    return {
      api_sugerida: "GEMINI_4_PRO",
      tipo_tarefa: "ESTRATEGIA_COMPLEXA",
      custo_estimado_tokens: 1200,
      modelo_alternativo: "GPT_4",
    };
  }

  return {
    api_sugerida: "GEMINI_PRO",
    tipo_tarefa: "ANALISE_OPERACIONAL",
    custo_estimado_tokens: 800,
    modelo_alternativo: "GPT_4",
  };
}

export function generateStatefulRecommendations(
  input: GenerateRecommendationsInput
): GenerateRecommendationsResult {
  const {
    agentId,
    runId,
    candidates,
    previousRuns = [],
    now = new Date(),
    explorationPercentage = 20,
    maxRecommendations = 5,
  } = input;
  const normalizedPreviousRuns = previousRuns ?? [];

  const agentState: AgentRecommendationState = input.agentState
    ? {
        ...input.agentState,
        recommendations: { ...input.agentState.recommendations },
        client_preferences: input.agentState.client_preferences
          ? { ...input.agentState.client_preferences }
          : undefined,
        best_performing_tactics: input.agentState.best_performing_tactics
          ? [...input.agentState.best_performing_tactics]
          : undefined,
      }
    : {
        recommendations: {},
        version: 1,
      };

  const recommendations = agentState.recommendations;

  let historicoItens = 0;
  let filtradosAdotados = 0;
  let filtradosRejeitados = 0;

  normalizedPreviousRuns.forEach((run) => {
    const runDate = safeParseDate(run.createdAt ?? undefined) ?? now;
    run.recomendacoes?.forEach((item) => {
      if (!item || (!item.tatica && !item.key)) {
        return;
      }
      historicoItens += 1;
      const key = deriveKey(item);
      const entry = recommendations[key] ?? defaultStateEntry();
      entry.lastSuggestedAt = toIsoString(runDate);

      const accepted = isAcceptance(item.feedback);
      const rejected = isRejection(item.feedback);

      if (accepted) {
        entry.accepts += 1;
        entry.adopted = true;
        entry.status = "ADOTADO";
        entry.lastAcceptedAt = toIsoString(runDate);
      } else if (rejected) {
        entry.rejects += 1;
        entry.adopted = false;
        entry.status = "REJEITADO";
      } else if (item.status) {
        const normalized = item.status.toLowerCase();
        if (["adotado", "implementado", "em_execucao", "em execução"].includes(normalized)) {
          entry.adopted = true;
          entry.status = "ADOTADO";
          entry.lastAcceptedAt = toIsoString(runDate);
        } else if (["rejeitado", "cancelado", "descartado"].includes(normalized)) {
          entry.adopted = false;
          entry.status = "REJEITADO";
        }
      }

      recommendations[key] = entry;
    });
  });

  const filteredCandidates = candidates
    .map((candidate, index) => {
      const key = deriveKey(candidate);
      const entry = recommendations[key] ?? defaultStateEntry();

      recommendations[key] = entry;

      const decayWeight = computeDecayWeight(now, entry);
      const qualityScore = computeQualityScore(entry);
      const baseScore = clamp(0.7 * qualityScore + 0.3 * decayWeight, 0, 1);

      if (entry.accepts === 0 && entry.rejects === 0) {
        entry.score = 0.5;
      } else {
        entry.score = baseScore;
      }

      const adjustedScore = adjustScoreForPreferences(
        entry.score,
        candidate.tatica,
        agentState.client_preferences
      );

      const status = entry.status;
      if (status === "ADOTADO") {
        filtradosAdotados += 1;
      }
      if (status === "REJEITADO") {
        filtradosRejeitados += 1;
      }

      return {
        key,
        candidate,
        entry,
        originalIndex: index,
        baseScore: entry.score,
        adjustedScore,
        decayWeight,
        qualityScore,
      };
    })
    .filter((item) => item.entry.status !== "ADOTADO" && item.entry.status !== "REJEITADO");

  filteredCandidates.sort((a, b) => {
    if (b.adjustedScore !== a.adjustedScore) {
      return b.adjustedScore - a.adjustedScore;
    }
    return a.originalIndex - b.originalIndex;
  });

  const totalToSelect = Math.min(maxRecommendations, filteredCandidates.length);
  const exploitationCount = Math.max(0, Math.round(totalToSelect * (1 - explorationPercentage / 100)));
  const explorationCount = totalToSelect - exploitationCount;

  const exploitation = filteredCandidates.slice(0, exploitationCount);

  const explorationPool = filteredCandidates.slice(exploitationCount).filter((item) => {
    const evidence = item.entry.accepts + item.entry.rejects;
    return evidence <= 1 || item.candidate.metadata?.exploration === true;
  });

  const exploration = explorationPool.slice(0, explorationCount);

  const combined = [...exploitation, ...exploration];
  combined.sort((a, b) => {
    if (b.adjustedScore !== a.adjustedScore) return b.adjustedScore - a.adjustedScore;
    return a.originalIndex - b.originalIndex;
  });

  const selected = combined.slice(0, totalToSelect);

  const nowIso = toIsoString(now);

  const recomendacoes: GeneratedRecommendation[] = selected.map((item, idx) => {
    const entry = recommendations[item.key] ?? defaultStateEntry();
    entry.lastSuggestedAt = nowIso;

    const score = clamp(item.adjustedScore, 0, 1);
    entry.score = score;
    if (entry.status === "PENDENTE" && entry.adopted && entry.accepts > 0) {
      entry.status = "ADOTADO";
    }

    recommendations[item.key] = entry;

    const rationale = item.candidate.rationale ?? `Priorizar ${item.candidate.tatica} neste ciclo.`;
    const proximosPassos =
      item.candidate.proximos_passos ?? "Definir DRI, cronograma e métricas de validação antes do próximo checkpoint.";

    return {
      key: item.key,
      tatica: item.candidate.tatica,
      prioridade: idx + 1,
      score,
      adopted: entry.adopted,
      rationale,
      proximos_passos: proximosPassos,
      motivo_da_priorizacao: {
        accepts: entry.accepts,
        rejects: entry.rejects,
        w: Number(item.decayWeight.toFixed(4)),
        s: Number(item.qualityScore.toFixed(4)),
        score: Number(score.toFixed(4)),
      },
      execucao: inferExecution(item.candidate.tatica, item.candidate),
    };
  });

  const diagnostico = {
    total_prev_runs: normalizedPreviousRuns.length,
    itens_avaliados: historicoItens,
    exploracao_pct:
      recomendacoes.length === 0
        ? 0
        : Math.round((exploration.length / recomendacoes.length) * 100),
    filtrados_adotados: filtradosAdotados,
    filtrados_rejeitados: filtradosRejeitados,
  };

  agentState.recommendations = recommendations;

  return {
    agent: agentId,
    run_id: runId,
    recomendacoes,
    diagnostico,
    agentState,
  };
}

export type BuildRecommendationPromptOptions = {
  agentId: string;
  runIdPlaceholder?: string;
  maxRecommendations?: number;
  explorationPercentage?: number;
};

export function buildRecommendationPrompt(opts: BuildRecommendationPromptOptions) {
  const {
    agentId,
    runIdPlaceholder = "<uuid>",
    maxRecommendations = 5,
    explorationPercentage = 20,
  } = opts;

  const prompt = `Você é um agente EIAH com Memória/State persistente por agente, pronto para roteamento de APIs. Antes de responder, carregue \`metadata.previousRuns\` e \`agentState\` deste \`agent_id\`.

Objetivo: priorizar novas recomendações úteis sem repetir adotadas, evitar insistir em rejeitadas e aprender com feedback.

Sinais de aceitação: \`feedback.explicit=="aceito"\` OU \`feedback.click==true\` OU \`feedback.status in ["implementado","em_execucao"]\`.

Chave estável: \`rec.key\`. Se faltar, derive hash de {tática, parâmetros}.

Estado por agente (\`agentState\`):
- recommendations[rec.key]: { adopted: bool, accepts: int, rejects: int, lastAcceptedAt: iso|null, lastSuggestedAt: iso|null, score: float, status: "ADOTADO"|"REJEITADO"|"PENDENTE" }
- client_preferences: pares chave→bool
- best_performing_tactics: string[]
- version: int

Score por rec.key (a cada run):
- w = exp(-deltaDias/30) com base em \`lastAcceptedAt || lastSuggestedAt\`.
- s = (accepts+1) / (accepts+rejects+2).
- score = clamp(0, 0.7*s + 0.3*w, 1).

Pipeline:
1) Reconstrua accepts/rejects/status a partir de \`previousRuns\`.
2) Atualize/persista \`agentState.recommendations\` e \`score\`.
3) Filtre: EXCLUA \`status=="REJEITADO"\`. Trate \`status=="ADOTADO"\` como baseline operacional: não sugerir novamente; apenas citar dependências, checagens e próximos passos.
4) Ordene remanescentes por \`score\` desc. Dedup por \`rec.key\`.
5) Gere até ${maxRecommendations} recomendações: ${Math.round(
    100 - explorationPercentage
  )}% top-score + ${explorationPercentage}% exploração (novas/baixa evidência). Marque cada item com \`{key, tatica, prioridade, score, adopted, rationale, proximos_passos, motivo_da_priorizacao:{accepts,rejects,w,s,score}, execucao:{api_sugerida, tipo_tarefa, custo_estimado_tokens, modelo_alternativo}}\`. Use \`api_sugerida\` para indicar o LLM mais eficiente (ex: GEMINI_4_PRO, GPT_4, GEMINI_PRO, GPT_3_5_TURBO) e \`tipo_tarefa\` (ex: ESTRATEGIA_COMPLEXA, COPYWRITING_HIGH_VOLUME, QA_TESTING).
6) Ao receber feedback, atualize accepts/rejects, \`adopted\` e \`status\` (PENDENTE→ADOTADO/REJEITADO). Persista \`agentState\`.

Regras globais EIAH:
- Cada agente possui \`agentState\` próprio. Mesmo esquema.
- Sem dados: produzir baseline com \`score=0.5\` e rotular como exploração.
- Nunca repetir a mesma \`key\` na mesma run.
- Preferências do cliente ajustam prioridade (+/-) de 0.05 a 0.15 no \`score\`.

Saída obrigatória:
{
  "agent": "${agentId}",
  "run_id": "${runIdPlaceholder}",
  "recomendacoes": [
    {
      "key": "multi_touch_attrib",
      "tatica": "Atribuição Multi-Touch",
      "prioridade": 1,
      "score": 0.82,
      "adopted": false,
      "rationale": "...",
      "proximos_passos": "...",
      "motivo_da_priorizacao": { "accepts": 3, "rejects": 0, "w": 0.74, "s": 0.80, "score": 0.82 },
      "execucao": { "api_sugerida": "GEMINI_4_PRO", "tipo_tarefa": "ESTRATEGIA_COMPLEXA", "custo_estimado_tokens": 1200 }
    }
  ],
  "diagnostico": {
    "total_prev_runs": <int>,
    "itens_avaliados": <int>,
    "exploracao_pct": ${explorationPercentage},
    "filtrados_adotados": <int>,
    "filtrados_rejeitados": <int>
  }
}
`;

  return prompt.trim();
}
