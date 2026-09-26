import type { PrismaClient } from "@repo/db";
import { canonicalDigest } from "@eiah/core/utils/canonicalDigest";
import {
  BILLING_RUN_COST_DEBIT_OPERATION_ID,
  listGovernedOperations,
} from "@eiah/core/catalog/governedOperationCatalog";
import {
  buildCycleEvidenceV3,
  assertValidCycleEvidenceV3Shape,
  type CoverageStatus,
  type CycleEvidenceV3,
  type CycleEvidenceV3Input,
  type CycleRatificationV3,
  type MeasuredOperationV3,
} from "@eiah/core/catalog/apeWeeklyCycleV3";
import {
  validateCycleEvidenceV3,
  type ApeWeeklyCycleV3ValidationResult,
} from "@eiah/core/catalog/apeWeeklyCycleV3Validator";
import { collectBillingRawReceiptV3, reloadAndVerifyBillingRawReceiptV3 } from "./apeWeeklyCycleV3BillingCollector";
import { persistBuffer, loadStoredObject, storedObjectExists, buildScopedStorageKey } from "./storage";

/**
 * Independent validator identity for ape.weekly-cycle.v3 (P1-R3-CYCLE-H,
 * Decision 6). A fixed, canonical constant — not user input, not derived
 * from the producer. IDENTITY_ENFORCEMENT remains PARTIAL: this is a plain
 * string, not a cryptographic signature. SignerManager integration is
 * explicitly deferred, not done silently here.
 */
export const APE_WEEKLY_CYCLE_V3_VALIDATOR_IDENTITY = "eiah.ape-weekly-cycle-v3.independent-validator.v1" as const;

export const VALIDATION_RESULT_SCHEMA_VERSION = "ape.weekly-cycle-v3.validation-result.v1" as const;

/** One fully closed [from, to) calendar week in UTC. Never the current, still-open week. */
export type ClosedBillingCycleWindow = Readonly<{ from: string; to: string }>;

function mostRecentMondayUtc(date: Date): Date {
  const truncated = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
  const day = truncated.getUTCDay(); // 0=Sun,1=Mon,...,6=Sat
  const daysSinceMonday = (day + 6) % 7; // Mon->0, Tue->1, ..., Sun->6
  truncated.setUTCDate(truncated.getUTCDate() - daysSinceMonday);
  return truncated;
}

function computeLastClosedWeek(now: Date): ClosedBillingCycleWindow {
  const currentWeekStart = mostRecentMondayUtc(now);
  const closedWeekStart = new Date(currentWeekStart);
  closedWeekStart.setUTCDate(closedWeekStart.getUTCDate() - 7);
  return { from: closedWeekStart.toISOString(), to: currentWeekStart.toISOString() };
}

/**
 * The most recent FULLY CLOSED calendar week (Monday 00:00:00.000 UTC
 * inclusive to the following Monday 00:00:00.000 UTC exclusive), as of the
 * real current time. Never returns a window that includes the current,
 * still-open week (P1-R3-CYCLE-H, Decision 1).
 */
export function getLastClosedBillingCycleWindow(): ClosedBillingCycleWindow {
  return computeLastClosedWeek(new Date());
}

/**
 * Deterministic, human-readable cycle identifier. NOT an integrity
 * mechanism — evidenceDigest remains the sole source of content integrity
 * (P1-R3-CYCLE-H, Decision 2). Same scope + same window always produces the
 * same cycleId; this is intentional (a regenerated cycle for the same
 * scope/window is the same logical cycle, not a new one).
 */
export function buildBillingCycleId(params: Readonly<{ tenantId: string; workspaceId: string; windowStart: string }>): string {
  return `billing:${params.tenantId}:${params.workspaceId}:${params.windowStart}`;
}

/**
 * Production input. No free `generatedAt`/clock override, no free
 * `operationId` (always the sole governed billing operation) — mirrors the
 * boundary already enforced on collectBillingRawReceiptV3's public
 * signature (P1-R3-F, Finding 2).
 */
export type BillingCyclePipelineInput = Readonly<{
  tenantId: string;
  workspaceId: string;
  commitSha: string;
  workflowRunId?: string | null;
}>;

export type ValidationResultV1 = Readonly<{
  schemaVersion: typeof VALIDATION_RESULT_SCHEMA_VERSION;
  cycleId: string;
  evidenceRef: string;
  evidenceDigest: string;
  validatorIdentity: string;
  validatedAt: string;
  validationStatus: "passed" | "rejected";
  failureReasons: readonly string[];
  recomputed: Readonly<{ auditGap: number; duplicateSideEffects: number; coverageStatus: CoverageStatus }>;
  /** Set only when this validation result supersedes an earlier, incorrect one. */
  supersedesValidationRef?: string;
}>;

