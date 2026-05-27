import {
  buildImobContinuityCoherenceMetrics,
  type ImobContinuityScenarioEvaluation,
} from "./imobCrmContinuityCoherenceMetrics";

export type ImobCrmContinuityCoherenceReadModel = {
  workspaceId: string;
  module: "imob";
  generatedAt: string;
  phase: "imob_crm_continuity_hardening_phase_1";
  rolloutConstraints: {
    preserveExistingFlows: true;
    preserveVisualLayout: true;
    preserveResponsiveness: true;
    launcherRulesChanged: false;
  };
  directivityPolicy: {
    rule: string;
    governedSourceDirective: string;
    uncertainSourceDirective: string;
    dominantBlockerDirective: string;
  };
  thresholds: {
    invalidSuggestedActionRateMax: number;
    staleSurfaceRateMax: number;
    blockerAlignmentRateMin: number;
    consultiveConsistencyRateMin: number;
    nextStepDominanceRateMin: number;
    businessContinuationSuccessRateMin: number;
  };
  metrics: ReturnType<typeof buildImobContinuityCoherenceMetrics>;
  scenarios: Array<{
    scenarioId: string;
    sourceReliability: ImobContinuityScenarioEvaluation["sourceReliability"];
    proofStatus: ImobContinuityScenarioEvaluation["proofStatus"];
    dominantBlocker: string | null;
    passed: boolean;
  }>;
};

export function buildImobReferenceContinuityScenarioEvaluations(): ImobContinuityScenarioEvaluation[] {
  return [
    {
      scenarioId: "market-scan-confirmation",
      sourceReliability: "governed",
      proofStatus: "not_required",
      dominantBlocker: null,
      suggestedActionValid: true,
      staleSurfaceDetected: false,
      blockerAligned: true,
      consultiveConsistent: true,
      dominantNextStepClear: true,
      businessContinuationSucceeded: true,
      strongActionWhileSourceUncertain: false,
    },
    {
      scenarioId: "owner-document-blocker",
      sourceReliability: "governed",
      proofStatus: "not_required",
      dominantBlocker: "owner_document",
      suggestedActionValid: true,
      staleSurfaceDetected: false,
      blockerAligned: true,
      consultiveConsistent: true,
      dominantNextStepClear: true,
      businessContinuationSucceeded: true,
      strongActionWhileSourceUncertain: false,
    },
    {
      scenarioId: "legal-handoff",
      sourceReliability: "governed",
      proofStatus: "satisfied",
      dominantBlocker: "legal_handoff",
      suggestedActionValid: true,
      staleSurfaceDetected: false,
      blockerAligned: true,
      consultiveConsistent: true,
      dominantNextStepClear: true,
      businessContinuationSucceeded: true,
      strongActionWhileSourceUncertain: false,
    },
    {
      scenarioId: "proposal-approval",
      sourceReliability: "governed",
      proofStatus: "not_required",
      dominantBlocker: "proposal_approval",
      suggestedActionValid: true,
      staleSurfaceDetected: false,
      blockerAligned: true,
      consultiveConsistent: true,
      dominantNextStepClear: true,
      businessContinuationSucceeded: true,
      strongActionWhileSourceUncertain: false,
    },
    {
      scenarioId: "follow-up-awaiting-response",
      sourceReliability: "governed",
      proofStatus: "not_required",
      dominantBlocker: "follow_up_response",
      suggestedActionValid: true,
      staleSurfaceDetected: false,
      blockerAligned: true,
      consultiveConsistent: true,
      dominantNextStepClear: true,
      businessContinuationSucceeded: true,
      strongActionWhileSourceUncertain: false,
    },
  ];
}

export function buildImobCrmContinuityCoherenceReadModel(params: {
  workspaceId: string;
  evaluations?: readonly ImobContinuityScenarioEvaluation[];
  generatedAt?: string;
}): ImobCrmContinuityCoherenceReadModel {
  const evaluations = [...(params.evaluations ?? buildImobReferenceContinuityScenarioEvaluations())];
  const metrics = buildImobContinuityCoherenceMetrics(evaluations);

  return {
    workspaceId: params.workspaceId,
    module: "imob",
    generatedAt: params.generatedAt ?? new Date().toISOString(),
    phase: "imob_crm_continuity_hardening_phase_1",
    rolloutConstraints: {
      preserveExistingFlows: true,
      preserveVisualLayout: true,
      preserveResponsiveness: true,
      launcherRulesChanged: false,
    },
    directivityPolicy: {
      rule: "grau de diretividade do próximo passo = função da confiabilidade da fonte + proof disponível + blocker dominante",
      governedSourceDirective: "fonte governada + proof satisfeita + blocker claro => próximo passo único e acionável",
      uncertainSourceDirective: "fonte aberta/degradada ou proof incompleta => contenção e sem ação forte sem base suficiente",
      dominantBlockerDirective: "o blocker dominante prevalece sobre quick replies herdadas, chooser genérico e apoios laterais",
    },
    thresholds: {
      invalidSuggestedActionRateMax: 0.05,
      staleSurfaceRateMax: 0.1,
      blockerAlignmentRateMin: 0.85,
      consultiveConsistencyRateMin: 0.8,
      nextStepDominanceRateMin: 0.8,
      businessContinuationSuccessRateMin: 0.7,
    },
    metrics,
    scenarios: evaluations.map((item) => ({
      scenarioId: item.scenarioId,
      sourceReliability: item.sourceReliability,
      proofStatus: item.proofStatus,
      dominantBlocker: item.dominantBlocker,
      passed: item.suggestedActionValid
        && !item.staleSurfaceDetected
        && item.blockerAligned
        && item.consultiveConsistent
        && item.dominantNextStepClear
        && item.businessContinuationSucceeded
        && !item.strongActionWhileSourceUncertain,
    })),
  };
}
