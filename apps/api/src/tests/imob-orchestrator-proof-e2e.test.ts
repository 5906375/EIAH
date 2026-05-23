import test from "node:test";
import assert from "node:assert/strict";

import type { ImobCaseContextV1 } from "../services/imob/crm/imobCaseContextContract";
import { resolveCanonicalCaseStateFromLegacy } from "../services/imob/orchestrator/imobLegacyCompatibilityResolver";
import { buildImobMissionPolicy, resolveImobMissionProofState } from "../services/imob/orchestrator/imobMissionPolicy";
import { resolveImobMissionStatus } from "../services/imob/orchestrator/imobCompletionEvaluator";

function buildProofReadyLeadContext(): ImobCaseContextV1 {
  return {
    version: "1.0",
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    caseId: "lead-case-1",
    missionContext: {
      mission: "qualify_lead",
      lockedUntilExplicitChange: false,
    },
    entities: {
      lead: {
        id: "lead-1",
        name: "Fernanda",
        email: "fernanda@example.com",
        phone: "47999990000",
        desiredGoal: "locacao",
        desiredCity: "Balneário Camboriú",
      },
    },
    links: {
      ownerProperty: { status: "pending_confirmation" },
    },
    readiness: {
      ownerReady: false,
      propertyReady: false,
      documentsReady: false,
      seasonalRulesReady: false,
      operationalReady: true,
    },
    blockers: [],
  };
}

test("proof E2E keeps a mission blocked when operational readiness exists but required proof is still missing", () => {
  const result = resolveCanonicalCaseStateFromLegacy({
    context: buildProofReadyLeadContext(),
    operational: {
      flow: "lead.qualify",
      pendingFields: [],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.state.mission, "qualify_and_match_lead");
  assert.equal(result.state.proof.required, true);
  assert.equal(result.state.proof.minimumProofSatisfied, false);
  assert.deepEqual(result.state.proof.missingProof, ["evidence_bundle"]);
  assert.equal(result.state.readiness.proof, "blocked");
  assert.equal(result.state.missionStatus, "blocked");
});

test("proof E2E releases done only after the required proof becomes satisfied", () => {
  const result = resolveCanonicalCaseStateFromLegacy({
    context: buildProofReadyLeadContext(),
    operational: {
      flow: "lead.qualify",
      pendingFields: [],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  const completedState = {
    ...result.state,
    proof: {
      ...result.state.proof,
      evidenceBundleId: "bundle-1",
    },
  };
  const proofState = resolveImobMissionProofState("qualify_and_match_lead", completedState);
  const policy = buildImobMissionPolicy("qualify_and_match_lead");
  const missionStatus = resolveImobMissionStatus({
    mission: "qualify_and_match_lead",
    context: buildProofReadyLeadContext(),
    currentStep: completedState.currentStep,
    pendingFields: [],
    hasNextAction: true,
    proofRequired: policy.requiredProof.length > 0,
    proofSatisfied: proofState.minimumProofSatisfied,
  });

  assert.equal(proofState.minimumProofSatisfied, true);
  assert.equal(proofState.readiness, "ready");
  assert.equal(missionStatus, "done");
});
