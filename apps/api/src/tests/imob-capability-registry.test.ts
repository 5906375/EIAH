import test from "node:test";
import assert from "node:assert/strict";

import {
  imobCapabilityRegistry,
  listAllImobCapabilities,
} from "../services/imob/imobCapabilityRegistry";

test("IMOB capability registry keeps IMOB as visible owner across all capabilities", () => {
  const capabilities = listAllImobCapabilities();

  assert.ok(capabilities.length > 0);
  for (const capability of capabilities) {
    assert.equal(capability.visibleAgentId, "IMOB");
    assert.notEqual(capability.ownerAgent.trim(), "");
  }
});

test("IMOB capability registry keeps required governance fields populated", () => {
  for (const capability of listAllImobCapabilities()) {
    assert.notEqual(capability.capabilityId.trim(), "");
    assert.notEqual(capability.status.trim(), "");
    assert.notEqual(capability.executionMode.trim(), "");
    assert.notEqual(capability.riskTier.trim(), "");
    assert.notEqual(capability.rolloutStage.trim(), "");
    assert.notEqual(capability.initialImplementation.trim(), "");
  }
});

test("sensitive IMOB capabilities do not start as automated", () => {
  const nonAutomatedIds = new Set(
    listAllImobCapabilities()
      .filter((capability) =>
        [
          "outbound.owner_contact",
          "lead.enrichment_public",
          "listing.ads_api_publish",
          "schedule.real_calendar",
          "scale.concurrent_leads_1000",
        ].includes(capability.capabilityId),
      )
      .map((capability) => capability.capabilityId),
  );

  assert.deepEqual(nonAutomatedIds, new Set([
    "outbound.owner_contact",
    "lead.enrichment_public",
    "listing.ads_api_publish",
    "schedule.real_calendar",
    "scale.concurrent_leads_1000",
  ]));

  for (const capability of listAllImobCapabilities()) {
    if (!nonAutomatedIds.has(capability.capabilityId)) continue;
    assert.notEqual(capability.executionMode, "automated");
  }
});

test("high-risk IMOB capabilities require evidence", () => {
  for (const capability of listAllImobCapabilities()) {
    if (capability.riskTier !== "HIGH" && capability.riskTier !== "CRITICAL") continue;
    assert.equal(capability.requiresEvidence, true);
  }
});

test("worker orchestration capabilities do not start automated", () => {
  for (const capability of imobCapabilityRegistry.workerOrchestration) {
    assert.notEqual(capability.executionMode, "automated");
  }
});

test("reengagement capability stays in shadow governance after runtime materialization", () => {
  const capability = listAllImobCapabilities().find((item) => item.capabilityId === "reengagement.continuous");

  assert.ok(capability);
  assert.equal(capability?.status, "ready_for_shadow");
  assert.equal(capability?.executionMode, "shadow");
  assert.equal(capability?.rolloutStage, "shadow");
});

test("lead discovery capability stays in shadow governance after runtime materialization", () => {
  const capability = listAllImobCapabilities().find((item) => item.capabilityId === "lead.qualify.discovery");

  assert.ok(capability);
  assert.equal(capability?.status, "ready_for_shadow");
  assert.equal(capability?.executionMode, "shadow");
  assert.equal(capability?.rolloutStage, "shadow");
  assert.match(capability?.initialImplementation ?? "", /structured discovery signals/i);
});

test("lead profile report capability stays in shadow governance after runtime materialization", () => {
  const capability = listAllImobCapabilities().find((item) => item.capabilityId === "lead.profile_report");

  assert.ok(capability);
  assert.equal(capability?.status, "ready_for_shadow");
  assert.equal(capability?.executionMode, "shadow");
  assert.equal(capability?.rolloutStage, "shadow");
  assert.match(capability?.initialImplementation ?? "", /consented commercial and financial profile/i);
});

test("viability market analysis capability stays in shadow governance after runtime materialization", () => {
  const capability = listAllImobCapabilities().find((item) => item.capabilityId === "viability.market_analysis");

  assert.ok(capability);
  assert.equal(capability?.status, "ready_for_shadow");
  assert.equal(capability?.executionMode, "shadow");
  assert.equal(capability?.rolloutStage, "shadow");
  assert.match(capability?.initialImplementation ?? "", /internal case, lead and property context only/i);
});

