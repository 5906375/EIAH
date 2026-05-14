import test from "node:test";
import assert from "node:assert/strict";

import {
  createImobPilotFlowState,
  runImobAssistedCalendarFlow,
  runImobAssistedListingFlow,
  runImobAssistedReengagementFlow,
  runImobShadowCaptureEnrichmentFlow,
} from "../services/imob/imobPilotFlowRuntime";
import { buildImobPilotFlowRunId } from "../services/imob/imobPilotFlowHistory";

test("pilot reengagement flow blocks on missing gates and preserves IMOB ownership", () => {
  const state = createImobPilotFlowState();
  const result = runImobAssistedReengagementFlow({
    state,
    caseId: "case-1",
    leadId: "lead-1",
    generatedAt: "2026-05-03T10:00:00.000Z",
  });

  assert.equal(result.flowType, "assisted_reengagement_flow");
  assert.equal(result.status, "blocked");
  assert.equal(result.visibleAgentId, "IMOB");
  assert.equal(result.capabilityId, "reengagement.continuous");
  assert.deepEqual(result.gateDecision.reasonCodes, [
    "consent_required",
    "human_approval_required",
    "evidence_required",
    "policy_required",
  ]);
  assert.match(result.missionId, /^mission-imob-case-1-reengagement-continuous$/);
  assert.equal(result.flowRunId, buildImobPilotFlowRunId({
    flowId: result.flowId,
    status: result.status,
    generatedAt: result.generatedAt,
  }));
  assert.equal(state.history.entries.length, 1);
  assert.equal(state.history.entries[0]?.visibleAgentId, "IMOB");
  assert.equal(state.caseMemory.byCaseId["case-1"]?.lastBlockedFlowType, "assisted_reengagement_flow");
});

test("pilot reengagement flow fails closed when supporting outbound capability is below shadow rollout", () => {
  const state = createImobPilotFlowState();
  const result = runImobAssistedReengagementFlow({
    state,
    caseId: "case-rollout",
    leadId: "lead-rollout",
    generatedAt: "2026-05-03T10:02:00.000Z",
    consentProvided: true,
    humanApprovalGranted: true,
    evidenceRefsCount: 1,
    policyAccepted: true,
    payload: { channel: "whatsapp" },
  });

  assert.equal(result.status, "blocked");
  assert.equal(result.capabilityId, "reengagement.continuous");
  assert.ok(result.gateDecision.reasonCodes.includes("rollout_stage_blocked"));
  assert.equal(state.history.entries[0]?.status, "blocked");
});

test("pilot calendar flow completes in sandbox with mission and evidence refs", () => {
  const state = createImobPilotFlowState();
  const result = runImobAssistedCalendarFlow({
    state,
    caseId: "case-2",
    leadId: "lead-2",
    generatedAt: "2026-05-03T10:05:00.000Z",
    humanApprovalGranted: true,
    evidenceRefsCount: 1,
    policyAccepted: true,
    payload: { preferredDate: "2026-05-04" },
  });

  assert.equal(result.status, "completed");
  assert.equal(result.flowType, "assisted_calendar_flow");
  assert.equal(result.capabilityId, "schedule.real_calendar");
  assert.match(String(result.jobId ?? ""), /^imob-job-/);
  assert.match(String(result.trackingId ?? ""), /^tracking-imob-job-/);
  assert.ok(result.evidenceRefs.length >= 5);
  assert.equal(result.visibleAgentId, "IMOB");
  assert.equal(state.history.entries[0]?.flowRunId, result.flowRunId);
  assert.equal(state.history.entries[0]?.jobId, result.jobId);
  assert.equal(state.caseMemory.byCaseId["case-2"]?.lastExecutedFlowType, "assisted_calendar_flow");
});

