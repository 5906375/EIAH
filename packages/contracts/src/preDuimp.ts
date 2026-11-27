import { z } from "zod";

import {
  factV1Schema,
  governedCaseV1Schema,
  governedReasonCodeV1Schema,
  governedSha256V1Schema,
  governedTimestampV1Schema,
  jsonValueV1Schema,
  sourceSnapshotRefV1Schema,
  type JsonValueV1,
} from "./governance.js";

export const PRE_DUIMP_CASE_TYPE_V1 = "log.pre_duimp" as const;
export const PRE_DUIMP_GATE_DECISION_V1_SCHEMA_VERSION =
  "log.pre_duimp.gate-decision.v1" as const;

const identifierSchema = z.string().min(1);
const preDuimpFactKeyPattern =
  /^log\.pre_duimp\.[A-Za-z0-9][A-Za-z0-9._-]*$/;

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

const uniqueIdentifierArraySchema = z
  .array(identifierSchema)
  .superRefine(uniqueStrings);

export const preDuimpFactKeyV1Schema = z
  .string()
  .regex(
    preDuimpFactKeyPattern,
    "expected a fact key prefixed by log.pre_duimp.",
  );

export type PreDuimpFactKeyV1 = z.infer<typeof preDuimpFactKeyV1Schema>;

export const preDuimpFactV1Schema = factV1Schema.superRefine(
  (fact, context) => {
    if (!preDuimpFactKeyPattern.test(fact.key)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "expected a fact key prefixed by log.pre_duimp.",
        path: ["key"],
      });
    }
    if (fact.namespace !== PRE_DUIMP_CASE_TYPE_V1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "PRE-DUIMP facts require the log.pre_duimp namespace",
        path: ["namespace"],
      });
    }
  },
);

export const preDuimpDomainStateV1Schema = z
  .object({
    operationMode: z.literal("READ_ONLY_DISCOVERY"),
    preparationStage: z.enum([
      "SOURCE_COLLECTION",
      "NORMALIZATION",
      "ASSESSMENT",
      "HUMAN_REVIEW",
      "READINESS_DECIDED",
    ]),
    sourceSnapshotIds: uniqueIdentifierArraySchema,
    externalTransmissionAllowed: z.literal(false),
  })
  .strict();

export type PreDuimpDomainStateV1 = z.infer<
  typeof preDuimpDomainStateV1Schema
>;

export const preDuimpGateDecisionV1Schema = z
  .object({
    schemaVersion: z.literal(PRE_DUIMP_GATE_DECISION_V1_SCHEMA_VERSION),
    gateDecisionId: identifierSchema,
    caseId: identifierSchema,
    tenantId: identifierSchema,
    workspaceId: identifierSchema,
    outcome: z.enum(["BLOCK", "REVIEW", "READY"]),
    reasonCodes: z
      .array(governedReasonCodeV1Schema)
      .superRefine(uniqueStrings),
    inputHash: governedSha256V1Schema,
    evaluatorVersion: identifierSchema,
    inconsistencyIds: uniqueIdentifierArraySchema,
    regulatoryEvaluationIds: uniqueIdentifierArraySchema,
    corporatePolicyEvaluationIds: uniqueIdentifierArraySchema,
    riskAssessmentId: identifierSchema,
    humanAuthorityDecisionIds: uniqueIdentifierArraySchema,
    readinessOnly: z.literal(true),
    authorizationState: z.literal("NOT_REQUESTED"),
    externalTransmissionAllowed: z.literal(false),
    evaluatedAt: governedTimestampV1Schema,
  })
  .strict()
  .superRefine((decision, context) => {
    if (
      ["BLOCK", "REVIEW"].includes(decision.outcome) &&
      decision.reasonCodes.length === 0
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: decision.outcome + " requires a reason code",
        path: ["reasonCodes"],
      });
    }
    if (decision.outcome === "READY" && decision.reasonCodes.length > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "READY must not carry blocking or review reason codes",
        path: ["reasonCodes"],
      });
    }
  });

export type PreDuimpGateDecisionV1 = z.infer<
  typeof preDuimpGateDecisionV1Schema
>;

const preDuimpCaseStructureV1Schema = governedCaseV1Schema.extend({
  caseType: z.literal(PRE_DUIMP_CASE_TYPE_V1),
  facts: z
    .array(preDuimpFactV1Schema)
    .superRefine((facts, context) =>
      uniqueStrings(
        facts.map((fact) => fact.factId),
        context,
      ),
    ),
  domainState: preDuimpDomainStateV1Schema,
  subject: z
    .object({
      referenceType: z.literal("INTERNAL_CASE_REFERENCE"),
      referenceId: identifierSchema,
    })
    .strict(),
  gateDecision: preDuimpGateDecisionV1Schema,
});

