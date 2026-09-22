import { z } from "zod";

export const GOVERNED_CASE_V1_SCHEMA_VERSION = "governed-case.v1" as const;

const identifierSchema = z.string().min(1);

export const governedTimestampV1Schema = z.string().datetime({ offset: true });

export const governedReasonCodeV1Schema = z
  .string()
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9._-]*$/,
    "expected a canonical reason code token",
  );

export const governedSha256V1Schema = z
  .string()
  .regex(/^sha256:[a-f0-9]{64}$/, "expected a lowercase sha256 digest");

export type JsonPrimitiveV1 = string | number | boolean | null;
export type JsonValueV1 =
  | JsonPrimitiveV1
  | readonly JsonValueV1[]
  | { readonly [key: string]: JsonValueV1 };

export const jsonValueV1Schema: z.ZodType<JsonValueV1> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValueV1Schema),
    z.record(jsonValueV1Schema),
  ]),
);

function uniqueStrings(values: string[], context: z.RefinementCtx) {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (seen.has(value)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "duplicate identifier",
        path: [index],
      });
    }
    seen.add(value);
  });
}

function uniqueByField(field: string) {
  return (values: Record<string, unknown>[], context: z.RefinementCtx) => {
    const seen = new Set<unknown>();
    values.forEach((value, index) => {
      const identifier = value[field];
      if (seen.has(identifier)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "duplicate identifier",
          path: [index, field],
        });
      }
      seen.add(identifier);
    });
  };
}

const uniqueIdentifierArraySchema = z
  .array(identifierSchema)
  .superRefine(uniqueStrings);

export const immutableArtifactRefV1Schema = z
  .object({
    schemaVersion: z.literal("artifact-ref.v1"),
    artifactType: z.enum([
      "source_snapshot",
      "run",
      "receipt",
      "evidence",
      "event",
    ]),
    artifactId: identifierSchema,
    contentHash: governedSha256V1Schema.optional(),
    location: z.string().min(1).optional(),
  })
  .strict();

export type ImmutableArtifactRefV1 = z.infer<
  typeof immutableArtifactRefV1Schema
>;

export const sourceSnapshotRefV1Schema = z
  .object({
    schemaVersion: z.literal("source-snapshot-ref.v1"),
    snapshotId: identifierSchema,
    sourceId: identifierSchema,
    sourceRole: z.enum([
      "CASE_INPUT",
      "CORPORATE_MASTER_DATA",
      "REGULATORY_CORPUS",
      "REFERENCE_DATA",
    ]),
    authorityClass: z.enum(["PRIMARY", "SECONDARY", "ADVISORY"]),
    capturedAt: governedTimestampV1Schema,
    sourceVersion: z.string().min(1).optional(),
    contentHash: governedSha256V1Schema,
    locator: z.string().min(1).optional(),
  })
  .strict();

export type SourceSnapshotRefV1 = z.infer<typeof sourceSnapshotRefV1Schema>;

export const provenanceV1Schema = z
  .object({
    schemaVersion: z.literal("provenance.v1"),
    sourceSnapshots: z
      .array(sourceSnapshotRefV1Schema)
      .superRefine(uniqueByField("snapshotId")),
    derivation: z
      .object({
        method: z.enum([
          "DIRECT",
          "DETERMINISTIC_TRANSFORM",
          "HUMAN_ATTESTED",
        ]),
        methodVersion: identifierSchema,
        inputFactIds: uniqueIdentifierArraySchema,
        authorityDecisionIds: uniqueIdentifierArraySchema,
      })
      .strict(),
  })
  .strict()
  .superRefine((provenance, context) => {
    const { method, inputFactIds, authorityDecisionIds } =
      provenance.derivation;

    if (method === "DIRECT" && provenance.sourceSnapshots.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "DIRECT provenance requires at least one source snapshot",
        path: ["sourceSnapshots"],
      });
    }
    if (
      method === "DETERMINISTIC_TRANSFORM" &&
      inputFactIds.length === 0
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "DETERMINISTIC_TRANSFORM provenance requires at least one input fact",
        path: ["derivation", "inputFactIds"],
      });
    }
    if (
      method === "HUMAN_ATTESTED" &&
      authorityDecisionIds.length === 0
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "HUMAN_ATTESTED provenance requires at least one authority decision",
        path: ["derivation", "authorityDecisionIds"],
      });
    }
    if (method !== "HUMAN_ATTESTED" && authorityDecisionIds.length > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "only HUMAN_ATTESTED provenance may reference authority decisions",
        path: ["derivation", "authorityDecisionIds"],
      });
    }
  });

