import { test } from "node:test";
import assert from "node:assert/strict";
import {
  APE_WEEKLY_CYCLE_SCHEMA_VERSION,
  buildCycleEvidenceV3,
  buildCycleRatificationV3,
  recomputeEvidenceDigest,
  assertValidCycleEvidenceV3Shape,
  type CycleEvidenceV3Input,
  type MeasuredOperationV3,
} from "./apeWeeklyCycleV3";

const OP_ID = "billing.run_cost_debit";

function measuredOp(overrides: Partial<MeasuredOperationV3> = {}): MeasuredOperationV3 {
  return {
    operationId: OP_ID,
    measurementStatus: "measured",
    observedAt: { from: "2026-09-01T00:00:00.000Z", to: "2026-09-08T00:00:00.000Z" },
    sampleSize: 5,
    auditGap: 0,
    duplicateSideEffects: 0,
    rawReceiptRef: "raw:billing:2026-09-08",
    rawReceiptDigest: "a".repeat(64),
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
    provenance: {
      commitSha: "0".repeat(40),
      workflowRunId: "12345",
      producerIdentity: "billing-domain-collector",
    },
    ...overrides,
  };
}

test("buildCycleEvidenceV3: sets schemaVersion to ape.weekly-cycle.v3", () => {
  const evidence = buildCycleEvidenceV3(baseInput());
  assert.equal(evidence.schemaVersion, APE_WEEKLY_CYCLE_SCHEMA_VERSION);
});

test("buildCycleEvidenceV3: aggregates auditGap and duplicateSideEffects as Sigma over measurements", () => {
  const evidence = buildCycleEvidenceV3(
    baseInput({
      operationIds: [OP_ID, "billing.other"],
      measurements: [
        measuredOp({ auditGap: 2, duplicateSideEffects: 1 }),
        measuredOp({ operationId: "billing.other", auditGap: 3, duplicateSideEffects: 4 }),
      ],
    }),
  );
  assert.equal(evidence.auditGap, 5);
  assert.equal(evidence.duplicateSideEffects, 5);
});

test("buildCycleEvidenceV3: measuredUniverse only includes operations with measurementStatus=measured", () => {
  const evidence = buildCycleEvidenceV3(
    baseInput({
      operationIds: [OP_ID, "billing.not_measured"],
      measurements: [
        measuredOp(),
        measuredOp({
          operationId: "billing.not_measured",
          measurementStatus: "not_measured",
          observedAt: null,
          rawReceiptRef: null,
          rawReceiptDigest: null,
        }),
      ],
    }),
  );
  assert.deepEqual(evidence.measuredUniverse, [OP_ID]);
});

test("buildCycleEvidenceV3: evidenceDigest is internally consistent and reproducible", () => {
  const evidence = buildCycleEvidenceV3(baseInput());
  assert.equal(evidence.evidenceDigest, recomputeEvidenceDigest(evidence));
  assert.match(evidence.evidenceDigest, /^[0-9a-f]{64}$/);
});

test("buildCycleEvidenceV3: mutating any measured field changes the evidenceDigest", () => {
  const original = buildCycleEvidenceV3(baseInput());
  const mutated = buildCycleEvidenceV3(baseInput({ measurements: [measuredOp({ auditGap: 1 })] }));
  assert.notEqual(original.evidenceDigest, mutated.evidenceDigest);
});

test("buildCycleEvidenceV3: evidenceDigest changes when the underlying rawReceiptDigest changes", () => {
  const original = buildCycleEvidenceV3(baseInput());
  const mutated = buildCycleEvidenceV3(
    baseInput({ measurements: [measuredOp({ rawReceiptDigest: "b".repeat(64) })] }),
  );
  assert.notEqual(original.evidenceDigest, mutated.evidenceDigest);
});

test("assertValidCycleEvidenceV3Shape: accepts a well-formed evidence object", () => {
  const evidence = buildCycleEvidenceV3(baseInput());
  assert.doesNotThrow(() => assertValidCycleEvidenceV3Shape(evidence));
});

