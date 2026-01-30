/**
 * masker.ts
 * Utilitário simples de mascaramento de PII e dados sensíveis.
 * Usado pelo Judge antes da persistência em memória de curto prazo.
 */

export function maskText(
  text: string,
  regex: RegExp,
  replacement = "[REDACTED]"
): string {
  try {
    return text.replace(regex, replacement);
  } catch {
    return text;
  }
}

/**
 * Máscara completa de PII — usada para sanitizar blocos inteiros.
 */
export function fullMask(text: string): string {
  if (!text) return "";
  return "[REDACTED]";
}
