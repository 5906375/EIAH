/** All data synthetic; no database/service imports. */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { FINANCIAL_PROJECTION_VERSION, validateFinancialProjection } from "../lib/p1FinancialProjection.js";
import { recomputeFinancialProjection } from "../lib/p1FinancialRecomputation.js";
import { sourceContentDigest, describeSourceMaterial, validateSourceDiagnostic } from "../lib/p1SourceMaterial.js";
import { fixtureCycle, FIXTURE_TENANT, FIXTURE_WORKSPACE, FIXTURE_OPERATION } from "./fixtures/p1ApeWeeklyCycleV3Fixtures.js";
const seal = <T extends Record<string, unknown>>(r: T) => ({ ...r, digest: sourceContentDigest(r) });
const money = (amountCents: number | null = 100, currency: string | null = "BRL", unit: string | null = "cent") => ({ amountCents, currency, unit });
function fixture(): any {
  const scope = { tenantId: "t", workspaceId: "w", domain: "billing" };
  const identity = { tenantId: "t", workspaceId: "w" };
  const run = seal({ ...identity, id: "r", createdAt: "2026-09-20T00:00:00Z", finishedAt: "2026-09-24T00:00:00Z", agent: "a", traceId: null, status: "success", errorCode: null, money: money() });
  const reference = { runId: run.id, runDigest: run.digest };
  return seal({ schemaVersion: FINANCIAL_PROJECTION_VERSION, scope,
    window: { from: "2026-09-14T00:00:00Z", to: "2026-09-21T00:00:00Z" }, cutoffAt: "2026-09-28T00:00:00Z", generatedAt: "2026-09-28T00:00:00Z",
    runs: [run], usage: [seal({ ...identity, id: "u", createdAt: "2026-09-25T00:00:00Z", reference: { ...reference }, requestId: "run:r:debit", meterType: "tokens", money: money() })],
    ledger: [seal({ ...identity, id: "l", createdAt: "2026-09-26T00:00:00Z", reference: { ...reference }, requestId: "run:r:debit", entryType: "debit", money: money() })],
    authority: [], counts: { runs: 1, usage: 1, ledger: 1, authority: 0 }, declaredMetrics: null });
}
/** Re-seal synthetic inputs only; no billing calculation is implemented in fixtures. */
function modify(fn: (p: any) => void) {
  const p = fixture(); fn(p);
  p.runs = p.runs.map(seal);
  for (const kind of ["usage", "ledger", "authority"]) p[kind] = p[kind].map((r: any) => seal({ ...r, reference: { ...r.reference, runDigest: p.runs.find((x: any) => x.id === r.reference.runId)?.digest ?? null } }));
  p.counts = Object.fromEntries(["runs", "usage", "ledger", "authority"].map(k => [k, p[k].length])); return seal(p);
}
test("known calculation completes consistently, deterministic, immutable and independently unverified", () => {
  const p = fixture(), before = JSON.stringify(p), r = recomputeFinancialProjection(p);
  assert.equal(r.execution, "completed"); assert.equal(r.reconciliation, "consistent");
  assert.equal(r.summary?.totals.auditGapCount, 0); assert.equal(r.summary?.totals.runsChecked, 1);
  assert.equal(r.inputDigest, p.digest); assert.equal(r.evaluatorVersion, "billing-reconciliation-legacy.v1");
  assert.deepEqual(r, recomputeFinancialProjection(p)); assert.equal(JSON.stringify(p), before);
  assert.equal(r.independentSourceVerification, "not_demonstrated"); assert.equal(r.operationalEligibility, "blocked");
});
for (const [name, mutation, issue] of [
  ["missing ledger", (p: any) => { p.ledger = []; }, "missing_ledger"],
  ["run value mismatch", (p: any) => { p.runs[0].money.amountCents = 101; }, "run_vs_breakdown_mismatch"],
  ["ledger value mismatch", (p: any) => { p.ledger[0].money.amountCents = 99; }, "breakdown_vs_ledger_mismatch"],
] as const) test(name, () => {
  const r = recomputeFinancialProjection(modify(mutation));
  assert.equal(r.execution, "completed"); assert.equal(r.reconciliation, "divergent");
  assert.equal(r.summary?.totals.auditGapCount, 1); assert.equal(r.summary?.items.auditGaps[0].issue, issue);
});
test("zero usage remains applicable, absent usage is legacy absence, pending is never not_applicable", () => {
  const zero = recomputeFinancialProjection(modify(p => { p.runs[0].money = money(0); p.usage[0].money = money(0); p.ledger[0].money = money(0); }));
  assert.equal(zero.reconciliation, "consistent"); assert.equal(zero.summary?.totals.missingBreakdownCount, 0);
  const absent = recomputeFinancialProjection(modify(p => { p.usage = []; }));
  assert.equal(absent.summary?.totals.missingBreakdownCount, 1); assert.equal(absent.reconciliation, "indeterminate");
  const pending = recomputeFinancialProjection(modify(p => { p.runs[0].finishedAt = null; p.runs[0].status = "running"; p.usage = []; p.ledger = []; }));
  assert.deepEqual(pending.deferredRunIds, ["r"]); assert.equal(pending.summary?.totals.missingBreakdownCount, 0); assert.equal(pending.reconciliation, "indeterminate");
});
test("pending facts are explicitly deferred, not silently treated as source orphans", () => {
  const r = recomputeFinancialProjection(modify(p => { p.runs[0].finishedAt = null; p.runs[0].status = "running"; }));
  assert.deepEqual(r.deferredFactIds, ["usage:u", "ledger:l"]); assert.equal(r.summary?.totals.orphanUsageCount, 0);
});
test("unresolved guardrail authority and reason survive through the shared calculation", () => {
  const r = recomputeFinancialProjection(modify(p => { p.runs[0].status = "blocked"; p.runs[0].errorCode = "GUARDRAILS_BLOCKED"; p.ledger = []; }));
  assert.equal(r.execution, "completed"); assert.equal(r.reconciliation, "indeterminate");
  assert.equal(r.summary?.totals.authorityUnresolvedCount, 1);
  assert.equal(r.summary?.items.authorityUnresolved[0].reason, "GUARDRAIL_AUTHORITY_EVIDENCE_NOT_FOUND");
});
test("included authority row reproduces legacy suppression but is not independent authority", () => {
  const r = recomputeFinancialProjection(modify(p => {
    p.runs[0].status = "blocked"; p.runs[0].errorCode = "GUARDRAILS_BLOCKED"; p.ledger = [];
    p.authority = [{ id: "a1", tenantId: "t", workspaceId: "w", timestamp: p.cutoffAt, reference: { runId: "r", runDigest: null }, actionType: "blocked.guardrails" }];
  }));
  assert.equal(r.summary?.totals.authorityUnresolvedCount, 0); assert.equal(r.summary?.totals.auditGapCount, 0); assert.equal(r.reconciliation, "indeterminate");
});
test("duplicate row IDs rejected, distinct rows with same legacy request key count duplicate effects", () => {
  const bad = modify(p => { p.ledger.push({ ...p.ledger[0] }); });
  assert.equal(recomputeFinancialProjection(bad).execution, "error");
  const r = recomputeFinancialProjection(modify(p => { p.ledger.push({ ...p.ledger[0], id: "l2" }); }));
  assert.equal(r.execution, "completed"); assert.equal(r.summary?.totals.duplicateChargesCount, 1); assert.equal(r.reconciliation, "divergent");
});
for (const value of [NaN, Infinity, -Infinity, 0.1, Number.MAX_SAFE_INTEGER + 1]) test(`reject invalid/unsafe numeric value ${value}`, () => {
  const p = modify(p => { p.usage[0].money.amountCents = value; });
  assert.equal(recomputeFinancialProjection(p).execution, "error");
});
test("safe integer boundaries and aggregate overflow are explicit", () => {
  assert.equal(recomputeFinancialProjection(modify(p => { p.runs[0].money.amountCents = Number.MAX_SAFE_INTEGER; p.usage = []; p.ledger = []; })).execution, "completed");
  const r = recomputeFinancialProjection(modify(p => { p.usage[0].money.amountCents = Number.MAX_SAFE_INTEGER; }));
  assert.equal(r.execution, "error"); assert.ok(r.reasons.includes("aggregate_precision_overflow"));
});
test("negative integer cents preserve legacy numeric representation", () => {
  const r = recomputeFinancialProjection(modify(p => { for (const k of ["runs", "usage", "ledger"]) p[k][0].money.amountCents = -100; }));
  assert.equal(r.reconciliation, "consistent");
});
for (const [name, mutate] of [
  ["missing amount", (p: any) => { p.usage[0].money.amountCents = null; }],
  ["missing currency", (p: any) => { p.runs[0].money.currency = null; }],
  ["missing unit", (p: any) => { p.usage[0].money.unit = null; }],
  ["different currencies", (p: any) => { p.ledger[0].money.currency = "USD"; }],
  ["different unit", (p: any) => { p.usage[0].money.unit = "millicent"; }],
  ["unknown ledger type", (p: any) => { p.ledger[0].entryType = "adjustment"; }],
] as const) test(`does not invent or mix ${name}`, () => {
  const r = recomputeFinancialProjection(modify(mutate)); assert.equal(r.execution, "not_run"); assert.equal(r.summary, null); assert.equal(r.reconciliation, "indeterminate");
});
test("late usage/ledger already included are calculated rather than filtered by weekly dates", () => {
  const p = fixture(); assert.ok(p.usage[0].createdAt > p.window.to); assert.ok(p.ledger[0].createdAt > p.window.to);
  assert.equal(recomputeFinancialProjection(p).reconciliation, "consistent");
});
test("source anomalies remain visible without inventing links", () => {
  const r = recomputeFinancialProjection(modify(p => { p.usage[0].reference.runId = "missing"; p.ledger[0].reference.runId = null; p.ledger[0].workspaceId = null; }));
  assert.equal(r.execution, "completed", JSON.stringify(r)); assert.equal(r.summary?.totals.orphanUsageCount, 1); assert.equal(r.summary?.totals.ledgerGapCount, 2);
});
test("legacy source metadata does not execute; stage-1 diagnostic remains unchanged", () => {
  const metadata = { description: "synthetic", sourceQueryDescription: "not executed", capturedAt: "2026-09-28T00:00:00Z", rowCount: 1 };
  assert.equal(recomputeFinancialProjection(metadata).execution, "not_run");
  assert.equal(recomputeFinancialProjection({ schemaVersion: "p1-source-material.v1", kind: "metadata_only", metadata }).execution, "not_run");
  assert.equal(validateSourceDiagnostic(describeSourceMaterial()).recomputation.status, "not_run");
});
test("claims cannot replace calculation; matching nonzero declared gaps still mean divergence", () => {
  const p = modify(p => { p.ledger = []; p.declaredMetrics = { auditGapCount: 1, duplicateChargesCount: 0, authorityUnresolvedCount: 0 }; });
  const r = recomputeFinancialProjection(p, { execution: "completed", reconciliation: "consistent", inputDigest: p.digest });
  assert.equal(r.execution, "completed"); assert.equal(r.reconciliation, "divergent"); assert.equal(r.comparison.status, "matches");
  const falseClaim = recomputeFinancialProjection(modify(p => { p.declaredMetrics = { auditGapCount: 8, duplicateChargesCount: 0, authorityUnresolvedCount: 0 }; }));
  assert.equal(falseClaim.comparison.status, "differs"); assert.deepEqual(falseClaim.comparison.differingMetrics, ["auditGapCount"]);
});
test("version, reference digest, counts, timestamps and scope tampering fail closed", () => {
  for (const mutate of [
    (p: any) => { p.schemaVersion = "unknown"; }, (p: any) => { p.usage[0].reference.runDigest = "0".repeat(64); p.usage[0] = seal(p.usage[0]); },
    (p: any) => { p.counts.usage++; }, (p: any) => { p.cutoffAt = "2026-02-30T00:00:00Z"; },
    (p: any) => { p.runs[0].tenantId = "other"; p.runs[0] = seal(p.runs[0]); },
  ]) { const p = fixture(); mutate(p); assert.throws(() => validateFinancialProjection(seal(p))); }
});
test("local CLI executes actual financial calculation with hashes; gate remains blocked", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "m1-financial-")); const input = path.join(dir, "input.json"); writeFileSync(input, JSON.stringify(fixture()));
  const execution = spawnSync(process.execPath, ["--import", "tsx", "scripts/recomputeP1Financial.ts", input], { encoding: "utf8" });
  assert.equal(execution.status, 0, execution.stderr); const local = JSON.parse(execution.stdout);
  assert.equal(local.execution, "completed"); assert.equal(local.reconciliation, "consistent"); assert.equal(local.codeProvenance.attestation, "not_demonstrated");
  assert.ok(local.codeProvenance.sourceFiles.every((f: any) => /^[a-f0-9]{64}$/.test(f.sha256)));
  const DAY = 86400000, start = Date.parse("2026-08-31T00:00:00Z"), iso = (n: number) => new Date(n).toISOString();
  const cycles = Array.from({ length: 3 }, (_, i) => {
    const c = fixtureCycle({ windowFrom: iso(start+i*7*DAY), windowTo: iso(start+(i+1)*7*DAY), generatedAt: iso(start+(i+2)*7*DAY), captureStatus: "final" });
    return { ...c, closure: { cutoffAt: c.evidence.generatedAt, expectedPopulationCount: 2, terminalCount: 2, pendingCount: 0 }, history: [{ evidenceDigest: c.evidence.evidenceDigest, generatedAt: c.evidence.generatedAt }] };
  });
  const pkg = path.join(dir, "package.json"), policy = path.join(dir, "policy.json");
  writeFileSync(pkg, JSON.stringify({ schemaVersion: "p1-ape-weekly-cycle-v3-local-package.v1", cycles, localFinancialRecomputation: local }));
  writeFileSync(policy, JSON.stringify({ ...JSON.parse(readFileSync("scripts/policies/p1-m1-partially-approved.v1.json", "utf8")), scenario: "test",
    fixtureScope: { tenantId: FIXTURE_TENANT, workspaceId: FIXTURE_WORKSPACE, domain: "billing", operationIds: [FIXTURE_OPERATION] } }));
  const gate = spawnSync(process.execPath, ["--import", "tsx", "scripts/checkP1ApeWeeklyCycleV3.ts", "--mode", "gate", "--package", pkg, "--policy", policy, "--checker-now", "2026-09-28T00:00:00Z"], { encoding: "utf8" });
  assert.equal(gate.status, 3, gate.stderr || gate.stdout); const out = JSON.parse(gate.stderr || gate.stdout);
  assert.equal(out.gateEligibility.status, "not_approved"); assert.ok(out.gateEligibility.blockedBy.includes("metricsVerifiedAgainstSource"));
});
