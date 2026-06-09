type PlainObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readOpenAiFinishReason(rawResponse: unknown): string | null {
  if (!isPlainObject(rawResponse)) return null;
  const choices = rawResponse.choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const firstChoice = choices[0];
  if (!isPlainObject(firstChoice) || typeof firstChoice.finish_reason !== "string") {
    return null;
  }
  return firstChoice.finish_reason;
}

function normalizeText(value: string | null | undefined) {
  return value
    ?.toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") ?? "";
}

function countUsefulMktSections(outputText: string) {
  const normalized = normalizeText(outputText);
  const markers = [
    "resumo",
    "kpis",
    "icp",
    "posicionamento",
    "oferta",
    "canais",
    "cronograma",
    "timeline",
    "proximos passos",
    "compliance",
  ];
  return markers.filter((marker) => normalized.includes(marker)).length;
}

function shouldAllowPartialMktOutput(params: {
  agentId?: string | null;
  outputText?: string | null;
}) {
  const normalizedAgent = params.agentId?.trim().toLowerCase() ?? "";
  if (normalizedAgent !== "mkt") return false;
  const outputText = params.outputText?.trim() ?? "";
  if (outputText.length < 400) return false;
  return countUsefulMktSections(outputText) >= 4;
}

type DetectRunWorkerOutputFailureParams = {
  rawResponse: unknown;
  agentId?: string | null;
  outputText?: string | null;
};

export function detectRunWorkerOutputFailure(params: DetectRunWorkerOutputFailureParams): string | null {
  const finishReason = readOpenAiFinishReason(params.rawResponse);
  if (finishReason === "length") {
    if (shouldAllowPartialMktOutput(params)) {
      return null;
    }
    return "llm_output_truncated: model output reached the response limit before completion";
  }
  return null;
}
