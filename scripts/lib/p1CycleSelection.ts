/**
 * Pure evaluation logic for the local P1 `ape.weekly-cycle.v3` checker
 * (Entrega 1 of the M1 integration, ADR-009 §14).
 *
 * No filesystem, network, Prisma or storage-provider imports here or in
 * anything this module imports. `mostRecentMondayUtc`/`computeLastClosedWeekUtc`
 * are deliberately re-implemented locally (not imported from
 * apps/api/src/services/apeWeeklyCycleV3BillingCycle.ts) because that module
 * transitively imports billingReconciliation.ts, which imports a real
 * PrismaClient at module scope — exactly what this checker must never do.
 *
 * This module does not decide P1 eligibility. It reports what it can verify
 * and, just as importantly, what it cannot: `populationCompleteness` is
 * always `not_demonstrated` here because proving that a raw receipt reflects
 * every real Run row would require live access to Run/RunUsageBreakdown/
 * BillingLedger, not just the receipt's own arithmetic. `historyProvenance`
 * is at best `self_declared_unverified` because no append-only index exists
 * yet (that is Entrega 2, explicitly out of scope here) — absence of a
 * reliable history is never read as proof of first generation.
 */

import {
  APE_WEEKLY_CYCLE_SCHEMA_VERSION,
  assertValidCycleEvidenceV3Shape,
  type CycleEvidenceV3,
  type CycleRatificationV3,
} from "../../packages/core/src/catalog/apeWeeklyCycleV3.js";
import {
  validateCycleEvidenceV3,
  type ApeWeeklyCycleV3FailureReason,
  type RawReceiptV3,
} from "../../packages/core/src/catalog/apeWeeklyCycleV3Validator.js";
import type { GovernedOperationDomain } from "../../packages/core/src/catalog/governedOperationCatalog.js";

export const P1_APE_V3_VALIDATOR_IDENTITY = "eiah.p1-ape-weekly-cycle-v3.local-checker.v1";

export type CycleWindow = Readonly<{ from: string; to: string }>;

export type CycleHistoryEntry = Readonly<{ evidenceDigest: string; generatedAt: string }>;

/**
 * Local, package-level metadata proposal (ADR-009 §14, "fechamento de
 * períodos") — NOT part of the ratified `CycleEvidenceV3` schema and NOT a
 * change to the producer's capture policy. "provisional" means a capture
 * taken before the operator judges every Run created within the window has
 * had time to reach a terminal state (see
 * `apps/api/src/services/billingReconciliation.ts`'s `createdAt`-in-window +
 * `finishedAt IS NOT NULL` population rule, which silently excludes
 * still-running Runs rather than flagging them). "final" is a claim that no
 * further correction is expected. Neither status is verified by this
 * checker — it is a diagnostic label a package may carry, never trusted as
 * proof of anything on its own.
 */
export type CaptureStatus = "provisional" | "final";

export type ClosureClaim = Readonly<{
  cutoffAt: string;
  pendingCount: number;
  expectedPopulationCount: number;
  terminalCount: number;
}>;

export type LoadedCycle = Readonly<{
  evidence: CycleEvidenceV3;
  rawReceipts: readonly RawReceiptV3[];
  ratification: CycleRatificationV3 | null;
  /** Self-declared by the package. Never proof of completeness — see module docblock. */
  history: readonly CycleHistoryEntry[] | null;
  /** Self-declared by the package, diagnostic only. Absent means unknown, never assumed "final". */
  captureStatus?: CaptureStatus | null;
  /** Internal claims only; never independent proof of population completeness. */
  closure?: ClosureClaim | null;
}>;

