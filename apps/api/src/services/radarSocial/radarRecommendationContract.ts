// Radar Social — contrato puro de RadarRecommendation: o candidato
// estruturado (o mesmo formato preservado em
// RadarAnalysisAttempt.preservedResultPayload, antes da validação de
// referências) e a validação determinística de referências contra o
// material/contexto de origem. Ver
// docs/architecture/radar-social-construction-plan-v1.md, Atualizações
// 1.11, 1.12 e 1.17.
//
// Nenhuma operação transacional aqui (vive em radarAnalysisAttemptService.ts
// / radarRecommendationService.ts).

export class RadarRecommendationError extends Error {
  constructor(readonly reasonCode: string, readonly context: Record<string, unknown> = {}) {
    super(`radar_recommendation_invalid:${reasonCode}`);
    this.name = "RadarRecommendationError";
  }
}

export const RADAR_RECOMMENDATION_CONTRACT_VERSION = "radar-recommendation.v1" as const;

// Três resultados VÁLIDOS — nenhum equivalente a falha técnica (Atualização
// 1.11/1.12).
export const RECOMMENDATION_TYPES = ["actionable", "insufficient_evidence", "do_not_act"] as const;
export type RecommendationType = (typeof RECOMMENDATION_TYPES)[number];

// Natureza da afirmação em relação ao MATERIAL — nunca promovida a fato do
// mundo real (Atualização 1.11 seção B). Dimensão independente de
// confidenceLevel.
export const STATEMENT_NATURES = ["FACT_IN_MATERIAL", "INFERENCE", "HYPOTHESIS", "UNKNOWN"] as const;
export type StatementNature = (typeof STATEMENT_NATURES)[number];

export const CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export interface RecommendationReference {
  id: string;
  // Trecho que precisa existir literalmente numa das fontes autorizadas
  // (material/contexto adicional) — validado por
  // verifyReferencesAgainstSources antes de aceitar o candidato.
  quote: string;
}

export interface RecommendationStatement {
  content: string;
  natureza: StatementNature;
  referenceIds: string[];
  confidenceLevel?: ConfidenceLevel;
}

export interface RecommendationCandidate {
  contractVersion: typeof RADAR_RECOMMENDATION_CONTRACT_VERSION;
  recommendationType: RecommendationType;
  summary: string;
  statements: RecommendationStatement[];
  references: RecommendationReference[];
  limitations?: string;
  suggestedAction?: string;
  insufficientEvidenceReason?: string;
  doNotActReason?: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertKnownKeys(value: Record<string, unknown>, allowed: readonly string[], path: string) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      throw new RadarRecommendationError("recommendation_unknown_field", { field: path ? `${path}.${key}` : key });
    }
  }
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new RadarRecommendationError("recommendation_field_invalid", { field });
  }
  return value;
}

const CANDIDATE_FIELDS = [
  "contractVersion", "recommendationType", "summary", "statements", "references",
  "limitations", "suggestedAction", "insufficientEvidenceReason", "doNotActReason",
] as const;
const STATEMENT_FIELDS = ["content", "natureza", "referenceIds", "confidenceLevel"] as const;
const REFERENCE_FIELDS = ["id", "quote"] as const;

/**
 * Validação estrutural completa do candidato — a MESMA forma usada em
 * `preservedResultPayload` (Atualização 1.15) antes da validação de
 * referências contra a fonte. Não verifica veracidade nem sustentação
 * semântica — só forma, enums e referências cruzadas internas
 * (`referenceIds` existentes em `references[].id`).
 */
