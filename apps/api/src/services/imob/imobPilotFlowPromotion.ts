import type { ImobPilotFlowHistoryEntry } from "./imobPilotFlowHistory";
import { getImobPilotFlow } from "./imobPilotFlowRegistry";
import type { ImobPilotFlowType } from "./imobPilotFlowRuntime";

export type ImobPilotFlowPromotionThresholds = {
  maxBlockRate: number;
  maxDuplicateRate: number;
  minEvidenceRefsPerRun: number;
  minCompletedRuns: number;
};

export type ImobPilotFlowPromotionDecision = {
  eligible: boolean;
  flow: ReturnType<typeof getImobPilotFlow>;
  flowType: ImobPilotFlowType;
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
  };
};

const DEFAULT_THRESHOLDS: ImobPilotFlowPromotionThresholds = {
  maxBlockRate: 0.4,
  maxDuplicateRate: 0.35,
  minEvidenceRefsPerRun: 3,
  minCompletedRuns: 2,
};

export function evaluateImobPilotFlowPromotion(params: {
  flowType: ImobPilotFlowType;
  history: ImobPilotFlowHistoryEntry[];
  thresholds?: Partial<ImobPilotFlowPromotionThresholds>;
}) {
  const flow = getImobPilotFlow(params.flowType);
  if (!flow) {
    return {
      eligible: false,
      flow: null,
      flowType: params.flowType,
      reasonCodes: ["flow_not_found"],
      metrics: {
        totalRuns: 0,
        completedRuns: 0,
        blockRate: 0,
        duplicateRate: 0,
        averageEvidenceRefs: 0,
        ownershipPreserved: false,
      },
    } satisfies ImobPilotFlowPromotionDecision;
  }

  const thresholds = { ...DEFAULT_THRESHOLDS, ...(params.thresholds ?? {}) };
  const runs = params.history.filter((item) => item.flowType === params.flowType);
  const totalRuns = runs.length;
  const completedRuns = runs.filter((item) => item.status === "completed" || item.status === "shadow_recorded").length;
  const blockedRuns = runs.filter((item) => item.status === "blocked").length;
  const duplicateRuns = runs.filter((item) => item.status === "duplicate").length;
  const averageEvidenceRefs = totalRuns === 0
    ? 0
    : runs.reduce((sum, item) => sum + item.evidenceRefs.length, 0) / totalRuns;
  const ownershipPreserved = runs.every((item) => item.visibleAgentId === "IMOB");
  const blockRate = totalRuns === 0 ? 1 : blockedRuns / totalRuns;
  const duplicateRate = totalRuns === 0 ? 1 : duplicateRuns / totalRuns;

  const reasonCodes: ImobPilotFlowPromotionDecision["reasonCodes"] = [];
  if (completedRuns < thresholds.minCompletedRuns) reasonCodes.push("insufficient_completed_runs");
  if (averageEvidenceRefs < thresholds.minEvidenceRefsPerRun) reasonCodes.push("evidence_below_threshold");
  if (blockRate > thresholds.maxBlockRate) reasonCodes.push("block_rate_above_threshold");
  if (duplicateRate > thresholds.maxDuplicateRate) reasonCodes.push("duplicate_rate_above_threshold");
  if (!ownershipPreserved) reasonCodes.push("ownership_mismatch");

  return {
    eligible: reasonCodes.length === 0,
    flow,
    flowType: params.flowType,
    reasonCodes,
    metrics: {
      totalRuns,
      completedRuns,
      blockRate,
      duplicateRate,
      averageEvidenceRefs,
      ownershipPreserved,
    },
  } satisfies ImobPilotFlowPromotionDecision;
}