export type P1EvaluationPolicy = Readonly<{
  /** Must be explicit. "test" labels synthetic fixtures; "operational" is only a label, never an approval. */
  scenario: "test" | "operational";
  scope: Readonly<{ tenantId: string; workspaceId: string; domain: GovernedOperationDomain }> | null;
  approvedPolicyVersion?: "p1-m1-partially-approved.v1";
  expectedOperationIds?: readonly string[];
  requireClosureForAllRequiredWindows?: boolean;
  minCycles: number;
  maxAgeDays: number;
  requireConsecutiveWindows: boolean;
  requireLatestWindowIsLastClosed: boolean;
  /** Days of grace, after a new window closes, during which the previous set of windows may still be required. Never extends per-cycle recency. */
  captureToleranceDays: number;
  requireRatification: boolean;
  /**
   * OPTIONAL — Option C of the recurrence-policy comparison (ADR-009 §14).
   * Not a default; absent unless explicitly set. When present, decouples
   * "how fresh the newest cycle must be" (still `maxAgeDays`, applied only
   * to the single newest selected cycle) from "how long the two OLDER
   * cycles in the trio may remain valid contributors" (this field, applied
   * to every selected cycle except the newest). When absent, `maxAgeDays`
   * applies uniformly to every selected cycle — identical to today's
   * behavior and to Option A. Applying the same numeric limit here as
   * `maxAgeDays` is NOT this option; it is Option A restated.
   */
  historicalCycleMaxAgeDays?: number;
  /**
   * OPTIONAL — proposal for "fechamento de períodos" (ADR-009 §14.13).
   * Absent by default. When set, a self-declared `captureStatus: "final"`
   * is checked for plausibility: it must be at least this many days after
   * the cycle's own window closed (`generatedAt - window.to`). A "final"
   * claimed earlier is flagged `implausible_final_classification` — it is
   * never trusted just because the package says so. Does not apply to
   * `captureStatus: "provisional"` or absent status.
   */
  finalCaptureMaturationDays?: number;
  /**
   * OPTIONAL — proposal for "fechamento de períodos" (ADR-009 §14.13).
   * Absent by default (identical to today's behavior). When true, the
   * newest of the selected cycles must have a PLAUSIBLE
   * `captureStatus: "final"` (see `finalCaptureMaturationDays`) — a missing,
   * provisional, or implausibly-early "final" claim fails selection. This
   * can be mutually incompatible with `requireLatestWindowIsLastClosed` for
   * as long as `finalCaptureMaturationDays` days have not yet passed since
   * the newest window closed — that incompatibility is exposed, never
   * silently resolved by falling back to an older trio.
   */
  requireFinalCaptureForNewestWindow?: boolean;
  /**
   * OPTIONAL — proposal for Scenario C (ADR-009 §14.16): an alternative to
   * `requireLatestWindowIsLastClosed` that resolves its structural conflict
   * with `requireFinalCaptureForNewestWindow`. Instead of demanding the
   * newest window be the one that closed most recently (which cannot yet
   * have a plausible "final" capture during the maturation period), this
   * demands the newest window be the most recent one that SHOULD ALREADY
   * have matured — i.e. `computeLastClosedWeekUtc(checkerNow -
   * finalCaptureMaturationDays)`. Requires `finalCaptureMaturationDays` to
   * be set; the required window is a deterministic function of policy and
   * clock, never of which packages happen to be available — a missing or
   * still-pending matured window blocks, it never falls back to an older trio.
   */
  requireLatestWindowIsLastMatured?: boolean;
}>;

// ---------------------------------------------------------------------------
// Local-only failure reasons. Distinct from ApeWeeklyCycleV3FailureReason
// (the independent validator's own set) and from the global canonical
// reason-code catalog (packages/core/src/reasons/reasonCatalog.ts).
//
// Governance basis (verified, not assumed from precedent alone): the
// canonical catalog's own enforcement — scripts/checkReasonCodeCanon.ts:15-23
// (`REASON_CODE_CANON_TARGETS`) — is a closed, named list of 8 files. Neither
// this module nor apeWeeklyCycleV3Validator.ts's own local failure reasons
// (e.g. "scope_mismatch") are in that list, and `pnpm check:reason-code-canon`
// passes unaffected by this module's existence (re-run and confirmed during
// the review that produced this comment). This is not "another module does
// it, so it's fine" — it is the actual enforced scope boundary of the canon,
// checked directly. If the canon's target list is ever widened to include
// files in scripts/, these identifiers would need registration then, not
// before.
// ---------------------------------------------------------------------------
export const P1_APE_V3_LOCAL_REASONS = [
  "future_generated_at",
  "scope_out_of_policy",
  "inconsistent_measurement_windows",
  "missing_window",
  "window_not_consecutive",
  "window_not_latest_closed",
  "version_conflict_unresolved",
  "insufficient_distinct_cycles",
  "sample_size_zero",
  "threshold_exceeded",
  "ratification_missing_or_incompatible",
  "insufficient_history",
  "implausible_final_classification",
  "newest_window_not_final",
  "window_not_yet_matured",
  "required_window_missing",
  "closure_claim_invalid",
  "closure_cutoff_inconsistent",
  "known_pending_runs",
  "capture_not_final",
  "operations_out_of_policy",
] as const;
export type P1ApeV3LocalReason = (typeof P1_APE_V3_LOCAL_REASONS)[number];

export type AnyFailureReason = ApeWeeklyCycleV3FailureReason | P1ApeV3LocalReason;

// ---------------------------------------------------------------------------
// Pure week-boundary math (deliberately duplicated, see module docblock).
// ---------------------------------------------------------------------------

export function mostRecentMondayUtc(date: Date): Date {
  const truncated = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
  const day = truncated.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  truncated.setUTCDate(truncated.getUTCDate() - daysSinceMonday);
  return truncated;
}

export function computeLastClosedWeekUtc(now: Date): CycleWindow {
  const currentWeekStart = mostRecentMondayUtc(now);
  const closedWeekStart = new Date(currentWeekStart);
  closedWeekStart.setUTCDate(closedWeekStart.getUTCDate() - 7);
  return { from: closedWeekStart.toISOString(), to: currentWeekStart.toISOString() };
}

function daysBetween(laterMs: number, earlierMs: number): number {
  return (laterMs - earlierMs) / (1000 * 60 * 60 * 24);
}

