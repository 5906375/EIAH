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

function sanitizeJ360CustomerName(value: string) {
  return value
    .replace(/^\s*(?:analise juridica trabalhista|análise jurídica trabalhista)\s*[—-]\s*/iu, "")
    .replace(/^\s*(?:politica|política)\s+de\s+(?:premiacao|premiação)\s+/iu, "")
    .replace(/^\s*(?:premiacao|premiação)\s+da\s+/iu, "")
    .replace(/^\s*(?:da|de|do)\s+/iu, "")
    .replace(/\s*\([^)]*\)\s*$/u, "")
    .trim();
}

function inferGuardianRequestType(recipe: TenantRecipe, instructions: string) {
  if (recipe.content?.mode === "staged" && (recipe.content.steps?.length ?? 0) > 1) {
    return "go_live_controlado.plano_principal_web";
  }
  const haystack = `${recipe.title} ${recipe.summary} ${instructions}`.toLowerCase();
  if (
    (haystack.includes("staging") || haystack.includes("produção") || haystack.includes("producao")) &&
    (haystack.includes("segregação") || haystack.includes("segregacao")) &&
    (haystack.includes("app") || haystack.includes("frontend")) &&
    (haystack.includes("api") || haystack.includes("backend"))
  ) {
    return "go_live_controlado.segregacao_app_api_staging_producao";
  }
  if (
    haystack.includes("/api/health") ||
    haystack.includes("healthcheck") ||
    haystack.includes("fail-closed") ||
    haystack.includes("tenantid") ||
    haystack.includes("workspaceid") ||
    haystack.includes("403")
  ) {
    return "go_live_controlado.health_fail_closed_policy_minima";
  }
  if (haystack.includes("domain") || haystack.includes("dns")) {
    return "go_live_controlado.domain_dns_api_evidencias";
  }
  if (
    haystack.includes("waf") ||
    haystack.includes("rate limit") ||
    haystack.includes("rate limiting") ||
    haystack.includes("exposição pública") ||
    haystack.includes("exposicao publica")
  ) {
    return "go_live_controlado.waf_rate_limit_exposicao_publica";
  }
  if (
    haystack.includes("rollback") ||
    haystack.includes("evidências finais") ||
    haystack.includes("evidencias finais")
  ) {
    return "go_live_controlado.rollback_evidencias_finais";
  }
  if (haystack.includes("waf")) {
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
  const structuredContent = recipe.content ?? null;
  const structuredSteps = structuredContent?.steps ?? [];
  const instructions = recipe.instructions?.trim() ?? "";
  const sections = extractSections(instructions);
  const paragraphs = splitParagraphs(instructions);
  const objective =
    structuredContent?.goal?.trim() ||
    findSection(sections, ["objetivo", "objective"]) ||
    recipe.summary.trim() ||
    recipe.title.trim();
  const scope = findSection(sections, ["escopo", "scope"]);
  const evidence =
    structuredSteps.length > 0
      ? structuredSteps
          .flatMap((step) => step.evidence)
          .filter(Boolean)
          .join("\n")
      : findSection(sections, ["evidencias", "evidência", "evidence", "proof"]);
  const operationalNotes = instructions || recipe.summary.trim();
  const context = joinParts([
    recipe.title,
    recipe.summary,
    objective && objective !== recipe.summary.trim() ? `Objetivo: ${objective}` : null,
    structuredContent?.expectedOutcome ? `Resultado esperado: ${structuredContent.expectedOutcome}` : null,
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
    structuredContent,
    structuredSteps,
  };
}

function inferJ360CustomerName(recipe: TenantRecipe, common: ReturnType<typeof deriveCommonRecipeContext>) {
  const haystack = [recipe.title, recipe.summary, common.instructions].join(" ");
  const contextualCompanyMatch = haystack.match(
    /\b(?:Contexto|Cliente|Conta|Pol[íi]tica(?:\s+de[\p{L}\s]+)?)[:\s][^.\n]*?\b(?:da|de|do)\s+([A-ZÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇ][\p{L}0-9&.\-]+(?:\s+[A-ZÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇ][\p{L}0-9&.\-]+){0,3}\s+(?:Transportes|Logística|Logistica|Ltda|LTDA|S\.A\.|SA))\b/iu
  );
  if (contextualCompanyMatch?.[1]) {
    return sanitizeJ360CustomerName(contextualCompanyMatch[1]);
  }
  const corporateNameMatch = haystack.match(
    /\b([A-ZÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇ][\p{L}0-9&.\-]+(?:\s+[A-ZÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇ][\p{L}0-9&.\-]+){0,3}\s+(?:Transportes|Logística|Logistica|Ltda|LTDA|S\.A\.|SA))\b/iu
  );
  if (corporateNameMatch?.[1]) {
    return sanitizeJ360CustomerName(corporateNameMatch[1]);
  }
  const explicitPatterns = [
    /\b(?:da|de|do)\s+([A-ZÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇ][\p{L}0-9&.\-]+(?:\s+[A-ZÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇ][\p{L}0-9&.\-]+){0,4})\b/gu,
    /\b([A-ZÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇ][\p{L}0-9&.\-]+(?:\s+[A-ZÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇ][\p{L}0-9&.\-]+){0,4})\s+(?:Transportes|Logística|Logistica|Ltda|LTDA|S\.A\.|SA)\b/gu,
  ];
  for (const pattern of explicitPatterns) {
    const matches = haystack.matchAll(pattern);
    for (const match of matches) {
      const candidate = (match[1] ?? match[0] ?? "").trim();
      if (candidate && !/Analise|Análise|Objetivo|Contexto|Riscos/i.test(candidate)) {
        return sanitizeJ360CustomerName(candidate);
      }
    }
  }
  const explicitCompanyMatch = haystack.match(/\b([A-ZÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇ][\p{L}0-9&.\-]+(?:\s+[A-ZÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇ][\p{L}0-9&.\-]+){0,3})\b/gu);
  const preferred =
    explicitCompanyMatch?.find((item) => /transport|treviso|logistic|logistica|ltda|s\.a|sa\b|empresa/i.test(item)) ?? null;
  if (preferred) return sanitizeJ360CustomerName(preferred);
  return "";
}

function inferJ360Segment(recipe: TenantRecipe, common: ReturnType<typeof deriveCommonRecipeContext>) {
  const haystack = normalizeKey([recipe.title, recipe.summary, common.instructions, recipe.tags.join(" ")].join(" "));
  if (haystack.includes("transporte") || haystack.includes("logistica")) {
    return "Transporte rodoviário / logística";
  }
  if (haystack.includes("trabalhista") || haystack.includes("clt")) {
    return "Relações trabalhistas / política interna";
  }
  if (haystack.includes("contrato")) {
    return "Contratual / documental";
  }
  return "";
}

function inferJ360JourneyStages(recipe: TenantRecipe, common: ReturnType<typeof deriveCommonRecipeContext>) {
  const haystack = normalizeKey([recipe.title, recipe.summary, common.instructions, recipe.tags.join(" ")].join(" "));
  const stages: string[] = [];
  if (haystack.includes("contrato") || haystack.includes("politica") || haystack.includes("formalizacao")) {
    stages.push("Assinatura / Formalizacao");
  }
  if (haystack.includes("trabalhista") || haystack.includes("premiacao") || haystack.includes("execucao")) {
    stages.push("Execucao contratual");
  }
  if (haystack.includes("compliance") || haystack.includes("lgpd") || haystack.includes("risco")) {
    stages.push("Gestao de incidentes / Compliance");
  }
  if (haystack.includes("revisao") || haystack.includes("ajuste") || haystack.includes("aditivo")) {
    stages.push("Renegociacao / Aditivos");
  }
  return uniqueParts(stages);
}

export type J360RecipePrefillValues = {
  customerName: string;
  segment: string;
  painPoints: string;
  currentTools: string;
  journeyStages: string[];
  recentEvents: string;
  opportunities: string;
  risks: string;
  nextSteps: string;
};

export type MktRecipePrefillValues = {
  goal: string;
  kpis: string;
  audience: string;
  channels: string[];
  budget: string;
  toneNotes: string;
  deadline: string;
  notes: string;
};

export function buildJ360RecipePrefillValues(recipe: TenantRecipe | null): J360RecipePrefillValues {
  if (!recipe) {
    return {
      customerName: "",
      segment: "",
      painPoints: "",
      currentTools: "",
      journeyStages: [],
      recentEvents: "",
      opportunities: "",
      risks: "",
      nextSteps: "",
    };
  }

  const common = deriveCommonRecipeContext(recipe);
  const journeyStages = inferJ360JourneyStages(recipe, common);
  const nextSteps =
    common.structuredSteps.length > 0
      ? common.structuredSteps.map((step, index) => `${index + 1}. ${step.title}`).join("\n")
      : "";

  return {
    customerName: inferJ360CustomerName(recipe, common),
    segment: inferJ360Segment(recipe, common),
    painPoints: truncateSentence(common.objective || recipe.summary.trim(), 320),
    currentTools: truncateSentence(
      common.firstParagraph ||
        recipe.summary.trim() ||
        `Documento/política em análise: ${recipe.title}.`,
      280
    ),
    journeyStages,
    recentEvents: "",
    opportunities: truncateSentence(
      common.structuredContent?.expectedOutcome ||
        "Ajustar o documento para uso interno com menor risco trabalhista e maior clareza operacional.",
      280
    ),
    risks: truncateSentence(
      common.structuredContent?.blockCondition ||
        "Risco de caracterização como verba salarial, critérios subjetivos, ambiguidades de cálculo ou necessidade de revisão humana.",
      320
    ),
    nextSteps,
  };
}

function inferMktChannels(recipe: TenantRecipe, common: ReturnType<typeof deriveCommonRecipeContext>) {
  const haystack = normalizeKey([recipe.title, recipe.summary, common.instructions, recipe.tags.join(" ")].join(" "));
  const channels: string[] = [];
  if (haystack.includes("email")) channels.push("Email");
  if (haystack.includes("linkedin")) channels.push("LinkedIn");
  if (haystack.includes("evento")) channels.push("Eventos");
  if (haystack.includes("comunidade")) channels.push("Comunidades");
  if (haystack.includes("parceria")) channels.push("Parcerias");
  if (haystack.includes("blog") || haystack.includes("seo")) channels.push("Blog / SEO");
  if (haystack.includes("whatsapp")) channels.push("WhatsApp");
  if (haystack.includes("instagram")) channels.push("Instagram");
  if (haystack.includes("youtube")) channels.push("YouTube");
  if (haystack.includes("podcast")) channels.push("Podcasts");
  return uniqueParts(channels);
}

function inferMktAudience(recipe: TenantRecipe, common: ReturnType<typeof deriveCommonRecipeContext>) {
  const sections = common.sections;
  const explicitAudience = findSection(sections, [
    "publico prioritario",
    "publico alvo",
    "público prioritário",
    "público alvo",
    "audiencia alvo",
    "audiência alvo",
  ]);
  if (explicitAudience) return truncateSentence(explicitAudience, 320);

  const haystack = `${recipe.title} ${recipe.summary} ${common.instructions}`.toLowerCase();
  if (haystack.includes("escritórios") || haystack.includes("escritorios") || haystack.includes("advocacia")) {
    return "Sócios, heads de inovação e escritórios de advocacia com foco em trabalhista, contratual e LGPD.";
  }

  return truncateSentence(common.firstParagraph || recipe.summary.trim(), 280);
}

function inferMktKpis(recipe: TenantRecipe, common: ReturnType<typeof deriveCommonRecipeContext>) {
  const sections = common.sections;
  const explicitKpis = findSection(sections, [
    "kpis",
    "kpis metricas",
    "kpis / metricas",
    "kpis / métricas",
    "metricas",
    "métricas",
  ]);
  if (explicitKpis) return truncateSentence(explicitKpis, 320);

  const haystack = `${recipe.title} ${recipe.summary} ${common.instructions}`.toLowerCase();
  if (haystack.includes("escritorios") || haystack.includes("advocacia") || haystack.includes("campanha")) {
    return "Leads qualificados, reuniões agendadas, taxa de resposta outbound, CPL qualificado e conversão para piloto.";
  }

  return truncateSentence(common.structuredContent?.expectedOutcome || recipe.summary.trim(), 280);
}

function inferBudget(common: ReturnType<typeof deriveCommonRecipeContext>) {
  const budgetMatch = common.instructions.match(/R\$\s?\d[\d.\,]*/i);
  return budgetMatch?.[0] ?? "";
}

export function buildMktRecipePrefillValues(recipe: TenantRecipe | null): MktRecipePrefillValues {
  if (!recipe) {
    return {
      goal: "",
      kpis: "",
      audience: "",
      channels: [],
      budget: "",
      toneNotes: "",
      deadline: "",
      notes: "",
    };
  }

  const common = deriveCommonRecipeContext(recipe);
  const sections = common.sections;
  const notes = joinParts([
    common.structuredContent?.expectedOutcome ? `Resultado esperado: ${common.structuredContent.expectedOutcome}` : null,
    common.structuredContent?.goCondition ? `Condição de GO: ${common.structuredContent.goCondition}` : null,
    common.structuredContent?.blockCondition ? `Condição de bloqueio: ${common.structuredContent.blockCondition}` : null,
    common.structuredSteps.length > 0
      ? `Etapas:\n${common.structuredSteps.map((step, index) => `${index + 1}. ${step.title}`).join("\n")}`
      : null,
    recipe.summary.trim(),
  ]);

  return {
    goal: truncateSentence(common.objective || recipe.summary.trim(), 320),
    kpis: inferMktKpis(recipe, common),
    audience: inferMktAudience(recipe, common),
    channels: inferMktChannels(recipe, common),
    budget: inferBudget(common),
    toneNotes: truncateSentence(
      findSection(sections, ["tom desejado", "tom", "linguagem"]) ||
        "Usar linguagem executiva e consultiva, sem prometer capabilities ainda não homologadas.",
      260
    ),
    deadline: truncateSentence(
      findSection(sections, ["marcos", "cronograma", "notas de marcos", "timeline"]) ||
        common.structuredContent?.goCondition ||
        "",
      260
    ),
    notes: truncateSentence(notes || common.instructions || recipe.summary.trim(), 600),
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
        ? common.structuredSteps.length > 0
          ? common.structuredSteps
              .map((step, index) => `${index + 1}. ${step.title}${step.objective ? ` — ${truncateSentence(step.objective, 110)}` : ""}`)
              .join("\n")
          : buildGuardianOperationalNotes(recipe, common)
        : common.operationalNotes;
    case "evidence":
    case "proof":
      return config.agentId === "guardian"
        ? buildGuardianEvidenceSummary(recipe, common)
        : common.evidence || common.instructions || recipe.summary.trim();
    case "desiredOutcome":
      return common.structuredContent?.expectedOutcome || common.objective || recipe.summary.trim();
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