export function validateRecommendationCandidate(value: unknown): RecommendationCandidate {
  if (!isPlainObject(value)) throw new RadarRecommendationError("recommendation_payload_not_object");
  assertKnownKeys(value, CANDIDATE_FIELDS, "");

  if (value.contractVersion !== RADAR_RECOMMENDATION_CONTRACT_VERSION) {
    throw new RadarRecommendationError("recommendation_contract_version_invalid", { received: value.contractVersion });
  }

  const recommendationType = value.recommendationType;
  if (typeof recommendationType !== "string" || !RECOMMENDATION_TYPES.includes(recommendationType as RecommendationType)) {
    throw new RadarRecommendationError("recommendation_type_invalid", { received: recommendationType });
  }

  const summary = requireNonEmptyString(value.summary, "summary");

  if (!Array.isArray(value.statements) || value.statements.length === 0) {
    throw new RadarRecommendationError("recommendation_field_invalid", { field: "statements" });
  }
  if (!Array.isArray(value.references)) {
    throw new RadarRecommendationError("recommendation_field_invalid", { field: "references" });
  }

  const referenceIds = new Set<string>();
  const references: RecommendationReference[] = value.references.map((raw, index) => {
    const path = `references[${index}]`;
    if (!isPlainObject(raw)) throw new RadarRecommendationError("recommendation_field_invalid", { field: path });
    assertKnownKeys(raw, REFERENCE_FIELDS, path);
    const id = requireNonEmptyString(raw.id, `${path}.id`);
    const quote = requireNonEmptyString(raw.quote, `${path}.quote`);
    if (referenceIds.has(id)) throw new RadarRecommendationError("recommendation_duplicate_reference_id", { id });
    referenceIds.add(id);
    return { id, quote };
  });

  const statements: RecommendationStatement[] = value.statements.map((raw, index) => {
    const path = `statements[${index}]`;
    if (!isPlainObject(raw)) throw new RadarRecommendationError("recommendation_field_invalid", { field: path });
    assertKnownKeys(raw, STATEMENT_FIELDS, path);
    const content = requireNonEmptyString(raw.content, `${path}.content`);
    const natureza = raw.natureza;
    if (typeof natureza !== "string" || !STATEMENT_NATURES.includes(natureza as StatementNature)) {
      throw new RadarRecommendationError("recommendation_field_invalid", { field: `${path}.natureza` });
    }
    if (!Array.isArray(raw.referenceIds)) {
      throw new RadarRecommendationError("recommendation_field_invalid", { field: `${path}.referenceIds` });
    }
    const statementReferenceIds = raw.referenceIds.map((refId, refIndex) => {
      if (typeof refId !== "string" || !referenceIds.has(refId)) {
        throw new RadarRecommendationError("recommendation_reference_id_not_found", { field: `${path}.referenceIds[${refIndex}]`, refId });
      }
      return refId;
    });
    let confidenceLevel: ConfidenceLevel | undefined;
    if (raw.confidenceLevel !== undefined) {
      if (typeof raw.confidenceLevel !== "string" || !CONFIDENCE_LEVELS.includes(raw.confidenceLevel as ConfidenceLevel)) {
        throw new RadarRecommendationError("recommendation_field_invalid", { field: `${path}.confidenceLevel` });
      }
      confidenceLevel = raw.confidenceLevel as ConfidenceLevel;
    }
    return { content, natureza: natureza as StatementNature, referenceIds: statementReferenceIds, confidenceLevel };
  });

  const limitations = value.limitations === undefined ? undefined : requireNonEmptyString(value.limitations, "limitations");
  const suggestedAction = value.suggestedAction === undefined ? undefined : requireNonEmptyString(value.suggestedAction, "suggestedAction");
  const insufficientEvidenceReason = value.insufficientEvidenceReason === undefined ? undefined : requireNonEmptyString(value.insufficientEvidenceReason, "insufficientEvidenceReason");
  const doNotActReason = value.doNotActReason === undefined ? undefined : requireNonEmptyString(value.doNotActReason, "doNotActReason");

  // Regras cruzadas: cada recommendationType exige/permite campos distintos.
  if (recommendationType === "actionable" && !suggestedAction) {
    throw new RadarRecommendationError("recommendation_field_missing", { field: "suggestedAction", reason: "required_when_actionable" });
  }
  if (recommendationType === "insufficient_evidence" && !insufficientEvidenceReason) {
    throw new RadarRecommendationError("recommendation_field_missing", { field: "insufficientEvidenceReason", reason: "required_when_insufficient_evidence" });
  }
  if (recommendationType === "do_not_act" && !doNotActReason) {
    throw new RadarRecommendationError("recommendation_field_missing", { field: "doNotActReason", reason: "required_when_do_not_act" });
  }

  return {
    contractVersion: RADAR_RECOMMENDATION_CONTRACT_VERSION,
    recommendationType: recommendationType as RecommendationType,
    summary,
    statements,
    references,
    limitations,
    suggestedAction,
    insufficientEvidenceReason,
    doNotActReason,
  };
}

/**
 * Validação determinística de referências: cada `reference.quote` precisa
 * existir literalmente (substring exata) em pelo menos uma das fontes
 * autorizadas (material + contexto adicional, quando houver). Comprova só
 * localização/estrutura — NUNCA veracidade nem sustentação semântica
 * completa da conclusão (Atualização 1.12/1.17). Lança na primeira
 * referência não verificável, sem incluir o conteúdo da fonte no erro.
 */
export function verifyReferencesAgainstSources(
  references: readonly RecommendationReference[],
  sources: readonly string[]
): void {
  for (const reference of references) {
    const found = sources.some((source) => source.includes(reference.quote));
    if (!found) {
      throw new RadarRecommendationError("reference_not_verifiable", { referenceId: reference.id });
    }
  }
}

export interface RadarRecommendationProvenance {
  generatedByAgent: string;
  provider: string;
  model: string;
  providerRequestId: string;
  generatedAt: string;
}

export interface RadarRecommendationRecord {
  id: string;
  tenantId: string;
  workspaceId: string;
  attemptId: string;
  recommendationType: RecommendationType;
  summary: string;
  statements: RecommendationStatement[];
  references: RecommendationReference[];
  limitations: string | null;
  suggestedAction: string | null;
  insufficientEvidenceReason: string | null;
  doNotActReason: string | null;
  provenance: RadarRecommendationProvenance;
  createdAt: Date;
}
