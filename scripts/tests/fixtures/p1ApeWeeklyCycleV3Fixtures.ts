/**
 * Synthetic fixture builders for the local P1 ape.weekly-cycle.v3 checker
 * tests. These fixtures verify checker BEHAVIOR only — they are not
 * operational evidence and must never be written to ops/evidence/** or
 * registered in docs/EVIDENCE_INDEX.md.
 */
import {
  buildCycleEvidenceV3,
  buildCycleRatificationV3,
  type CycleEvidenceV3Input,
} from "../../../packages/core/src/catalog/apeWeeklyCycleV3.js";
import type { RawReceiptV3 } from "../../../packages/core/src/catalog/apeWeeklyCycleV3Validator.js";
import type { LoadedCycle, P1EvaluationPolicy } from "../../lib/p1CycleSelection.js";

export const FIXTURE_TENANT = "tenant-fixture-x";
export const FIXTURE_WORKSPACE = "workspace-fixture-x";
export const FIXTURE_OPERATION = "billing.run_cost_debit";

export function fixtureReceipt(
  windowFrom: string,
  overrides?: Partial<{ auditGapCount: number; duplicateSideEffectsCount: number; sampleSize: number; ref: string; digest: string }>,
): RawReceiptV3 {
  const ref = overrides?.ref ?? `receipt-${windowFrom}`;
  const digest = overrides?.digest ?? `digest-${windowFrom}`;
  return {
    ref,
    digest,
    facts: [
      {
        operationId: FIXTURE_OPERATION,
        auditGapCount: overrides?.auditGapCount ?? 0,
        duplicateSideEffectsCount: overrides?.duplicateSideEffectsCount ?? 0,
        sampleSize: overrides?.sampleSize ?? 2,
      },
    ],
  };
}

export function fixtureCycle(params: {
  windowFrom: string;
  windowTo: string;
  generatedAt: string;
  tenantId?: string;
  workspaceId?: string;
  receipt?: RawReceiptV3;
  measurementAuditGap?: number;
  measurementDuplicateSideEffects?: number;
  measurementSampleSize?: number;
  ratified?: boolean;
  history?: readonly { evidenceDigest: string; generatedAt: string }[] | null;
  captureStatus?: "provisional" | "final" | null;
  supersedesEvidenceRef?: string;
}): LoadedCycle {
  const tenantId = params.tenantId ?? FIXTURE_TENANT;
  const workspaceId = params.workspaceId ?? FIXTURE_WORKSPACE;
  const receipt = params.receipt ?? fixtureReceipt(params.windowFrom);

  const input: CycleEvidenceV3Input = {
    cycleId: `billing:${tenantId}:${workspaceId}:${params.windowFrom}`,
    generatedAt: params.generatedAt,
    domain: "billing",
    evidenceClass: "domain",
    tenantId,
    workspaceId,
    operationIds: [FIXTURE_OPERATION],
    expectedUniverse: [FIXTURE_OPERATION],
    measurements: [
      {
        operationId: FIXTURE_OPERATION,
        measurementStatus: "measured",
        observedAt: { from: params.windowFrom, to: params.windowTo },
        sampleSize: params.measurementSampleSize ?? 2,
        auditGap: params.measurementAuditGap ?? 0,
        duplicateSideEffects: params.measurementDuplicateSideEffects ?? 0,
        rawReceiptRef: receipt.ref,
        rawReceiptDigest: receipt.digest,
      },
    ],
    measurementStatus: "measured",
    coverageStatus: "complete",
    provenance: { commitSha: "fixture-commit-sha", workflowRunId: null, producerIdentity: "fixture.producer.v1" },
    ...(params.supersedesEvidenceRef ? { supersedesEvidenceRef: params.supersedesEvidenceRef } : {}),
  };
  const evidence = buildCycleEvidenceV3(input);
  const ratification = params.ratified
    ? buildCycleRatificationV3({ evidence, ratificationStatus: "approved", ratifiedBy: "Fixture Tester" })
    : null;

  return { evidence, rawReceipts: [receipt], ratification, history: params.history ?? null, captureStatus: params.captureStatus ?? null };
}

export function fixturePolicy(overrides?: Partial<P1EvaluationPolicy>): P1EvaluationPolicy {
  return {
    scenario: "test",
    scope: { tenantId: FIXTURE_TENANT, workspaceId: FIXTURE_WORKSPACE, domain: "billing" },
    minCycles: 3,
    maxAgeDays: 14,
    requireConsecutiveWindows: true,
    requireLatestWindowIsLastClosed: true,
    captureToleranceDays: 0,
    requireRatification: false,
    ...overrides,
  };
}

/** The three reference cycles used throughout this session's calendar analysis (ADR-009 §14). */
export function referenceThreeCycles(): LoadedCycle[] {
  return [
    fixtureCycle({ windowFrom: "2026-09-21T00:00:00.000Z", windowTo: "2026-09-28T00:00:00.000Z", generatedAt: "2026-10-04T12:00:00Z" }),
    fixtureCycle({ windowFrom: "2026-09-28T00:00:00.000Z", windowTo: "2026-10-05T00:00:00.000Z", generatedAt: "2026-10-05T12:00:00Z" }),
    fixtureCycle({ windowFrom: "2026-10-05T00:00:00.000Z", windowTo: "2026-10-12T00:00:00.000Z", generatedAt: "2026-10-12T12:00:00Z" }),
  ];
}