export type ProvenanceV1 = z.infer<typeof provenanceV1Schema>;

const factBaseV1Schema = z.object({
  schemaVersion: z.literal("fact.v1"),
  factId: identifierSchema,
  namespace: identifierSchema,
  key: identifierSchema,
  observedAt: governedTimestampV1Schema,
  effectiveAt: governedTimestampV1Schema.optional(),
  sensitivity: z.enum([
    "PUBLIC",
    "INTERNAL",
    "CONFIDENTIAL",
    "RESTRICTED",
  ]),
  provenance: provenanceV1Schema,
});

export const factV1Schema = z
  .discriminatedUnion("status", [
    factBaseV1Schema
      .extend({
        status: z.literal("OBSERVED"),
        value: jsonValueV1Schema.refine((value) => value !== null),
      })
      .strict(),
    factBaseV1Schema
      .extend({
        status: z.literal("DERIVED"),
        value: jsonValueV1Schema.refine((value) => value !== null),
      })
      .strict(),
    factBaseV1Schema
      .extend({
        status: z.literal("HUMAN_ATTESTED"),
        value: jsonValueV1Schema.refine((value) => value !== null),
      })
      .strict(),
    factBaseV1Schema
      .extend({
        status: z.literal("MISSING"),
        value: z.null(),
      })
      .strict(),
    factBaseV1Schema
      .extend({
        status: z.literal("DISPUTED"),
        value: jsonValueV1Schema,
      })
      .strict(),
  ])
  .superRefine((fact, context) => {
    const method = fact.provenance.derivation.method;
    const expectedMethod =
      fact.status === "OBSERVED"
        ? "DIRECT"
        : fact.status === "DERIVED"
          ? "DETERMINISTIC_TRANSFORM"
          : fact.status === "HUMAN_ATTESTED"
            ? "HUMAN_ATTESTED"
            : null;

    if (expectedMethod && method !== expectedMethod) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: fact.status + " fact has incompatible provenance method",
        path: ["provenance", "derivation", "method"],
      });
    }
  });

type FactV1Shape = z.infer<typeof factV1Schema>;
type PresentFactV1Shape = Extract<
  FactV1Shape,
  { status: "OBSERVED" | "DERIVED" | "HUMAN_ATTESTED" }
>;
type MissingFactV1Shape = Extract<FactV1Shape, { status: "MISSING" }>;
type DisputedFactV1Shape = Extract<FactV1Shape, { status: "DISPUTED" }>;

export type FactV1<
  TKey extends string = string,
  TValue extends JsonValueV1 = JsonValueV1,
> =
  | (Omit<PresentFactV1Shape, "key" | "value"> & {
      readonly key: TKey;
      readonly value: Exclude<TValue, null>;
    })
  | (Omit<MissingFactV1Shape, "key"> & {
      readonly key: TKey;
    })
  | (Omit<DisputedFactV1Shape, "key" | "value"> & {
      readonly key: TKey;
      readonly value: TValue | null;
    });

