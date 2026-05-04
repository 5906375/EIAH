import test from "node:test";
import assert from "node:assert/strict";

import { buildImobPromotionReviewSurface } from "../services/imob/imobPromotionReviewSurface";
import type { ImobPilotFlowHistoryEntry } from "../services/imob/imobPilotFlowHistory";
import type { ImobPilotFlowRegistryEntry } from "../services/imob/imobPilotFlowRegistry";

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

test("promotion review surface contains all flows and keeps B2B2C priority ordering", () => {
  const snapshot = buildImobPromotionReviewSurface({
    history: [],
    generatedAt: "2026-05-03T11:00:00.000Z",
  });

  assert.equal(snapshot.flows.length, 4);
  assert.deepEqual(snapshot.flows.map((item) => item.flowType), [
    "assisted_calendar_flow",
    "assisted_listing_flow",
    "assisted_reengagement_flow",
    "shadow_capture_enrichment_flow",
  ]);
});

test("promotion review surface summary aggregates readiness correctly", () => {
  const snapshot = buildImobPromotionReviewSurface({
    history: [
      makeEntry({ flowRunId: "a", flowType: "assisted_calendar_flow", status: "completed" }),
      makeEntry({ flowRunId: "b", flowType: "assisted_calendar_flow", status: "completed", generatedAt: "2026-05-03T10:01:00.000Z" }),
      makeEntry({ flowRunId: "c", flowType: "assisted_calendar_flow", status: "completed", generatedAt: "2026-05-03T10:02:00.000Z" }),
      makeEntry({ flowRunId: "d", flowType: "assisted_listing_flow", capabilityId: "listing.ads_api_publish", status: "duplicate" }),
      makeEntry({ flowRunId: "e", flowType: "shadow_capture_enrichment_flow", capabilityId: "active_capture.scouting", status: "blocked" }),
    ],
  });

  assert.match(snapshot.summary, /agenda tem|agenda têm/i);
  assert.match(snapshot.summary, /observação shadow|hold/i);
});

test("promotion review surface maps actions to readiness labels", () => {
  const snapshot = buildImobPromotionReviewSurface({
    history: [
      makeEntry({ flowRunId: "a", flowType: "assisted_calendar_flow", status: "completed" }),
      makeEntry({ flowRunId: "b", flowType: "assisted_calendar_flow", status: "completed", generatedAt: "2026-05-03T10:01:00.000Z" }),
      makeEntry({ flowRunId: "c", flowType: "assisted_calendar_flow", status: "completed", generatedAt: "2026-05-03T10:02:00.000Z" }),
    ],
  });

  const ready = snapshot.flows.find((item) => item.flowType === "assisted_calendar_flow");
  const shadow = snapshot.flows.find((item) => item.flowType === "assisted_reengagement_flow");
  const hold = buildImobPromotionReviewSurface({
    history: [
      makeEntry({ flowRunId: "a", flowType: "assisted_calendar_flow", status: "blocked" }),
      makeEntry({ flowRunId: "b", flowType: "assisted_calendar_flow", status: "blocked", generatedAt: "2026-05-03T10:01:00.000Z" }),
      makeEntry({ flowRunId: "c", flowType: "assisted_calendar_flow", status: "completed", generatedAt: "2026-05-03T10:02:00.000Z" }),
    ],
    thresholdsByFlow: {
      assisted_calendar_flow: { maxBlockRate: 0.5 },
    },
  }).flows.find((item) => item.flowType === "assisted_calendar_flow");
  const regress = buildImobPromotionReviewSurface({
    history: [
      makeEntry({ flowRunId: "a", flowType: "assisted_calendar_flow", status: "completed" }),
      makeEntry({ flowRunId: "b", flowType: "assisted_calendar_flow", status: "completed", generatedAt: "2026-05-03T10:01:00.000Z" }),
      makeEntry({ flowRunId: "c", flowType: "assisted_calendar_flow", status: "blocked", generatedAt: "2026-05-03T10:02:00.000Z" }),
    ],
    thresholdsByFlow: {
      assisted_calendar_flow: { maxBlockRate: 0.2 },
    },
    registryEntriesByFlow: {
      assisted_calendar_flow: {
        flowType: "assisted_calendar_flow",
        ownerAgent: "imob.scheduling_agent",
        visibleAgentId: "IMOB",
        status: "pilot",
        executionMode: "pilot",
        riskTier: "HIGH",
        rolloutStage: "pilot",
        requiresConsent: false,
        requiresHumanApproval: true,
        requiresEvidence: true,
        policyRequired: true,
        primaryCapability: "schedule.real_calendar",
        supportingCapabilities: ["multiagent.mission_orchestration"],
      } satisfies ImobPilotFlowRegistryEntry,
    },
  }).flows.find((item) => item.flowType === "assisted_calendar_flow");

  assert.equal(ready?.readinessLabel, "ready");
  assert.equal(shadow?.readinessLabel, "shadow");
  assert.equal(hold?.readinessLabel, "hold");
  assert.equal(regress?.readinessLabel, "regress");
});

test("promotion review surface keeps IMOB visible and remains read-only", () => {
  const history = [makeEntry()];
  const original = JSON.stringify(history);
  const snapshot = buildImobPromotionReviewSurface({ history });

  assert.equal(snapshot.visibleAgentId, "IMOB");
  assert.equal(JSON.stringify(history), original);
});

test("promotion review surface fills B2B2C fields and carries evidence refs when available", () => {
  const snapshot = buildImobPromotionReviewSurface({
    history: [makeEntry()],
  });

  const calendar = snapshot.flows[0];
  assert.ok(calendar.businessImpact.length > 0);
  assert.ok(calendar.operatorNote.length > 0);
  assert.ok(calendar.riskSummary.length > 0);
  assert.ok((calendar.evidenceRefs?.length ?? 0) >= 1);
});
