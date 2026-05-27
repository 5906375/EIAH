import test from "node:test";
import assert from "node:assert/strict";

import {
  buildImobContinuityCoherenceMetrics,
  type ImobContinuityScenarioEvaluation,
} from "../services/imob/orchestrator/imobCrmContinuityCoherenceMetrics";

function scenario(overrides: Partial<ImobContinuityScenarioEvaluation> = {}): ImobContinuityScenarioEvaluation {
  return {
    scenarioId: "scenario-1",
    sourceReliability: "governed",
    proofStatus: "satisfied",
    dominantBlocker: "owner_document",
    suggestedActionValid: true,
    staleSurfaceDetected: false,
    blockerAligned: true,
    consultiveConsistent: true,
    dominantNextStepClear: true,
    businessContinuationSucceeded: true,
    strongActionWhileSourceUncertain: false,
    ...overrides,
  };
}

function assertRate(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `expected ${expected}, got ${actual}`);
}

test("IMOB continuity coherence metrics compute acceptance rates and pass the 70+ gate on a clean baseline", () => {
  const metrics = buildImobContinuityCoherenceMetrics([
    scenario({ scenarioId: "market-scan-confirmation" }),
    scenario({ scenarioId: "owner-document-blocker" }),
    scenario({ scenarioId: "legal-handoff" }),
    scenario({ scenarioId: "proposal-approval" }),
    scenario({
      scenarioId: "follow-up-awaiting-response",
      proofStatus: "not_required",
      dominantBlocker: "follow_up_response",
    }),
  ]);

  assert.equal(metrics.totalScenarios, 5);
  assertRate(metrics.rates.invalidSuggestedActionRate, 0);
  assertRate(metrics.rates.staleSurfaceRate, 0);
  assertRate(metrics.rates.blockerAlignmentRate, 1);
  assertRate(metrics.rates.consultiveConsistencyRate, 1);
  assertRate(metrics.rates.nextStepDominanceRate, 1);
  assertRate(metrics.rates.businessContinuationSuccessRate, 1);
  assert.equal(metrics.gates.invalidSuggestedActionRate, true);
  assert.equal(metrics.gates.businessContinuationSuccessRate, true);
  assert.equal(metrics.score70Gate, true);
});

test("IMOB continuity coherence metrics penalize stale surface, invalid actions and strong guidance on uncertain sources", () => {
  const metrics = buildImobContinuityCoherenceMetrics([
    scenario({ scenarioId: "market-scan-open-source", sourceReliability: "open", proofStatus: "missing", strongActionWhileSourceUncertain: true }),
    scenario({ scenarioId: "owner-blocker-stale", staleSurfaceDetected: true, blockerAligned: false, consultiveConsistent: false }),
    scenario({ scenarioId: "invalid-cta", suggestedActionValid: false, businessContinuationSucceeded: false }),
    scenario({ scenarioId: "still-good-1" }),
    scenario({ scenarioId: "still-good-2" }),
  ]);

  assert.equal(metrics.totalScenarios, 5);
  assertRate(metrics.rates.invalidSuggestedActionRate, 0.2);
  assertRate(metrics.rates.staleSurfaceRate, 0.2);
  assertRate(metrics.rates.blockerAlignmentRate, 0.8);
  assertRate(metrics.rates.consultiveConsistencyRate, 0.8);
  assertRate(metrics.rates.businessContinuationSuccessRate, 0.8);
  assertRate(metrics.rates.uncertainSourceStrongActionRate, 1);
  assert.equal(metrics.gates.invalidSuggestedActionRate, false);
  assert.equal(metrics.gates.staleSurfaceRate, false);
  assert.equal(metrics.gates.blockerAlignmentRate, false);
  assert.equal(metrics.score70Gate, false);
});