export type BillingCyclePipelineResult =
  | Readonly<{
      status: "awaiting_human_ratification";
      cycleId: string;
      tenantId: string;
      workspaceId: string;
      rawReceiptRef: string;
      rawReceiptDigest: string;
      evidenceRef: string;
      evidenceDigest: string;
      validationResultRef: string;
      validationResultDigest: string;
      validatorIdentity: string;
    }>
  | Readonly<{
      status: "rejected";
      cycleId: string;
      tenantId: string;
      workspaceId: string;
      rawReceiptRef: string;
      rawReceiptDigest: string;
      evidenceRef: string;
      evidenceDigest: string;
      validationResultRef: string;
      validationResultDigest: string;
      failureReasons: readonly string[];
    }>;

function computeDomainCoverageStatus(params: {
  expectedUniverse: readonly string[];
  measuredUniverse: readonly string[];
}): CoverageStatus {
  if (params.expectedUniverse.length === 0) return "not_applicable";
  if (params.measuredUniverse.length === 0) return "no_activity";
  return params.expectedUniverse.every((id) => params.measuredUniverse.includes(id)) ? "complete" : "partial";
}

async function persistContentAddressed(params: {
  tenantId: string;
  workspaceId: string;
  objectId: string;
  originalName: string;
  payloadJson: string;
}): Promise<{ ref: string; alreadyPersisted: boolean }> {
  const storageKey = buildScopedStorageKey({
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    originalName: params.originalName,
    objectId: params.objectId,
  });
  const alreadyPersisted = await storedObjectExists(storageKey);
  if (alreadyPersisted) {
    const existing = await loadStoredObject(storageKey);
    if (!existing || existing.toString("utf8") !== params.payloadJson) {
      throw new Error(`ape_billing_cycle: storage key collision with different content at ${storageKey}`);
    }
  } else {
    await persistBuffer(
      Buffer.from(params.payloadJson, "utf8"),
      params.originalName,
      { tenantId: params.tenantId, workspaceId: params.workspaceId },
      params.objectId
    );
  }
  return { ref: storageKey, alreadyPersisted };
}

/**
 * Reloads a persisted CycleEvidenceV3 from governed storage and verifies its
 * internal digest self-consistency (assertValidCycleEvidenceV3Shape already
 * checks evidenceDigest === recomputeEvidenceDigest(evidence) — reused
 * directly here, never reimplemented).
 */
export async function reloadAndVerifyCycleEvidenceV3(ref: string): Promise<CycleEvidenceV3> {
  const raw = await loadStoredObject(ref);
  if (!raw) {
    throw new Error(`ape_billing_cycle: cycle evidence missing at ${ref}`);
  }
  const evidence = JSON.parse(raw.toString("utf8")) as CycleEvidenceV3;
  assertValidCycleEvidenceV3Shape(evidence);
  return evidence;
}

/** Reloads a persisted ValidationResultV1 and verifies its digest matches what the pipeline recorded. */
export async function reloadAndVerifyValidationResultV1(ref: string, expectedDigest: string): Promise<ValidationResultV1> {
  const raw = await loadStoredObject(ref);
  if (!raw) {
    throw new Error(`ape_billing_cycle: validation result missing at ${ref}`);
  }
  const parsed = JSON.parse(raw.toString("utf8")) as ValidationResultV1;
  const recomputedDigest = canonicalDigest(parsed as unknown as Record<string, unknown>);
  if (recomputedDigest !== expectedDigest) {
    throw new Error(
      `ape_billing_cycle: validation result digest mismatch on reload for ${ref} (expected ${expectedDigest}, got ${recomputedDigest})`
    );
  }
  return parsed;
}

/**
 * Core pipeline implementation. Runs, for a single tenant/workspace and the
 * last fully closed calendar week:
 *
 *   real Postgres facts (via the already-governed billing collector)
 *   -> persisted RawReceiptV3
 *   -> independently reloaded from storage (never the in-memory producer object)
 *   -> CycleEvidenceV3 built from the reloaded receipt + the Governed Operation Catalog
 *   -> persisted CycleEvidenceV3
 *   -> independently reloaded from storage
 *   -> validateCycleEvidenceV3() with a canonical, distinct validatorIdentity
 *   -> persisted ValidationResultV1
 *   -> "awaiting_human_ratification" (if passed) or "rejected" (if not)
 *
 * Never calls buildCycleRatificationV3 or persistCycleRatificationV3 itself
 * — ratification is always a separate, human-triggered step (P1-R3-CYCLE-H,
 * Decision 16: AUTO_RATIFICATION=NAO).
 */
