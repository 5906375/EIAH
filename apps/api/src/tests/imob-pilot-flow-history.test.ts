import test from "node:test";
import assert from "node:assert/strict";

import {
  buildImobPilotFlowRunId,
  createImobPilotFlowHistoryState,
  recordImobPilotFlowRun,
} from "../services/imob/imobPilotFlowHistory";

test("pilot flow history records deterministic flow run id and preserves evidence", () => {
  const state = createImobPilotFlowHistoryState();
  const entry = recordImobPilotFlowRun({
    state,
    entry: {
      flowId: "flow-123",
      flowType: "assisted_calendar_flow",
      missionId: "mission-imob-case-1-schedule-real-calendar",
      capabilityId: "schedule.real_calendar",
      caseId: "case-1",
      leadId: "lead-1",
      status: "completed",
      gateReasonCodes: [],
      jobId: "imob-job-1",
      trackingId: "tracking-imob-job-1",
      visibleAgentId: "IMOB",
      evidenceRefs: [{ kind: "workflow_signal", ref: "pilot.job.id", label: "Job", value: "imob-job-1" }],
      generatedAt: "2026-05-03T10:00:00.000Z",
    },
  });

  assert.equal(entry.flowRunId, buildImobPilotFlowRunId({
    flowId: "flow-123",
    status: "completed",
    generatedAt: "2026-05-03T10:00:00.000Z",
  }));
  assert.equal(state.entries.length, 1);
  assert.equal(state.entries[0]?.visibleAgentId, "IMOB");
  assert.equal(state.entries[0]?.evidenceRefs[0]?.ref, "pilot.job.id");
});

test("pilot flow history does not duplicate identical flow run entries", () => {
  const state = createImobPilotFlowHistoryState();
  const first = recordImobPilotFlowRun({
    state,
    entry: {
      flowId: "flow-abc",
      flowType: "assisted_listing_flow",
      missionId: "mission-imob-case-2-listing-ads-api-publish",
      capabilityId: "listing.ads_api_publish",
      caseId: "case-2",
      leadId: "lead-2",
      status: "duplicate",
      gateReasonCodes: [],
      jobId: "imob-job-2",
      trackingId: "tracking-imob-job-2",
      visibleAgentId: "IMOB",
      evidenceRefs: [],
      generatedAt: "2026-05-03T10:10:00.000Z",
    },
  });
  const second = recordImobPilotFlowRun({
    state,
    entry: {
      flowId: "flow-abc",
      flowType: "assisted_listing_flow",
      missionId: "mission-imob-case-2-listing-ads-api-publish",
      capabilityId: "listing.ads_api_publish",
      caseId: "case-2",
      leadId: "lead-2",
      status: "duplicate",
      gateReasonCodes: [],
      jobId: "imob-job-2",
      trackingId: "tracking-imob-job-2",
      visibleAgentId: "IMOB",
      evidenceRefs: [],
      generatedAt: "2026-05-03T10:10:00.000Z",
    },
  });

  assert.equal(first.flowRunId, second.flowRunId);
  assert.equal(state.entries.length, 1);
});
