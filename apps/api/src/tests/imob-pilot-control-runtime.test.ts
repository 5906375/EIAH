import test from "node:test";
import assert from "node:assert/strict";

import {
  createImobPilotControlState,
  runImobPilotControl,
} from "../services/imob/imobPilotControlRuntime";

function createCaseContext() {
  return {
    caseId: "case-1",
    flow: "visit.schedule",
    nextStep: "confirmar agenda da visita",
    lead: { id: "lead-1" },
  };
}

test("pilot control approve registers auditable approval and does not start pilot", () => {
  const state = createImobPilotControlState();

  const result = runImobPilotControl({
    action: "approve",
    state,
    flowType: "assisted_calendar_flow",
    caseContext: createCaseContext(),
    approvedBy: "director@acme.test",
    approvalReason: "Fluxo autorizado para piloto controlado.",
    evidenceRefs: [
      {
        kind: "workflow_signal",
        ref: "approval.calendar",
        label: "Calendar approval",
        value: true,
      },
    ],
    generatedAt: "2026-05-04T10:00:00.000Z",
  });

  assert.equal(result.status, "approval_recorded");
  assert.match(String(result.approvalRef ?? ""), /^approval-/);
  assert.equal(result.trackingId, null);
  assert.equal(state.approvals.entries.length, 1);
  assert.equal(state.latestCalendarPilotFlow, null);
});

test("pilot control start_pilot fails without approval", () => {
  const state = createImobPilotControlState();

  const result = runImobPilotControl({
    action: "start_pilot",
    state,
    flowType: "assisted_calendar_flow",
    caseContext: createCaseContext(),
    generatedAt: "2026-05-04T10:05:00.000Z",
  });

  assert.equal(result.status, "approval_required");
  assert.equal(result.rolloutStage, "shadow");
  assert.equal(result.trackingId, null);
});

test("pilot control start_pilot enters pilot with tracking and job when approval exists", () => {
  const state = createImobPilotControlState();
  runImobPilotControl({
    action: "approve",
    state,
    flowType: "assisted_calendar_flow",
    caseContext: createCaseContext(),
    approvedBy: "director@acme.test",
    approvalReason: "Fluxo autorizado para piloto controlado.",
    evidenceRefs: [
      {
        kind: "workflow_signal",
        ref: "approval.calendar",
        label: "Calendar approval",
        value: true,
      },
    ],
    generatedAt: "2026-05-04T10:10:00.000Z",
  });

  const result = runImobPilotControl({
    action: "start_pilot",
    state,
    flowType: "assisted_calendar_flow",
    caseContext: createCaseContext(),
    generatedAt: "2026-05-04T10:11:00.000Z",
  });

  assert.equal(result.status, "pilot_active");
  assert.equal(result.rolloutStage, "pilot");
  assert.match(String(result.trackingId ?? ""), /^tracking-imob-job-/);
  assert.match(String(result.jobId ?? ""), /^imob-job-/);
  assert.equal(state.rollout.entries[0]?.currentStage, "pilot");
});

test("pilot control hold_pilot preserves history and does not promote", () => {
  const state = createImobPilotControlState();
  runImobPilotControl({
    action: "approve",
    state,
    flowType: "assisted_calendar_flow",
    caseContext: createCaseContext(),
    approvedBy: "director@acme.test",
    approvalReason: "Fluxo autorizado para piloto controlado.",
    evidenceRefs: [],
    generatedAt: "2026-05-04T10:15:00.000Z",
  });

  const result = runImobPilotControl({
    action: "hold_pilot",
    state,
    flowType: "assisted_calendar_flow",
    caseContext: createCaseContext(),
    approvedBy: "ops@acme.test",
    approvalReason: "Manter em shadow por revisão operacional.",
    evidenceRefs: [
      {
        kind: "workflow_signal",
        ref: "hold.reason",
        label: "Hold",
        value: true,
      },
    ],
    generatedAt: "2026-05-04T10:16:00.000Z",
  });

  assert.equal(result.status, "shadow");
  assert.equal(result.rolloutStage, "shadow");
  assert.equal(state.approvals.entries.length, 2);
  assert.equal(state.rollout.entries[0]?.currentStage, "shadow");
});

