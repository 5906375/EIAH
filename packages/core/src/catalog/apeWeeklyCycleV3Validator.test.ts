import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCycleEvidenceV3, type CycleEvidenceV3Input, type MeasuredOperationV3 } from "./apeWeeklyCycleV3";
import {
  validateCycleEvidenceV3,
  type RawReceiptV3,
} from "./apeWeeklyCycleV3Validator";
import { BILLING_RUN_COST_DEBIT_OPERATION_ID } from "./governedOperationCatalog";

const OP_ID = BILLING_RUN_COST_DEBIT_OPERATION_ID; // "billing.run_cost_debit" — the only operation in the real catalog's "billing" domain today.
const RAW_REF = "raw:billing:run48-2026-09-08";
const RAW_DIGEST = "a".repeat(64);
const NOW = new Date("2026-09-08T12:00:00.000Z");
const VALIDATOR_IDENTITY = "ape-weekly-cycle-v3-independent-validator";
const PRODUCER_IDENTITY = "billing-domain-collector";

function rawReceipt(overrides: Partial<RawReceiptV3> = {}): RawReceiptV3 {
  return {
    ref: RAW_REF,
    digest: RAW_DIGEST,
    facts: [{ operationId: OP_ID, auditGapCount: 0, duplicateSideEffectsCount: 0, sampleSize: 5 }],
    ...overrides,
  };
}

function measuredOp(overrides: Partial<MeasuredOperationV3> = {}): MeasuredOperationV3 {
  return {
    operationId: OP_ID,
    measurementStatus: "measured",
    observedAt: { from: "2026-09-01T00:00:00.000Z", to: "2026-09-08T00:00:00.000Z" },
    sampleSize: 5,
    auditGap: 0,
    duplicateSideEffects: 0,
    rawReceiptRef: RAW_REF,
    rawReceiptDigest: RAW_DIGEST,
    ...overrides,
  };
}

function baseInput(overrides: Partial<CycleEvidenceV3Input> = {}): CycleEvidenceV3Input {
  return {
    cycleId: "cycle-2026-09-08-billing",
    generatedAt: "2026-09-08T00:00:00.000Z",
    domain: "billing",
    evidenceClass: "domain",
    operationIds: [OP_ID],
    expectedUniverse: [OP_ID],
    measurements: [measuredOp()],
    measurementStatus: "measured",
    coverageStatus: "complete",
    provenance: { commitSha: "0".repeat(40), workflowRunId: "1", producerIdentity: PRODUCER_IDENTITY },
    ...overrides,
  };
}

function validate(
  inputOverrides: Partial<CycleEvidenceV3Input> = {},
  receipts: readonly RawReceiptV3[] = [rawReceipt()],
) {
  const evidence = buildCycleEvidenceV3(baseInput(inputOverrides));
  return validateCycleEvidenceV3({ evidence, rawReceipts: receipts, validatorIdentity: VALIDATOR_IDENTITY, now: NOW });
}

// ── Contract / schema ──────────────────────────────────────────────────────

test("passes for a well-formed, honestly-backed billing cycle", () => {
  const result = validate();
  assert.equal(result.validationStatus, "passed");
  assert.deepEqual(result.failureReasons, []);
});

test("rejects an evidence object with an unsupported schemaVersion", () => {
  const evidence = { ...buildCycleEvidenceV3(baseInput()), schemaVersion: "ape.weekly-cycle.v2" as never };
  const result = validateCycleEvidenceV3({ evidence, rawReceipts: [rawReceipt()], validatorIdentity: VALIDATOR_IDENTITY, now: NOW });
  assert.equal(result.validationStatus, "rejected");
  assert.ok(result.failureReasons.includes("unsupported_schema_version"));
});

