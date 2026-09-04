/**
 * Independent Validator for ape.weekly-cycle.v3.
 *
 * Ratified boundaries (P1-R2-H) this module must enforce:
 *   - producer !== validator (Decision 9): the validator never accepts
 *     evidence whose producerIdentity matches the validator's own identity.
 *   - the validator MUST recompute auditGap/duplicateSideEffects/
 *     coverageStatus from raw receipts (Decision 10) — it never trusts the
 *     values the producer declared.
 *   - the validator never creates a raw receipt, never mutates the
 *     evidence it is given, and never ratifies (Section 15 of P1-R2-D).
 *   - the expected universe comes from the Governed Operation Catalog, not
 *     from the producer (Decision on "expected universe", P1-R2-D §14).
 *   - legacy v2 artifacts never pass validation (Decision 5): this module
 *     only accepts objects whose schemaVersion is exactly
 *     "ape.weekly-cycle.v3"; nothing here reads
 *     ops/evidence/latest/ape-weekly-cycle-run*.md.
 *   - a single-domain ("domain") evidenceClass never validates as
 *     "systemic" — systemic requires
 *     isGovernedOperationCatalogSystemComplete() === true (Decision 2).
 *
 * This module performs no filesystem or network I/O. It is a pure function
 * over its inputs: CycleEvidenceV3 + the raw receipts the caller already
 * holds + the Governed Operation Catalog already loaded in-process. It does
 * not read or write docs/EVIDENCE_INDEX.md.
 *
 * Scope boundary (found in the P1-R2-R independent review, corrected here):
 *   this validator recomputes the CycleEvidenceV3 AGGREGATES
 *   (auditGap/duplicateSideEffects/coverageStatus) from the values already
 *   present in each RawReceiptV3's `facts[]`, and rejects when the
 *   producer's declared aggregate diverges from that sum — this is what
 *   catches a producer that declares `auditGap: 0` while the raw receipt
 *   shows real gaps, the exact defect this contract exists to prevent.
 *
 *   It does NOT recompute the ratified duplicateSideEffects formula
 *   (Σ max(0, n-1) per semantic group, docs/ops/ape-audit-telemetry-decision.md
 *   §3.2) from raw per-group occurrence counts — `RawMeasurementFact.
 *   duplicateSideEffectsCount` is trusted as already having applied that
 *   formula correctly. Verifying the formula itself, from raw ledger/event
 *   occurrences up to a `RawMeasurementFact`, is the responsibility of
 *   whatever produces the raw receipt (the domain collector, P1-R3 —
 *   not yet implemented). In other words:
 *
 *     cycleEvidence aggregate validation (this module, done)
 *     ≠
 *     raw duplicate-formula validation (P1-R3, not yet done)
 *
 *   A raw receipt whose `duplicateSideEffectsCount` was itself computed
 *   incorrectly would still pass this validator, because this validator has
 *   no visibility into the ledger/event data the raw receipt was derived
 *   from. End-to-end proof of the duplicate formula is not yet established
 *   by this unit.
 */

import {
  APE_WEEKLY_CYCLE_SCHEMA_VERSION,
  assertValidCycleEvidenceV3Shape,
  recomputeEvidenceDigest,
  type CoverageStatus,
  type CycleEvidenceV3,
} from "./apeWeeklyCycleV3";
import { isGovernedOperationCatalogSystemComplete, listGovernedOperations } from "./governedOperationCatalog";

/** One raw, independent measurement fact per operation, backing a `rawReceiptRef`. */
export type RawMeasurementFact = Readonly<{
  operationId: string;
  auditGapCount: number;
  duplicateSideEffectsCount: number;
  sampleSize: number;
}>;

/** A raw independent receipt: content-addressed by `digest`, read-only from the validator's point of view. */
export type RawReceiptV3 = Readonly<{
  ref: string;
  digest: string;
  facts: readonly RawMeasurementFact[];
}>;

export const APE_WEEKLY_CYCLE_V3_FAILURE_REASONS = [
  "unsupported_schema_version",
  "structural_shape_invalid",
  "producer_validator_identity_collision",
  "evidence_digest_mismatch",
  "stale_evidence",
  "unknown_domain_operation",
  "expected_universe_mismatch",
  "systemic_class_without_full_catalog_coverage",
  "raw_receipt_missing",
  "raw_receipt_digest_mismatch",
  "recomputed_metric_mismatch",
  "coverage_status_mismatch",
] as const;
export type ApeWeeklyCycleV3FailureReason = (typeof APE_WEEKLY_CYCLE_V3_FAILURE_REASONS)[number];

