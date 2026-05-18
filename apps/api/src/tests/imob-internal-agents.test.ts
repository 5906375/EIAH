import test from "node:test";
import assert from "node:assert/strict";

import {
  getImobInternalAgent,
  listImobInternalAgents,
  listImobWorkflowAgentBindings,
  resolveImobWorkflowAgentBinding,
} from "../services/imob/agents/imobInternalAgents";

test("internal IMOB agent registry keeps IMOB as visible owner and preserves ownership", () => {
  const agents = listImobInternalAgents();

  assert.ok(agents.length >= 10);
  assert.equal(agents.every((agent) => agent.visibleAgentId === "IMOB"), true);
  assert.equal(agents.every((agent) => agent.ownershipPreserved === true), true);
  assert.equal(agents.some((agent) => agent.id === "IMOB_Orchestrator" && agent.role === "owner"), true);
  assert.equal(agents.some((agent) => agent.id === "IMOB_PublicWebScanAgent" && agent.mode === "restricted_scan"), true);
  assert.equal(agents.some((agent) => agent.id === "Guardian_EvidenceAgent" && agent.role === "guardian"), true);
});

test("internal IMOB agent registry exposes labels, modes and workflow coverage", () => {
  const dedupe = getImobInternalAgent("IMOB_DedupeAgent");
  const followUp = getImobInternalAgent("IMOB_FollowUpAgent");
  const document = getImobInternalAgent("IMOB_DocumentAgent");
  const marketScan = getImobInternalAgent("IMOB_MarketScanAgent");

  assert.equal(marketScan?.mode, "intelligence");
  assert.match(marketScan?.responsibilities.join(" ") ?? "", /preço|liquidez|risco|MarketScanRun/i);
  assert.equal(dedupe?.label, "Dedupe");
  assert.equal(dedupe?.mode, "execute");
  assert.deepEqual(dedupe?.workflowStates, ["owner.dedupe_review"]);

  assert.equal(followUp?.label, "Marketing");
  assert.equal(followUp?.mode, "draft");
  assert.ok(followUp?.workflowStates.includes("lead.qualify"));

  assert.equal(document?.backingAgentId, "J_360");
  assert.equal(document?.mode, "propose_action");
});

test("workflow state bindings map each IMOB CRM state to the expected internal agents", () => {
  const bindings = listImobWorkflowAgentBindings();

  assert.equal(bindings.length, 11);
  assert.equal(resolveImobWorkflowAgentBinding("property.create")?.primaryAgentId, "IMOB_PropertyAgent");
  assert.deepEqual(resolveImobWorkflowAgentBinding("property.create")?.supportingAgentIds, ["IMOB_MarketScanAgent", "Guardian_EvidenceAgent"]);
  assert.equal(resolveImobWorkflowAgentBinding("property.market_scan")?.primaryAgentId, "IMOB_MarketScanAgent");
  assert.deepEqual(resolveImobWorkflowAgentBinding("property.market_scan")?.supportingAgentIds, ["IMOB_PublicWebScanAgent", "Guardian_EvidenceAgent"]);
  assert.equal(resolveImobWorkflowAgentBinding("property.market_scan.selection")?.primaryAgentId, "IMOB_MarketScanAgent");
  assert.equal(resolveImobWorkflowAgentBinding("owner.dedupe_review")?.primaryAgentId, "IMOB_DedupeAgent");
  assert.equal(resolveImobWorkflowAgentBinding("lead.qualify")?.primaryAgentId, "IMOB_LeadAgent");
  assert.ok(resolveImobWorkflowAgentBinding("case.review")?.supportingAgentIds.includes("IMOB_PublicWebScanAgent"));
  assert.deepEqual(
    resolveImobWorkflowAgentBinding("documents.review")?.supportingAgentIds,
    ["Guardian_EvidenceAgent"],
  );
});