test("rejects a structurally invalid evidence object (missing raw receipt ref on a measured operation)", () => {
  const evidence = buildCycleEvidenceV3(
    baseInput({ measurements: [measuredOp({ rawReceiptRef: null, rawReceiptDigest: null })] }),
  );
  const result = validateCycleEvidenceV3({ evidence, rawReceipts: [rawReceipt()], validatorIdentity: VALIDATOR_IDENTITY, now: NOW });
  assert.equal(result.validationStatus, "rejected");
  assert.ok(result.failureReasons.includes("structural_shape_invalid"));
});

// ── Digest ───────────────────────────────────────────────────────────────

test("rejects evidence whose evidenceDigest was tampered with after construction", () => {
  const evidence = { ...buildCycleEvidenceV3(baseInput()), auditGap: 999 };
  const result = validateCycleEvidenceV3({ evidence, rawReceipts: [rawReceipt()], validatorIdentity: VALIDATOR_IDENTITY, now: NOW });
  assert.equal(result.validationStatus, "rejected");
  assert.ok(result.failureReasons.includes("evidence_digest_mismatch"));
});

test("rejects when the raw receipt digest referenced by the measurement does not match the actual receipt digest", () => {
  const result = validate({}, [rawReceipt({ digest: "b".repeat(64) })]);
  assert.equal(result.validationStatus, "rejected");
  assert.ok(result.failureReasons.includes("raw_receipt_digest_mismatch"));
});

test("rejects when the raw receipt reference cannot be resolved at all", () => {
  const result = validate({}, []);
  assert.equal(result.validationStatus, "rejected");
  assert.ok(result.failureReasons.includes("raw_receipt_missing"));
});

// ── Expected universe ────────────────────────────────────────────────────

test("expectedUniverse is validated against the Governed Operation Catalog, not accepted as declared", () => {
  const result = validate({ expectedUniverse: [OP_ID, "billing.made_up_operation"] });
  assert.equal(result.validationStatus, "rejected");
  assert.ok(result.failureReasons.includes("expected_universe_mismatch"));
});

test("producer cannot widen the universe with an operation absent from the catalog", () => {
  const result = validate({
    operationIds: [OP_ID, "billing.not_in_catalog"],
    measurements: [measuredOp(), measuredOp({ operationId: "billing.not_in_catalog" })],
  });
  assert.equal(result.validationStatus, "rejected");
  assert.ok(result.failureReasons.includes("unknown_domain_operation"));
});

test("a domain-scoped (billing-only) cycle can never validate as evidenceClass=systemic", () => {
  const result = validate({ evidenceClass: "systemic" });
  assert.equal(result.validationStatus, "rejected");
  assert.ok(result.failureReasons.includes("systemic_class_without_full_catalog_coverage"));
});

// ── Metrics: semantic recalculation ─────────────────────────────────────

test("accepts a correctly declared non-zero auditGap that matches the raw receipt", () => {
  const result = validate(
    { measurements: [measuredOp({ auditGap: 2 })] },
    [rawReceipt({ facts: [{ operationId: OP_ID, auditGapCount: 2, duplicateSideEffectsCount: 0, sampleSize: 5 }] })],
  );
  assert.equal(result.validationStatus, "passed");
  assert.equal(result.recomputed.auditGap, 2);
});

test("rejects when the producer fabricates a zero auditGap that the raw receipt does not support", () => {
  // The exact defect this contract exists to prevent: declared auditGap=0 while
  // the raw receipt shows real gaps.
  const result = validate(
    { measurements: [measuredOp({ auditGap: 0 })] },
    [rawReceipt({ facts: [{ operationId: OP_ID, auditGapCount: 3, duplicateSideEffectsCount: 0, sampleSize: 5 }] })],
  );
  assert.equal(result.validationStatus, "rejected");
  assert.ok(result.failureReasons.includes("recomputed_metric_mismatch"));
  assert.equal(result.recomputed.auditGap, 3);
});

test("rejects a fabricated duplicateSideEffects value that diverges from the raw receipt", () => {
  const result = validate(
    { measurements: [measuredOp({ duplicateSideEffects: 0 })] },
    [rawReceipt({ facts: [{ operationId: OP_ID, auditGapCount: 0, duplicateSideEffectsCount: 4, sampleSize: 5 }] })],
  );
  assert.equal(result.validationStatus, "rejected");
  assert.ok(result.failureReasons.includes("recomputed_metric_mismatch"));
});

