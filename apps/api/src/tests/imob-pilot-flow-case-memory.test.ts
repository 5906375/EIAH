import test from "node:test";
import assert from "node:assert/strict";

import {
  createImobPilotFlowCaseMemoryState,
  getImobPilotFlowCaseMemory,
  updateImobPilotFlowCaseMemory,
} from "../services/imob/imobPilotFlowCaseMemory";

test("pilot flow case memory stores latest suggested and executed flow per case", () => {
  const state = createImobPilotFlowCaseMemoryState();
  updateImobPilotFlowCaseMemory({
    state,
    result: {
      flowRunId: "flowrun-1",
      flowId: "flow-1",
      flowType: "assisted_calendar_flow",
      missionId: "mission-imob-case-1-schedule-real-calendar",
      visibleAgentId: "IMOB",
      capabilityId: "schedule.real_calendar",
      caseId: "case-1",
      leadId: "lead-1",
      gateDecision: { allowed: true, capability: null, reasonCodes: [], decisionTrail: [] },
      jobId: "imob-job-1",
      trackingId: "tracking-imob-job-1",
      evidenceRefs: [],
      status: "completed",
      nextHumanAction: "confirmar agenda",
      generatedAt: "2026-05-03T10:00:00.000Z",
    },
  });

  const memory = getImobPilotFlowCaseMemory({ state, caseId: "case-1" });
  assert.equal(memory?.lastSuggestedFlowType, "assisted_calendar_flow");
  assert.equal(memory?.lastExecutedFlowType, "assisted_calendar_flow");
  assert.equal(memory?.lastBlockedFlowType, null);
  assert.equal(memory?.lastFlowStatus, "completed");
  assert.equal(memory?.nextHumanAction, "confirmar agenda");
});

test("pilot flow case memory preserves last blocked flow and gate reasons", () => {
  const state = createImobPilotFlowCaseMemoryState();
  updateImobPilotFlowCaseMemory({
    state,
    result: {
      flowRunId: "flowrun-2",
      flowId: "flow-2",
      flowType: "assisted_reengagement_flow",
      missionId: "mission-imob-case-2-reengagement-continuous",
      visibleAgentId: "IMOB",
      capabilityId: "reengagement.continuous",
      caseId: "case-2",
      leadId: "lead-2",
      gateDecision: {
        allowed: false,
        capability: null,
        reasonCodes: ["consent_required", "policy_required"],
        decisionTrail: [],
        blocked: {
          code: "IMOB_CAPABILITY_GATED",
          capabilityId: "reengagement.continuous",
          message: "blocked",
        },
      },
      jobId: null,
      trackingId: null,
      evidenceRefs: [],
      status: "blocked",
      nextHumanAction: "coletar consentimento",
      generatedAt: "2026-05-03T10:05:00.000Z",
    },
  });

  const memory = getImobPilotFlowCaseMemory({ state, caseId: "case-2" });
  assert.equal(memory?.lastBlockedFlowType, "assisted_reengagement_flow");
  assert.deepEqual(memory?.lastGateReasonCodes, ["consent_required", "policy_required"]);
  assert.equal(memory?.lastFlowStatus, "blocked");
});
