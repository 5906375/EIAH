import { createHash } from "node:crypto";

import { z } from "zod";

export const APE_WEEKLY_CYCLE_V2_SCHEMA_VERSION = "ape.weekly-cycle.v2" as const;

const sha256DigestSchema = z
  .string()
  .regex(/^sha256:[a-f0-9]{64}$/, "expected a lowercase sha256 digest");

const receiptHashSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, "expected a lowercase SHA-256 receipt hash");

const gitCommitSchema = z
  .string()
  .regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/, "expected a full Git commit hash");

const timestampSchema = z.string().datetime({ offset: true });

const versionSchema = z
  .string()
  .regex(/^v?[0-9]+(?:\.[0-9]+){0,2}$/, "expected a versioned method");

export const apeWeeklyCycleV2ObservedWindowSchema = z
  .object({
    startedAt: timestampSchema,
    endedAt: timestampSchema,
  })
  .strict()
  .superRefine((window, context) => {
    if (Date.parse(window.startedAt) > Date.parse(window.endedAt)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "observedWindow.startedAt must not be after endedAt",
        path: ["startedAt"],
      });
    }
  });

export const apeWeeklyCycleV2MetricSchema = z
  .object({
    value: z.number().finite().int().nonnegative(),
    source: z.enum(["ledger", "runtime"]),
    method: z
      .object({
        id: z.string().min(1),
        version: versionSchema,
        queryRef: z.string().min(1),
      })
      .strict(),
    observedWindow: apeWeeklyCycleV2ObservedWindowSchema,
    sourceDigest: sha256DigestSchema,
  })
  .strict();

export const apeWeeklyCycleV2ArtifactEnvelopeSchema = z
  .object({
    repo: z
      .string()
      .regex(/^[^/\s]+\/[^/\s]+$/, "expected repository in owner/name form"),
    commit: gitCommitSchema,
    workflowRunId: z.string().regex(/^[1-9][0-9]*$/),
    jobId: z.string().regex(/^[1-9][0-9]*$/),
    artifactId: z.string().regex(/^[1-9][0-9]*$/),
    artifactDigest: sha256DigestSchema,
  })
  .strict();

export const apeWeeklyCycleV2DecisionEnvelopeSchema = z
  .object({
    hardMetricsGo: z.literal(true),
    decision: z.literal("GO"),
    hardReasons: z.array(z.string().min(1)).length(0),
    nonRegressionGo: z.literal(true),
  })
  .strict();

export const apeWeeklyCycleV2RatificationEnvelopeSchema = z
  .object({
    status: z.literal("pending"),
    prNumber: z.number().int().positive().optional(),
    mergeCommit: gitCommitSchema.optional(),
  })
  .strict();

export const apeWeeklyCycleV2ReceiptSchema = z
  .object({
    id: z.string().min(1),
    hash: receiptHashSchema,
    reasonCode: z
      .string()
      .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "expected a canonical reason code token"),
    timestamp: timestampSchema,
  })
  .strict();

const apeWeeklyCycleV2StructureSchema = z
  .object({
    schemaVersion: z.literal(APE_WEEKLY_CYCLE_V2_SCHEMA_VERSION),
    cycleId: z.string().regex(/^APE-[1-9][0-9]*$/),
    runNumber: z.number().int().positive(),
    observedAt: timestampSchema,
    metrics: z
      .object({
        auditGap: apeWeeklyCycleV2MetricSchema,
        duplicateSideEffects: apeWeeklyCycleV2MetricSchema,
      })
      .strict(),
    artifact: apeWeeklyCycleV2ArtifactEnvelopeSchema,
    decision: apeWeeklyCycleV2DecisionEnvelopeSchema,
    ratification: apeWeeklyCycleV2RatificationEnvelopeSchema,
    receipt: apeWeeklyCycleV2ReceiptSchema,
  })
  .strict();

export type ApeWeeklyCycleV2 = z.infer<typeof apeWeeklyCycleV2StructureSchema>;

function stableSort(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableSort);
  if (!value || typeof value !== "object") return value;

  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, stableSort(record[key])]),
  );
}

function unsignedCycle(cycle: ApeWeeklyCycleV2): Record<string, unknown> {
  const { hash: _hash, ...receipt } = cycle.receipt;
  return {
    ...cycle,
    receipt,
  };
}

export function canonicalizeApeWeeklyCycleV2(cycle: ApeWeeklyCycleV2): string {
  return JSON.stringify(stableSort(unsignedCycle(cycle)));
}

export function hashApeWeeklyCycleV2(cycle: ApeWeeklyCycleV2): string {
  return createHash("sha256")
    .update(canonicalizeApeWeeklyCycleV2(cycle), "utf8")
    .digest("hex");
}

export const apeWeeklyCycleV2Schema = apeWeeklyCycleV2StructureSchema.superRefine(
  (cycle, context) => {
    const expectedHash = hashApeWeeklyCycleV2(cycle);
    if (cycle.receipt.hash !== expectedHash) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "receipt hash does not match the canonical cycle",
        path: ["receipt", "hash"],
      });
    }
  },
);

export function validateApeWeeklyCycleV2(input: unknown) {
  return apeWeeklyCycleV2Schema.safeParse(input);
}
