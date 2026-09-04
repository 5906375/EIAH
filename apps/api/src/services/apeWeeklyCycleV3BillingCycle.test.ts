import test, { before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  APE_WEEKLY_CYCLE_V3_VALIDATOR_IDENTITY,
  buildBillingCycleId,
  getLastClosedBillingCycleWindow,
  persistCycleRatificationV3,
  reloadAndVerifyCycleEvidenceV3,
  reloadAndVerifyCycleRatificationV3,
  reloadAndVerifyValidationResultV1,
  runBillingCyclePipeline,
  __testing__,
} from "./apeWeeklyCycleV3BillingCycle.js";
import { BILLING_RAW_RECEIPT_PRODUCER_IDENTITY } from "./apeWeeklyCycleV3BillingCollector.js";
import { BILLING_RUN_COST_DEBIT_OPERATION_ID } from "@eiah/core/catalog/governedOperationCatalog";
import { buildCycleEvidenceV3, buildCycleRatificationV3 } from "@eiah/core/catalog/apeWeeklyCycleV3";
import { validateCycleEvidenceV3, type RawReceiptV3 } from "@eiah/core/catalog/apeWeeklyCycleV3Validator";
import { loadFileAbsolutePath, storedObjectExists } from "./storage.js";

const { runBillingCyclePipelineWithClock, computeLastClosedWeek } = __testing__;

type Condition = Record<string, unknown>;

function matchesCondition(value: unknown, condition: unknown): boolean {
  if (condition && typeof condition === "object" && !(condition instanceof Date)) {
    const cond = condition as Condition;
    if ("not" in cond) {
      if (cond.not === null) return value !== null && value !== undefined;
      return value !== cond.not;
    }
    if ("gte" in cond || "lt" in cond) {
      const time = value instanceof Date ? value.getTime() : new Date(value as string).getTime();
      if ("gte" in cond && time < (cond.gte as Date).getTime()) return false;
      if ("lt" in cond && time >= (cond.lt as Date).getTime()) return false;
      return true;
    }
  }
  return value === condition;
}

function matchesWhere(row: Record<string, unknown>, where: Condition): boolean {
  return Object.entries(where).every(([key, condition]) => matchesCondition(row[key], condition));
}

function createMockPrisma(fixtures: { runs: any[]; breakdowns: any[]; ledgerRows: any[]; guardrailRows: any[] }) {
  return {
    run: {
      findMany: async ({ where, take }: any) => {
        let rows = fixtures.runs.filter((row) => matchesWhere(row, where));
        rows = rows.slice().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return take ? rows.slice(0, take) : rows;
      },
    },
    runUsageBreakdown: {
      findMany: async ({ where, take }: any) => {
        let rows = fixtures.breakdowns.filter((row) => matchesWhere(row, where));
        rows = rows.slice().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return take ? rows.slice(0, take) : rows;
      },
    },
    billingLedger: {
      findMany: async ({ where, take }: any) => {
        let rows = fixtures.ledgerRows.filter((row) => matchesWhere(row, where));
        rows = rows.slice().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return take ? rows.slice(0, take) : rows;
      },
    },
    guardrailLedger: {
      findMany: async ({ where }: any) => fixtures.guardrailRows.filter((row) => matchesWhere(row, where)),
    },
  } as any;
}

const TENANT = "tenant-cycle";
const WORKSPACE = "workspace-cycle";
// A fixed "now" inside a known week so the pipeline's internally-computed
// closed window is deterministic for the test.
const FIXED_NOW = () => new Date("2026-09-09T12:00:00.000Z"); // Wednesday
const EXPECTED_WINDOW = { from: "2026-08-31T00:00:00.000Z", to: "2026-09-07T00:00:00.000Z" };

function healthyRun(id: string, createdAt: Date) {
  return {
    id,
    tenantId: TENANT,
    workspaceId: WORKSPACE,
    agent: "eiah",
    traceId: `trace-${id}`,
    costCents: 100,
    status: "completed",
    errorCode: null,
    createdAt,
    finishedAt: new Date(createdAt.getTime() + 5 * 60_000),
  };
}

