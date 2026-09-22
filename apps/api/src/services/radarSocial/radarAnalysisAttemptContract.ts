// Radar Social — contrato puro de RadarAnalysisAttempt: estados,
// generationConfig (origem exclusiva do servidor), attemptOperationKey e o
// algoritmo autossuficiente de tamanho/hash do resultado preservado. Ver
// docs/architecture/radar-social-construction-plan-v1.md, Atualizações
// 1.12, 1.15, 1.16, 1.17 e 1.18.
//
// Nenhuma operação transacional aqui (vive em radarAnalysisAttemptService.ts).
import crypto from "node:crypto";

export class RadarAnalysisAttemptError extends Error {
  constructor(readonly reasonCode: string, readonly context: Record<string, unknown> = {}) {
    super(`radar_analysis_attempt_invalid:${reasonCode}`);
    this.name = "RadarAnalysisAttemptError";
  }
}

export class RadarAnalysisAttemptConflictError extends Error {
  constructor(readonly reasonCode: string, readonly context: Record<string, unknown> = {}) {
    super(`radar_analysis_attempt_conflict:${reasonCode}`);
    this.name = "RadarAnalysisAttemptConflictError";
  }
}

export const RADAR_ANALYSIS_ATTEMPT_CONTRACT_VERSION = "radar-analysis-attempt.v1" as const;

export const RADAR_ANALYSIS_ATTEMPT_STATUSES = [
  "pending",
  "running",
  "provider_responded_pending_persistence",
  "completed",
  "failed",
  "cancelled",
] as const;
export type RadarAnalysisAttemptStatus = (typeof RADAR_ANALYSIS_ATTEMPT_STATUSES)[number];

export const TERMINAL_ATTEMPT_STATUSES: readonly RadarAnalysisAttemptStatus[] = ["completed", "failed", "cancelled"];

// --- attemptOperationKey (Atualização 1.18) --------------------------------

export const ATTEMPT_OPERATION_KEY_MIN_BYTES = 1;
export const ATTEMPT_OPERATION_KEY_MAX_BYTES = 128;

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

function requireBoundedUtf8String(value: unknown, opts: { field: string; minBytes: number; maxBytes: number }): string {
  if (value === null) throw new RadarAnalysisAttemptError("field_null_not_allowed", { field: opts.field });
  if (typeof value !== "string") throw new RadarAnalysisAttemptError("field_wrong_type", { field: opts.field });
  if (UNPAIRED_SURROGATE_RE.test(value)) throw new RadarAnalysisAttemptError("field_unpaired_surrogate", { field: opts.field });
  if (hasControlChar(value)) throw new RadarAnalysisAttemptError("field_control_character_not_allowed", { field: opts.field });
  if (value.trim().length === 0) throw new RadarAnalysisAttemptError("field_empty_or_whitespace", { field: opts.field });
  const len = byteLengthUtf8(value);
  if (len < opts.minBytes) throw new RadarAnalysisAttemptError("field_below_minimum_length", { field: opts.field, bytes: len, min: opts.minBytes });
  if (len > opts.maxBytes) throw new RadarAnalysisAttemptError("field_above_maximum_length", { field: opts.field, bytes: len, max: opts.maxBytes });
  return value;
}

// Chave fixa da PRIMEIRA tentativa, criada junto com a RadarAnalysisRequest
// (Atualização 1.18) — não há ambiguidade possível sobre qual é "a
// primeira", então nenhuma entrada do chamador é necessária para ela.
export const INITIAL_ATTEMPT_OPERATION_KEY = "initial" as const;

/** attemptOperationKey — obrigatório, 1–128 bytes UTF-8. Escopo de
 * unicidade: (tenantId, workspaceId, analysisRequestId, attemptOperationKey)
 * — aplicado pelo serviço/constraint de banco, não aqui. */
export function validateAttemptOperationKey(value: unknown): string {
  return requireBoundedUtf8String(value, { field: "attemptOperationKey", minBytes: ATTEMPT_OPERATION_KEY_MIN_BYTES, maxBytes: ATTEMPT_OPERATION_KEY_MAX_BYTES });
}

/** Identidade da OPERAÇÃO de criar uma tentativa — somente estes dois
 * campos (Atualização 1.18). generationConfig NUNCA participa desta
 * comparação, em nenhuma direção. */
export interface AttemptCreationIdentity {
  analysisRequestId: string;
  attemptOperationKey: string;
}

export function attemptCreationIdentityMatches(a: AttemptCreationIdentity, b: AttemptCreationIdentity): boolean {
  return a.analysisRequestId === b.analysisRequestId && a.attemptOperationKey === b.attemptOperationKey;
}

// --- generationConfig (Atualização 1.16/1.17/1.18) -------------------------
//
// Origem EXCLUSIVA do servidor — nenhum campo é aceito do chamador. Lista
// fechada de cinco campos; campo desconhecido é rejeitado.