// ---------------------------------------------------------------------------
// Window extraction from evidence (no top-level `window` field exists on
// CycleEvidenceV3 — it lives per-measurement in `observedAt`).
// ---------------------------------------------------------------------------

export function extractCycleWindow(evidence: CycleEvidenceV3): { window: CycleWindow | null; inconsistent: boolean } {
  // Defensive: a malformed package can supply `measurements` as something
  // other than an array. This must be reported as an ordinary structural
  // failure (packageConsistency), never allowed to throw and abort
  // evaluation of the whole cycle — see `structural_shape_invalid` handling
  // in evaluateSingleCycle, which already catches assertValidCycleEvidenceV3Shape.
  if (!Array.isArray(evidence.measurements)) return { window: null, inconsistent: false };
  const measured = evidence.measurements.filter((m) => m && m.measurementStatus === "measured" && m.observedAt);
  if (measured.length === 0) return { window: null, inconsistent: false };
  const first = measured[0].observedAt as CycleWindow;
  const inconsistent = measured.some((m) => m.observedAt!.from !== first.from || m.observedAt!.to !== first.to);
  return { window: inconsistent ? null : first, inconsistent };
}

function sumMeasured(evidence: CycleEvidenceV3, field: "sampleSize"): number {
  if (!Array.isArray(evidence.measurements)) return 0;
  return evidence.measurements
    .filter((m) => m && m.measurementStatus === "measured")
    .reduce((sum, m) => sum + (typeof m[field] === "number" ? m[field] : 0), 0);
}

// ---------------------------------------------------------------------------
// Per-cycle guarantee evaluation.
// ---------------------------------------------------------------------------

export type PerCycleGuarantees = Readonly<{
  cycleId: string;
  window: CycleWindow | null;
  generatedAt: string;
  /**
   * Internal consistency of the package for this cycle: schema, shape,
   * digest, AND consistency of the declared metrics against the raw
   * receipts INCLUDED in this same package. This is deliberately NOT the
   * same claim as "verified against the source" — see
   * `metricsVerifiedAgainstSource` below, which is a separate, independent
   * category that this field never satisfies on its own.
   */
  packageConsistency: Readonly<{
    status: "passed" | "failed";
    recomputedFromIncludedReceipts: Readonly<{ auditGap: number; duplicateSideEffects: number }> | null;
    failureReasons: readonly AnyFailureReason[];
  }>;
  /**
   * Always `not_demonstrated` in this entrega. Verifying that the numbers
   * are correct against the actual source of truth (Run/RunUsageBreakdown/
   * BillingLedger) requires live access this local checker does not have.
   * `packageConsistency` passing does NOT imply this passes — they are
   * independent, and resolving one in a future entrega does not resolve
   * the other automatically.
   */
  metricsVerifiedAgainstSource: Readonly<{ status: "not_demonstrated"; reason: string }>;
  thresholds: Readonly<{
    status: "passed" | "failed";
    sampleSize: number;
    auditGap: number;
    duplicateSideEffects: number;
    failureReasons: readonly AnyFailureReason[];
  }>;
  recency: Readonly<{
    status: "passed" | "failed";
    /** The value actually used to decide pass/fail — see `governingBasis`. */
    governingAgeDays: number | null;
    governingBasis: "generatedAt" | "self_declared_history";
    /** The threshold actually compared against — `policy.maxAgeDays` unless the caller passed an Option C override for a non-newest cycle. */
    appliedMaxAgeDays: number;
    /** Diagnostic only. Using the artifact's own generatedAt in isolation — never proof of first generation. */
    ageDaysFromGeneratedAt: number | null;
    /** Diagnostic only. Using the earliest entry of a self-declared history — never proof no earlier version was omitted. Null when no history was supplied. */
    ageDaysFromSelfDeclaredHistory: number | null;
    anchorGeneratedAt: string;
    failureReasons: readonly AnyFailureReason[];
  }>;
  historyProvenance: Readonly<{
    status: "absent" | "self_declared_unverified" | "failed";
    note: string;
    failureReasons: readonly AnyFailureReason[];
  }>;
  ratification: Readonly<{ status: "passed" | "failed" | "not_required"; failureReasons: readonly AnyFailureReason[] }>;
  /**
   * Plausibility check of a self-declared `captureStatus`, never proof of
   * actual completeness — a "final" label is only checked against its own
   * timestamps, never against the real population (see
   * p1OperationalPackage.ts's `completenessAndAuthenticityOfInputs`, which
   * this never satisfies).
   */
  closureConsistency: Readonly<{
    status: "passed" | "failed" | "not_provided";
    cutoffAt: string | null;
    failureReasons: readonly AnyFailureReason[];
  }>;
  captureMaturity: Readonly<{
    status: "not_declared" | "provisional" | "final_plausible" | "final_implausible";
    daysSinceWindowClose: number | null;
    failureReasons: readonly AnyFailureReason[];
  }>;
}>;