export type ApeWeeklyCycleV3ValidationResult = Readonly<{
  validationStatus: "passed" | "rejected";
  failureReasons: readonly ApeWeeklyCycleV3FailureReason[];
  /**
   * The only reason code today `active` in the canonical catalog
   * (packages/core/src/reasons/reasonCatalog.ts). The four
   * APE_TELEMETRY_STALE/COVERAGE_INCOMPLETE/RECEIPT_INVALID/NOT_RATIFIED
   * codes remain `proposed` (ratified P1-R2-H, Decision 8) and are
   * deliberately NOT referenced here until they are activated through the
   * canonical ratification process — see REASON_CODE_ACTIVATION_REQUIRED
   * note in the implementation report.
   */
  fallbackReasonCode: "APE_TELEMETRY_NOT_AVAILABLE" | null;
  recomputed: Readonly<{
    auditGap: number;
    duplicateSideEffects: number;
    coverageStatus: CoverageStatus;
  }>;
  validatorIdentity: string;
}>;

function computeCoverageStatus(params: {
  expectedUniverse: readonly string[];
  measuredUniverse: readonly string[];
  anyMeasured: boolean;
}): CoverageStatus {
  if (params.expectedUniverse.length === 0) return "not_applicable";
  if (!params.anyMeasured) return "no_activity";
  const measuredSet = new Set(params.measuredUniverse);
  const coveredCount = params.expectedUniverse.filter((id) => measuredSet.has(id)).length;
  if (coveredCount === 0) return "no_activity";
  if (coveredCount === params.expectedUniverse.length) return "complete";
  return "partial";
}

/**
 * Validates a CycleEvidenceV3 independently of its producer. Never mutates
 * `evidence`, never creates a raw receipt, never ratifies. Recomputes
 * auditGap/duplicateSideEffects/coverageStatus from `rawReceipts` and
 * compares them against what the producer declared — a mismatch is a
 * rejection, not a warning.
 */
