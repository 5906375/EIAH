// Validador estrutural completo de RadarSignalResultV1 (D5-B).
//
// Implementa exatamente o contrato ratificado na seção 9 de
// CONSULTATION_ORIGIN_AUTHZ_v2.md (Rodada 5, "Aprovação de contrato técnico").
// Puro, síncrono, sem I/O: não consulta banco, não resolve subjectId, não
// verifica classificação semântica do produtor, não busca URLs, não chama
// fila/LLM. Não normaliza, não ordena, não modifica o payload — em caso de
// sucesso, devolve a MESMA referência recebida, com os mesmos valores e a
// mesma ordem de arrays.
//
// Ordem de validação determinística (seção 9.5): objeto raiz -> contractVersion
// -> campos desconhecidos -> cada campo do nível raiz, na ordem fixa da tabela
// 9.1 (presença -> null -> tipo -> enum/comprimento, recursão inclusa) ->
// regras semânticas/referenciais -> teto agregado. A primeira violação
// encontrada nesta ordem é a que é lançada (fail-fast), nunca uma lista.
import { SignalForwardOriginError } from "./originContract";

export const RADAR_SIGNAL_RESULT_CONTRACT_VERSION = "radar-signal-result.v1";

export const RADAR_SIGNAL_TYPES = [
  "lead_intent_signal",
  "account_lifecycle_signal",
  "competitive_context_signal",
  "content_engagement_signal",
] as const;
export type RadarSignalType = (typeof RADAR_SIGNAL_TYPES)[number];

const CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;
type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

const SUBJECT_TYPES = ["internal_reference"] as const;

const AGGREGATE_SIZE_LIMIT_BYTES = 16384;

const ROOT_FIELDS = [
  "contractVersion",
  "signalType",
  "subject",
  "title",
  "summary",
  "detectedAt",
  "confidenceLevel",
  "evidence",
  "opportunity",
  "externalContent",
] as const;
const SUBJECT_FIELDS = ["subjectType", "subjectId", "subjectDisplayName"] as const;
const EVIDENCE_ITEM_FIELDS = ["description", "externalContentRef"] as const;
const OPPORTUNITY_FIELDS = ["summary", "suggestedAction"] as const;
const EXTERNAL_CONTENT_FIELDS = ["items"] as const;
const EXTERNAL_CONTENT_ITEM_FIELDS = ["id", "sourceUrl", "rawExcerpt", "capturedAt"] as const;

export interface RadarSignalResultV1 {
  contractVersion: typeof RADAR_SIGNAL_RESULT_CONTRACT_VERSION;
  signalType: RadarSignalType;
  subject: {
    subjectType: "internal_reference";
    subjectId: string;
    subjectDisplayName?: string;
  };
  title: string;
  summary: string;
  detectedAt: string;
  confidenceLevel: ConfidenceLevel;
  evidence?: Array<{ description: string; externalContentRef?: string }>;
  opportunity?: { summary: string; suggestedAction?: string };
  externalContent?: {
    items: Array<{ id: string; sourceUrl?: string; rawExcerpt: string; capturedAt: string }>;
  };
}

function fail(reasonCode: string, context: Record<string, unknown> = {}): never {
  throw new SignalForwardOriginError(reasonCode, context);
}

function failFieldMissing(field: string, reason?: string): never {
  fail("radar_signal_field_missing", reason ? { field, reason } : { field });
}

function failFieldInvalid(field: string, reason: string, extra: Record<string, unknown> = {}): never {
  fail("radar_signal_field_invalid", { field, reason, ...extra });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertKnownKeys(value: Record<string, unknown>, allowed: readonly string[], pathPrefix: string) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      fail("radar_signal_unknown_field", { field: pathPrefix ? `${pathPrefix}.${key}` : key });
    }
  }
}

function codePointLength(value: string): number {
  return Array.from(value).length;
}

// Surrogate UTF-16 desemparelhado: um high surrogate não seguido de um low
// surrogate, ou um low surrogate não precedido de um high surrogate.
const UNPAIRED_SURROGATE_RE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/;

function assertNoUnpairedSurrogate(value: string, field: string) {
  if (UNPAIRED_SURROGATE_RE.test(value)) {
    failFieldInvalid(field, "unpaired_surrogate");
  }
}

