import { z } from "zod";

export const J360LegalDecisionSchema = z.enum([
  "APROVADO_BAIXO_RISCO",
  "APROVADO_COM_RESSALVAS",
  "NAO_RECOMENDADO_SEM_REVISAO",
]);

export const J360LegalRiskLevelSchema = z.enum(["low", "medium", "high", "critical"]);

// sourceStatus é o único sinal de proveniência introduzido nesta frente (E0-A):
// "provided" = o produtor confirmou um documento/fonte concreto;
// "not_provided" = o produtor confirmou explicitamente a ausência de documento;
// "unknown" = payload legado ou origem que não pode ser determinada com segurança.
// Não significa fonte validada, vigente ou citação verificada — apenas que existe (ou não)
// um documento concreto por trás do valor de `document`. Estados de verificação
// (verified/unverified/stale/conflicting) pertencem a uma frente futura de provenance.
export const J360LegalEvidenceSourceStatusSchema = z.enum(["provided", "not_provided", "unknown"]);

export const J360LegalEvidenceRefSchema = z
  .object({
    document: z.string().min(1).nullable(),
    sourceStatus: J360LegalEvidenceSourceStatusSchema.optional(),
    page: z.string().nullable(),
    section: z.string().nullable(),
    excerpt: z.string().nullable().default(null),
  })
  .transform((evidenceRef) => {
    if (evidenceRef.sourceStatus !== undefined) {
      return evidenceRef as typeof evidenceRef & {
        sourceStatus: z.infer<typeof J360LegalEvidenceSourceStatusSchema>;
      };
    }

    // O default de leitura precisa estar disponível aos renderers, mas não pode
    // virar write-back. Uma propriedade não enumerável é lida normalmente em
    // runtime e é omitida por JSON.stringify/Object spread.
    return Object.defineProperty(evidenceRef, "sourceStatus", {
      value: "unknown" as const,
      enumerable: false,
      configurable: true,
      writable: false,
    }) as typeof evidenceRef & { sourceStatus: "unknown" };
  });

export const J360LegalRiskMatrixItemSchema = z.object({
  risk: z.string().min(1),
  severity: J360LegalRiskLevelSchema,
  relatedClause: z.string().nullable(),
  impact: z.string().min(1),
  mitigation: z.string().min(1),
  evidenceRefs: z
    .array(J360LegalEvidenceRefSchema)
    .min(1)
    .default([{ document: null, page: null, section: null, excerpt: null }]),
});

export const J360LegalCoverageMatrixItemSchema = z.object({
  whatParecerAsks: z.string().min(1),
  whatRunAnswered: z.string().min(1),
  whatStillNeedsManualReview: z.string().nullable(),
});

export const J360LegalFormalHeaderSchema = z.object({
  number: z.string().nullable(),
  interessado: z.string().nullable(),
  assunto: z.string().nullable(),
});

export const J360LegalReferenceSetSchema = z.object({
  cltRefs: z.array(z.string()).default([]),
  tstRefs: z.array(z.string()).default([]),
  ojRefs: z.array(z.string()).default([]),
});

export const J360LegalFoundationItemSchema = z.object({
  topic: z.string().min(1),
  analysis: z.string().min(1),
  cltRefs: z.array(z.string()).default([]),
  tstRefs: z.array(z.string()).default([]),
  ojRefs: z.array(z.string()).default([]),
  evidenceRefs: z.array(J360LegalEvidenceRefSchema).default([]),
});

export const J360LegalJurimetriaSchema = z.object({
  riskOfLoss: J360LegalRiskLevelSchema.nullable(),
  rationale: z.string().nullable(),
});

export const J360LegalExecutiveGuidanceSchema = z.object({
  adjustNow: z.array(z.string()).default([]),
  dependsOnHumanReview: z.array(z.string()).default([]),
  rerunWhen: z.array(z.string()).default([]),
  readyForInternalUseWhen: z.array(z.string()).default([]),
});

export const J360LegalWorkspaceBrandSchema = z.object({
  name: z.string().nullable().default(null),
  logoUrl: z.string().nullable().default(null),
  primaryColor: z.string().nullable().default(null),
  accentColor: z.string().nullable().default(null),
});

export const J360LegalDocumentIdentitySchema = z.object({
  documentName: z.string().nullable().default(null),
  generatedAt: z.string().nullable().default(null),
  reportVersion: z.string().default("v1"),
});

export const J360LegalReportSectionStatusSchema = z.enum(["available", "partial", "missing"]);

export const J360LegalReportSectionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  anchor: z.string().min(1),
  summary: z.string().nullable().default(null),
  status: J360LegalReportSectionStatusSchema.default("available"),
});

export const J360LegalTableOfContentsItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  anchor: z.string().min(1),
  order: z.number().int().nonnegative(),
});

export const J360LegalReportSchema = z.object({
  schemaVersion: z.literal("j360_legal_report.v1"),
  documentType: z.string().nullable(),
  analysisScope: z.string().min(1),
  workspaceBrand: J360LegalWorkspaceBrandSchema.default({
    name: null,
    logoUrl: null,
    primaryColor: null,
    accentColor: null,
  }),
  documentIdentity: J360LegalDocumentIdentitySchema.default({
    documentName: null,
    generatedAt: null,
    reportVersion: "v1",
  }),
  reportSections: z.array(J360LegalReportSectionSchema).default([]),
  tableOfContents: z.array(J360LegalTableOfContentsItemSchema).default([]),
  header: J360LegalFormalHeaderSchema.default({
    number: null,
    interessado: null,
    assunto: null,
  }),
  ementa: z.string().nullable().default(null),
  relatorioFactual: z.string().nullable().default(null),
  fundamentos: z.array(J360LegalFoundationItemSchema).default([]),
  references: J360LegalReferenceSetSchema.default({
    cltRefs: [],
    tstRefs: [],
    ojRefs: [],
  }),
  executiveGuidance: J360LegalExecutiveGuidanceSchema.default({
    adjustNow: [],
    dependsOnHumanReview: [],
    rerunWhen: [],
    readyForInternalUseWhen: [],
  }),
  jurimetria: J360LegalJurimetriaSchema.default({
    riskOfLoss: null,
    rationale: null,
  }),
  legalDecision: J360LegalDecisionSchema,
  riskLevel: J360LegalRiskLevelSchema,
  summary: z.string().min(1),
  strengths: z.array(z.string()).default([]),
  attentionPoints: z.array(z.string()).default([]),
  riskMatrix: z.array(J360LegalRiskMatrixItemSchema).default([]),
  ambiguities: z.array(z.string()).default([]),
  recommendedAdjustments: z.array(z.string()).default([]),
  recommendedEvidence: z.array(z.string()).default([]),
  humanValidationQuestions: z.array(z.string()).default([]),
  manualReviewRequired: z.boolean(),
  howToProceedNow: z.array(z.string()).default([]),
  nextBestImplementationAction: z.string().nullable(),
  coverageMatrix: z.array(J360LegalCoverageMatrixItemSchema).default([]),
  conclusaoFormal: z.string().nullable().default(null),
});

export type J360LegalReport = z.infer<typeof J360LegalReportSchema>;