export const LLM_USAGE_MODES = [
  "none",
  "format_only",
  "grounded_reasoning",
  "open_reasoning_restricted",
  "disallowed_for_critical_execution",
] as const;
export const PROVENANCE_POLICIES = ["required", "recommended", "none"] as const;
export const MASKING_POLICIES = ["required", "conditional", "none"] as const;

export interface KnowledgePolicySnapshot {
  llmUsageMode: (typeof LLM_USAGE_MODES)[number];
  provenancePolicy: (typeof PROVENANCE_POLICIES)[number];
  maskingPolicy: (typeof MASKING_POLICIES)[number];
}

export const GENERATION_CONFIG_CONTRACT_VERSION = "radar-analysis-generation-config.v1" as const;

// Proposta exclusiva do pacote A (Atualização 1.17/rodada de aprovação) —
// único valor reconhecido pelo substituto controlado de executor/provedor.
export const RADAR_TEST_MODEL = "radar-test-model-v1" as const;
export const SUPPORTED_MODELS: readonly string[] = [RADAR_TEST_MODEL];

export const REQUESTED_MAX_TOKENS_MIN = 1;
export const REQUESTED_MAX_TOKENS_MAX = 2_048;
export const REQUESTED_MAX_TOKENS_DEFAULT = 1_024;

export interface GenerationConfig {
  contractVersion: typeof GENERATION_CONFIG_CONTRACT_VERSION;
  requestedModel: string;
  requestedMaxTokens: number;
  promptTemplateVersion: string;
  knowledgePolicySnapshot: KnowledgePolicySnapshot;
  // Identidade do agente para assertWorkspaceAgentEnabled no checkpoint
  // pré-envio da execução governada (Atualização 1.29-1.32 do plano) —
  // ausentes/null quando a análise não passa (ainda) pelo caminho real.
  // Nenhum agente real é provisionado por esta unidade; presença aqui é só
  // um rótulo de configuração, nunca uma concessão de acesso.
  agentKey: string | null;
  agentVersion: string | null;
}

const GENERATION_CONFIG_FIELDS = [
  "contractVersion",
  "requestedModel",
  "requestedMaxTokens",
  "promptTemplateVersion",
  "knowledgePolicySnapshot",
  "agentKey",
  "agentVersion",
] as const;
const KNOWLEDGE_POLICY_SNAPSHOT_FIELDS = ["llmUsageMode", "provenancePolicy", "maskingPolicy"] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertKnownKeys(value: Record<string, unknown>, allowed: readonly string[], pathPrefix: string) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      throw new RadarAnalysisAttemptError("generation_config_unknown_field", { field: pathPrefix ? `${pathPrefix}.${key}` : key });
    }
  }
}

/**
 * Entrada CRUA para a resolução de generationConfig — já assumida como
 * derivada de uma fonte confiável do servidor (perfil de agente/política
 * vigente), nunca do corpo de uma requisição de chamador. `requestedMaxTokens`
 * ausente/null aplica o default 1.024. Rejeita chave desconhecida, valor de
 * `requestedModel` fora do catálogo suportado, e `requestedMaxTokens` fora
 * da faixa 1–2.048 (sem clamping).
 */
const GENERATION_CONFIG_INPUT_FIELDS = [
  "requestedModel",
  "requestedMaxTokens",
  "promptTemplateVersion",
  "knowledgePolicySnapshot",
  "agentKey",
  "agentVersion",
] as const;

