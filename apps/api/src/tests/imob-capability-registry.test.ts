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