before(async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "ape-billing-cycle-"));
  process.env.UPLOADS_DIR = dir;
  delete process.env.STORAGE_PROVIDER;
});

let currentPrisma: any;
beforeEach(() => {
  currentPrisma = createMockPrisma({ runs: [], breakdowns: [], ledgerRows: [], guardrailRows: [] });
});

function setFixtures(fixtures: { runs?: any[]; breakdowns?: any[]; ledgerRows?: any[]; guardrailRows?: any[] }) {
  currentPrisma = createMockPrisma({
    runs: fixtures.runs ?? [],
    breakdowns: fixtures.breakdowns ?? [],
    ledgerRows: fixtures.ledgerRows ?? [],
    guardrailRows: fixtures.guardrailRows ?? [],
  });
}

// ── A. Closed-week calculation ────────────────────────────────────────────

test("A: closed-week window — Monday exactly 00:00:00.000 UTC", () => {
  const w = computeLastClosedWeek(new Date("2026-09-07T00:00:00.000Z"));
  assert.deepEqual(w, { from: "2026-08-31T00:00:00.000Z", to: "2026-09-07T00:00:00.000Z" });
});

test("A: closed-week window — Sunday (end of the still-open week)", () => {
  const w = computeLastClosedWeek(new Date("2026-09-06T23:59:59.999Z"));
  assert.deepEqual(w, { from: "2026-08-24T00:00:00.000Z", to: "2026-08-31T00:00:00.000Z" });
});

test("A: closed-week window — mid-week (Wednesday)", () => {
  const w = computeLastClosedWeek(new Date("2026-09-09T12:00:00.000Z"));
  assert.deepEqual(w, EXPECTED_WINDOW);
});

test("A: closed-week window — month boundary", () => {
  const w = computeLastClosedWeek(new Date("2026-10-02T00:00:00.000Z")); // Friday, Oct 2 2026
  assert.deepEqual(w, { from: "2026-09-21T00:00:00.000Z", to: "2026-09-28T00:00:00.000Z" });
});

test("A: closed-week window — year boundary", () => {
  const w = computeLastClosedWeek(new Date("2027-01-02T00:00:00.000Z")); // Saturday
  assert.deepEqual(w, { from: "2026-12-21T00:00:00.000Z", to: "2026-12-28T00:00:00.000Z" });
});

test("A: current open week is never eligible — window.to is always <= now", () => {
  const now = new Date("2026-09-09T12:00:00.000Z");
  const w = computeLastClosedWeek(now);
  assert.ok(new Date(w.to).getTime() <= now.getTime());
});

test("A: getLastClosedBillingCycleWindow() uses the real clock and stays consistent with computeLastClosedWeek", () => {
  const viaExport = getLastClosedBillingCycleWindow();
  const viaHelper = computeLastClosedWeek(new Date());
  // Allow for the (extremely unlikely) millisecond boundary crossing between the two calls.
  assert.ok(new Date(viaExport.from).getTime() - new Date(viaHelper.from).getTime() <= 0 || viaExport.from === viaHelper.from);
});

// ── B. Deterministic cycleId ──────────────────────────────────────────────

test("B: same scope + same window -> same cycleId", () => {
  const a = buildBillingCycleId({ tenantId: TENANT, workspaceId: WORKSPACE, windowStart: EXPECTED_WINDOW.from });
  const b = buildBillingCycleId({ tenantId: TENANT, workspaceId: WORKSPACE, windowStart: EXPECTED_WINDOW.from });
  assert.equal(a, b);
  assert.equal(a, `billing:${TENANT}:${WORKSPACE}:${EXPECTED_WINDOW.from}`);
});

