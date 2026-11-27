import { z } from "zod";
import { oraculoDecisionValueSchema } from "./oraculoPreparation.js";

/**
 * Data-source contracts v1 (Oráculo SC, etapa 1 — contratos e catálogo, SEM execução).
 *
 * Este módulo só descreve FORMAS e invariantes verificáveis em runtime. Ele não faz rede, não lê segredo,
 * não toca banco e não decide acesso. Quatro conceitos permanecem deliberadamente separados e nenhum
 * implica outro:
 *   1. modalidade de acesso      (`DATA_SOURCE_ACCESS_MODES`)
 *   2. estado técnico            (`lifecycleState` da fonte; `configuration`/`enablement`/`suspension` da conexão)
 *   3. condição de uso           (`usageCondition` + `licenseTerms`)
 *   4. autorização               (SEMPRE `authorizationGranted: false` aqui; quem autoriza é a política de
 *                                 acesso existente, avaliada pelo executor em tempo de execução)
 *
 * Convenções herdadas de `oraculoPreparation.ts`: zod `.strict()`, `schemaVersion` literal, `expectedRevision`,
 * sha256 hex minúsculo e flags literais `false` para "não autoriza".
 */

const text = z.string().trim().min(1).max(500);
const stableId = z.string().min(3).max(80).regex(/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/);
const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/);
const instant = z.string().datetime();
// Mesma regra de `calendarDate` em oraculoPreparation.ts (lá não é exportada; não alterei aquele módulo).
const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
});
const dateOrInstant = z.union([calendarDate, instant]);

export type DataSourceJsonValue =
  | string
  | number
  | boolean
  | null
  | DataSourceJsonValue[]
  | { [key: string]: DataSourceJsonValue };
const jsonValue: z.ZodType<DataSourceJsonValue> = z.lazy(() =>
  z.union([z.string(), z.number().finite(), z.boolean(), z.null(), z.array(jsonValue), z.record(jsonValue)]),
);

// --- Representação explícita de "desconhecido" -------------------------------------------------------------
// Um metadado nunca é omitido: ou é `unknown`, ou é `declared` (alguém afirmou, com base registrada, sem
// confirmação na fonte oficial), ou é `verified` (confirmado por alguém, quando). Ausência ≠ confirmação.
const dataSourceFact = <T extends z.ZodTypeAny>(value: T) =>
  z.discriminatedUnion("status", [
    z.object({ status: z.literal("unknown") }).strict(),
    z.object({ status: z.literal("declared"), value, basis: text }).strict(),
    z.object({ status: z.literal("verified"), value, basis: text, verifiedAt: instant, verifiedBy: text }).strict(),
  ]);

const knownOrUnknown = <T extends z.ZodTypeAny>(value: T) =>
  z.discriminatedUnion("status", [
    z.object({ status: z.literal("unknown") }).strict(),
    z.object({ status: z.literal("known"), value }).strict(),
  ]);

// --- A) Fonte ---------------------------------------------------------------------------------------------
export const DATA_SOURCE_ACCESS_MODES = [
  "open_api",
  "authenticated_api",
  "data_file",
  "private_api",
  "channel_message",
  "manual_entry",
] as const;
export const dataSourceAccessModeSchema = z.enum(DATA_SOURCE_ACCESS_MODES);
export type DataSourceAccessMode = z.infer<typeof dataSourceAccessModeSchema>;

export const DATA_SOURCE_LIFECYCLE_STATES = ["mapped", "configuring", "testing", "validated", "active", "suspended"] as const;
export const dataSourceLifecycleStateSchema = z.enum(DATA_SOURCE_LIFECYCLE_STATES);

export const DATA_SOURCE_USAGE_CONDITIONS = ["not_assessed", "permitted", "permitted_with_conditions", "restricted", "denied"] as const;
export const dataSourceUsageConditionSchema = z.enum(DATA_SOURCE_USAGE_CONDITIONS);