function addMismatch(
  context: z.RefinementCtx,
  path: (string | number)[],
  message: string,
) {
  context.addIssue({
    code: z.ZodIssueCode.custom,
    message,
    path,
  });
}

function sameSet(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((identifier) => right.includes(identifier))
  );
}

export const preDuimpCaseV1Schema =
  preDuimpCaseStructureV1Schema.superRefine((candidate, context) => {
    const gate = candidate.gateDecision;

    if (gate.caseId !== candidate.caseId) {
      addMismatch(context, ["gateDecision", "caseId"], "gate caseId mismatch");
    }
    if (gate.tenantId !== candidate.tenantId) {
      addMismatch(
        context,
        ["gateDecision", "tenantId"],
        "gate tenant scope mismatch",
      );
    }
    if (gate.workspaceId !== candidate.workspaceId) {
      addMismatch(
        context,
        ["gateDecision", "workspaceId"],
        "gate workspace scope mismatch",
      );
    }
    if (gate.riskAssessmentId !== candidate.riskAssessment.assessmentId) {
      addMismatch(
        context,
        ["gateDecision", "riskAssessmentId"],
        "gate risk assessment reference mismatch",
      );
    }

    const gateReferences = [
      {
        actual: gate.inconsistencyIds,
        expected: candidate.inconsistencies.map(
          (item) => item.inconsistencyId,
        ),
        path: "inconsistencyIds",
      },
      {
        actual: gate.regulatoryEvaluationIds,
        expected: candidate.regulatoryEvaluations.map(
          (item) => item.evaluationId,
        ),
        path: "regulatoryEvaluationIds",
      },
      {
        actual: gate.corporatePolicyEvaluationIds,
        expected: candidate.corporatePolicyEvaluations.map(
          (item) => item.evaluationId,
        ),
        path: "corporatePolicyEvaluationIds",
      },
      {
        actual: gate.humanAuthorityDecisionIds,
        expected: candidate.humanAuthorityDecisions.map(
          (item) => item.authorityDecisionId,
        ),
        path: "humanAuthorityDecisionIds",
      },
    ];

    gateReferences.forEach(({ actual, expected, path }) => {
      if (!sameSet(actual, expected)) {
        addMismatch(
          context,
          ["gateDecision", path],
          "gate references must match the current case evaluations",
        );
      }
    });

    const factIds = new Set(candidate.facts.map((fact) => fact.factId));
    candidate.facts.forEach((fact, factIndex) => {
      fact.provenance.derivation.inputFactIds.forEach((inputFactId) => {
        if (!factIds.has(inputFactId) || inputFactId === fact.factId) {
          addMismatch(
            context,
            ["facts", factIndex, "provenance", "derivation", "inputFactIds"],
            "provenance must reference another fact in the same case",
          );
        }
      });
      fact.provenance.derivation.authorityDecisionIds.forEach((decisionId) => {
        if (
          !candidate.humanAuthorityDecisions.some(
            (decision) => decision.authorityDecisionId === decisionId,
          )
        ) {
          addMismatch(
            context,
            [
              "facts",
              factIndex,
              "provenance",
              "derivation",
              "authorityDecisionIds",
            ],
            "provenance authority decision is not part of the case",
          );
        }
      });
    });

    candidate.inconsistencies.forEach((item, index) => {
      item.factIds.forEach((factId) => {
        if (!factIds.has(factId)) {
          addMismatch(
            context,
            ["inconsistencies", index, "factIds"],
            "inconsistency references an unknown fact",
          );
        }
      });
    });

    const evaluationIds = new Set<string>();
    [
      ...candidate.regulatoryEvaluations,
      ...candidate.corporatePolicyEvaluations,
    ].forEach((evaluation) => {
      evaluationIds.add(evaluation.evaluationId);
    });

    candidate.riskAssessment.factors.forEach((factor, index) => {
      if (factor.factIds.some((factId) => !factIds.has(factId))) {
        addMismatch(
          context,
          ["riskAssessment", "factors", index, "factIds"],
          "risk factor references an unknown fact",
        );
      }
      if (
        factor.evaluationIds.some(
          (evaluationId) => !evaluationIds.has(evaluationId),
        )
      ) {
        addMismatch(
          context,
          ["riskAssessment", "factors", index, "evaluationIds"],
          "risk factor references an unknown evaluation",
        );
      }
    });

    [
      ...candidate.regulatoryEvaluations,
      ...candidate.corporatePolicyEvaluations,
    ].forEach((evaluation, index) => {
      if (
        evaluation.inputFactIds.some((factId) => !factIds.has(factId))
      ) {
        addMismatch(
          context,
          ["evaluations", index, "inputFactIds"],
          "evaluation references an unknown fact",
        );
      }
    });

    candidate.corporatePolicyEvaluations.forEach((evaluation, index) => {
      if (
        evaluation.tenantId !== candidate.tenantId ||
        evaluation.workspaceId !== candidate.workspaceId
      ) {
        addMismatch(
          context,
          ["corporatePolicyEvaluations", index],
          "corporate policy scope mismatch",
        );
      }
    });

    candidate.humanAuthorityDecisions.forEach((decision, index) => {
      if (
        decision.tenantId !== candidate.tenantId ||
        decision.workspaceId !== candidate.workspaceId ||
        decision.subject.caseId !== candidate.caseId
      ) {
        addMismatch(
          context,
          ["humanAuthorityDecisions", index],
          "human authority decision scope or case mismatch",
        );
      }
    });

    const referencedSnapshotIds = new Set<string>();
    candidate.facts.forEach((fact) => {
      fact.provenance.sourceSnapshots.forEach((snapshot) => {
        referencedSnapshotIds.add(snapshot.snapshotId);
      });
    });
    candidate.regulatoryEvaluations.forEach((evaluation) => {
      evaluation.legalSourceRefs.forEach((snapshot) => {
        referencedSnapshotIds.add(snapshot.snapshotId);
      });
    });
    if (
      !sameSet(
        candidate.domainState.sourceSnapshotIds,
        [...referencedSnapshotIds],
      )
    ) {
      addMismatch(
        context,
        ["domainState", "sourceSnapshotIds"],
        "domain snapshot references must match provenance and legal sources",
      );
    }

    if (gate.outcome === "READY" && candidate.lifecycle !== "READY") {
      addMismatch(
        context,
        ["lifecycle"],
        "READY gate requires READY lifecycle",
      );
    }
    if (
      gate.outcome === "REVIEW" &&
      candidate.lifecycle !== "AWAITING_REVIEW"
    ) {
      addMismatch(
        context,
        ["lifecycle"],
        "REVIEW gate requires AWAITING_REVIEW lifecycle",
      );
    }
  });