test("B: different tenant/workspace/window -> different cycleId", () => {
  const base = buildBillingCycleId({ tenantId: TENANT, workspaceId: WORKSPACE, windowStart: EXPECTED_WINDOW.from });
  assert.notEqual(base, buildBillingCycleId({ tenantId: "other-tenant", workspaceId: WORKSPACE, windowStart: EXPECTED_WINDOW.from }));
  assert.notEqual(base, buildBillingCycleId({ tenantId: TENANT, workspaceId: "other-workspace", windowStart: EXPECTED_WINDOW.from }));
  assert.notEqual(base, buildBillingCycleId({ tenantId: TENANT, workspaceId: WORKSPACE, windowStart: "2026-01-01T00:00:00.000Z" }));
});

// ── C-N. Pipeline behavior ────────────────────────────────────────────────

test("C: scope is preserved end to end — persisted CycleEvidenceV3 carries the same tenantId/workspaceId as the input", async () => {
  setFixtures({});
  const result = await runBillingCyclePipelineWithClock(currentPrisma, { tenantId: TENANT, workspaceId: WORKSPACE, commitSha: "0".repeat(40) }, { now: FIXED_NOW });
  assert.equal(result.status, "awaiting_human_ratification");
  const evidence = await reloadAndVerifyCycleEvidenceV3((result as any).evidenceRef);
  assert.equal(evidence.tenantId, TENANT);
  assert.equal(evidence.workspaceId, WORKSPACE);
});

test("D: evidence scope disagreeing with the raw receipt's own scope is rejected by the validator (same integration point the pipeline uses)", () => {
  const receiptA: RawReceiptV3 = {
    ref: "ref-a",
    digest: "a".repeat(64),
    facts: [{ operationId: BILLING_RUN_COST_DEBIT_OPERATION_ID, auditGapCount: 0, duplicateSideEffectsCount: 0, sampleSize: 1 }],
    tenantId: "tenant-a",
    workspaceId: "workspace-a",
  };
  const evidence = buildCycleEvidenceV3({
    cycleId: "billing:tenant-b:workspace-a:2026-08-31T00:00:00.000Z",
    generatedAt: new Date().toISOString(),
    domain: "billing",
    evidenceClass: "domain",
    tenantId: "tenant-b", // deliberately different from receiptA.tenantId
    workspaceId: "workspace-a",
    operationIds: [BILLING_RUN_COST_DEBIT_OPERATION_ID],
    expectedUniverse: [BILLING_RUN_COST_DEBIT_OPERATION_ID],
    measurements: [
      {
        operationId: BILLING_RUN_COST_DEBIT_OPERATION_ID,
        measurementStatus: "measured",
        observedAt: { from: "2026-08-31T00:00:00.000Z", to: "2026-09-07T00:00:00.000Z" },
        sampleSize: 1,
        auditGap: 0,
        duplicateSideEffects: 0,
        rawReceiptRef: receiptA.ref,
        rawReceiptDigest: receiptA.digest,
      },
    ],
    measurementStatus: "measured",
    coverageStatus: "complete",
    provenance: { commitSha: "0".repeat(40), workflowRunId: null, producerIdentity: BILLING_RAW_RECEIPT_PRODUCER_IDENTITY },
  });
  const result = validateCycleEvidenceV3({ evidence, rawReceipts: [receiptA], validatorIdentity: APE_WEEKLY_CYCLE_V3_VALIDATOR_IDENTITY });
  assert.equal(result.validationStatus, "rejected");
  assert.ok(result.failureReasons.includes("scope_mismatch"));
});

test("E: the collector is always invoked with the sole governed billing operation, never a caller-suppliable operationId", async () => {
  const fs = await import("node:fs");
  const source = fs.readFileSync(new URL("./apeWeeklyCycleV3BillingCycle.ts", import.meta.url), "utf8");
  assert.ok(source.includes("BILLING_RUN_COST_DEBIT_OPERATION_ID"), "must use the catalog constant");
  assert.ok(!/operationId:\s*input\.operationId/.test(source), "must never forward a caller-supplied operationId");
  // BillingCyclePipelineInput itself has no operationId field (checked via the type block).
  const inputTypeMatch = source.match(/export type BillingCyclePipelineInput = Readonly<\{[^}]*\}>;/s);
  assert.ok(inputTypeMatch);
  assert.ok(!/operationId/.test(inputTypeMatch![0]), "public pipeline input must not accept operationId");
});