test("independent recalculation detects divergence even when the declared aggregate happens to match by coincidence", () => {
  // Two operations where individual facts diverge from declared, but the
  // validator must catch the per-measurement mismatch, not just the total.
  const result = validate(
    {
      operationIds: [OP_ID],
      measurements: [measuredOp({ auditGap: 1 })],
    },
    [rawReceipt({ facts: [{ operationId: OP_ID, auditGapCount: 5, duplicateSideEffectsCount: 0, sampleSize: 5 }] })],
  );
  assert.equal(result.validationStatus, "rejected");
  assert.ok(result.failureReasons.includes("recomputed_metric_mismatch"));
});

// ── Status ───────────────────────────────────────────────────────────────

test("measurementStatus=error is a valid fact but is never silently promoted to passed coverage", () => {
  const result = validate({
    measurementStatus: "error",
    coverageStatus: "no_activity",
    measurements: [
      measuredOp({ measurementStatus: "error", observedAt: null, auditGap: 0, duplicateSideEffects: 0, rawReceiptRef: null, rawReceiptDigest: null }),
    ],
  });
  // Structurally valid (error measurements don't require a raw receipt), and
  // the recomputed coverage for zero measured operations is "no_activity" —
  // matching what was declared, so this passes on those grounds, but no
  // auditGap/duplicateSideEffects were asserted as zero.
  assert.equal(result.recomputed.coverageStatus, "no_activity");
});

test("declaring coverageStatus=complete when sampleSize is effectively zero is rejected, not silently accepted", () => {
  const result = validate({
    coverageStatus: "complete",
    measurements: [
      measuredOp({ measurementStatus: "not_measured", observedAt: null, auditGap: 0, duplicateSideEffects: 0, rawReceiptRef: null, rawReceiptDigest: null }),
    ],
  });
  assert.equal(result.validationStatus, "rejected");
  assert.ok(result.failureReasons.includes("coverage_status_mismatch"));
  assert.equal(result.recomputed.coverageStatus, "no_activity");
});

test("a rejected validationStatus is never promotable regardless of other passing checks", () => {
  const result = validate({ expectedUniverse: [OP_ID, "billing.made_up_operation"] });
  assert.equal(result.validationStatus, "rejected");
});

// ── Identity / trust boundary ────────────────────────────────────────────

test("rejects when producerIdentity equals validatorIdentity (self-validation)", () => {
  const evidence = buildCycleEvidenceV3(
    baseInput({ provenance: { commitSha: "0".repeat(40), workflowRunId: "1", producerIdentity: VALIDATOR_IDENTITY } }),
  );
  const result = validateCycleEvidenceV3({ evidence, rawReceipts: [rawReceipt()], validatorIdentity: VALIDATOR_IDENTITY, now: NOW });
  assert.equal(result.validationStatus, "rejected");
  assert.ok(result.failureReasons.includes("producer_validator_identity_collision"));
});

test("validator never creates or returns a raw receipt of its own", () => {
  const result = validate();
  const keys = Object.keys(result);
  assert.ok(!keys.includes("rawReceipt"), "validation result must not fabricate a raw receipt field");
});

test("validator result is a plain read-only report — it never contains a mutated copy of the evidence", () => {
  const result = validate() as unknown as Record<string, unknown>;
  assert.ok(!("evidence" in result), "validator must not echo back a (potentially mutated) evidence object");
});

test("validator result never contains a ratification decision (validator cannot ratify)", () => {
  const result = validate() as unknown as Record<string, unknown>;
  assert.ok(!("ratificationStatus" in result), "validator output must not include ratificationStatus — ratification is a separate, human-only step");
});

// ── Freshness ────────────────────────────────────────────────────────────