async function runBillingCyclePipelineCore(
  prisma: PrismaClient,
  input: BillingCyclePipelineInput,
  overrides?: Readonly<{ now?: () => Date }>
): Promise<BillingCyclePipelineResult> {
  const now = overrides?.now ?? (() => new Date());
  const window = computeLastClosedWeek(now());
  const cycleId = buildBillingCycleId({ tenantId: input.tenantId, workspaceId: input.workspaceId, windowStart: window.from });

  // Step 1-2: real facts -> persisted raw receipt -> independent reload.
  // Never reimplement the collector or trust its in-memory return value.
  const { receipt: producedReceipt } = await collectBillingRawReceiptV3(prisma, {
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    operationId: BILLING_RUN_COST_DEBIT_OPERATION_ID,
    observationWindow: window,
  });
  const rawReceipt = await reloadAndVerifyBillingRawReceiptV3(producedReceipt.ref, producedReceipt.digest);
  const fact = rawReceipt.facts.find((f) => f.operationId === BILLING_RUN_COST_DEBIT_OPERATION_ID);
  if (!fact) {
    throw new Error(`ape_billing_cycle: reloaded raw receipt is missing the expected operation fact`);
  }

  // Step 3: build CycleEvidenceV3 from the Governed Operation Catalog + the reloaded receipt only.
  const expectedUniverse = listGovernedOperations()
    .filter((op) => op.domain === "billing")
    .map((op) => op.operationId);
  const measuredUniverse = [BILLING_RUN_COST_DEBIT_OPERATION_ID];
  const coverageStatus = computeDomainCoverageStatus({ expectedUniverse, measuredUniverse });

  const measurement: MeasuredOperationV3 = {
    operationId: BILLING_RUN_COST_DEBIT_OPERATION_ID,
    measurementStatus: "measured",
    observedAt: rawReceipt.observationWindow ?? window,
    sampleSize: fact.sampleSize,
    auditGap: fact.auditGapCount,
    duplicateSideEffects: fact.duplicateSideEffectsCount,
    rawReceiptRef: rawReceipt.ref,
    rawReceiptDigest: rawReceipt.digest,
  };

  const evidenceInput: CycleEvidenceV3Input = {
    cycleId,
    generatedAt: now().toISOString(),
    domain: "billing",
    evidenceClass: "domain",
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    operationIds: [BILLING_RUN_COST_DEBIT_OPERATION_ID],
    expectedUniverse,
    measurements: [measurement],
    measurementStatus: "measured",
    coverageStatus,
    provenance: {
      commitSha: input.commitSha,
      workflowRunId: input.workflowRunId ?? null,
      producerIdentity: rawReceipt.producerIdentity ?? "eiah.billing.raw-receipt-collector.v1",
    },
  };
  const evidence = buildCycleEvidenceV3(evidenceInput);

  // Step 4: persist CycleEvidenceV3, content-addressed by its own evidenceDigest.
  const evidencePayloadJson = JSON.stringify(evidence);
  const { ref: evidenceRef } = await persistContentAddressed({
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    objectId: `ape-weekly-cycle/evidence/${evidence.evidenceDigest}`,
    originalName: "cycle-evidence.json",
    payloadJson: evidencePayloadJson,
  });

  // Independent reload before validation — never validate the in-memory object just built.
  const reloadedEvidence = await reloadAndVerifyCycleEvidenceV3(evidenceRef);

  // Step 5: run the independent validator against the reloaded evidence + reloaded receipt.
  const validationResult: ApeWeeklyCycleV3ValidationResult = validateCycleEvidenceV3({
    evidence: reloadedEvidence,
    rawReceipts: [rawReceipt],
    validatorIdentity: APE_WEEKLY_CYCLE_V3_VALIDATOR_IDENTITY,
  });

  // Step 6: persist the ValidationResult as its own artifact.
  const validationResultEnvelope: Omit<ValidationResultV1, never> = {
    schemaVersion: VALIDATION_RESULT_SCHEMA_VERSION,
    cycleId,
    evidenceRef,
    evidenceDigest: reloadedEvidence.evidenceDigest,
    validatorIdentity: APE_WEEKLY_CYCLE_V3_VALIDATOR_IDENTITY,
    validatedAt: now().toISOString(),
    validationStatus: validationResult.validationStatus,
    failureReasons: validationResult.failureReasons,
    recomputed: validationResult.recomputed,
  };
  const validationResultDigest = canonicalDigest(validationResultEnvelope as unknown as Record<string, unknown>);
  const validationPayloadJson = JSON.stringify(validationResultEnvelope);
  const { ref: validationResultRef } = await persistContentAddressed({
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    objectId: `ape-weekly-cycle/validation/${validationResultDigest}`,
    originalName: "cycle-validation-result.json",
    payloadJson: validationPayloadJson,
  });

  // Step 7: fail closed. A rejected validation NEVER proceeds to ratification preparation.
  if (validationResult.validationStatus !== "passed") {
    return {
      status: "rejected",
      cycleId,
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      rawReceiptRef: rawReceipt.ref,
      rawReceiptDigest: rawReceipt.digest,
      evidenceRef,
      evidenceDigest: reloadedEvidence.evidenceDigest,
      validationResultRef,
      validationResultDigest,
      failureReasons: validationResult.failureReasons,
    };
  }

  return {
    status: "awaiting_human_ratification",
    cycleId,
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    rawReceiptRef: rawReceipt.ref,
    rawReceiptDigest: rawReceipt.digest,
    evidenceRef,
    evidenceDigest: reloadedEvidence.evidenceDigest,
    validationResultRef,
    validationResultDigest,
    validatorIdentity: APE_WEEKLY_CYCLE_V3_VALIDATOR_IDENTITY,
  };
}