export const sourceInconsistencyV1Schema = z
  .object({
    schemaVersion: z.literal("source-inconsistency.v1"),
    inconsistencyId: identifierSchema,
    factKey: identifierSchema,
    factIds: z.array(identifierSchema).min(1).superRefine(uniqueStrings),
    kind: z.enum([
      "VALUE_CONFLICT",
      "MISSING_REQUIRED_FACT",
      "SOURCE_SCOPE_MISMATCH",
      "STALE_OBSERVATION",
      "INVALID_FORMAT",
      "PROVENANCE_GAP",
    ]),
    severity: z.enum(["BLOCK", "REVIEW"]),
    status: z.enum(["OPEN", "RESOLVED_BY_HUMAN", "SUPERSEDED"]),
    reasonCode: governedReasonCodeV1Schema,
    resolutionAuthorityRef: immutableArtifactRefV1Schema.optional(),
  })
  .strict()
  .superRefine((inconsistency, context) => {
    if (
      inconsistency.status === "RESOLVED_BY_HUMAN" &&
      !inconsistency.resolutionAuthorityRef
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "RESOLVED_BY_HUMAN inconsistency requires an authority reference",
        path: ["resolutionAuthorityRef"],
      });
    }
  });

export type SourceInconsistencyV1 = z.infer<
  typeof sourceInconsistencyV1Schema
>;

export const regulatoryRuleEvaluationV1Schema = z
  .object({
    schemaVersion: z.literal("regulatory-rule-evaluation.v1"),
    evaluationId: identifierSchema,
    ruleId: identifierSchema,
    ruleVersion: identifierSchema,
    jurisdiction: identifierSchema,
    legalSourceRefs: z
      .array(sourceSnapshotRefV1Schema)
      .min(1)
      .superRefine(uniqueByField("snapshotId")),
    inputFactIds: uniqueIdentifierArraySchema,
    outcome: z.enum([
      "COMPLIANT",
      "NON_COMPLIANT",
      "UNKNOWN",
      "NOT_APPLICABLE",
    ]),
    reasonCodes: z
      .array(governedReasonCodeV1Schema)
      .superRefine(uniqueStrings),
    evaluatedAt: governedTimestampV1Schema,
  })
  .strict()
  .superRefine((evaluation, context) => {
    if (
      ["NON_COMPLIANT", "UNKNOWN"].includes(evaluation.outcome) &&
      evaluation.reasonCodes.length === 0
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: evaluation.outcome + " requires a reason code",
        path: ["reasonCodes"],
      });
    }
  });

export type RegulatoryRuleEvaluationV1 = z.infer<
  typeof regulatoryRuleEvaluationV1Schema
>;

export const corporatePolicyEvaluationV1Schema = z
  .object({
    schemaVersion: z.literal("corporate-policy-evaluation.v1"),
    evaluationId: identifierSchema,
    policyId: identifierSchema,
    policyVersion: identifierSchema,
    tenantId: identifierSchema,
    workspaceId: identifierSchema,
    inputFactIds: uniqueIdentifierArraySchema,
    outcome: z.enum(["ALLOW", "DENY", "REVIEW", "NOT_APPLICABLE"]),
    reasonCodes: z
      .array(governedReasonCodeV1Schema)
      .superRefine(uniqueStrings),
    evaluatedAt: governedTimestampV1Schema,
  })
  .strict()
  .superRefine((evaluation, context) => {
    if (
      ["DENY", "REVIEW"].includes(evaluation.outcome) &&
      evaluation.reasonCodes.length === 0
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: evaluation.outcome + " requires a reason code",
        path: ["reasonCodes"],
      });
    }
  });

export type CorporatePolicyEvaluationV1 = z.infer<
  typeof corporatePolicyEvaluationV1Schema
>;

export const riskAssessmentV1Schema = z
  .object({
    schemaVersion: z.literal("risk-assessment.v1"),
    assessmentId: identifierSchema,
    methodVersion: identifierSchema,
    inputHash: governedSha256V1Schema,
    level: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL", "UNKNOWN"]),
    score: z.number().finite().min(0).max(100).optional(),
    factors: z
      .array(
        z
          .object({
            factorId: identifierSchema,
            level: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL", "UNKNOWN"]),
            reasonCode: governedReasonCodeV1Schema,
            factIds: uniqueIdentifierArraySchema,
            evaluationIds: uniqueIdentifierArraySchema,
          })
          .strict(),
      )
      .superRefine(uniqueByField("factorId")),
    evaluatedAt: governedTimestampV1Schema,
  })
  .strict();

export type RiskAssessmentV1 = z.infer<typeof riskAssessmentV1Schema>;

