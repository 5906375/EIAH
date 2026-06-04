import type { RecommendationCandidate, RecommendationExecution } from "@eiah/core";

type PlainObject = Record<string, unknown>;

type LinkedRecipeContext = {
  id?: string;
  agentId?: string;
  title?: string;
  summary?: string;
  instructions?: string;
  tags?: string[];
  content?: {
    goal?: string;
    expectedOutcome?: string;
    steps?: Array<{
      id?: string;
      title?: string;
      objective?: string;
      checks?: string[];
      evidence?: string[];
      blocking?: boolean;
    }>;
  } | null;
};

type GuardianChecklistStep = {
  step: string;
  status: string;
  reasonCode?: string;
  summary?: string;
  nextAction?: string | null;
  findings: string[];
  evidenceRefs: string[];
};

function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asTrimmedString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function truncateText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function extractExecutionForm(metadata: PlainObject) {
  if (isPlainObject(metadata.executionInput)) return metadata.executionInput;
  if (isPlainObject(metadata.form)) return metadata.form;
  return metadata;
}

function extractLinkedRecipe(metadata: PlainObject): LinkedRecipeContext | null {
  if (!isPlainObject(metadata.linkedRecipe)) return null;
  const linkedRecipe = metadata.linkedRecipe;
  const content = isPlainObject(linkedRecipe.content)
    ? {
        goal: asTrimmedString(linkedRecipe.content.goal),
        expectedOutcome: asTrimmedString(linkedRecipe.content.expectedOutcome),
        steps: Array.isArray(linkedRecipe.content.steps)
          ? linkedRecipe.content.steps
              .filter((item): item is PlainObject => isPlainObject(item))
              .map((item) => ({
                id: asTrimmedString(item.id),
                title: asTrimmedString(item.title),
                objective: asTrimmedString(item.objective),
                checks: Array.isArray(item.checks)
                  ? item.checks.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
                  : [],
                evidence: Array.isArray(item.evidence)
                  ? item.evidence.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
                  : [],
                blocking: typeof item.blocking === "boolean" ? item.blocking : undefined,
              }))
          : undefined,
      }
    : null;
  return {
    id: asTrimmedString(linkedRecipe.id),
    agentId: asTrimmedString(linkedRecipe.agentId),
    title: asTrimmedString(linkedRecipe.title),
    summary: asTrimmedString(linkedRecipe.summary),
    instructions: asTrimmedString(linkedRecipe.instructions),
    tags: Array.isArray(linkedRecipe.tags)
      ? linkedRecipe.tags.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : undefined,
    content,
  };
}

function extractGuardianChecklistSteps(outputs: Array<{ stepId: string; data: unknown }>) {
  return outputs
    .map((entry) => {
      if (!isPlainObject(entry.data)) return null;
      const data = isPlainObject(entry.data.output) ? entry.data.output : entry.data;
      const step = asTrimmedString(data.step);
      const status = asTrimmedString(data.status);
      if (!step || !status) return null;
      return {
        step,
        status,
        reasonCode: asTrimmedString(data.reasonCode),
        summary: asTrimmedString(data.summary),
        nextAction: asTrimmedString(data.nextAction) ?? null,
        findings: Array.isArray(data.findings)
          ? data.findings.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
          : [],
        evidenceRefs: Array.isArray(data.evidenceRefs)
          ? data.evidenceRefs.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
          : [],
      } satisfies GuardianChecklistStep;
    })
    .filter((item): item is GuardianChecklistStep => Boolean(item));
}

function defaultGuardianExecution(): RecommendationExecution {
  return {
    api_sugerida: "GUARDIAN_RUNTIME",
    tipo_tarefa: "PARECER_AUDITAVEL",
    custo_estimado_tokens: 400,
    modelo_alternativo: "GPT_4_1",
  };
}