test("pilot listing flow is idempotent for same payload", () => {
  const state = createImobPilotFlowState();
  const first = runImobAssistedListingFlow({
    state,
    caseId: "case-3",
    leadId: "lead-3",
    generatedAt: "2026-05-03T10:10:00.000Z",
    humanApprovalGranted: true,
    evidenceRefsCount: 1,
    policyAccepted: true,
    payload: { propertyId: "property-1", channels: ["portal"] },
  });
  const second = runImobAssistedListingFlow({
    state,
    caseId: "case-3",
    leadId: "lead-3",
    generatedAt: "2026-05-03T10:10:00.000Z",
    humanApprovalGranted: true,
    evidenceRefsCount: 1,
    policyAccepted: true,
    payload: { propertyId: "property-1", channels: ["portal"] },
  });

  assert.equal(first.status, "completed");
  assert.equal(second.status, "duplicate");
  assert.equal(first.jobId, second.jobId);
  assert.equal(first.flowId, second.flowId);
  assert.equal(state.history.entries.length, 2);
  assert.equal(state.caseMemory.byCaseId["case-3"]?.lastFlowStatus, "duplicate");
});

test("shadow capture enrichment flow records sandbox capture and enrichment evidence", () => {
  const state = createImobPilotFlowState();
  const result = runImobShadowCaptureEnrichmentFlow({
    state,
    caseId: "case-4",
    leadId: "lead-4",
    generatedAt: "2026-05-03T11:00:00.000Z",
    sourceUrl: "https://mock.portal/imovel/1",
    sourceId: "portal-1",
    source: "mock_public_directory",
    sourceTimestamp: "2026-05-03T10:59:00.000Z",
    confidence: 0.88,
    consentBasis: "lead_authorized_profile_review",
    piiMasking: "masked",
    reconciliationStatus: "matched",
    address: "Rua das Flores, 100",
    ownerName: "Maria Souza",
    ownerPhone: "(47) 99999-0000",
    evidenceRefsCount: 2,
    policyAccepted: true,
    consentProvided: true,
    humanApprovalGranted: true,
  });

  assert.equal(result.status, "shadow_recorded");
  assert.equal(result.flowType, "shadow_capture_enrichment_flow");
  assert.equal(result.capabilityId, "active_capture.scouting");
  assert.match(String(result.jobId ?? ""), /^imob-job-/);
  assert.match(String(result.trackingId ?? ""), /^tracking-imob-job-/);
  assert.ok(result.evidenceRefs.some((item) => item.ref === "pilot.source.ref"));
  assert.equal(result.visibleAgentId, "IMOB");
  assert.equal(state.history.entries[0]?.trackingId, result.trackingId);
  assert.ok((state.history.entries[0]?.evidenceRefs.length ?? 0) >= 5);
  assert.equal(state.caseMemory.byCaseId["case-4"]?.lastExecutedFlowType, "shadow_capture_enrichment_flow");
});

test("shadow capture enrichment flow blocks enrichment when consent governance is missing", () => {
  const state = createImobPilotFlowState();
  const result = runImobShadowCaptureEnrichmentFlow({
    state,
    caseId: "case-5",
    leadId: "lead-5",
    generatedAt: "2026-05-03T11:05:00.000Z",
    sourceUrl: "https://mock.portal/imovel/2",
    sourceId: "portal-2",
    source: "mock_public_directory",
    sourceTimestamp: "2026-05-03T11:00:00.000Z",
    confidence: 0.88,
    consentBasis: "lead_authorized_profile_review",
    piiMasking: "masked",
    reconciliationStatus: "pending",
    address: "Rua A, 10",
    evidenceRefsCount: 1,
    policyAccepted: true,
  });

  assert.equal(result.status, "blocked");
  assert.equal(result.capabilityId, "lead.enrichment_public");
  assert.ok(result.gateDecision.reasonCodes.includes("consent_required"));
  assert.equal(result.visibleAgentId, "IMOB");
  assert.equal(state.history.entries[0]?.status, "blocked");
  assert.equal(state.history.entries[0]?.missionId, result.missionId);
});
