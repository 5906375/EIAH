/**
 * ape.weekly-cycle.v3 — contract for a governed reconciliation cycle.
 *
 * Ratified by docs/ops/ape-audit-telemetry-decision.md §7 (2026-08-20) and
 * formalized by the P1-R2 chain:
 *   - P1-R2-D: technical discovery of the missing contract/validator.
 *   - P1-R2-H: human ratification of scope, vocabulary and authority
 *     boundaries (Carlos Alberto Merlo).
 *   - P1-R2-I (this module): contract + independent validator.
 *
 * This module declares the SHAPE of a cycle's evidence and ratification. It
 * does not measure runtime, does not produce a raw receipt, does not decide
 * GO/NO_GO, and does not write to docs/EVIDENCE_INDEX.md. A definition here
 * is not a promotion — see apeWeeklyCycleV3Validator.ts for the independent
 * checks that must pass before any promotion, and IA_EIAH.md §13 for the
 * separate, human-only unit that may eventually index a ratified cycle.
 *
 * Superseded model (do not read as authoritative):
 *   scripts/ci/ape_cycle_weekly.cjs writes `auditGap`/`duplicateSideEffects`/
 *   `breakGlass` as literal constants (see docs/ops/evidence/
 *   ape-cycles-45-48-audit-2026-07-27.md). Those v2 artifacts
 *   (ops/evidence/latest/ape-weekly-cycle-run*.md) remain readable as
 *   history — LEGACY_V2_READABLE=SIM — but are never accepted or promoted
 *   as v3 evidence — LEGACY_V2_PROMOTABLE_TO_V3=NAO (ratified P1-R2-H,
 *   Decision 5).
 */

import { canonicalDigest } from "../utils/canonicalDigest";
import type { GovernedOperationDomain } from "./governedOperationCatalog";

export const APE_WEEKLY_CYCLE_SCHEMA_VERSION = "ape.weekly-cycle.v3" as const;

// Ratified P1-R2-H, Decision 4 — vocabulary taken verbatim from
// docs/ops/ape-audit-telemetry-decision.md §7.2, not invented here.
export const MEASUREMENT_STATUSES = ["measured", "not_measured", "error"] as const;
export type MeasurementStatus = (typeof MEASUREMENT_STATUSES)[number];

export const COVERAGE_STATUSES = ["complete", "partial", "no_activity", "not_applicable"] as const;
export type CoverageStatus = (typeof COVERAGE_STATUSES)[number];

export const VALIDATION_STATUSES = ["passed", "rejected"] as const;
export type ValidationStatus = (typeof VALIDATION_STATUSES)[number];

export const RATIFICATION_STATUSES = ["pending", "approved", "rejected"] as const;
export type RatificationStatus = (typeof RATIFICATION_STATUSES)[number];

/**
 * Ratified P1-R2-H, Decision 2: a cycle scoped to a single domain is
 * DOMAIN evidence. It can never be read as SYSTEMIC evidence just because it
 * passed validation and was ratified — promotion to `systemic` requires the
 * Governed Operation Catalog to report full coverage
 * (`isGovernedOperationCatalogSystemComplete() === true`), enforced by the
 * validator, not declared by the producer.
 */
export type ApeWeeklyCycleEvidenceClass = "domain" | "systemic";

/** Per-operation measurement, carrying its own measurement window. */
export type MeasuredOperationV3 = Readonly<{
  operationId: string;
  measurementStatus: MeasurementStatus;
  /** The window this measurement covers. Null only when measurementStatus !== "measured". */
  observedAt: Readonly<{ from: string; to: string }> | null;
  sampleSize: number;
  auditGap: number;
  duplicateSideEffects: number;
  /** Reference to the raw independent receipt backing this measurement. */
  rawReceiptRef: string | null;
  rawReceiptDigest: string | null;
}>;

export type CycleEvidenceV3Provenance = Readonly<{
  commitSha: string;
  workflowRunId: string | null;
  /** Identity of the producer/collector process that emitted this evidence. */
  producerIdentity: string;
}>;

