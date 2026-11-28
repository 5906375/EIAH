/**
 * Local checker (Entrega 1 of M1, ADR-009 §14) for `ape.weekly-cycle.v3`
 * evidence packages against explicit P1 policy parameters.
 *
 * This tool never approves P1 return. It has two modes:
 *
 *   --mode package  verifies internal consistency of a local evidence
 *                    package (schema, digest, evidence<->receipt linkage,
 *                    metric recomputation against the INCLUDED receipts).
 *                    A `resultCategory: "OK"` (exit 0) means only that —
 *                    it is not an approval of P1 eligibility.
 *
 *   --mode gate      additionally evaluates policy-driven gate eligibility
 *                    (scope, distinct consecutive windows, recency,
 *                    thresholds, ratification, history). Because this
 *                    entrega has no live access to Run/RunUsageBreakdown/
 *                    BillingLedger and no append-only history index,
 *                    `populationCompleteness` and full `historyProvenance`
 *                    can never be demonstrated here — gate mode can
 *                    therefore never report `resultCategory: "OK"`; its
 *                    best possible outcome is `GUARANTEE_NOT_DEMONSTRATED`
 *                    (exit 3), never gate approval.
 *
 * No Prisma, storage-provider or network import anywhere in this module or
 * its dependencies — see scripts/lib/p1CycleSelection.ts's docblock for why.
 *
 * Usage:
 *   node --import tsx scripts/checkP1ApeWeeklyCycleV3.ts \
 *     --mode package --package <path.json> --policy <path.json> [--checker-now <ISO>]
 *
 * See docs/ops/p1-ape-weekly-cycle-v3-checker.md for full usage and fixtures.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type { CycleEvidenceV3, CycleRatificationV3 } from "../packages/core/src/catalog/apeWeeklyCycleV3.js";
import type { RawReceiptV3 } from "../packages/core/src/catalog/apeWeeklyCycleV3Validator.js";
import {
  evaluateSingleCycle,
  selectCycles,
  type CycleHistoryEntry,
  type LoadedCycle,
  type P1EvaluationPolicy,
} from "./lib/p1CycleSelection.js";

export const CHECK_NAME = "check:p1-ape-weekly-cycle-v3";
export const PACKAGE_SCHEMA_VERSION = "p1-ape-weekly-cycle-v3-local-package.v1";

type Mode = "package" | "gate";
type ResultCategory = "OK" | "INPUT_ERROR" | "VALIDATION_FAILED" | "GUARANTEE_NOT_DEMONSTRATED";

export type CliArgs = Readonly<{
  mode: Mode;
  packagePath: string;
  policyPath: string;
  checkerNowIso: string | null;
}>;

export class InputError extends Error {}

export function parseArgs(argv: readonly string[]): CliArgs {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const mode = get("--mode");
  if (mode !== "package" && mode !== "gate") {
    throw new InputError('--mode is required and must be "package" or "gate"');
  }
  const packagePath = get("--package");
  if (!packagePath) throw new InputError("--package <path.json> is required");
  const policyPath = get("--policy");
  if (!policyPath) throw new InputError("--policy <path.json> is required");
  const checkerNowIso = get("--checker-now") ?? null;
  if (checkerNowIso && Number.isNaN(Date.parse(checkerNowIso))) {
    throw new InputError(`--checker-now is not a valid ISO timestamp: ${checkerNowIso}`);
  }
  return { mode, packagePath, policyPath, checkerNowIso };
}

function readJson(filePath: string, label: string): unknown {
  let raw: string;
  try {
    raw = readFileSync(path.resolve(filePath), "utf8");
  } catch (error) {
    throw new InputError(`cannot read ${label} at ${filePath}: ${(error as Error).message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new InputError(`${label} at ${filePath} is not valid JSON: ${(error as Error).message}`);
  }
}

const SUPPORTED_DOMAINS = ["billing"] as const;

export function validatePolicy(raw: unknown): P1EvaluationPolicy {
  if (typeof raw !== "object" || raw === null) throw new InputError("policy must be a JSON object");
  const p = raw as Record<string, unknown>;

  if (p.schemaVersion !== undefined) {
    const approved = JSON.parse(readFileSync(new URL("./policies/p1-m1-partially-approved.v1.json", import.meta.url), "utf8")) as Record<string, unknown>;
    if (p.schemaVersion !== approved.schemaVersion) throw new InputError("unsupported policy.schemaVersion");
    // The versioned approved rules cannot be overridden by package/config claims.
    for (const key of Object.keys(p)) {
      if (!(key in approved) && key !== "fixtureScope") throw new InputError(`unsupported approved-policy field: ${key}`);
    }
    for (const key of Object.keys(approved)) {
      if (key === "scenario") continue;
      if (JSON.stringify(p[key]) !== JSON.stringify(approved[key])) throw new InputError(`approved policy.${key} cannot be overridden`);
    }
    if (p.scenario !== "test" && p.scenario !== "operational") throw new InputError("invalid policy.scenario");
    let fixtureScope: P1EvaluationPolicy["scope"] = null;
    let operations: string[] | undefined;
    if (p.scenario === "operational" && p.fixtureScope !== undefined) throw new InputError("fixtureScope is test-only; canonical operational scope is not configured");
    if (p.scenario === "test") {
      const fixture = p.fixtureScope as Record<string, unknown> | undefined;
      if (!fixture || typeof fixture.tenantId !== "string" || !fixture.tenantId.trim() ||
          typeof fixture.workspaceId !== "string" || !fixture.workspaceId.trim() || fixture.domain !== "billing" ||
          !Array.isArray(fixture.operationIds) || !fixture.operationIds.length ||
          !fixture.operationIds.every((op) => typeof op === "string" && op.trim()) ||
          new Set(fixture.operationIds).size !== fixture.operationIds.length) {
        throw new InputError("test policy requires explicit synthetic fixtureScope and operationIds");
      }
      fixtureScope = { tenantId: fixture.tenantId, workspaceId: fixture.workspaceId, domain: "billing" };
      operations = fixture.operationIds as string[];
    }
    return {
      ...(approved as unknown as P1EvaluationPolicy),
      scenario: p.scenario,
      scope: fixtureScope,
      expectedOperationIds: operations,
      approvedPolicyVersion: "p1-m1-partially-approved.v1",
    };
  }

  if (p.scenario !== "test" && p.scenario !== "operational") {
    throw new InputError('policy.scenario is required and must be "test" or "operational"');
  }
  const scope = p.scope as Record<string, unknown> | undefined;
  if (
    !scope ||
    typeof scope.tenantId !== "string" ||
    !scope.tenantId.trim() ||
    typeof scope.workspaceId !== "string" ||
    !scope.workspaceId.trim() ||
    typeof scope.domain !== "string"
  ) {
    throw new InputError("policy.scope.{tenantId,workspaceId,domain} are required non-empty strings");
  }
  if (!(SUPPORTED_DOMAINS as readonly string[]).includes(scope.domain)) {
    throw new InputError(`policy.scope.domain must be one of ${SUPPORTED_DOMAINS.join("|")}, got: ${scope.domain}`);
  }
  if (typeof p.minCycles !== "number" || !Number.isInteger(p.minCycles) || p.minCycles < 1) {
    throw new InputError("policy.minCycles is required and must be a positive integer");
  }
  if (typeof p.maxAgeDays !== "number" || !(p.maxAgeDays > 0)) {
    throw new InputError("policy.maxAgeDays is required and must be a positive number");
  }
  if (typeof p.requireConsecutiveWindows !== "boolean") {
    throw new InputError("policy.requireConsecutiveWindows is required and must be a boolean");
  }
  if (typeof p.requireLatestWindowIsLastClosed !== "boolean") {
    throw new InputError("policy.requireLatestWindowIsLastClosed is required and must be a boolean");
  }
  if (typeof p.captureToleranceDays !== "number" || p.captureToleranceDays < 0) {
    throw new InputError("policy.captureToleranceDays is required and must be a number >= 0");
  }
  if (typeof p.requireRatification !== "boolean") {
    throw new InputError("policy.requireRatification is required and must be a boolean");
  }
  // Optional — Option C (ADR-009 §14 proposal). Absent by default; when
  // present, must be >= maxAgeDays (an older cycle cannot be held to a
  // STRICTER limit than the newest one — that would be self-contradictory,
  // never a real Option C).
  let historicalCycleMaxAgeDays: number | undefined;
  if (p.historicalCycleMaxAgeDays !== undefined) {
    if (typeof p.historicalCycleMaxAgeDays !== "number" || !(p.historicalCycleMaxAgeDays > 0)) {
      throw new InputError("policy.historicalCycleMaxAgeDays, when present, must be a positive number");
    }
    if (p.historicalCycleMaxAgeDays < p.maxAgeDays) {
      throw new InputError("policy.historicalCycleMaxAgeDays, when present, must be >= policy.maxAgeDays");
    }
    historicalCycleMaxAgeDays = p.historicalCycleMaxAgeDays;
  }

  // Optional — proposal for "fechamento de períodos" (ADR-009 §14.13/§14.16).
  let finalCaptureMaturationDays: number | undefined;
  if (p.finalCaptureMaturationDays !== undefined) {
    if (typeof p.finalCaptureMaturationDays !== "number" || !Number.isFinite(p.finalCaptureMaturationDays) || !(p.finalCaptureMaturationDays >= 0)) {
      throw new InputError("policy.finalCaptureMaturationDays, when present, must be a number >= 0");
    }
    finalCaptureMaturationDays = p.finalCaptureMaturationDays;
  }
  let requireFinalCaptureForNewestWindow: boolean | undefined;
  if (p.requireFinalCaptureForNewestWindow !== undefined) {
    if (typeof p.requireFinalCaptureForNewestWindow !== "boolean") {
      throw new InputError("policy.requireFinalCaptureForNewestWindow, when present, must be a boolean");
    }
    requireFinalCaptureForNewestWindow = p.requireFinalCaptureForNewestWindow;
  }
  let requireLatestWindowIsLastMatured: boolean | undefined;
  if (p.requireLatestWindowIsLastMatured !== undefined) {
    if (typeof p.requireLatestWindowIsLastMatured !== "boolean") {
      throw new InputError("policy.requireLatestWindowIsLastMatured, when present, must be a boolean");
    }
    requireLatestWindowIsLastMatured = p.requireLatestWindowIsLastMatured;
  }

  if (requireLatestWindowIsLastMatured && finalCaptureMaturationDays === undefined) {
    throw new InputError("policy.requireLatestWindowIsLastMatured requires explicit policy.finalCaptureMaturationDays");
  }

  return {
    scenario: p.scenario,
    scope: { tenantId: scope.tenantId, workspaceId: scope.workspaceId, domain: scope.domain as "billing" },
    minCycles: p.minCycles,
    maxAgeDays: p.maxAgeDays,
    requireConsecutiveWindows: p.requireConsecutiveWindows,
    requireLatestWindowIsLastClosed: p.requireLatestWindowIsLastClosed,
    captureToleranceDays: p.captureToleranceDays,
    requireRatification: p.requireRatification,
    ...(historicalCycleMaxAgeDays !== undefined ? { historicalCycleMaxAgeDays } : {}),
    ...(finalCaptureMaturationDays !== undefined ? { finalCaptureMaturationDays } : {}),
    ...(requireFinalCaptureForNewestWindow !== undefined ? { requireFinalCaptureForNewestWindow } : {}),
    ...(requireLatestWindowIsLastMatured !== undefined ? { requireLatestWindowIsLastMatured } : {}),
  };
}

function validateHistory(raw: unknown, index: number): readonly CycleHistoryEntry[] | null {
  if (raw === null || raw === undefined) return null;
  if (!Array.isArray(raw)) throw new InputError(`cycles[${index}].history must be an array or null`);
  return raw.map((entry, hi) => {
    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof (entry as Record<string, unknown>).evidenceDigest !== "string" ||
      typeof (entry as Record<string, unknown>).generatedAt !== "string"
    ) {
      throw new InputError(`cycles[${index}].history[${hi}] must be { evidenceDigest: string, generatedAt: string }`);
    }
    return entry as CycleHistoryEntry;
  });
}

export function validatePackage(raw: unknown): readonly LoadedCycle[] {
  if (typeof raw !== "object" || raw === null) throw new InputError("package must be a JSON object");
  const pkg = raw as Record<string, unknown>;
  if (pkg.schemaVersion !== PACKAGE_SCHEMA_VERSION) {
    throw new InputError(`package.schemaVersion must be "${PACKAGE_SCHEMA_VERSION}", got: ${String(pkg.schemaVersion)}`);
  }
  if (!Array.isArray(pkg.cycles) || pkg.cycles.length === 0) {
    throw new InputError("package.cycles must be a non-empty array");
  }

  return pkg.cycles.map((entry, index) => {
    if (typeof entry !== "object" || entry === null) throw new InputError(`cycles[${index}] must be an object`);
    const c = entry as Record<string, unknown>;
    if (typeof c.evidence !== "object" || c.evidence === null) {
      throw new InputError(`cycles[${index}].evidence is required and must be an object`);
    }
    if (!Array.isArray(c.rawReceipts)) {
      throw new InputError(`cycles[${index}].rawReceipts is required and must be an array`);
    }
    const ratification = c.ratification === null || c.ratification === undefined ? null : (c.ratification as CycleRatificationV3);
    if (ratification !== null && (typeof ratification !== "object" || Array.isArray(ratification))) {
      throw new InputError(`cycles[${index}].ratification must be an object or null`);
    }
    const history = validateHistory(c.history, index);
    if (c.captureStatus !== undefined && c.captureStatus !== null && c.captureStatus !== "provisional" && c.captureStatus !== "final") {
      throw new InputError(`cycles[${index}].captureStatus, when present, must be "provisional", "final", or null`);
    }
    const captureStatus = (c.captureStatus as "provisional" | "final" | null | undefined) ?? null;

    return {
      evidence: c.evidence as CycleEvidenceV3,
      rawReceipts: c.rawReceipts as readonly RawReceiptV3[],
      ratification,
      history,
      captureStatus,
      // Preserve the claim for local consistency checks, not as verified proof.
      closure: c.closure as LoadedCycle["closure"],
    };
  });
}

function resolveCheckerNow(iso: string | null): { checkerNow: Date; checkerNowSource: "real" | "simulated" } {
  if (iso) return { checkerNow: new Date(iso), checkerNowSource: "simulated" };
  return { checkerNow: new Date(), checkerNowSource: "real" };
}

function emit(payload: Record<string, unknown>, resultCategory: ResultCategory, exitCode: number): void {
  const withDisclaimer = {
    ...payload,
    resultCategory,
    disclaimer:
      resultCategory === "OK"
        ? "package mode: internal consistency only — this is not an approval of P1 eligibility."
        : "this tool does not approve P1 return. See docs/ops/p1-ape-weekly-cycle-v3-checker.md.",
  };
  if (exitCode === 0) {
    console.log(JSON.stringify(withDisclaimer, null, 2));
  } else {
    console.error(JSON.stringify(withDisclaimer, null, 2));
  }
  process.exitCode = exitCode;
}

const METRICS_VERIFIED_AGAINST_SOURCE_REASON =
  "only checked against the raw receipts included in the package (see packageConsistency); no live query against Run/RunUsageBreakdown/BillingLedger was performed";
const POPULATION_COMPLETENESS_REASON =
  "proving the raw receipt reflects every real Run row requires live access to Run/RunUsageBreakdown/BillingLedger, not available to this local checker (Entrega 2 dependency)";

type SafeEvaluation =
  | { ok: true; cycleId: string; guarantees: ReturnType<typeof evaluateSingleCycle> }
  | { ok: false; cycleId: string | null; error: string };

/**
 * Never lets a malformed cycle crash the whole run. A structural problem
 * `evaluateSingleCycle` cannot anticipate is reported as `not_evaluated`,
 * never silently skipped and never fabricated as a pass.
 */
