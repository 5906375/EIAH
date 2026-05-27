import test from "node:test";
import assert from "node:assert/strict";

import {
  buildImobCrmContinuityCoherenceReadModel,
  buildImobReferenceContinuityScenarioEvaluations,
} from "../services/imob/orchestrator/imobCrmContinuityCoherenceReadModel";

test("IMOB continuity coherence read model exposes thresholds, constraints and a passing reference baseline", () => {
  const readModel = buildImobCrmContinuityCoherenceReadModel({
    workspaceId: "workspace-test",
    generatedAt: "2026-05-27T12:00:00.000Z",
    evaluations: buildImobReferenceContinuityScenarioEvaluations(),
  });

  assert.equal(readModel.workspaceId, "workspace-test");
  assert.equal(readModel.phase, "imob_crm_continuity_hardening_phase_1");
  assert.equal(readModel.rolloutConstraints.preserveExistingFlows, true);
  assert.equal(readModel.rolloutConstraints.preserveVisualLayout, true);
  assert.equal(readModel.rolloutConstraints.preserveResponsiveness, true);
  assert.equal(readModel.rolloutConstraints.launcherRulesChanged, false);
  assert.equal(readModel.thresholds.invalidSuggestedActionRateMax, 0.05);
  assert.equal(readModel.thresholds.businessContinuationSuccessRateMin, 0.7);
  assert.equal(readModel.metrics.score70Gate, true);
  assert.equal(readModel.scenarios.length, 5);
  assert.ok(readModel.scenarios.every((item) => item.passed));
});
