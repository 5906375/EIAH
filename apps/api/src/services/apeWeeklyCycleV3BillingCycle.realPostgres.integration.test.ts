/**
 * Real-Postgres integration test for the P1-R3-CYCLE-I pipeline: proves
 *   real Postgres facts -> collector -> persisted RawReceiptV3 -> reload
 *   -> CycleEvidenceV3 -> persisted -> reload -> independent validator
 *   -> persisted ValidationResult -> "awaiting_human_ratification" or "rejected"
 * using the REAL pipeline (runBillingCyclePipeline via the test-only clock
 * surface), never a hand-built evidence/receipt for the happy paths.
 *
 * Safety / opt-in: identical pattern to
 * apeWeeklyCycleV3BillingCollector.realPostgres.integration.test.ts — skipped
 * unless REAL_POSTGRES_INTEGRATION_DATABASE_URL is explicitly set, a name
 * deliberately distinct from the app's ordinary DATABASE_URL. Not wired into
 * any package.json script or CI workflow beyond the same registration
 * pattern already used for the collector's real-Postgres test.
 *
 * No CycleRatificationV3 is ever built or persisted here — this test proves
 * the pipeline reaches (or correctly fails to reach) the human ratification
 * gate, never that a real cycle was ratified.
 */
import test, { before } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const REAL_DB_URL = process.env.REAL_POSTGRES_INTEGRATION_DATABASE_URL;