const HISTORY_PROVENANCE_NOTE =
  "diagnostic only: this entrega has no append-only index by cycleId, so history is at best self-declared and unverified. Absence of history is never read as proof of first generation; presence of self-declared history is never read as proof no earlier version was omitted. This status can never reach a verified state in this delivery.";

type HistoryEvaluation = Readonly<{
  status: "absent" | "self_declared_unverified" | "failed";
  /** The anchor actually used to gate recency: earliest self-declared generation when available and internally consistent, else the record's own generatedAt. */
  anchorGeneratedAt: string;
  ageDaysFromGeneratedAt: number | null;
  ageDaysFromSelfDeclaredHistory: number | null;
  failureReasons: AnyFailureReason[];
}>;

/**
 * Evaluates the anchor timestamp for recency purposes from a self-declared
 * history array, and separately reports both candidate ages so a reader
 * never has to guess which basis produced a given pass/fail.
 *
 * A history that is present is checked only for internal consistency:
 * current digest present, no future-dated entries relative to `checkerNow`,
 * no contradictory entries (the same digest claimed with two different
 * generatedAt values), and no unparseable timestamps. None of these checks
 * — nor their success — ever promotes the history to "confiável"/verified;
 * that would require an append-only index this entrega does not build
 * (Entrega 2). Absence of history is `absent`, never silently treated as
 * "this must be the first generation".
 */
function evaluateHistoryAndAnchor(
  evidence: CycleEvidenceV3,
  history: readonly CycleHistoryEntry[] | null,
  checkerNow: Date,
): HistoryEvaluation {
  const currentMs = Date.parse(evidence.generatedAt);
  const ageDaysFromGeneratedAt = Number.isFinite(currentMs) ? daysBetween(checkerNow.getTime(), currentMs) : null;

  if (!history || history.length === 0) {
    return {
      status: "absent",
      anchorGeneratedAt: evidence.generatedAt,
      ageDaysFromGeneratedAt,
      ageDaysFromSelfDeclaredHistory: null,
      failureReasons: ["insufficient_history"],
    };
  }

  const includesCurrent = history.some((h) => h.evidenceDigest === evidence.evidenceDigest && Date.parse(h.generatedAt) === currentMs);
  const hasInvalidTimestamp = history.some((h) => Number.isNaN(Date.parse(h.generatedAt)));
  const hasFutureTimestamp = history.some((h) => Date.parse(h.generatedAt) > checkerNow.getTime());
  const byDigest = new Map<string, Set<string>>();
  for (const h of history) {
    const set = byDigest.get(h.evidenceDigest) ?? new Set<string>();
    set.add(h.generatedAt);
    byDigest.set(h.evidenceDigest, set);
  }
  const hasContradiction = [...byDigest.values()].some((generatedAts) => generatedAts.size > 1);

  const earliestKnown = [evidence.generatedAt, ...history.map((h) => h.generatedAt)]
    .filter((at) => Number.isFinite(Date.parse(at)) && Date.parse(at) <= checkerNow.getTime())
    .sort((a, b) => Date.parse(a) - Date.parse(b))[0];

  if (!includesCurrent || hasInvalidTimestamp || hasFutureTimestamp || hasContradiction) {
    // A self-declared history that is internally impossible is worse than no
    // history at all — it is rejected outright (a stricter status than
    // "absent"), never silently trusted or silently ignored in favor of the
    // artifact's own generatedAt.
    return {
      status: "failed",
      anchorGeneratedAt: earliestKnown ?? evidence.generatedAt,
      ageDaysFromGeneratedAt,
      ageDaysFromSelfDeclaredHistory: earliestKnown ? daysBetween(checkerNow.getTime(), Date.parse(earliestKnown)) : null,
      failureReasons: ["insufficient_history"],
    };
  }

  const sorted = [...history, { evidenceDigest: evidence.evidenceDigest, generatedAt: evidence.generatedAt }].sort((a, b) => Date.parse(a.generatedAt) - Date.parse(b.generatedAt));
  const earliest = sorted[0].generatedAt;
  const ageDaysFromSelfDeclaredHistory = daysBetween(checkerNow.getTime(), Date.parse(earliest));

  return {
    status: "self_declared_unverified",
    anchorGeneratedAt: earliest,
    ageDaysFromGeneratedAt,
    ageDaysFromSelfDeclaredHistory,
    failureReasons: [],
  };
}