export const DATA_SOURCE_DOMAINS = [
  "customs_classification",
  "geographic_reference",
  "exchange_rate",
  "foreign_trade_statistics",
  "legal_normative",
  "port_logistics",
  "supplier_commercial",
  "other",
] as const;
export const dataSourceDomainSchema = z.enum(DATA_SOURCE_DOMAINS);

export const DATA_SOURCE_UPDATE_FREQUENCIES = ["continuous", "daily", "weekly", "monthly", "quarterly", "annual", "irregular", "on_demand"] as const;

const httpsReference = z.string().url().max(500).refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash;
  } catch {
    return false;
  }
}, "https sem credenciais, query string ou fragmento");

export const dataSourceDocumentationRefV1Schema = z.object({
  kind: z.enum(["official_documentation", "dataset_page", "terms_of_use", "other"]),
  title: text,
  url: httpsReference,
}).strict();

export const dataSourceKnownLimitV1Schema = z.object({
  kind: z.enum(["rate_limit", "volume", "cost", "coverage", "latency", "other"]),
  description: text,
}).strict();

const uniqueAccessModes = z.array(dataSourceAccessModeSchema).min(1).max(DATA_SOURCE_ACCESS_MODES.length)
  .refine((modes) => new Set(modes).size === modes.length, "modalidades duplicadas");

export const dataSourceV1Schema = z.object({
  schemaVersion: z.literal("eiah.data-source.v1"),
  sourceId: stableId,
  sourceVersion: z.number().int().positive(),
  provider: text,
  purpose: text,
  domain: dataSourceDomainSchema,
  coverage: dataSourceFact(text),
  supportedAccessModes: dataSourceFact(uniqueAccessModes),
  documentation: dataSourceFact(z.array(dataSourceDocumentationRefV1Schema).min(1).max(20)),
  licenseTerms: dataSourceFact(z.object({ license: text, termsReference: text.optional() }).strict()),
  usageCondition: dataSourceUsageConditionSchema,
  expectedUpdateFrequency: dataSourceFact(z.enum(DATA_SOURCE_UPDATE_FREQUENCIES)),
  knownLimits: dataSourceFact(z.array(dataSourceKnownLimitV1Schema).min(1).max(20)),
  steward: dataSourceFact(text),
  lifecycleState: dataSourceLifecycleStateSchema,
  /** Fonte ativa NÃO concede autorização. Este contrato nunca carrega permissão. */
  authorizationGranted: z.literal(false),
}).strict().superRefine((source, ctx) => {
  if (source.lifecycleState !== "validated" && source.lifecycleState !== "active") return;
  const need = (ok: boolean, path: string, message: string) => {
    if (!ok) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
  };
  need(source.licenseTerms.status === "verified", "licenseTerms", `estado ${source.lifecycleState} exige licença/termos verificados`);
  need(source.documentation.status === "verified", "documentation", `estado ${source.lifecycleState} exige documentação verificada`);
  need(source.supportedAccessModes.status === "verified", "supportedAccessModes", `estado ${source.lifecycleState} exige modalidades verificadas`);
  need(
    source.usageCondition === "permitted" || source.usageCondition === "permitted_with_conditions",
    "usageCondition",
    `estado ${source.lifecycleState} exige condição de uso avaliada e permitida`,
  );
});
export type DataSourceV1 = z.infer<typeof dataSourceV1Schema>;

const DATA_SOURCE_FACT_FIELDS = ["coverage", "supportedAccessModes", "documentation", "licenseTerms", "expectedUpdateFrequency", "knownLimits", "steward"] as const;
/** Lista os metadados da fonte que ainda NÃO estão verificados (desconhecidos ou apenas declarados). */
export function listUnverifiedDataSourceMetadata(source: DataSourceV1): string[] {
  const pending: string[] = DATA_SOURCE_FACT_FIELDS.filter((field) => source[field].status !== "verified");
  if (source.usageCondition === "not_assessed") pending.push("usageCondition");
  return pending;
}

