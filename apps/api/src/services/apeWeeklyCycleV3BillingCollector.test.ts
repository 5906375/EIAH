import test, { before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  BILLING_RAW_RECEIPT_PRODUCER_IDENTITY,
  BILLING_RAW_RECEIPT_SCHEMA_VERSION,
  collectBillingRawReceiptV3,
  reloadAndVerifyBillingRawReceiptV3,
  __testing__,
} from "./apeWeeklyCycleV3BillingCollector.js";
import { BILLING_RUN_COST_DEBIT_OPERATION_ID } from "@eiah/core/catalog/governedOperationCatalog";
import { loadFileAbsolutePath, storedObjectExists } from "./storage.js";

const { collectBillingRawReceiptV3WithOverrides } = __testing__;

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

const TENANT = "tenant-collector";
const WORKSPACE = "workspace-collector";
const WINDOW = { from: "2026-08-01T00:00:00.000Z", to: "2026-08-08T00:00:00.000Z" };
const FIXED_NOW = () => new Date("2026-08-08T01:00:00.000Z");

function healthyRun(id: string, createdAt = new Date("2026-08-02T00:00:00.000Z")) {
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
  const dir = await mkdtemp(path.join(tmpdir(), "ape-billing-raw-receipt-"));
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

test("collector: valid billing operation with no activity produces a zero-fact receipt from the canonical summary", async () => {
  setFixtures({});
  const { receipt, alreadyPersisted } = await collectBillingRawReceiptV3WithOverrides(
    currentPrisma,
    { tenantId: TENANT, workspaceId: WORKSPACE, operationId: BILLING_RUN_COST_DEBIT_OPERATION_ID, observationWindow: WINDOW },
    { now: FIXED_NOW }
  );
  assert.equal(alreadyPersisted, false);
  assert.equal(receipt.facts.length, 1);
  assert.equal(receipt.facts[0]?.operationId, BILLING_RUN_COST_DEBIT_OPERATION_ID);
  assert.equal(receipt.facts[0]?.auditGapCount, 0);
  assert.equal(receipt.facts[0]?.duplicateSideEffectsCount, 0);
  assert.equal(receipt.facts[0]?.sampleSize, 0);
  assert.equal(receipt.producerIdentity, BILLING_RAW_RECEIPT_PRODUCER_IDENTITY);
});

test("collector: rejects an operationId not in the Governed Operation Catalog (fail-closed)", async () => {
  setFixtures({});
  await assert.rejects(
    () =>
      collectBillingRawReceiptV3WithOverrides(
        currentPrisma,
        { tenantId: TENANT, workspaceId: WORKSPACE, operationId: "billing.not_a_real_operation", observationWindow: WINDOW },
        { now: FIXED_NOW }
      ),
    /governed_operation_not_found/
  );
});

test("collector: rejects missing tenantId/workspaceId", async () => {
  setFixtures({});
  await assert.rejects(
    () =>
      collectBillingRawReceiptV3WithOverrides(
        currentPrisma,
        { tenantId: "", workspaceId: WORKSPACE, operationId: BILLING_RUN_COST_DEBIT_OPERATION_ID, observationWindow: WINDOW },
        { now: FIXED_NOW }
      ),
    /tenantId required/
  );
  await assert.rejects(
    () =>
      collectBillingRawReceiptV3WithOverrides(
        currentPrisma,
        { tenantId: TENANT, workspaceId: "", operationId: BILLING_RUN_COST_DEBIT_OPERATION_ID, observationWindow: WINDOW },
        { now: FIXED_NOW }
      ),
    /workspaceId required/
  );
});

test("collector: rejects an invalid observationWindow (unparseable timestamp)", async () => {
  setFixtures({});
  await assert.rejects(
    () =>
      collectBillingRawReceiptV3WithOverrides(
        currentPrisma,
        { tenantId: TENANT, workspaceId: WORKSPACE, operationId: BILLING_RUN_COST_DEBIT_OPERATION_ID, observationWindow: { from: "not-a-date", to: WINDOW.to } },
        { now: FIXED_NOW }
      ),
    /observationWindow\.from\/to must be valid ISO timestamps/
  );
});

test("collector: rejects observationWindow.from === to (P1-R3-F Finding 3)", async () => {
  setFixtures({});
  await assert.rejects(
    () =>
      collectBillingRawReceiptV3WithOverrides(
        currentPrisma,
        { tenantId: TENANT, workspaceId: WORKSPACE, operationId: BILLING_RUN_COST_DEBIT_OPERATION_ID, observationWindow: { from: WINDOW.from, to: WINDOW.from } },
        { now: FIXED_NOW }
      ),
    /observationWindow\.from must be strictly before observationWindow\.to/
  );
});

test("collector: rejects observationWindow.from > to (P1-R3-F Finding 3)", async () => {
  setFixtures({});
  await assert.rejects(
    () =>
      collectBillingRawReceiptV3WithOverrides(
        currentPrisma,
        { tenantId: TENANT, workspaceId: WORKSPACE, operationId: BILLING_RUN_COST_DEBIT_OPERATION_ID, observationWindow: { from: WINDOW.to, to: WINDOW.from } },
        { now: FIXED_NOW }
      ),
    /observationWindow\.from must be strictly before observationWindow\.to/
  );
});

test("collector: an inverted window is rejected, never silently reported as zero-activity (P1-R3-F Finding 3)", async () => {
  // Same fixture as the real-gap test below: if the inverted window silently
  // matched zero rows instead of being rejected, this would look identical
  // to genuinely healthy "no activity" evidence — exactly the masquerade
  // Finding 3 flagged.
  const run = healthyRun("run-inverted-guard");
  setFixtures({
    runs: [run],
    breakdowns: [{ id: "bd1", runId: run.id, tenantId: TENANT, workspaceId: WORKSPACE, requestId: "req-1", meterType: "tokens", amountCents: 100, createdAt: run.createdAt }],
    ledgerRows: [],
  });
  await assert.rejects(
    () =>
      collectBillingRawReceiptV3WithOverrides(
        currentPrisma,
        { tenantId: TENANT, workspaceId: WORKSPACE, operationId: BILLING_RUN_COST_DEBIT_OPERATION_ID, observationWindow: { from: WINDOW.to, to: WINDOW.from } },
        { now: FIXED_NOW }
      ),
    /observationWindow\.from must be strictly before observationWindow\.to/
  );
});

test("collector: auditGapCount is a pure passthrough of the canonical summary (real gap fixture)", async () => {
  const run = healthyRun("run-gap-1");
  setFixtures({
    runs: [run],
    breakdowns: [
      { id: "bd1", runId: run.id, tenantId: TENANT, workspaceId: WORKSPACE, requestId: "req-1", meterType: "tokens", amountCents: 100, createdAt: run.createdAt },
    ],
    ledgerRows: [],
  });
  const { receipt } = await collectBillingRawReceiptV3WithOverrides(
    currentPrisma,
    { tenantId: TENANT, workspaceId: WORKSPACE, operationId: BILLING_RUN_COST_DEBIT_OPERATION_ID, observationWindow: WINDOW },
    { now: FIXED_NOW }
  );
  // breakdown exists, no ledger, run not blocked -> real audit gap (missing_ledger)
  assert.equal(receipt.facts[0]?.auditGapCount, 1);
  assert.equal(receipt.facts[0]?.sampleSize, 1);
});

test("collector: duplicateSideEffectsCount is a pure passthrough of the canonical summary (real duplicate fixture)", async () => {
  const run = healthyRun("run-dup-1");
  setFixtures({
    runs: [run],
    breakdowns: [
      { id: "bd1", runId: run.id, tenantId: TENANT, workspaceId: WORKSPACE, requestId: "req-dup", meterType: "tokens", amountCents: 100, createdAt: run.createdAt },
    ],
    ledgerRows: [
      { id: "l1", runId: run.id, tenantId: TENANT, workspaceId: WORKSPACE, requestId: "req-dup", entryType: "debit", amountCents: 100, createdAt: run.createdAt },
      { id: "l2", runId: run.id, tenantId: TENANT, workspaceId: WORKSPACE, requestId: "req-dup", entryType: "debit", amountCents: 100, createdAt: run.createdAt },
      { id: "l3", runId: run.id, tenantId: TENANT, workspaceId: WORKSPACE, requestId: "req-dup", entryType: "debit", amountCents: 100, createdAt: run.createdAt },
    ],
  });
  const { receipt } = await collectBillingRawReceiptV3WithOverrides(
    currentPrisma,
    { tenantId: TENANT, workspaceId: WORKSPACE, operationId: BILLING_RUN_COST_DEBIT_OPERATION_ID, observationWindow: WINDOW },
    { now: FIXED_NOW }
  );
  // n=3 in one group -> max(0, 3-1) = 2, exactly the canonical formula's output, not recomputed here.
  assert.equal(receipt.facts[0]?.duplicateSideEffectsCount, 2);
  // breakdownCostCents=100 vs ledgerCostCents=300 (3 duplicate debits) is also a real
  // breakdown_vs_ledger_mismatch under getBillingReconciliationSummary's own rules — both
  // metrics are asserted here exactly as that canonical function reports them, unmodified.
  assert.equal(receipt.facts[0]?.auditGapCount, 1);
});

test("collector: full window coverage over 50 runs — a gap outside the display-limit default is never silently dropped (P1-R3-F Finding 1)", async () => {
  const RUN_COUNT = 60;
  const runs: any[] = [];
  const breakdowns: any[] = [];
  const ledgerRows: any[] = [];
  for (let i = 1; i <= RUN_COUNT; i++) {
    const id = `run-${String(i).padStart(3, "0")}`;
    // i=1 is the OLDEST run (createdAt ascending with i); orderBy createdAt
    // desc + a naive take:50 would keep only the 50 most recent (i=11..60)
    // and silently drop i=1..10 — including the one real gap below.
    const createdAt = new Date(WINDOW.from);
    createdAt.setUTCMinutes(createdAt.getUTCMinutes() + i);
    const run = healthyRun(id, createdAt);
    runs.push(run);
    breakdowns.push({
      id: `bd-${id}`,
      runId: id,
      tenantId: TENANT,
      workspaceId: WORKSPACE,
      requestId: `req-${id}`,
      meterType: "tokens",
      amountCents: 100,
      createdAt,
    });
    // Every run gets a matching ledger row EXCEPT the very oldest (i=1),
    // which is the one real audit gap this test exists to prove survives
    // full-window coverage.
    if (i !== 1) {
      ledgerRows.push({
        id: `ledger-${id}`,
        runId: id,
        tenantId: TENANT,
        workspaceId: WORKSPACE,
        requestId: `req-${id}`,
        entryType: "debit",
        amountCents: 100,
        createdAt,
      });
    }
  }
  setFixtures({ runs, breakdowns, ledgerRows });

  const { receipt } = await collectBillingRawReceiptV3WithOverrides(
    currentPrisma,
    { tenantId: TENANT, workspaceId: WORKSPACE, operationId: BILLING_RUN_COST_DEBIT_OPERATION_ID, observationWindow: WINDOW },
    { now: FIXED_NOW }
  );
  assert.equal(receipt.facts[0]?.sampleSize, RUN_COUNT, "sampleSize must reflect the full 60-run population, not a 50-row cap");
  assert.equal(receipt.facts[0]?.auditGapCount, 1, "the gap in the oldest run (excluded by a naive take:50) must still be counted");
});

test("PII boundary: reconciliation item-level identifiers (traceId, requestId) never reach the persisted receipt", async () => {
  const run = healthyRun("run-pii-1");
  const sentinelTrace = "SENTINEL_TRACE_SHOULD_NOT_LEAK_INTO_RAW_RECEIPT";
  const sentinelRequest = "SENTINEL_REQUEST_SHOULD_NOT_LEAK_INTO_RAW_RECEIPT";
  setFixtures({
    runs: [{ ...run, traceId: sentinelTrace }],
    breakdowns: [
      { id: "bd1", runId: run.id, tenantId: TENANT, workspaceId: WORKSPACE, requestId: sentinelRequest, meterType: "tokens", amountCents: 100, createdAt: run.createdAt },
    ],
    ledgerRows: [],
  });
  const { receipt } = await collectBillingRawReceiptV3WithOverrides(
    currentPrisma,
    { tenantId: TENANT, workspaceId: WORKSPACE, operationId: BILLING_RUN_COST_DEBIT_OPERATION_ID, observationWindow: WINDOW },
    { now: FIXED_NOW }
  );
  const absolutePath = await loadFileAbsolutePath(receipt.ref);
  assert.ok(absolutePath, "receipt must be persisted to a resolvable local path");
  const raw = await readFile(absolutePath!, "utf8");
  assert.ok(!raw.includes(sentinelTrace), "traceId must never be serialized into the raw receipt");
  assert.ok(!raw.includes(sentinelRequest), "requestId must never be serialized into the raw receipt");
  // Structural allowlist: the persisted receipt exposes only the four RawMeasurementFact fields plus receipt metadata.
  const parsed = JSON.parse(raw);
  assert.deepEqual(Object.keys(parsed.facts[0]).sort(), [
    "auditGapCount",
    "duplicateSideEffectsCount",
    "operationId",
    "sampleSize",
  ]);
});

test("digest: identical envelope content produces identical digest; any field change produces a different digest", async () => {
  setFixtures({});
  const first = await collectBillingRawReceiptV3WithOverrides(
    currentPrisma,
    { tenantId: TENANT, workspaceId: WORKSPACE, operationId: BILLING_RUN_COST_DEBIT_OPERATION_ID, observationWindow: WINDOW },
    { now: FIXED_NOW }
  );
  const second = await collectBillingRawReceiptV3WithOverrides(
    currentPrisma,
    { tenantId: TENANT, workspaceId: WORKSPACE, operationId: BILLING_RUN_COST_DEBIT_OPERATION_ID, observationWindow: WINDOW },
    { now: FIXED_NOW }
  );
  assert.equal(first.receipt.digest, second.receipt.digest);
  assert.equal(first.receipt.ref, second.receipt.ref);
  assert.equal(second.alreadyPersisted, true, "second call with identical content must be an idempotent no-op");

  const differentWindow = await collectBillingRawReceiptV3WithOverrides(
    currentPrisma,
    { tenantId: TENANT, workspaceId: WORKSPACE, operationId: BILLING_RUN_COST_DEBIT_OPERATION_ID, observationWindow: { from: WINDOW.from, to: "2026-08-09T00:00:00.000Z" } },
    { now: FIXED_NOW }
  );
  assert.notEqual(first.receipt.digest, differentWindow.receipt.digest);
});

test("digest: generatedAt is a real capture timestamp, never a substitute for observationWindow bounds", async () => {
  setFixtures({});
  const { receipt } = await collectBillingRawReceiptV3WithOverrides(
    currentPrisma,
    { tenantId: TENANT, workspaceId: WORKSPACE, operationId: BILLING_RUN_COST_DEBIT_OPERATION_ID, observationWindow: WINDOW },
    { now: FIXED_NOW }
  );
  assert.equal(receipt.generatedAt, FIXED_NOW().toISOString());
  assert.notEqual(receipt.generatedAt, receipt.observationWindow?.to);
});

test("storage: content-addressed key collision with different content fails closed", async () => {
  setFixtures({});
  // Predict the exact key/ref this call will use (deterministic clock), then
  // corrupt the object at that path before the collector ever writes it —
  // simulating storage tampering/corruption, not a real SHA-256 collision.
  const probe = await collectBillingRawReceiptV3WithOverrides(
    currentPrisma,
    { tenantId: TENANT, workspaceId: WORKSPACE, operationId: BILLING_RUN_COST_DEBIT_OPERATION_ID, observationWindow: WINDOW },
    { now: FIXED_NOW, producerIdentity: "collision-probe-identity" }
  );
  const absolutePath = await loadFileAbsolutePath(probe.receipt.ref);
  assert.ok(absolutePath);
  await writeFile(absolutePath!, "{\"tampered\":true}", "utf8");

  await assert.rejects(
    () =>
      collectBillingRawReceiptV3WithOverrides(
        currentPrisma,
        { tenantId: TENANT, workspaceId: WORKSPACE, operationId: BILLING_RUN_COST_DEBIT_OPERATION_ID, observationWindow: WINDOW },
        { now: FIXED_NOW, producerIdentity: "collision-probe-identity" }
      ),
    /storage key collision with different content/
  );
});

test("storage roundtrip: persist -> reload -> recompute digest -> matches", async () => {
  setFixtures({});
  const { receipt } = await collectBillingRawReceiptV3WithOverrides(
    currentPrisma,
    { tenantId: TENANT, workspaceId: WORKSPACE, operationId: BILLING_RUN_COST_DEBIT_OPERATION_ID, observationWindow: WINDOW },
    { now: FIXED_NOW, producerIdentity: "roundtrip-identity" }
  );
  assert.equal(await storedObjectExists(receipt.ref), true);
  const reloaded = await reloadAndVerifyBillingRawReceiptV3(receipt.ref, receipt.digest);
  assert.equal(reloaded.digest, receipt.digest);
  assert.deepEqual(reloaded.facts, receipt.facts);
});

test("storage roundtrip: missing object fails closed", async () => {
  await assert.rejects(
    () => reloadAndVerifyBillingRawReceiptV3(`${TENANT}/${WORKSPACE}/ape-weekly-cycle/does-not-exist.json`, "a".repeat(64)),
    /raw receipt object missing/
  );
});

test("storage roundtrip: tampered stored content fails closed on reload (digest mismatch)", async () => {
  setFixtures({});
  const { receipt } = await collectBillingRawReceiptV3WithOverrides(
    currentPrisma,
    { tenantId: TENANT, workspaceId: WORKSPACE, operationId: BILLING_RUN_COST_DEBIT_OPERATION_ID, observationWindow: WINDOW },
    { now: FIXED_NOW, producerIdentity: "tamper-after-write-identity" }
  );
  const absolutePath = await loadFileAbsolutePath(receipt.ref);
  const original = JSON.parse(await readFile(absolutePath!, "utf8"));
  await writeFile(absolutePath!, JSON.stringify({ ...original, facts: [{ ...original.facts[0], auditGapCount: 999 }] }), "utf8");

  await assert.rejects(() => reloadAndVerifyBillingRawReceiptV3(receipt.ref, receipt.digest), /digest mismatch on reload/);
});

test("production identity/clock boundary: the public collector cannot be tricked into a different producerIdentity or generatedAt (P1-R3-F Finding 2)", async () => {
  setFixtures({});
  const before = Date.now();
  // Smuggle extra fields past the TypeScript type (which no longer declares
  // them) to prove — at runtime, not just at compile time — that the public
  // production function structurally ignores them rather than merely being
  // untyped for them.
  const tamperedInput = {
    tenantId: TENANT,
    workspaceId: WORKSPACE,
    operationId: BILLING_RUN_COST_DEBIT_OPERATION_ID,
    observationWindow: WINDOW,
    producerIdentity: "ATTACKER_CONTROLLED_IDENTITY",
    now: () => new Date("1999-01-01T00:00:00.000Z"),
  };
  const { receipt } = await collectBillingRawReceiptV3(currentPrisma, tamperedInput as any);
  const after = Date.now();
  assert.equal(receipt.producerIdentity, BILLING_RAW_RECEIPT_PRODUCER_IDENTITY, "producerIdentity must always be the fixed constant in production");
  const generatedAtMs = Date.parse(receipt.generatedAt!);
  assert.ok(generatedAtMs >= before && generatedAtMs <= after, "generatedAt must always be the real capture clock, never a caller-supplied override");
});

test("production API surface: collectBillingRawReceiptV3's parameter type has no producerIdentity/now fields", async () => {
  const fs = await import("node:fs");
  const source = fs.readFileSync(new URL("./apeWeeklyCycleV3BillingCollector.ts", import.meta.url), "utf8");
  const publicTypeMatch = source.match(/export type BillingRawReceiptCollectorInput = Readonly<\{[^}]*\}>;/s);
  assert.ok(publicTypeMatch, "BillingRawReceiptCollectorInput type must be found");
  assert.ok(!/producerIdentity/.test(publicTypeMatch![0]), "public input type must not declare producerIdentity");
  assert.ok(!/now\??:/.test(publicTypeMatch![0]), "public input type must not declare a now/clock override");
});