function safeEvaluate(
  cycle: LoadedCycle,
  policy: P1EvaluationPolicy,
  checkerNow: Date,
  effectiveMaxAgeDays?: number,
): SafeEvaluation {
  const cycleIdGuess =
    typeof cycle?.evidence === "object" && cycle.evidence !== null && typeof (cycle.evidence as Record<string, unknown>).cycleId === "string"
      ? ((cycle.evidence as Record<string, unknown>).cycleId as string)
      : null;
  try {
    const guarantees = evaluateSingleCycle(cycle, policy, checkerNow, effectiveMaxAgeDays);
    return { ok: true, cycleId: guarantees.cycleId, guarantees };
  } catch (error) {
    return { ok: false, cycleId: cycleIdGuess, error: (error as Error).message };
  }
}

export function runPackageMode(cycles: readonly LoadedCycle[], policy: P1EvaluationPolicy, checkerNow: Date, checkerNowSource: string) {
  const results = cycles.map((cycle) => {
    const evaluated = safeEvaluate(cycle, policy, checkerNow);
    if (!evaluated.ok) {
      return { cycleId: evaluated.cycleId, window: null, packageConsistency: { status: "not_evaluated" as const, error: evaluated.error } };
    }
    return {
      cycleId: evaluated.guarantees.cycleId,
      window: evaluated.guarantees.window,
      packageConsistency: evaluated.guarantees.packageConsistency,
    };
  });
  const failed = results.some((r) => r.packageConsistency.status === "failed" || r.packageConsistency.status === "not_evaluated");
  const category: ResultCategory = failed ? "VALIDATION_FAILED" : "OK";
  const payload = {
    ok: !failed,
    mode: "package" as const,
    check: CHECK_NAME,
    checkerNow: checkerNow.toISOString(),
    checkerNowSource,
    scenario: policy.scenario,
    cycles: results,
  };
  emit(payload, category, failed ? 2 : 0);
}