function dedupeStrings(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value?.trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function buildGuardianChecklistCandidate(params: {
  linkedRecipe: LinkedRecipeContext | null;
  form: PlainObject;
  outputs: GuardianChecklistStep[];
  fallbackCandidate?: RecommendationCandidate;
}) {
  const { linkedRecipe, form, outputs, fallbackCandidate } = params;
  const requestType = asTrimmedString(form.requestType) ?? "guardian.review";
  const objective = asTrimmedString(form.objective);
  const verified = outputs.filter((item) => item.status === "verified");
  const degraded = outputs.filter((item) => item.status === "warning" || item.status === "degraded");
  const missing = outputs.filter((item) => item.status === "missing" || item.status === "error");
  const overallStatus = missing.length > 0 ? "NO_GO" : degraded.length > 0 ? "DEGRADED" : "GO";
  const recipeLabel =
    linkedRecipe?.title ??
    asTrimmedString(form.requestType) ??
    fallbackCandidate?.tatica ??
    "recipe Guardian";
  const failingSteps = [...missing, ...degraded];
  const topReasons = dedupeStrings(
    failingSteps.flatMap((item) => [item.summary, item.reasonCode, item.findings[0], item.nextAction])
  ).slice(0, 3);
  const rationaleParts = [
    `Parecer ${overallStatus} para ${recipeLabel}.`,
    `${verified.length} checks verificados, ${degraded.length} degradados/alerta e ${missing.length} ausentes/erro.`,
    objective ? `Objetivo: ${truncateText(objective, 140)}.` : null,
    linkedRecipe?.content?.expectedOutcome
      ? `Resultado esperado da recipe: ${truncateText(linkedRecipe.content.expectedOutcome, 140)}.`
      : null,
    topReasons.length > 0 ? `Motivos principais: ${topReasons.map((item) => truncateText(item, 80)).join(" | ")}.` : null,
  ];
  const nextActions = dedupeStrings(
    failingSteps.flatMap((item) => [
      item.nextAction,
      item.summary && item.status !== "verified" ? item.summary : null,
      item.findings[0],
    ])
  );
  const proximosPassos =
    nextActions.length > 0
      ? nextActions.slice(0, 7).map((item, index) => `${index + 1}. ${truncateText(item, 120)}`).join(" ")
      : overallStatus === "GO"
      ? "1. Registrar receipt final. 2. Executar promoção controlada. 3. Monitorar verify_url e health pós-go-live."
      : "1. Corrigir pendências probatórias. 2. Reexecutar os checks do Guardian. 3. Só promover após novo parecer.";

  return {
    key: linkedRecipe?.id ? `guardian_recipe_${linkedRecipe.id}` : `guardian_${requestType}`,
    tatica: `${overallStatus} — ${recipeLabel}`,
    rationale: rationaleParts.filter(Boolean).join(" "),
    proximos_passos: proximosPassos,
    execucao: defaultGuardianExecution(),
    metadata: {
      exploration: false,
        recipeId: linkedRecipe?.id,
        recipeTitle: linkedRecipe?.title,
        recipeGoal: linkedRecipe?.content?.goal,
        recipeExpectedOutcome: linkedRecipe?.content?.expectedOutcome,
        recipeSteps:
          linkedRecipe?.content?.steps?.map((step) => ({
            id: step.id,
            title: step.title,
            objective: step.objective,
            checks: step.checks,
            evidence: step.evidence,
            blocking: step.blocking,
          })) ?? [],
        alignmentReason: "recipe_checklist_runtime_alignment",
        checklistSteps: outputs.map((item) => ({
          step: item.step,
        status: item.status,
        reasonCode: item.reasonCode,
        summary: item.summary,
        nextAction: item.nextAction,
        evidenceRefs: item.evidenceRefs,
      })),
    },
  } satisfies RecommendationCandidate;
}

export function alignCandidatesToRecipe(params: {
  agentId: string;
  metadata: Record<string, unknown>;
  outputs: Array<{ stepId: string; data: unknown }>;
  candidates: RecommendationCandidate[];
}) {
  const { agentId, metadata, outputs, candidates } = params;
  const linkedRecipe = extractLinkedRecipe(metadata);

  const candidatesWithRecipe = candidates.map((candidate) => ({
    ...candidate,
    metadata: {
      ...candidate.metadata,
      recipeId: linkedRecipe?.id ?? candidate.metadata?.recipeId,
      recipeTitle: linkedRecipe?.title ?? candidate.metadata?.recipeTitle,
      recipeGoal: linkedRecipe?.content?.goal ?? candidate.metadata?.recipeGoal,
      recipeExpectedOutcome:
        linkedRecipe?.content?.expectedOutcome ?? candidate.metadata?.recipeExpectedOutcome,
      recipeSteps:
        linkedRecipe?.content?.steps?.map((step) => ({
          id: step.id,
          title: step.title,
          objective: step.objective,
          checks: step.checks,
          evidence: step.evidence,
          blocking: step.blocking,
        })) ?? candidate.metadata?.recipeSteps,
    },
  }));

  if (agentId.trim().toLowerCase() !== "guardian") {
    return candidatesWithRecipe;
  }

  const guardianSteps = extractGuardianChecklistSteps(outputs);
  if (guardianSteps.length === 0) {
    return candidatesWithRecipe;
  }

  return [
    buildGuardianChecklistCandidate({
      linkedRecipe,
      form: extractExecutionForm(metadata),
      outputs: guardianSteps,
      fallbackCandidate: candidatesWithRecipe[0],
    }),
  ];
}
