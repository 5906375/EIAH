export type ImobContinuitySourceReliability = "governed" | "open" | "degraded";
export type ImobContinuityProofStatus = "satisfied" | "missing" | "not_required";

export type ImobContinuityScenarioEvaluation = {
  scenarioId: string;
  sourceReliability: ImobContinuitySourceReliability;
  proofStatus: ImobContinuityProofStatus;
  dominantBlocker: string | null;
  suggestedActionValid: boolean;
  staleSurfaceDetected: boolean;
  blockerAligned: boolean;
  consultiveConsistent: boolean;
  dominantNextStepClear: boolean;
  businessContinuationSucceeded: boolean;
  strongActionWhileSourceUncertain: boolean;
};

export type ImobContinuityCoherenceMetrics = {
  totalScenarios: number;
  counts: {
    validSuggestedActions: number;
    staleSurfaceFree: number;
    blockerAligned: number;
    consultiveConsistent: number;
    dominantNextStepClear: number;
    businessContinuationSucceeded: number;
    uncertainSourceContained: number;
  };
  rates: {
    invalidSuggestedActionRate: number;
    staleSurfaceRate: number;
    blockerAlignmentRate: number;
    consultiveConsistencyRate: number;
    nextStepDominanceRate: number;
    businessContinuationSuccessRate: number;
    uncertainSourceStrongActionRate: number;
  };
  gates: {
    invalidSuggestedActionRate: boolean;
    staleSurfaceRate: boolean;
    blockerAlignmentRate: boolean;
    consultiveConsistencyRate: boolean;
    nextStepDominanceRate: boolean;
    businessContinuationSuccessRate: boolean;
  };
  score70Gate: boolean;
};

function safeRate(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return numerator / denominator;
}

export function buildImobContinuityCoherenceMetrics(
  evaluations: readonly ImobContinuityScenarioEvaluation[],
): ImobContinuityCoherenceMetrics {
  const totalScenarios = evaluations.length;
  const validSuggestedActions = evaluations.filter((item) => item.suggestedActionValid).length;
  const staleSurfaceFree = evaluations.filter((item) => !item.staleSurfaceDetected).length;
  const blockerAligned = evaluations.filter((item) => item.blockerAligned).length;
  const consultiveConsistent = evaluations.filter((item) => item.consultiveConsistent).length;
  const dominantNextStepClear = evaluations.filter((item) => item.dominantNextStepClear).length;
  const businessContinuationSucceeded = evaluations.filter((item) => item.businessContinuationSucceeded).length;

  const uncertainSourceCases = evaluations.filter((item) => item.sourceReliability !== "governed" || item.proofStatus === "missing");
  const uncertainSourceContained = uncertainSourceCases.filter((item) => !item.strongActionWhileSourceUncertain).length;

  const invalidSuggestedActionRate = 1 - safeRate(validSuggestedActions, totalScenarios);
  const staleSurfaceRate = 1 - safeRate(staleSurfaceFree, totalScenarios);
  const blockerAlignmentRate = safeRate(blockerAligned, totalScenarios);
  const consultiveConsistencyRate = safeRate(consultiveConsistent, totalScenarios);
  const nextStepDominanceRate = safeRate(dominantNextStepClear, totalScenarios);
  const businessContinuationSuccessRate = safeRate(businessContinuationSucceeded, totalScenarios);
  const uncertainSourceStrongActionRate = 1 - safeRate(uncertainSourceContained, uncertainSourceCases.length);

  const gates = {
    invalidSuggestedActionRate: invalidSuggestedActionRate < 0.05,
    staleSurfaceRate: staleSurfaceRate < 0.1,
    blockerAlignmentRate: blockerAlignmentRate >= 0.85,
    consultiveConsistencyRate: consultiveConsistencyRate >= 0.8,
    nextStepDominanceRate: nextStepDominanceRate >= 0.8,
    businessContinuationSuccessRate: businessContinuationSuccessRate >= 0.7,
  };

  return {
    totalScenarios,
    counts: {
      validSuggestedActions,
      staleSurfaceFree,
      blockerAligned,
      consultiveConsistent,
      dominantNextStepClear,
      businessContinuationSucceeded,
      uncertainSourceContained,
    },
    rates: {
      invalidSuggestedActionRate,
      staleSurfaceRate,
      blockerAlignmentRate,
      consultiveConsistencyRate,
      nextStepDominanceRate,
      businessContinuationSuccessRate,
      uncertainSourceStrongActionRate,
    },
    gates,
    score70Gate: gates.invalidSuggestedActionRate
      && gates.staleSurfaceRate
      && gates.blockerAlignmentRate
      && gates.consultiveConsistencyRate
      && gates.nextStepDominanceRate
      && gates.businessContinuationSuccessRate,
  };
}