/** Fields the producer supplies. Aggregates and the digest are derived, never hand-authored. */
export type CycleEvidenceV3Input = Readonly<{
  cycleId: string;
  generatedAt: string;
  domain: GovernedOperationDomain;
  evidenceClass: ApeWeeklyCycleEvidenceClass;
  operationIds: readonly string[];
  /**
   * The universe of operations this cycle claims to cover. This field is
   * producer-supplied for structural purposes only — the validator never
   * trusts it as authoritative; it always recomputes the expected universe
   * from the Governed Operation Catalog (ratified P1-R2-H: producer cannot
   * define the expected universe).
   */
  expectedUniverse: readonly string[];
  measurements: readonly MeasuredOperationV3[];
  measurementStatus: MeasurementStatus;
  coverageStatus: CoverageStatus;
  provenance: CycleEvidenceV3Provenance;
  limitations?: readonly string[];
  /** Only codes already `active` in the reason code canon may be used here. */
  reasonCodes?: readonly string[];
}>;

export type CycleEvidenceV3 = CycleEvidenceV3Input &
  Readonly<{
    schemaVersion: typeof APE_WEEKLY_CYCLE_SCHEMA_VERSION;
    /** Sum of measurements[].auditGap. Derived, never hand-authored. */
    auditGap: number;
    /** Sum of measurements[].duplicateSideEffects (already Σ max(0, n-1) per group upstream). */
    duplicateSideEffects: number;
    /** operationIds actually present in `measurements`. Derived. */
    measuredUniverse: readonly string[];
    /** canonicalDigest() of every field above except this one. */
    evidenceDigest: string;
  }>;

export type CycleRatificationV3 = Readonly<{
  schemaVersion: typeof APE_WEEKLY_CYCLE_SCHEMA_VERSION;
  cycleId: string;
  /** Binds to a CycleEvidenceV3 by digest. Never embeds or copies its metrics. */
  evidenceDigest: string;
  ratificationStatus: RatificationStatus;
  /** Human identity. Ratified P1-R2-H, Decision 3: Carlos Alberto Merlo or an explicitly authorized human delegate — never automation. */
  ratifiedBy: string;
  ratifiedAt: string;
  reasonCode?: string;
  evidenceRef?: string;
}>;

function omitEvidenceDigest(evidence: CycleEvidenceV3): Record<string, unknown> {
  const { evidenceDigest: _evidenceDigest, ...rest } = evidence;
  return rest as unknown as Record<string, unknown>;
}

/**
 * Builds a CycleEvidenceV3 from producer input: derives the aggregate
 * auditGap/duplicateSideEffects (Σ over measurements — same formula ratified
 * for billing, docs/ops/ape-audit-telemetry-decision.md §3.2), the measured
 * universe, and the evidenceDigest. Pure function — no I/O, no filesystem,
 * no Evidence Index access.
 */
export function buildCycleEvidenceV3(input: CycleEvidenceV3Input): CycleEvidenceV3 {
  const auditGap = input.measurements.reduce((sum, m) => sum + m.auditGap, 0);
  const duplicateSideEffects = input.measurements.reduce((sum, m) => sum + m.duplicateSideEffects, 0);
  const measuredUniverse = input.measurements
    .filter((m) => m.measurementStatus === "measured")
    .map((m) => m.operationId);

  const withoutDigest: Omit<CycleEvidenceV3, "evidenceDigest"> = {
    ...input,
    schemaVersion: APE_WEEKLY_CYCLE_SCHEMA_VERSION,
    auditGap,
    duplicateSideEffects,
    measuredUniverse,
  };

  const evidenceDigest = canonicalDigest(withoutDigest as unknown as Record<string, unknown>);

  return { ...withoutDigest, evidenceDigest };
}

/**
 * Recomputes the evidenceDigest of a given CycleEvidenceV3 the same way
 * buildCycleEvidenceV3 did, for independent comparison against the stored
 * `evidenceDigest`. Used by the validator, never by the producer.
 */
export function recomputeEvidenceDigest(evidence: CycleEvidenceV3): string {
  return canonicalDigest(omitEvidenceDigest(evidence));
}

