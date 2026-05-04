import test from "node:test";
import assert from "node:assert/strict";

import { evaluateImobPilotFlowPromotion } from "../services/imob/imobPilotFlowPromotion";
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
      { kind: "workflow_signal", ref: "pilot.flow.type", label: "Flow", value: "assisted_calendar_flow" },
      { kind: "workflow_signal", ref: "pilot.job.id", label: "Job", value: "imob-job-1" },
      { kind: "workflow_signal", ref: "pilot.tracking.id", label: "Tracking", value: "tracking-imob-job-1" },
    ],
    generatedAt: "2026-05-03T10:00:00.000Z",
    ...overrides,
  };
}

test("promotion blocks flow when evidence or completed runs are insufficient", () => {
  const decision = evaluateImobPilotFlowPromotion({
    flowType: "assisted_calendar_flow",
    history: [makeEntry({ evidenceRefs: [{ kind: "workflow_signal", ref: "pilot.flow.type", label: "Flow", value: "assisted_calendar_flow" }] })],
  });

  assert.equal(decision.eligible, false);
  assert.ok(decision.reasonCodes.includes("insufficient_completed_runs"));
  assert.ok(decision.reasonCodes.includes("evidence_below_threshold"));
});

test("promotion blocks flow when block rate is above threshold", () => {
  const decision = evaluateImobPilotFlowPromotion({
    flowType: "assisted_calendar_flow",
    history: [
      makeEntry({ flowRunId: "a", status: "blocked", gateReasonCodes: ["policy_required"] }),
      makeEntry({ flowRunId: "b", status: "blocked", gateReasonCodes: ["policy_required"] }),
      makeEntry({ flowRunId: "c", status: "completed" }),
    ],
    thresholds: { maxBlockRate: 0.5 },
  });

  assert.equal(decision.eligible, false);
  assert.ok(decision.reasonCodes.includes("block_rate_above_threshold"));
});

test("promotion blocks flow when duplicate rate is above threshold", () => {
  const decision = evaluateImobPilotFlowPromotion({
    flowType: "assisted_listing_flow",
    history: [
      makeEntry({ flowRunId: "a", flowType: "assisted_listing_flow", capabilityId: "listing.ads_api_publish", status: "duplicate" }),
      makeEntry({ flowRunId: "b", flowType: "assisted_listing_flow", capabilityId: "listing.ads_api_publish", status: "duplicate" }),
      makeEntry({ flowRunId: "c", flowType: "assisted_listing_flow", capabilityId: "listing.ads_api_publish", status: "completed" }),
      makeEntry({ flowRunId: "d", flowType: "assisted_listing_flow", capabilityId: "listing.ads_api_publish", status: "completed" }),
    ],
    thresholds: { maxDuplicateRate: 0.25 },
  });

  assert.equal(decision.eligible, false);
  assert.ok(decision.reasonCodes.includes("duplicate_rate_above_threshold"));
});

test("promotion blocks flow when ownership is not preserved", () => {
  const decision = evaluateImobPilotFlowPromotion({
    flowType: "shadow_capture_enrichment_flow",
    history: [
      makeEntry({
        flowRunId: "a",
        flowType: "shadow_capture_enrichment_flow",
        capabilityId: "active_capture.scouting",
        status: "shadow_recorded",
        visibleAgentId: "IMOB",
      }),
      {
        ...makeEntry({
          flowRunId: "b",
          flowType: "shadow_capture_enrichment_flow",
          capabilityId: "active_capture.scouting",
          status: "shadow_recorded",
        }),
        visibleAgentId: "IMOB" as const,
      },
    ],
  });

  assert.equal(decision.metrics.ownershipPreserved, true);
  assert.equal(decision.reasonCodes.includes("ownership_mismatch"), false);
});

test("promotion marks flow eligible when thresholds are satisfied", () => {
  const decision = evaluateImobPilotFlowPromotion({
    flowType: "assisted_calendar_flow",
    history: [
      makeEntry({ flowRunId: "a", status: "completed" }),
      makeEntry({ flowRunId: "b", status: "completed", generatedAt: "2026-05-03T10:01:00.000Z" }),
      makeEntry({ flowRunId: "c", status: "completed", generatedAt: "2026-05-03T10:02:00.000Z" }),
    ],
  });

  assert.equal(decision.eligible, true);
  assert.equal(decision.reasonCodes.length, 0);
  assert.equal(decision.metrics.completedRuns, 3);
});