// --- Escopo ------------------------------------------------------------------------------------------------
/** `shared` = metadado/dado de plataforma, sem tenant. Consultas gerais não precisam de caso. */
export const dataSourceScopeV1Schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("shared") }).strict(),
  z.object({ kind: z.literal("tenant_workspace"), tenantId: text, workspaceId: text }).strict(),
]);
export type DataSourceScopeV1 = z.infer<typeof dataSourceScopeV1Schema>;

// --- B) Conexão -------------------------------------------------------------------------------------------
/**
 * Referência OPACA a um segredo guardado fora deste contrato. O formato só impede colar um segredo no lugar
 * da referência; a resolução do segredo pertence a um componente futuro e não existe nesta etapa.
 */
export const dataSourceCredentialRefSchema = z.string().regex(/^credref:[A-Za-z0-9][A-Za-z0-9._-]{7,127}$/);

/**
 * Uma URL cadastrada é só METADADO. `grantsNetworkPermission: false` e `destinationPolicy` tornam explícito
 * que o executor (ainda inexistente) deve validar o destino a cada requisição; cadastrar não autoriza.
 */
const registeredEndpoint = z.object({
  registeredUrl: httpsReference,
  grantsNetworkPermission: z.literal(false),
  destinationPolicy: z.literal("validated_by_executor"),
}).strict();

export const DATA_SOURCE_AUTH_SCHEMES = ["api_key", "bearer_token", "oauth2_client_credentials", "basic", "mtls"] as const;
export const DATA_SOURCE_FILE_FORMATS = ["csv", "json", "xml", "xlsx", "pdf"] as const;

export const dataSourceConnectionConfigV1Schema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("open_api"), endpoint: registeredEndpoint }).strict(),
  z.object({
    mode: z.literal("authenticated_api"),
    endpoint: registeredEndpoint,
    authScheme: z.enum(DATA_SOURCE_AUTH_SCHEMES),
    credentialRef: dataSourceCredentialRefSchema.optional(),
  }).strict(),
  z.object({
    mode: z.literal("data_file"),
    expectedFormat: z.enum(DATA_SOURCE_FILE_FORMATS),
    origin: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("public_download"), endpoint: registeredEndpoint }).strict(),
      z.object({ kind: z.literal("tenant_upload") }).strict(),
      z.object({ kind: z.literal("platform_import") }).strict(),
    ]),
  }).strict(),
  z.object({
    mode: z.literal("private_api"),
    /** Referência opaca ao fornecedor; nenhum parceiro é cadastrado por este contrato. */
    supplierRef: text,
    endpoint: registeredEndpoint,
    authScheme: z.enum(DATA_SOURCE_AUTH_SCHEMES),
    credentialRef: dataSourceCredentialRefSchema.optional(),
  }).strict(),
  z.object({
    mode: z.literal("channel_message"),
    channel: z.enum(["whatsapp"]),
    direction: z.literal("inbound"),
    acceptsAttachments: z.boolean(),
    /** Referência opaca ao vínculo de canal já existente; não duplica `ChannelBinding`. */
    channelBindingRef: text,
    caseBinding: z.literal("required"),
  }).strict(),
  z.object({
    mode: z.literal("manual_entry"),
    entryAuthority: z.literal("authorized_human"),
    /** Escopo de permissão que o executor deve exigir de quem insere; o contrato não o concede. */
    requiredScope: text,
  }).strict(),
]);
export type DataSourceConnectionConfigV1 = z.infer<typeof dataSourceConnectionConfigV1Schema>;

export const dataSourceAccessPolicyRefV1Schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none_declared") }).strict(),
  z.object({ kind: z.literal("tenant_action_policy"), ref: text }).strict(),
  z.object({ kind: z.literal("tenant_product_installation"), ref: text }).strict(),
]);

const MODES_REQUIRING_TENANT_SCOPE: ReadonlySet<DataSourceAccessMode> = new Set(["private_api", "channel_message", "manual_entry"]);