export type PreDuimpCaseV1 = z.infer<typeof preDuimpCaseV1Schema>;

export const preDuimpSourceReadRequestV1Schema = z
  .object({
    schemaVersion: z.literal("log.pre_duimp.source-read-request.v1"),
    tenantId: identifierSchema,
    workspaceId: identifierSchema,
    caseId: identifierSchema,
    sourceRole: z.enum([
      "CASE_INPUT",
      "CORPORATE_MASTER_DATA",
      "REGULATORY_CORPUS",
      "REFERENCE_DATA",
    ]),
    requestedKeys: z
      .array(preDuimpFactKeyV1Schema)
      .superRefine(uniqueStrings),
    asOf: governedTimestampV1Schema,
  })
  .strict();

export type PreDuimpSourceReadRequestV1 = z.infer<
  typeof preDuimpSourceReadRequestV1Schema
>;

export function createPreDuimpSourceSnapshotV1Schema<
  TRecord extends z.ZodType<JsonValueV1>,
>(recordSchema: TRecord) {
  return z
    .object({
      schemaVersion: z.literal("log.pre_duimp.source-snapshot.v1"),
      scope: z
        .object({
          tenantId: identifierSchema,
          workspaceId: identifierSchema,
          caseId: identifierSchema,
        })
        .strict(),
      sourceRef: sourceSnapshotRefV1Schema,
      records: z.array(recordSchema),
      readAt: governedTimestampV1Schema,
    })
    .strict();
}

export const preDuimpSourceSnapshotV1Schema =
  createPreDuimpSourceSnapshotV1Schema(jsonValueV1Schema);

type PreDuimpSourceSnapshotV1Shape = z.infer<
  typeof preDuimpSourceSnapshotV1Schema
>;

export type PreDuimpSourceSnapshotV1<
  TRecord extends JsonValueV1 = JsonValueV1,
> = Omit<PreDuimpSourceSnapshotV1Shape, "records"> & {
  readonly records: readonly TRecord[];
};

export const preDuimpSourceReadResultV1Schema = z.discriminatedUnion("ok", [
  z
    .object({
      ok: z.literal(true),
      snapshot: preDuimpSourceSnapshotV1Schema,
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      reasonCode: governedReasonCodeV1Schema,
      retryable: z.boolean(),
    })
    .strict(),
]);

export type PreDuimpSourceReadResultV1<
  TRecord extends JsonValueV1 = JsonValueV1,
> =
  | { readonly ok: true; readonly snapshot: PreDuimpSourceSnapshotV1<TRecord> }
  | {
      readonly ok: false;
      readonly reasonCode: string;
      readonly retryable: boolean;
    };

export function validatePreDuimpCaseV1(input: unknown) {
  return preDuimpCaseV1Schema.safeParse(input);
}

export function validatePreDuimpGateDecisionV1(input: unknown) {
  return preDuimpGateDecisionV1Schema.safeParse(input);
}