export function validateCycleEvidenceV3(params: {
  evidence: CycleEvidenceV3;
  rawReceipts: readonly RawReceiptV3[];
  validatorIdentity: string;
  maxAgeDays?: number;
  now?: Date;
}): ApeWeeklyCycleV3ValidationResult {
  const { evidence, rawReceipts, validatorIdentity } = params;
  const failureReasons: ApeWeeklyCycleV3FailureReason[] = [];

  // AUTHORITY_VALIDATION — producer !== validator (Decision 9).
  if (
    !validatorIdentity ||
    !validatorIdentity.trim() ||
    evidence.provenance?.producerIdentity === validatorIdentity
  ) {
    failureReasons.push("producer_validator_identity_collision");
  }

  // STRUCTURAL_VALIDATION.
  if (evidence.schemaVersion !== APE_WEEKLY_CYCLE_SCHEMA_VERSION) {
    failureReasons.push("unsupported_schema_version");
  }
  try {
    assertValidCycleEvidenceV3Shape(evidence);
  } catch {
    failureReasons.push("structural_shape_invalid");
  }

  // EVIDENCE_VALIDATION — the stored digest must match the recomputed digest
  // of everything else in the object (tamper/mutation detection).
  if (evidence.evidenceDigest !== recomputeEvidenceDigest(evidence)) {
    failureReasons.push("evidence_digest_mismatch");
  }

  // Freshness.
  const maxAgeDays = params.maxAgeDays ?? 14;
  const now = params.now ?? new Date();
  const generatedAtMs = Date.parse(evidence.generatedAt);
  if (Number.isFinite(generatedAtMs)) {
    const ageDays = (now.getTime() - generatedAtMs) / (1000 * 60 * 60 * 24);
    if (ageDays > maxAgeDays) failureReasons.push("stale_evidence");
  }

  // EXPECTED_UNIVERSE — from the Governed Operation Catalog, never from the
  // producer (P1-R2-D §14: "producer ≠ authority over expected universe").
  const catalogUniverse = listGovernedOperations()
    .filter((op) => op.domain === evidence.domain)
    .map((op) => op.operationId);
  const catalogUniverseSet = new Set(catalogUniverse);

  // Defensive: a malformed evidence object (already flagged above as
  // structural_shape_invalid/unsupported_schema_version) must still be
  // rejectable without crashing the validator — arrays are not assumed.
  const declaredOperationIds = Array.isArray(evidence.operationIds) ? evidence.operationIds : [];
  const declaredExpectedUniverse = Array.isArray(evidence.expectedUniverse) ? evidence.expectedUniverse : [];
  const declaredMeasurements = Array.isArray(evidence.measurements) ? evidence.measurements : [];

  for (const opId of declaredOperationIds) {
    if (!catalogUniverseSet.has(opId)) failureReasons.push("unknown_domain_operation");
  }

  const declaredUniverseSet = new Set(declaredExpectedUniverse);
  const universeMatches =
    catalogUniverse.length > 0 &&
    declaredUniverseSet.size === catalogUniverseSet.size &&
    [...declaredUniverseSet].every((id) => catalogUniverseSet.has(id));
  if (!universeMatches) failureReasons.push("expected_universe_mismatch");

  // Systemic class requires full catalog coverage — a domain-scoped cycle
  // (e.g. billing-only) can never self-declare "systemic" (Decision 2).
  if (evidence.evidenceClass === "systemic" && !isGovernedOperationCatalogSystemComplete()) {
    failureReasons.push("systemic_class_without_full_catalog_coverage");
  }

  // SEMANTIC_VALIDATION — recompute from raw receipts; never trust the
  // producer's declared auditGap/duplicateSideEffects/coverageStatus.
  // Note (see module docblock "Scope boundary"): this sums each
  // RawMeasurementFact.duplicateSideEffectsCount as given — it does not
  // itself recompute Σ max(0, n-1) from raw group occurrences, so a raw
  // receipt with an already-wrong duplicateSideEffectsCount would still
  // pass here. That formula-level proof belongs to the raw receipt
  // producer (P1-R3).
  const receiptByRef = new Map(rawReceipts.map((r) => [r.ref, r] as const));
  let recomputedAuditGap = 0;
  let recomputedDuplicateSideEffects = 0;
  let anyMeasured = false;
  const recomputedMeasuredUniverse: string[] = [];
  let hadMetricMismatch = false;

  for (const measurement of declaredMeasurements) {
    if (measurement.measurementStatus !== "measured") continue;
    anyMeasured = true;

    if (!measurement.rawReceiptRef) {
      failureReasons.push("raw_receipt_missing");
      continue;
    }
    const receipt = receiptByRef.get(measurement.rawReceiptRef);
    if (!receipt) {
      failureReasons.push("raw_receipt_missing");
      continue;
    }
    if (receipt.digest !== measurement.rawReceiptDigest) {
      failureReasons.push("raw_receipt_digest_mismatch");
      continue;
    }
    const fact = receipt.facts.find((f) => f.operationId === measurement.operationId);
    if (!fact) {
      failureReasons.push("raw_receipt_missing");
      continue;
    }

    recomputedAuditGap += fact.auditGapCount;
    recomputedDuplicateSideEffects += fact.duplicateSideEffectsCount;
    recomputedMeasuredUniverse.push(measurement.operationId);

    if (
      fact.auditGapCount !== measurement.auditGap ||
      fact.duplicateSideEffectsCount !== measurement.duplicateSideEffects
    ) {
      hadMetricMismatch = true;
    }
  }

  if (hadMetricMismatch || recomputedAuditGap !== evidence.auditGap || recomputedDuplicateSideEffects !== evidence.duplicateSideEffects) {
    failureReasons.push("recomputed_metric_mismatch");
  }

  const recomputedCoverageStatus = computeCoverageStatus({
    expectedUniverse: catalogUniverse,
    measuredUniverse: recomputedMeasuredUniverse,
    anyMeasured,
  });
  if (recomputedCoverageStatus !== evidence.coverageStatus) {
    failureReasons.push("coverage_status_mismatch");
  }

  const dedupedReasons = [...new Set(failureReasons)];
  const validationStatus: "passed" | "rejected" = dedupedReasons.length === 0 ? "passed" : "rejected";

  return {
    validationStatus,
    failureReasons: dedupedReasons,
    fallbackReasonCode: validationStatus === "rejected" ? "APE_TELEMETRY_NOT_AVAILABLE" : null,
    recomputed: {
      auditGap: recomputedAuditGap,
      duplicateSideEffects: recomputedDuplicateSideEffects,
      coverageStatus: recomputedCoverageStatus,
    },
    validatorIdentity,
  };
}
