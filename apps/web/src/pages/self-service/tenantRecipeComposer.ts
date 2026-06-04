export type TenantRecipeComposerMode = "simple" | "staged";
export type TenantRecipeComposerScopeMode = "current_workspace" | "all_workspaces";

export type TenantRecipeComposerStep = {
  id: string;
  title: string;
  objective: string;
  checks: string;
  evidence: string;
  blocking: boolean;
};

export type TenantRecipeComposerState = {
  agentId: string;
  title: string;
  summary: string;
  scopeMode: TenantRecipeComposerScopeMode;
  tags: string[];
  mode: TenantRecipeComposerMode;
  goal: string;
  expectedOutcome: string;
  goCondition: string;
  blockCondition: string;
  instructions: string;
  instructionsManuallyEdited: boolean;
  steps: TenantRecipeComposerStep[];
};

export const TENANT_RECIPE_LIMITS = {
  title: 140,
  summary: 500,
  instructions: 4000,
  tags: 12,
  tagLength: 40,
} as const;

export function createEmptyRecipeStep(index = 0): TenantRecipeComposerStep {
  return {
    id: `step-${index + 1}`,
    title: "",
    objective: "",
    checks: "",
    evidence: "",
    blocking: true,
  };
}

export function createInitialTenantRecipeComposerState(agentId: string): TenantRecipeComposerState {
  return {
    agentId,
    title: "",
    summary: "",
    scopeMode: "current_workspace",
    tags: [],
    mode: "simple",
    goal: "",
    expectedOutcome: "",
    goCondition: "",
    blockCondition: "",
    instructions: "",
    instructionsManuallyEdited: false,
    steps: [createEmptyRecipeStep(0)],
  };
}

function uniqueNonEmpty(lines: string[]) {
  const seen = new Set<string>();
  return lines.filter((line) => {
    const normalized = line.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function splitBullets(value: string) {
  return uniqueNonEmpty(
    value
      .split(/\r?\n|;/)
      .map((item) => item.replace(/^[\-\d\.\)\s]+/, "").trim())
      .filter(Boolean)
  );
}

function formatBulletSection(title: string, value: string) {
  const items = splitBullets(value);
  if (items.length === 0) return "";
  return `${title}:\n${items.map((item) => `- ${item}`).join("\n")}`;
}

function formatParagraph(title: string, value: string) {
  const normalized = value.trim();
  if (!normalized) return "";
  return `${title}: ${normalized}`;
}

export function buildTenantRecipeInstructions(state: TenantRecipeComposerState) {
  if (state.mode === "simple") {
    return [
      formatParagraph("Objetivo geral", state.goal),
      formatParagraph("Resultado prático esperado", state.expectedOutcome),
      formatBulletSection("Evidências esperadas", state.goCondition),
      formatBulletSection("Condição de bloqueio", state.blockCondition),
    ]
      .filter(Boolean)
      .join("\n\n")
      .trim();
  }

  const steps = state.steps
    .map((step, index) => {
      const lines = [
        `Etapa ${index + 1}: ${step.title.trim() || `Etapa ${index + 1}`}`,
        formatParagraph("Objetivo", step.objective),
        formatBulletSection("Checks obrigatórios", step.checks),
        formatBulletSection("Evidências esperadas", step.evidence),
        `Bloqueia avanço: ${step.blocking ? "sim" : "não"}`,
      ].filter(Boolean);
      return lines.join("\n");
    })
    .filter(Boolean);

  return [
    formatParagraph("Objetivo geral", state.goal),
    formatParagraph("Resultado prático esperado", state.expectedOutcome),
    ...steps,
    formatBulletSection("Condição final de GO", state.goCondition),
    formatBulletSection("Condição final de bloqueio", state.blockCondition),
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

export function buildTenantRecipeContent(state: TenantRecipeComposerState) {
  return {
    schemaVersion: "v2" as const,
    mode: state.mode,
    goal: state.goal.trim(),
    expectedOutcome: state.expectedOutcome.trim(),
    goCondition: state.goCondition.trim(),
    blockCondition: state.blockCondition.trim(),
    steps:
      state.mode === "staged"
        ? state.steps
            .map((step) => ({
              id: step.id,
              title: step.title.trim(),
              objective: step.objective.trim(),
              checks: splitBullets(step.checks),
              evidence: splitBullets(step.evidence),
              blocking: step.blocking,
            }))
            .filter((step) => step.title.length > 0)
        : [],
  };
}

export function inferSuggestedTags(state: Pick<TenantRecipeComposerState, "agentId" | "title" | "summary" | "goal" | "steps">) {
  const haystack = [state.title, state.summary, state.goal, state.steps.map((step) => [step.title, step.objective, step.checks, step.evidence].join(" ")).join(" ")]
    .join(" ")
    .toLowerCase();
  const tags = new Set<string>();

  if (state.agentId.trim()) {
    tags.add(state.agentId.toLowerCase());
  }
  if (haystack.includes("go-live") || haystack.includes("produção") || haystack.includes("producao")) {
    tags.add("go-live");
  }
  if (haystack.includes("staging")) tags.add("staging");
  if (haystack.includes("production") || haystack.includes("produção") || haystack.includes("producao")) tags.add("production");
  if (haystack.includes("api")) tags.add("api");
  if (haystack.includes("frontend") || haystack.includes("app")) tags.add("frontend");
  if (haystack.includes("health")) tags.add("healthcheck");
  if (haystack.includes("fail-closed") || haystack.includes("403") || haystack.includes("policy")) tags.add("policy");
  if (haystack.includes("waf")) tags.add("waf");
  if (haystack.includes("rate limit")) tags.add("rate-limit");
  if (haystack.includes("rollback")) tags.add("rollback");
  if (haystack.includes("evid")) tags.add("evidence");

  return Array.from(tags).slice(0, TENANT_RECIPE_LIMITS.tags);
}

export function recommendRecipeMode(state: Pick<TenantRecipeComposerState, "title" | "summary" | "goal">) {
  const haystack = [state.title, state.summary, state.goal].join(" ").toLowerCase();
  const topicSignals = [
    "staging",
    "health",
    "fail-closed",
    "waf",
    "rate limit",
    "rollback",
  ];
  const matched = topicSignals.filter((signal) => haystack.includes(signal));
  return matched.length >= 2 ? "staged" : "simple";
}

export function clampRecipeTags(tags: string[]) {
  const seen = new Set<string>();
  return tags
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => tag.length > 0 && tag.length <= TENANT_RECIPE_LIMITS.tagLength)
    .filter((tag) => {
      if (seen.has(tag)) return false;
      seen.add(tag);
      return true;
    })
    .slice(0, TENANT_RECIPE_LIMITS.tags);
}