export function evaluateSingleCycle(
  cycle: LoadedCycle,
  policy: P1EvaluationPolicy,
  checkerNow: Date,
  /**
   * The recency threshold actually applied to THIS cycle. Defaults to
   * `policy.maxAgeDays` (Option A/today's behavior). The caller (which
   * knows each cycle's position within the selected trio) passes
   * `policy.historicalCycleMaxAgeDays` here for non-newest cycles under
   * Option C — this function itself has no notion of "position", by design,
   * to keep it a pure per-cycle evaluator.
   */
  effectiveMaxAgeDays: number = policy.maxAgeDays,
): PerCycleGuarantees {
  const { evidence, rawReceipts, ratification, history } = cycle;
  const { window } = extractCycleWindow(evidence);

  // (a) Package consistency: schema/shape/digest, reusing the existing shape assertion.
  const packageFailures: AnyFailureReason[] = [];
  if (evidence.schemaVersion !== APE_WEEKLY_CYCLE_SCHEMA_VERSION) packageFailures.push("unsupported_schema_version");
  try {
    assertValidCycleEvidenceV3Shape(evidence);
  } catch {
    packageFailures.push("structural_shape_invalid");
  }
  if (policy.expectedOperationIds) {
    const expected = [...policy.expectedOperationIds].sort();
    if (JSON.stringify([...evidence.operationIds].sort()) !== JSON.stringify(expected) ||
        JSON.stringify([...evidence.expectedUniverse].sort()) !== JSON.stringify(expected)) {
      packageFailures.push("operations_out_of_policy");
    }
  }
  const { inconsistent } = extractCycleWindow(evidence);
  if (inconsistent) packageFailures.push("inconsistent_measurement_windows");
  if (!window) packageFailures.push("missing_window");

  // Consistency of the declared metrics against the raw receipts INCLUDED in
  // this package. This folds into packageConsistency — it is internal
  // consistency of what was supplied locally, never "verified against the
  // source" (Run/RunUsageBreakdown/BillingLedger). See
  // `metricsVerifiedAgainstSource` below for that independent, always
  // not-demonstrated category.
  const validation = validateCycleEvidenceV3({
    evidence,
    rawReceipts,
    validatorIdentity: P1_APE_V3_VALIDATOR_IDENTITY,
    maxAgeDays: effectiveMaxAgeDays,
    now: checkerNow,
  });
  const receiptConsistencyReasons = validation.failureReasons.filter(
    (r) => r !== "stale_evidence" && r !== "producer_validator_identity_collision",
  );
  packageFailures.push(...receiptConsistencyReasons);
  if (validation.failureReasons.includes("producer_validator_identity_collision")) {
    packageFailures.push("producer_validator_identity_collision");
  }

  // History/provenance: recency is anchored on the earliest generation
  // already claimed for this cycle (self-declared, never verified — see
  // evaluateHistoryAndAnchor docblock), never on the current record's own
  // generatedAt alone. This is the anti-gaming property required by ADR-009
  // §14.4: a regeneration with a fresh generatedAt must NOT appear younger
  // than the true first generation just because history was supplied (or
  // withheld). Both candidate ages are reported as diagnostics; only one of
  // them (`governingAgeDays`) is actually used to decide pass/fail, and
  // which one is always disclosed via `governingBasis`.
  const historyResult = evaluateHistoryAndAnchor(evidence, history, checkerNow);
  const governingBasis: "generatedAt" | "self_declared_history" =
    historyResult.ageDaysFromSelfDeclaredHistory !== null ? "self_declared_history" : "generatedAt";

  const recencyFailures: AnyFailureReason[] = [];
  const anchorMs = Date.parse(historyResult.anchorGeneratedAt);
  const currentMs = Date.parse(evidence.generatedAt);
  let governingAgeDays: number | null = null;
  if (!Number.isFinite(anchorMs) || !Number.isFinite(currentMs)) {
    recencyFailures.push("structural_shape_invalid");
  } else if (currentMs > checkerNow.getTime()) {
    // The record's own generatedAt is checked for future-dating regardless
    // of anchor — a future timestamp is always invalid on its own terms.
    recencyFailures.push("future_generated_at");
  } else {
    governingAgeDays = daysBetween(checkerNow.getTime(), anchorMs);
    if (governingAgeDays > effectiveMaxAgeDays) recencyFailures.push("stale_evidence");
  }

  // Thresholds — sampleSize>0 (docs/ops/ape-audit-telemetry-decision.md:153-155)
  // and auditGap===0/duplicateSideEffects===0 (ADR-007 §15 item 3), evaluated
  // against the RECOMPUTED values, never the producer's own declaration.
  // These are only as trustworthy as packageConsistency allows — they are
  // not independently verified against the source either.
  const sampleSize = sumMeasured(evidence, "sampleSize");
  const thresholdFailures: AnyFailureReason[] = [];
  if (sampleSize <= 0) thresholdFailures.push("sample_size_zero");
  if (validation.recomputed.auditGap !== 0 || validation.recomputed.duplicateSideEffects !== 0) {
    thresholdFailures.push("threshold_exceeded");
  }

  // Ratification — separate from technical validation and from the release
  // gate's own ratification requirement (ape-audit-telemetry-decision.md:76,
  // ReleasePromotionTelemetry — a different gate, not this one).
  let ratificationResult: PerCycleGuarantees["ratification"];
  if (!policy.requireRatification) {
    ratificationResult = { status: "not_required", failureReasons: [] };
  } else {
    const ok =
      !!ratification &&
      ratification.evidenceDigest === evidence.evidenceDigest &&
      ratification.ratificationStatus === "approved" &&
      !!ratification.ratifiedBy?.trim();
    ratificationResult = { status: ok ? "passed" : "failed", failureReasons: ok ? [] : ["ratification_missing_or_incompatible"] };
  }

  // Capture maturity — plausibility only. A "provisional" label never fails
  // here (there is no minimum age for admitting a capture is provisional).
  // A "final" label is checked against its own timestamps when
  // `policy.finalCaptureMaturationDays` is set; it is never checked against
  // the real population, which this module cannot see.
  let captureMaturity: PerCycleGuarantees["captureMaturity"];
  const daysSinceWindowClose = window ? daysBetween(Date.parse(evidence.generatedAt), Date.parse(window.to)) : null;
  if (!cycle.captureStatus) {
    captureMaturity = { status: "not_declared", daysSinceWindowClose, failureReasons: [] };
  } else if (cycle.captureStatus === "provisional") {
    captureMaturity = { status: "provisional", daysSinceWindowClose, failureReasons: [] };
  } else {
    const maturationDays = policy.finalCaptureMaturationDays;
    const implausible = maturationDays !== undefined && (daysSinceWindowClose === null || daysSinceWindowClose < maturationDays);
    captureMaturity = {
      status: implausible ? "final_implausible" : "final_plausible",
      daysSinceWindowClose,
      failureReasons: implausible ? ["implausible_final_classification"] : [],
    };
  }

  const closureFailures: AnyFailureReason[] = [];
  const claim = cycle.closure;
  if (claim) {
    const counts = [claim.pendingCount, claim.expectedPopulationCount, claim.terminalCount];
    if (!counts.every((n) => Number.isSafeInteger(n) && n >= 0) ||
        claim.expectedPopulationCount !== claim.pendingCount + claim.terminalCount) {
      closureFailures.push("closure_claim_invalid");
    }
    const cutoffMs = typeof claim.cutoffAt === "string" && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(claim.cutoffAt)
      ? Date.parse(claim.cutoffAt) : NaN;
    const closeMs = window ? Date.parse(window.to) : NaN;
    if (!Number.isFinite(cutoffMs) || !Number.isFinite(closeMs) || cutoffMs < closeMs ||
        cutoffMs > currentMs || cutoffMs > checkerNow.getTime() ||
        (cycle.captureStatus === "final" && cutoffMs < closeMs + (policy.finalCaptureMaturationDays ?? 0) * 86400000)) {
      closureFailures.push("closure_cutoff_inconsistent");
    }
    if (claim.pendingCount > 0) closureFailures.push("known_pending_runs");
  }
  if (policy.requireClosureForAllRequiredWindows && cycle.captureStatus !== "final") closureFailures.push("capture_not_final");

  return {
    closureConsistency: {
      status: closureFailures.length ? "failed" : claim ? "passed" : "not_provided",
      cutoffAt: claim?.cutoffAt ?? null,
      failureReasons: closureFailures,
    },
    cycleId: evidence.cycleId,
    window,
    generatedAt: evidence.generatedAt,
    packageConsistency: {
      status: packageFailures.length === 0 ? "passed" : "failed",
      recomputedFromIncludedReceipts: { auditGap: validation.recomputed.auditGap, duplicateSideEffects: validation.recomputed.duplicateSideEffects },
      failureReasons: [...new Set(packageFailures)],
    },
    metricsVerifiedAgainstSource: {
      status: "not_demonstrated",
      reason:
        "only checked against the raw receipts included in this package (see packageConsistency); no live query against Run/RunUsageBreakdown/BillingLedger was performed",
    },
    thresholds: {
      status: thresholdFailures.length === 0 ? "passed" : "failed",
      sampleSize,
      auditGap: validation.recomputed.auditGap,
      duplicateSideEffects: validation.recomputed.duplicateSideEffects,
      failureReasons: thresholdFailures,
    },
    recency: {
      status: recencyFailures.length === 0 ? "passed" : "failed",
      governingAgeDays,
      governingBasis,
      /** The threshold actually compared against — `policy.maxAgeDays` unless the caller passed an Option C override for a non-newest cycle. */
      appliedMaxAgeDays: effectiveMaxAgeDays,
      ageDaysFromGeneratedAt: historyResult.ageDaysFromGeneratedAt,
      ageDaysFromSelfDeclaredHistory: historyResult.ageDaysFromSelfDeclaredHistory,
      anchorGeneratedAt: historyResult.anchorGeneratedAt,
      failureReasons: recencyFailures,
    },
    historyProvenance: { status: historyResult.status, note: HISTORY_PROVENANCE_NOTE, failureReasons: historyResult.failureReasons },
    ratification: ratificationResult,
    captureMaturity,
  };
}

