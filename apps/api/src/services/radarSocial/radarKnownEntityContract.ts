// Radar Social — contrato puro de RadarKnownEntity (tipos, erros, limites e
// validadores síncronos, sem I/O). Ver
// docs/architecture/radar-social-construction-plan-v1.md, Atualização 1.9,
// "Políticas ratificadas" / "Limites ratificados (bytes UTF-8)".
//
// Nenhuma operação transacional aqui (vive em radarKnownEntityService.ts) e
// nenhuma implementação real de RadarEntityAccessResolver (interface em
// radarEntityAccessResolver.ts).

export class RadarKnownEntityError extends Error {
  constructor(readonly reasonCode: string, readonly context: Record<string, unknown> = {}) {
    super(`radar_known_entity_invalid:${reasonCode}`);
    this.name = "RadarKnownEntityError";
  }
}

export const RADAR_KNOWN_ENTITY_STATUSES = ["active", "inactive"] as const;
export type RadarKnownEntityStatus = (typeof RADAR_KNOWN_ENTITY_STATUSES)[number];

// Limites ratificados, em bytes UTF-8 (não code points, não unidades UTF-16).
export const DISPLAY_NAME_MIN_BYTES = 1;
export const DISPLAY_NAME_MAX_BYTES = 200;
export const EXTERNAL_REF_MIN_BYTES = 1;
export const EXTERNAL_REF_MAX_BYTES = 64;

// Surrogate UTF-16 desemparelhado: mesma definição usada em
// radarSignalResultValidator.ts (D5) — reimplementada aqui deliberadamente
// (contrato do Radar não importa de SignalForward, unidades independentes).
const UNPAIRED_SURROGATE_RE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/;

// NUL (0x00) explícito, mais qualquer outro caractere de controle C0/DEL —
// nenhum campo desta unidade admite quebra de linha (displayName/externalRef
// são valores de identificação curtos, não texto livre).
function hasControlCharOrNul(value: string): boolean {
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function byteLengthUtf8(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

/**
 * Valida uma string persistível genérica desta unidade: rejeita tipo errado,
 * NUL/controle, surrogate isolado e whitespace-only ANTES de medir
 * comprimento — a ordem importa para produzir sempre o mesmo reasonCode para
 * a mesma violação, independente do comprimento do valor. Preserva o valor
 * exatamente (sem trim) quando válido.
 */
function requireBoundedUtf8String(
  value: unknown,
  opts: { field: string; minBytes: number; maxBytes: number }
): string {
  if (value === null) throw new RadarKnownEntityError("field_null_not_allowed", { field: opts.field });
  if (typeof value !== "string") throw new RadarKnownEntityError("field_wrong_type", { field: opts.field });
  if (UNPAIRED_SURROGATE_RE.test(value)) {
    throw new RadarKnownEntityError("field_unpaired_surrogate", { field: opts.field });
  }
  if (hasControlCharOrNul(value)) {
    throw new RadarKnownEntityError("field_control_character_not_allowed", { field: opts.field });
  }
  if (value.trim().length === 0) {
    throw new RadarKnownEntityError("field_empty_or_whitespace", { field: opts.field });
  }
  const len = byteLengthUtf8(value);
  if (len < opts.minBytes) {
    throw new RadarKnownEntityError("field_below_minimum_length", { field: opts.field, bytes: len, min: opts.minBytes });
  }
  if (len > opts.maxBytes) {
    throw new RadarKnownEntityError("field_above_maximum_length", { field: opts.field, bytes: len, max: opts.maxBytes });
  }
  return value;
}

/** displayName — obrigatório, 1–200 bytes UTF-8, preservado exatamente. */
export function validateDisplayName(value: unknown): string {
  return requireBoundedUtf8String(value, { field: "displayName", minBytes: DISPLAY_NAME_MIN_BYTES, maxBytes: DISPLAY_NAME_MAX_BYTES });
}

/**
 * externalRef — opcional. Ausência (`undefined`) e `null` são equivalentes
 * (sem referência) e retornam `null`. Quando fornecido, aplica-se a MESMA
 * regra de "obrigatório-quando-presente" dos demais campos: rejeita vazio,
 * whitespace-only, NUL e surrogate isolado (extensão ratificada na
 * Atualização 1.9). Opaco: nenhuma validação de esquema (CNPJ ou outro).
 */
export function validateExternalRef(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return requireBoundedUtf8String(value, { field: "externalRef", minBytes: EXTERNAL_REF_MIN_BYTES, maxBytes: EXTERNAL_REF_MAX_BYTES });
}

export interface CreateRadarKnownEntityInput {
  displayName: string;
  externalRef?: string | null;
}

export interface ValidatedCreateRadarKnownEntityInput {
  displayName: string;
  externalRef: string | null;
}

/** Validação estrutural pura da criação — nenhuma checagem de autorização
 * ou de banco (isso vive em radarKnownEntityService.ts). */
export function validateCreateRadarKnownEntityInput(
  input: CreateRadarKnownEntityInput
): ValidatedCreateRadarKnownEntityInput {
  return {
    displayName: validateDisplayName(input.displayName),
    externalRef: validateExternalRef(input.externalRef),
  };
}

export interface UpdateRadarKnownEntityPatch {
  displayName?: string;
  externalRef?: string | null;
}

export interface ValidatedUpdateRadarKnownEntityPatch {
  displayName?: string;
  externalRef?: string | null;
}

/**
 * Validação estrutural pura da alteração. Campos OMITIDOS (`undefined` na
 * chave, não presente no objeto) não são tocados pelo serviço; campo
 * presente com `null` em externalRef limpa a referência (equivalente a
 * ausência). displayName não aceita `null` (é sempre obrigatório quando
 * enviado). Objeto de patch vazio é rejeitado — não existe "alteração que
 * não altera nada".
 */
export function validateUpdateRadarKnownEntityPatch(
  patch: UpdateRadarKnownEntityPatch
): ValidatedUpdateRadarKnownEntityPatch {
  const hasDisplayName = Object.prototype.hasOwnProperty.call(patch, "displayName");
  const hasExternalRef = Object.prototype.hasOwnProperty.call(patch, "externalRef");
  if (!hasDisplayName && !hasExternalRef) {
    throw new RadarKnownEntityError("patch_empty");
  }
  const result: ValidatedUpdateRadarKnownEntityPatch = {};
  if (hasDisplayName) {
    result.displayName = validateDisplayName(patch.displayName);
  }
  if (hasExternalRef) {
    result.externalRef = validateExternalRef(patch.externalRef);
  }
  return result;
}

export interface RadarKnownEntityRecord {
  id: string;
  tenantId: string;
  workspaceId: string;
  displayName: string;
  externalRef: string | null;
  status: RadarKnownEntityStatus;
  revision: number;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}
