import type { ParsedImobIntent } from "../imobIntentCatalog";

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeBatchOperationalLine(raw: string) {
  return raw
    .trim()
    .replace(/^\d+\.\s*/, "")
    .replace(/^[-*]\s*/, "")
    .replace(/\bcadstrar\b/gi, "cadastrar")
    .trim();
}

function normalizePropertyBulkLine(raw: string, normalizeText: (value: string) => string) {
  const line = normalizeBatchOperationalLine(raw);
  if (!line.includes("|")) return line;
  const parts = line.split("|").map((item) => item.trim()).filter(Boolean);
  if (parts.length < 4) return line;
  const [propertyType, goal, city, address] = parts;
  const normalizedGoal = normalizeText(goal);
  const goalLabel = normalizedGoal.includes("loca") || normalizedGoal.includes("alug")
    ? "locação"
    : normalizedGoal.includes("venda") || normalizedGoal.includes("compra")
      ? "venda"
      : goal;
  return `cadastrar imóvel ${propertyType} para ${goalLabel} em ${city} endereco ${address}`;
}

function isBatchOperationalLine(raw: string, normalizeText: (value: string) => string) {
  const normalized = normalizeText(normalizeBatchOperationalLine(raw));
  const normalizedBulk = normalizeText(normalizePropertyBulkLine(raw, normalizeText));
  return (
    normalized.startsWith("captar proprietario") ||
    normalized.startsWith("cadastrar proprietario") ||
    normalized.startsWith("cadastrar imovel") ||
    normalized.startsWith("cadastrar lead") ||
    normalized.startsWith("qualificar lead") ||
    normalizedBulk.startsWith("cadastrar imovel")
  );
}

function toCanonicalCommandFromParsedIntent(parsed: ParsedImobIntent): string | null {
  if (parsed.action !== "create") return null;
  if (parsed.entity === "proprietario" || parsed.entity === "vendedor" || parsed.entity === "locador") return "cadastrar proprietário";
  if (parsed.entity === "lead" || parsed.entity === "comprador" || parsed.entity === "locatario") return "qualificar lead";
  if (parsed.entity === "imovel") return "cadastrar imóvel";
  return null;
}

function extractComposedCommandsFromText(message: string, normalizeText: (value: string) => string) {
  const normalized = normalizeText(message)
    .replace(/\bcadstrar\b/g, "cadastrar")
    .replace(/\bcadastar\b/g, "cadastrar")
    .replace(/\bcadsatrar\b/g, "cadastrar");
  if (!/\be\b/.test(normalized)) return [];

  const matches: Array<{ idx: number; command: string }> = [];
  const ownerMatch = normalized.match(/\b(?:cadastrar|captar)\s+(?:o\s+|a\s+)?(?:proprietario|proprietaria|vendedor|vendedora|locador|locadora)\b/);
  if (ownerMatch?.index !== undefined) {
    matches.push({ idx: ownerMatch.index, command: "cadastrar proprietário" });
  }
  const leadMatch = normalized.match(/\b(?:qualificar|cadastrar)\s+(?:o\s+|a\s+)?(?:lead|cliente|comprador|compradora|locatario|locataria)\b/);
  if (leadMatch?.index !== undefined) {
    matches.push({ idx: leadMatch.index, command: "qualificar lead" });
  }

  const asksCurrentProperty = /\b(?:deste|desse|daquele)\s+imovel\b/.test(normalized);
  const asksNewProperty = /\bnovo\s+(?:imovel|imóvel|apartamento|apto|casa|terreno|chacara|chácara|sala|galpao|galpão)\b/.test(normalized);
  const propertyMatch = normalized.match(/\b(?:cadastrar|captar)\s+(?:(?:o|a)\s+)?(?:novo\s+)?(?:imovel|apartamento|apto|casa|terreno|chacara|chácara|sala|galpao|galpão)\b/);
  if (propertyMatch?.index !== undefined && (!asksCurrentProperty || asksNewProperty)) {
    matches.push({ idx: propertyMatch.index, command: "cadastrar imóvel" });
  }

  return matches
    .sort((a, b) => a.idx - b.idx)
    .map((item) => item.command);
}

function firstOperationalLine(text: string | null | undefined) {
  return (text ?? "").split(/\n+/).map((item) => item.trim()).find(Boolean) ?? "";
}

export function extractImobOperationalBatches(
  message: string,
  normalizeText: (value: string) => string,
  semanticComposedIntents?: ParsedImobIntent[] | null,
) {
  const semanticCommands = Array.isArray(semanticComposedIntents)
    ? semanticComposedIntents
      .map(toCanonicalCommandFromParsedIntent)
      .filter((item): item is string => Boolean(item))
    : [];
  if (semanticCommands.length >= 2) {
    return [semanticCommands];
  }

  const inlineCommands = extractComposedCommandsFromText(message, normalizeText);
  if (inlineCommands.length >= 2) {
    return [inlineCommands];
  }

  const groups: string[][] = [];
  let current: string[] = [];
  for (const raw of message.split("\n")) {
    const trimmed = raw.trim();
    if (!trimmed) {
      if (current.length > 0) {
        groups.push(current);
        current = [];
      }
      continue;
    }
    if (/^\d+\./.test(trimmed) && !isBatchOperationalLine(trimmed, normalizeText)) {
      if (current.length > 0) {
        groups.push(current);
        current = [];
      }
      continue;
    }
    if (!isBatchOperationalLine(trimmed, normalizeText)) continue;
    current.push(normalizePropertyBulkLine(trimmed, normalizeText));
  }
  if (current.length > 0) groups.push(current);
  return groups.filter((group) => group.length > 0);
}

export function formatImobBatchLineSummary(
  resolved: any,
  fallbackLine: string,
  formatCaseFlowLabel: (flow: string) => string,
) {
  const operational = asObject(resolved?.conversationState?.operational);
  const operationalFlow = asString(operational?.flow);
  const label = operationalFlow ? formatCaseFlowLabel(operationalFlow) : asString(resolved?.threadLabel) ?? fallbackLine;
  const pendingLabels = Array.isArray(asObject(resolved?.presentation)?.pendingFieldLabels)
    ? (asObject(resolved?.presentation)?.pendingFieldLabels as unknown[]).filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : Array.isArray(operational?.pendingFields)
      ? (operational?.pendingFields as unknown[]).filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [];

  if (operationalFlow === "owner.create") {
    return pendingLabels.length > 0
      ? `${label} | O cadastro do proprietário ainda precisa de complementos: ${pendingLabels.join(", ")}.`
      : `${label} | Proprietário cadastrado com sucesso.`;
  }
  if (operationalFlow === "property.create") {
    return pendingLabels.length > 0
      ? `${label} | O cadastro do imóvel ainda precisa de complementos: ${pendingLabels.join(", ")}.`
      : `${label} | Imóvel cadastrado com sucesso.`;
  }
  if (operationalFlow === "lead.qualify") {
    return pendingLabels.length > 0
      ? `${label} | O cadastro do lead ainda precisa de complementos: ${pendingLabels.join(", ")}.`
      : `${label} | Lead cadastrado e qualificado com sucesso.`;
  }

  const summary = firstOperationalLine(asString(asObject(resolved?.presentation)?.text) ?? "Operação processada.");
  return `${label} | ${summary}`;
}
