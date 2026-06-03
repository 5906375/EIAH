import type { TenantRecipe } from "@/lib/api";
import type { GenericAgentConfig } from "./config";

type RecipeSections = Record<string, string>;

function normalizeKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function splitParagraphs(text: string) {
  return text
    .split(/\n\s*\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractSections(instructions: string): RecipeSections {
  const sections: RecipeSections = {};
  let currentKey: string | null = null;

  for (const rawLine of instructions.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const match = line.match(/^([^:]{2,40}):\s*(.*)$/);
    if (match) {
      currentKey = normalizeKey(match[1]);
      sections[currentKey] = match[2].trim();
      continue;
    }

    if (currentKey) {
      sections[currentKey] = `${sections[currentKey]}\n${line}`.trim();
    }
  }

  return sections;
}

function uniqueParts(parts: Array<string | null | undefined>) {
  const seen = new Set<string>();
  return parts
    .map((item) => item?.trim())
    .filter((item): item is string => Boolean(item))
    .filter((item) => {
      const normalized = item.toLowerCase();
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
}

function joinParts(parts: Array<string | null | undefined>) {
  return uniqueParts(parts).join("\n\n");
}

function findSection(sections: RecipeSections, aliases: string[]) {
  for (const alias of aliases) {
    const value = sections[normalizeKey(alias)];
    if (value) return value;
  }
  return "";
}

function truncateSentence(value: string, maxLength = 220) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function inferGuardianRequestType(recipe: TenantRecipe, instructions: string) {
  const haystack = `${recipe.title} ${recipe.summary} ${instructions}`.toLowerCase();
  if (haystack.includes("domain") || haystack.includes("dns") || haystack.includes("waf")) {
    return "go_live_controlado.domain_dns_api_evidencias";
  }
  if (haystack.includes("lgpd") || haystack.includes("privacy")) {
    return "guardian.lgpd_compliance_review";
  }
  if (haystack.includes("receipt") || haystack.includes("txid") || haystack.includes("evidenc")) {
    return "guardian.evidence_audit";
  }
  return recipe.title;
}

function buildGuardianEvidenceSummary(recipe: TenantRecipe, common: ReturnType<typeof deriveCommonRecipeContext>) {
  if (common.evidence) return common.evidence;

  const summary = truncateSentence(common.firstParagraph || recipe.summary.trim() || recipe.title.trim(), 180);
  const checks = [];
  const haystack = `${recipe.title} ${recipe.summary} ${common.instructions}`.toLowerCase();

  if (haystack.includes("dns")) checks.push("DNS");
  if (haystack.includes("waf")) checks.push("WAF");
  if (haystack.includes("health")) checks.push("healthcheck");
  if (haystack.includes("rollback")) checks.push("rollback");
  if (haystack.includes("evid")) checks.push("evidências");

  const checksLine = checks.length > 0 ? `Pontos de verificação: ${checks.join(", ")}.` : "";
  return joinParts([summary, checksLine]);
}

function buildGuardianOperationalNotes(recipe: TenantRecipe, common: ReturnType<typeof deriveCommonRecipeContext>) {
  const haystack = `${recipe.title} ${recipe.summary} ${common.instructions}`.toLowerCase();
  const bullets = [
    common.firstParagraph || recipe.summary.trim() || recipe.title.trim(),
    haystack.includes("tenantid") || haystack.includes("workspaceid")
      ? "Exigir tenantId/workspaceId e fail-closed em rotas sensíveis."
      : null,
    haystack.includes("health") ? "Validar /health com database connected." : null,
    haystack.includes("rollback") ? "Confirmar rollback documentado antes de avanço." : null,
    haystack.includes("waf") ? "Validar WAF/rate limit antes de produção." : null,
    haystack.includes("evid") ? "Registrar evidências indexáveis por etapa." : null,
  ];

  return uniqueParts(bullets)
    .slice(0, 5)
    .map((item, index) => `${index + 1}. ${truncateSentence(item, 140)}`)
    .join("\n");
}

function deriveCommonRecipeContext(recipe: TenantRecipe) {
  const instructions = recipe.instructions?.trim() ?? "";
  const sections = extractSections(instructions);
  const paragraphs = splitParagraphs(instructions);
  const objective = findSection(sections, ["objetivo", "objective"]) || recipe.summary.trim() || recipe.title.trim();
  const scope = findSection(sections, ["escopo", "scope"]);
  const evidence = findSection(sections, ["evidencias", "evidência", "evidence", "proof"]);
  const operationalNotes = instructions || recipe.summary.trim();
  const context = joinParts([
    recipe.title,
    recipe.summary,
    objective && objective !== recipe.summary.trim() ? `Objetivo: ${objective}` : null,
    scope ? `Escopo: ${scope}` : null,
  ]);
  const firstParagraph = paragraphs[0] ?? recipe.summary.trim();

  return {
    instructions,
    sections,
    objective,
    scope,
    evidence,
    operationalNotes,
    context,
    firstParagraph,
  };
}

function buildFieldValue(params: {
  key: string;
  config: GenericAgentConfig;
  recipe: TenantRecipe;
  common: ReturnType<typeof deriveCommonRecipeContext>;
}) {
  const { key, config, recipe, common } = params;

  switch (key) {
    case "requestType":
      return config.agentId === "guardian"
        ? inferGuardianRequestType(recipe, common.instructions)
        : recipe.title;
    case "objective":
      return common.objective;
    case "context":
      return common.context;
    case "notes":
      return config.agentId === "guardian"
        ? buildGuardianOperationalNotes(recipe, common)
        : common.operationalNotes;
    case "evidence":
    case "proof":
      return config.agentId === "guardian"
        ? buildGuardianEvidenceSummary(recipe, common)
        : common.evidence || common.instructions || recipe.summary.trim();
    case "desiredOutcome":
      return common.objective || recipe.summary.trim();
    case "question":
      return `Como executar a recipe "${recipe.title}" neste workspace?`;
    case "product":
    case "theme":
    case "operation":
      return recipe.title;
    case "solution":
    case "todayFocus":
      return recipe.summary.trim() || common.objective;
    case "pain":
    case "blocked":
    case "riskChecks":
    case "controls":
    case "asks":
    case "questions":
      return common.instructions || common.firstParagraph;
    case "cta":
      return common.objective || recipe.summary.trim();
    default:
      return "";
  }
}

export function buildRecipePrefillValues(config: GenericAgentConfig, recipe: TenantRecipe | null) {
  const entries = config.fields.map((field) => [field.key, ""]);
  const initial = Object.fromEntries(entries) as Record<string, string>;
  if (!recipe) return initial;

  const common = deriveCommonRecipeContext(recipe);
  for (const field of config.fields) {
    initial[field.key] = buildFieldValue({
      key: field.key,
      config,
      recipe,
      common,
    });
  }

  return initial;
}
