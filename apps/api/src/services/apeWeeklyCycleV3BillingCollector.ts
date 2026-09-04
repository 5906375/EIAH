import type { PrismaClient } from "@repo/db";
import { canonicalDigest } from "@eiah/core/utils/canonicalDigest";
import { getGovernedOperation } from "@eiah/core/catalog/governedOperationCatalog";
import type { RawMeasurementFact, RawReceiptV3 } from "@eiah/core/catalog/apeWeeklyCycleV3Validator";
import { getBillingReconciliationSummary } from "./billingReconciliation";
import { persistBuffer, loadStoredObject, storedObjectExists, buildScopedStorageKey } from "./storage";

export const BILLING_RAW_RECEIPT_SCHEMA_VERSION = "ape.raw-receipt.billing.v1" as const;

/**
 * Fixed producer identity string (P1-R3-H, Decision 4: STRING_IDENTITY_V1,
 * WITH_EXPLICIT_PARTIAL_TRUST). Not a cryptographic signature — SignerManager
 * exists in this codebase but integrating it is explicitly deferred, not
 * done silently here.
 */
export const BILLING_RAW_RECEIPT_PRODUCER_IDENTITY = "eiah.billing.raw-receipt-collector.v1" as const;

/**
 * Production input. Deliberately has no way to override producerIdentity or
 * the capture clock (P1-R3-R Finding 2) — every real caller gets the fixed
 * BILLING_RAW_RECEIPT_PRODUCER_IDENTITY and the real current time.
 */
export type BillingRawReceiptCollectorInput = Readonly<{
  tenantId: string;
  workspaceId: string;
  operationId: string;
  observationWindow: Readonly<{ from: string; to: string }>;
}>;

type BillingRawReceiptEnvelope = Readonly<{
  schemaVersion: typeof BILLING_RAW_RECEIPT_SCHEMA_VERSION;
  tenantId: string;
  workspaceId: string;
  operationId: string;
  observationWindow: Readonly<{ from: string; to: string }>;
  producerIdentity: string;
  /** Capture time. Deliberately distinct from observationWindow (P1-R3-D §7): generation time != observation time. */
  generatedAt: string;
  facts: readonly RawMeasurementFact[];
}>;

export type BillingRawReceiptCollectionResult = Readonly<{
  receipt: RawReceiptV3;
  /** true when an identical receipt already existed at this content-addressed key (idempotent no-op). */
  alreadyPersisted: boolean;
}>;

function assertGovernedBillingOperation(operationId: string): void {
  // Fail-closed: getGovernedOperation() throws for anything not in the catalog.
  const operation = getGovernedOperation(operationId);
  if (operation.domain !== "billing") {
    throw new Error(`ape_billing_raw_receipt_collector: operationId not in billing domain: ${operationId}`);
  }
}

function assertRequiredScope(tenantId: string, workspaceId: string): void {
  if (!tenantId?.trim()) throw new Error("ape_billing_raw_receipt_collector: tenantId required");
  if (!workspaceId?.trim()) throw new Error("ape_billing_raw_receipt_collector: workspaceId required");
}

/**
 * Parses and validates an observation window. Rejects (fail-closed, no
 * receipt produced) rather than silently degrading to an empty/zero-fact
 * result: an inverted or degenerate window (from >= to) would otherwise
 * match zero rows and look indistinguishable from genuinely healthy "no
 * activity" evidence (P1-R3-R Finding 3).
 */
function parseObservationWindow(window: Readonly<{ from: string; to: string }>): { from: Date; to: Date } {
  const from = new Date(window.from);
  const to = new Date(window.to);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new Error("ape_billing_raw_receipt_collector: observationWindow.from/to must be valid ISO timestamps");
  }
  if (from.getTime() >= to.getTime()) {
    throw new Error(
      `ape_billing_raw_receipt_collector: observationWindow.from must be strictly before observationWindow.to (got from=${window.from}, to=${window.to})`
    );
  }
  return { from, to };
}

/**
 * Collector for a single billing.run_cost_debit raw receipt.
 * Ratified boundaries (P1-R3-H) — not rediscussed here:
 *
 *   - SOLE source of auditGap/duplicateSideEffects truth is
 *     getBillingReconciliationSummary(). This module never queries Run,
 *     RunUsageBreakdown, BillingLedger or GuardrailLedger directly, and
 *     never reimplements the audit-gap decision tree or the
 *     Σ max(0, n-1) duplicate formula (see the architectural anti-drift
 *     test in this module's test file, which asserts this by inspecting
 *     the source rather than trusting the docstring). It calls that
 *     function with coverageMode: "full" (added in P1-R3-F to fix Finding
 *     1) so the receipt reflects the complete population of the observation
 *     window, never silently truncated at the summary's display-oriented
 *     default of 50 most-recent rows.
 *   - this collector cannot validate its own output (apeWeeklyCycleV3Validator
 *     is a separate module, never imported here), cannot ratify, cannot
 *     define expectedUniverse, and never writes docs/EVIDENCE_INDEX.md.
 *   - capture model is POST_FACTO: this reads already-committed rows some
 *     time after the fact. It makes no transactional-atomicity claim.
 *   - PII: only tenantId/workspaceId/operationId/timestamps flow into the
 *     receipt. The reconciliation summary's `items` (which carry runId/
 *     traceId/requestId) are deliberately never read — only `summary.totals`
 *     (four plain counts) crosses into the receipt.
 *   - immutability is PARTIAL, not FULL: the receipt is stored at a
 *     content-addressed key and this function checks-then-writes, but
 *     StorageProvider has no atomic put-if-absent API, so this is a
 *     best-effort guard against overwrite, not a hard guarantee (P1-R3-D §13).
 *   - producerIdentity is always the fixed BILLING_RAW_RECEIPT_PRODUCER_IDENTITY
 *     and generatedAt is always the real capture clock — this function's
 *     public signature has no way to override either (P1-R3-F, Finding 2).
 */