// ---------------------------------------------------------------------------
// Selection: scope filtering, dedup, conflict detection, consecutiveness.
// Never silently narrows to a "convenient" subset — every input cycle is
// reported as included or excluded, with an explicit reason.
// ---------------------------------------------------------------------------

export type CycleConsideration = Readonly<{
  cycleId: string;
  evidenceDigest: string;
  window: CycleWindow | null;
  generatedAt: string;
  included: boolean;
  exclusionReasons: readonly AnyFailureReason[];
  /** Self-declared by the package, diagnostic only — see `CaptureStatus`. */
  captureStatus?: CaptureStatus | null;
  /**
   * Set only on a version conflict. Distinguishes an apparent
   * provisional-then-final progression (informational — the `final` entry's
   * `evidence.supersedesEvidenceRef` points at the `provisional` entry's
   * digest) from an unexplained divergence. Neither case is auto-resolved:
   * both versions are still excluded, per ADR-009 §14.4 — this label never
   * changes that outcome, it only explains it.
   */
  conflictKind?: "provisional_superseded_by_final_unresolved" | "unexplained_divergence";
}>;

export type SelectionResult = Readonly<{
  considered: readonly CycleConsideration[];
  selectedWindows: readonly CycleWindow[];
  selectedCycleIds: readonly string[];
  consecutive: boolean;
  latestWindowIsLastClosed: boolean | null;
  latestWindowWithinTolerance: boolean | null;
  /** Scenario C proposal — see `requireLatestWindowIsLastMatured` docblock. Null when the option is not in use. */
  latestWindowIsLastMatured: boolean | null;
  /** The deterministic window `requireLatestWindowIsLastMatured` expects, independent of what happens to be in the package. Null when the option is not in use. */
  expectedMaturedWindow: CycleWindow | null;
  requiredWindows: readonly CycleWindow[];
  failureReasons: readonly AnyFailureReason[];
}>;

