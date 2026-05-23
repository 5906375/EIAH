import test from "node:test";
import assert from "node:assert/strict";

import { evaluateProofGate } from "../services/imob/orchestrator/imobProofGate";
import type { ImobCaseState, ImobMissionPolicy } from "../services/imob/orchestrator/imobMissionTypes";

function createLeadState(): ImobCaseState<"qualify_and_match_lead"> {
  return {
    schemaVersion: 1,
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    caseId: "case-1",
    mission: "qualify_and_match_lead",
    missionStatus: "ready_for_transition",
    currentStep: "ready_for_visit",
    currentOperation: "lead",
    entities: { leadId: "lead-1" },
    readiness: { lead: "ready", proof: "ready" },
    blockers: [],
    pendingFields: [],
    nextAction: {
      id: "visit-next",
      label: "Agendar visita",
      operation: "visit",
      targetAgent: "IMOB_VisitAgent",
      reasonCode: "LEAD_READY_FOR_VISIT",
    },
    proof: {
      required: true,
      minimumProofSatisfied: true,
      missingProof: [],
      evidenceBundleId: "bundle-1",
    },
    audit: {
      version: 7,
      lastUpdatedAt: "2026-05-23T10:00:00.000Z",
      updatedByAgent: "IMOB",
    },
  };
}

test("done is allowed when required proof is satisfied", () => {
  const state = createLeadState();
  const policy: ImobMissionPolicy = {
    mission: "qualify_and_match_lead",
    requiredEntities: ["leadId"],
    requiredProof: ["evidence_bundle"],
    allowedOperations: ["lead", "visit", "proof"],
    criticalActions: [],
    missionTier: "p0",
  };

  const result = evaluateProofGate("qualify_and_match_lead", state, policy);
  assert.deepEqual(result, { ok: true, minimumProofSatisfied: true });
});

test("done is blocked when required proof is missing", () => {
  const state = createLeadState();
  state.proof.evidenceBundleId = undefined;
  const policy: ImobMissionPolicy = {
    mission: "qualify_and_match_lead",
    requiredEntities: ["leadId"],
    requiredProof: ["evidence_bundle"],
    allowedOperations: ["lead", "visit", "proof"],
    criticalActions: [],
    missionTier: "p0",
  };

  const result = evaluateProofGate("qualify_and_match_lead", state, policy);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reasonCode, "MISSING_REQUIRED_PROOF");
    assert.deepEqual(result.missingProof, ["evidence_bundle"]);
  }
});
