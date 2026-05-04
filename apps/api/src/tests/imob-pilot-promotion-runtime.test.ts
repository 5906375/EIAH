import test from "node:test";
import assert from "node:assert/strict";

import { createImobPilotApprovalState, recordImobPilotApprovalDecision } from "../services/imob/imobPilotApprovalRuntime";
import { evaluateAllImobPilotPromotionRuntime, evaluateImobPilotPromotionRuntimeForFlow } from "../services/imob/imobPilotPromotionRuntime";
import type { ImobPilotFlowHistoryEntry } from "../services/imob/imobPilotFlowHistory";
import type { ImobPilotFlowRegistryEntry } from "../services/imob/imobPilotFlowRegistry";
import { createImobPilotRolloutState, upsertImobPilotRolloutState } from "../services/imob/imobPilotRolloutState";

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

test("promotion runtime keeps flow in shadow when gate fails", () => {
  const decision = evaluateImobPilotPromotionRuntimeForFlow({
    flowType: "assisted_calendar_flow",
    history: [makeEntry({ status: "blocked", gateReasonCodes: ["policy_required"] })],
  });

  assert.equal(decision.visibleAgentId, "IMOB");
  assert.equal(decision.currentStage, "shadow");
  assert.equal(decision.recommendedStage, "shadow");
  assert.equal(decision.eligible, false);
  assert.equal(decision.nextOperationalAction, "keep_shadow");
});

test("promotion runtime recommends pilot when thresholds are satisfied", () => {
  const decision = evaluateImobPilotPromotionRuntimeForFlow({
    flowType: "assisted_calendar_flow",
    history: [
      makeEntry({ flowRunId: "a", status: "completed" }),
      makeEntry({ flowRunId: "b", status: "completed", generatedAt: "2026-05-03T10:01:00.000Z" }),
      makeEntry({ flowRunId: "c", status: "completed", generatedAt: "2026-05-03T10:02:00.000Z" }),
    ],
  });

  assert.equal(decision.eligible, true);
  assert.equal(decision.recommendedStage, "pilot");
  assert.equal(decision.nextOperationalAction, "promote_to_pilot");
});

test("promotion runtime holds rollout when block rate is too high", () => {
  const decision = evaluateImobPilotPromotionRuntimeForFlow({
    flowType: "assisted_calendar_flow",
    history: [
      makeEntry({ flowRunId: "a", status: "blocked" }),
      makeEntry({ flowRunId: "b", status: "blocked" }),
      makeEntry({ flowRunId: "c", status: "completed" }),
    ],
    thresholds: { maxBlockRate: 0.5 },
  });

  assert.equal(decision.eligible, false);
  assert.ok(decision.reasonCodes.includes("block_rate_above_threshold"));
  assert.equal(decision.nextOperationalAction, "hold_rollout");
});

test("promotion runtime does not promote when duplicate rate is too high", () => {
  const decision = evaluateImobPilotPromotionRuntimeForFlow({
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
  assert.notEqual(decision.recommendedStage, "pilot");
});

test("promotion runtime never promotes when ownership is broken", () => {
  const decision = evaluateImobPilotPromotionRuntimeForFlow({
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
        visibleAgentId: "not-imob" as "IMOB",
      },
    ],
  });

  assert.equal(decision.eligible, false);
  assert.ok(decision.reasonCodes.includes("ownership_mismatch"));
  assert.equal(decision.recommendedStage, "shadow");
});

test("promotion runtime respects current stage from registry entry", () => {
  const registryEntry = {
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
  } satisfies ImobPilotFlowRegistryEntry;
  const decision = evaluateImobPilotPromotionRuntimeForFlow({
    flowType: "assisted_calendar_flow",
    registryEntry,
    history: [
      makeEntry({ flowRunId: "a", status: "completed" }),
      makeEntry({ flowRunId: "b", status: "completed", generatedAt: "2026-05-03T10:01:00.000Z" }),
      makeEntry({ flowRunId: "c", status: "completed", generatedAt: "2026-05-03T10:02:00.000Z" }),
    ],
  });

  assert.equal(decision.currentStage, "pilot");
  assert.equal(decision.recommendedStage, "pilot");
  assert.equal(decision.nextOperationalAction, "maintain_pilot");
});

test("promotion runtime prefers persisted rollout state over registry stage", () => {
  const approvalState = createImobPilotApprovalState();
  const rolloutState = createImobPilotRolloutState();
  const approval = recordImobPilotApprovalDecision({
    state: approvalState,
    flowType: "assisted_calendar_flow",
    decision: "approved",
    approvedBy: "manager@acme.test",
    approvedAt: "2026-05-03T12:30:00.000Z",
    approvalReason: "Piloto já aprovado.",
  });

  upsertImobPilotRolloutState({
    state: rolloutState,
    flowType: "assisted_calendar_flow",
    currentStage: "pilot",
    approvalEntry: approval,
  });

  const decision = evaluateImobPilotPromotionRuntimeForFlow({
    flowType: "assisted_calendar_flow",
    history: [
      makeEntry({ flowRunId: "a", status: "completed" }),
      makeEntry({ flowRunId: "b", status: "completed", generatedAt: "2026-05-03T10:01:00.000Z" }),
      makeEntry({ flowRunId: "c", status: "completed", generatedAt: "2026-05-03T10:02:00.000Z" }),
    ],
    rolloutState,
  });

  assert.equal(decision.currentStage, "pilot");
  assert.equal(decision.nextOperationalAction, "maintain_pilot");
});

test("promotion runtime can evaluate all registered flows at once", () => {
  const decisions = evaluateAllImobPilotPromotionRuntime({
    history: [],
    generatedAt: "2026-05-03T11:00:00.000Z",
  });

  assert.equal(decisions.length, 4);
  assert.equal(decisions.every((item) => item.visibleAgentId === "IMOB"), true);
});
