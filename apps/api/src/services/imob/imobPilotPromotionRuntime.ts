import type { ImobCapabilityRolloutStage } from "./imobCapabilityRegistry";
import type { ImobEvidenceRef } from "./imobConversationContract";
import type { ImobPilotFlowHistoryEntry } from "./imobPilotFlowHistory";
import { buildImobPilotFlowObservabilityByType } from "./imobPilotFlowObservability";
import {
  evaluateImobPilotFlowPromotion,
  type ImobPilotFlowPromotionThresholds,
} from "./imobPilotFlowPromotion";
import {
  getImobPilotFlow,
  listImobPilotFlows,
  type ImobPilotFlowRegistryEntry,
} from "./imobPilotFlowRegistry";
import { resolveImobPilotRolloutStage, type ImobPilotRolloutState } from "./imobPilotRolloutState";
import type { ImobPilotFlowType } from "./imobPilotFlowRuntime";

export type ImobPilotPromotionRecommendedStage = "shadow" | "pilot";

export type ImobPilotPromotionNextOperationalAction =
  | "keep_shadow"
  | "promote_to_pilot"
  | "maintain_pilot"
  | "hold_rollout"
  | "regress_to_shadow";

export type ImobPilotPromotionRuntimeDecision = {
  flowType: ImobPilotFlowType;
  visibleAgentId: "IMOB";
  currentStage: ImobCapabilityRolloutStage;
  recommendedStage: ImobPilotPromotionRecommendedStage;
  eligible: boolean;
  reasonCodes: Array<
    | "flow_not_found"
    | "insufficient_completed_runs"
    | "evidence_below_threshold"
    | "block_rate_above_threshold"
    | "duplicate_rate_above_threshold"
    | "ownership_mismatch"
  >;
  metrics: {
    totalRuns: number;
    completedRuns: number;
    blockRate: number;
    duplicateRate: number;
    averageEvidenceRefs: number;
    ownershipPreserved: boolean;
    flowsExecuted: number;
    flowsBlocked: number;
    flowsCompleted: number;
    flowsShadowRecorded: number;
    gateBlockRate: number;
    sandboxSuccessRate: number;
    averageFlowResolutionTime: number;
  };
  evidenceRefs?: ImobEvidenceRef[];
  nextOperationalAction: ImobPilotPromotionNextOperationalAction;
  generatedAt: string;
};

function resolveRecommendedStage(params: {
  currentStage: ImobCapabilityRolloutStage;
  eligible: boolean;
  reasonCodes: ImobPilotPromotionRuntimeDecision["reasonCodes"];
}) {
  if (params.eligible) return "pilot" as const;
  if (
    params.currentStage === "pilot"
    && (
      params.reasonCodes.includes("block_rate_above_threshold")
      || params.reasonCodes.includes("duplicate_rate_above_threshold")
      || params.reasonCodes.includes("ownership_mismatch")
    )
  ) {
    return "shadow" as const;
  }
  return "shadow" as const;
}

function resolveNextOperationalAction(params: {
  currentStage: ImobCapabilityRolloutStage;
  eligible: boolean;
  reasonCodes: ImobPilotPromotionRuntimeDecision["reasonCodes"];
  totalRuns: number;
  minCompletedRuns: number;
}) {
  if (params.eligible) {
    if (params.currentStage === "pilot" || params.currentStage === "small" || params.currentStage === "broad") {
      return "maintain_pilot" as const;
    }
    return "promote_to_pilot" as const;
  }

  if (params.currentStage === "pilot" && (
    params.reasonCodes.includes("block_rate_above_threshold")
    || params.reasonCodes.includes("duplicate_rate_above_threshold")
    || params.reasonCodes.includes("ownership_mismatch")
  )) {
    return "regress_to_shadow" as const;
  }

  if (
    params.reasonCodes.includes("block_rate_above_threshold")
    || params.reasonCodes.includes("duplicate_rate_above_threshold")
    || params.reasonCodes.includes("ownership_mismatch")
  ) {
    if (params.totalRuns < params.minCompletedRuns) {
      return "keep_shadow" as const;
    }
    return "hold_rollout" as const;
  }

  if (
    params.reasonCodes.includes("insufficient_completed_runs")
    || params.reasonCodes.includes("evidence_below_threshold")
  ) {
    return "keep_shadow" as const;
  }

  return "hold_rollout" as const;
}