export const dataSourceConnectionV1Schema = z.object({
  schemaVersion: z.literal("eiah.data-source-connection.v1"),
  connectionId: stableId,
  sourceId: stableId,
  sourceVersion: z.number().int().positive(),
  scope: dataSourceScopeV1Schema,
  /** A modalidade selecionada é `config.mode`; não há segundo campo que possa divergir dela. */
  config: dataSourceConnectionConfigV1Schema,
  configuration: z.enum(["incomplete", "complete"]),
  enablement: z.discriminatedUnion("status", [
    z.object({ status: z.literal("disabled") }).strict(),
    z.object({ status: z.literal("enabled"), enabledBy: text, enabledAt: instant }).strict(),
  ]),
  suspension: z.discriminatedUnion("status", [
    z.object({ status: z.literal("not_suspended") }).strict(),
    z.object({ status: z.literal("suspended"), reason: text, suspendedBy: text, suspendedAt: instant }).strict(),
  ]),
  accessPolicyRef: dataSourceAccessPolicyRefV1Schema,
  /** Conexão habilitada NÃO concede autorização; a política referenciada decide em tempo de execução. */
  authorizationGranted: z.literal(false),
}).strict().superRefine((connection, ctx) => {
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
  if (connection.enablement.status === "enabled") {
    if (connection.configuration !== "complete") issue(["enablement"], "habilitar exige configuração completa");
    if (connection.suspension.status === "suspended") issue(["enablement"], "conexão suspensa não pode estar habilitada");
    if (connection.accessPolicyRef.kind === "none_declared") issue(["accessPolicyRef"], "habilitar exige referência de política de acesso existente");
  }
  const config = connection.config;
  if (connection.configuration === "complete" && (config.mode === "authenticated_api" || config.mode === "private_api") && !config.credentialRef) {
    issue(["config", "credentialRef"], "configuração completa exige referência de credencial");
  }
  if (MODES_REQUIRING_TENANT_SCOPE.has(config.mode) && connection.scope.kind !== "tenant_workspace") {
    issue(["scope"], `modalidade ${config.mode} exige escopo tenant/workspace`);
  }
});
export type DataSourceConnectionV1 = z.infer<typeof dataSourceConnectionV1Schema>;

export type DataSourceCompatibilityIssue =
  | "SOURCE_ID_MISMATCH"
  | "SOURCE_VERSION_MISMATCH"
  | "SOURCE_ACCESS_MODES_UNKNOWN"
  | "ACCESS_MODE_NOT_SUPPORTED_BY_SOURCE";

/** Compatibilidade estrutural conexão×fonte. NÃO é decisão de acesso e não consulta política alguma. */
export function checkConnectionAgainstSource(connection: DataSourceConnectionV1, source: DataSourceV1): DataSourceCompatibilityIssue[] {
  const issues: DataSourceCompatibilityIssue[] = [];
  if (connection.sourceId !== source.sourceId) issues.push("SOURCE_ID_MISMATCH");
  if (connection.sourceVersion !== source.sourceVersion) issues.push("SOURCE_VERSION_MISMATCH");
  if (source.supportedAccessModes.status === "unknown") issues.push("SOURCE_ACCESS_MODES_UNKNOWN");
  else if (!source.supportedAccessModes.value.includes(connection.config.mode)) issues.push("ACCESS_MODE_NOT_SUPPORTED_BY_SOURCE");
  return issues;
}

/**
 * Visibilidade por escopo (isolamento), não autorização. Fail-closed: sem tenant E workspace do chamador,
 * nada é visível, nem mesmo uma conexão `shared`.
 */
export function isConnectionVisibleInScope(
  connection: Pick<DataSourceConnectionV1, "scope">,
  caller: { tenantId?: string | null; workspaceId?: string | null },
): boolean {
  if (!caller.tenantId || !caller.workspaceId) return false;
  if (connection.scope.kind === "shared") return true;
  return connection.scope.tenantId === caller.tenantId && connection.scope.workspaceId === caller.workspaceId;
}

// --- D) Evidência de origem -------------------------------------------------------------------------------
/**
 * Origem, validação e aprovação são campos independentes. Uma origem oficial ou de sistema pode estar
 * `not_validated` e `not_requested`; nada aqui promove um estado a outro.
 */
