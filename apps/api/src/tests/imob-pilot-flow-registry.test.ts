import test from "node:test";
import assert from "node:assert/strict";

import {
  getImobPilotFlow,
  listImobPilotFlows,
} from "../services/imob/imobPilotFlowRegistry";

test("pilot flow registry keeps IMOB as visible owner across all flows", () => {
  const flows = listImobPilotFlows();

  assert.ok(flows.length > 0);
  for (const flow of flows) {
    assert.equal(flow.visibleAgentId, "IMOB");
    assert.notEqual(flow.ownerAgent.trim(), "");
  }
});

test("pilot flow registry keeps required governance fields populated", () => {
  for (const flow of listImobPilotFlows()) {
    assert.notEqual(flow.flowType.trim(), "");
    assert.notEqual(flow.status.trim(), "");
    assert.notEqual(flow.executionMode.trim(), "");
    assert.notEqual(flow.riskTier.trim(), "");
    assert.notEqual(flow.rolloutStage.trim(), "");
    assert.notEqual(flow.primaryCapability.trim(), "");
    assert.ok(flow.supportingCapabilities.length >= 1);
  }
});

test("sensitive pilot flows do not start automated", () => {
  for (const flow of listImobPilotFlows()) {
    if (flow.riskTier !== "HIGH" && flow.riskTier !== "CRITICAL") continue;
    assert.notEqual(flow.executionMode, "automated");
  }
});

test("all pilot flows start in shadow governance", () => {
  for (const flow of listImobPilotFlows()) {
    assert.equal(flow.status, "ready_for_shadow");
    assert.equal(flow.executionMode, "shadow");
    assert.equal(flow.rolloutStage, "shadow");
  }
});

test("pilot flow registry resolves flow by type", () => {
  const flow = getImobPilotFlow("assisted_reengagement_flow");

  assert.ok(flow);
  assert.equal(flow?.primaryCapability, "reengagement.continuous");
  assert.ok(flow?.supportingCapabilities.includes("outbound.owner_contact"));
});