export const humanAuthorityDecisionV1Schema = z
  .object({
    schemaVersion: z.literal("human-authority-decision.v1"),
    authorityDecisionId: identifierSchema,
    tenantId: identifierSchema,
    workspaceId: identifierSchema,
    subject: z
      .object({
        caseId: identifierSchema,
        action: identifierSchema,
        resourceType: identifierSchema,
        resourceId: identifierSchema,
        inputHash: governedSha256V1Schema,
      })
      .strict(),
    decision: z.enum(["APPROVED", "REJECTED"]),
    decidedByUserId: identifierSchema,
    decidedAt: governedTimestampV1Schema,
    validUntil: governedTimestampV1Schema.nullable(),
    policyVersion: identifierSchema,
    reasonCodes: z
      .array(governedReasonCodeV1Schema)
      .superRefine(uniqueStrings),
    evidenceRefs: z
      .array(immutableArtifactRefV1Schema)
      .superRefine(uniqueByField("artifactId")),
  })
  .strict()
  .superRefine((decision, context) => {
    if (
      decision.validUntil &&
      Date.parse(decision.validUntil) <= Date.parse(decision.decidedAt)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "validUntil must be after decidedAt",
        path: ["validUntil"],
      });
    }
    if (decision.decision === "REJECTED" && decision.reasonCodes.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "REJECTED decision requires a reason code",
        path: ["reasonCodes"],
      });
    }
  });

export type HumanAuthorityDecisionV1 = z.infer<
  typeof humanAuthorityDecisionV1Schema
>;

export const governedCaseV1Schema = z
  .object({
    schemaVersion: z.literal(GOVERNED_CASE_V1_SCHEMA_VERSION),
    caseId: identifierSchema,
    caseType: identifierSchema,
    tenantId: identifierSchema,
    workspaceId: identifierSchema,
    revision: z.number().int().positive(),
    lifecycle: z.enum([
      "DISCOVERY",
      "ASSESSING",
      "AWAITING_REVIEW",
      "READY",
      "BLOCKED",
      "CLOSED",
    ]),
    facts: z.array(factV1Schema).superRefine(uniqueByField("factId")),
    inconsistencies: z
      .array(sourceInconsistencyV1Schema)
      .superRefine(uniqueByField("inconsistencyId")),
    regulatoryEvaluations: z
      .array(regulatoryRuleEvaluationV1Schema)
      .superRefine(uniqueByField("evaluationId")),
    corporatePolicyEvaluations: z
      .array(corporatePolicyEvaluationV1Schema)
      .superRefine(uniqueByField("evaluationId")),
    riskAssessment: riskAssessmentV1Schema,
    humanAuthorityDecisions: z
      .array(humanAuthorityDecisionV1Schema)
      .superRefine(uniqueByField("authorityDecisionId")),
    domainState: jsonValueV1Schema,
    runRefs: z
      .array(immutableArtifactRefV1Schema)
      .superRefine(uniqueByField("artifactId")),
    receiptRefs: z
      .array(immutableArtifactRefV1Schema)
      .superRefine(uniqueByField("artifactId")),
    evidenceRefs: z
      .array(immutableArtifactRefV1Schema)
      .superRefine(uniqueByField("artifactId")),
    eventRefs: z
      .array(immutableArtifactRefV1Schema)
      .superRefine(uniqueByField("artifactId")),
    createdAt: governedTimestampV1Schema,
    updatedAt: governedTimestampV1Schema,
  })
  .strict();

type GovernedCaseV1Shape = z.infer<typeof governedCaseV1Schema>;

export type GovernedCaseV1<
  TCaseType extends string = string,
  TFactKey extends string = string,
  TDomainState extends JsonValueV1 = JsonValueV1,
> = Omit<GovernedCaseV1Shape, "caseType" | "facts" | "domainState"> & {
  readonly caseType: TCaseType;
  readonly facts: readonly FactV1<TFactKey>[];
  readonly domainState: TDomainState;
};

export function validateGovernedCaseV1(input: unknown) {
  return governedCaseV1Schema.safeParse(input);
}
