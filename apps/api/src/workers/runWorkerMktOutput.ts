import type { MktCampaignReport, RecipeOrchestration } from "@eiah/core";
import { buildMktCampaignReport } from "../services/runAtivoUniversalAgent/interpreters/mktCampaignInterpreter";

type BuildMktStructuredOutputParams = {
  agentId: string;
  metadata: Record<string, unknown>;
  outputText: string | null | undefined;
  outputs?: Array<{ stepId: string; data: unknown }> | null;
  recipeOrchestration?: RecipeOrchestration | null;
};

function resolvePrimaryMktOutput(
  outputs: Array<{ stepId: string; data: unknown }> | null | undefined,
  fallbackText: string | null | undefined
) {
  const candidate = outputs
    ?.slice()
    .reverse()
    .find((entry) => entry && entry.data != null);
  return {
    rawOutput: candidate?.data ?? fallbackText ?? null,
    outputText:
      typeof candidate?.data === "string"
        ? candidate.data
        : typeof fallbackText === "string"
        ? fallbackText
        : null,
  };
}

export function buildMktStructuredOutput(
  params: BuildMktStructuredOutputParams
): MktCampaignReport | null {
  const normalizedAgent = params.agentId.trim().toLowerCase();
  if (normalizedAgent !== "mkt") {
    return null;
  }

  const source = resolvePrimaryMktOutput(params.outputs ?? null, params.outputText);
  return buildMktCampaignReport({
    outputText: source.outputText,
    rawOutput: source.rawOutput,
    metadata: {
      ...params.metadata,
      agentId: params.agentId,
    },
    recipeOrchestration: params.recipeOrchestration ?? null,
  });
}