test("pilot control regress_to_shadow returns pilot to shadow", () => {
  const state = createImobPilotControlState();
  runImobPilotControl({
    action: "approve",
    state,
    flowType: "assisted_calendar_flow",
    caseContext: createCaseContext(),
    approvedBy: "director@acme.test",
    approvalReason: "Fluxo autorizado para piloto controlado.",
    evidenceRefs: [
      {
        kind: "workflow_signal",
        ref: "approval.calendar",
        label: "Calendar approval",
        value: true,
      },
    ],
    generatedAt: "2026-05-04T10:20:00.000Z",
  });
  runImobPilotControl({
    action: "start_pilot",
    state,
    flowType: "assisted_calendar_flow",
    caseContext: createCaseContext(),
    generatedAt: "2026-05-04T10:21:00.000Z",
  });

  const result = runImobPilotControl({
    action: "regress_to_shadow",
    state,
    flowType: "assisted_calendar_flow",
    caseContext: createCaseContext(),
    approvedBy: "governance@acme.test",
    approvalReason: "Regredir por revisão de governança.",
    evidenceRefs: [
      {
        kind: "workflow_signal",
        ref: "regress.reason",
        label: "Regression",
        value: true,
      },
    ],
    generatedAt: "2026-05-04T10:22:00.000Z",
  });

  assert.equal(result.status, "shadow");
  assert.equal(result.rolloutStage, "shadow");
  assert.equal(state.rollout.entries[0]?.currentStage, "shadow");
});

test("pilot control read_status is read-only and creates no approval or tracking", () => {
  const state = createImobPilotControlState();

  const beforeApprovals = state.approvals.entries.length;
  const result = runImobPilotControl({
    action: "read_status",
    state,
    flowType: "assisted_calendar_flow",
    caseContext: createCaseContext(),
    generatedAt: "2026-05-04T10:25:00.000Z",
  });

  assert.equal(result.status, "approval_required");
  assert.equal(state.approvals.entries.length, beforeApprovals);
  assert.equal(state.latestCalendarPilotFlow, null);
  assert.equal(result.trackingId, null);
  assert.equal(result.evidenceRefs.length, 0);
});

test("pilot control read_status reflects existing pilot state without creating new tracking", () => {
  const state = createImobPilotControlState();
  runImobPilotControl({
    action: "approve",
    state,
    flowType: "assisted_calendar_flow",
    caseContext: createCaseContext(),
    approvedBy: "director@acme.test",
    approvalReason: "Fluxo autorizado para piloto controlado.",
    evidenceRefs: [
      {
        kind: "workflow_signal",
        ref: "approval.calendar",
        label: "Calendar approval",
        value: true,
      },
    ],
    generatedAt: "2026-05-04T10:30:00.000Z",
  });
  const started = runImobPilotControl({
    action: "start_pilot",
    state,
    flowType: "assisted_calendar_flow",
    caseContext: createCaseContext(),
    generatedAt: "2026-05-04T10:31:00.000Z",
  });

  const result = runImobPilotControl({
    action: "read_status",
    state,
    flowType: "assisted_calendar_flow",
    caseContext: createCaseContext(),
    generatedAt: "2026-05-04T10:32:00.000Z",
  });

  assert.equal(result.status, "pilot_active");
  assert.equal(result.trackingId, started.trackingId);
  assert.equal(state.approvals.entries.length, 1);
});

test("pilot control keeps visible owner as IMOB and does not promote other flows", () => {
  const state = createImobPilotControlState();
  const result = runImobPilotControl({
    action: "approve",
    state,
    flowType: "assisted_calendar_flow",
    caseContext: createCaseContext(),
    approvedBy: "director@acme.test",
    approvalReason: "Fluxo autorizado para piloto controlado.",
    evidenceRefs: [],
    generatedAt: "2026-05-04T10:35:00.000Z",
  });

  assert.equal(result.visibleAgentId, "IMOB");
  assert.equal(state.rollout.entries.find((item) => item.flowType === "assisted_listing_flow"), undefined);
});