test("closing documents capability stays in shadow governance after runtime materialization", () => {
  const capability = listAllImobCapabilities().find((item) => item.capabilityId === "closing.documents_real");

  assert.ok(capability);
  assert.equal(capability?.status, "ready_for_shadow");
  assert.equal(capability?.executionMode, "shadow");
  assert.equal(capability?.rolloutStage, "shadow");
  assert.match(capability?.initialImplementation ?? "", /document-readiness, packet status and legal handoff guidance/i);
});

test("inventory watch capability stays in consultive shadow governance", () => {
  const capability = listAllImobCapabilities().find((item) => item.capabilityId === "inventory.active_watch");

  assert.ok(capability);
  assert.equal(capability?.status, "ready_for_shadow");
  assert.equal(capability?.executionMode, "shadow");
  assert.equal(capability?.rolloutStage, "shadow");
  assert.match(capability?.initialImplementation ?? "", /consultive shadow snapshot/i);
  assert.match(capability?.initialImplementation ?? "", /without background monitoring or automated outreach/i);
});

test("mission orchestration capability stays in consultive shadow governance", () => {
  const capability = listAllImobCapabilities().find((item) => item.capabilityId === "multiagent.mission_orchestration");

  assert.ok(capability);
  assert.equal(capability?.status, "ready_for_shadow");
  assert.equal(capability?.executionMode, "shadow");
  assert.equal(capability?.rolloutStage, "shadow");
  assert.match(capability?.initialImplementation ?? "", /consultive shadow mission snapshot/i);
  assert.match(capability?.initialImplementation ?? "", /without queues or real subagents/i);
});

test("public enrichment capability stays in governed shadow after runtime materialization", () => {
  const capability = listAllImobCapabilities().find((item) => item.capabilityId === "lead.enrichment_public");

  assert.ok(capability);
  assert.equal(capability?.status, "ready_for_shadow");
  assert.equal(capability?.executionMode, "shadow");
  assert.equal(capability?.rolloutStage, "shadow");
  assert.match(capability?.initialImplementation ?? "", /governed shadow/i);
  assert.match(capability?.initialImplementation ?? "", /consent basis/i);
});

test("calendar and listing sandbox capabilities are marked as shadow-ready when runtime exists", () => {
  const calendar = listAllImobCapabilities().find((item) => item.capabilityId === "schedule.real_calendar");
  const listing = listAllImobCapabilities().find((item) => item.capabilityId === "listing.ads_api_publish");

  assert.ok(calendar);
  assert.equal(calendar?.status, "ready_for_shadow");
  assert.equal(calendar?.executionMode, "shadow");
  assert.equal(calendar?.rolloutStage, "shadow");

  assert.ok(listing);
  assert.equal(listing?.status, "ready_for_shadow");
  assert.equal(listing?.executionMode, "shadow");
  assert.equal(listing?.rolloutStage, "shadow");
});

test("active capture scouting capability stays in shadow with mock ingestion governance", () => {
  const capability = listAllImobCapabilities().find((item) => item.capabilityId === "active_capture.scouting");

  assert.ok(capability);
  assert.equal(capability?.status, "ready_for_shadow");
  assert.equal(capability?.executionMode, "shadow");
  assert.equal(capability?.rolloutStage, "shadow");
  assert.match(capability?.initialImplementation ?? "", /shadow capture ingestion/i);
  assert.match(capability?.initialImplementation ?? "", /dedupe, ranking and evidence pack/i);
});

test("scale capability stays in shadow with queue governance and operational kpis", () => {
  const capability = listAllImobCapabilities().find((item) => item.capabilityId === "scale.concurrent_leads_1000");

  assert.ok(capability);
  assert.equal(capability?.status, "ready_for_shadow");
  assert.equal(capability?.executionMode, "shadow");
  assert.equal(capability?.rolloutStage, "shadow");
  assert.match(capability?.initialImplementation ?? "", /prioritized queue/i);
  assert.match(capability?.initialImplementation ?? "", /operational KPIs/i);
});
