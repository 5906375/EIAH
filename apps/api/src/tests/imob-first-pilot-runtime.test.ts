import test from "node:test";
import assert from "node:assert/strict";

import {
  createImobFirstPilotState,
  regressImobFirstCalendarPilotToShadow,
  startImobFirstCalendarPilot,
} from "../services/imob/imobFirstPilotRuntime";
import { recordImobPilotApprovalDecision } from "../services/imob/imobPilotApprovalRuntime";
import { getImobPilotRolloutStateEntry } from "../services/imob/imobPilotRolloutState";

test("first pilot blocks calendar flow when approval is missing", () => {
  const state = createImobFirstPilotState();

  const result = startImobFirstCalendarPilot({
    state,
    caseId: "case-1",
    leadId: "lead-1",
    generatedAt: "2026-05-03T19:00:00.000Z",
  });

  assert.equal(result.status, "blocked");
  assert.equal(result.currentStage, "shadow");
  assert.equal(result.visibleAgentId, "IMOB");
});

test("first pilot enters pilot after approved approval and emits tracking/evidence", () => {
  const state = createImobFirstPilotState();
  recordImobPilotApprovalDecision({
    state: state.approvals,
    flowType: "assisted_calendar_flow",
    decision: "approved",
    approvedBy: "director@acme.test",
    approvedAt: "2026-05-03T19:05:00.000Z",
    approvalReason: "Agenda autorizada para piloto controlado.",
    evidenceRefs: [
      {
        kind: "workflow_signal",
        ref: "approval.calendar.ready",
        label: "Calendar approval",
        value: true,
      },
    ],
  });

  const result = startImobFirstCalendarPilot({
    state,
    caseId: "case-1",
    leadId: "lead-1",
    payload: { preferredDate: "2026-05-05" },
    generatedAt: "2026-05-03T19:10:00.000Z",
  });

  assert.equal(result.status, "pilot_active");
  assert.equal(result.currentStage, "pilot");
  assert.match(String(result.trackingId ?? ""), /^tracking-imob-job-/);
  assert.match(String(result.jobId ?? ""), /^imob-job-/);
  assert.ok(result.evidenceRefs.some((item) => item.ref === "approval.calendar.ready"));
  assert.ok(result.evidenceRefs.some((item) => item.ref === "pilot.runtime.stage"));
});

test("first pilot persists rollout state for assisted calendar flow only", () => {
  const state = createImobFirstPilotState();
  recordImobPilotApprovalDecision({
    state: state.approvals,
    flowType: "assisted_calendar_flow",
    decision: "approved",
    approvedBy: "director@acme.test",
    approvedAt: "2026-05-03T19:15:00.000Z",
    approvalReason: "Abrir piloto calendar.",
    evidenceRefs: [
      {
        kind: "workflow_signal",
        ref: "approval.calendar",
        label: "Calendar",
        value: true,
      },
    ],
  });

  startImobFirstCalendarPilot({
    state,
    caseId: "case-2",
    leadId: "lead-2",
    generatedAt: "2026-05-03T19:20:00.000Z",
  });

  const calendar = getImobPilotRolloutStateEntry({
    state: state.rollout,
    flowType: "assisted_calendar_flow",
  });
  const listing = getImobPilotRolloutStateEntry({
    state: state.rollout,
    flowType: "assisted_listing_flow",
  });

  assert.equal(calendar?.currentStage, "pilot");
  assert.equal(listing, null);
});

test("first pilot can regress calendar flow safely back to shadow", () => {
  const state = createImobFirstPilotState();
  recordImobPilotApprovalDecision({
    state: state.approvals,
    flowType: "assisted_calendar_flow",
    decision: "approved",
    approvedBy: "director@acme.test",
    approvedAt: "2026-05-03T19:25:00.000Z",
    approvalReason: "Abrir piloto calendar.",
    evidenceRefs: [
      {
        kind: "workflow_signal",
        ref: "approval.calendar",
        label: "Calendar",
        value: true,
      },
    ],
  });
  startImobFirstCalendarPilot({
    state,
    caseId: "case-3",
    leadId: "lead-3",
    generatedAt: "2026-05-03T19:30:00.000Z",
  });

  const regression = regressImobFirstCalendarPilotToShadow({
    state,
    approvedBy: "governance@acme.test",
    approvalReason: "Regredir por revisão de governança.",
    evidenceRefs: [
      {
        kind: "workflow_signal",
        ref: "pilot.regression",
        label: "Regression",
        value: true,
      },
    ],
    generatedAt: "2026-05-03T19:35:00.000Z",
  });

  const calendar = getImobPilotRolloutStateEntry({
    state: state.rollout,
    flowType: "assisted_calendar_flow",
  });

  assert.equal(regression.status, "shadow");
  assert.equal(regression.currentStage, "shadow");
  assert.equal(calendar?.currentStage, "shadow");
  assert.ok(regression.evidenceRefs.some((item) => item.ref === "pilot.regression"));
});

test("first pilot remains blocked when approval exists but lacks evidence for gate", () => {
  const state = createImobFirstPilotState();
  recordImobPilotApprovalDecision({
    state: state.approvals,
    flowType: "assisted_calendar_flow",
    decision: "approved",
    approvedBy: "director@acme.test",
    approvedAt: "2026-05-03T19:40:00.000Z",
    approvalReason: "Approval sem evidência suficiente.",
    evidenceRefs: [],
  });

  const result = startImobFirstCalendarPilot({
    state,
    caseId: "case-4",
    leadId: "lead-4",
    generatedAt: "2026-05-03T19:45:00.000Z",
  });

  assert.equal(result.status, "blocked");
  assert.equal(result.currentStage, "pilot");
  assert.equal(result.visibleAgentId, "IMOB");
});
