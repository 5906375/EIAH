import test from "node:test";
import assert from "node:assert/strict";

import {
  buildImobPilotFlowObservability,
  buildImobPilotFlowObservabilityByType,
} from "../services/imob/imobPilotFlowObservability";
import type { ImobPilotFlowHistoryEntry } from "../services/imob/imobPilotFlowHistory";

function makeEntry(overrides?: Partial<ImobPilotFlowHistoryEntry>): ImobPilotFlowHistoryEntry {
  return {
    flowRunId: "flowrun-1",
    flowId: "flow-1",
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
    evidenceRefs: [
      { kind: "workflow_signal", ref: "pilot.flow.generated_at", label: "Flow gerado em", value: "2026-05-03T10:00:00.000Z" },
    ],
    generatedAt: "2026-05-03T10:00:00.000Z",
    ...overrides,
  };
}

test("pilot flow observability aggregates overall metrics", () => {
  const history = [
    makeEntry({ flowRunId: "a", status: "completed" }),
    makeEntry({ flowRunId: "b", status: "shadow_recorded", flowType: "shadow_capture_enrichment_flow", capabilityId: "active_capture.scouting" }),
    makeEntry({ flowRunId: "c", status: "blocked" }),
    makeEntry({ flowRunId: "d", status: "duplicate" }),
  ];

  const snapshot = buildImobPilotFlowObservability({ history });
  assert.equal(snapshot.flowsExecuted, 4);
  assert.equal(snapshot.flowsBlocked, 1);
  assert.equal(snapshot.flowsCompleted, 1);
  assert.equal(snapshot.flowsShadowRecorded, 1);
  assert.equal(snapshot.duplicateRate, 0.25);
  assert.equal(snapshot.gateBlockRate, 0.25);
  assert.equal(snapshot.sandboxSuccessRate, 0.5);
});

test("pilot flow observability groups metrics by flow type", () => {
  const grouped = buildImobPilotFlowObservabilityByType({
    history: [
      makeEntry({ flowRunId: "a", flowType: "assisted_calendar_flow", status: "completed" }),
      makeEntry({ flowRunId: "b", flowType: "assisted_calendar_flow", status: "blocked" }),
      makeEntry({ flowRunId: "c", flowType: "assisted_listing_flow", capabilityId: "listing.ads_api_publish", status: "completed" }),
    ],
  });

  assert.equal(grouped.assisted_calendar_flow?.flowsExecuted, 2);
  assert.equal(grouped.assisted_calendar_flow?.flowsBlocked, 1);
  assert.equal(grouped.assisted_listing_flow?.flowsCompleted, 1);
});