function inScope(evidence: CycleEvidenceV3, policy: P1EvaluationPolicy): boolean {
  return (
    !!policy.scope && evidence.domain === policy.scope.domain &&
    evidence.tenantId === policy.scope.tenantId &&
    evidence.workspaceId === policy.scope.workspaceId
  );
}

export function selectCycles(cycles: readonly LoadedCycle[], policy: P1EvaluationPolicy, checkerNow: Date): SelectionResult {
  const expectedMaturedWindow = policy.requireLatestWindowIsLastMatured
    ? computeLastClosedWeekUtc(new Date(checkerNow.getTime() - (policy.finalCaptureMaturationDays ?? 0) * 86400000))
    : null;
  // Approved M1 fixes the required set BEFORE inspecting available evidence.
  const requiredWindows: CycleWindow[] = [];
  if (policy.approvedPolicyVersion && expectedMaturedWindow) {
    for (let i = policy.minCycles - 1; i >= 0; i--) {
      requiredWindows.push({
        from: new Date(Date.parse(expectedMaturedWindow.from) - i * 7 * 86400000).toISOString(),
        to: new Date(Date.parse(expectedMaturedWindow.to) - i * 7 * 86400000).toISOString(),
      });
    }
  }
  const considered: CycleConsideration[] = [];
  const failureReasons: AnyFailureReason[] = [];

  type Candidate = { evidence: CycleEvidenceV3; window: CycleWindow; captureStatus?: CaptureStatus | null };
  const byWindowStart = new Map<string, Candidate[]>();
  const seenDigests = new Set<string>();

  for (const cycle of cycles) {
    const { evidence, captureStatus } = cycle;
    const { window, inconsistent } = extractCycleWindow(evidence);
    const base = { cycleId: evidence.cycleId, evidenceDigest: evidence.evidenceDigest, generatedAt: evidence.generatedAt, window, captureStatus };

    if (!inScope(evidence, policy)) {
      considered.push({ ...base, included: false, exclusionReasons: ["scope_out_of_policy"] });
      continue;
    }
    if (!window || inconsistent) {
      considered.push({ ...base, included: false, exclusionReasons: ["missing_window"] });
      continue;
    }
    const dedupKey = JSON.stringify([evidence.evidenceDigest, cycle.captureStatus ?? null, cycle.closure ?? null, cycle.history, cycle.rawReceipts]);
    if (seenDigests.has(dedupKey)) {
      considered.push({ ...base, included: false, exclusionReasons: [] }); // exact duplicate digest: harmless, not an error
      continue;
    }
    seenDigests.add(dedupKey);
    const list = byWindowStart.get(window.from) ?? [];
    list.push({ evidence, window, captureStatus });
    byWindowStart.set(window.from, list);
  }

  const resolvedWindows: Candidate[] = [];
  for (const [, list] of byWindowStart) {
    if (list.length > 1) {
      // Diagnostic only, per item: does THIS entry look like the "final"
      // side of a provisional->final progression against ANY other entry in
      // the same conflicting group? Still excluded either way — see
      // `conflictKind`'s docblock. Never auto-resolved (ADR-009 §14.4).
      for (const item of list) {
        const looksLikeFinalSupersedingAProvisional =
          item.captureStatus === "final" &&
          list.some(
            (other) =>
              other !== item &&
              other.captureStatus === "provisional" &&
              (item.evidence as { supersedesEvidenceRef?: string }).supersedesEvidenceRef === other.evidence.evidenceDigest,
          );
        considered.push({
          cycleId: item.evidence.cycleId,
          evidenceDigest: item.evidence.evidenceDigest,
          generatedAt: item.evidence.generatedAt,
          window: item.window,
          captureStatus: item.captureStatus,
          included: false,
          exclusionReasons: ["version_conflict_unresolved"],
          conflictKind: looksLikeFinalSupersedingAProvisional ? "provisional_superseded_by_final_unresolved" : "unexplained_divergence",
        });
      }
      continue;
    }
    resolvedWindows.push(list[0]);
  }

  resolvedWindows.sort((a, b) => Date.parse(a.window.from) - Date.parse(b.window.from));
  // Bound selection by policy + clock BEFORE taking the newest trio.
  // A newer provisional capture must not displace the required matured window.
  // Missing/conflicting required windows still fail the equality check below.
  const eligibleWindows = expectedMaturedWindow
    ? resolvedWindows.filter((c) => Date.parse(c.window.to) <= Date.parse(expectedMaturedWindow.to))
    : resolvedWindows;
  const selected = requiredWindows.length
    ? requiredWindows.flatMap((required) => resolvedWindows.filter((c) =>
        c.window.from === required.from && c.window.to === required.to))
    : eligibleWindows.slice(-policy.minCycles);
  if (requiredWindows.some((required) => !selected.some((c) => c.window.from === required.from && c.window.to === required.to))) {
    failureReasons.push("required_window_missing");
  }
  const selectedFroms = new Set(selected.map((c) => c.window.from));

  for (const item of resolvedWindows) {
    if (selectedFroms.has(item.window.from)) {
      considered.push({
        cycleId: item.evidence.cycleId,
        evidenceDigest: item.evidence.evidenceDigest,
        generatedAt: item.evidence.generatedAt,
        window: item.window,
        captureStatus: item.captureStatus,
        included: true,
        exclusionReasons: [],
      });
    } else {
      considered.push({
        cycleId: item.evidence.cycleId,
        evidenceDigest: item.evidence.evidenceDigest,
        generatedAt: item.evidence.generatedAt,
        window: item.window,
        captureStatus: item.captureStatus,
        included: false,
        exclusionReasons: [], // outside the policy/clock selection range; not itself a failure
      });
    }
  }

  if (selected.length < policy.minCycles) {
    failureReasons.push("insufficient_distinct_cycles");
  }

  let consecutive = true;
  for (let i = 1; i < selected.length; i++) {
    if (selected[i - 1].window.to !== selected[i].window.from) {
      consecutive = false;
      break;
    }
  }
  // Reported whenever it is determinable (>=2 selected), independent of
  // whether the count also meets minCycles — insufficient count and
  // non-consecutive windows are two separate, independently-determinable
  // problems, and both are surfaced rather than the count check hiding the
  // consecutiveness result.
  if (policy.requireConsecutiveWindows && selected.length > 1 && !consecutive) {
    failureReasons.push("window_not_consecutive");
  }

  let latestWindowIsLastClosed: boolean | null = null;
  let latestWindowWithinTolerance: boolean | null = null;
  if (policy.requireLatestWindowIsLastClosed && selected.length > 0) {
    const realLastClosed = computeLastClosedWeekUtc(checkerNow);
    const newest = selected[selected.length - 1].window;
    latestWindowIsLastClosed = newest.from === realLastClosed.from;
    if (!latestWindowIsLastClosed) {
      const isOneWindowBehind = newest.to === realLastClosed.from;
      // `realLastClosed` became "the last closed window" at its own `.to`
      // boundary (the moment the current week began) — not at its `.from`,
      // which is a full week earlier. The grace period is measured from
      // that transition, never from the window's own start.
      const daysSinceRealLastClosedBecameCurrent = daysBetween(checkerNow.getTime(), Date.parse(realLastClosed.to));
      latestWindowWithinTolerance = policy.captureToleranceDays > 0 && isOneWindowBehind && daysSinceRealLastClosedBecameCurrent <= policy.captureToleranceDays;
      if (!latestWindowWithinTolerance) failureReasons.push("window_not_latest_closed");
    }
  }

  // Scenario C proposal: an alternative reference point, deterministic from
  // policy + clock alone. A missing or still-pending matured window BLOCKS
  // — it never falls back to accepting whatever older trio happens to be in
  // the package (that would defeat the entire point of this alternative).
  let latestWindowIsLastMatured: boolean | null = null;
  if (expectedMaturedWindow) {
    const newest = selected.at(-1)?.window;
    latestWindowIsLastMatured = newest?.from === expectedMaturedWindow.from;
    if (!latestWindowIsLastMatured) failureReasons.push("window_not_yet_matured");
  }

  return {
    considered,
    requiredWindows,
    selectedWindows: selected.map((c) => c.window),
    selectedCycleIds: selected.map((c) => c.evidence.cycleId),
    consecutive,
    latestWindowIsLastMatured,
    expectedMaturedWindow,
    latestWindowIsLastClosed,
    latestWindowWithinTolerance,
    failureReasons: [...new Set(failureReasons)],
  };
}