export function runGateMode(cycles: readonly LoadedCycle[], policy: P1EvaluationPolicy, checkerNow: Date, checkerNowSource: string) {
  const selection = selectCycles(cycles, policy, checkerNow);
  const byCycleId = new Map(cycles.map((c) => [c.evidence.cycleId, c] as const));
  const lastIndex = selection.selectedCycleIds.length - 1;
  const evaluated = selection.selectedCycleIds
    .map((id, index) => {
      const cycle = byCycleId.get(id);
      const isNewest = policy.approvedPolicyVersion
        ? selection.selectedWindows[index]?.from === selection.expectedMaturedWindow?.from
        : index === lastIndex;
      return { cycle, isNewest };
    })
    .filter((entry): entry is { cycle: LoadedCycle; isNewest: boolean } => !!entry.cycle)
    .map(({ cycle, isNewest }) => {
      const effectiveMaxAgeDays = isNewest ? policy.maxAgeDays : (policy.historicalCycleMaxAgeDays ?? policy.maxAgeDays);
      return safeEvaluate(cycle, policy, checkerNow, effectiveMaxAgeDays);
    });

  const notEvaluated = evaluated.filter((e): e is Extract<SafeEvaluation, { ok: false }> => !e.ok);
  const selected = evaluated.filter((e): e is Extract<SafeEvaluation, { ok: true }> => e.ok).map((e) => e.guarantees);
  const newest = policy.approvedPolicyVersion
    ? selected.find((c) => c.window?.from === selection.expectedMaturedWindow?.from) ?? null
    : selected.length > 0 ? selected[selected.length - 1] : null;
  const scopeNotConfigured = !!policy.approvedPolicyVersion && !policy.scope;

  // Proposal (ADR-009 §14.13/§14.16): the newest selected cycle must carry a
  // PLAUSIBLE "final" classification. This can be mutually incompatible with
  // `requireLatestWindowIsLastClosed` when the newest window closed less
  // than `finalCaptureMaturationDays` ago — that incompatibility is exposed
  // here, never hidden by silently falling back to an older window.
  const newestNotFinalFailures: string[] =
    policy.requireFinalCaptureForNewestWindow && newest && newest.captureMaturity.status !== "final_plausible"
      ? ["newest_window_not_final"]
      : [];

  // --- Six independent guarantee categories. Determining and reporting all
  // of them (not stopping at the first failure) is required: each is
  // resolved by a different, unrelated future effort (an index for history,
  // live DB access for source verification and population completeness),
  // and satisfying one must never be read as satisfying the others.
  const selectionFailed = selection.failureReasons.length > 0;
  const packageConsistencyFailed =
    notEvaluated.length > 0 || selected.some((g) => g.packageConsistency.status === "failed");
  const policyComplianceFailures = [
    ...selected.flatMap((g) => [
      ...(g.thresholds.status === "failed" ? g.thresholds.failureReasons : []),
      ...(g.recency.status === "failed" ? g.recency.failureReasons : []),
      ...(g.ratification.status === "failed" ? g.ratification.failureReasons : []),
      ...(g.captureMaturity.status === "final_implausible" ? g.captureMaturity.failureReasons : []),
      ...g.closureConsistency.failureReasons,
    ]),
    ...newestNotFinalFailures,
  ];
  const policyComplianceFailed = selectionFailed || policyComplianceFailures.length > 0;
  const historyProvenanceFailed = selected.some((g) => g.historyProvenance.status === "failed");
  const historyProvenanceVerified = false; // structurally impossible in this entrega — see docs/ops/p1-ape-weekly-cycle-v3-checker.md

  const guarantees = {
    packageConsistency: {
      status: scopeNotConfigured ? ("not_evaluated" as const) : packageConsistencyFailed ? ("failed" as const) : ("passed" as const),
      failureReasons: [
        ...notEvaluated.map((e) => `not_evaluated:${e.cycleId ?? "unknown"}:${e.error}`),
        ...selected.flatMap((g) => (g.packageConsistency.status === "failed" ? g.packageConsistency.failureReasons : [])),
      ],
    },
    policyCompliance: {
      status: scopeNotConfigured ? ("not_evaluated" as const) : policyComplianceFailed ? ("failed" as const) : ("passed" as const),
      failureReasons: [...selection.failureReasons, ...policyComplianceFailures],
      ...(policy.approvedPolicyVersion ? { basis: "local_claims_only; independent proof remains blocked" } : {}),
    },
    historyProvenance: {
      // Never "passed"/"verified" in this entrega — see historyProvenanceVerified.
      status: historyProvenanceFailed ? ("failed" as const) : ("not_verified" as const),
      verified: historyProvenanceVerified,
      note: "self-declared history is checked for internal consistency only; it is never proof no earlier version was omitted, and this can never reach a verified state in this delivery (requires an append-only index by cycleId, Entrega 2)",
    },
    metricsVerifiedAgainstSource: { status: "not_demonstrated" as const, reason: METRICS_VERIFIED_AGAINST_SOURCE_REASON },
    populationCompleteness: { status: "not_demonstrated" as const, reason: POPULATION_COMPLETENESS_REASON },
    ...(policy.approvedPolicyVersion ? {
      operationalScope: {
        status: "not_configured" as const,
        evaluationScope: policy.scenario === "test" ? "synthetic_fixture_only" : "none",
        reason: "canonical tenant/workspace and operation universe remain pending; a fixture is not an operational designation",
      },
      closureProof: {
        status: "not_demonstrated" as const,
        reason: "cutoff/counts/final are self-declared; independent population and terminality verification is unavailable",
        missingClaims: selected.filter((c) => c.closureConsistency.status === "not_provided").map((c) => c.cycleId),
      },
      executionProvenance: {
        status: "not_demonstrated" as const,
        reason: "no trusted binding between declared code, execution, timestamps and package",
      },
    } : {}),
  };

  // A concrete, fixable-by-better-input problem (packageConsistency or
  // policyCompliance) is VALIDATION_FAILED. historyProvenance not being
  // verified, metricsVerifiedAgainstSource, and populationCompleteness are
  // structural limitations of this entrega, never fixable by better input —
  // their absence alone yields GUARANTEE_NOT_DEMONSTRATED, the ceiling for
  // gate mode in this delivery.
  const validationFailed = guarantees.packageConsistency.status === "failed" || guarantees.policyCompliance.status === "failed";
  const category: ResultCategory = validationFailed ? "VALIDATION_FAILED" : "GUARANTEE_NOT_DEMONSTRATED";

  const blockedBy = [
    ...(guarantees.packageConsistency.status === "failed" ? ["packageConsistency"] : []),
    ...(guarantees.policyCompliance.status === "failed" ? ["policyCompliance"] : []),
    "historyProvenance", // always listed — this status can never reach "verified" in this entrega
    "metricsVerifiedAgainstSource", // always listed — never demonstrated in this entrega
    "populationCompleteness", // always listed — never demonstrated in this entrega
    ...(policy.approvedPolicyVersion ? ["operationalScope", "closureProof", "executionProvenance"] : []),
  ];

  const gateEligibility = {
    status: "not_approved" as const,
    // Listing every independent blocker, not just the first — resolving one
    // (e.g. building the history index) does not clear the others.
    blockedBy: [...new Set(blockedBy)],
  };

  const payload = {
    ok: false,
    mode: "gate" as const,
    check: CHECK_NAME,
    checkerNow: checkerNow.toISOString(),
    checkerNowSource,
    scenario: policy.scenario,
    policy,
    considered: selection.considered,
    selectionPolicyCompliance: {
      status: selectionFailed || newestNotFinalFailures.length > 0 ? "failed" : "passed",
      consecutive: selection.consecutive,
      latestWindowIsLastClosed: selection.latestWindowIsLastClosed,
      latestWindowWithinTolerance: selection.latestWindowWithinTolerance,
      latestWindowIsLastMatured: selection.latestWindowIsLastMatured,
      expectedMaturedWindow: selection.expectedMaturedWindow,
      requiredWindows: selection.requiredWindows,
      newestWindowFinalRequired: policy.requireFinalCaptureForNewestWindow ?? false,
      newestWindowFinalSatisfied: newest ? newest.captureMaturity.status === "final_plausible" : null,
      failureReasons: [...selection.failureReasons, ...newestNotFinalFailures],
    },
    notEvaluated: notEvaluated.map((e) => ({ cycleId: e.cycleId, error: e.error })),
    selectedCycles: selected,
    guarantees,
    gateEligibility,
  };
  emit(payload, category, validationFailed ? 2 : 3);
}

function runCli(): void {
  try {
    const args = parseArgs(process.argv.slice(2));
    const packageJson = readJson(args.packagePath, "package");
    const policyJson = readJson(args.policyPath, "policy");
    const policy = validatePolicy(policyJson);
    const cycles = validatePackage(packageJson);
    const { checkerNow, checkerNowSource } = resolveCheckerNow(args.checkerNowIso);

    if (args.mode === "package") {
      runPackageMode(cycles, policy, checkerNow, checkerNowSource);
    } else {
      runGateMode(cycles, policy, checkerNow, checkerNowSource);
    }
  } catch (error) {
    if (error instanceof InputError) {
      console.error(JSON.stringify({ ok: false, check: CHECK_NAME, resultCategory: "INPUT_ERROR", message: error.message }, null, 2));
      process.exitCode = 1;
      return;
    }
    console.error(JSON.stringify({ ok: false, check: CHECK_NAME, resultCategory: "INPUT_ERROR", message: (error as Error).message }, null, 2));
    process.exitCode = 1;
  }
}

const entryPoint = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (entryPoint === import.meta.url) runCli();
