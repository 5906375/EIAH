// Radar Social — contrato puro de RadarMaterial (tipos, erros, limites,
// validadores síncronos e comparação de identidade da solicitação, sem
// I/O). Ver docs/architecture/radar-social-construction-plan-v1.md,
// Atualização 1.9, seções "Limites ratificados", "Regras ratificadas",
// "Correção material — supersedesMaterialId na comparação idempotente" e
// "Precisões de implementação".
//
// Nenhuma operação transacional aqui (vive em radarMaterialService.ts).
import crypto from "node:crypto";

export class RadarMaterialError extends Error {
  constructor(readonly reasonCode: string, readonly context: Record<string, unknown> = {}) {
    super(`radar_material_invalid:${reasonCode}`);
    this.name = "RadarMaterialError";
  }
}

// Conflito de identidade da solicitação — mesma operationKey, tupla de
// identidade diferente (radarMaterialService.ts decide quando lançar isto,
// a partir da comparação pura exportada abaixo).
export class RadarMaterialConflictError extends Error {
  constructor(readonly reasonCode: string, readonly context: Record<string, unknown> = {}) {
    super(`radar_material_conflict:${reasonCode}`);
    this.name = "RadarMaterialConflictError";
  }
}

// Limites ratificados, em bytes UTF-8.
export const CONTEUDO_MIN_BYTES = 1;
export const CONTEUDO_MAX_BYTES = 16_384;
export const FONTE_DECLARADA_MIN_BYTES = 1;
export const FONTE_DECLARADA_MAX_BYTES = 500;
export const OPERATION_KEY_MIN_BYTES = 1;
export const OPERATION_KEY_MAX_BYTES = 128;

const UNPAIRED_SURROGATE_RE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/;

// Controle C0/DEL, excluindo '\n' (U+000A) quando o campo permite quebra de
// linha. '\r' NUNCA é a exceção concedida — só '\n', mesma regra de D5
// (radarSignalResultValidator.ts) — reimplementada aqui, unidade
// independente.
function hasDisallowedControlChar(value: string, allowNewline: boolean): boolean {
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    const isControl = code <= 0x1f || code === 0x7f;
    if (!isControl) continue;
    if (allowNewline && code === 0x0a) continue;
    return true;
  }
  return false;
}

function byteLengthUtf8(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

/**
 * Valida SEM alterar o valor: nenhum trim, nenhuma normalização Unicode,
 * nenhuma alteração de quebra de linha (regra ratificada — "preservação
 * exata do texto válido recebido"). O comprimento mínimo/máximo é medido em
 * bytes UTF-8 sobre o valor ORIGINAL (não sobre uma versão aparada) — um
 * valor só de espaços é rejeitado por inteiro pela checagem de
 * whitespace-only, nunca truncado.
 */
function requireExactUtf8String(
  value: unknown,
  opts: { field: string; minBytes: number; maxBytes: number; allowNewline: boolean }
): string {
  if (value === null) throw new RadarMaterialError("field_null_not_allowed", { field: opts.field });
  if (typeof value !== "string") throw new RadarMaterialError("field_wrong_type", { field: opts.field });
  if (UNPAIRED_SURROGATE_RE.test(value)) {
    throw new RadarMaterialError("field_unpaired_surrogate", { field: opts.field });
  }
  if (hasDisallowedControlChar(value, opts.allowNewline)) {
    throw new RadarMaterialError("field_control_character_not_allowed", { field: opts.field });
  }
  if (value.trim().length === 0) {
    throw new RadarMaterialError("field_empty_or_whitespace", { field: opts.field });
  }
  const len = byteLengthUtf8(value);
  if (len < opts.minBytes) {
    throw new RadarMaterialError("field_below_minimum_length", { field: opts.field, bytes: len, min: opts.minBytes });
  }
  if (len > opts.maxBytes) {
    throw new RadarMaterialError("field_above_maximum_length", { field: opts.field, bytes: len, max: opts.maxBytes });
  }
  return value;
}

/** conteudo — obrigatório, 1–16.384 bytes UTF-8, quebras de linha
 * preservadas exatamente, sem trim/normalização. */
export function validateConteudo(value: unknown): string {
  return requireExactUtf8String(value, {
    field: "conteudo", minBytes: CONTEUDO_MIN_BYTES, maxBytes: CONTEUDO_MAX_BYTES, allowNewline: true,
  });
}

/** fonteDeclarada — obrigatório, 1–500 bytes UTF-8. Campo de identificação
 * curto (não corpo de texto livre) — quebra de linha não é admitida. */
export function validateFonteDeclarada(value: unknown): string {
  return requireExactUtf8String(value, {
    field: "fonteDeclarada", minBytes: FONTE_DECLARADA_MIN_BYTES, maxBytes: FONTE_DECLARADA_MAX_BYTES, allowNewline: false,
  });
}

/** operationKey — token de deduplicação do chamador, 1–128 bytes UTF-8,
 * sem quebra de linha. */
export function validateOperationKey(value: unknown): string {
  return requireExactUtf8String(value, {
    field: "operationKey", minBytes: OPERATION_KEY_MIN_BYTES, maxBytes: OPERATION_KEY_MAX_BYTES, allowNewline: false,
  });
}

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * capturadoEm — DATE real (YYYY-MM-DD), granularidade de dia, sem horário
 * inventado. `undefined`/`null` são equivalentes (ausência) e retornam
 * `null`. String vazia é rejeitada (não é tratada como ausência). Valida
 * calendário real (não regex simples: rejeita 2026-02-30 etc.) e retorna um
 * `Date` em meia-noite UTC (compatível com a coluna `@db.Date` do Prisma,
 * que descarta qualquer componente de hora).
 */
export function validateCapturadoEm(value: unknown): Date | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new RadarMaterialError("field_wrong_type", { field: "capturadoEm" });
  if (value.length === 0) throw new RadarMaterialError("field_empty_or_whitespace", { field: "capturadoEm" });
  const match = DATE_ONLY_RE.exec(value);
  if (!match) throw new RadarMaterialError("field_invalid_date_format", { field: "capturadoEm" });
  const [, yearStr, monthStr, dayStr] = match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (month < 1 || month > 12) {
    throw new RadarMaterialError("field_invalid_calendar_date", { field: "capturadoEm" });
  }
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) {
    throw new RadarMaterialError("field_invalid_calendar_date", { field: "capturadoEm" });
  }
  return new Date(Date.UTC(year, month - 1, day));
}

