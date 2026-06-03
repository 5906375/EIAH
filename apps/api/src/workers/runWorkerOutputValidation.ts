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

export function detectRunWorkerOutputFailure(rawResponse: unknown): string | null {
  const finishReason = readOpenAiFinishReason(rawResponse);
  if (finishReason === "length") {
    return "llm_output_truncated: model output reached the response limit before completion";
  }
  return null;
}