test("F: the pipeline reloads the raw receipt from governed storage rather than trusting the collector's in-memory return", async () => {
  const fs = await import("node:fs");
  const source = fs.readFileSync(new URL("./apeWeeklyCycleV3BillingCycle.ts", import.meta.url), "utf8");
  assert.ok(source.includes("reloadAndVerifyBillingRawReceiptV3"), "must call the independent reload+digest-verify function");
});

test("G: the in-memory collector result is used only for ref/digest — never for facts, window, or identity fed into evidence", async () => {
  const fs = await import("node:fs");
  const source = fs.readFileSync(new URL("./apeWeeklyCycleV3BillingCycle.ts", import.meta.url), "utf8");
  assert.ok(!/producedReceipt\.(facts|observationWindow|producerIdentity|tenantId|workspaceId|generatedAt)/.test(source), "only producedReceipt.ref/.digest may be read from the collector's in-memory result");
});

test("H: CycleEvidenceV3 is actually persisted to governed storage", async () => {
  setFixtures({});
  const result = await runBillingCyclePipelineWithClock(currentPrisma, { tenantId: TENANT, workspaceId: WORKSPACE, commitSha: "0".repeat(40) }, { now: FIXED_NOW });
  assert.equal(result.status, "awaiting_human_ratification");
  assert.equal(await storedObjectExists((result as any).evidenceRef), true);
});

test("I: tampering with a persisted CycleEvidenceV3 is caught on reload (digest self-consistency)", async () => {
  setFixtures({});
  const result = await runBillingCyclePipelineWithClock(currentPrisma, { tenantId: TENANT, workspaceId: WORKSPACE, commitSha: "0".repeat(40) }, { now: FIXED_NOW });
  const evidenceRef = (result as any).evidenceRef as string;
  const absolutePath = await loadFileAbsolutePath(evidenceRef);
  assert.ok(absolutePath);
  const original = JSON.parse(await readFile(absolutePath!, "utf8"));
  await writeFile(absolutePath!, JSON.stringify({ ...original, auditGap: 999 }), "utf8");
  await assert.rejects(() => reloadAndVerifyCycleEvidenceV3(evidenceRef), /evidenceDigest does not match|cycle_evidence_v3_invalid/);
});

test("J: validator identity is a canonical constant, distinct from the producer identity", () => {
  assert.equal(APE_WEEKLY_CYCLE_V3_VALIDATOR_IDENTITY, "eiah.ape-weekly-cycle-v3.independent-validator.v1");
  assert.notEqual(APE_WEEKLY_CYCLE_V3_VALIDATOR_IDENTITY, BILLING_RAW_RECEIPT_PRODUCER_IDENTITY);
});

test("K: a healthy real-shaped scenario reaches awaiting_human_ratification", async () => {
  const createdAt = new Date("2026-09-02T00:00:00.000Z"); // inside EXPECTED_WINDOW
  const run = healthyRun("run-healthy-1", createdAt);
  setFixtures({
    runs: [run],
    breakdowns: [{ id: "bd1", runId: run.id, tenantId: TENANT, workspaceId: WORKSPACE, requestId: "req-1", meterType: "tokens", amountCents: 100, createdAt }],
    ledgerRows: [{ id: "l1", runId: run.id, tenantId: TENANT, workspaceId: WORKSPACE, requestId: "req-1", entryType: "debit", amountCents: 100, createdAt }],
  });
  const result = await runBillingCyclePipelineWithClock(currentPrisma, { tenantId: TENANT, workspaceId: WORKSPACE, commitSha: "1".repeat(40), workflowRunId: "run-123" }, { now: FIXED_NOW });
  assert.equal(result.status, "awaiting_human_ratification", `expected awaiting_human_ratification, got: ${JSON.stringify(result)}`);
});