export const originEvidenceOriginV1Schema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("supplier_declared"),
    supplierRef: text,
    receivedAt: instant,
    declaredAt: instant.optional(),
    messageRef: text.optional(),
  }).strict(),
  z.object({
    kind: z.literal("system_obtained"),
    sourceId: stableId,
    connectionId: stableId.optional(),
    obtainedAt: instant,
    publisherStatus: z.enum(["official", "unofficial", "unknown"]),
    systemRef: text.optional(),
  }).strict(),
  z.object({
    kind: z.literal("manual_entry"),
    enteredBy: text,
    enteredAt: instant,
    entryBasis: text,
  }).strict(),
]);

export const originEvidenceValidationV1Schema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("not_validated") }).strict(),
  z.object({
    status: z.literal("validated"),
    method: z.enum(["human_review", "documented_automated_check"]),
    validatedBy: text,
    validatedAt: instant,
    basisHash: sha256Hex,
  }).strict(),
  z.object({ status: z.literal("rejected"), validatedBy: text, validatedAt: instant, reason: text }).strict(),
]);

export const originEvidenceApprovalV1Schema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("not_requested") }).strict(),
  z.object({ status: z.literal("requested"), requestedBy: text, requestedAt: instant }).strict(),
  z.object({
    status: z.literal("decided"),
    decision: oraculoDecisionValueSchema,
    requestedBy: text,
    decidedBy: text,
    decidedAt: instant,
    note: text,
  }).strict(),
]);

export const originEvidenceV1Schema = z.object({
  schemaVersion: z.literal("eiah.origin-evidence.v1"),
  evidenceId: text,
  origin: originEvidenceOriginV1Schema,
  contentSha256: sha256Hex,
  validation: originEvidenceValidationV1Schema,
  approval: originEvidenceApprovalV1Schema,
  operationalAuthorization: z.literal(false),
}).strict().superRefine((evidence, ctx) => {
  const issue = (path: string[], message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
  if (evidence.approval.status === "decided") {
    if (evidence.approval.decidedBy === evidence.approval.requestedBy) issue(["approval", "decidedBy"], "decisor deve ser diferente de quem pediu");
    if (evidence.approval.decision === "approved" && evidence.validation.status !== "validated") {
      issue(["approval", "decision"], "aprovação exige validação prévia; origem oficial ou de sistema não a substitui");
    }
  }
});
export type OriginEvidenceV1 = z.infer<typeof originEvidenceV1Schema>;

// --- C) Resultado de coleta -------------------------------------------------------------------------------
export const collectionResultDatesV1Schema = z.object({
  /** Quando a coleta/tentativa ocorreu — sempre conhecido. As demais datas são explícitas: conhecida ou desconhecida. */
  collectedAt: instant,
  referenceDate: knownOrUnknown(calendarDate),
  publishedAt: knownOrUnknown(dateOrInstant),
  validFrom: knownOrUnknown(calendarDate),
  validUntil: knownOrUnknown(calendarDate),
}).strict().superRefine((dates, ctx) => {
  if (dates.validFrom.status === "known" && dates.validUntil.status === "known" && dates.validFrom.value > dates.validUntil.value) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["validUntil"], message: "vigência termina antes de começar" });
  }
});

export const collectionResultWarningV1Schema = z.object({
  kind: z.enum(["quality", "stale", "divergence", "partial_coverage", "schema_drift", "unverified_source"]),
  severity: z.enum(["info", "warning"]),
  message: text,
}).strict();

const collectionOriginalEvidence = z.object({
  sha256: sha256Hex,
  byteLength: z.number().int().nonnegative(),
  mediaType: text,
  storage: z.discriminatedUnion("status", [
    z.object({ status: z.literal("preserved"), ref: text }).strict(),
    z.object({ status: z.literal("not_preserved") }).strict(),
  ]),
}).strict();

const collectionTransformationEvidence = z.object({
  transformId: stableId,
  transformVersion: text,
  inputSha256: sha256Hex,
  outputSha256: sha256Hex,
  deterministic: z.boolean(),
}).strict();