export function evaluateImobPilotPromotionRuntimeForFlow(params: {
  flowType: ImobPilotFlowType;
  history: ImobPilotFlowHistoryEntry[];
  thresholds?: Partial<ImobPilotFlowPromotionThresholds>;
  registryEntry?: ImobPilotFlowRegistryEntry | null;
  rolloutState?: ImobPilotRolloutState | null;
  generatedAt?: string | null;
}) {
  const flow = params.registryEntry ?? getImobPilotFlow(params.flowType);
  const currentStage = params.rolloutState
    ? resolveImobPilotRolloutStage({
      state: params.rolloutState,
      flowType: params.flowType,
    })
    : flow?.rolloutStage ?? "shadow";
  const latestRun = params.history
    .filter((item) => item.flowType === params.flowType)
    .sort((left, right) => new Date(right.generatedAt).getTime() - new Date(left.generatedAt).getTime())[0] ?? null;
  const promotion = evaluateImobPilotFlowPromotion({
    flowType: params.flowType,
    history: params.history,
    thresholds: params.thresholds,
  });
  const effectiveThresholds = {
    minCompletedRuns: params.thresholds?.minCompletedRuns ?? 2,
  };
  const observability = buildImobPilotFlowObservabilityByType({
    history: params.history,
  })[params.flowType] ?? {
    flowsExecuted: 0,
    flowsBlocked: 0,
    flowsCompleted: 0,
    flowsShadowRecorded: 0,
    duplicateRate: 0,
    gateBlockRate: 0,
    sandboxSuccessRate: 0,
    averageFlowResolutionTime: 0,
  };

  return {
    flowType: params.flowType,
    visibleAgentId: flow?.visibleAgentId ?? "IMOB",
    currentStage,
    recommendedStage: resolveRecommendedStage({
      currentStage,
      eligible: promotion.eligible,
      reasonCodes: promotion.reasonCodes,
    }),
    eligible: promotion.eligible,
    reasonCodes: promotion.reasonCodes,
    metrics: {
      ...promotion.metrics,
      ...observability,
    },
    evidenceRefs: latestRun?.evidenceRefs ? [...latestRun.evidenceRefs] : undefined,
    nextOperationalAction: resolveNextOperationalAction({
      currentStage,
      eligible: promotion.eligible,
      reasonCodes: promotion.reasonCodes,
      totalRuns: promotion.metrics.totalRuns,
      minCompletedRuns: effectiveThresholds.minCompletedRuns,
    }),
    generatedAt: params.generatedAt ?? new Date().toISOString(),
  } satisfies ImobPilotPromotionRuntimeDecision;
}

export function evaluateAllImobPilotPromotionRuntime(params: {
  history: ImobPilotFlowHistoryEntry[];
  thresholdsByFlow?: Partial<Record<ImobPilotFlowType, Partial<ImobPilotFlowPromotionThresholds>>>;
  registryEntriesByFlow?: Partial<Record<ImobPilotFlowType, ImobPilotFlowRegistryEntry>>;
  rolloutState?: ImobPilotRolloutState | null;
  generatedAt?: string | null;
}) {
  return listImobPilotFlows().map((flow) =>
    evaluateImobPilotPromotionRuntimeForFlow({
      flowType: flow.flowType,
      history: params.history,
      thresholds: params.thresholdsByFlow?.[flow.flowType],
      registryEntry: params.registryEntriesByFlow?.[flow.flowType] ?? flow,
      rolloutState: params.rolloutState,
      generatedAt: params.generatedAt,
    }));
}