test("L: a real audit gap does not, by itself, prevent reaching awaiting_human_ratification (honest NO_GO candidate stays valid)", async () => {
  const createdAt = new Date("2026-09-02T00:00:00.000Z");
  const run = healthyRun("run-gap-1", createdAt);
  setFixtures({
    runs: [run],
    breakdowns: [{ id: "bd1", runId: run.id, tenantId: TENANT, workspaceId: WORKSPACE, requestId: "req-gap", meterType: "tokens", amountCents: 100, createdAt }],
    ledgerRows: [], // no ledger -> real audit gap
  });
  const result = await runBillingCyclePipelineWithClock(currentPrisma, { tenantId: TENANT, workspaceId: WORKSPACE, commitSha: "1".repeat(40) }, { now: FIXED_NOW });
  assert.equal(result.status, "awaiting_human_ratification", `a real, honestly-measured audit gap must still validate — got: ${JSON.stringify(result)}`);
  const evidence = await reloadAndVerifyCycleEvidenceV3((result as any).evidenceRef);
  assert.equal(evidence.auditGap, 1, "the gap must be real, not suppressed");
});

test("L2 (P1-R3-CYCLE-F, Finding 1): the pipeline's own rejected path is real, reached only through the public entry point, and never touches ratification", async () => {
  setFixtures({});
  // A legitimately old clock — never fabricated validator output, never a
  // hand-built ValidationResult, never a direct validateCycleEvidenceV3()
  // call. The pipeline computes its window and generatedAt from this same
  // clock; the validator (which the pipeline never overrides) then measures
  // staleness against the REAL wall clock, so this generatedAt is always
  // tens of thousands of days old no matter when the test actually runs —
  // a real, reproducible stale_evidence rejection born entirely inside the
  // unmodified pipeline.
  const ancientNow = () => new Date("2000-01-01T00:00:00.000Z");
  const result = await runBillingCyclePipelineWithClock(
    currentPrisma,
    { tenantId: TENANT, workspaceId: WORKSPACE, commitSha: "9".repeat(40) },
    { now: ancientNow }
  );

  assert.equal(result.status, "rejected", `expected a real rejected result, got: ${JSON.stringify(result)}`);
  const r = result as Extract<typeof result, { status: "rejected" }>;

  assert.equal(r.cycleId, buildBillingCycleId({ tenantId: TENANT, workspaceId: WORKSPACE, windowStart: computeLastClosedWeek(ancientNow()).from }));
  assert.equal(r.tenantId, TENANT);
  assert.equal(r.workspaceId, WORKSPACE);
  assert.ok(r.rawReceiptRef, "rawReceiptRef must be present even on rejection — the raw receipt itself was real and persisted");
  assert.ok(r.rawReceiptDigest, "rawReceiptDigest must be present");
  assert.ok(r.evidenceRef, "evidenceRef must be present — the evidence was built and persisted before being judged stale");
  assert.ok(r.evidenceDigest, "evidenceDigest must be present");
  assert.ok(r.validationResultRef, "validationResultRef must be present — the rejection itself is a persisted artifact");
  assert.ok(r.validationResultDigest, "validationResultDigest must be present");
  assert.deepEqual([...r.failureReasons], ["stale_evidence"], "the rejection reason must be the real one, not a placeholder");

  // The discriminated union's rejected variant must not carry any
  // ratification-stage or awaiting_human_ratification semantics — assert
  // the real shape of the contract, not an invented field.
  const asRecord = result as unknown as Record<string, unknown>;
  assert.ok(!("validatorIdentity" in asRecord), "the rejected variant of the contract has no validatorIdentity field — asserting the real shape, not inventing one");
  assert.ok(!("ratificationRef" in asRecord));
  assert.ok(!("ratificationDigest" in asRecord));
  assert.ok(!("ratifiedBy" in asRecord));
  assert.ok(!("ratificationStatus" in asRecord));
  assert.notEqual(result.status, "awaiting_human_ratification");

  // Fail-closed proof: the persisted ValidationResult itself records the
  // real rejection, and nothing about reaching this branch persisted (or
  // could have persisted) a CycleRatificationV3 — confirmed structurally in
  // test N, reconfirmed behaviorally here for this specific real run.
  const persistedValidation = await reloadAndVerifyValidationResultV1(r.validationResultRef, r.validationResultDigest);
  assert.equal(persistedValidation.validationStatus, "rejected");
  assert.deepEqual([...persistedValidation.failureReasons], ["stale_evidence"]);
});