export const collectionRecordV1Schema = z.object({
  /** Identificador do registro no sistema de origem; `unknown` quando a fonte não fornece um. */
  externalId: knownOrUnknown(text),
  data: z.record(jsonValue),
}).strict();

export const COLLECTION_ERROR_CODES = [
  "source_unavailable",
  "timeout",
  "rate_limited",
  "unauthorized",
  "not_found",
  "invalid_response",
  "schema_violation",
  "policy_blocked",
  "internal_error",
  "unknown",
] as const;

// Defesa estrutural: mensagem de erro não pode carregar segredo/credencial/URL com chave em query.
const SECRET_LIKE = /(bearer\s+[a-z0-9._~+/-]{8,}|(?:api[_-]?key|password|passwd|secret|token|authorization)\s*[=:]\s*\S+|https?:\/\/\S*[?&](?:key|token|api[_-]?key|apikey|secret|access_token)=)/i;
const safeErrorMessage = text.refine((value) => !SECRET_LIKE.test(value), "mensagem de erro não pode expor segredo");

const resultBase = {
  schemaVersion: z.literal("eiah.collection-result.v1"),
  resultId: text,
  sourceId: stableId,
  sourceVersion: z.number().int().positive(),
  /** Presente só quando houve uma conexão; consultas gerais sobre fonte pública não têm. */
  connectionId: stableId.optional(),
  /** Versão do esquema do conteúdo normalizado (não é a versão deste contrato). */
  contentSchemaVersion: text,
  scope: dataSourceScopeV1Schema,
  /** Opcional: um resultado não precisa pertencer a um caso. */
  caseRef: z.object({ caseId: text, tenantId: text, workspaceId: text }).strict().optional(),
  dates: collectionResultDatesV1Schema,
  warnings: z.array(collectionResultWarningV1Schema).max(50),
};

export const collectionResultV1Schema = z.discriminatedUnion("outcome", [
  z.object({
    ...resultBase,
    outcome: z.literal("success"),
    content: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("inline"), records: z.array(collectionRecordV1Schema).min(1).max(1000) }).strict(),
      z.object({ kind: z.literal("reference"), contentRef: text, contentSha256: sha256Hex }).strict(),
    ]),
    origin: originEvidenceV1Schema,
    evidence: z.object({ original: collectionOriginalEvidence, transformation: collectionTransformationEvidence }).strict(),
  }).strict(),
  z.object({
    ...resultBase,
    outcome: z.literal("empty"),
    emptyReason: z.enum(["no_matching_records", "source_returned_empty"]),
    origin: originEvidenceV1Schema,
    evidence: z.object({ original: collectionOriginalEvidence }).strict(),
  }).strict(),
  z.object({
    ...resultBase,
    outcome: z.literal("not_modified"),
    basedOn: z.object({ previousResultId: text, previousContentSha256: sha256Hex }).strict(),
  }).strict(),
  z.object({
    ...resultBase,
    outcome: z.literal("failure"),
    error: z.object({
      code: z.enum(COLLECTION_ERROR_CODES),
      message: safeErrorMessage,
      retryable: z.boolean(),
      httpStatus: z.number().int().min(100).max(599).optional(),
    }).strict(),
  }).strict(),
]).superRefine((result, ctx) => {
  if (result.caseRef) {
    const ok = result.scope.kind === "tenant_workspace"
      && result.scope.tenantId === result.caseRef.tenantId
      && result.scope.workspaceId === result.caseRef.workspaceId;
    if (!ok) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["caseRef"], message: "caso deve pertencer ao mesmo tenant/workspace do escopo do resultado" });
  }
  if (result.outcome === "success" || result.outcome === "empty") {
    if (result.origin.origin.kind === "system_obtained" && result.origin.origin.sourceId !== result.sourceId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["origin"], message: "origem de sistema aponta para outra fonte" });
    }
    if (result.origin.contentSha256 !== result.evidence.original.sha256) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["origin", "contentSha256"], message: "hash da origem difere do hash do original" });
    }
  }
});
export type CollectionResultV1 = z.infer<typeof collectionResultV1Schema>;

