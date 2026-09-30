/**
 * Integrated local tests of the M1 contract (ADR-009 §14): recurrence,
 * capture tolerance, period closing, and late-finishing runs — exercising
 * the REAL CLI (spawned as a process) and the real selector/validators, not
 * a second implementation of the rules. Scenario A's 4-transition boundary
 * demonstration already exists in checkP1ApeWeeklyCycleV3.test.ts and is
 * NOT duplicated here — see that file for A.
 *
 * Fixtures here are synthetic. They demonstrate checker BEHAVIOR only, are
 * never ciclos reais, and must never be indexed as operational evidence.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { buildCycleEvidenceV3, type CycleEvidenceV3Input } from "../../packages/core/src/catalog/apeWeeklyCycleV3.js";
import { checkRetention, describePackageGuarantees, validatePackageManifest, OPERATIONAL_PACKAGE_SCHEMA_VERSION } from "../lib/p1OperationalPackage.js";

import type { LoadedCycle } from "../lib/p1CycleSelection.js";

const CLI_PATH = path.resolve("scripts/checkP1ApeWeeklyCycleV3.ts");
const PACKAGE_SCHEMA_VERSION = "p1-ape-weekly-cycle-v3-local-package.v1";
const TENANT = "tenant-integrated-fixture";
const WORKSPACE = "workspace-integrated-fixture";
const OPERATION = "billing.run_cost_debit";

function tmpFile(dir: string, name: string, data: unknown): string {
  const p = path.join(dir, name);
  writeFileSync(p, JSON.stringify(data, null, 2));
  return p;
}

function runCli(args: readonly string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync("node", ["--import", "tsx", CLI_PATH, ...args], { encoding: "utf8" });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  if (args[args.indexOf("--mode") + 1] === "gate") {
    const payload = JSON.parse(result.stderr || result.stdout);
    const expectedExit = ({ INPUT_ERROR: 1, VALIDATION_FAILED: 2, GUARANTEE_NOT_DEMONSTRATED: 3 } as Record<string, number>)[payload.resultCategory];
    assert.ok(expectedExit, "gate must report a blocking category");
    assert.equal(result.status, expectedExit, "exit code must agree with the blocking category");
    if (payload.gateEligibility) assert.equal(payload.gateEligibility.status, "not_approved");
  }
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function parseResult(r: { stdout: string; stderr: string }): Record<string, unknown> {
  return JSON.parse(r.stdout || r.stderr);
}

function cycleEntry(params: {
  from: string;
  to: string;
  generatedAt: string;
  sampleSize?: number;
  auditGap?: number;
  captureStatus?: "provisional" | "final" | null;
  supersedesEvidenceRef?: string;
}) {
  const sampleSize = params.sampleSize ?? 2;
  const auditGap = params.auditGap ?? 0;
  // Digest changes with content (sampleSize/auditGap), so a provisional and
  // a later final capture of the SAME window are, correctly, different
  // versions — never accidentally deduplicated as "the same digest".
  const ref = `receipt-${params.from}-${sampleSize}-${auditGap}`;
  const digest = `digest-${params.from}-${sampleSize}-${auditGap}`;
  const receipt = { ref, digest, facts: [{ operationId: OPERATION, auditGapCount: auditGap, duplicateSideEffectsCount: 0, sampleSize }] };
  const input: CycleEvidenceV3Input = {
    cycleId: `billing:${TENANT}:${WORKSPACE}:${params.from}`,
    generatedAt: params.generatedAt,
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
        observedAt: { from: params.from, to: params.to },
        sampleSize,
        auditGap,
        duplicateSideEffects: 0,
        rawReceiptRef: ref,
        rawReceiptDigest: digest,
      },
    ],
    measurementStatus: "measured",
    coverageStatus: "complete",
    provenance: { commitSha: "integrated-fixture-sha", workflowRunId: null, producerIdentity: "integrated.fixture.producer.v1" },
    ...(params.supersedesEvidenceRef ? { supersedesEvidenceRef: params.supersedesEvidenceRef } : {}),
  };
  const evidence = buildCycleEvidenceV3(input);
  return { evidence, rawReceipts: [receipt], ratification: null, history: null, captureStatus: params.captureStatus ?? null };
}

function packageOf(...entries: LoadedCycle[]) {
  return { schemaVersion: PACKAGE_SCHEMA_VERSION, cycles: entries };
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

// Weekly windows shared by every scenario in this file (Monday-to-Monday UTC).
const W = {
  W1: ["2026-09-14T00:00:00.000Z", "2026-09-21T00:00:00.000Z"],
  W2: ["2026-09-21T00:00:00.000Z", "2026-09-28T00:00:00.000Z"],
  W3: ["2026-09-28T00:00:00.000Z", "2026-10-05T00:00:00.000Z"],
  W4: ["2026-10-05T00:00:00.000Z", "2026-10-12T00:00:00.000Z"],
} as const;

// ---------------------------------------------------------------------------
// B. Proposta de fechamento após sete dias — demonstra a incompatibilidade
// entre requireLatestWindowIsLastClosed + requireFinalCaptureForNewestWindow
// + finalCaptureMaturationDays=7. Não escolhe silenciosamente um trio antigo:
// o pacote sempre contém exatamente W1/W2/W3, e a falha é sempre reportada.
// ---------------------------------------------------------------------------

test("B: nenhum instante satisfaz simultaneamente 'última janela fechada' e 'final plausível' quando maturação=cadência=7 dias", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "p1v3-scenario-b-"));
  const policyPath = tmpFile(
    dir,
    "policy.json",
    policy({ requireLatestWindowIsLastClosed: true, requireFinalCaptureForNewestWindow: true, finalCaptureMaturationDays: 7 }),
  );

  // Ponto 1: no instante exato do fechamento de W3 (idade de maturação = 0), rotulado "provisional" (honesto).
  const provisionalPkg = tmpFile(
    dir,
    "provisional.json",
    packageOf(
      cycleEntry({ from: W.W1[0], to: W.W1[1], generatedAt: W.W1[1] }),
      cycleEntry({ from: W.W2[0], to: W.W2[1], generatedAt: W.W2[1] }),
      cycleEntry({ from: W.W3[0], to: W.W3[1], generatedAt: W.W3[1], captureStatus: "provisional" }),
    ),
  );
  const r1 = parseResult(runCli(["--mode", "gate", "--package", provisionalPkg, "--policy", policyPath, "--checker-now", W.W3[1]]));
  assert.equal((r1.selectionPolicyCompliance as any).latestWindowIsLastClosed, true, "W3 IS the last closed window at its own close instant");
  assert.equal((r1.selectionPolicyCompliance as any).newestWindowFinalSatisfied, false, "but honestly 'provisional' never satisfies the final requirement");
  assert.ok((r1.selectionPolicyCompliance as any).failureReasons.includes("newest_window_not_final"));

  // Ponto 2: mesmo instante, mas alegando "final" desonestamente (0 dias de maturação, exige 7).
  const dishonestFinalPkg = tmpFile(
    dir,
    "dishonest-final.json",
    packageOf(
      cycleEntry({ from: W.W1[0], to: W.W1[1], generatedAt: W.W1[1] }),
      cycleEntry({ from: W.W2[0], to: W.W2[1], generatedAt: W.W2[1] }),
      cycleEntry({ from: W.W3[0], to: W.W3[1], generatedAt: W.W3[1], captureStatus: "final" }),
    ),
  );
  const r2 = parseResult(runCli(["--mode", "gate", "--package", dishonestFinalPkg, "--policy", policyPath, "--checker-now", W.W3[1]]));
  assert.equal((r2.selectionPolicyCompliance as any).latestWindowIsLastClosed, true);
  const newestGuarantees2 = (r2.selectedCycles as any[])[(r2.selectedCycles as any[]).length - 1];
  assert.equal(newestGuarantees2.captureMaturity.status, "final_implausible", "labeling it final does not make it plausible");
  assert.ok(newestGuarantees2.captureMaturity.failureReasons.includes("implausible_final_classification"));

  // Ponto 3: pouco depois de 7 dias (a maturação seria atingida) — mas por
  // então a janela "última fechada" real já avançou para W4, que não existe
  // no pacote. A folga é zero: no instante em que a maturação seria
  // suficiente, o requisito de "última fechada" já falhou por outro motivo.
  // O instante exato da virada também é coberto pelo teste de fronteira abaixo;
  // tolerância zero não permite aceitar a janela anterior nesse instante.
  const justAfterMaturity = new Date(Date.parse(W.W3[1]) + 7 * 86400000 + 12 * 3600000).toISOString();
  const r3 = parseResult(runCli(["--mode", "gate", "--package", dishonestFinalPkg, "--policy", policyPath, "--checker-now", justAfterMaturity]));
  assert.equal((r3.selectionPolicyCompliance as any).latestWindowIsLastClosed, false, "by the time W3 could be plausibly final, W4 has already become 'last closed'");
  assert.equal((r3.selectionPolicyCompliance as any).latestWindowWithinTolerance, false, "captureToleranceDays=0 gives no grace, including the exact transition instant");
  assert.ok((r3.selectionPolicyCompliance as any).failureReasons.includes("window_not_latest_closed"));
});

// ---------------------------------------------------------------------------
// C. Última janela elegível — requireLatestWindowIsLastMatured resolve o
// conflito da B, mas o gate SEGUE não aprovado (garantias operacionais
// continuam ausentes) — atendimento de política ≠ elegibilidade completa.
// ---------------------------------------------------------------------------

test("C: 'última janela matura' (em vez de 'última fechada') permite política+captura coerentes no mesmo instante — mas o gate continua GUARANTEE_NOT_DEMONSTRATED", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "p1v3-scenario-c-"));
  // 7 dias após o fechamento de W3 = a data em que a captura final de W3 se torna plausível.
  const maturedInstant = new Date(Date.parse(W.W3[1]) + 7 * 86400000).toISOString();

  const pkg = packageOf(
    cycleEntry({ from: W.W1[0], to: W.W1[1], generatedAt: W.W1[1] }),
    cycleEntry({ from: W.W2[0], to: W.W2[1], generatedAt: W.W2[1] }),
    cycleEntry({ from: W.W3[0], to: W.W3[1], generatedAt: maturedInstant, captureStatus: "final" }), // captured exactly at maturity
  );
  const packagePath = tmpFile(dir, "package.json", pkg);
  const policyC = tmpFile(
    dir,
    "policy.json",
    policy({
      requireLatestWindowIsLastClosed: false,
      requireLatestWindowIsLastMatured: true,
      requireFinalCaptureForNewestWindow: true,
      finalCaptureMaturationDays: 7,
      historicalCycleMaxAgeDays: 21, // derived minimum (2×cadence + 1×cadence margin, ADR-009 §14.12) to avoid recurring blocking of the two older cycles — not an arbitrary or "necessary" number, see ADR
    }),
  );

  const result = parseResult(runCli(["--mode", "gate", "--package", packagePath, "--policy", policyC, "--checker-now", maturedInstant]));
  assert.equal((result.selectionPolicyCompliance as any).latestWindowIsLastMatured, true);
  assert.deepEqual((result.selectionPolicyCompliance as any).expectedMaturedWindow, { from: W.W3[0], to: W.W3[1] });
  const newestGuarantees = (result.selectedCycles as any[])[(result.selectedCycles as any[]).length - 1];
  assert.equal(newestGuarantees.captureMaturity.status, "final_plausible");
  assert.equal((result.guarantees as any).policyCompliance.status, "passed", "política simulada plenamente atendida neste instante");

  // O ponto central do item 5: atendimento de política NUNCA é elegibilidade completa.
  assert.equal(result.resultCategory, "GUARANTEE_NOT_DEMONSTRATED");
  assert.equal((result.gateEligibility as any).status, "not_approved");
  assert.ok((result.gateEligibility as any).blockedBy.includes("historyProvenance"));
  assert.ok((result.gateEligibility as any).blockedBy.includes("metricsVerifiedAgainstSource"));
  assert.ok((result.gateEligibility as any).blockedBy.includes("populationCompleteness"));

  // Contraste direto com B, no MESMO instante: exigir "última fechada" (em vez de "última matura") falha aqui.
  const policyB = tmpFile(dir, "policy-b.json", policy({ requireLatestWindowIsLastClosed: true, requireFinalCaptureForNewestWindow: true, finalCaptureMaturationDays: 7 }));
  const resultB = parseResult(runCli(["--mode", "gate", "--package", packagePath, "--policy", policyB, "--checker-now", maturedInstant]));
  assert.equal((resultB.selectionPolicyCompliance as any).latestWindowIsLastClosed, false, "no mesmo instante, a regra da Cláusula B ainda falha — C resolve algo que B não resolve");
});

// ---------------------------------------------------------------------------
// D. Run concluída tardiamente — provisório vs. final, identidade e âncora
// preservadas, sem resolução automática, e "final" nunca prova completude.
// ---------------------------------------------------------------------------

test("D: captura provisória (run pendente excluída) vs. final (run incluída) — conflito rotulado, nenhuma versão descartada, identidade preservada", () => {
  const provisional = cycleEntry({ from: W.W3[0], to: W.W3[1], generatedAt: W.W3[1], sampleSize: 1, captureStatus: "provisional" }); // a run ainda em voo é excluída
  const final = cycleEntry({
    from: W.W3[0],
    to: W.W3[1],
    generatedAt: new Date(Date.parse(W.W3[1]) + 7 * 86400000).toISOString(),
    sampleSize: 2, // a run pendente terminou e agora é contada
    captureStatus: "final",
    supersedesEvidenceRef: provisional.evidence.evidenceDigest,
  });

  assert.equal(provisional.evidence.cycleId, final.evidence.cycleId, "mesma identidade de ciclo (janela+escopo) nas duas versões");
  assert.notEqual(provisional.evidence.evidenceDigest, final.evidence.evidenceDigest, "conteúdo real diferente -> digest real diferente, não é o mesmo artefato");

  const dir = mkdtempSync(path.join(tmpdir(), "p1v3-scenario-d-"));
  const pkg = packageOf(
    cycleEntry({ from: W.W1[0], to: W.W1[1], generatedAt: W.W1[1] }),
    cycleEntry({ from: W.W2[0], to: W.W2[1], generatedAt: W.W2[1] }),
    provisional,
    final,
  );
  const packagePath = tmpFile(dir, "package.json", pkg);
  const policyPath = tmpFile(dir, "policy.json", policy({ historicalCycleMaxAgeDays: 21 })); // derived minimum, see ADR-009 §14.12
  const checkerNow = new Date(Date.parse(W.W3[1]) + 7 * 86400000).toISOString();

  const result = parseResult(runCli(["--mode", "gate", "--package", packagePath, "--policy", policyPath, "--checker-now", checkerNow]));
  const conflicted = (result.considered as any[]).filter((c) => c.window?.from === W.W3[0]);
  assert.equal(conflicted.length, 2, "ambas as versões aparecem, nenhuma descartada");
  assert.ok(conflicted.every((c) => c.included === false), "não resolvido automaticamente — ADR-009 §14.4/§14.13");
  const finalEntry = conflicted.find((c) => c.captureStatus === "final");
  assert.equal(finalEntry.conflictKind, "provisional_superseded_by_final_unresolved");
  // Ficam só 2 janelas distintas utilizáveis (W1,W2) — nunca 3, porque o
  // conflito não fabrica uma terceira janela aceita a partir de duas
  // versões conflitantes.
  assert.ok((result.selectionPolicyCompliance as any).failureReasons.includes("insufficient_distinct_cycles"));

  // "Final" e tempo decorrido nunca provam completude — verificado via o
  // módulo de pacote operacional, mesmo com captureStatus="final" plausível.
  const manifest = validatePackageManifest({
    schemaVersion: OPERATIONAL_PACKAGE_SCHEMA_VERSION,
    packagedAt: checkerNow,
    scope: { tenantId: TENANT, workspaceId: WORKSPACE, domain: "billing" },
    codeProvenance: { scriptPath: "apps/api/scripts/run_ape_weekly_cycle_v3_billing.ts", trackedInGit: true, repoCommitSha: "abc", scriptContentHash: null },
    transport: { mechanism: "manual_local_file", retrievedAt: null },
  });
  const guarantees = describePackageGuarantees({ manifest, cycles: [final] });
  assert.equal(guarantees.schemaVersion, "p1-source-diagnostic.v2");
  assert.equal(guarantees.recomputation.status, "not_run");
  assert.equal(guarantees.independentSourceVerification.status, "not_demonstrated");
  assert.equal(guarantees.completenessAndAuthenticityOfInputs.status, "not_demonstrated", "nem 'final' nem o tempo decorrido provam que nenhuma linha foi omitida");
});

// ---------------------------------------------------------------------------
// E. Tolerância — nunca estende recência, nunca promove provisório a final,
// nunca autoriza pular mais de uma janela, nunca renova a primeira geração.
// ---------------------------------------------------------------------------

test("E: tolerância cobre a janela ausente, mas nunca promove captureStatus 'provisional' a 'final'", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "p1v3-scenario-e-"));
  const pkg = packageOf(
    cycleEntry({ from: W.W1[0], to: W.W1[1], generatedAt: W.W1[1] }),
    cycleEntry({ from: W.W2[0], to: W.W2[1], generatedAt: W.W2[1] }),
    cycleEntry({ from: W.W3[0], to: W.W3[1], generatedAt: W.W3[1], captureStatus: "provisional" }),
  );
  const packagePath = tmpFile(dir, "package.json", pkg);
  const policyPath = tmpFile(dir, "policy.json", policy({ captureToleranceDays: 3 }));
  // 2 dias após a virada para a janela seguinte (W4) — dentro da tolerância de 3 dias.
  const withinTolerance = new Date(Date.parse(W.W4[1]) + 2 * 86400000).toISOString(); // 2 dias após W4 se tornar "última fechada"

  const result = parseResult(runCli(["--mode", "gate", "--package", packagePath, "--policy", policyPath, "--checker-now", withinTolerance]));
  assert.equal((result.selectionPolicyCompliance as any).latestWindowWithinTolerance, true);
  const newestGuarantees = (result.selectedCycles as any[])[(result.selectedCycles as any[]).length - 1];
  assert.equal(newestGuarantees.captureMaturity.status, "provisional", "tolerância cobre a ausência da janela seguinte — não transforma o rótulo desta em final");
});

test("E: tolerância nunca autoriza pular mais de uma janela obrigatória", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "p1v3-scenario-e2-"));
  const pkg = packageOf(
    cycleEntry({ from: W.W1[0], to: W.W1[1], generatedAt: W.W1[1] }),
    cycleEntry({ from: W.W2[0], to: W.W2[1], generatedAt: W.W2[1] }),
    cycleEntry({ from: W.W3[0], to: W.W3[1], generatedAt: W.W3[1] }),
  );
  const packagePath = tmpFile(dir, "package.json", pkg);
  // Tolerância generosa (30 dias) não ajuda quando DUAS janelas (W4 e a
  // seguinte) já deveriam ter sido capturadas e não foram.
  const policyPath = tmpFile(dir, "policy.json", policy({ captureToleranceDays: 30 }));
  const twoWindowsLate = new Date(Date.parse(W.W4[1]) + 8 * 86400000).toISOString(); // 8 dias após W4 se tornar "última fechada" -> agora falta W4 E a janela seguinte

  const result = parseResult(runCli(["--mode", "gate", "--package", packagePath, "--policy", policyPath, "--checker-now", twoWindowsLate]));
  assert.equal((result.selectionPolicyCompliance as any).latestWindowIsLastClosed, false);
  assert.equal((result.selectionPolicyCompliance as any).latestWindowWithinTolerance, false, "estar duas janelas atrasado nunca é 'a uma janela de distância' — tolerância generosa não ajuda");
  assert.ok((result.selectionPolicyCompliance as any).failureReasons.includes("window_not_latest_closed"));
});

test("E: tolerância nunca renova a primeira geração — âncora vencida continua vencida mesmo com a janela coberta pela tolerância", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "p1v3-scenario-e3-"));
  const staleFirstCycle = cycleEntry({ from: W.W1[0], to: W.W1[1], generatedAt: W.W1[1] });
  const pkg = packageOf(
    staleFirstCycle,
    cycleEntry({ from: W.W2[0], to: W.W2[1], generatedAt: W.W2[1] }),
    cycleEntry({ from: W.W3[0], to: W.W3[1], generatedAt: W.W3[1] }),
  );
  const packagePath = tmpFile(dir, "package.json", pkg);
  const policyPath = tmpFile(dir, "policy.json", policy({ captureToleranceDays: 3 }));
  const withinTolerance = new Date(Date.parse(W.W4[1]) + 2 * 86400000).toISOString(); // 2 dias após W4 se tornar "última fechada"

  const result = parseResult(runCli(["--mode", "gate", "--package", packagePath, "--policy", policyPath, "--checker-now", withinTolerance]));
  assert.equal((result.selectionPolicyCompliance as any).latestWindowWithinTolerance, true, "a janela em si está coberta pela tolerância");
  const oldestGuarantees = (result.selectedCycles as any[])[0];
  assert.equal(oldestGuarantees.cycleId, staleFirstCycle.evidence.cycleId);
  assert.equal(oldestGuarantees.recency.status, "failed", "mas a idade do ciclo mais antigo, por conta própria, já excede 14 dias — a tolerância da janela não estendeu isso");
});

// Explicit dates describe synthetic observations, not a second population algorithm.
const maturePolicy = () => policy({
  requireLatestWindowIsLastClosed: false, requireLatestWindowIsLastMatured: true,
  requireFinalCaptureForNewestWindow: true, finalCaptureMaturationDays: 7,
  historicalCycleMaxAgeDays: 28,
});
function threeWindows() {
  return [
    cycleEntry({ from: W.W1[0], to: W.W1[1], generatedAt: W.W1[1] }),
    cycleEntry({ from: W.W2[0], to: W.W2[1], generatedAt: W.W2[1] }),
    cycleEntry({ from: W.W3[0], to: W.W3[1], generatedAt: "2026-10-12T00:00:00.000Z", captureStatus: "final" }),
  ];
}
function gateAt(dir: string, entries: LoadedCycle[], configuration: ReturnType<typeof policy>, now: string) {
  return parseResult(runCli(["--mode", "gate", "--package", tmpFile(dir, "package.json", packageOf(...entries)),
    "--policy", tmpFile(dir, "policy.json", configuration), "--checker-now", now])) as any;
}

test("B: zero tolerance cannot accept the previous window at the exact seven-day boundary", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "p1v3-boundary-"));
  const result = gateAt(dir, threeWindows(), policy({ historicalCycleMaxAgeDays: 28,
    requireFinalCaptureForNewestWindow: true, finalCaptureMaturationDays: 7 }), "2026-10-12T00:00:00.000Z");
  assert.equal(result.selectedCycles.at(-1).captureMaturity.status, "final_plausible");
  assert.equal(result.selectionPolicyCompliance.latestWindowWithinTolerance, false);
  assert.equal(result.guarantees.policyCompliance.status, "failed");
  assert.ok(result.selectionPolicyCompliance.failureReasons.includes("window_not_latest_closed"));
  for (const [now, within] of [
    ["2026-10-15T00:00:00.000Z", true],
    ["2026-10-15T00:00:00.001Z", false],
  ] as const) {
    const tolerance = gateAt(dir, threeWindows(), policy({ captureToleranceDays: 3, historicalCycleMaxAgeDays: 28 }), now);
    assert.equal(tolerance.selectionPolicyCompliance.latestWindowWithinTolerance, within);
  }
});

test("C: select the clock-required matured trio even with a newer provisional capture; never retreat when required window is missing", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "p1v3-mature-selection-"));
  const entries = [...threeWindows(), cycleEntry({ from: W.W4[0], to: W.W4[1], generatedAt: W.W4[1], captureStatus: "provisional" })];
  const result = gateAt(dir, entries, maturePolicy(), "2026-10-12T12:00:00.000Z");
  assert.deepEqual(result.selectedCycles.map((c: any) => c.window.from), [W.W1[0], W.W2[0], W.W3[0]]);
  assert.equal(result.guarantees.policyCompliance.status, "passed");
  assert.equal(result.resultCategory, "GUARANTEE_NOT_DEMONSTRATED");
  assert.equal(result.considered.find((c: any) => c.window.from === W.W4[0]).included, false);
  for (const now of ["2026-10-19T00:00:00.000Z", "2026-10-26T00:00:00.000Z", "2026-11-02T00:00:00.000Z"]) {
    const missing = gateAt(dir, threeWindows(), maturePolicy(), now);
    assert.equal(missing.selectionPolicyCompliance.latestWindowIsLastMatured, false);
    assert.equal(missing.guarantees.policyCompliance.status, "failed");
    assert.ok(missing.selectionPolicyCompliance.failureReasons.includes("window_not_yet_matured"));
  }
  const onlyNewer = gateAt(dir, [entries[3]], maturePolicy(), "2026-10-12T12:00:00.000Z");
  assert.deepEqual(onlyNewer.selectionPolicyCompliance.expectedMaturedWindow, { from: W.W3[0], to: W.W3[1] });
  assert.equal(onlyNewer.selectionPolicyCompliance.latestWindowIsLastMatured, false);
  assert.equal(onlyNewer.selectedCycles.length, 0);
});

test("C: matured-window policy requires an explicit finite maturation duration", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "p1v3-policy-validation-"));
  const { finalCaptureMaturationDays, ...missing } = maturePolicy() as Record<string, unknown>;
  for (const configuration of [missing, { ...maturePolicy(), finalCaptureMaturationDays: Infinity }]) {
    // JSON cannot represent Infinity; provide valid JSON numeric overflow instead.
    const policyPath = tmpFile(dir, "policy.json", configuration);
    if (configuration.finalCaptureMaturationDays === Infinity) {
      writeFileSync(policyPath, readFileSync(policyPath, "utf8").replace('"finalCaptureMaturationDays": null', '"finalCaptureMaturationDays": 1e400'));
    }
    const output = runCli(["--mode", "gate", "--package", tmpFile(dir, "package.json", packageOf(...threeWindows())),
      "--policy", policyPath, "--checker-now", "2026-10-12T00:00:00.000Z"]);
    assert.equal(output.status, 1);
    assert.equal(parseResult(output).resultCategory, "INPUT_ERROR");
  }
});

test("D: run remains pending after seven days, finishes on day nine, and corrections preserve the first-generation anchor", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "p1v3-late-run-"));
  const run = { id: "synthetic-late-run", createdAt: "2026-10-04T23:59:00.000Z", finishedAt: "2026-10-14T00:00:00.000Z" };
  assert.ok(Date.parse(run.createdAt) < Date.parse(W.W3[1]));
  assert.ok(Date.parse(run.finishedAt) - Date.parse(W.W3[1]) > 7 * 86400000);
  const initial = cycleEntry({ from: W.W3[0], to: W.W3[1], generatedAt: W.W3[1], sampleSize: 1, captureStatus: "provisional" });
  const dayEight = "2026-10-13T00:00:00.000Z";
  assert.ok(Date.parse(dayEight) < Date.parse(run.finishedAt), "run still pending on day eight");
  const pending = cycleEntry({ from: W.W3[0], to: W.W3[1], generatedAt: dayEight, sampleSize: 1, captureStatus: "provisional" });
  const pendingResult = gateAt(dir, [...threeWindows().slice(0, 2), pending], maturePolicy(), dayEight);
  assert.equal(pendingResult.selectionPolicyCompliance.latestWindowIsLastMatured, true);
  assert.equal(pendingResult.selectionPolicyCompliance.newestWindowFinalSatisfied, false);
  assert.equal(pendingResult.guarantees.populationCompleteness.status, "not_demonstrated");
  // Even a temporally plausible lie cannot clear completeness or the gate.
  const claimedFinal = { ...pending, captureStatus: "final" as const };
  const claimResult = gateAt(dir, [...threeWindows().slice(0, 2), claimedFinal], maturePolicy(), dayEight);
  assert.equal(claimResult.guarantees.policyCompliance.status, "passed");
  assert.equal(claimResult.resultCategory, "GUARANTEE_NOT_DEMONSTRATED");
  const corrected = cycleEntry({ from: W.W3[0], to: W.W3[1], generatedAt: run.finishedAt, sampleSize: 2,
    captureStatus: "final", supersedesEvidenceRef: initial.evidence.evidenceDigest });
  const retained = [initial, pending, corrected];
  const before = JSON.stringify(retained);
  const conflict = gateAt(dir, [...threeWindows().slice(0, 2), ...retained], maturePolicy(), run.finishedAt);
  assert.equal(JSON.stringify(retained), before);
  const versions = conflict.considered.filter((c: any) => c.cycleId === initial.evidence.cycleId);
  assert.equal(versions.length, 3);
  assert.ok(versions.every((c: any) => !c.included && c.exclusionReasons.includes("version_conflict_unresolved")));
  // History remains self-declared; it may constrain age, never prove provenance.
  const withHistory = { ...corrected, history: retained.map(c => ({ evidenceDigest: c.evidence.evidenceDigest, generatedAt: c.evidence.generatedAt })) };
  const anchored = gateAt(dir, [...threeWindows().slice(0, 2), withHistory], policy({ requireLatestWindowIsLastClosed: false,
    historicalCycleMaxAgeDays: 28 }), "2026-10-20T00:00:00.000Z");
  const latest = anchored.selectedCycles.at(-1);
  assert.equal(latest.recency.anchorGeneratedAt, initial.evidence.generatedAt);
  assert.equal(latest.recency.governingAgeDays, 15);
  assert.equal(latest.recency.ageDaysFromGeneratedAt, 6);
  assert.equal(latest.recency.status, "failed");
  assert.equal(anchored.guarantees.historyProvenance.verified, false);
});

test("F: retained files can be stale evidence; expired retention does not change evidence age or remove files", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "p1v3-retention-"));
  const entries = threeWindows();
  const manifest = validatePackageManifest({ schemaVersion: OPERATIONAL_PACKAGE_SCHEMA_VERSION,
    packagedAt: "2026-10-12T00:00:00.000Z", scope: { tenantId: TENANT, workspaceId: WORKSPACE, domain: "billing" },
    codeProvenance: { scriptPath: "synthetic.ts", trackedInGit: false, scriptContentHash: "synthetic-hash" },
    transport: { mechanism: "manual_local_file" }, retentionExpiresAt: "2027-01-01T00:00:00.000Z" });
  const now = "2026-10-13T00:00:00.000Z";
  const result = gateAt(dir, entries, policy({ requireLatestWindowIsLastClosed: false }), now);
  assert.equal(checkRetention(manifest, new Date(now)).status, "within_retention");
  assert.equal(result.selectedCycles[0].recency.status, "failed");
  assert.equal(result.selectedCycles.at(-1).recency.status, "passed");
  const bytes = readFileSync(path.join(dir, "package.json"));
  assert.equal(checkRetention({ ...manifest, retentionExpiresAt: "2026-10-12T00:00:00.000Z" }, new Date(now)).status, "expired");
  assert.deepEqual(readFileSync(path.join(dir, "package.json")), bytes);
  assert.equal(result.gateEligibility.status, "not_approved");
});
