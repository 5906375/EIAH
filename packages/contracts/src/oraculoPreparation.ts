import { z } from "zod";

const text = z.string().trim().min(1).max(500);

const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
});
export const oraculoOperationReferenceV1Schema = z.object({
  containerNumber: text.optional(),
  returnDate: calendarDate.optional(),
}).strict();

/** User descriptions are not verified locations, authorities or evidence. */
export const oraculoPreparationFieldV1Schema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("not_informed") }).strict(),
  z.object({ status: z.literal("to_confirm"), value: text.optional() }).strict(),
  z.object({ status: z.literal("not_applicable"), justification: text }).strict(),
  z.object({ status: z.literal("informed"), value: text }).strict(),
]);

export const ORACULO_PREPARATION_FIELDS = ["port", "depot", "flow"] as const;
export type OraculoPreparationFieldKey = (typeof ORACULO_PREPARATION_FIELDS)[number];

const pendingField = () => ({ status: "not_informed" as const });
const context = z.object({
  port: oraculoPreparationFieldV1Schema.default(pendingField),
  depot: oraculoPreparationFieldV1Schema.default(pendingField),
  flow: oraculoPreparationFieldV1Schema.default(pendingField),
}).strict();

/** Preparation only: deliberately separate from the strict S1 execution input. */
export const oraculoEmptyReturnPreparationV1Schema = z.object({
  schemaVersion: z.literal("oraculo.empty-return-preparation.v1"),
  tenantId: text,
  workspaceId: text,
  context: context.default({}),
}).strict();

export type OraculoEmptyReturnPreparationV1 = z.infer<typeof oraculoEmptyReturnPreparationV1Schema>;
export type OraculoPreparationScope = Readonly<{ tenantId: string; workspaceId: string }>;

export const ORACULO_PREPARATION_WRITE_SCOPE = "log.oraculo_preparation.write" as const;
export const ORACULO_PREPARATION_CASE_TYPE = "ORACULO_EMPTY_RETURN_PREPARATION_V1" as const;
export const oraculoPreparationWriteV1Schema = z.object({ context, operationReference: oraculoOperationReferenceV1Schema.optional() }).strict();
export const oraculoPreparationUpdateV1Schema = oraculoPreparationWriteV1Schema.extend({
  expectedRevision: z.number().int().positive(),
}).strict();
export const ORACULO_UPLOAD_AGENT = "oraculo-sc" as const;
export const oraculoEvidenceKindSchema = z.enum(["return_instruction", "appointment", "inspection", "receipt", "communication", "other"]);
export const oraculoEvidenceLinkV1Schema = z.object({
  documentId: text,
  kind: oraculoEvidenceKindSchema,
  sourceDescription: text,
  documentDate: calendarDate.optional(),
  expectedRevision: z.number().int().positive(),
}).strict();
export const oraculoEvidenceV1Schema = oraculoEvidenceLinkV1Schema.omit({ expectedRevision: true }).extend({
  fileName: text,
  mimeType: text,
  sizeBytes: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  uploadedAt: z.string().datetime(),
  linkedAt: z.string().datetime(),
  linkedBy: text,
  reviewStatus: z.literal("unreviewed"),
}).strict();
export type OraculoEvidenceV1 = z.infer<typeof oraculoEvidenceV1Schema>;
export type OraculoEvidenceLinkV1 = z.infer<typeof oraculoEvidenceLinkV1Schema>;
export type OraculoEvidenceCheckV1 = {
  evidence: OraculoEvidenceV1;
  integrity: "available" | "document_not_found" | "file_unavailable" | "integrity_mismatch";
};
export const ORACULO_CONTENT_REVIEW_SCOPE = "log.oraculo_preparation.content_review" as const;
export const oraculoDocumentReviewRequestV1Schema = z.object({
  documentId: text,
  expectedRevision: z.number().int().positive(),
  acknowledgedDocumentRead: z.literal(true),
  locator: text,
  notes: text,
  observations: z.object({
    containerNumber: text.optional(),
    port: text.optional(),
    depot: text.optional(),
    returnDate: calendarDate.optional(),
    movement: z.enum(["empty_return", "other", "not_identified"]),
  }).strict(),
}).strict();
export const oraculoDocumentCheckV1Schema = z.object({
  field: z.enum(["containerNumber", "port", "depot", "returnDate", "movement"]),
  expected: text.optional(), observed: text.optional(),
  status: z.enum(["matches", "diverges", "reference_missing", "reference_unconfirmed", "not_observed", "not_assessed"]),
}).strict();
export const oraculoDocumentReviewV1Schema = oraculoDocumentReviewRequestV1Schema.omit({ expectedRevision: true }).extend({
  schemaVersion: z.literal("oraculo.document-review.v1"),
  id: text, caseId: text, tenantId: text, workspaceId: text,
  documentSha256: z.string().regex(/^[a-f0-9]{64}$/),
  basedOnRevision: z.number().int().positive(),
  bindingHash: z.string().regex(/^[a-f0-9]{64}$/),
  reviewedBy: text, reviewedAt: z.string().datetime(),
  method: z.literal("human_transcription"),
  outcome: z.enum(["consistent_in_checked_fields", "divergent", "indeterminate"]),
  checks: z.array(oraculoDocumentCheckV1Schema).length(5),
  operationalAuthorization: z.literal(false), responsibilityClosure: z.literal(false), costClosure: z.literal(false),
}).strict();
export type OraculoOperationReferenceV1 = z.infer<typeof oraculoOperationReferenceV1Schema>;
export type OraculoDocumentReviewRequestV1 = z.infer<typeof oraculoDocumentReviewRequestV1Schema>;
export type OraculoDocumentCheckV1 = z.infer<typeof oraculoDocumentCheckV1Schema>;
export type OraculoDocumentReviewV1 = z.infer<typeof oraculoDocumentReviewV1Schema>;
export type OraculoDocumentReviewStateV1 = { review: OraculoDocumentReviewV1; state: "current" | "context_changed" | "file_unavailable" | "superseded" };
/**
 * FD-E2E-004 (J17) — decisão humana sobre itens que a preparação não pode resolver sozinha (campo dispensado, divergência ou
 * correspondência indeterminada). Segue o padrão de `contentReviews`: eventos apendáveis NO registro versionado do caso (cada evento é uma
 * nova revisão em `governed_case_revisions`), sem tabela, fila nem notificação. A decisão NÃO autoriza execução, aceite, responsabilidade,
 * custos nem transmissão: é só o registro de que um responsável elegível, diferente de quem pediu, olhou a base exata e decidiu.
 */