export async function collectBillingRawReceiptV3(
  prisma: PrismaClient,
  input: BillingRawReceiptCollectorInput
): Promise<BillingRawReceiptCollectionResult> {
  return collectBillingRawReceiptV3Core(prisma, {
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    operationId: input.operationId,
    observationWindow: input.observationWindow,
  });
}

/**
 * Core implementation. Not exported directly — reached either through the
 * production entry point above (no overrides possible) or through
 * __testing__.collectBillingRawReceiptV3WithOverrides below (tests only).
 */
async function collectBillingRawReceiptV3Core(
  prisma: PrismaClient,
  input: BillingRawReceiptCollectorInput,
  overrides?: Readonly<{ producerIdentity?: string; now?: () => Date }>
): Promise<BillingRawReceiptCollectionResult> {
  assertRequiredScope(input.tenantId, input.workspaceId);
  assertGovernedBillingOperation(input.operationId);
  const { from, to } = parseObservationWindow(input.observationWindow);

  const summary = await getBillingReconciliationSummary(prisma, {
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    from,
    to,
    coverageMode: "full",
  });

  const fact: RawMeasurementFact = {
    operationId: input.operationId,
    auditGapCount: summary.totals.auditGapCount,
    duplicateSideEffectsCount: summary.totals.duplicateChargesCount,
    sampleSize: summary.totals.runsChecked,
  };

  const envelope: BillingRawReceiptEnvelope = {
    schemaVersion: BILLING_RAW_RECEIPT_SCHEMA_VERSION,
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    operationId: input.operationId,
    observationWindow: input.observationWindow,
    producerIdentity: overrides?.producerIdentity ?? BILLING_RAW_RECEIPT_PRODUCER_IDENTITY,
    generatedAt: (overrides?.now ?? (() => new Date()))().toISOString(),
    facts: [fact],
  };

  const digest = canonicalDigest(envelope as unknown as Record<string, unknown>);
  const payloadJson = JSON.stringify(envelope);
  const objectId = `ape-weekly-cycle/${input.operationId}/${digest}`;

  const storageKey = buildScopedStorageKey({
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    originalName: "raw-receipt.json",
    objectId,
  });

  const alreadyPersisted = await storedObjectExists(storageKey);
  if (alreadyPersisted) {
    const existing = await loadStoredObject(storageKey);
    if (!existing || existing.toString("utf8") !== payloadJson) {
      throw new Error(
        `ape_billing_raw_receipt_collector: storage key collision with different content at ${storageKey}`
      );
    }
  } else {
    await persistBuffer(
      Buffer.from(payloadJson, "utf8"),
      "raw-receipt.json",
      { tenantId: input.tenantId, workspaceId: input.workspaceId },
      objectId
    );
  }

  const receipt: RawReceiptV3 = {
    ref: storageKey,
    digest,
    facts: envelope.facts,
    tenantId: envelope.tenantId,
    workspaceId: envelope.workspaceId,
    observationWindow: envelope.observationWindow,
    producerIdentity: envelope.producerIdentity,
    generatedAt: envelope.generatedAt,
  };

  return { receipt, alreadyPersisted };
}

/**
 * Reloads a persisted raw receipt from storage and recomputes its digest
 * from the bytes actually read back, failing closed on drift or absence.
 * Proves the storage roundtrip independently of the in-memory object
 * collectBillingRawReceiptV3() already returned.
 */
export async function reloadAndVerifyBillingRawReceiptV3(
  ref: string,
  expectedDigest: string
): Promise<RawReceiptV3> {
  const raw = await loadStoredObject(ref);
  if (!raw) {
    throw new Error(`ape_billing_raw_receipt_collector: raw receipt object missing at ${ref}`);
  }
  const envelope = JSON.parse(raw.toString("utf8")) as BillingRawReceiptEnvelope;
  const recomputedDigest = canonicalDigest(envelope as unknown as Record<string, unknown>);
  if (recomputedDigest !== expectedDigest) {
    throw new Error(
      `ape_billing_raw_receipt_collector: digest mismatch on reload for ${ref} (expected ${expectedDigest}, got ${recomputedDigest})`
    );
  }
  return {
    ref,
    digest: recomputedDigest,
    facts: envelope.facts,
    tenantId: envelope.tenantId,
    workspaceId: envelope.workspaceId,
    observationWindow: envelope.observationWindow,
    producerIdentity: envelope.producerIdentity,
    generatedAt: envelope.generatedAt,
  };
}

/**
 * Test-only surface. Never import this from production code — there is no
 * production call site that needs producerIdentity/clock overrides, and
 * none should ever be added; use collectBillingRawReceiptV3() instead.
 * Namespaced under __testing__ specifically so it cannot be mistaken for
 * part of the normal production API (P1-R3-R Finding 2 / P1-R3-F).
 */
export const __testing__ = {
  collectBillingRawReceiptV3WithOverrides: (
    prisma: PrismaClient,
    input: BillingRawReceiptCollectorInput,
    overrides: Readonly<{ producerIdentity?: string; now?: () => Date }>
  ) => collectBillingRawReceiptV3Core(prisma, input, overrides),
};