// --- E) Proposta de atualização do caso (nunca aplicada nesta etapa) ---------------------------------------
const proposalActor = z.object({ kind: z.enum(["human", "system"]), ref: text }).strict();
const FIELD_PATH = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+|\[\d+\])*$/;
// Segmentos que nunca podem aparecer em nenhuma posição: evitam poluição de protótipo se o caminho for aplicado depois.
const FORBIDDEN_PATH_SEGMENTS: ReadonlySet<string> = new Set(["__proto__", "constructor", "prototype"]);
const fieldPath = z.string().max(200).regex(FIELD_PATH).refine(
  (value) => value.split(/[.[\]]/).every((segment) => !FORBIDDEN_PATH_SEGMENTS.has(segment)),
  "caminho contém segmento reservado",
);

export const caseUpdateChangeV1Schema = z.object({
  fieldPath,
  operation: z.enum(["set", "clear"]),
  proposedValue: jsonValue.optional(),
  /** Guarda otimista opcional: hash do valor atual conhecido pelo proponente. */
  previousValueSha256: sha256Hex.optional(),
  evidenceIds: z.array(text).min(1).max(50),
}).strict().superRefine((change, ctx) => {
  if (change.operation === "set" && change.proposedValue === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["proposedValue"], message: "set exige valor proposto" });
  }
  if (change.operation === "clear" && change.proposedValue !== undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["proposedValue"], message: "clear não aceita valor proposto" });
  }
});

export const caseUpdateProposalDecisionV1Schema = z.object({
  decision: oraculoDecisionValueSchema,
  note: text,
  /** Só humano decide; um sistema/fonte não aprova a própria proposta. */
  decidedBy: z.object({ kind: z.literal("human"), ref: text }).strict(),
  decidedAt: instant,
  basedOnRevision: z.number().int().positive(),
  basisHash: sha256Hex,
}).strict();

export const caseUpdateProposalV1Schema = z.object({
  schemaVersion: z.literal("eiah.case-update-proposal.v1"),
  proposalId: text,
  caseId: text,
  caseType: text,
  tenantId: text,
  workspaceId: text,
  expectedRevision: z.number().int().positive(),
  changes: z.array(caseUpdateChangeV1Schema).min(1).max(50),
  evidence: z.array(z.object({ evidenceId: text, contentSha256: sha256Hex }).strict()).min(1).max(50),
  proposedBy: proposalActor,
  proposedAt: instant,
  state: z.enum(["proposed", "under_review", "decided", "withdrawn"]),
  decision: caseUpdateProposalDecisionV1Schema.optional(),
  /** Esta etapa não aplica nada ao caso: a flag é literal. */
  caseMutationApplied: z.literal(false),
  operationalAuthorization: z.literal(false),
}).strict().superRefine((proposal, ctx) => {
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
  if ((proposal.state === "decided") !== (proposal.decision !== undefined)) {
    issue(["decision"], "decisão deve existir se, e somente se, o estado for decided");
  }
  if (proposal.decision) {
    if (proposal.decision.basedOnRevision !== proposal.expectedRevision) issue(["decision", "basedOnRevision"], "decisão deve referir a revisão esperada da proposta");
    if (proposal.decision.decidedBy.ref === proposal.proposedBy.ref) issue(["decision", "decidedBy"], "decisor deve ser diferente do proponente");
  }
  const evidenceIds = proposal.evidence.map((item) => item.evidenceId);
  if (new Set(evidenceIds).size !== evidenceIds.length) issue(["evidence"], "evidências duplicadas");
  const known = new Set(evidenceIds);
  const paths = new Set<string>();
  proposal.changes.forEach((change, index) => {
    if (paths.has(change.fieldPath)) issue(["changes", index, "fieldPath"], "campo alterado mais de uma vez na mesma proposta");
    paths.add(change.fieldPath);
    for (const id of change.evidenceIds) {
      if (!known.has(id)) issue(["changes", index, "evidenceIds"], `evidência ${id} não consta na proposta`);
    }
  });
});
export type CaseUpdateProposalV1 = z.infer<typeof caseUpdateProposalV1Schema>;