// Caracteres de controle proibidos, exceto '\n' (U+000A) quando explicitamente
// permitido pelo campo (summary/rawExcerpt). '\r' NÃO é a exceção concedida —
// só '\n' é.
function assertNoControlChars(value: string, field: string, allowNewline: boolean) {
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    const isControl = code <= 0x1f || code === 0x7f;
    if (!isControl) continue;
    if (allowNewline && code === 0x0a) continue; // única exceção concedida, e só quando o campo permite
    failFieldInvalid(field, "control_character_not_allowed");
  }
}

function requireString(
  value: unknown,
  opts: { field: string; min: number; max: number; allowNewline?: boolean }
): string {
  if (value === null) failFieldInvalid(opts.field, "null_not_allowed");
  if (typeof value !== "string") failFieldInvalid(opts.field, "wrong_type");
  assertNoUnpairedSurrogate(value, opts.field);
  assertNoControlChars(value, opts.field, opts.allowNewline ?? false);
  if (value.trim().length === 0) failFieldInvalid(opts.field, "empty_or_whitespace");
  const len = codePointLength(value); // medido sobre o valor ORIGINAL, sem trim
  if (len < opts.min) failFieldInvalid(opts.field, "below_minimum_length", { length: len, min: opts.min });
  if (len > opts.max) failFieldInvalid(opts.field, "above_maximum_length", { length: len, max: opts.max });
  return value;
}

function requireOptionalString(
  value: unknown,
  opts: { field: string; min: number; max: number; allowNewline?: boolean }
): string | undefined {
  if (value === undefined) return undefined;
  return requireString(value, opts);
}

interface ParsedInstant {
  epochMs: number;
}

// RFC 3339 estrito: fuso obrigatório (Z ou +/-HH:MM), segundos obrigatórios,
// fração opcional até 3 dígitos, validade de calendário real (não regex).
const RFC3339_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/;

function parseRfc3339(raw: string): ParsedInstant | null {
  const match = RFC3339_RE.exec(raw);
  if (!match) return null;
  const [, yearStr, monthStr, dayStr, hourStr, minuteStr, secondStr, fracStr, offsetStr] = match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  const second = Number(secondStr);

  if (month < 1 || month > 12) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;

  // Último dia do mês `month` (1-based) via "dia 0 do próximo mês" em UTC.
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) return null;

  let offsetMinutes = 0;
  if (offsetStr !== "Z") {
    const offsetMatch = /^([+-])(\d{2}):(\d{2})$/.exec(offsetStr);
    if (!offsetMatch) return null;
    const sign = offsetMatch[1] === "-" ? -1 : 1;
    const offHour = Number(offsetMatch[2]);
    const offMinute = Number(offsetMatch[3]);
    if (offHour > 23 || offMinute > 59) return null;
    offsetMinutes = sign * (offHour * 60 + offMinute);
  }

  const fracMs = fracStr ? Number((fracStr + "000").slice(0, 3)) : 0;
  const epochMs = Date.UTC(year, month - 1, day, hour, minute, second, fracMs) - offsetMinutes * 60000;
  return { epochMs };
}

const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

function requireDetectedAt(value: unknown, now: Date): ParsedInstant {
  if (value === null) failFieldInvalid("detectedAt", "null_not_allowed");
  if (typeof value !== "string") failFieldInvalid("detectedAt", "wrong_type");
  const parsed = parseRfc3339(value);
  if (!parsed) failFieldInvalid("detectedAt", "invalid_rfc3339_or_calendar");
  if (parsed.epochMs > now.getTime() + FUTURE_TOLERANCE_MS) {
    failFieldInvalid("detectedAt", "too_far_in_future");
  }
  return parsed;
}

function requireCapturedAt(value: unknown, field: string): ParsedInstant {
  if (value === null) failFieldInvalid(field, "null_not_allowed");
  if (typeof value !== "string") failFieldInvalid(field, "wrong_type");
  const parsed = parseRfc3339(value);
  if (!parsed) failFieldInvalid(field, "invalid_rfc3339_or_calendar");
  return parsed;
}

// Sintática apenas (RFC 3986 + regras do contrato) — nenhum fetch é feito.
function requireSourceUrl(value: unknown, field: string): string {
  const raw = requireString(value, { field, min: 1, max: 500, allowNewline: false });
  if (/ /.test(raw)) failFieldInvalid(field, "unencoded_space");
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    failFieldInvalid(field, "malformed_or_relative_url");
  }
  if (parsed.protocol !== "https:") failFieldInvalid(field, "protocol_not_https");
  if (parsed.username !== "" || parsed.password !== "") failFieldInvalid(field, "embedded_credentials");
  return raw;
}