export function resolveGenerationConfig(input: {
  requestedModel: unknown;
  requestedMaxTokens?: unknown;
  promptTemplateVersion: unknown;
  knowledgePolicySnapshot: unknown;
  agentKey?: unknown;
  agentVersion?: unknown;
}): GenerationConfig {
  if (!isPlainObject(input)) {
    throw new RadarAnalysisAttemptError("generation_config_field_wrong_type", { field: "generationConfigInput" });
  }
  assertKnownKeys(input, GENERATION_CONFIG_INPUT_FIELDS, "");
  if (typeof input.requestedModel !== "string" || input.requestedModel.length === 0) {
    throw new RadarAnalysisAttemptError("generation_config_field_wrong_type", { field: "requestedModel" });
  }
  if (!SUPPORTED_MODELS.includes(input.requestedModel)) {
    throw new RadarAnalysisAttemptError("generation_config_model_not_supported", { requestedModel: input.requestedModel });
  }

  let requestedMaxTokens: number;
  if (input.requestedMaxTokens === undefined || input.requestedMaxTokens === null) {
    requestedMaxTokens = REQUESTED_MAX_TOKENS_DEFAULT;
  } else {
    if (
      typeof input.requestedMaxTokens !== "number" ||
      !Number.isInteger(input.requestedMaxTokens) ||
      input.requestedMaxTokens < REQUESTED_MAX_TOKENS_MIN ||
      input.requestedMaxTokens > REQUESTED_MAX_TOKENS_MAX
    ) {
      throw new RadarAnalysisAttemptError("generation_config_max_tokens_out_of_range", {
        value: input.requestedMaxTokens, min: REQUESTED_MAX_TOKENS_MIN, max: REQUESTED_MAX_TOKENS_MAX,
      });
    }
    requestedMaxTokens = input.requestedMaxTokens;
  }

  if (typeof input.promptTemplateVersion !== "string" || input.promptTemplateVersion.trim().length === 0) {
    throw new RadarAnalysisAttemptError("generation_config_field_wrong_type", { field: "promptTemplateVersion" });
  }

  if (!isPlainObject(input.knowledgePolicySnapshot)) {
    throw new RadarAnalysisAttemptError("generation_config_field_wrong_type", { field: "knowledgePolicySnapshot" });
  }
  assertKnownKeys(input.knowledgePolicySnapshot, KNOWLEDGE_POLICY_SNAPSHOT_FIELDS, "knowledgePolicySnapshot");
  const { llmUsageMode, provenancePolicy, maskingPolicy } = input.knowledgePolicySnapshot;
  if (!LLM_USAGE_MODES.includes(llmUsageMode as never)) {
    throw new RadarAnalysisAttemptError("generation_config_field_wrong_type", { field: "knowledgePolicySnapshot.llmUsageMode" });
  }
  if (!PROVENANCE_POLICIES.includes(provenancePolicy as never)) {
    throw new RadarAnalysisAttemptError("generation_config_field_wrong_type", { field: "knowledgePolicySnapshot.provenancePolicy" });
  }
  if (!MASKING_POLICIES.includes(maskingPolicy as never)) {
    throw new RadarAnalysisAttemptError("generation_config_field_wrong_type", { field: "knowledgePolicySnapshot.maskingPolicy" });
  }

  let agentKey: string | null = null;
  if (input.agentKey !== undefined && input.agentKey !== null) {
    if (typeof input.agentKey !== "string" || input.agentKey.trim().length === 0) {
      throw new RadarAnalysisAttemptError("generation_config_field_wrong_type", { field: "agentKey" });
    }
    agentKey = input.agentKey;
  }
  let agentVersion: string | null = null;
  if (input.agentVersion !== undefined && input.agentVersion !== null) {
    if (typeof input.agentVersion !== "string" || input.agentVersion.trim().length === 0) {
      throw new RadarAnalysisAttemptError("generation_config_field_wrong_type", { field: "agentVersion" });
    }
    agentVersion = input.agentVersion;
  }

  return {
    contractVersion: GENERATION_CONFIG_CONTRACT_VERSION,
    requestedModel: input.requestedModel,
    requestedMaxTokens,
    promptTemplateVersion: input.promptTemplateVersion,
    knowledgePolicySnapshot: {
      llmUsageMode: llmUsageMode as KnowledgePolicySnapshot["llmUsageMode"],
      provenancePolicy: provenancePolicy as KnowledgePolicySnapshot["provenancePolicy"],
      maskingPolicy: maskingPolicy as KnowledgePolicySnapshot["maskingPolicy"],
    },
    agentKey,
    agentVersion,
  };
}

/** Valida uma cópia de generationConfig JÁ PERSISTIDA (relida do banco) —
 * usada para reconstruir/conferir sem recalcular nada. Chave desconhecida
 * ainda é rejeitada (defesa contra dado corrompido). */
export function parseGenerationConfig(value: unknown): GenerationConfig {
  if (!isPlainObject(value)) throw new RadarAnalysisAttemptError("generation_config_field_wrong_type", { field: "generationConfig" });
  assertKnownKeys(value, GENERATION_CONFIG_FIELDS, "");
  if (value.contractVersion !== GENERATION_CONFIG_CONTRACT_VERSION) {
    throw new RadarAnalysisAttemptError("generation_config_contract_version_invalid", { received: value.contractVersion });
  }
  return resolveGenerationConfig({
    requestedModel: value.requestedModel,
    requestedMaxTokens: value.requestedMaxTokens,
    promptTemplateVersion: value.promptTemplateVersion,
    knowledgePolicySnapshot: value.knowledgePolicySnapshot,
    agentKey: value.agentKey,
    agentVersion: value.agentVersion,
  });
}

/** Compara duas configurações campo a campo — usada só para decidir
 * recuperação vs. conflito na criação de tentativa sob a mesma
 * attemptOperationKey (Atualização 1.18: divergência de generationConfig
 * NUNCA gera conflito por si só — ver radarAnalysisAttemptService.ts). */
