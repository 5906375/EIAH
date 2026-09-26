/**
 * Real-Postgres integration test: proves the full chain
 *   real Postgres facts -> getBillingReconciliationSummary() -> billing
 *   collector -> persisted RawReceiptV3 -> CycleEvidenceV3 -> apeWeeklyCycleV3Validator
 * using the REAL collector (collectBillingRawReceiptV3) against a REAL,
 * isolated Postgres database — never a mocked Prisma client, never a
 * hand-built raw receipt.
 *
 * Safety / opt-in (P1-R3-I2 §4): this test never runs by default. It is
 * skipped unless REAL_POSTGRES_INTEGRATION_DATABASE_URL is explicitly set —
 * a name deliberately distinct from the app's ordinary DATABASE_URL, so a
 * dev/CI environment that happens to export DATABASE_URL for something else
 * can never trigger this against a shared or production database by
 * accident. Point it only at a disposable, isolated database — this test
 * writes to and reads from Run/RunUsageBreakdown/BillingLedger for a
 * synthetic tenant/workspace scoped to "p1r3i2-".
 *
 * Not wired into any package.json script or CI workflow (P1-R3-I2 §4: no
 * broad CI change in this unit). Run manually:
 *   REAL_POSTGRES_INTEGRATION_DATABASE_URL=postgresql://... \
 *     node --import tsx --test apps/api/src/services/apeWeeklyCycleV3BillingCollector.realPostgres.integration.test.ts
 */
import test, { before } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const REAL_DB_URL = process.env.REAL_POSTGRES_INTEGRATION_DATABASE_URL;

