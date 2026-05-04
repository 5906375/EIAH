import test from "node:test";
import assert from "node:assert/strict";

import {
  createImobEnrichmentCaptureState,
  getImobEnrichmentCaptureMetrics,
  ingestImobScoutingOpportunity,
  processNextImobLeadEnrichment,
  queueImobLeadEnrichment,
} from "../services/imob/imobEnrichmentCaptureRuntime";

test("lead enrichment blocks without provenance governance gates", () => {
  const state = createImobEnrichmentCaptureState();
  const queued = queueImobLeadEnrichment({
    state,
    request: {
      capabilityId: "lead.enrichment_public",
      leadId: "lead-1",
      source: "mock_public_directory",
      sourceTimestamp: "2026-05-03T10:00:00.000Z",
      confidence: 0.91,
      consentBasis: "lead_authorized_profile_review",
      piiMasking: "masked",
      reconciliationStatus: "pending",
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

test("lead enrichment queues and completes with provenance fields preserved", () => {
  const state = createImobEnrichmentCaptureState();
  const queued = queueImobLeadEnrichment({
    state,
    request: {
      capabilityId: "lead.enrichment_public",
      leadId: "lead-1",
      source: "mock_public_directory",
      sourceTimestamp: "2026-05-03T10:00:00.000Z",
      confidence: 0.91,
      consentBasis: "lead_authorized_profile_review",
      piiMasking: "masked",
      reconciliationStatus: "matched",
      payload: { socialHandle: "@cliente" },
      consentProvided: true,
      humanApprovalGranted: true,
      evidenceRefsCount: 2,
      policyAccepted: true,
      now: "2026-05-03T10:00:00.000Z",
    },
  });

  assert.equal(queued.status, "queued");
  if (queued.status !== "queued") return;
  assert.equal(state.enrichments[0]?.source, "mock_public_directory");
  assert.equal(state.enrichments[0]?.piiMasking, "masked");
  assert.equal(state.enrichments[0]?.consentBasis, "lead_authorized_profile_review");

  const processed = processNextImobLeadEnrichment({
    state,
    now: "2026-05-03T10:02:00.000Z",
  });

  assert.equal(processed?.status, "completed");
  assert.equal((processed?.result as any)?.provider, "public_source_shadow");
  assert.equal((processed?.result as any)?.reconciliationStatus, "matched");
  assert.equal(state.enrichments[0]?.status, "completed");
});

test("active capture scouting applies dedupe across address owner and phone", () => {
  const state = createImobEnrichmentCaptureState();
  const first = ingestImobScoutingOpportunity({
    state,
    request: {
      capabilityId: "active_capture.scouting",
      sourceUrl: "https://mock.portal/imovel/1",
      sourceId: "portal-1",
      address: "Rua das Flores, 100",
      ownerName: "Maria Souza",
      ownerPhone: "(47) 99999-0000",
      propertyType: "apartamento",
      askingPriceCents: 85000000,
      evidenceRefsCount: 1,
      policyAccepted: true,
      now: "2026-05-03T11:00:00.000Z",
    },
  });

  assert.equal(first.status, "ingested");
  if (first.status !== "ingested") return;
  assert.equal(first.opportunity.sourceId, "portal-1");
  assert.equal(first.opportunity.dedupeApplied, true);
  assert.ok(first.opportunity.rankingScore >= 70);

  const duplicate = ingestImobScoutingOpportunity({
    state,
    request: {
      capabilityId: "active_capture.scouting",
      sourceUrl: "https://mock.portal/imovel/2",
      sourceId: "portal-2",
      address: "Rua das Flores 100",
      ownerName: "Maria Souza",
      ownerPhone: "47 99999 0000",
      evidenceRefsCount: 1,
      policyAccepted: true,
      now: "2026-05-03T11:05:00.000Z",
    },
  });

  assert.equal(duplicate.status, "duplicate");
  assert.equal(state.scouting.length, 1);
});

test("active capture scouting requires source metadata and policy/evidence governance", () => {
  const state = createImobEnrichmentCaptureState();
  const blocked = ingestImobScoutingOpportunity({
    state,
    request: {
      capabilityId: "active_capture.scouting",
      sourceUrl: "https://mock.portal/imovel/1",
      sourceId: "portal-1",
    },
  });

  assert.equal(blocked.status, "blocked");
  assert.deepEqual(blocked.gate.reasonCodes, [
    "evidence_required",
    "policy_required",
  ]);
});

test("enrichment and scouting metrics expose governed runtime totals", () => {
  const state = createImobEnrichmentCaptureState();
  queueImobLeadEnrichment({
    state,
    request: {
      capabilityId: "lead.enrichment_public",
      leadId: "lead-1",
      source: "mock_public_directory",
      sourceTimestamp: "2026-05-03T10:00:00.000Z",
      confidence: 0.91,
      consentBasis: "lead_authorized_profile_review",
      piiMasking: "masked",
      reconciliationStatus: "pending",
      consentProvided: true,
      humanApprovalGranted: true,
      evidenceRefsCount: 1,
      policyAccepted: true,
    },
  });
  ingestImobScoutingOpportunity({
    state,
    request: {
      capabilityId: "active_capture.scouting",
      sourceUrl: "https://mock.portal/imovel/1",
      sourceId: "portal-1",
      address: "Rua das Flores, 100",
      evidenceRefsCount: 1,
      policyAccepted: true,
    },
  });

  const metrics = getImobEnrichmentCaptureMetrics(state);
  assert.equal(metrics.enrichmentQueue.total, 1);
  assert.equal(metrics.enrichmentTotal, 1);
  assert.equal(metrics.scoutingTotal, 1);
  assert.ok(metrics.scoutingAverageRanking > 0);
});