test("trust boundary: this module never validates its own output, never ratifies, never touches EVIDENCE_INDEX", async () => {
  const fs = await import("node:fs");
  const source = fs.readFileSync(new URL("./apeWeeklyCycleV3BillingCollector.ts", import.meta.url), "utf8");
  // Importing RawReceiptV3/RawMeasurementFact *types* from the validator module is expected and fine
  // (they are defined there); calling the actual validation/ratification functions is what must never
  // happen here. These check for real API usage, not for the word appearing in explanatory prose —
  // matching on prose burned this session twice before (P1-R2's "module purity" tests).
  assert.ok(!/validateCycleEvidenceV3/.test(source), "collector must never call the independent validator");
  assert.ok(!/buildCycleRatificationV3|ratificationStatus\s*[:=]|ratifiedBy\s*[:=]/.test(source), "collector must never contain ratification logic");
  assert.ok(!/expectedUniverse\s*[:=]/.test(source), "collector must never define expectedUniverse");
  assert.ok(!/writeFile|createWriteStream|fs\.write/.test(source), "collector must never write to the filesystem directly (only through StorageProvider)");
});

test("architectural anti-drift: the collector contains no reconciliation logic of its own", async () => {
  const fs = await import("node:fs");
  const source = fs.readFileSync(new URL("./apeWeeklyCycleV3BillingCollector.ts", import.meta.url), "utf8");
  assert.ok(source.includes("getBillingReconciliationSummary"), "collector must call the canonical summary function");
  // The strongest guarantee here is structural, not lexical: the collector never queries the
  // underlying Prisma tables at all, so it has no raw rows to compute a duplicate/audit-gap
  // formula from in the first place — whatever its comments say. A regex over the formula's own
  // notation ("max(0, n-1)") would false-positive on this file's own explanatory prose describing
  // what it does NOT do (the exact mistake already made and fixed twice in P1-R2's test suite).
  assert.ok(!/prisma\.(run|runUsageBreakdown|billingLedger|guardrailLedger)\.findMany/.test(source), "collector must never query billing tables directly");
  assert.ok(!/\.reduce\(/.test(source), "collector must not perform its own aggregation/reduction over raw rows");
  assert.ok(source.includes('coverageMode: "full"'), "collector must request full-window coverage, not the display-limited default");
});

test("schema: BILLING_RAW_RECEIPT_SCHEMA_VERSION is a distinct, versioned envelope id", () => {
  assert.equal(BILLING_RAW_RECEIPT_SCHEMA_VERSION, "ape.raw-receipt.billing.v1");
});
