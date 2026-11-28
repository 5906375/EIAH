// Radar Social — contrato puro de RadarRecommendationEvaluation: avaliação
// humana persistida de uma RadarRecommendation já existente — nunca uma
// decisão operacional (nenhum campo de ação executável existe aqui). Ver
// docs/architecture/radar-social-construction-plan-v1.md, "Fechamento
// documental proposto (18/09/2026)" e "Consolidação final (18/09/2026)".
//
// Nenhuma operação transacional aqui (vive em
// radarRecommendationEvaluationService.ts). Unidade independente — não
// importa de outro *Contract.ts do Radar, mesma convenção já estabelecida.

export class RadarRecommendationEvaluationError extends Error {
  constructor(readonly reasonCode: string, readonly context: Record<string, unknown> = {}) {
    super(`radar_recommendation_evaluation_invalid:${reasonCode}`);
    this.name = "RadarRecommendationEvaluationError";
  }
}

export class RadarRecommendationEvaluationConflictError extends Error {
  constructor(readonly reasonCode: string, readonly context: Record<string, unknown> = {}) {
    super(`radar_recommendation_evaluation_conflict:${reasonCode}`);
    this.name = "RadarRecommendationEvaluationConflictError";
  }
}

// Versão do FORMATO deste registro — nunca o significado dos valores de
// enum, versionado separadamente por criteriaVersion/RADAR_RECOMMENDATION_EVALUATION_RUBRICS.
export const RADAR_RECOMMENDATION_EVALUATION_CONTRACT_VERSION = "radar-recommendation-evaluation.v1" as const;

export const FUNDAMENTACAO_VALUES = [
  "bem_fundamentada", "parcialmente_fundamentada", "nao_fundamentada", "nao_avaliavel",
] as const;
export type FundamentacaoValue = (typeof FUNDAMENTACAO_VALUES)[number];

export const CLAREZA_VALUES = ["clara", "parcialmente_clara", "confusa", "nao_avaliavel"] as const;
export type ClarezaValue = (typeof CLAREZA_VALUES)[number];

export const UTILIDADE_VALUES = ["util", "parcialmente_util", "nao_util", "nao_avaliavel"] as const;
export type UtilidadeValue = (typeof UTILIDADE_VALUES)[number];

// Limites propostos, em bytes UTF-8 — nenhum ratificado como política de
// produto além do que a autorização local cobre.
export const JUSTIFICATIVA_MIN_BYTES = 1;
export const JUSTIFICATIVA_MAX_BYTES = 2_000;
export const COMENTARIO_MIN_BYTES = 1;
export const COMENTARIO_MAX_BYTES = 4_000;
export const OPERATION_KEY_MIN_BYTES = 1;
export const OPERATION_KEY_MAX_BYTES = 128;

// Mesma definição de surrogate isolado usada em radarMaterialContract.ts/
// radarAnalysisRequestContract.ts — reimplementada aqui deliberadamente
// (unidade independente, não importa de outro contrato do Radar).
const UNPAIRED_SURROGATE_RE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/;