/**
 * Builds a CycleRatificationV3 bound to a specific CycleEvidenceV3 by digest.
 * Never accepts or copies measurement fields — ratification is a decision
 * about the fact, not a rewrite of it (docs/ops/ape-audit-telemetry-decision.md
 * §7.1).
 */
export function buildCycleRatificationV3(params: {
  evidence: CycleEvidenceV3;
  ratificationStatus: RatificationStatus;
  ratifiedBy: string;
  ratifiedAt?: string;
  reasonCode?: string;
  evidenceRef?: string;
}): CycleRatificationV3 {
  if (!params.ratifiedBy || !params.ratifiedBy.trim()) {
    throw new Error("cycle_ratification_v3_invalid: ratifiedBy is required and must be a human identity");
  }
  return {
    schemaVersion: APE_WEEKLY_CYCLE_SCHEMA_VERSION,
    cycleId: params.evidence.cycleId,
    evidenceDigest: params.evidence.evidenceDigest,
    ratificationStatus: params.ratificationStatus,
    ratifiedBy: params.ratifiedBy,
    ratifiedAt: params.ratifiedAt ?? new Date().toISOString(),
    ...(params.reasonCode ? { reasonCode: params.reasonCode } : {}),
    ...(params.evidenceRef ? { evidenceRef: params.evidenceRef } : {}),
  };
}

/**
 * Structural self-consistency check of a CycleEvidenceV3 object: closed
 * enums, required fields present, digest internally consistent with its own
 * content. This is the contract's own invariant (mirrors
 * assertValidGovernedOperationDefinition in governedOperationCatalog.ts) —
 * it does NOT check the evidence against the Governed Operation Catalog, a
 * raw receipt, or any other external authority. Those cross-cutting checks
 * belong to the Independent Validator (apeWeeklyCycleV3Validator.ts).
 */
export function assertValidCycleEvidenceV3Shape(evidence: CycleEvidenceV3): void {
  const errors: string[] = [];

  if (evidence.schemaVersion !== APE_WEEKLY_CYCLE_SCHEMA_VERSION) {
    errors.push(`unsupported schemaVersion: ${String(evidence.schemaVersion)}`);
  }
  if (!evidence.cycleId || !evidence.cycleId.trim()) errors.push("cycleId required");
  if (!evidence.generatedAt || Number.isNaN(Date.parse(evidence.generatedAt))) {
    errors.push("generatedAt must be a valid ISO timestamp");
  }
  if (!MEASUREMENT_STATUSES.includes(evidence.measurementStatus)) {
    errors.push(`measurementStatus must be one of ${MEASUREMENT_STATUSES.join("|")}`);
  }
  if (!COVERAGE_STATUSES.includes(evidence.coverageStatus)) {
    errors.push(`coverageStatus must be one of ${COVERAGE_STATUSES.join("|")}`);
  }
  if (!evidence.provenance?.producerIdentity || !evidence.provenance.producerIdentity.trim()) {
    errors.push("provenance.producerIdentity required");
  }
  if (!Array.isArray(evidence.measurements)) {
    errors.push("measurements must be an array");
  } else {
    for (const m of evidence.measurements) {
      if (!MEASUREMENT_STATUSES.includes(m.measurementStatus)) {
        errors.push(`measurements[].measurementStatus invalid for operationId=${m.operationId}`);
      }
      if (m.measurementStatus === "measured" && !m.observedAt) {
        errors.push(`measurements[].observedAt required when measurementStatus="measured" (operationId=${m.operationId})`);
      }
      if (m.measurementStatus === "measured" && (!m.rawReceiptRef || !m.rawReceiptDigest)) {
        errors.push(`measurements[].rawReceiptRef/rawReceiptDigest required when measurementStatus="measured" (operationId=${m.operationId})`);
      }
    }
  }
  if (!evidence.evidenceDigest || evidence.evidenceDigest !== recomputeEvidenceDigest(evidence)) {
    errors.push("evidenceDigest does not match recomputed digest of the evidence content");
  }

  if (errors.length > 0) {
    throw new Error(`cycle_evidence_v3_invalid: ${errors.join("; ")}`);
  }
}
