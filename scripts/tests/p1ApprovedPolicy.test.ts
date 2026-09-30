/** Synthetic local observations only. Exercises the existing CLI and validators. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fixtureCycle, FIXTURE_OPERATION, FIXTURE_TENANT, FIXTURE_WORKSPACE } from "./fixtures/p1ApeWeeklyCycleV3Fixtures.js";
import type { LoadedCycle } from "../lib/p1CycleSelection.js";

const approved = JSON.parse(readFileSync("scripts/policies/p1-m1-partially-approved.v1.json", "utf8"));
const fixturePolicy = { ...approved, scenario: "test", fixtureScope: {
  tenantId: FIXTURE_TENANT, workspaceId: FIXTURE_WORKSPACE, domain: "billing", operationIds: [FIXTURE_OPERATION],
} };
const DAY = 86400000;
const start = Date.parse("2026-08-31T00:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();
function cycle(index: number, firstOffsetDays = 0): LoadedCycle {
  const from = start + index * 7 * DAY;
  const to = from + 7 * DAY;
  const final = fixtureCycle({ windowFrom: iso(from), windowTo: iso(to), generatedAt: iso(to + 7 * DAY), captureStatus: "final" });
  return { ...final, closure: { cutoffAt: final.evidence.generatedAt, expectedPopulationCount: 2, terminalCount: 2, pendingCount: 0 },
    history: [{ evidenceDigest: `synthetic-first-${index}`, generatedAt: iso(to + firstOffsetDays * DAY) },
      { evidenceDigest: final.evidence.evidenceDigest, generatedAt: final.evidence.generatedAt }] };
}
function cli(cycles: LoadedCycle[], now: string, policy = fixturePolicy, expectedExit?: number) {
  const dir = mkdtempSync(path.join(tmpdir(), "m1-approved-"));
  writeFileSync(path.join(dir, "package.json"), JSON.stringify({ schemaVersion: "p1-ape-weekly-cycle-v3-local-package.v1", cycles }));
  writeFileSync(path.join(dir, "policy.json"), JSON.stringify(policy));
  const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/checkP1ApeWeeklyCycleV3.ts", "--mode", "gate",
    "--package", path.join(dir, "package.json"), "--policy", path.join(dir, "policy.json"), "--checker-now", now], { encoding: "utf8" });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  const output = JSON.parse(result.stderr || result.stdout);
  const codes: Record<string, number> = { INPUT_ERROR: 1, VALIDATION_FAILED: 2, GUARANTEE_NOT_DEMONSTRATED: 3 };
  assert.equal(result.status, codes[output.resultCategory]);
  assert.notEqual(result.status, 0);
  if (expectedExit !== undefined) assert.equal(result.status, expectedExit, JSON.stringify(output));
  if (output.gateEligibility) assert.equal(output.gateEligibility.status, "not_approved");
  return output;
}
const trio = () => [cycle(0), cycle(1), cycle(2)];
const deadline = "2026-09-28T00:00:00.000Z";
const independent = ["historyProvenance", "metricsVerifiedAgainstSource", "populationCompleteness", "operationalScope", "closureProof", "executionProvenance"];

test("approved policy: four weekly evaluations ABC → BCD → CDE → DEF, including the interval after each deadline", () => {
  const all = Array.from({ length: 6 }, (_, i) => cycle(i));
  for (let turn = 0; turn < 4; turn++) {
    for (const delta of [0, DAY / 2, 7 * DAY - 1]) {
      const now = iso(Date.parse(all[turn + 2].evidence.generatedAt) + delta);
      const result = cli(all.slice(0, turn + 3), now, fixturePolicy, 3);
      assert.deepEqual(result.selectedCycles.map((c: any) => c.cycleId), all.slice(turn, turn + 3).map(c => c.evidence.cycleId));
      assert.deepEqual(result.selectedCycles.map((c: any) => c.recency.appliedMaxAgeDays), [28, 28, 14]);
      assert.equal(result.guarantees.policyCompliance.status, "passed");
      assert.equal(result.guarantees.packageConsistency.status, "passed");
      for (const blocker of independent) assert.ok(result.gateEligibility.blockedBy.includes(blocker), blocker);
    }
  }
});

test("seven-day deadline: before, exactly at and after; zero tolerance and no fallback to old available trio", () => {
  const before = cli([cycle(-1), ...trio()], "2026-09-27T23:59:59.999Z", fixturePolicy, 3);
  assert.equal(before.selectionPolicyCompliance.expectedMaturedWindow.from, cycle(1).evidence.measurements[0].observedAt!.from);
  for (const now of [deadline, "2026-09-28T00:00:00.001Z"]) {
    const absent = cli([cycle(-1), cycle(0), cycle(1)], now, fixturePolicy, 2);
    assert.equal(absent.selectedCycles.length, 2);
    assert.ok(absent.selectionPolicyCompliance.failureReasons.includes("required_window_missing"));
    assert.deepEqual(absent.selectedCycles.map((c: any) => c.recency.appliedMaxAgeDays), [28, 28], "missing newest does not relabel historical evidence as newest");
    const present = cli(trio(), now, fixturePolicy, 3);
    assert.equal(present.selectionPolicyCompliance.expectedMaturedWindow.from, cycle(2).evidence.measurements[0].observedAt!.from);
  }
  for (const now of ["2026-10-05T00:00:00.000Z", "2026-10-12T00:00:00.000Z", "2026-10-19T00:00:00.000Z"]) {
    const absent = cli(trio(), now, fixturePolicy, 2);
    assert.ok(absent.selectionPolicyCompliance.failureReasons.includes("required_window_missing"));
    assert.ok(absent.selectedCycles.length < 3);
  }
});

test("missing middle window cannot be replaced by an older window; newer provisional does not displace required set", () => {
  const newer = fixtureCycle({ windowFrom: "2026-09-21T00:00:00.000Z", windowTo: deadline, generatedAt: deadline, captureStatus: "provisional" });
  const complete = cli([...trio(), newer], deadline, fixturePolicy, 3);
  assert.equal(complete.selectedCycles.length, 3);
  assert.equal(complete.considered.find((c: any) => c.cycleId === newer.evidence.cycleId).included, false);
  const missing = cli([cycle(-1), cycle(0), cycle(2), newer], deadline, fixturePolicy, 2);
  assert.equal(missing.selectedCycles.length, 2);
  assert.ok(missing.selectionPolicyCompliance.failureReasons.includes("required_window_missing"));
});

test("14/28 days: inclusive boundary and 1 ms after, governed by first generation rather than correction timestamps", () => {
  const entries = [cycle(0, -7), cycle(1), cycle(2, -7)];
  const boundary = cli(entries, deadline, fixturePolicy, 3);
  assert.deepEqual(boundary.selectedCycles.map((c: any) => c.recency.governingAgeDays), [28, 14, 14]);
  const expired = cli(entries, "2026-09-28T00:00:00.001Z", fixturePolicy, 2);
  assert.equal(expired.selectedCycles[0].recency.status, "failed");
  assert.equal(expired.selectedCycles[2].recency.status, "failed");
  assert.equal(expired.selectedCycles[2].recency.governingBasis, "self_declared_history");
  assert.ok(expired.selectedCycles[2].recency.ageDaysFromGeneratedAt < 1);
});

test("newest required window gets 14 even when a historical file has a newer generatedAt", () => {
  const newerHistorical = fixtureCycle({ windowFrom: "2026-08-31T00:00:00.000Z", windowTo: "2026-09-07T00:00:00.000Z", generatedAt: "2026-09-28T12:00:00.000Z", captureStatus: "final" });
  const entry = { ...newerHistorical, closure: { cutoffAt: newerHistorical.evidence.generatedAt, pendingCount: 0, expectedPopulationCount: 2, terminalCount: 2 },
    history: [...cycle(0).history!, { evidenceDigest: newerHistorical.evidence.evidenceDigest, generatedAt: newerHistorical.evidence.generatedAt }] };
  const result = cli([cycle(2), entry, cycle(1)], "2026-09-28T12:00:00.000Z", fixturePolicy, 3);
  assert.deepEqual(result.selectedCycles.map((c: any) => c.recency.appliedMaxAgeDays), [28, 28, 14]);
  assert.equal(result.selectedCycles[0].recency.anchorGeneratedAt, "2026-09-07T00:00:00.000Z");
});

test("pending run after seven days; day-nine conclusion still cannot prove completeness or resolve conflicting versions", () => {
  const pending = { ...cycle(2), captureStatus: "provisional" as const,
    closure: { ...cycle(2).closure!, pendingCount: 1, terminalCount: 1 } };
  const result = cli([cycle(0), cycle(1), pending], "2026-09-29T00:00:00.000Z", fixturePolicy, 2);
  assert.ok(result.selectedCycles[2].closureConsistency.failureReasons.includes("known_pending_runs"));
  assert.ok(result.selectedCycles[2].closureConsistency.failureReasons.includes("capture_not_final"));
  const corrected = fixtureCycle({ windowFrom: "2026-09-14T00:00:00.000Z", windowTo: "2026-09-21T00:00:00.000Z",
    generatedAt: "2026-09-30T00:00:00.000Z", captureStatus: "final", supersedesEvidenceRef: pending.evidence.evidenceDigest });
  const final = { ...corrected, closure: { cutoffAt: corrected.evidence.generatedAt, pendingCount: 0, expectedPopulationCount: 2, terminalCount: 2 },
    history: [...pending.history!, { evidenceDigest: corrected.evidence.evidenceDigest, generatedAt: corrected.evidence.generatedAt }] };
  const conflict = cli([cycle(0), cycle(1), pending, final], corrected.evidence.generatedAt, fixturePolicy, 2);
  assert.equal(conflict.considered.filter((c: any) => c.cycleId === pending.evidence.cycleId && !c.included).length, 2);
  assert.ok(conflict.considered.some((c: any) => c.conflictKind === "provisional_superseded_by_final_unresolved"));
  const claimed = cli([cycle(0), cycle(1), final], corrected.evidence.generatedAt, fixturePolicy, 3);
  assert.equal(claimed.guarantees.policyCompliance.status, "passed");
  assert.equal(claimed.selectedCycles[2].recency.governingAgeDays, 9);
  assert.equal(claimed.guarantees.populationCompleteness.status, "not_demonstrated");
});

test("closure: cutoff chronology and counts are checked locally, including premature final claims", () => {
  const claims = [
    { ...cycle(2).closure!, cutoffAt: "2026-09-20T23:59:59.999Z" },
    { ...cycle(2).closure!, cutoffAt: "2026-09-27T23:59:59.999Z" },
    { ...cycle(2).closure!, cutoffAt: "2026-09-28T00:00:00.001Z" },
    { ...cycle(2).closure!, cutoffAt: "not-a-date" },
    { ...cycle(2).closure!, pendingCount: -1 },
    { ...cycle(2).closure!, pendingCount: 0.5 },
    { ...cycle(2).closure!, terminalCount: 1 },
  ];
  for (const closure of claims) {
    const result = cli([cycle(0), cycle(1), { ...cycle(2), closure }], deadline, fixturePolicy, 2);
    assert.equal(result.selectedCycles[2].closureConsistency.status, "failed");
  }
});

test("missing closure metadata is an undemonstrated guarantee; historical provisional capture fails policy too", () => {
  const absent = cli(trio().map(c => ({ ...c, closure: null })), deadline, fixturePolicy, 3);
  assert.equal(absent.guarantees.closureProof.missingClaims.length, 3);
  const provisional = cli([{ ...cycle(0), captureStatus: "provisional" }, cycle(1), cycle(2)], deadline, fixturePolicy, 2);
  assert.ok(provisional.guarantees.policyCompliance.failureReasons.includes("capture_not_final"));
});

test("operational scope remains explicitly unconfigured; fixtures cannot designate it", () => {
  assert.equal(approved.scope, null);
  assert.equal(approved.expectedOperationIds, null);
  const result = cli(trio(), deadline, approved, 3);
  assert.equal(result.guarantees.operationalScope.status, "not_configured");
  assert.equal(result.guarantees.policyCompliance.status, "not_evaluated");
  assert.equal(result.selectedCycles.length, 0);
  assert.equal(result.selectionPolicyCompliance.requiredWindows.length, 3);
  for (const blocker of independent) assert.ok(result.gateEligibility.blockedBy.includes(blocker));
  cli(trio(), deadline, { ...fixturePolicy, scenario: "operational" }, 1);
});

test("configuration cannot override approved thresholds, scope, retention or promote self-declared guarantees", () => {
  for (const extra of [{ maxAgeDays: 90 }, { historicalCycleMaxAgeDays: 90 }, { captureToleranceDays: 3 },
    { automaticDiscard: true }, { scope: fixturePolicy.fixtureScope }, { populationCompleteness: "verified" },
    { historyProvenance: "verified" }, { metricsVerifiedAgainstSource: true }]) {
    cli(trio(), deadline, { ...fixturePolicy, ...extra }, 1);
  }
  const claims = trio().map(c => ({ ...c, populationCompleteness: "verified", historyProvenance: "verified", metricsVerifiedAgainstSource: true }));
  const result = cli(claims, deadline, fixturePolicy, 3);
  assert.equal(result.guarantees.historyProvenance.verified, false);
  assert.equal(result.guarantees.metricsVerifiedAgainstSource.status, "not_demonstrated");
});

test("same-digest contradictory closure metadata is not silently deduplicated or chosen by order", () => {
  const final = cycle(2);
  const contradictory = { ...final, closure: { ...final.closure!, pendingCount: 1, terminalCount: 1 } };
  for (const versions of [[final, contradictory], [contradictory, final]]) {
    const result = cli([cycle(0), cycle(1), ...versions], deadline, fixturePolicy, 2);
    assert.equal(result.selectedCycles.length, 2);
    assert.equal(result.considered.filter((c: any) => c.exclusionReasons.includes("version_conflict_unresolved")).length, 2);
  }
});

test("P1 dispenses with individual ratification; mismatched history and receipt inconsistency remain independent blockers", () => {
  const clean = cli(trio(), deadline, fixturePolicy, 3);
  assert.ok(clean.selectedCycles.every((c: any) => c.ratification.status === "not_required"));
  const wrong = cycle(2);
  const result = cli([cycle(0), cycle(1), { ...wrong,
    history: [{ evidenceDigest: wrong.evidence.evidenceDigest, generatedAt: "2026-09-27T00:00:00.000Z" }],
    rawReceipts: [] }], deadline, fixturePolicy, 2);
  assert.equal(result.guarantees.historyProvenance.status, "failed");
  assert.equal(result.guarantees.packageConsistency.status, "failed");
  for (const blocker of independent) assert.ok(result.gateEligibility.blockedBy.includes(blocker));
});


test("invalid history cannot refresh an earlier known anchor; omitted history never proves first generation", () => {
  const current = cycle(2);
  const wrong = cli([cycle(0), cycle(1), { ...current, history: [
    { evidenceDigest: current.evidence.evidenceDigest, generatedAt: "2026-08-01T00:00:00.000Z" },
  ] }], deadline, fixturePolicy, 2);
  assert.equal(wrong.selectedCycles[2].recency.anchorGeneratedAt, "2026-08-01T00:00:00.000Z");
  assert.equal(wrong.selectedCycles[2].recency.status, "failed");
  assert.equal(wrong.guarantees.historyProvenance.status, "failed");
  const omitted = cli(trio().map(c => ({ ...c, history: null })), deadline, fixturePolicy, 3);
  assert.equal(omitted.guarantees.historyProvenance.verified, false);
  assert.ok(omitted.gateEligibility.blockedBy.includes("historyProvenance"));
});