export function generationConfigEquals(a: GenerationConfig, b: GenerationConfig): boolean {
  return (
    a.contractVersion === b.contractVersion &&
    a.requestedModel === b.requestedModel &&
    a.requestedMaxTokens === b.requestedMaxTokens &&
    a.promptTemplateVersion === b.promptTemplateVersion &&
    a.knowledgePolicySnapshot.llmUsageMode === b.knowledgePolicySnapshot.llmUsageMode &&
    a.knowledgePolicySnapshot.provenancePolicy === b.knowledgePolicySnapshot.provenancePolicy &&
    a.knowledgePolicySnapshot.maskingPolicy === b.knowledgePolicySnapshot.maskingPolicy
  );
}

// --- Resultado preservado: tamanho e hash, autossuficiente (Atualização 1.18) ---

export const PRESERVED_RESULT_VERSION = "radar-analysis-preserved-result.v1" as const;
export const PRESERVED_RESULT_MAX_BYTES = 32_768;
export const PROVENANCE_FIELD_MAX_BYTES = 256;

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** Valida que o valor é composto só de tipos JSON aceitos (nunca
 * `undefined`, `NaN`, `Infinity`, função) — antes de medir tamanho ou
 * calcular hash. */
export function assertJsonValueShape(value: unknown, path = "$"): asserts value is JsonValue {
  if (value === null) return;
  if (typeof value === "string") return;
  if (typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new RadarAnalysisAttemptError("preserved_result_value_not_finite", { path });
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJsonValueShape(item, `${path}[${index}]`));
    return;
  }
  if (isPlainObject(value)) {
    for (const [key, entry] of Object.entries(value)) {
      assertJsonValueShape(entry, `${path}.${key}`);
    }
    return;
  }
  throw new RadarAnalysisAttemptError("preserved_result_value_not_json", { path });
}

/**
 * Tamanho medido: `JSON.stringify(valor)` **sem indentação**, na ordem de
 * chaves tal como o objeto já as possui (ordem de inserção, NUNCA
 * reordenada para esta medição) — é a forma que de fato seria persistida.
 * Não é uma forma canônica; é só a forma efetivamente armazenável.
 */
export function measurePreservedResultBytes(value: JsonValue): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

/** Ordena as chaves de todo objeto, recursivamente, alfabeticamente
 * (`Array.prototype.sort()` padrão) — só para o cálculo do hash, nunca
 * para a medição de tamanho nem para o valor persistido. Arrays nunca são
 * reordenados; a ordenação de chaves não normaliza conteúdo textual. */
function sortKeysDeep(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (isPlainObject(value)) {
    const sortedKeys = Object.keys(value).sort();
    const result: Record<string, JsonValue> = {};
    for (const key of sortedKeys) {
      result[key] = sortKeysDeep(value[key] as JsonValue);
    }
    return result;
  }
  return value;
}

/**
 * SHA-256 hex sobre a serialização determinística (chaves ordenadas) do
 * valor — nunca sobre a linha inteira da tentativa, nunca incluindo o
 * próprio hash. Regra de reconstrução: ao reler o valor do banco (ordem de
 * chaves não garantida), reaplicar esta MESMA função antes de comparar —
 * nunca depender da ordem bruta devolvida pela consulta.
 */
export function computePreservedResultHash(value: JsonValue): string {
  const canonical = JSON.stringify(sortKeysDeep(value));
  return crypto.createHash("sha256").update(canonical, "utf8").digest("hex");
}

export interface PreparedPreservedResult {
  payload: JsonValue;
  hash: string;
  sizeBytes: number;
}

/**
 * Valida forma JSON, mede o tamanho (sobre a forma NÃO reordenada) e
 * calcula o hash (sobre a forma reordenada) — nesta ordem. Lança
 * `preserved_result_exceeds_size_limit` sem incluir o conteúdo do payload
 * no erro (não expõe conteúdo sensível em log).
 */
export function preparePreservedResult(value: unknown): PreparedPreservedResult {
  assertJsonValueShape(value);
  const sizeBytes = measurePreservedResultBytes(value);
  if (sizeBytes > PRESERVED_RESULT_MAX_BYTES) {
    throw new RadarAnalysisAttemptError("preserved_result_exceeds_size_limit", {
      sizeBytes, maxBytes: PRESERVED_RESULT_MAX_BYTES,
    });
  }
  const hash = computePreservedResultHash(value);
  return { payload: value, hash, sizeBytes };
}

/** Campos de proveniência — identificadores curtos, não conteúdo. Limite de
 * 256 bytes UTF-8 cada (Atualização 1.18, lacuna fechada). */
export function validateProvenanceField(value: unknown, field: string): string {
  return requireBoundedUtf8String(value, { field, minBytes: 1, maxBytes: PROVENANCE_FIELD_MAX_BYTES });
}
