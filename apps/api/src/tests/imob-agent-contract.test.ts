import test from "node:test";
import assert from "node:assert/strict";

import {
  buildImobAgentContractV1,
  buildImobAgentRuntimeMetadata,
  IMOB_AGENT_INITIAL_INTENT_IDS,
  listImobAgentInitialIntents,
} from "../services/imob/imobAgentContract";
import { resolveImobTurn } from "../services/imob/imobTurnResolver";

function createAccess() {
  return {
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    entitlements: { REAL_ESTATE_CORE: true },
  };
}

test("IMOB agent contract v1 exposes canonical visible identity and surfaces", () => {
  const contract = buildImobAgentContractV1();

  assert.equal(contract.id, "imob.case_concierge.v1");
  assert.equal(contract.version, 1);
  assert.equal(contract.visibleName, "IMOB");
  assert.equal(contract.role, "vertical_case_concierge");
  assert.equal(contract.surfaces.primary, "chat");
  assert.equal(contract.surfaces.management, "dashboard");
  assert.equal(contract.surfaces.activation, "marketplace");
  assert.equal(contract.ownershipModel.visibleAgentKeepsCaseOwnership, true);
  assert.equal(contract.ownershipModel.backingSpecialistsVisibleByDefault, false);
  assert.deepEqual(contract.runtimePolicies.contractIntake, {
    actionId: "imob.contract.intake",
    operationalState: "kill_switch_controlled",
    defaultEnabled: false,
    flagScope: "tenant_workspace",
    failMode: "closed",
    reasonCode: "VERTICAL_CAPABILITY_NOT_AVAILABLE",
    blockingCondition: "pending_pr1c_atomic_dispatch",
    retryable: false,
    httpStatus: 503,
    message: "O intake documental IMOB está temporariamente indisponível.",
  });
});

test("IMOB agent contract v1 reuses backing specialists and initial intents", () => {
  const contract = buildImobAgentContractV1();

  assert.deepEqual(contract.backingSpecialists, ["I_BC", "Diarias", "J_360", "fin-nexus", "guardian"]);
  assert.deepEqual(contract.initialIntents, [...IMOB_AGENT_INITIAL_INTENT_IDS]);
  assert.deepEqual(
    listImobAgentInitialIntents().map((intent) => intent.intentId),
    [...IMOB_AGENT_INITIAL_INTENT_IDS],
  );
  assert.equal(contract.capabilities.total, 16);
  assert.equal(contract.capabilities.runtimeExtensions.length, 4);
  assert.equal(contract.capabilities.externalIntegrations.length, 6);
  assert.equal(contract.capabilities.workerOrchestration.length, 6);
});

test("IMOB runtime metadata exposes promotion review surface in backend contract", () => {
  const runtime = buildImobAgentRuntimeMetadata();

  assert.equal(runtime.promotionReviewSurface?.visibleAgentId, "IMOB");
  assert.equal(runtime.promotionReviewSurface?.flows.length, 4);
  assert.equal(runtime.promotionReviewSurface?.flows[0]?.flowType, "assisted_calendar_flow");
  assert.equal(runtime.runtimePolicies.contractIntake.operationalState, "kill_switch_controlled");
  assert.equal(runtime.runtimePolicies.contractIntake.defaultEnabled, false);
  assert.equal(runtime.runtimePolicies.contractIntake.flagScope, "tenant_workspace");
  assert.equal(runtime.runtimePolicies.contractIntake.failMode, "closed");
  assert.equal(runtime.runtimePolicies.contractIntake.reasonCode, "VERTICAL_CAPABILITY_NOT_AVAILABLE");
});

test("IMOB runtime attaches canonical agent metadata to presentation payloads", () => {
  const result = resolveImobTurn({
    message: "quero retomar um caso antigo rapidamente com resumo do caso",
    access: createAccess(),
  });

  assert.equal(result.presentation.metadata?.agentRuntime?.contractId, "imob.case_concierge.v1");
  assert.equal(result.presentation.metadata?.agentRuntime?.visibleAgentId, "IMOB");
  assert.equal(result.presentation.metadata?.agentRuntime?.surfaces.primary, "chat");
  assert.deepEqual(result.presentation.metadata?.agentRuntime?.backingSpecialists, ["I_BC", "Diarias", "J_360", "fin-nexus", "guardian"]);
  assert.deepEqual(result.presentation.metadata?.agentRuntime?.initialIntents, [...IMOB_AGENT_INITIAL_INTENT_IDS]);
  assert.equal(result.presentation.metadata?.agentRuntime?.capabilities.total, 16);
  assert.equal(result.presentation.metadata?.agentRuntime?.capabilities.runtimeExtensions[0]?.capabilityId, "lead.qualify.discovery");
  assert.equal(result.presentation.metadata?.agentRuntime?.capabilities.externalIntegrations[0]?.capabilityId, "active_capture.scouting");
  assert.equal(result.presentation.metadata?.agentRuntime?.capabilities.workerOrchestration[0]?.capabilityId, "lead.scoring");
  assert.equal(result.presentation.metadata?.agentRuntime?.promotionReviewSurface?.visibleAgentId, "IMOB");
  assert.equal(result.presentation.metadata?.agentRuntime?.promotionReviewSurface?.flows.length, 4);
});
