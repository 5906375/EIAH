import test from "node:test";
import assert from "node:assert/strict";
import { captureInternalSourceCandidates } from "../lib/p1InternalSourceCapture.js";
import { compareInternalCaptureWithProjections } from "../lib/p1InternalCaptureComparison.js";
import { FINANCIAL_PROJECTION_VERSION } from "../lib/p1FinancialProjection.js";
import { sourceContentDigest } from "../lib/p1SourceMaterial.js";

const seal = <T extends Record<string, unknown>>(value: T) => ({ ...value, digest: sourceContentDigest(value) });
const from = "2026-09-14T00:00:00Z", to = "2026-09-21T00:00:00Z", cutoffAt = "2026-09-28T00:00:00Z";
async function inputs() {
  const scope = { tenantId: "t", from, to, cutoffAt };
  const createdAt = "2026-09-20T00:00:00Z", finishedAt = "2026-09-24T00:00:00Z", factAt = "2026-09-25T00:00:00Z";
  const capture = await captureInternalSourceCandidates({ withReadView: read => read({
    snapshotRef: "fake-view", async listWorkspaces() { return [{ id: "w", tenantId: "t" }]; },
    async listRuns() { return [{ id: "r", tenantId: "t", workspaceId: "w", createdAt, finishedAt,
      status: "success", costCents: 100 }]; },
    async listFacts() { return [{ id: "u", kind: "usage" as const, tenantId: "t", workspaceId: "w", runId: "r", createdAt: factAt }]; },
  }) }, scope);
  const run = seal({ id: "r", tenantId: "t", workspaceId: "w", createdAt, finishedAt, agent: "a", traceId: null,
    status: "success", errorCode: null, money: { amountCents: 100, currency: "BRL", unit: "cent" } });
  const usage = seal({ id: "u", tenantId: "t", workspaceId: "w", createdAt: factAt,
    reference: { runId: "r", runDigest: run.digest }, requestId: "req", meterType: "tokens",
    money: { amountCents: 100, currency: "BRL", unit: "cent" } });
  const projection = seal({ schemaVersion: FINANCIAL_PROJECTION_VERSION,
    scope: { tenantId: "t", workspaceId: "w", domain: "billing" }, window: { from, to }, cutoffAt, generatedAt: cutoffAt,
    runs: [run], usage: [usage], ledger: [], authority: [], counts: { runs: 1, usage: 1, ledger: 0, authority: 0 }, declaredMetrics: null });
  return { capture, projection };
}
test("matching included IDs remain blocked without source attestation", async () => {
  const { capture, projection } = await inputs();
  const result = compareInternalCaptureWithProjections(capture, [projection]);
  assert.equal(result.internalConsistency, "consistent", JSON.stringify(result.reasons));
  assert.equal(result.operationalEligibility, "blocked");
  assert.equal(result.snapshotVerification, "not_demonstrated");
  assert.equal(result.watermarkVerification, "not_demonstrated");
});
test("equal counts with a different run or fact ID fail bidirectionally", async () => {
  const { capture, projection } = await inputs();
  const swapped = seal({ ...capture, runs: capture.runs.map(r => ({ ...r, id: "other" })),
    facts: capture.facts.map(f => ({ ...f, id: "other-fact" })) });
  const result = compareInternalCaptureWithProjections(swapped, [projection]);
  assert.equal(result.internalConsistency, "failed");
  assert.ok(result.reasons.includes("unexpected_projection_run:r"));
  assert.ok(result.reasons.includes('unexpected_projection_fact:["usage","u"]'));
});
test("missing workspace projection and orphan link fail closed", async () => {
  const { capture, projection } = await inputs();
  assert.ok(compareInternalCaptureWithProjections(capture, []).reasons.includes("projection_workspace_missing:w"));
  const orphan = seal({ ...capture, facts: capture.facts.map(f => ({ ...f, runId: null })) });
  const result = compareInternalCaptureWithProjections(orphan, [projection]);
  assert.ok(result.reasons.includes('unresolved_fact_link:["usage","u"]'));
});