function hasControlChar(value: string): boolean {
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function byteLengthUtf8(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

/** Preserva o valor exatamente (sem trim/normalização); rejeita NUL,
 * surrogate isolado e whitespace-only; mede em bytes UTF-8. */
function requireBoundedUtf8String(
  value: unknown,
  opts: { field: string; minBytes: number; maxBytes: number }
): string {
  if (value === null) throw new RadarRecommendationEvaluationError("field_null_not_allowed", { field: opts.field });
  if (typeof value !== "string") throw new RadarRecommendationEvaluationError("field_wrong_type", { field: opts.field });
  if (UNPAIRED_SURROGATE_RE.test(value)) {
    throw new RadarRecommendationEvaluationError("field_unpaired_surrogate", { field: opts.field });
  }
  if (hasControlChar(value)) {
    throw new RadarRecommendationEvaluationError("field_control_character_not_allowed", { field: opts.field });
  }
  if (value.trim().length === 0) {
    throw new RadarRecommendationEvaluationError("field_empty_or_whitespace", { field: opts.field });
  }
  const len = byteLengthUtf8(value);
  if (len < opts.minBytes) {
    throw new RadarRecommendationEvaluationError("field_below_minimum_length", { field: opts.field, bytes: len, min: opts.minBytes });
  }
  if (len > opts.maxBytes) {
    throw new RadarRecommendationEvaluationError("field_above_maximum_length", { field: opts.field, bytes: len, max: opts.maxBytes });
  }
  return value;
}

function requireNonEmptyId(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new RadarRecommendationEvaluationError("field_invalid_id", { field });
  }
  return value;
}

/** operationKey — obrigatório, 1-128 bytes UTF-8, mesma convenção de
 * RadarMaterial/RadarAnalysisRequest. */
export function validateOperationKey(value: unknown): string {
  return requireBoundedUtf8String(value, { field: "operationKey", minBytes: OPERATION_KEY_MIN_BYTES, maxBytes: OPERATION_KEY_MAX_BYTES });
}

export function validateRecommendationId(value: unknown): string {
  return requireNonEmptyId(value, "recommendationId");
}

/** supersedesEvaluationId — opcional; ausência e null equivalentes
 * (retornam null). */
export function validateSupersedesEvaluationId(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return requireNonEmptyId(value, "supersedesEvaluationId");
}

export function validateFundamentacao(value: unknown): FundamentacaoValue {
  if (typeof value !== "string" || !FUNDAMENTACAO_VALUES.includes(value as FundamentacaoValue)) {
    throw new RadarRecommendationEvaluationError("field_invalid_enum", { field: "fundamentacao", received: value });
  }
  return value as FundamentacaoValue;
}

export function validateClareza(value: unknown): ClarezaValue {
  if (typeof value !== "string" || !CLAREZA_VALUES.includes(value as ClarezaValue)) {
    throw new RadarRecommendationEvaluationError("field_invalid_enum", { field: "clareza", received: value });
  }
  return value as ClarezaValue;
}

export function validateUtilidade(value: unknown): UtilidadeValue {
  if (typeof value !== "string" || !UTILIDADE_VALUES.includes(value as UtilidadeValue)) {
    throw new RadarRecommendationEvaluationError("field_invalid_enum", { field: "utilidade", received: value });
  }
  return value as UtilidadeValue;
}

/** justificativa/comentario — opcionais; ausência e null equivalentes
 * (retornam null); quando presentes, bounded UTF-8, mesmas rejeições de
 * requireBoundedUtf8String. Nenhum trim/normalização aplicado ao conteúdo
 * aceito — preservado byte a byte, mesma regra de RadarMaterial.conteudo. */
export function validateJustificativa(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return requireBoundedUtf8String(value, { field: "justificativa", minBytes: JUSTIFICATIVA_MIN_BYTES, maxBytes: JUSTIFICATIVA_MAX_BYTES });
}

export function validateComentario(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return requireBoundedUtf8String(value, { field: "comentario", minBytes: COMENTARIO_MIN_BYTES, maxBytes: COMENTARIO_MAX_BYTES });
}

/** Totalmente positivo = os três eixos no valor mais favorável — único caso
 * em que `justificativa` é opcional (Atualização "Fechamento documental
 * proposto", seção C). */
export function isFullyPositiveEvaluation(fundamentacao: FundamentacaoValue, clareza: ClarezaValue, utilidade: UtilidadeValue): boolean {
  return fundamentacao === "bem_fundamentada" && clareza === "clara" && utilidade === "util";
}

// --- Rubrica versionada (criteriaVersion) -----------------------------
//
// Mapa de código ADITIVO — mesma técnica de RADAR_RECOMMENDATION_CONTRACT_VERSION
// (constante literal), estendida para um MAPA de versões históricas porque
// aqui é preciso continuar interpretando versões ANTIGAS, não só validar a
// atual. REGRA DE DISCIPLINA (não imposta pelo compilador, exigida por
// convenção desta unidade): uma entrada publicada NUNCA é editada depois —
// mudar o SIGNIFICADO de qualquer valor exige criar uma chave NOVA
// (".v2", etc.); a antiga permanece congelada para sempre.
export interface RadarRecommendationEvaluationRubric {
  dimensoes: {
    fundamentacao: Record<FundamentacaoValue, string>;
    clareza: Record<ClarezaValue, string>;
    utilidade: Record<UtilidadeValue, string>;
  };
  justificativaObrigatoriaSeNaoTotalmentePositivo: true;
}

export const RADAR_RECOMMENDATION_EVALUATION_RUBRICS: Record<string, RadarRecommendationEvaluationRubric> = {
  "radar-recommendation-evaluation-criteria.v1": {
    dimensoes: {
      fundamentacao: {
        bem_fundamentada: "Afirmações centrais sustentadas por referências verificáveis e natureza (fato/inferência/hipótese) corretamente distinguida, no julgamento do avaliador.",
        parcialmente_fundamentada: "Parte das afirmações carece de sustentação clara ou a natureza parece mal classificada, mas a conclusão central ainda tem apoio.",
        nao_fundamentada: "Afirmação apresentada como fato não é sustentada pelo material, no julgamento do avaliador.",
        nao_avaliavel: "O avaliador não conseguiu julgar este eixo (ex.: caso ambíguo demais).",
      },
      clareza: {
        clara: "Compreendida sem precisar reler o material.",
        parcialmente_clara: "Precisou reler trechos ou o resumo confundiu antes de ficar compreensível.",
        confusa: "Não deu para entender o que a recomendação dizia sem esforço extra significativo.",
        nao_avaliavel: "O avaliador não conseguiu julgar este eixo.",
      },
      utilidade: {
        util: "Ajudou a decidir entre as quatro ações (agir/acompanhar/buscar informação/não agir) com confiança razoável.",
        parcialmente_util: "Ajudou em parte, mas exigiu julgamento ou informação externa.",
        nao_util: "Não ajudou a decidir.",
        nao_avaliavel: "O avaliador não conseguiu julgar este eixo.",
      },
    },
    justificativaObrigatoriaSeNaoTotalmentePositivo: true,
  },
};

export const CURRENT_CRITERIA_VERSION = "radar-recommendation-evaluation-criteria.v1" as const;

/** Busca a definição da rubrica pela chave EXATA gravada na avaliação —
 * nunca a "mais recente". Versão ausente do mapa (não deveria ocorrer, já
 * que entradas nunca são removidas, mas pode acontecer por corrupção de
 * dado ou leitura por um worktree mais antigo) lança erro EXPLÍCITO, nunca
 * cai silenciosamente para a rubrica mais recente conhecida. */
/** `rubrics` — mesmo padrão de `db: PrismaClient = prismaGlobal` usado em
 * todo o pacote: produção nunca passa o segundo argumento (usa sempre o
 * mapa real exportado); testes podem injetar um mapa próprio para provar
 * que uma versão "vigente" nova não afeta a interpretação de uma versão
 * antiga já persistida, sem precisar adicionar uma entrada fictícia ao
 * mapa real de produção. */
export function getRubricForCriteriaVersion(
  version: string,
  rubrics: Record<string, RadarRecommendationEvaluationRubric> = RADAR_RECOMMENDATION_EVALUATION_RUBRICS
): RadarRecommendationEvaluationRubric {
  const rubric = rubrics[version];
  if (!rubric) {
    throw new RadarRecommendationEvaluationError("criteria_version_unknown", { version });
  }
  return rubric;
}

export interface EvaluationJudgmentInput {
  fundamentacao: unknown;
  clareza: unknown;
  utilidade: unknown;
  justificativa: unknown;
  comentario: unknown;
}

export interface EvaluationJudgment {
  fundamentacao: FundamentacaoValue;
  clareza: ClarezaValue;
  utilidade: UtilidadeValue;
  justificativa: string | null;
  comentario: string | null;
}

/**
 * Valida o julgamento (três eixos + justificativa/comentário) segundo a
 * RUBRICA informada pelo chamador — nunca a rubrica "atual" do servidor.
 * Em criação nova, o chamador (serviço) passa a rubrica CORRENTE
 * (`CURRENT_CRITERIA_VERSION`); em reenvio/correção, passa a rubrica
 * CONGELADA no registro existente — nunca recalculada. A regra de
 * obrigatoriedade de `justificativa` pertence à própria rubrica.
 */
export function validateEvaluationJudgment(
  input: EvaluationJudgmentInput,
  rubric: RadarRecommendationEvaluationRubric
): EvaluationJudgment {
  const fundamentacao = validateFundamentacao(input.fundamentacao);
  const clareza = validateClareza(input.clareza);
  const utilidade = validateUtilidade(input.utilidade);
  const justificativa = validateJustificativa(input.justificativa);
  const comentario = validateComentario(input.comentario);

  const fullyPositive = isFullyPositiveEvaluation(fundamentacao, clareza, utilidade);
  if (rubric.justificativaObrigatoriaSeNaoTotalmentePositivo && !fullyPositive && justificativa === null) {
    throw new RadarRecommendationEvaluationError("justificativa_required_when_not_fully_positive", {
      fundamentacao, clareza, utilidade,
    });
  }

  return { fundamentacao, clareza, utilidade, justificativa, comentario };
}

export interface RadarRecommendationEvaluationRecord {
  id: string;
  tenantId: string;
  workspaceId: string;
  contractVersion: string;
  recommendationId: string;
  evaluatorUserId: string;
  criteriaVersion: string;
  fundamentacao: FundamentacaoValue;
  clareza: ClarezaValue;
  utilidade: UtilidadeValue;
  justificativa: string | null;
  comentario: string | null;
  supersedesEvaluationId: string | null;
  operationKey: string;
  createdAt: Date;
}

/** Identidade completa da SOLICITAÇÃO (campos fornecidos/derivados pelo
 * avaliador) comparada num reenvio sob o mesmo operationKey —
 * DELIBERADAMENTE sem `criteriaVersion`: essa versão é fixada pelo
 * SERVIDOR na criação e nunca recalculada num reenvio (correção obrigatória
 * desta unidade) — uma atualização da rubrica vigente entre duas tentativas
 * nunca, sozinha, provoca conflito. */
export interface EvaluationRequestIdentity {
  recommendationId: string;
  evaluatorUserId: string;
  fundamentacao: FundamentacaoValue;
  clareza: ClarezaValue;
  utilidade: UtilidadeValue;
  justificativa: string | null;
  comentario: string | null;
  supersedesEvaluationId: string | null;
}

export function evaluationRequestIdentityMatches(a: EvaluationRequestIdentity, b: EvaluationRequestIdentity): boolean {
  return (
    a.recommendationId === b.recommendationId &&
    a.evaluatorUserId === b.evaluatorUserId &&
    a.fundamentacao === b.fundamentacao &&
    a.clareza === b.clareza &&
    a.utilidade === b.utilidade &&
    a.justificativa === b.justificativa &&
    a.comentario === b.comentario &&
    a.supersedesEvaluationId === b.supersedesEvaluationId
  );
}
