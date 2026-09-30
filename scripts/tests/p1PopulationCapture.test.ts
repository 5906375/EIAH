import test from "node:test";
import assert from "node:assert/strict";
import { sourceContentDigest } from "../lib/p1SourceMaterial.js";
import { FINANCIAL_PROJECTION_VERSION } from "../lib/p1FinancialProjection.js";
import { POPULATION_CAPTURE_VERSION, comparePopulationCapture } from "../lib/p1PopulationCapture.js";

const seal = <T extends Record<string, unknown>>(value: T) => ({ ...value, digest: sourceContentDigest(value) });
function inputs() {
  const scope = { tenantId: "t", workspaceId: "w", domain: "billing" };
  const window = { from: "2026-09-14T00:00:00Z", to: "2026-09-21T00:00:00Z" };
  const cutoffAt = "2026-09-28T00:00:00Z";
  const run = seal({ id: "r", tenantId: "t", workspaceId: "w", createdAt: "2026-09-20T00:00:00Z", finishedAt: "2026-09-24T00:00:00Z" as string | null, agent: "a", traceId: null, status: "success", errorCode: null, money: { amountCents: 100, currency: "BRL", unit: "cent" } });
  const usage = seal({ id: "u", tenantId: "t", workspaceId: "w", createdAt: "2026-09-25T00:00:00Z", reference: { runId: "r", runDigest: run.digest }, requestId: "req", meterType: "tokens", money: { amountCents: 100, currency: "BRL", unit: "cent" } });
  const ledger = seal({ id: "l", tenantId: "t", workspaceId: "w", createdAt: "2026-09-26T00:00:00Z", reference: { runId: "r", runDigest: run.digest }, requestId: "req", entryType: "debit", money: { amountCents: 100, currency: "BRL", unit: "cent" } });
  const projection = seal({ schemaVersion: FINANCIAL_PROJECTION_VERSION, scope, window, cutoffAt, generatedAt: cutoffAt,
    runs: [run], usage: [usage], ledger: [ledger], authority: [], counts: { runs: 1, usage: 1, ledger: 1, authority: 0 }, declaredMetrics: null });
  const capture = seal({ schemaVersion: POPULATION_CAPTURE_VERSION, scope, window, cutoffAt,
    snapshot: { ref: "synthetic-snapshot", digest: "a".repeat(64) }, watermark: { ref: "synthetic-watermark", visibleThrough: cutoffAt },
    runs: [{ id: "r", operationId: "billing.run_cost_debit", createdAt: run.createdAt, finishedAt: run.finishedAt, status: run.status }],
    facts: [{ kind: "usage", id: "u", runId: "r", createdAt: usage.createdAt }, { kind: "ledger", id: "l", runId: "r", createdAt: ledger.createdAt }] });
  return { projection, capture };
}
function altered(change: (capture: ReturnType<typeof inputs>["capture"]) => void) {
  const { projection, capture } = inputs();
  change(capture);
  return comparePopulationCapture(seal(capture), projection);
}
test("matching included IDs are consistent, but source verification and operational eligibility remain blocked", () => {
  const { projection, capture } = inputs();
  const result = comparePopulationCapture(capture, projection);
  assert.equal(result.internalConsistency, "consistent");
  assert.equal(result.independentSourceVerification, "not_demonstrated");
  assert.equal(result.operationMappingVerification, "not_demonstrated");
  assert.equal(result.snapshotVerification, "not_demonstrated");
  assert.equal(result.watermarkVerification, "not_demonstrated");
  assert.equal(result.operationalEligibility, "blocked");
});
test("self-declared operation, snapshot and watermark cannot prove source origin", () => {
  const { projection, capture } = inputs();
  capture.runs[0].operationId = "billing.any_claimed_operation";
  capture.snapshot.ref = "self-declared-snapshot";
  capture.snapshot.digest = "b".repeat(64);
  capture.watermark.ref = "self-declared-watermark";
  const result = comparePopulationCapture(seal(capture), projection);
  assert.equal(result.internalConsistency, "consistent");
  assert.equal(result.operationMappingVerification, "not_demonstrated");
  assert.equal(result.snapshotVerification, "not_demonstrated");
  assert.equal(result.watermarkVerification, "not_demonstrated");
  assert.equal(result.operationalEligibility, "blocked");
});
test("missing captured run blocks", () => {
  assert.ok(altered(c => { c.runs.splice(0); }).reasons.includes("unexpected_projection_run:r"));
});
test("missing late usage blocks even though it is after the weekly window", () => {
  assert.ok(altered(c => { c.facts.splice(0, 1); }).reasons.some(r => r.startsWith("unexpected_projection_fact")));
});
test("unincorporated late ledger fact blocks", () => {
  assert.ok(altered(c => { c.facts.push({ kind: "ledger", id: "late", runId: "r", createdAt: "2026-09-27T00:00:00Z" }); }).reasons.some(r => r.includes("fact_missing_or_different")));
});
test("duplicate identity, pending and unknown status block", () => {
  assert.ok(altered(c => { c.facts.push({ ...c.facts[0] }); }).reasons.some(r => r.includes("duplicate_fact")));
  assert.ok(altered(c => { c.runs[0].finishedAt = null; c.runs[0].status = "running"; }).reasons.includes("pending_run_at_cutoff"));
  assert.ok(altered(c => { c.runs[0].status = "mystery"; }).reasons.includes("unknown_run_status"));
});
test("watermark and cutoff claims cannot silently mismatch the projection", () => {
  assert.ok(altered(c => { c.watermark.visibleThrough = c.window.to; }).reasons.includes("capture_boundary_not_demonstrated"));
  assert.ok(altered(c => { c.cutoffAt = "2026-09-29T00:00:00Z"; }).reasons.includes("projection_scope_or_cutoff_mismatch"));
});