/**
 * Production entry point. No clock override — always the last real, fully
 * closed calendar week as of the real current time. Never produces or
 * touches a CycleRatificationV3: this function's return value is either
 * "awaiting_human_ratification" or "rejected", nothing else.
 */
export async function runBillingCyclePipeline(
  prisma: PrismaClient,
  input: BillingCyclePipelineInput
): Promise<BillingCyclePipelineResult> {
  return runBillingCyclePipelineCore(prisma, input);
}

/**
 * Persists an ALREADY-DECIDED CycleRatificationV3. Never builds one itself,
 * never chooses ratificationStatus, never fills ratifiedBy — the caller
 * must have obtained the ratification object from a genuine human decision
 * via buildCycleRatificationV3() (which already throws on an empty
 * ratifiedBy). The tenant/workspace scope must be supplied explicitly: a
 * CycleRatificationV3 does not itself carry a tenant/workspace dimension
 * (docs/ops/ape-audit-telemetry-decision.md §7.1 — it binds only to an
 * evidenceDigest), so the caller (who by this point holds the full
 * BillingCyclePipelineResult) must pass the same scope back.
 */
export async function persistCycleRatificationV3(params: {
  ratification: CycleRatificationV3;
  tenantId: string;
  workspaceId: string;
}): Promise<{ ref: string; digest: string; alreadyPersisted: boolean }> {
  const digest = canonicalDigest(params.ratification as unknown as Record<string, unknown>);
  const payloadJson = JSON.stringify(params.ratification);
  const { ref, alreadyPersisted } = await persistContentAddressed({
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    objectId: `ape-weekly-cycle/ratification/${digest}`,
    originalName: "cycle-ratification.json",
    payloadJson,
  });
  return { ref, digest, alreadyPersisted };
}

/** Reloads a persisted CycleRatificationV3 and verifies its digest matches. */
export async function reloadAndVerifyCycleRatificationV3(ref: string, expectedDigest: string): Promise<CycleRatificationV3> {
  const raw = await loadStoredObject(ref);
  if (!raw) {
    throw new Error(`ape_billing_cycle: cycle ratification missing at ${ref}`);
  }
  const parsed = JSON.parse(raw.toString("utf8")) as CycleRatificationV3;
  const recomputedDigest = canonicalDigest(parsed as unknown as Record<string, unknown>);
  if (recomputedDigest !== expectedDigest) {
    throw new Error(
      `ape_billing_cycle: cycle ratification digest mismatch on reload for ${ref} (expected ${expectedDigest}, got ${recomputedDigest})`
    );
  }
  return parsed;
}

/**
 * Test-only surface. Never import from production code — the production
 * entry point (runBillingCyclePipeline) has no clock override and none
 * should ever be added. Namespaced under __testing__ so it cannot be
 * mistaken for part of the normal production API (same pattern already
 * used in apeWeeklyCycleV3BillingCollector.ts, P1-R3-F).
 */
export const __testing__ = {
  runBillingCyclePipelineWithClock: (
    prisma: PrismaClient,
    input: BillingCyclePipelineInput,
    overrides: Readonly<{ now: () => Date }>
  ) => runBillingCyclePipelineCore(prisma, input, overrides),
  computeLastClosedWeek,
};
