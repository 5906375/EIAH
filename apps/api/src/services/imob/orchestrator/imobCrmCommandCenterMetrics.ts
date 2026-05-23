import type { ImobCrmCaseProjectionV1 } from "../crm/imobCaseContextContract";

export type ImobCrmCommandCenterMetrics = {
  totalCases: number;
  blockedCases: number;
  missingProofCases: number;
  nextActionMissingCases: number;
  dedupePendingCases: number;
  queueDepth: {
    dedupe: number;
    proof: number;
    nextAction: number;
    blocker: number;
  };
  missionStatusCounts: Record<string, number>;
  targetAgentLoad: Record<string, number>;
};

export function buildImobCrmCommandCenterMetrics(
  projections: readonly ImobCrmCaseProjectionV1[],
): ImobCrmCommandCenterMetrics {
  const metrics: ImobCrmCommandCenterMetrics = {
    totalCases: projections.length,
    blockedCases: 0,
    missingProofCases: 0,
    nextActionMissingCases: 0,
    dedupePendingCases: 0,
    queueDepth: {
      dedupe: 0,
      proof: 0,
      nextAction: 0,
      blocker: 0,
    },
    missionStatusCounts: {},
    targetAgentLoad: {},
  };

  for (const projection of projections) {
    const card = projection.caseCard;
    metrics.missionStatusCounts[card.missionStatus] = (metrics.missionStatusCounts[card.missionStatus] ?? 0) + 1;
    metrics.targetAgentLoad[card.targetAgent ?? "unassigned"] = (metrics.targetAgentLoad[card.targetAgent ?? "unassigned"] ?? 0) + 1;

    if (card.missionStatus === "blocked") metrics.blockedCases += 1;
    if (card.proofStatus === "missing") metrics.missingProofCases += 1;
    if (!card.nextAction) metrics.nextActionMissingCases += 1;

    for (const item of projection.queues) {
      if (item.queueId === "dedupe_queue") {
        metrics.dedupePendingCases += 1;
        metrics.queueDepth.dedupe += 1;
      } else if (item.queueId === "proof_queue") {
        metrics.queueDepth.proof += 1;
      } else if (item.queueId === "next_action_queue") {
        metrics.queueDepth.nextAction += 1;
      } else if (item.queueId === "blocker_queue") {
        metrics.queueDepth.blocker += 1;
      }
    }
  }

  return metrics;
}
