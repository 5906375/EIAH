// Radar Social — contrato puro de RadarAnalysisRequest (tipos, erros,
// limites e validadores síncronos, sem I/O). Ver
// docs/architecture/radar-social-construction-plan-v1.md, Atualizações
// 1.11, 1.14, 1.16 e 1.18.
//
// Nenhuma operação transacional aqui (vive em radarAnalysisRequestService.ts).

export class RadarAnalysisRequestError extends Error {
  constructor(readonly reasonCode: string, readonly context: Record<string, unknown> = {}) {
    super(`radar_analysis_request_invalid:${reasonCode}`);
    this.name = "RadarAnalysisRequestError";
  }
}

export class RadarAnalysisRequestConflictError extends Error {
  constructor(readonly reasonCode: string, readonly context: Record<string, unknown> = {}) {
    super(`radar_analysis_request_conflict:${reasonCode}`);
    this.name = "RadarAnalysisRequestConflictError";
  }
}

export const RADAR_ANALYSIS_REQUEST_CONTRACT_VERSION = "radar-analysis-request.v1" as const;

// Limites propostos (Atualização 1.16/1.17), em bytes UTF-8 — nenhum
// ratificado como política de produto.
export const OBJECTIVE_MIN_BYTES = 1;
export const OBJECTIVE_MAX_BYTES = 2_000;
export const ADDITIONAL_CONTEXT_MIN_BYTES = 1;
export const ADDITIONAL_CONTEXT_MAX_BYTES = 8_000;
export const OPERATION_KEY_MIN_BYTES = 1;
export const OPERATION_KEY_MAX_BYTES = 128;

// Mesma definição de surrogate isolado usada em radarMaterialContract.ts —
// reimplementada aqui deliberadamente (unidade independente, não importa de
// outro contrato do Radar).
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
  if (value === null) throw new RadarAnalysisRequestError("field_null_not_allowed", { field: opts.field });
  if (typeof value !== "string") throw new RadarAnalysisRequestError("field_wrong_type", { field: opts.field });
  if (UNPAIRED_SURROGATE_RE.test(value)) {
    throw new RadarAnalysisRequestError("field_unpaired_surrogate", { field: opts.field });
  }
  if (hasControlChar(value)) {
    throw new RadarAnalysisRequestError("field_control_character_not_allowed", { field: opts.field });
  }
  if (value.trim().length === 0) {
    throw new RadarAnalysisRequestError("field_empty_or_whitespace", { field: opts.field });
  }
  const len = byteLengthUtf8(value);
  if (len < opts.minBytes) {
    throw new RadarAnalysisRequestError("field_below_minimum_length", { field: opts.field, bytes: len, min: opts.minBytes });
  }
  if (len > opts.maxBytes) {
    throw new RadarAnalysisRequestError("field_above_maximum_length", { field: opts.field, bytes: len, max: opts.maxBytes });
  }
  return value;
}

/** objective — obrigatório, 1–2.000 bytes UTF-8. */
export function validateObjective(value: unknown): string {
  return requireBoundedUtf8String(value, { field: "objective", minBytes: OBJECTIVE_MIN_BYTES, maxBytes: OBJECTIVE_MAX_BYTES });
}

/** additionalContext — opcional; ausência e null equivalentes (retornam
 * null); quando presente, 1–8.000 bytes UTF-8, mesmas rejeições. */
export function validateAdditionalContext(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return requireBoundedUtf8String(value, { field: "additionalContext", minBytes: ADDITIONAL_CONTEXT_MIN_BYTES, maxBytes: ADDITIONAL_CONTEXT_MAX_BYTES });
}

/** operationKey — obrigatório, 1–128 bytes UTF-8, mesma convenção de
 * RadarMaterial. */
export function validateRequestOperationKey(value: unknown): string {
  return requireBoundedUtf8String(value, { field: "operationKey", minBytes: OPERATION_KEY_MIN_BYTES, maxBytes: OPERATION_KEY_MAX_BYTES });
}

function requireNonEmptyId(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new RadarAnalysisRequestError("field_wrong_type", { field });
  }
  return value;
}

export interface CreateRadarAnalysisRequestInput {
  entityId: string;
  materialId: string;
  objective: string;
  additionalContext?: string | null;
  operationKey: string;
}

export interface ValidatedCreateRadarAnalysisRequestInput {
  entityId: string;
  materialId: string;
  objective: string;
  additionalContext: string | null;
  operationKey: string;
}

/** Validação estrutural pura — nenhuma checagem de autorização, existência
 * de entidade/material ou idempotência (isso vive no serviço, que precisa
 * de I/O). `entityId`/`materialId` só têm forma verificada aqui. */
export function validateCreateRadarAnalysisRequestInput(
  input: CreateRadarAnalysisRequestInput
): ValidatedCreateRadarAnalysisRequestInput {
  return {
    entityId: requireNonEmptyId(input.entityId, "entityId"),
    materialId: requireNonEmptyId(input.materialId, "materialId"),
    objective: validateObjective(input.objective),
    additionalContext: validateAdditionalContext(input.additionalContext),
    operationKey: validateRequestOperationKey(input.operationKey),
  };
}

/**
 * Identidade completa da solicitação, comparada sob a mesma operationKey
 * (Atualização 1.11/1.14): {entityId, materialId, objective,
 * additionalContext, requestedByUserId}.
 */
export interface RadarAnalysisRequestIdentity {
  entityId: string;
  materialId: string;
  objective: string;
  additionalContext: string | null;
  requestedByUserId: string;
}

/** Recuperação idempotente quando idêntica; qualquer campo divergente é
 * conflito — nunca uma segunda gravação (mesma disciplina de RadarMaterial). */
export function analysisRequestIdentityMatches(
  a: RadarAnalysisRequestIdentity,
  b: RadarAnalysisRequestIdentity
): boolean {
  return (
    a.entityId === b.entityId &&
    a.materialId === b.materialId &&
    a.objective === b.objective &&
    (a.additionalContext ?? null) === (b.additionalContext ?? null) &&
    a.requestedByUserId === b.requestedByUserId
  );
}

export interface RadarAnalysisRequestRecord {
  id: string;
  tenantId: string;
  workspaceId: string;
  entityId: string;
  materialId: string;
  objective: string;
  additionalContext: string | null;
  requestedByUserId: string;
  operationKey: string;
  createdAt: Date;
}