/** Serializa um Date de data pura (meia-noite UTC, vindo da coluna
 * `@db.Date`) de volta para "YYYY-MM-DD" — usado só para comparação de
 * identidade e para devolver o valor ao chamador, nunca para persistência
 * (a persistência usa o `Date` diretamente). */
export function formatCapturadoEm(value: Date | null): string | null {
  if (value === null) return null;
  const y = value.getUTCFullYear().toString().padStart(4, "0");
  const m = (value.getUTCMonth() + 1).toString().padStart(2, "0");
  const d = value.getUTCDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** supersedesMaterialId — opcional. `undefined`/`null` equivalem a "não é
 * correção" (criação nova). Quando fornecido, só validação estrutural de
 * forma aqui; a existência/pertencimento do predecessor é responsabilidade
 * do serviço (precisa de I/O). */
export function validateSupersedesMaterialId(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.length === 0) {
    throw new RadarMaterialError("field_wrong_type", { field: "supersedesMaterialId" });
  }
  return value;
}

/**
 * SHA-256 hex sobre os bytes UTF-8 EXATOS de `conteudo` — calculado sempre
 * pelo servidor a partir do valor já validado, nunca aceito do corpo. Não
 * autentica a fonte; identifica só o conteúdo em si (diagnóstico/dedup),
 * nunca substitui a comparação completa da identidade da solicitação
 * abaixo.
 */
export function computeMaterialHash(conteudo: string): string {
  return crypto.createHash("sha256").update(conteudo, "utf8").digest("hex");
}

export interface ReceiveRadarMaterialInput {
  entityId: string;
  conteudo: string;
  fonteDeclarada: string;
  capturadoEm?: string | null;
  supersedesMaterialId?: string | null;
  operationKey: string;
}

export interface ValidatedReceiveRadarMaterialInput {
  entityId: string;
  conteudo: string;
  fonteDeclarada: string;
  capturadoEm: Date | null;
  supersedesMaterialId: string | null;
  operationKey: string;
}

/** Validação estrutural pura do recebimento/correção — nenhuma checagem de
 * autorização, existência de entidade/predecessor ou idempotência (isso
 * vive em radarMaterialService.ts, que precisa de I/O). `entityId` só tem
 * forma verificada aqui (string não vazia); existência real é do serviço. */
export function validateReceiveRadarMaterialInput(
  input: ReceiveRadarMaterialInput
): ValidatedReceiveRadarMaterialInput {
  if (typeof input.entityId !== "string" || input.entityId.length === 0) {
    throw new RadarMaterialError("field_wrong_type", { field: "entityId" });
  }
  return {
    entityId: input.entityId,
    conteudo: validateConteudo(input.conteudo),
    fonteDeclarada: validateFonteDeclarada(input.fonteDeclarada),
    capturadoEm: validateCapturadoEm(input.capturadoEm),
    supersedesMaterialId: validateSupersedesMaterialId(input.supersedesMaterialId),
    operationKey: validateOperationKey(input.operationKey),
  };
}

/**
 * Identidade completa da solicitação, comparada sob a mesma operationKey
 * (Atualização 1.9): {entityId, conteudo, fonteDeclarada, capturadoEm,
 * supersedesMaterialId, providedByUserId}. Campos gerados a cada tentativa
 * (recebidoEm) NUNCA entram aqui.
 */
export interface RadarMaterialRequestIdentity {
  entityId: string;
  conteudo: string;
  fonteDeclarada: string;
  capturadoEm: Date | null;
  supersedesMaterialId: string | null;
  providedByUserId: string;
}

/**
 * Compara a identidade completa de duas tentativas sob a mesma
 * operationKey. `true` = recuperação idempotente (mesma solicitação,
 * inclusive quando ambas têm `supersedesMaterialId: null` — ausência de
 * predecessor É um valor comparável, não um caso ignorado). `false` = as
 * tentativas divergem em pelo menos um campo e DEVEM ser tratadas como
 * conflito pelo chamador (nunca uma segunda gravação silenciosa).
 */
export function materialRequestIdentityMatches(
  a: RadarMaterialRequestIdentity,
  b: RadarMaterialRequestIdentity
): boolean {
  return (
    a.entityId === b.entityId &&
    a.conteudo === b.conteudo &&
    a.fonteDeclarada === b.fonteDeclarada &&
    formatCapturadoEm(a.capturadoEm) === formatCapturadoEm(b.capturadoEm) &&
    (a.supersedesMaterialId ?? null) === (b.supersedesMaterialId ?? null) &&
    a.providedByUserId === b.providedByUserId
  );
}

export interface RadarMaterialRecord {
  id: string;
  tenantId: string;
  workspaceId: string;
  entityId: string;
  conteudo: string;
  hashDoMaterial: string;
  fonteDeclarada: string;
  capturadoEm: Date | null;
  supersedesMaterialId: string | null;
  operationKey: string;
  providedByUserId: string;
  recebidoEm: Date;
}