if (!REAL_DB_URL) {
  test("real-postgres integration (skipped: set REAL_POSTGRES_INTEGRATION_DATABASE_URL to run)", { skip: true }, () => {});
} else {
  process.env.DATABASE_URL = REAL_DB_URL;

  const { prisma } = await import("@repo/db");
  const { collectBillingRawReceiptV3 } = await import("./apeWeeklyCycleV3BillingCollector.js");
  const { BILLING_RUN_COST_DEBIT_OPERATION_ID } = await import("@eiah/core/catalog/governedOperationCatalog");
  const { buildCycleEvidenceV3 } = await import("@eiah/core/catalog/apeWeeklyCycleV3");
  const { validateCycleEvidenceV3 } = await import("@eiah/core/catalog/apeWeeklyCycleV3Validator");

  const TENANT_ID = "p1r3i2-tenant";
  const WORKSPACE_ID = "p1r3i2-workspace";
  const WINDOW = { from: "2026-01-01T00:00:00.000Z", to: "2027-01-01T00:00:00.000Z" };
  const VALIDATOR_IDENTITY = "eiah.ape-weekly-cycle-v3.independent-validator.v1";

  let realReceipt: Awaited<ReturnType<typeof collectBillingRawReceiptV3>>["receipt"];

  before(async () => {
    process.env.UPLOADS_DIR = await mkdtemp(path.join(tmpdir(), "ape-billing-i2-integration-"));
    delete process.env.STORAGE_PROVIDER;

    await prisma.tenant.upsert({
      where: { id: TENANT_ID },
      create: { id: TENANT_ID, name: "P1-R3-I2 integration tenant" },
      update: {},
    });
    await prisma.workspace.upsert({
      where: { id: WORKSPACE_ID },
      create: { id: WORKSPACE_ID, tenantId: TENANT_ID, name: "P1-R3-I2 integration workspace" },
      update: {},
    });

    const finishedAt = new Date("2026-06-15T12:00:00.000Z");
    const createdAt = new Date("2026-06-15T11:00:00.000Z");

    // One real audit gap (breakdown present, no ledger) — enough to prove
    // the chain carries a *real*, non-zero, non-fabricated metric end to end.
    const run = await prisma.run.upsert({
      where: { id: "p1r3i2-run-gap" },
      create: {
        id: "p1r3i2-run-gap",
        tenantId: TENANT_ID,
        workspaceId: WORKSPACE_ID,
        agent: "eiah",
        status: "success",
        request: {},
        costCents: 300,
        createdAt,
        finishedAt,
      },
      update: {},
    });
    await prisma.runUsageBreakdown.upsert({
      where: { run_usage_breakdown_idempotency_unique: { runId: run.id, requestId: "req-p1r3i2", meterType: "tokens" } },
      create: {
        id: "p1r3i2-bd-gap",
        runId: run.id,
        tenantId: TENANT_ID,
        workspaceId: WORKSPACE_ID,
        agent: "eiah",
        provider: "openai",
        model: "gpt-test",
        pricingVersion: "v1",
        requestId: "req-p1r3i2",
        meterType: "tokens",
        requestClass: "standard",
        amountCents: 300,
        createdAt,
      },
      update: {},
    });
    // deliberately no BillingLedger row -> real audit gap (missing_ledger)

    const { receipt } = await collectBillingRawReceiptV3(prisma, {
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      operationId: BILLING_RUN_COST_DEBIT_OPERATION_ID,
      observationWindow: WINDOW,
    });
    realReceipt = receipt;
    assert.equal(realReceipt.facts[0]?.auditGapCount, 1, "seed must produce exactly one real audit gap");
  });

  function baseCycleEvidenceInput(overrides: Partial<Parameters<typeof buildCycleEvidenceV3>[0]> = {}) {
    const fact = realReceipt.facts[0]!;
    return {
      cycleId: "p1-r3-i2-integration-cycle",
      generatedAt: new Date().toISOString(),
      domain: "billing" as const,
      evidenceClass: "domain" as const,
      operationIds: [BILLING_RUN_COST_DEBIT_OPERATION_ID],
      expectedUniverse: [BILLING_RUN_COST_DEBIT_OPERATION_ID],
      measurements: [
        {
          operationId: BILLING_RUN_COST_DEBIT_OPERATION_ID,
          measurementStatus: "measured" as const,
          observedAt: realReceipt.observationWindow ?? WINDOW,
          sampleSize: fact.sampleSize,
          auditGap: fact.auditGapCount,
          duplicateSideEffects: fact.duplicateSideEffectsCount,
          rawReceiptRef: realReceipt.ref,
          rawReceiptDigest: realReceipt.digest,
        },
      ],
      measurementStatus: "measured" as const,
      coverageStatus: "complete" as const,
      provenance: {
        commitSha: "0".repeat(40),
        workflowRunId: null,
        producerIdentity: realReceipt.producerIdentity ?? "eiah.billing.raw-receipt-collector.v1",
      },
      ...overrides,
    };
  }

  test("CASE A: real raw receipt -> valid CycleEvidenceV3 -> validator passes", () => {
    const evidence = buildCycleEvidenceV3(baseCycleEvidenceInput());
    const result = validateCycleEvidenceV3({
      evidence,
      rawReceipts: [realReceipt],
      validatorIdentity: VALIDATOR_IDENTITY,
    });
    assert.equal(result.validationStatus, "passed", `expected passed, got rejected: ${result.failureReasons.join(",")}`);
    assert.deepEqual([...result.failureReasons], []);
    assert.equal(result.recomputed.auditGap, realReceipt.facts[0]?.auditGapCount);
    assert.equal(result.recomputed.duplicateSideEffects, realReceipt.facts[0]?.duplicateSideEffectsCount);
    assert.equal(result.recomputed.coverageStatus, "complete");
  });

  test("CASE B: declared metric tampering (auditGap) is rejected — same real raw receipt, untouched", () => {
    const input = baseCycleEvidenceInput();
    const tamperedMeasurements = [{ ...input.measurements[0]!, auditGap: input.measurements[0]!.auditGap + 5 }];
    const evidence = buildCycleEvidenceV3({ ...input, measurements: tamperedMeasurements });
    const result = validateCycleEvidenceV3({
      evidence,
      rawReceipts: [realReceipt],
      validatorIdentity: VALIDATOR_IDENTITY,
    });
    assert.equal(result.validationStatus, "rejected");
    assert.ok(result.failureReasons.includes("recomputed_metric_mismatch"));
  });

  test("CASE B2: declared metric tampering (duplicateSideEffects) is rejected — same real raw receipt, untouched", () => {
    const input = baseCycleEvidenceInput();
    const tamperedMeasurements = [{ ...input.measurements[0]!, duplicateSideEffects: input.measurements[0]!.duplicateSideEffects + 3 }];
    const evidence = buildCycleEvidenceV3({ ...input, measurements: tamperedMeasurements });
    const result = validateCycleEvidenceV3({
      evidence,
      rawReceipts: [realReceipt],
      validatorIdentity: VALIDATOR_IDENTITY,
    });
    assert.equal(result.validationStatus, "rejected");
    assert.ok(result.failureReasons.includes("recomputed_metric_mismatch"));
  });

  test("CASE C: raw receipt digest tampering is rejected — real receipt content persists untouched", () => {
    const evidence = buildCycleEvidenceV3(baseCycleEvidenceInput());
    // Same ref, different digest -- simulates the validator being handed a
    // divergent representation of the receipt at the same ref. The persisted
    // object on disk (realReceipt) is never modified by this test.
    const tamperedReceipt = { ...realReceipt, digest: "f".repeat(64) };
    const result = validateCycleEvidenceV3({
      evidence,
      rawReceipts: [tamperedReceipt],
      validatorIdentity: VALIDATOR_IDENTITY,
    });
    assert.equal(result.validationStatus, "rejected");
    assert.ok(result.failureReasons.includes("raw_receipt_digest_mismatch"));
  });

  test("CASE D: producer/validator identity collision is rejected", () => {
    const evidence = buildCycleEvidenceV3(baseCycleEvidenceInput());
    const result = validateCycleEvidenceV3({
      evidence,
      rawReceipts: [realReceipt],
      validatorIdentity: evidence.provenance.producerIdentity, // same identity as producer
    });
    assert.equal(result.validationStatus, "rejected");
    assert.ok(result.failureReasons.includes("producer_validator_identity_collision"));
  });

  test("CASE E: billing-only evidence cannot self-promote to systemic", () => {
    const evidence = buildCycleEvidenceV3(baseCycleEvidenceInput({ evidenceClass: "systemic" }));
    const result = validateCycleEvidenceV3({
      evidence,
      rawReceipts: [realReceipt],
      validatorIdentity: VALIDATOR_IDENTITY,
    });
    assert.equal(result.validationStatus, "rejected");
    assert.ok(result.failureReasons.includes("systemic_class_without_full_catalog_coverage"));
  });

  test("CASE F: a legacy (non-v3) schemaVersion never validates, even carrying a real raw receipt", () => {
    const evidence = { ...buildCycleEvidenceV3(baseCycleEvidenceInput()), schemaVersion: "ape.weekly-cycle.v2" as never };
    const result = validateCycleEvidenceV3({
      evidence,
      rawReceipts: [realReceipt],
      validatorIdentity: VALIDATOR_IDENTITY,
    });
    assert.equal(result.validationStatus, "rejected");
    assert.ok(result.failureReasons.includes("unsupported_schema_version"));
  });

  // No ratification test here by design: this file's own source necessarily
  // names the ratification function in prose/test titles when describing what
  // it does NOT do, which would make a source-grep on itself a guaranteed
  // false positive (the exact mistake already made and fixed twice earlier in
  // this session). The real, non-self-referential guarantee — that the
  // COLLECTOR module never imports or calls buildCycleRatificationV3 — is
  // already covered by the "trust boundary" test in
  // apeWeeklyCycleV3BillingCollector.test.ts, which greps that other file.

  test("CASE G: full window coverage over 50 runs against REAL Postgres — the collector, validator, and canonical reconciliation all agree (P1-R3-F Finding 1)", async () => {
    const SCALE_TENANT_ID = "p1r3f-scale-tenant";
    const SCALE_WORKSPACE_ID = "p1r3f-scale-workspace";
    const RUN_COUNT = 55;

    await prisma.tenant.upsert({
      where: { id: SCALE_TENANT_ID },
      create: { id: SCALE_TENANT_ID, name: "P1-R3-F scale-coverage tenant" },
      update: {},
    });
    await prisma.workspace.upsert({
      where: { id: SCALE_WORKSPACE_ID },
      create: { id: SCALE_WORKSPACE_ID, tenantId: SCALE_TENANT_ID, name: "P1-R3-F scale-coverage workspace" },
      update: {},
    });

    const baseCreatedAt = new Date("2026-03-01T00:00:00.000Z");
    for (let i = 1; i <= RUN_COUNT; i++) {
      const runId = `p1r3f-scale-run-${String(i).padStart(3, "0")}`;
      const createdAt = new Date(baseCreatedAt.getTime() + i * 60_000);
      const finishedAt = new Date(createdAt.getTime() + 5 * 60_000);
      await prisma.run.upsert({
        where: { id: runId },
        create: {
          id: runId,
          tenantId: SCALE_TENANT_ID,
          workspaceId: SCALE_WORKSPACE_ID,
          agent: "eiah",
          status: "success",
          request: {},
          costCents: 100,
          createdAt,
          finishedAt,
        },
        update: {},
      });
      await prisma.runUsageBreakdown.upsert({
        where: { run_usage_breakdown_idempotency_unique: { runId, requestId: `req-${runId}`, meterType: "tokens" } },
        create: {
          id: `bd-${runId}`,
          runId,
          tenantId: SCALE_TENANT_ID,
          workspaceId: SCALE_WORKSPACE_ID,
          agent: "eiah",
          provider: "openai",
          model: "gpt-test",
          pricingVersion: "v1",
          requestId: `req-${runId}`,
          meterType: "tokens",
          requestClass: "standard",
          amountCents: 100,
          createdAt,
        },
        update: {},
      });
      // i === 1 is the OLDEST run (createdAt ascending with i) and the only
      // one left without a matching BillingLedger row -> the one real audit
      // gap this case exists to prove is never dropped by a 50-row cap.
      if (i !== 1) {
        const existing = await prisma.billingLedger.findFirst({ where: { tenantId: SCALE_TENANT_ID, runId } });
        if (!existing) {
          await prisma.billingLedger.create({
            data: {
              id: `ledger-${runId}`,
              tenantId: SCALE_TENANT_ID,
              workspaceId: SCALE_WORKSPACE_ID,
              runId,
              entryType: "debit",
              amountCents: 100,
              currency: "BRL",
              requestId: `req-${runId}`,
              createdAt,
            },
          });
        }
      }
    }

    const scaleWindow = { from: "2026-03-01T00:00:00.000Z", to: "2026-04-01T00:00:00.000Z" };
    const { receipt: scaleReceipt } = await collectBillingRawReceiptV3(prisma, {
      tenantId: SCALE_TENANT_ID,
      workspaceId: SCALE_WORKSPACE_ID,
      operationId: BILLING_RUN_COST_DEBIT_OPERATION_ID,
      observationWindow: scaleWindow,
    });

    assert.equal(scaleReceipt.facts[0]?.sampleSize, RUN_COUNT, "sampleSize must reflect all 55 real Postgres runs, not a 50-row cap");
    assert.equal(scaleReceipt.facts[0]?.auditGapCount, 1, "the gap in the oldest real run must survive full-window coverage");

    const scaleEvidence = buildCycleEvidenceV3({
      cycleId: "p1-r3-f-scale-coverage-cycle",
      generatedAt: new Date().toISOString(),
      domain: "billing" as const,
      evidenceClass: "domain" as const,
      operationIds: [BILLING_RUN_COST_DEBIT_OPERATION_ID],
      expectedUniverse: [BILLING_RUN_COST_DEBIT_OPERATION_ID],
      measurements: [
        {
          operationId: BILLING_RUN_COST_DEBIT_OPERATION_ID,
          measurementStatus: "measured" as const,
          observedAt: scaleReceipt.observationWindow ?? scaleWindow,
          sampleSize: scaleReceipt.facts[0]!.sampleSize,
          auditGap: scaleReceipt.facts[0]!.auditGapCount,
          duplicateSideEffects: scaleReceipt.facts[0]!.duplicateSideEffectsCount,
          rawReceiptRef: scaleReceipt.ref,
          rawReceiptDigest: scaleReceipt.digest,
        },
      ],
      measurementStatus: "measured" as const,
      coverageStatus: "complete" as const,
      provenance: {
        commitSha: "0".repeat(40),
        workflowRunId: null,
        producerIdentity: scaleReceipt.producerIdentity ?? "eiah.billing.raw-receipt-collector.v1",
      },
    });
    const scaleResult = validateCycleEvidenceV3({
      evidence: scaleEvidence,
      rawReceipts: [scaleReceipt],
      validatorIdentity: VALIDATOR_IDENTITY,
    });
    assert.equal(
      scaleResult.validationStatus,
      "passed",
      `expected passed for the full 55-run population, got rejected: ${scaleResult.failureReasons.join(",")}`
    );
    assert.equal(scaleResult.recomputed.auditGap, 1);
  });
}
