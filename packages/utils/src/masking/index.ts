/**
 * PII Masking Utility - EIAH_Builder
 * FASE 3: Governança Cognitiva & Compliance
 */

const PATTERNS = {
  CPF: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g,
  EMAIL: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  // Detecta chaves privadas (hex de 64 chars) e segredos sk_
  PRIVATE_KEY: /\b0x[a-fA-F0-9]{64}\b/g,
  API_KEY: /\bsk_(?:live|test)_[a-zA-Z0-9]{20,}\b/g,
};

/**
 * Mascara informacoes sensiveis em strings.
 * Se receber um objeto, deve ser stringificado antes ou tratado via recursao.
 */
export const maskPII = (text: string): string => {
  if (!text || typeof text !== "string") return text;

  let masked = text;

  // Mascarar CPF (Preserva apenas os 3 primeiros digitos para auditoria leve)
  masked = masked.replace(PATTERNS.CPF, (match) => {
    return `${match.slice(0, 3)}.***.***-**`;
  });

  // Mascarar Email (Preserva primeira letra e o dominio)
  masked = masked.replace(PATTERNS.EMAIL, (match) => {
    const [user, domain] = match.split("@");
    if (user.length <= 2) return `***@${domain}`;
    return `${user[0]}***${user[user.length - 1]}@${domain}`;
  });

  // Mascarar Chaves (Redacao Total)
  masked = masked.replace(PATTERNS.PRIVATE_KEY, "0x[REDACTED_PRIVATE_KEY]");
  masked = masked.replace(PATTERNS.API_KEY, "sk_**********[REDACTED]");

  return masked;
};
