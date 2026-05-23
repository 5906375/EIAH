import test from "node:test";
import assert from "node:assert/strict";

import { listImobOperationRoutes, resolveImobOperationRoute } from "../services/imob/orchestrator/imobOperationRouter";

test("operation router exposes explicit canonical dispatch per IMOB operation", () => {
  const routes = listImobOperationRoutes();

  assert.equal(routes.length, 11);
  assert.equal(resolveImobOperationRoute("property").dispatchedAgentId, "IMOB_PropertyAgent");
  assert.deepEqual(resolveImobOperationRoute("property").supportingAgentIds, ["IMOB_MarketScanAgent", "Guardian_EvidenceAgent"]);
  assert.equal(resolveImobOperationRoute("lead").dispatchedAgentId, "IMOB_LeadAgent");
  assert.equal(resolveImobOperationRoute("proof").dispatchedAgentId, "Guardian_EvidenceAgent");
});

test("operation router honors workflow binding when a more specific internal specialist exists", () => {
  const dedupeRoute = resolveImobOperationRoute("owner", "owner.dedupe_review");
  const caseReviewRoute = resolveImobOperationRoute("case", "case.review");

  assert.equal(dedupeRoute.source, "workflow_binding");
  assert.equal(dedupeRoute.dispatchedAgentId, "IMOB_DedupeAgent");
  assert.deepEqual(dedupeRoute.supportingAgentIds, ["Guardian_EvidenceAgent"]);

  assert.equal(caseReviewRoute.dispatchedAgentId, "IMOB_ContinuityAgent");
  assert.ok(caseReviewRoute.supportingAgentIds.includes("IMOB_PublicWebScanAgent"));
  assert.ok(caseReviewRoute.supportingAgentIds.includes("Guardian_EvidenceAgent"));
});