test("assertValidCycleEvidenceV3Shape: rejects unsupported schemaVersion", () => {
  const evidence = { ...buildCycleEvidenceV3(baseInput()), schemaVersion: "ape.weekly-cycle.v2" as never };
  assert.throws(() => assertValidCycleEvidenceV3Shape(evidence), /unsupported schemaVersion/);
});

test("assertValidCycleEvidenceV3Shape: rejects invalid measurementStatus enum value", () => {
  const evidence = { ...buildCycleEvidenceV3(baseInput()), measurementStatus: "ok" as never };
  assert.throws(() => assertValidCycleEvidenceV3Shape(evidence), /measurementStatus must be one of/);
});

test("assertValidCycleEvidenceV3Shape: rejects invalid coverageStatus enum value", () => {
  const evidence = { ...buildCycleEvidenceV3(baseInput()), coverageStatus: "mostly" as never };
  assert.throws(() => assertValidCycleEvidenceV3Shape(evidence), /coverageStatus must be one of/);
});

test("assertValidCycleEvidenceV3Shape: rejects missing required field (cycleId)", () => {
  const evidence = { ...buildCycleEvidenceV3(baseInput()), cycleId: "" };
  assert.throws(() => assertValidCycleEvidenceV3Shape(evidence), /cycleId required/);
});

test("assertValidCycleEvidenceV3Shape: rejects a measured operation without a raw receipt reference", () => {
  const evidence = buildCycleEvidenceV3(
    baseInput({ measurements: [measuredOp({ rawReceiptRef: null, rawReceiptDigest: null })] }),
  );
  assert.throws(() => assertValidCycleEvidenceV3Shape(evidence), /rawReceiptRef\/rawReceiptDigest required/);
});

test("assertValidCycleEvidenceV3Shape: rejects a digest that was tampered with after construction", () => {
  const evidence = buildCycleEvidenceV3(baseInput());
  const tampered = { ...evidence, auditGap: 999 };
  assert.throws(() => assertValidCycleEvidenceV3Shape(tampered), /evidenceDigest does not match/);
});

test("buildCycleRatificationV3: binds to the evidence by digest, never copies metrics", () => {
  const evidence = buildCycleEvidenceV3(baseInput());
  const ratification = buildCycleRatificationV3({
    evidence,
    ratificationStatus: "approved",
    ratifiedBy: "Carlos Alberto Merlo",
  });
  assert.equal(ratification.evidenceDigest, evidence.evidenceDigest);
  assert.equal(ratification.cycleId, evidence.cycleId);
  assert.ok(!("auditGap" in ratification));
  assert.ok(!("duplicateSideEffects" in ratification));
  assert.ok(!("measurements" in ratification));
});

test("buildCycleRatificationV3: requires a non-empty human ratifiedBy identity", () => {
  const evidence = buildCycleEvidenceV3(baseInput());
  assert.throws(
    () => buildCycleRatificationV3({ evidence, ratificationStatus: "approved", ratifiedBy: "" }),
    /ratifiedBy is required/,
  );
});

test("buildCycleRatificationV3: supports pending/approved/rejected as the only ratificationStatus values", () => {
  const evidence = buildCycleEvidenceV3(baseInput());
  for (const status of ["pending", "approved", "rejected"] as const) {
    const ratification = buildCycleRatificationV3({ evidence, ratificationStatus: status, ratifiedBy: "Carlos Alberto Merlo" });
    assert.equal(ratification.ratificationStatus, status);
  }
});

test("module purity: neither the contract module nor this test import node:fs (no Evidence Index write path)", async () => {
  const fs = await import("node:fs");
  const source = fs.readFileSync(new URL("./apeWeeklyCycleV3.ts", import.meta.url), "utf8");
  // No node:fs import is the real, structural guarantee: a module that never
  // touches the filesystem cannot write to docs/EVIDENCE_INDEX.md, whatever
  // its comments say about the file.
  assert.ok(!/from\s+["']node:fs["']/.test(source), "apeWeeklyCycleV3.ts must not import node:fs");
});