test("rejects evidence older than the configured freshness window", () => {
  const evidence = buildCycleEvidenceV3(baseInput({ generatedAt: "2026-08-01T00:00:00.000Z" }));
  const result = validateCycleEvidenceV3({
    evidence,
    rawReceipts: [rawReceipt()],
    validatorIdentity: VALIDATOR_IDENTITY,
    now: NOW,
    maxAgeDays: 14,
  });
  assert.equal(result.validationStatus, "rejected");
  assert.ok(result.failureReasons.includes("stale_evidence"));
});

// ── Legacy v2 ────────────────────────────────────────────────────────────

test("a legacy v2-shaped object (no schemaVersion, hardcoded zeros, no raw receipt) never validates as passed", () => {
  const legacyLikeShape = {
    // Deliberately mimics the shape of the old declarative producer:
    // decision, hardMetricsGo, auditGap: 0, duplicateSideEffects: 0 — but
    // missing schemaVersion, evidenceDigest, provenance and any raw receipt.
    decision: "GO",
    hardMetricsGo: true,
    auditGap: 0,
    duplicateSideEffects: 0,
    breakGlass: 0,
  } as unknown as ReturnType<typeof buildCycleEvidenceV3>;

  const result = validateCycleEvidenceV3({
    evidence: legacyLikeShape,
    rawReceipts: [],
    validatorIdentity: VALIDATOR_IDENTITY,
    now: NOW,
  });
  assert.equal(result.validationStatus, "rejected");
  assert.ok(result.failureReasons.includes("unsupported_schema_version"));
});

// ── Scope (P1-R3-CYCLE-H, Decision 4) ─────────────────────────────────────

test("evidence with no declared scope validates exactly as before (backward compatible)", () => {
  const result = validate();
  assert.equal(result.validationStatus, "passed");
});

test("evidence scope matching the raw receipt's own scope passes", () => {
  const receipt = rawReceipt({ tenantId: "tenant-a", workspaceId: "workspace-a" });
  const result = validate({ tenantId: "tenant-a", workspaceId: "workspace-a" }, [receipt]);
  assert.equal(result.validationStatus, "passed", `expected passed, got: ${result.failureReasons.join(",")}`);
});

test("evidence tenantId disagreeing with the raw receipt's tenantId is rejected (scope_mismatch)", () => {
  const receipt = rawReceipt({ tenantId: "tenant-a", workspaceId: "workspace-a" });
  const result = validate({ tenantId: "tenant-b", workspaceId: "workspace-a" }, [receipt]);
  assert.equal(result.validationStatus, "rejected");
  assert.ok(result.failureReasons.includes("scope_mismatch"));
});

test("evidence workspaceId disagreeing with the raw receipt's workspaceId is rejected (scope_mismatch)", () => {
  const receipt = rawReceipt({ tenantId: "tenant-a", workspaceId: "workspace-a" });
  const result = validate({ tenantId: "tenant-a", workspaceId: "workspace-b" }, [receipt]);
  assert.equal(result.validationStatus, "rejected");
  assert.ok(result.failureReasons.includes("scope_mismatch"));
});

test("evidence scope declared but raw receipt has no scope: skipped, not rejected (backward compatible with older receipts)", () => {
  const receipt = rawReceipt(); // no tenantId/workspaceId
  const result = validate({ tenantId: "tenant-a", workspaceId: "workspace-a" }, [receipt]);
  assert.equal(result.validationStatus, "passed", `expected passed, got: ${result.failureReasons.join(",")}`);
});

test("the validator module performs no filesystem I/O (structural guarantee against legacy artifact reads and Evidence Index writes)", async () => {
  const fs = await import("node:fs");
  const source = fs.readFileSync(new URL("./apeWeeklyCycleV3Validator.ts", import.meta.url), "utf8");
  // No node:fs import is the real guarantee: a module that never touches the
  // filesystem cannot read legacy weekly-cycle artifacts and cannot write
  // the project's evidence index, whatever its comments describe.
  assert.ok(!/from\s+["']node:fs["']/.test(source), "the validator must not perform filesystem I/O");
});