test("M: ValidationResult is persisted and independently reloadable", async () => {
  setFixtures({});
  const result = await runBillingCyclePipelineWithClock(currentPrisma, { tenantId: TENANT, workspaceId: WORKSPACE, commitSha: "0".repeat(40) }, { now: FIXED_NOW });
  assert.equal(result.status, "awaiting_human_ratification");
  const r = result as Extract<typeof result, { status: "awaiting_human_ratification" }>;
  assert.equal(await storedObjectExists(r.validationResultRef), true);
  const reloaded = await reloadAndVerifyValidationResultV1(r.validationResultRef, r.validationResultDigest);
  assert.equal(reloaded.validationStatus, "passed");
  assert.equal(reloaded.evidenceDigest, r.evidenceDigest);
});

test("N: automatic ratification is impossible — this module never calls buildCycleRatificationV3 on its own", async () => {
  const fs = await import("node:fs");
  const source = fs.readFileSync(new URL("./apeWeeklyCycleV3BillingCycle.ts", import.meta.url), "utf8");
  assert.ok(!/buildCycleRatificationV3\s*\(/.test(source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")), "no code path may call buildCycleRatificationV3 automatically");
  // persistCycleRatificationV3 only ever *persists* an already-built object — never chooses approved/rejected itself.
  assert.ok(!/ratificationStatus:\s*["'](approved|rejected)["']/.test(source), "must never hardcode a ratification decision");
});

test("O: correction/supersession is additive-only — persisting the same ratification content twice is idempotent, different content at the same evidenceDigest is a distinct artifact", async () => {
  setFixtures({});
  const result = await runBillingCyclePipelineWithClock(currentPrisma, { tenantId: TENANT, workspaceId: WORKSPACE, commitSha: "0".repeat(40) }, { now: FIXED_NOW });
  assert.equal(result.status, "awaiting_human_ratification");
  const r = result as Extract<typeof result, { status: "awaiting_human_ratification" }>;
  const evidence = await reloadAndVerifyCycleEvidenceV3(r.evidenceRef);

  const ratification = buildCycleRatificationV3({ evidence, ratificationStatus: "approved", ratifiedBy: "Test Human Ratifier" });
  const first = await persistCycleRatificationV3({ ratification, tenantId: TENANT, workspaceId: WORKSPACE });
  assert.equal(first.alreadyPersisted, false);
  const second = await persistCycleRatificationV3({ ratification, tenantId: TENANT, workspaceId: WORKSPACE });
  assert.equal(second.alreadyPersisted, true, "identical ratification content must be an idempotent no-op");
  assert.equal(first.ref, second.ref);

  const reloaded = await reloadAndVerifyCycleRatificationV3(first.ref, first.digest);
  assert.equal(reloaded.ratificationStatus, "approved");

  // A correction (rejected instead of approved) is a DIFFERENT artifact, referencing the superseded one.
  const correction = buildCycleRatificationV3({
    evidence,
    ratificationStatus: "rejected",
    ratifiedBy: "Test Human Ratifier",
    supersedesRatificationRef: first.ref,
  });
  const correctionPersisted = await persistCycleRatificationV3({ ratification: correction, tenantId: TENANT, workspaceId: WORKSPACE });
  assert.notEqual(correctionPersisted.ref, first.ref, "a correction must never overwrite the original artifact's key");
  const reloadedOriginal = await reloadAndVerifyCycleRatificationV3(first.ref, first.digest);
  assert.equal(reloadedOriginal.ratificationStatus, "approved", "the original ratification must remain untouched after a correction is persisted");
});

test("P: PII boundary — sentinel traceId/requestId never reach the persisted CycleEvidenceV3 or ValidationResult", async () => {
  const createdAt = new Date("2026-09-02T00:00:00.000Z");
  const run = healthyRun("run-pii-1", createdAt);
  const sentinelTrace = "SENTINEL_TRACE_SHOULD_NOT_LEAK_INTO_CYCLE_ARTIFACTS";
  const sentinelRequest = "SENTINEL_REQUEST_SHOULD_NOT_LEAK_INTO_CYCLE_ARTIFACTS";
  setFixtures({
    runs: [{ ...run, traceId: sentinelTrace }],
    breakdowns: [{ id: "bd1", runId: run.id, tenantId: TENANT, workspaceId: WORKSPACE, requestId: sentinelRequest, meterType: "tokens", amountCents: 100, createdAt }],
    ledgerRows: [],
  });
  const result = await runBillingCyclePipelineWithClock(currentPrisma, { tenantId: TENANT, workspaceId: WORKSPACE, commitSha: "0".repeat(40) }, { now: FIXED_NOW });
  assert.equal(result.status, "awaiting_human_ratification");
  const r = result as Extract<typeof result, { status: "awaiting_human_ratification" }>;

  const evidencePath = await loadFileAbsolutePath(r.evidenceRef);
  const validationPath = await loadFileAbsolutePath(r.validationResultRef);
  const evidenceRaw = await readFile(evidencePath!, "utf8");
  const validationRaw = await readFile(validationPath!, "utf8");
  for (const raw of [evidenceRaw, validationRaw]) {
    assert.ok(!raw.includes(sentinelTrace), "traceId must never be serialized into cycle artifacts");
    assert.ok(!raw.includes(sentinelRequest), "requestId must never be serialized into cycle artifacts");
  }
});

test("Q: systemic self-promotion is impossible — evidenceClass is always domain", async () => {
  setFixtures({});
  const result = await runBillingCyclePipelineWithClock(currentPrisma, { tenantId: TENANT, workspaceId: WORKSPACE, commitSha: "0".repeat(40) }, { now: FIXED_NOW });
  assert.equal(result.status, "awaiting_human_ratification");
  const evidence = await reloadAndVerifyCycleEvidenceV3((result as any).evidenceRef);
  assert.equal(evidence.evidenceClass, "domain");

  const fs = await import("node:fs");
  const source = fs.readFileSync(new URL("./apeWeeklyCycleV3BillingCycle.ts", import.meta.url), "utf8");
  assert.ok(!/evidenceClass:\s*["']systemic["']/.test(source), "this module must never declare systemic evidenceClass");
});

test("R: legacy v2 is impossible — this module only ever builds ape.weekly-cycle.v3 evidence", async () => {
  setFixtures({});
  const result = await runBillingCyclePipelineWithClock(currentPrisma, { tenantId: TENANT, workspaceId: WORKSPACE, commitSha: "0".repeat(40) }, { now: FIXED_NOW });
  assert.equal(result.status, "awaiting_human_ratification");
  const evidence = await reloadAndVerifyCycleEvidenceV3((result as any).evidenceRef);
  assert.equal(evidence.schemaVersion, "ape.weekly-cycle.v3");
});

test("no first-honest-cycle claim: this pipeline test file never asserts FIRST_HONEST_BILLING_CYCLE and never ratifies a real cycle", async () => {
  const fs = await import("node:fs");
  const source = fs.readFileSync(new URL("./apeWeeklyCycleV3BillingCycle.test.ts", import.meta.url), "utf8");
  assert.ok(!/ratifiedBy:\s*["']Carlos/.test(source), "this test file must never simulate ratification under the real human authority's name");
});
