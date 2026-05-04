import test from "node:test";
import assert from "node:assert/strict";

import { buildImobPilotOperationalSurface } from "../services/imob/imobPilotOperationalSurface";
import { createImobPilotApprovalState, recordImobPilotApprovalDecision } from "../services/imob/imobPilotApprovalRuntime";
import { createImobPilotRolloutState, upsertImobPilotRolloutState } from "../services/imob/imobPilotRolloutState";

test("pilot operational surface returns approval_required when no persisted pilot state exists", () => {
  const surface = buildImobPilotOperationalSurface({
    caseContext: {
      caseId: "case-1",
      flow: "visit.schedule",
      nextStep: "confirmar agenda da visita",
      lead: { id: "lead-1" },
    },
    generatedAt: "2026-05-03T20:00:00.000Z",
  });

  assert.equal(surface?.activePilotFlow, "assisted_calendar_flow");
  assert.equal(surface?.rolloutStage, "shadow");
  assert.equal(surface?.status, "approval_required");
  assert.equal(surface?.approvalDecision, null);
  assert.equal(surface?.trackingId, null);
  assert.equal(surface?.evidenceRefs.length, 0);
});

test("pilot operational surface reflects existing pilot state with tracking and evidence", () => {
  const approvalState = createImobPilotApprovalState();
  const rolloutState = createImobPilotRolloutState();
  const approval = recordImobPilotApprovalDecision({
    state: approvalState,
    flowType: "assisted_calendar_flow",
    decision: "approved",
    approvedBy: "director@acme.test",
    approvedAt: "2026-05-03T20:01:00.000Z",
    approvalReason: "Piloto aprovado.",
    evidenceRefs: [
      {
        kind: "workflow_signal",
        ref: "approval.calendar",
        label: "Calendar approval",
        value: true,
      },
    ],
  });
  const rollout = upsertImobPilotRolloutState({
    state: rolloutState,
    flowType: "assisted_calendar_flow",
    currentStage: "pilot",
    approvalEntry: approval,
  });
  const surface = buildImobPilotOperationalSurface({
    caseContext: {
      caseId: "case-1",
      flow: "visit.schedule",
      nextStep: "confirmar agenda da visita",
      lead: { id: "lead-1" },
    },
    approvalEntry: approval,
    rolloutEntry: rollout,
    latestPilotFlow: {
      flowRunId: "flowrun-1",
      flowId: "flow-1",
      flowType: "assisted_calendar_flow",
      missionId: "mission-imob-case-1-schedule-real-calendar",
      visibleAgentId: "IMOB",
      capabilityId: "schedule.real_calendar",
      caseId: "case-1",
      leadId: "lead-1",
      gateDecision: {
        allowed: true,
        capability: null,
        reasonCodes: [],
      },
      trackingId: "tracking-imob-job-1",
      jobId: "imob-job-1",
      evidenceRefs: [
        {
          kind: "workflow_signal",
          ref: "pilot.tracking.id",
          label: "Tracking",
          value: "tracking-imob-job-1",
        },
      ],
      status: "completed",
      nextHumanAction: "acompanhar tracking sandbox existente",
      generatedAt: "2026-05-03T20:05:00.000Z",
    },
    generatedAt: "2026-05-03T20:05:00.000Z",
  });

  assert.equal(surface?.status, "pilot_active");
  assert.equal(surface?.approvalDecision, "approved");
  assert.equal(surface?.approvalRef, approval.approvalId);
  assert.equal(surface?.trackingId, "tracking-imob-job-1");
  assert.ok((surface?.evidenceRefs.length ?? 0) >= 2);
  assert.match(surface?.nextHumanAction ?? "", /tracking sandbox existente/i);
});

test("pilot operational surface computes canRegressToShadow in backend from persisted pilot state", () => {
  const approvalState = createImobPilotApprovalState();
  const rolloutState = createImobPilotRolloutState();
  const approval = recordImobPilotApprovalDecision({
    state: approvalState,
    flowType: "assisted_calendar_flow",
    decision: "approved",
    approvedBy: "director@acme.test",
    approvedAt: "2026-05-03T20:10:00.000Z",
    approvalReason: "Piloto aprovado.",
    evidenceRefs: [
      {
        kind: "workflow_signal",
        ref: "approval.calendar",
        label: "Calendar approval",
        value: true,
      },
    ],
  });
  const rollout = upsertImobPilotRolloutState({
    state: rolloutState,
    flowType: "assisted_calendar_flow",
    currentStage: "pilot",
    approvalEntry: approval,
  });
  const surface = buildImobPilotOperationalSurface({
    caseContext: {
      caseId: "case-1",
      flow: "visit.schedule",
      nextStep: "confirmar agenda da visita",
      lead: { id: "lead-1" },
    },
    approvalEntry: approval,
    rolloutEntry: rollout,
    generatedAt: "2026-05-03T20:10:00.000Z",
  });

  assert.equal(surface?.canRegressToShadow, true);
  assert.equal(surface?.visibleAgentId, "IMOB");
});

test("pilot operational surface does not activate for other flows", () => {
  const surface = buildImobPilotOperationalSurface({
    caseContext: {
      caseId: "case-2",
      flow: "listing.activate",
      nextStep: "publicar imóvel",
    },
    generatedAt: "2026-05-03T20:15:00.000Z",
  });

  assert.equal(surface, undefined);
});

test("ready_for_review-like context does not grant approval automatically", () => {
  const surface = buildImobPilotOperationalSurface({
    caseContext: {
      caseId: "case-3",
      flow: "visit.schedule",
      nextStep: "confirmar agenda da visita",
      lead: { id: "lead-3" },
    },
    generatedAt: "2026-05-03T20:20:00.000Z",
  });

  assert.equal(surface?.status, "approval_required");
  assert.equal(surface?.rolloutStage, "shadow");
  assert.equal(surface?.approvalRef, null);
});

test("approval without rollout does not become pilot_active", () => {
  const approvalState = createImobPilotApprovalState();
  const approval = recordImobPilotApprovalDecision({
    state: approvalState,
    flowType: "assisted_calendar_flow",
    decision: "approved",
    approvedBy: "director@acme.test",
    approvedAt: "2026-05-03T20:25:00.000Z",
    approvalReason: "Approval auditável sem início de piloto.",
  });
  const surface = buildImobPilotOperationalSurface({
    caseContext: {
      caseId: "case-4",
      flow: "visit.schedule",
      nextStep: "confirmar agenda da visita",
      lead: { id: "lead-4" },
    },
    approvalEntry: approval,
    generatedAt: "2026-05-03T20:25:00.000Z",
  });

  assert.equal(surface?.status, "inactive");
  assert.equal(surface?.trackingId, null);
  assert.equal(surface?.canRegressToShadow, false);
});
