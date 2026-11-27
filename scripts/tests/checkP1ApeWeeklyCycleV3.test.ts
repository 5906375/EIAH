/**
 * Process-level tests for scripts/checkP1ApeWeeklyCycleV3.ts — spawns the
 * real CLI (node --import tsx ...) to verify actual exit codes, not just the
 * in-process pure functions (those are covered by p1CycleSelection.test.ts).
 *
 * All fixtures are written under os.tmpdir(), never under ops/evidence/** —
 * they verify checker behavior only and are not operational evidence.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { buildCycleEvidenceV3, type CycleEvidenceV3Input } from "../../packages/core/src/catalog/apeWeeklyCycleV3.js";

const CLI_PATH = path.resolve("scripts/checkP1ApeWeeklyCycleV3.ts");
const PACKAGE_SCHEMA_VERSION = "p1-ape-weekly-cycle-v3-local-package.v1";
const TENANT = "tenant-cli-fixture";
const WORKSPACE = "workspace-cli-fixture";
const OPERATION = "billing.run_cost_debit";

function tmpFile(dir: string, name: string, data: unknown): string {
  const p = path.join(dir, name);
  writeFileSync(p, JSON.stringify(data, null, 2));
  return p;
}

function runCli(args: readonly string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync("node", ["--import", "tsx", CLI_PATH, ...args], { encoding: "utf8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function policy(overrides: Record<string, unknown> = {}) {
  return {
    scenario: "test",
    scope: { tenantId: TENANT, workspaceId: WORKSPACE, domain: "billing" },
    minCycles: 3,
    maxAgeDays: 14,
    requireConsecutiveWindows: true,
    requireLatestWindowIsLastClosed: true,
    captureToleranceDays: 0,
    requireRatification: false,
    ...overrides,
  };
}

function cycleEntry(windowFrom: string, windowTo: string, generatedAt: string) {
  const receipt = { ref: `receipt-${windowFrom}`, digest: `digest-${windowFrom}`, facts: [{ operationId: OPERATION, auditGapCount: 0, duplicateSideEffectsCount: 0, sampleSize: 2 }] };
  const input: CycleEvidenceV3Input = {
    cycleId: `billing:${TENANT}:${WORKSPACE}:${windowFrom}`,
    generatedAt,
    domain: "billing",
    evidenceClass: "domain",
    tenantId: TENANT,
    workspaceId: WORKSPACE,
    operationIds: [OPERATION],
    expectedUniverse: [OPERATION],
    measurements: [
      {
        operationId: OPERATION,
        measurementStatus: "measured",
        observedAt: { from: windowFrom, to: windowTo },
        sampleSize: 2,
        auditGap: 0,
        duplicateSideEffects: 0,
        rawReceiptRef: receipt.ref,
        rawReceiptDigest: receipt.digest,
      },
    ],
    measurementStatus: "measured",
    coverageStatus: "complete",
    provenance: { commitSha: "cli-fixture-sha", workflowRunId: null, producerIdentity: "cli.fixture.producer.v1" },
  };
  const evidence = buildCycleEvidenceV3(input);
  return { evidence, rawReceipts: [receipt], ratification: null, history: null };
}

function packageOf(...entries: ReturnType<typeof cycleEntry>[]) {
  return { schemaVersion: PACKAGE_SCHEMA_VERSION, cycles: entries };
}

// ---------------------------------------------------------------------------
// Erro de entrada.
// ---------------------------------------------------------------------------

test("CLI: --mode ausente produz INPUT_ERROR, exit 1", () => {
  const { status, stderr } = runCli(["--package", "x.json", "--policy", "y.json"]);
  assert.equal(status, 1);
  assert.equal(JSON.parse(stderr).resultCategory, "INPUT_ERROR");
});

test("CLI: JSON malformado produz INPUT_ERROR, exit 1", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "p1v3-cli-"));
  const badJsonPath = path.join(dir, "broken.json");
  writeFileSync(badJsonPath, "{not valid json");
  const policyPath = tmpFile(dir, "policy.json", policy());
  const { status, stderr } = runCli(["--mode", "package", "--package", badJsonPath, "--policy", policyPath]);
  assert.equal(status, 1);
  assert.equal(JSON.parse(stderr).resultCategory, "INPUT_ERROR");
});

test("CLI: política sem campo obrigatório produz INPUT_ERROR, exit 1 (nunca aprovação por omissão)", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "p1v3-cli-"));
  const incompletePolicy = policy();
  delete (incompletePolicy as Record<string, unknown>).maxAgeDays;
  const policyPath = tmpFile(dir, "policy.json", incompletePolicy);
  const packagePath = tmpFile(dir, "package.json", packageOf(cycleEntry("2026-09-21T00:00:00.000Z", "2026-09-28T00:00:00.000Z", "2026-10-04T12:00:00Z")));
  const { status, stderr } = runCli(["--mode", "gate", "--package", packagePath, "--policy", policyPath]);
  assert.equal(status, 1);
  assert.match(JSON.parse(stderr).message, /maxAgeDays/);
});

// ---------------------------------------------------------------------------
// Diferença de resultado e exit code entre modos, para o mesmo pacote válido.
// ---------------------------------------------------------------------------

test("CLI: mesmo pacote válido — package mode exit 0 (OK), gate mode exit 3 (GUARANTEE_NOT_DEMONSTRATED)", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "p1v3-cli-"));
  const pkg = packageOf(
    cycleEntry("2026-09-21T00:00:00.000Z", "2026-09-28T00:00:00.000Z", "2026-10-04T12:00:00Z"),
    cycleEntry("2026-09-28T00:00:00.000Z", "2026-10-05T00:00:00.000Z", "2026-10-05T12:00:00Z"),
    cycleEntry("2026-10-05T00:00:00.000Z", "2026-10-12T00:00:00.000Z", "2026-10-12T12:00:00Z"),
  );
  const packagePath = tmpFile(dir, "package.json", pkg);
  const policyPath = tmpFile(dir, "policy.json", policy());
  const checkerNow = "2026-10-12T15:00:00Z";

  const pkgResult = runCli(["--mode", "package", "--package", packagePath, "--policy", policyPath, "--checker-now", checkerNow]);
  assert.equal(pkgResult.status, 0);
  const pkgJson = JSON.parse(pkgResult.stdout);
  assert.equal(pkgJson.resultCategory, "OK");
  assert.match(pkgJson.disclaimer, /not an approval of P1/);

  const gateResult = runCli(["--mode", "gate", "--package", packagePath, "--policy", policyPath, "--checker-now", checkerNow]);
  assert.equal(gateResult.status, 3);
  const gateJson = JSON.parse(gateResult.stderr);
  assert.equal(gateJson.resultCategory, "GUARANTEE_NOT_DEMONSTRATED");
  assert.equal(gateJson.gateEligibility.status, "not_approved");
  assert.equal(gateJson.ok, false);
  // The clean package still lists 3 independent, never-cleared-together blockers.
  assert.deepEqual(new Set(gateJson.gateEligibility.blockedBy), new Set(["historyProvenance", "metricsVerifiedAgainstSource", "populationCompleteness"]));
  assert.equal(gateJson.guarantees.packageConsistency.status, "passed");
  assert.equal(gateJson.guarantees.policyCompliance.status, "passed");
  assert.equal(gateJson.guarantees.metricsVerifiedAgainstSource.status, "not_demonstrated");
  assert.equal(gateJson.guarantees.populationCompleteness.status, "not_demonstrated");
  assert.equal(gateJson.guarantees.historyProvenance.verified, false);
});

test("CLI: --checker-now simulado aparece marcado como simulated, nunca como avaliação real atual", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "p1v3-cli-"));
  const packagePath = tmpFile(dir, "package.json", packageOf(cycleEntry("2026-09-21T00:00:00.000Z", "2026-09-28T00:00:00.000Z", "2026-10-04T12:00:00Z")));
  const policyPath = tmpFile(dir, "policy.json", policy());
  const { stdout } = runCli(["--mode", "package", "--package", packagePath, "--policy", policyPath, "--checker-now", "2026-10-12T15:00:00Z"]);
  assert.equal(JSON.parse(stdout).checkerNowSource, "simulated");

  const realResult = runCli(["--mode", "package", "--package", packagePath, "--policy", policyPath]);
  assert.equal(JSON.parse(realResult.stdout).checkerNowSource, "real");
});

test("CLI: evidência vencida em modo gate produz VALIDATION_FAILED, exit 2", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "p1v3-cli-"));
  const pkg = packageOf(
    cycleEntry("2026-09-21T00:00:00.000Z", "2026-09-28T00:00:00.000Z", "2026-01-01T00:00:00Z"), // very stale
    cycleEntry("2026-09-28T00:00:00.000Z", "2026-10-05T00:00:00.000Z", "2026-10-05T12:00:00Z"),
    cycleEntry("2026-10-05T00:00:00.000Z", "2026-10-12T00:00:00.000Z", "2026-10-12T12:00:00Z"),
  );
  const packagePath = tmpFile(dir, "package.json", pkg);
  const policyPath = tmpFile(dir, "policy.json", policy());
  const { status, stderr } = runCli(["--mode", "gate", "--package", packagePath, "--policy", policyPath, "--checker-now", "2026-10-12T15:00:00Z"]);
  assert.equal(status, 2);
  assert.equal(JSON.parse(stderr).resultCategory, "VALIDATION_FAILED");
});

// ---------------------------------------------------------------------------
// Simulação de quatro transições semanais com substituição correta do
// conjunto: A/B/C -> B/C/D -> C/D/E -> D/E/F, com captura semanal pontual
// (sem atraso). Demonstra que o ciclo mais antigo chega a 14 dias no exato
// instante em que o terceiro/mais novo é capturado, e vence logo depois —
// em regime permanente, não apenas na primeira reavaliação (ADR-009 §14).
// ---------------------------------------------------------------------------

test("simulação de 4 transições semanais: seleção rotaciona corretamente e o ciclo mais antigo sempre expira pouco depois da 3ª captura", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "p1v3-cli-weekly-"));
  const policyPath = tmpFile(dir, "policy.json", policy());

  // Weekly windows, each captured PROMPTLY at its own close (captureDelay=0)
  // — the steady-state cadence, not the front-loaded "buy margin once"
  // schedule from earlier rounds.
  const A = cycleEntry("2026-08-31T00:00:00.000Z", "2026-09-07T00:00:00.000Z", "2026-09-07T00:00:00Z");
  const B = cycleEntry("2026-09-07T00:00:00.000Z", "2026-09-14T00:00:00.000Z", "2026-09-14T00:00:00Z");
  const C = cycleEntry("2026-09-14T00:00:00.000Z", "2026-09-21T00:00:00.000Z", "2026-09-21T00:00:00Z");
  const D = cycleEntry("2026-09-21T00:00:00.000Z", "2026-09-28T00:00:00.000Z", "2026-09-28T00:00:00Z");
  const E = cycleEntry("2026-09-28T00:00:00.000Z", "2026-10-05T00:00:00.000Z", "2026-10-05T00:00:00Z");
  const F = cycleEntry("2026-10-05T00:00:00.000Z", "2026-10-12T00:00:00.000Z", "2026-10-12T00:00:00Z");

  const transitions = [
    { label: "T1: A/B/C", accumulated: [A, B, C], expectSelected: ["A", "B", "C"], newest: C, oldest: A },
    { label: "T2: B/C/D", accumulated: [A, B, C, D], expectSelected: ["B", "C", "D"], newest: D, oldest: B },
    { label: "T3: C/D/E", accumulated: [A, B, C, D, E], expectSelected: ["C", "D", "E"], newest: E, oldest: C },
    { label: "T4: D/E/F", accumulated: [A, B, C, D, E, F], expectSelected: ["D", "E", "F"], newest: F, oldest: D },
  ];

  for (const t of transitions) {
    const packagePath = tmpFile(dir, `${t.label.replace(/[^A-Za-z0-9]/g, "_")}.json`, packageOf(...t.accumulated));

    // (1) At the exact instant the newest cycle is captured: the oldest of
    // the three sits at exactly 14.000 days — the boundary, not yet expired.
    const atBoundary = runCli(["--mode", "gate", "--package", packagePath, "--policy", policyPath, "--checker-now", t.newest.evidence.generatedAt]);
    const atBoundaryJson = JSON.parse(atBoundary.stderr || atBoundary.stdout);
    const oldestAtBoundary = atBoundaryJson.selectedCycles.find((c: { cycleId: string }) => c.cycleId === t.oldest.evidence.cycleId);
    assert.ok(oldestAtBoundary, `${t.label}: oldest cycle must be part of the selected set`);
    assert.equal(oldestAtBoundary.recency.governingAgeDays, 14, `${t.label}: oldest cycle's age at the exact capture instant of the newest`);
    assert.equal(oldestAtBoundary.recency.status, "passed", `${t.label}: exactly 14.000 days is the boundary, not yet over it`);

    // (2) Twelve hours later: the oldest has expired — the set stays
    // selected the same way (rolling window), but recency now fails.
    const twelveHoursLater = new Date(Date.parse(t.newest.evidence.generatedAt) + 12 * 3600 * 1000).toISOString();
    const afterBoundary = runCli(["--mode", "gate", "--package", packagePath, "--policy", policyPath, "--checker-now", twelveHoursLater]);
    assert.equal(afterBoundary.status, 2, `${t.label}: VALIDATION_FAILED once the oldest expires`);
    const afterJson = JSON.parse(afterBoundary.stderr);
    const selectedIds = afterJson.selectedCycles.map((c: { cycleId: string }) => c.cycleId);
    assert.deepEqual(
      selectedIds,
      t.expectSelected.map((label) => ({ A, B, C, D, E, F }[label as "A"] as ReturnType<typeof cycleEntry>).evidence.cycleId),
      `${t.label}: selection must roll to the 3 most recent windows, exactly ${t.expectSelected.join("/")}`,
    );
    const oldestAfter = afterJson.selectedCycles.find((c: { cycleId: string }) => c.cycleId === t.oldest.evidence.cycleId);
    assert.equal(oldestAfter.recency.status, "failed", `${t.label}: oldest cycle expired 12h after the 3rd capture`);
    assert.ok(oldestAfter.recency.governingAgeDays > 14);
  }
});