export const ORACULO_DECISION_VALUES = ["approved", "rejected", "more_information"] as const;
export const oraculoDecisionValueSchema = z.enum(ORACULO_DECISION_VALUES);
/** A autoridade para decidir é a MESMA da conferência humana (`content_review`); um escopo próprio é proposta pendente de ratificação. */
export const ORACULO_DECISION_SCOPE = "log.oraculo_preparation.content_review" as const;
export const oraculoDecisionRequestInputV1Schema = z.object({ expectedRevision: z.number().int().positive(), note: text.optional() }).strict();
export const oraculoDecisionInputV1Schema = z.object({
  requestId: text,
  expectedRevision: z.number().int().positive(),
  decision: oraculoDecisionValueSchema,
  note: text,
  acknowledgedBasisRead: z.literal(true),
}).strict();
const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/);
export const oraculoDecisionRequestV1Schema = z.object({
  schemaVersion: z.literal("oraculo.decision-request.v1"),
  kind: z.literal("requested"),
  id: text, caseId: text, tenantId: text, workspaceId: text,
  basedOnRevision: z.number().int().positive(),
  basisHash: sha256Hex,
  triggers: z.array(text).min(1).max(20),
  note: text.optional(),
  requestedBy: text,
  requestedAt: z.string().datetime(),
  operationalAuthorization: z.literal(false),
}).strict();
export const oraculoDecisionRecordV1Schema = z.object({
  schemaVersion: z.literal("oraculo.decision.v1"),
  kind: z.literal("decided"),
  id: text, requestId: text, caseId: text, tenantId: text, workspaceId: text,
  basedOnRevision: z.number().int().positive(),
  basisHash: sha256Hex,
  decision: oraculoDecisionValueSchema,
  note: text,
  acknowledgedBasisRead: z.literal(true),
  decidedBy: text,
  decidedAt: z.string().datetime(),
  operationalAuthorization: z.literal(false), executionAuthorization: z.literal(false), responsibilityClosure: z.literal(false), costClosure: z.literal(false),
}).strict();
export const oraculoHumanDecisionEventV1Schema = z.discriminatedUnion("kind", [oraculoDecisionRequestV1Schema, oraculoDecisionRecordV1Schema]);
export type OraculoDecisionValue = (typeof ORACULO_DECISION_VALUES)[number];
export type OraculoDecisionRequestInputV1 = z.infer<typeof oraculoDecisionRequestInputV1Schema>;
export type OraculoDecisionInputV1 = z.infer<typeof oraculoDecisionInputV1Schema>;
export type OraculoDecisionRequestV1 = z.infer<typeof oraculoDecisionRequestV1Schema>;
export type OraculoDecisionRecordV1 = z.infer<typeof oraculoDecisionRecordV1Schema>;
export type OraculoHumanDecisionEventV1 = z.infer<typeof oraculoHumanDecisionEventV1Schema>;

export const oraculoPreparationRecordV1Schema = oraculoEmptyReturnPreparationV1Schema.extend({
  caseId: text,
  caseType: z.literal(ORACULO_PREPARATION_CASE_TYPE),
  revision: z.number().int().positive(),
  lifecycle: z.literal("DISCOVERY"),
  operationReference: oraculoOperationReferenceV1Schema.optional(),
  contentReviews: z.array(oraculoDocumentReviewV1Schema).max(100).optional(),
  // Idem: opcional sem default, para que snapshots históricos mantenham o hash canônico original.
  humanDecisions: z.array(oraculoHumanDecisionEventV1Schema).max(100).optional(),
  // Optional without a default: historical snapshots keep their original canonical hash.
  evidences: z.array(oraculoEvidenceV1Schema).max(20).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  executionAllowed: z.literal(false),
  authorizationState: z.literal("NOT_REQUESTED"),
  externalTransmissionAllowed: z.literal(false),
}).strict();
export type OraculoPreparationRecordV1 = z.infer<typeof oraculoPreparationRecordV1Schema>;