/**
 * Valida um `Run.response` já confirmado como objeto estruturado
 * (`readAndValidateOrigin` já rejeitou null/array/ausente antes de chamar
 * esta função) contra o contrato `RadarSignalResultV1` completo.
 *
 * `now` é injetável para permitir relógio controlado em testes; em produção,
 * o padrão é o relógio real no momento da chamada.
 *
 * Lança `SignalForwardOriginError` com um dos reasonCodes de
 * CONSULTATION_ORIGIN_AUTHZ_v2.md seção 9.14 na primeira violação encontrada,
 * na ordem determinística descrita acima. Em sucesso, devolve a MESMA
 * referência recebida (sem cópia, sem normalização, sem reordenação).
 */
export function validateRadarSignalResult(
  value: unknown,
  opts: { now?: Date } = {}
): RadarSignalResultV1 {
  const now = opts.now ?? new Date();

  // Passo 0 — objeto JSON simples, não null, não array.
  if (!isPlainObject(value)) {
    fail("radar_signal_payload_not_object");
  }

  // Passo 1 — contractVersion exato.
  const contractVersion = value.contractVersion;
  if (contractVersion === undefined) failFieldMissing("contractVersion");
  if (contractVersion === null) failFieldInvalid("contractVersion", "null_not_allowed");
  if (typeof contractVersion !== "string") failFieldInvalid("contractVersion", "wrong_type");
  if (contractVersion !== RADAR_SIGNAL_RESULT_CONTRACT_VERSION) {
    fail("radar_signal_contract_version_invalid", { received: contractVersion });
  }

  // Passo 2 — campos desconhecidos no nível raiz.
  assertKnownKeys(value, ROOT_FIELDS, "");

  // Passo 3 — cada campo do nível raiz, na ordem fixa da tabela 9.1.

  // signalType
  const signalTypeRaw = value.signalType;
  if (signalTypeRaw === undefined) failFieldMissing("signalType");
  if (signalTypeRaw === null) failFieldInvalid("signalType", "null_not_allowed");
  if (typeof signalTypeRaw !== "string") failFieldInvalid("signalType", "wrong_type");
  if (!(RADAR_SIGNAL_TYPES as readonly string[]).includes(signalTypeRaw)) {
    fail("radar_signal_type_unknown", { received: signalTypeRaw });
  }

  // subject
  const subjectRaw = value.subject;
  if (subjectRaw === undefined) failFieldMissing("subject");
  if (subjectRaw === null) failFieldInvalid("subject", "null_not_allowed");
  if (!isPlainObject(subjectRaw)) failFieldInvalid("subject", "wrong_type");
  assertKnownKeys(subjectRaw, SUBJECT_FIELDS, "subject");

  const subjectTypeRaw = subjectRaw.subjectType;
  if (subjectTypeRaw === undefined) failFieldMissing("subject.subjectType");
  if (subjectTypeRaw === null) failFieldInvalid("subject.subjectType", "null_not_allowed");
  if (typeof subjectTypeRaw !== "string") failFieldInvalid("subject.subjectType", "wrong_type");
  if (!(SUBJECT_TYPES as readonly string[]).includes(subjectTypeRaw)) {
    failFieldInvalid("subject.subjectType", "unknown_enum_value", { received: subjectTypeRaw });
  }

  const subjectIdRaw = subjectRaw.subjectId;
  if (subjectIdRaw === undefined) failFieldMissing("subject.subjectId");
  requireString(subjectIdRaw, { field: "subject.subjectId", min: 1, max: 64 });

  requireOptionalString(subjectRaw.subjectDisplayName, {
    field: "subject.subjectDisplayName",
    min: 1,
    max: 120,
  });

  // title
  if (value.title === undefined) failFieldMissing("title");
  requireString(value.title, { field: "title", min: 1, max: 120 });

  // summary
  if (value.summary === undefined) failFieldMissing("summary");
  requireString(value.summary, { field: "summary", min: 20, max: 1000, allowNewline: true });

  // detectedAt
  if (value.detectedAt === undefined) failFieldMissing("detectedAt");
  const detectedAtParsed = requireDetectedAt(value.detectedAt, now);

  // confidenceLevel
  const confidenceLevelRaw = value.confidenceLevel;
  if (confidenceLevelRaw === undefined) failFieldMissing("confidenceLevel");
  if (confidenceLevelRaw === null) failFieldInvalid("confidenceLevel", "null_not_allowed");
  if (typeof confidenceLevelRaw !== "string") failFieldInvalid("confidenceLevel", "wrong_type");
  if (!(CONFIDENCE_LEVELS as readonly string[]).includes(confidenceLevelRaw)) {
    failFieldInvalid("confidenceLevel", "unknown_enum_value", { received: confidenceLevelRaw });
  }
  const confidenceLevel = confidenceLevelRaw as ConfidenceLevel;

  // evidence (opcional)
  let evidence: RadarSignalResultV1["evidence"];
  if (value.evidence !== undefined) {
    const evidenceRaw = value.evidence;
    if (evidenceRaw === null) failFieldInvalid("evidence", "null_not_allowed");
    if (!Array.isArray(evidenceRaw)) failFieldInvalid("evidence", "wrong_type");
    if (evidenceRaw.length === 0) failFieldInvalid("evidence", "empty_array_not_allowed");
    if (evidenceRaw.length > 5) failFieldInvalid("evidence", "above_maximum_items", { max: 5 });
    evidence = evidenceRaw.map((item, index) => {
      const path = `evidence[${index}]`;
      if (!isPlainObject(item)) failFieldInvalid(path, "wrong_type");
      assertKnownKeys(item, EVIDENCE_ITEM_FIELDS, path);
      if (item.description === undefined) failFieldMissing(`${path}.description`);
      const description = requireString(item.description, { field: `${path}.description`, min: 1, max: 300 });
      const externalContentRef = requireOptionalString(item.externalContentRef, {
        field: `${path}.externalContentRef`,
        min: 1,
        max: 64,
      });
      return { description, externalContentRef };
    });
  }

  // opportunity (opcional)
  let opportunity: RadarSignalResultV1["opportunity"];
  if (value.opportunity !== undefined) {
    const opportunityRaw = value.opportunity;
    if (opportunityRaw === null) failFieldInvalid("opportunity", "null_not_allowed");
    if (!isPlainObject(opportunityRaw)) failFieldInvalid("opportunity", "wrong_type");
    assertKnownKeys(opportunityRaw, OPPORTUNITY_FIELDS, "opportunity");
    if (opportunityRaw.summary === undefined) failFieldMissing("opportunity.summary");
    const oppSummary = requireString(opportunityRaw.summary, { field: "opportunity.summary", min: 1, max: 300 });
    const suggestedAction = requireOptionalString(opportunityRaw.suggestedAction, {
      field: "opportunity.suggestedAction",
      min: 1,
      max: 200,
    });
    opportunity = { summary: oppSummary, suggestedAction };
  }

  // externalContent (opcional)
  let externalContent: RadarSignalResultV1["externalContent"];
  // Alinhado por índice com externalContent.items — só o valor já parseado
  // (etapa estrutural) de cada capturedAt, para a comparação relacional 4d,
  // feita depois, nunca durante esta etapa.
  let externalContentCapturedAtEpochMs: number[] = [];
  if (value.externalContent !== undefined) {
    const externalContentRaw = value.externalContent;
    if (externalContentRaw === null) failFieldInvalid("externalContent", "null_not_allowed");
    if (!isPlainObject(externalContentRaw)) failFieldInvalid("externalContent", "wrong_type");
    assertKnownKeys(externalContentRaw, EXTERNAL_CONTENT_FIELDS, "externalContent");

    if (externalContentRaw.items === undefined) failFieldMissing("externalContent.items");
    const itemsRaw = externalContentRaw.items;
    if (itemsRaw === null) failFieldInvalid("externalContent.items", "null_not_allowed");
    if (!Array.isArray(itemsRaw)) failFieldInvalid("externalContent.items", "wrong_type");
    if (itemsRaw.length === 0) failFieldInvalid("externalContent.items", "empty_array_not_allowed");
    if (itemsRaw.length > 5) failFieldInvalid("externalContent.items", "above_maximum_items", { max: 5 });

    const capturedAtEpochMs: number[] = [];
    const items = itemsRaw.map((item, index) => {
      const path = `externalContent.items[${index}]`;
      if (!isPlainObject(item)) failFieldInvalid(path, "wrong_type");
      assertKnownKeys(item, EXTERNAL_CONTENT_ITEM_FIELDS, path);

      // `id` é validado estruturalmente aqui (presença/tipo/comprimento).
      // Unicidade ENTRE itens é uma regra referencial (9.5, passo 4c) —
      // verificada só depois que TODO o payload tiver passado por esta
      // etapa estrutural inteira, nunca durante este loop: um id duplicado
      // encontrado cedo não pode antecipar-se a um erro estrutural de um
      // item posterior ainda não percorrido.
      if (item.id === undefined) failFieldMissing(`${path}.id`);
      const id = requireString(item.id, { field: `${path}.id`, min: 1, max: 64 });

      const sourceUrl =
        item.sourceUrl === undefined ? undefined : requireSourceUrl(item.sourceUrl, `${path}.sourceUrl`);

      if (item.rawExcerpt === undefined) failFieldMissing(`${path}.rawExcerpt`);
      const rawExcerpt = requireString(item.rawExcerpt, {
        field: `${path}.rawExcerpt`,
        min: 1,
        max: 800,
        allowNewline: true,
      });

      // `capturedAt` é validado estruturalmente aqui (presença/tipo/formato
      // RFC 3339/calendário real). A comparação `capturedAt <= detectedAt`
      // é regra relacional (9.5, passo 4d) — pela mesma razão de `id` acima,
      // não é avaliada neste loop; só o valor já parseado é guardado.
      if (item.capturedAt === undefined) failFieldMissing(`${path}.capturedAt`);
      const capturedAtParsed = requireCapturedAt(item.capturedAt, `${path}.capturedAt`);
      capturedAtEpochMs.push(capturedAtParsed.epochMs);

      return { id, sourceUrl, rawExcerpt, capturedAt: item.capturedAt as string };
    });

    externalContent = { items };
    externalContentCapturedAtEpochMs = capturedAtEpochMs;
  }

  // Passo 4 — regras semânticas/referenciais. Só é alcançado depois que TODO
  // o payload já passou pela etapa estrutural (passo 3) inteira, sem erro —
  // nenhuma checagem abaixo pode ser antecipada por nenhum item ainda não
  // percorrido nessa etapa.

  // 4a. confidenceLevel "high" exige evidence.
  if (confidenceLevel === "high" && evidence === undefined) {
    failFieldMissing("evidence", "required_when_confidence_high");
  }

  // 4b. evidence[].externalContentRef deve existir em externalContent.items[].id.
  if (evidence) {
    const knownIds = new Set((externalContent?.items ?? []).map((item) => item.id));
    evidence.forEach((item, index) => {
      if (item.externalContentRef !== undefined && !knownIds.has(item.externalContentRef)) {
        fail("radar_evidence_reference_not_found", { evidenceIndex: index, ref: item.externalContentRef });
      }
    });
  }

  // 4c. externalContent.items[].id únicos entre si — verificado sobre a
  // lista inteira já estruturalmente validada (nunca só entre a primeira e a
  // segunda ocorrência: uma violação estrutural de QUALQUER item, esteja ela
  // antes, entre ou depois das ocorrências duplicadas, já teria sido
  // relatada na etapa anterior, antes de este bloco ser alcançado).
  if (externalContent) {
    const seenIds = new Set<string>();
    for (const item of externalContent.items) {
      if (seenIds.has(item.id)) {
        fail("radar_external_content_duplicate_id", { id: item.id });
      }
      seenIds.add(item.id);
    }
  }

  // 4d. cada externalContent.items[].capturedAt ≤ detectedAt — mesma razão
  // de adiamento que 4c.
  if (externalContent) {
    externalContent.items.forEach((item, index) => {
      if (externalContentCapturedAtEpochMs[index] > detectedAtParsed.epochMs) {
        fail("radar_captured_at_after_detected_at", { itemId: item.id });
      }
    });
  }

  // `opportunity` já foi validado acima; nada mais depende de seu valor —
  // referenciado aqui só para satisfazer checagem de variável não utilizada.
  void opportunity;

  // Passo 5 — teto agregado, medido por último, sobre o payload já validado.
  // Serializado a partir do valor ORIGINAL, preservando exatamente a ordem de
  // inserção nativa do parser JSON — nunca a ordenação de chaves usada por
  // stableStringify (fingerprint).
  const sizeBytes = Buffer.byteLength(JSON.stringify(value), "utf8");
  if (sizeBytes > AGGREGATE_SIZE_LIMIT_BYTES) {
    fail("radar_payload_aggregate_size_exceeded", { sizeBytes, maxBytes: AGGREGATE_SIZE_LIMIT_BYTES });
  }

  // Nenhuma normalização, cópia ou reordenação: devolve a MESMA referência
  // recebida — mesmos valores, mesma ordem de arrays, mesmas chaves.
  return value as unknown as RadarSignalResultV1;
}