if (!REAL_DB_URL) {
  test("real-postgres cycle pipeline integration (skipped: set REAL_POSTGRES_INTEGRATION_DATABASE_URL to run)", { skip: true }, () => {});
} else {
  process.env.DATABASE_URL = REAL_DB_URL;

  const { prisma } = await import("@repo/db");
  const {
    APE_WEEKLY_CYCLE_V3_VALIDATOR_IDENTITY,
    reloadAndVerifyCycleEvidenceV3,
    __testing__,
  } = await import("./apeWeeklyCycleV3BillingCycle.js");
  const { runBillingCyclePipelineWithClock } = __testing__;
  const { loadFileAbsolutePath, storedObjectExists } = await import("./storage.js");
  const { validateCycleEvidenceV3 } = await import("@eiah/core/catalog/apeWeeklyCycleV3Validator");
  const { buildCycleEvidenceV3 } = await import("@eiah/core/catalog/apeWeeklyCycleV3");
  const { BILLING_RUN_COST_DEBIT_OPERATION_ID } = await import("@eiah/core/catalog/governedOperationCatalog");

  const FIXED_NOW = () => new Date("2026-09-09T12:00:00.000Z"); // Wednesday
  const EXPECTED_WINDOW = { from: "2026-08-31T00:00:00.000Z", to: "2026-09-07T00:00:00.000Z" };

  before(async () => {
    process.env.UPLOADS_DIR = await mkdtemp(path.join(tmpdir(), "ape-billing-cycle-i-integration-"));
    delete process.env.STORAGE_PROVIDER;
  });

  async function seedTenant(tenantId: string, workspaceId: string) {
    await prisma.tenant.upsert({
      where: { id: tenantId },
      create: { id: tenantId, name: `P1-R3-CYCLE-I integration tenant ${tenantId}` },
      update: {},
    });
    await prisma.workspace.upsert({
      where: { id: workspaceId },
      create: { id: workspaceId, tenantId, name: `P1-R3-CYCLE-I integration workspace ${workspaceId}` },
      update: {},
    });
  }

  test("CASE A: real Postgres facts -> real pipeline -> awaiting_human_ratification (healthy, no gap)", async () => {
    const TENANT_ID = "p1r3cyclei-case-a-tenant";
    const WORKSPACE_ID = "p1r3cyclei-case-a-workspace";
    await seedTenant(TENANT_ID, WORKSPACE_ID);

    const createdAt = new Date("2026-09-02T00:00:00.000Z"); // inside EXPECTED_WINDOW
    const finishedAt = new Date(createdAt.getTime() + 5 * 60_000);
    const run = await prisma.run.upsert({
      where: { id: "p1r3cyclei-case-a-run" },
      create: {
        id: "p1r3cyclei-case-a-run",
        tenantId: TENANT_ID,
        workspaceId: WORKSPACE_ID,
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
      where: { run_usage_breakdown_idempotency_unique: { runId: run.id, requestId: "req-case-a", meterType: "tokens" } },
      create: {
        id: "p1r3cyclei-case-a-bd",
        runId: run.id,
        tenantId: TENANT_ID,
        workspaceId: WORKSPACE_ID,
        agent: "eiah",
        provider: "openai",
        model: "gpt-test",
        pricingVersion: "v1",
        requestId: "req-case-a",
        meterType: "tokens",
        requestClass: "standard",
        amountCents: 100,
        createdAt,
      },
      update: {},
    });
    await prisma.billingLedger.create({
      data: {
        id: "p1r3cyclei-case-a-ledger",
        tenantId: TENANT_ID,
        workspaceId: WORKSPACE_ID,
        runId: run.id,
        entryType: "debit",
        amountCents: 100,
        currency: "BRL",
        requestId: "req-case-a",
        createdAt,
      },
    });

    const result = await runBillingCyclePipelineWithClock(
      prisma,
      { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID, commitSha: "1".repeat(40) },
      { now: FIXED_NOW }
    );
    assert.equal(result.status, "awaiting_human_ratification", `expected awaiting_human_ratification, got: ${JSON.stringify(result)}`);
    const r = result as Extract<typeof result, { status: "awaiting_human_ratification" }>;
    const evidence = await reloadAndVerifyCycleEvidenceV3(r.evidenceRef);
    assert.equal(evidence.auditGap, 0);
    assert.equal(evidence.tenantId, TENANT_ID);
    assert.equal(evidence.workspaceId, WORKSPACE_ID);
    assert.equal(await storedObjectExists(r.validationResultRef), true);
  });

  test("CASE B: real Postgres facts with an honest non-zero audit gap still reaches awaiting_human_ratification (NO_GO candidate, not an error)", async () => {
    const TENANT_ID = "p1r3cyclei-case-b-tenant";
    const WORKSPACE_ID = "p1r3cyclei-case-b-workspace";
    await seedTenant(TENANT_ID, WORKSPACE_ID);

    const createdAt = new Date("2026-09-02T00:00:00.000Z");
    const finishedAt = new Date(createdAt.getTime() + 5 * 60_000);
    const run = await prisma.run.upsert({
      where: { id: "p1r3cyclei-case-b-run" },
      create: {
        id: "p1r3cyclei-case-b-run",
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
      where: { run_usage_breakdown_idempotency_unique: { runId: run.id, requestId: "req-case-b", meterType: "tokens" } },
      create: {
        id: "p1r3cyclei-case-b-bd",
        runId: run.id,
        tenantId: TENANT_ID,
        workspaceId: WORKSPACE_ID,
        agent: "eiah",
        provider: "openai",
        model: "gpt-test",
        pricingVersion: "v1",
        requestId: "req-case-b",
        meterType: "tokens",
        requestClass: "standard",
        amountCents: 300,
        createdAt,
      },
      update: {},
    });
    // Deliberately no BillingLedger row -> real audit gap (missing_ledger).

    const result = await runBillingCyclePipelineWithClock(
      prisma,
      { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID, commitSha: "2".repeat(40) },
      { now: FIXED_NOW }
    );
    assert.equal(result.status, "awaiting_human_ratification", `a real gap must not be treated as a pipeline error — got: ${JSON.stringify(result)}`);
    const r = result as Extract<typeof result, { status: "awaiting_human_ratification" }>;
    const evidence = await reloadAndVerifyCycleEvidenceV3(r.evidenceRef);
    assert.equal(evidence.auditGap, 1, "the gap must be real and reflected honestly in the persisted evidence");
  });

  test("CASE C: tampering with a persisted real CycleEvidenceV3 after the fact is caught fail-closed on reload — never reaches ratification", async () => {
    const TENANT_ID = "p1r3cyclei-case-c-tenant";
    const WORKSPACE_ID = "p1r3cyclei-case-c-workspace";
    await seedTenant(TENANT_ID, WORKSPACE_ID);

    const createdAt = new Date("2026-09-02T00:00:00.000Z");
    const finishedAt = new Date(createdAt.getTime() + 5 * 60_000);
    const run = await prisma.run.upsert({
      where: { id: "p1r3cyclei-case-c-run" },
      create: {
        id: "p1r3cyclei-case-c-run",
        tenantId: TENANT_ID,
        workspaceId: WORKSPACE_ID,
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
      where: { run_usage_breakdown_idempotency_unique: { runId: run.id, requestId: "req-case-c", meterType: "tokens" } },
      create: {
        id: "p1r3cyclei-case-c-bd",
        runId: run.id,
        tenantId: TENANT_ID,
        workspaceId: WORKSPACE_ID,
        agent: "eiah",
        provider: "openai",
        model: "gpt-test",
        pricingVersion: "v1",
        requestId: "req-case-c",
        meterType: "tokens",
        requestClass: "standard",
        amountCents: 100,
        createdAt,
      },
      update: {},
    });
    await prisma.billingLedger.create({
      data: {
        id: "p1r3cyclei-case-c-ledger",
        tenantId: TENANT_ID,
        workspaceId: WORKSPACE_ID,
        runId: run.id,
        entryType: "debit",
        amountCents: 100,
        currency: "BRL",
        requestId: "req-case-c",
        createdAt,
      },
    });

    const result = await runBillingCyclePipelineWithClock(
      prisma,
      { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID, commitSha: "3".repeat(40) },
      { now: FIXED_NOW }
    );
    assert.equal(result.status, "awaiting_human_ratification");
    const r = result as Extract<typeof result, { status: "awaiting_human_ratification" }>;

    const absolutePath = await loadFileAbsolutePath(r.evidenceRef);
    assert.ok(absolutePath);
    const original = JSON.parse(await readFile(absolutePath!, "utf8"));
    await writeFile(absolutePath!, JSON.stringify({ ...original, auditGap: 999 }), "utf8");

    await assert.rejects(
      () => reloadAndVerifyCycleEvidenceV3(r.evidenceRef),
      /evidenceDigest does not match|cycle_evidence_v3_invalid/
    );
  });

  test("CASE D: scope mismatch against a real raw receipt is rejected by the validator", async () => {
    const TENANT_ID = "p1r3cyclei-case-d-tenant";
    const WORKSPACE_ID = "p1r3cyclei-case-d-workspace";
    await seedTenant(TENANT_ID, WORKSPACE_ID);

    const createdAt = new Date("2026-09-02T00:00:00.000Z");
    const finishedAt = new Date(createdAt.getTime() + 5 * 60_000);
    const run = await prisma.run.upsert({
      where: { id: "p1r3cyclei-case-d-run" },
      create: {
        id: "p1r3cyclei-case-d-run",
        tenantId: TENANT_ID,
        workspaceId: WORKSPACE_ID,
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
      where: { run_usage_breakdown_idempotency_unique: { runId: run.id, requestId: "req-case-d", meterType: "tokens" } },
      create: {
        id: "p1r3cyclei-case-d-bd",
        runId: run.id,
        tenantId: TENANT_ID,
        workspaceId: WORKSPACE_ID,
        agent: "eiah",
        provider: "openai",
        model: "gpt-test",
        pricingVersion: "v1",
        requestId: "req-case-d",
        meterType: "tokens",
        requestClass: "standard",
        amountCents: 100,
        createdAt,
      },
      update: {},
    });
    await prisma.billingLedger.create({
      data: {
        id: "p1r3cyclei-case-d-ledger",
        tenantId: TENANT_ID,
        workspaceId: WORKSPACE_ID,
        runId: run.id,
        entryType: "debit",
        amountCents: 100,
        currency: "BRL",
        requestId: "req-case-d",
        createdAt,
      },
    });

    const result = await runBillingCyclePipelineWithClock(
      prisma,
      { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID, commitSha: "4".repeat(40) },
      { now: FIXED_NOW }
    );
    assert.equal(result.status, "awaiting_human_ratification");
    const r = result as Extract<typeof result, { status: "awaiting_human_ratification" }>;
    const evidence = await reloadAndVerifyCycleEvidenceV3(r.evidenceRef);

    // Re-declare the same real evidence under a DIFFERENT tenant scope than
    // the real raw receipt it references, and validate directly.
    const tamperedEvidence = buildCycleEvidenceV3({ ...evidence, tenantId: "a-different-tenant-entirely" });
    const realReceipt = {
      ref: r.rawReceiptRef,
      digest: r.rawReceiptDigest,
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      facts: evidence.measurements.map((m) => ({
        operationId: m.operationId,
        auditGapCount: m.auditGap,
        duplicateSideEffectsCount: m.duplicateSideEffects,
        sampleSize: m.sampleSize,
      })),
    };
    const validationResult = validateCycleEvidenceV3({
      evidence: tamperedEvidence,
      rawReceipts: [realReceipt],
      validatorIdentity: APE_WEEKLY_CYCLE_V3_VALIDATOR_IDENTITY,
    });
    assert.equal(validationResult.validationStatus, "rejected");
    assert.ok(validationResult.failureReasons.includes("scope_mismatch"));
  });
}
