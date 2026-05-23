import test from "node:test";
import assert from "node:assert/strict";

import { buildImobCrmAgentRegistry } from "../services/imob/orchestrator/imobCrmAgentRegistry";

test("IMOB CRM agent registry is derived from orchestrator routing and preserves IMOB ownership", () => {
  const registry = buildImobCrmAgentRegistry();

  assert.equal(registry.length, 11);
  assert.equal(registry.every((entry) => entry.ownerAgentId === "IMOB_Orchestrator"), true);
  assert.equal(registry.find((entry) => entry.operation === "property")?.targetAgentId, "IMOB_PropertyAgent");
  assert.equal(registry.find((entry) => entry.operation === "lead")?.targetAgentId, "IMOB_LeadAgent");
  assert.ok((registry.find((entry) => entry.operation === "case")?.supportingAgentIds ?? []).includes("Guardian_EvidenceAgent"));
});
