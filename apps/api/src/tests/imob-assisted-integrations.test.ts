import test from "node:test";
import assert from "node:assert/strict";

import {
  createImobAssistedIntegrationState,
  getImobAssistedIntegrationMetrics,
  processNextImobAssistedCapability,
  queueImobAssistedCapability,
} from "../services/imob/imobAssistedIntegrations";

test("outbound assisted integration blocks without required gates", () => {
  const state = createImobAssistedIntegrationState();
  const queued = queueImobAssistedCapability({
    state,
    request: {
      capabilityId: "outbound.owner_contact",
      payload: { ownerId: "owner-1", message: "Olá" },
    },
  });

  assert.equal(queued.status, "blocked");
  assert.deepEqual(queued.gate.reasonCodes, [
    "consent_required",
    "human_approval_required",
    "evidence_required",
    "policy_required",
  ]);
});

test("calendar assisted integration queues and completes in sandbox", () => {
  const state = createImobAssistedIntegrationState();
  const queued = queueImobAssistedCapability({
    state,
    request: {
      capabilityId: "schedule.real_calendar",
      payload: { caseId: "case-1", preferredDate: "2026-05-05" },
      humanApprovalGranted: true,
      evidenceRefsCount: 1,
      policyAccepted: true,
      now: "2026-05-03T10:00:00.000Z",
    },
  });

  assert.equal(queued.status, "queued");
  if (queued.status !== "queued") return;
  assert.equal(queued.capability.executionMode, "assisted");
  assert.equal(queued.evidencePack.sandbox, true);

  const processed = processNextImobAssistedCapability({
    state,
    now: "2026-05-03T10:01:00.000Z",
  });

  assert.equal(processed?.status, "completed");
  assert.equal((processed?.result as any)?.provider, "calendar_sandbox");
  assert.match(String((processed?.result as any)?.calendarEventId ?? ""), /^mock-calendar-/);
});

test("listing assisted integration requires approval and produces tracking", () => {
  const state = createImobAssistedIntegrationState();
  const queued = queueImobAssistedCapability({
    state,
    request: {
      capabilityId: "listing.ads_api_publish",
      payload: { propertyId: "property-1", channels: ["portal"] },
      humanApprovalGranted: true,
      evidenceRefsCount: 2,
      policyAccepted: true,
    },
  });

  assert.equal(queued.status, "queued");
  if (queued.status !== "queued") return;
  assert.match(queued.trackingId, /^tracking-imob-job-/);
  assert.equal(state.tracking.length, 1);
  assert.equal(state.tracking[0]?.status, "queued");

  processNextImobAssistedCapability({ state });

  assert.equal(state.tracking[0]?.status, "completed");
  assert.equal((state.tracking[0]?.result as any)?.provider, "listing_sandbox");
});

test("outbound assisted integration queues only when consent, approval, evidence and policy are present", () => {
  const state = createImobAssistedIntegrationState();
  const queued = queueImobAssistedCapability({
    state,
    request: {
      capabilityId: "outbound.owner_contact",
      payload: { ownerId: "owner-1", message: "Olá" },
      consentProvided: true,
      humanApprovalGranted: true,
      evidenceRefsCount: 1,
      policyAccepted: true,
      now: "2026-05-03T10:00:00.000Z",
    },
  });

  assert.equal(queued.status, "queued");
  if (queued.status !== "queued") return;

  const processed = processNextImobAssistedCapability({
    state,
    now: "2026-05-03T10:02:00.000Z",
  });

  assert.equal((processed?.result as any)?.provider, "outbound_sandbox");
  assert.match(String((processed?.result as any)?.deliveryId ?? ""), /^mock-outbound-/);
});

test("assisted integration metrics reflect queue and completed tracking", () => {
  const state = createImobAssistedIntegrationState();
  queueImobAssistedCapability({
    state,
    request: {
      capabilityId: "schedule.real_calendar",
      payload: { caseId: "case-1" },
      humanApprovalGranted: true,
      evidenceRefsCount: 1,
      policyAccepted: true,
    },
  });

  const before = getImobAssistedIntegrationMetrics(state);
  assert.equal(before.queue.total, 1);
  assert.equal(before.completedTotal, 0);

  processNextImobAssistedCapability({ state });

  const after = getImobAssistedIntegrationMetrics(state);
  assert.equal(after.queue.counts.succeeded, 1);
  assert.equal(after.completedTotal, 1);
});
