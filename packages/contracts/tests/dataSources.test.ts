import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import type { ZodTypeAny } from "zod";
import {
  DATA_SOURCE_CATALOG_V1,
  DATA_SOURCE_ACCESS_MODES,
  ORACULO_DECISION_VALUES,
  caseUpdateProposalV1Schema as proposalSchema,
  checkConnectionAgainstSource,
  collectionResultV1Schema as resultSchema,
  dataSourceConnectionV1Schema as connectionSchema,
  dataSourceV1Schema as sourceSchema,
  findDataSource,
  isConnectionVisibleInScope,
  listUnverifiedDataSourceMetadata,
  originEvidenceV1Schema as evidenceSchema,
  validateDataSourceCatalog,
} from "../src/index.js";

// ---- Fixtures 100% sintéticas: nenhum dado operacional, parceiro, credencial ou endpoint real. ----
const T0 = "2026-11-03T12:00:00.000Z";
const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const UNKNOWN = { status: "unknown" } as const;
const declared = (value: unknown) => ({ status: "declared", value, basis: "synthetic fixture" });
const verified = (value: unknown) => ({ status: "verified", value, basis: "synthetic fixture", verifiedAt: T0, verifiedBy: "synthetic-reviewer" });
type Parsable = ZodTypeAny;
const omit = (obj: object, key: string): Record<string, unknown> => Object.fromEntries(Object.entries(obj).filter(([k]) => k !== key));
const ok = (schema: Parsable, value: unknown, label = "") => assert.equal(schema.safeParse(value).success, true, `deveria ser válido ${label}`);
const bad = (schema: Parsable, value: unknown, label = "") => assert.equal(schema.safeParse(value).success, false, `deveria ser inválido ${label}`);
const issuePaths = (schema: Parsable, value: unknown) =>
  (schema.safeParse(value).error?.issues ?? []).map((i) => i.path.join("."));

const source = (over: Record<string, unknown> = {}) => ({
  schemaVersion: "eiah.data-source.v1",
  sourceId: "synthetic.open-api",
  sourceVersion: 1,
  provider: "Synthetic Provider",
  purpose: "Synthetic purpose",
  domain: "other",
  coverage: UNKNOWN,
  supportedAccessModes: declared(["open_api"]),
  documentation: UNKNOWN,
  licenseTerms: UNKNOWN,
  usageCondition: "not_assessed",
  expectedUpdateFrequency: UNKNOWN,
  knownLimits: UNKNOWN,
  steward: UNKNOWN,
  lifecycleState: "mapped",
  authorizationGranted: false,
  ...over,
});
const fullyVerifiedSource = (over: Record<string, unknown> = {}) => source({
  coverage: verified("synthetic coverage"),
  supportedAccessModes: verified([...DATA_SOURCE_ACCESS_MODES]),
  documentation: verified([{ kind: "official_documentation", title: "Synthetic docs", url: "https://example.invalid/docs" }]),
  licenseTerms: verified({ license: "synthetic-license" }),
  usageCondition: "permitted_with_conditions",
  expectedUpdateFrequency: verified("daily"),
  knownLimits: verified([{ kind: "rate_limit", description: "synthetic" }]),
  steward: verified("synthetic-steward"),
  ...over,
});

const ENDPOINT = { registeredUrl: "https://example.invalid/v1", grantsNetworkPermission: false, destinationPolicy: "validated_by_executor" };
const TENANT_SCOPE = { kind: "tenant_workspace", tenantId: "tenant-synthetic-A", workspaceId: "workspace-synthetic-A1" };
const CREDREF = "credref:synthetic-0001";
const CONFIGS: Record<string, Record<string, unknown>> = {
  open_api: { mode: "open_api", endpoint: ENDPOINT },
  authenticated_api: { mode: "authenticated_api", endpoint: ENDPOINT, authScheme: "api_key", credentialRef: CREDREF },
  data_file: { mode: "data_file", expectedFormat: "json", origin: { kind: "tenant_upload" } },
  private_api: { mode: "private_api", supplierRef: "supplier-synthetic-1", endpoint: ENDPOINT, authScheme: "bearer_token", credentialRef: CREDREF },
  channel_message: { mode: "channel_message", channel: "whatsapp", direction: "inbound", acceptsAttachments: true, channelBindingRef: "binding-synthetic-1", caseBinding: "required" },
  manual_entry: { mode: "manual_entry", entryAuthority: "authorized_human", requiredScope: "synthetic.scope.write" },
};
const connection = (config: Record<string, unknown>, over: Record<string, unknown> = {}) => ({
  schemaVersion: "eiah.data-source-connection.v1",
  connectionId: "synthetic.conn-1",
  sourceId: "synthetic.open-api",
  sourceVersion: 1,
  scope: TENANT_SCOPE,
  config,
  configuration: "incomplete",
  enablement: { status: "disabled" },
  suspension: { status: "not_suspended" },
  accessPolicyRef: { kind: "none_declared" },
  authorizationGranted: false,
  ...over,
});

const evidence = (over: Record<string, unknown> = {}) => ({
  schemaVersion: "eiah.origin-evidence.v1",
  evidenceId: "ev-1",
  origin: { kind: "system_obtained", sourceId: "synthetic.open-api", obtainedAt: T0, publisherStatus: "official" },
  contentSha256: SHA_A,
  validation: { status: "not_validated" },
  approval: { status: "not_requested" },
  operationalAuthorization: false,
  ...over,
});

const dates = (over: Record<string, unknown> = {}) => ({
  collectedAt: T0,
  referenceDate: { status: "known", value: "2026-11-03" },
  publishedAt: UNKNOWN,
  validFrom: UNKNOWN,
  validUntil: UNKNOWN,
  ...over,
});
const resultBase = (over: Record<string, unknown> = {}) => ({
  schemaVersion: "eiah.collection-result.v1",
  resultId: "res-1",
  sourceId: "synthetic.open-api",
  sourceVersion: 1,
  contentSchemaVersion: "synthetic.content.v1",
  scope: { kind: "shared" },
  dates: dates(),
  warnings: [],
  ...over,
});
const original = { sha256: SHA_A, byteLength: 10, mediaType: "application/json", storage: { status: "preserved", ref: "storage:synthetic/1" } };
const transformation = { transformId: "synthetic.normalizer", transformVersion: "1", inputSha256: SHA_A, outputSha256: SHA_B, deterministic: true };
const success = (over: Record<string, unknown> = {}) => resultBase({
  outcome: "success",
  content: { kind: "inline", records: [{ externalId: { status: "known", value: "X-1" }, data: { code: "0000.00.00", description: "synthetic" } }] },
  origin: evidence(),
  evidence: { original, transformation },
  ...over,
});
const empty = (over: Record<string, unknown> = {}) => resultBase({ outcome: "empty", emptyReason: "no_matching_records", origin: evidence(), evidence: { original }, ...over });
const failure = (over: Record<string, unknown> = {}) => resultBase({ outcome: "failure", error: { code: "timeout", message: "tempo esgotado", retryable: true }, ...over });

const proposal = (over: Record<string, unknown> = {}) => ({
  schemaVersion: "eiah.case-update-proposal.v1",
  proposalId: "prop-1",
  caseId: "case-synthetic-1",
  caseType: "SYNTHETIC_CASE_TYPE",
  tenantId: "tenant-synthetic-A",
  workspaceId: "workspace-synthetic-A1",
  expectedRevision: 3,
  changes: [{ fieldPath: "context.port", operation: "set", proposedValue: "synthetic-port", evidenceIds: ["ev-1"] }],
  evidence: [{ evidenceId: "ev-1", contentSha256: SHA_A }],
  proposedBy: { kind: "system", ref: "synthetic-collector" },
  proposedAt: T0,
  state: "proposed",
  caseMutationApplied: false,
  operationalAuthorization: false,
  ...over,
});

// ---------------------------------------------------------------------------------------------------------
test("A) fonte: contrato válido com metadados desconhecidos, declarados e verificados", () => {
  ok(sourceSchema, source(), "todos desconhecidos");
  ok(sourceSchema, fullyVerifiedSource(), "todos verificados");
  for (const mode of DATA_SOURCE_ACCESS_MODES) ok(sourceSchema, source({ supportedAccessModes: declared([mode]) }), `modalidade ${mode}`);
});

test("A) fonte: campo desconhecido precisa ser explícito; omissão e declaração sem base são inválidas", () => {
  for (const field of ["coverage", "supportedAccessModes", "documentation", "licenseTerms", "expectedUpdateFrequency", "knownLimits", "steward"]) {
    const rest = omit(source(), field);
    bad(sourceSchema, rest, `omissão de ${field}`);
  }
  bad(sourceSchema, source({ coverage: { status: "declared", value: "x" } }), "declared sem basis");
  bad(sourceSchema, source({ coverage: { status: "verified", value: "x", basis: "b" } }), "verified sem quem/quando");
  bad(sourceSchema, source({ documentation: declared([]) }), "lista vazia não é conhecimento");
  bad(sourceSchema, source({ knownLimits: declared([]) }), "'sem limites' não pode ser inferido de lista vazia");
  bad(sourceSchema, source({ supportedAccessModes: declared(["open_api", "open_api"]) }), "modalidades duplicadas");
  bad(sourceSchema, source({ supportedAccessModes: declared(["soap"]) }), "modalidade fora do vocabulário");
});

test("A) fonte: strict — sem confiança numérica, segredo ou campo extra; versão e id inválidos", () => {
  bad(sourceSchema, source({ confidence: 0.9 }), "número de confiança não substitui evidência");
  bad(sourceSchema, source({ apiKey: "x" }), "segredo");
  bad(sourceSchema, source({ sourceVersion: 0 }));
  bad(sourceSchema, source({ sourceId: "Has Spaces" }));
  bad(sourceSchema, source({ sourceId: "ab" }));
  bad(sourceSchema, source({ documentation: declared([{ kind: "official_documentation", title: "t", url: "http://example.invalid/docs" }]) }), "http não é aceito");
  bad(sourceSchema, source({ documentation: declared([{ kind: "official_documentation", title: "t", url: "https://example.invalid/docs?api_key=x" }]) }), "query string pode carregar segredo");
});

test("A) fonte: modalidade, estado técnico, condição de uso e autorização são conceitos separados", () => {
  bad(sourceSchema, source({ authorizationGranted: true }), "fonte nunca concede autorização");
  // Ativa/validada exige verificação, mas MESMO ASSIM não concede autorização.
  const active = sourceSchema.parse(fullyVerifiedSource({ lifecycleState: "active" }));
  assert.equal(active.authorizationGranted, false);
  for (const lifecycleState of ["validated", "active"]) {
    const paths = issuePaths(sourceSchema, source({ lifecycleState }));
    for (const expected of ["licenseTerms", "documentation", "supportedAccessModes", "usageCondition"]) {
      assert.ok(paths.includes(expected), `${lifecycleState} sem ${expected} verificado deveria falhar: ${paths}`);
    }
  }
  bad(sourceSchema, fullyVerifiedSource({ lifecycleState: "active", usageCondition: "denied" }), "ativa com uso negado");
  bad(sourceSchema, fullyVerifiedSource({ lifecycleState: "active", usageCondition: "not_assessed" }), "ativa sem avaliar condição de uso");
  bad(sourceSchema, fullyVerifiedSource({ lifecycleState: "active", documentation: declared([{ kind: "other", title: "t", url: "https://example.invalid/d" }]) }), "documentação só declarada");
  for (const lifecycleState of ["mapped", "configuring", "testing", "suspended"]) ok(sourceSchema, source({ lifecycleState }), lifecycleState);
});

// ---------------------------------------------------------------------------------------------------------
test("catálogo inicial: 4 fontes mapeadas, sem ativação, sem autorização, metadados não verificados", () => {
  assert.deepEqual(DATA_SOURCE_CATALOG_V1.map((s) => s.sourceId), ["receita.classif.ncm", "ibge.localidades", "bcb.ptax", "mdic.comexstat"]);
  assert.deepEqual(validateDataSourceCatalog(DATA_SOURCE_CATALOG_V1), { ok: true, issues: [] });
  for (const entry of DATA_SOURCE_CATALOG_V1) {
    assert.equal(entry.lifecycleState, "mapped", `${entry.sourceId} não pode nascer ativa`);
    assert.equal(entry.authorizationGranted, false);
    assert.equal(entry.usageCondition, "not_assessed");
    // Nada foi preenchido de memória: documentação, licença, periodicidade, limites, cobertura e responsável seguem desconhecidos.
    for (const field of ["coverage", "documentation", "licenseTerms", "expectedUpdateFrequency", "knownLimits", "steward"] as const) {
      assert.deepEqual(entry[field], UNKNOWN, `${entry.sourceId}.${field}`);
    }
    assert.equal(entry.supportedAccessModes.status, "declared", "modalidade é intenção declarada, não verificada");
    assert.deepEqual(listUnverifiedDataSourceMetadata(entry), ["coverage", "supportedAccessModes", "documentation", "licenseTerms", "expectedUpdateFrequency", "knownLimits", "steward", "usageCondition"]);
  }
  const ncm = findDataSource("receita.classif.ncm");
  assert.deepEqual(ncm?.supportedAccessModes.status === "declared" ? ncm.supportedAccessModes.value : null, ["open_api", "data_file"]);
});

test("catálogo: fonte desconhecida → null; id duplicado e entrada inválida são detectados; não há parceiro cadastrado", () => {
  assert.equal(findDataSource("nao.existe"), null);
  assert.equal(findDataSource(""), null);
  const duplicated = validateDataSourceCatalog([source(), source()]);
  assert.equal(duplicated.ok, false);
  assert.deepEqual(duplicated.issues.map((i) => i.code), ["DUPLICATE_SOURCE_ID"]);
  const invalid = validateDataSourceCatalog([source(), source({ sourceId: "synthetic.other", authorizationGranted: true }), "lixo", null]);
  assert.deepEqual(invalid.issues.map((i) => [i.code, i.index]), [["INVALID_ENTRY", 1], ["INVALID_ENTRY", 2], ["INVALID_ENTRY", 3]]);
  assert.ok(DATA_SOURCE_CATALOG_V1.every((s) => !s.supportedAccessModes || s.supportedAccessModes.status !== "verified"));
  for (const entry of DATA_SOURCE_CATALOG_V1) {
    const modes = entry.supportedAccessModes.status === "unknown" ? [] : entry.supportedAccessModes.value;
    assert.ok(modes.every((m) => m === "open_api" || m === "data_file"), "nenhuma fonte autenticada/privada/de canal pré-cadastrada");
  }
});

test("catálogo é imutável e o módulo não tem efeito colateral (sem rede, ambiente, timers ou segredos)", () => {
  assert.throws(() => { (DATA_SOURCE_CATALOG_V1 as unknown as unknown[]).push({}); }, TypeError);
  assert.throws(() => { (DATA_SOURCE_CATALOG_V1[0] as { lifecycleState: string }).lifecycleState = "active"; }, TypeError);
  for (const file of ["dataSources.ts", "dataSourceCatalog.ts"]) {
    const code = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(code, /\bfetch\s*\(|process\.env|node:(?:http|https|net|child_process|fs)|XMLHttpRequest|WebSocket|setInterval|setTimeout|require\(/, `${file} deve ser puro`);
    const specifiers = [...code.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
    assert.ok(specifiers.length > 0);
    assert.ok(specifiers.every((s) => s === "zod" || s.startsWith("./")), `${file} só importa zod e módulos locais: ${specifiers}`);
  }
});

// ---------------------------------------------------------------------------------------------------------
test("B) conexão: contrato válido para cada modalidade preparada", () => {
  for (const mode of DATA_SOURCE_ACCESS_MODES) ok(connectionSchema, connection(CONFIGS[mode]), mode);
  ok(connectionSchema, connection(CONFIGS.open_api, { scope: { kind: "shared" } }), "fonte aberta compartilhada");
  ok(connectionSchema, connection({ mode: "data_file", expectedFormat: "csv", origin: { kind: "public_download", endpoint: ENDPOINT } }), "arquivo por download público");
  ok(connectionSchema, connection({ mode: "data_file", expectedFormat: "xml", origin: { kind: "platform_import" } }), "arquivo importado pela plataforma");
});

test("B) conexão: configuração incompatível com a modalidade é rejeitada", () => {
  bad(connectionSchema, connection({ ...CONFIGS.open_api, credentialRef: CREDREF }), "API aberta não carrega credencial");
  bad(connectionSchema, connection({ ...CONFIGS.authenticated_api, supplierRef: "x" }), "autenticada com campo de privada");
  bad(connectionSchema, connection({ ...CONFIGS.private_api, channel: "whatsapp" }), "privada com campo de canal");
  bad(connectionSchema, connection({ mode: "data_file", expectedFormat: "json", origin: { kind: "tenant_upload" }, endpoint: ENDPOINT }), "arquivo com endpoint solto");
  bad(connectionSchema, connection({ mode: "data_file", expectedFormat: "json", origin: { kind: "public_download" } }), "download público sem destino");
  bad(connectionSchema, connection({ mode: "data_file", expectedFormat: "exe", origin: { kind: "tenant_upload" } }), "formato fora do vocabulário");
  bad(connectionSchema, connection({ ...CONFIGS.channel_message, direction: "outbound" }), "saída de canal não está preparada");
  bad(connectionSchema, connection({ ...CONFIGS.channel_message, channel: "telegram" }));
  bad(connectionSchema, connection({ ...CONFIGS.channel_message, caseBinding: "optional" }), "canal exige vínculo a caso");
  bad(connectionSchema, connection({ ...CONFIGS.manual_entry, entryAuthority: "anyone" }));
  bad(connectionSchema, connection({ mode: "soap", endpoint: ENDPOINT }), "modalidade desconhecida");
  bad(connectionSchema, connection({ endpoint: ENDPOINT }), "sem modalidade");
});

test("B) conexão: nenhum segredo no contrato; URL cadastrada não concede permissão de rede", () => {
  for (const key of ["apiKey", "token", "password", "secret", "clientSecret", "authorization"]) {
    bad(connectionSchema, connection({ ...CONFIGS.authenticated_api, [key]: "valor" }), `campo ${key}`);
    bad(connectionSchema, { ...connection(CONFIGS.open_api), [key]: "valor" }, `campo ${key} na raiz`);
  }
  bad(connectionSchema, connection({ ...CONFIGS.authenticated_api, credentialRef: "sk-live-abcdefghijklmnop" }), "segredo colado como referência");
  bad(connectionSchema, connection({ ...CONFIGS.authenticated_api, credentialRef: "Bearer abcdefgh12345678" }));
  bad(connectionSchema, connection({ ...CONFIGS.authenticated_api, credentialRef: "credref:short" }), "referência curta demais");
  for (const registeredUrl of ["http://example.invalid/v1", "https://user:pw@example.invalid/v1", "https://example.invalid/v1?api_key=abc", "https://example.invalid/v1#frag", "ftp://example.invalid/x", "not a url"]) {
    bad(connectionSchema, connection({ mode: "open_api", endpoint: { ...ENDPOINT, registeredUrl } }), registeredUrl);
  }
  bad(connectionSchema, connection({ mode: "open_api", endpoint: { ...ENDPOINT, grantsNetworkPermission: true } }), "URL cadastrada não autoriza requisição");
  bad(connectionSchema, connection({ mode: "open_api", endpoint: { ...ENDPOINT, destinationPolicy: "allow_any" } }), "política de destino é do executor");
  const withoutFlag = omit(ENDPOINT, "grantsNetworkPermission");
  bad(connectionSchema, connection({ mode: "open_api", endpoint: withoutFlag }), "flag explícita é obrigatória");
});

test("B) conexão: referência de credencial ausente quando exigida", () => {
  for (const mode of ["authenticated_api", "private_api"]) {
    const withoutRef = omit(CONFIGS[mode], "credentialRef");
    ok(connectionSchema, connection(withoutRef, { configuration: "incomplete" }), `${mode} incompleta sem credencial é rascunho válido`);
    bad(connectionSchema, connection(withoutRef, { configuration: "complete" }), `${mode} completa sem credencial`);
    assert.ok(issuePaths(connectionSchema, connection(withoutRef, { configuration: "complete" })).includes("config.credentialRef"));
    ok(connectionSchema, connection(CONFIGS[mode], { configuration: "complete" }), `${mode} completa com referência`);
  }
  ok(connectionSchema, connection(CONFIGS.open_api, { configuration: "complete" }), "API aberta não exige credencial");
});

test("B) conexão: isolamento e escopo tenant/workspace", () => {
  bad(connectionSchema, connection(CONFIGS.open_api, { scope: { kind: "tenant_workspace", tenantId: "t" } }), "falta workspace");
  bad(connectionSchema, connection(CONFIGS.open_api, { scope: { kind: "tenant_workspace", workspaceId: "w" } }), "falta tenant");
  bad(connectionSchema, connection(CONFIGS.open_api, { scope: { kind: "shared", tenantId: "t", workspaceId: "w" } }), "shared não carrega tenant");
  bad(connectionSchema, connection(CONFIGS.open_api, { scope: { kind: "global" } }));
  bad(connectionSchema, connection(CONFIGS.open_api, { scope: undefined }), "escopo obrigatório");
  for (const mode of ["private_api", "channel_message", "manual_entry"]) {
    bad(connectionSchema, connection(CONFIGS[mode], { scope: { kind: "shared" } }), `${mode} não pode ser compartilhada`);
    assert.ok(issuePaths(connectionSchema, connection(CONFIGS[mode], { scope: { kind: "shared" } })).includes("scope"));
  }
  const tenantConn = connectionSchema.parse(connection(CONFIGS.open_api));
  const sharedConn = connectionSchema.parse(connection(CONFIGS.open_api, { scope: { kind: "shared" } }));
  assert.equal(isConnectionVisibleInScope(tenantConn, { tenantId: "tenant-synthetic-A", workspaceId: "workspace-synthetic-A1" }), true);
  assert.equal(isConnectionVisibleInScope(tenantConn, { tenantId: "tenant-synthetic-B", workspaceId: "workspace-synthetic-A1" }), false, "outro tenant");
  assert.equal(isConnectionVisibleInScope(tenantConn, { tenantId: "tenant-synthetic-A", workspaceId: "workspace-synthetic-A2" }), false, "outro workspace");
  assert.equal(isConnectionVisibleInScope(sharedConn, { tenantId: "tenant-synthetic-B", workspaceId: "w" }), true);
  for (const caller of [{}, { tenantId: "t" }, { workspaceId: "w" }, { tenantId: null, workspaceId: "w" }, { tenantId: "t", workspaceId: "" }]) {
    assert.equal(isConnectionVisibleInScope(tenantConn, caller), false, JSON.stringify(caller));
    assert.equal(isConnectionVisibleInScope(sharedConn, caller), false, `fail-closed até para shared: ${JSON.stringify(caller)}`);
  }
});

test("B) conexão: configuração, habilitação e suspensão são estados separados; habilitar não autoriza", () => {
  const policy = { kind: "tenant_action_policy", ref: "synthetic-policy-1" };
  const enabled = { status: "enabled", enabledBy: "synthetic-admin", enabledAt: T0 };
  const suspended = { status: "suspended", reason: "synthetic", suspendedBy: "synthetic-admin", suspendedAt: T0 };
  ok(connectionSchema, connection(CONFIGS.open_api, { configuration: "complete", enablement: enabled, accessPolicyRef: policy }), "habilitada");
  bad(connectionSchema, connection(CONFIGS.open_api, { configuration: "incomplete", enablement: enabled, accessPolicyRef: policy }), "habilitar exige configuração completa");
  bad(connectionSchema, connection(CONFIGS.open_api, { configuration: "complete", enablement: enabled }), "habilitar exige política de acesso referenciada");
  bad(connectionSchema, connection(CONFIGS.open_api, { configuration: "complete", enablement: enabled, accessPolicyRef: policy, suspension: suspended }), "suspensa não pode estar habilitada");
  ok(connectionSchema, connection(CONFIGS.open_api, { configuration: "complete", enablement: { status: "disabled" }, accessPolicyRef: policy, suspension: suspended }), "suspensa e desabilitada");
  bad(connectionSchema, connection(CONFIGS.open_api, { suspension: { status: "suspended" } }), "suspensão exige motivo, autor e instante");
  bad(connectionSchema, connection(CONFIGS.open_api, { enablement: { status: "enabled" } }), "habilitação exige autor e instante");
  bad(connectionSchema, connection(CONFIGS.open_api, { accessPolicyRef: { kind: "imob_market_source_registry", ref: "x" } }), "não referencia o registro do IMOB");
  bad(connectionSchema, connection(CONFIGS.open_api, { authorizationGranted: true }), "conexão nunca concede autorização");
  const parsed = connectionSchema.parse(connection(CONFIGS.open_api, { configuration: "complete", enablement: enabled, accessPolicyRef: policy }));
  assert.equal(parsed.authorizationGranted, false, "habilitada continua sem autorização própria");
});

test("B) conexão×fonte: compatibilidade estrutural (não é decisão de acesso)", () => {
  const src = sourceSchema.parse(source({ supportedAccessModes: declared(["open_api", "data_file"]) }));
  const conn = (config: Record<string, unknown>, over: Record<string, unknown> = {}) => connectionSchema.parse(connection(config, over));
  assert.deepEqual(checkConnectionAgainstSource(conn(CONFIGS.open_api), src), []);
  assert.deepEqual(checkConnectionAgainstSource(conn(CONFIGS.data_file), src), []);
  assert.deepEqual(checkConnectionAgainstSource(conn(CONFIGS.private_api), src), ["ACCESS_MODE_NOT_SUPPORTED_BY_SOURCE"]);
  assert.deepEqual(checkConnectionAgainstSource(conn(CONFIGS.open_api, { sourceId: "synthetic.other" }), src), ["SOURCE_ID_MISMATCH"]);
  assert.deepEqual(checkConnectionAgainstSource(conn(CONFIGS.open_api, { sourceVersion: 2 }), src), ["SOURCE_VERSION_MISMATCH"]);
  const unknownModes = sourceSchema.parse(source({ supportedAccessModes: UNKNOWN }));
  assert.deepEqual(checkConnectionAgainstSource(conn(CONFIGS.open_api), unknownModes), ["SOURCE_ACCESS_MODES_UNKNOWN"], "modalidades desconhecidas não equivalem a 'qualquer uma'");
});

// ---------------------------------------------------------------------------------------------------------
test("D) evidência de origem: três origens distintas, cada uma com campos próprios", () => {
  ok(evidenceSchema, evidence(), "sistema");
  ok(evidenceSchema, evidence({ origin: { kind: "supplier_declared", supplierRef: "supplier-synthetic-1", receivedAt: T0, declaredAt: T0, messageRef: "msg-1" } }), "fornecedor");
  ok(evidenceSchema, evidence({ origin: { kind: "manual_entry", enteredBy: "synthetic-user", enteredAt: T0, entryBasis: "synthetic" } }), "manual");
  bad(evidenceSchema, evidence({ origin: { kind: "supplier_declared", supplierRef: "s", receivedAt: T0, enteredBy: "u" } }), "campo de outra origem");
  bad(evidenceSchema, evidence({ origin: { kind: "system_obtained", sourceId: "synthetic.open-api", obtainedAt: T0 } }), "oficialidade explícita é obrigatória");
  bad(evidenceSchema, evidence({ origin: { kind: "oracle", at: T0 } }));
  bad(evidenceSchema, evidence({ contentSha256: "A".repeat(64) }), "sha256 em minúsculas");
  bad(evidenceSchema, evidence({ contentSha256: "abc" }));
});

test("D) origem oficial/de sistema não implica validação humana nem autorização", () => {
  const official = evidenceSchema.parse(evidence());
  assert.equal(official.origin.kind === "system_obtained" && official.origin.publisherStatus, "official");
  assert.equal(official.validation.status, "not_validated");
  assert.equal(official.approval.status, "not_requested");
  assert.equal(official.operationalAuthorization, false);
  bad(evidenceSchema, evidence({ operationalAuthorization: true }));
  bad(evidenceSchema, evidence({ validation: undefined }), "validação não pode ser omitida");
  bad(evidenceSchema, evidence({ approval: undefined }), "aprovação não pode ser omitida");
  // Campos de validação/aprovação não existem dentro da origem: não há como "herdar" de origin.
  bad(evidenceSchema, evidence({ origin: { kind: "system_obtained", sourceId: "synthetic.open-api", obtainedAt: T0, publisherStatus: "official", validated: true } }));
  bad(evidenceSchema, evidence({ origin: { kind: "system_obtained", sourceId: "synthetic.open-api", obtainedAt: T0, publisherStatus: "official", approved: true } }));
});

test("D) validação e aprovação em campos próprios, com separação de funções", () => {
  const validated = { status: "validated", method: "human_review", validatedBy: "synthetic-reviewer", validatedAt: T0, basisHash: SHA_B };
  const requested = { status: "requested", requestedBy: "synthetic-requester", requestedAt: T0 };
  const decided = (over: Record<string, unknown> = {}) => ({ status: "decided", decision: "approved", requestedBy: "synthetic-requester", decidedBy: "synthetic-decider", decidedAt: T0, note: "synthetic", ...over });
  ok(evidenceSchema, evidence({ validation: validated }), "validada");
  ok(evidenceSchema, evidence({ validation: { status: "rejected", validatedBy: "synthetic-reviewer", validatedAt: T0, reason: "synthetic" } }), "rejeitada");
  bad(evidenceSchema, evidence({ validation: { status: "validated", method: "human_review", validatedBy: "x", validatedAt: T0 } }), "validação sem base hash");
  bad(evidenceSchema, evidence({ validation: { status: "validated", method: "guess", validatedBy: "x", validatedAt: T0, basisHash: SHA_B } }));
  ok(evidenceSchema, evidence({ validation: validated, approval: requested }), "aprovação solicitada");
  ok(evidenceSchema, evidence({ validation: validated, approval: decided() }), "aprovada após validação");
  bad(evidenceSchema, evidence({ approval: decided() }), "aprovação sem validação");
  ok(evidenceSchema, evidence({ approval: decided({ decision: "rejected" }) }), "rejeitar não exige validação");
  ok(evidenceSchema, evidence({ approval: decided({ decision: "more_information" }) }), "pedir mais informação");
  bad(evidenceSchema, evidence({ validation: validated, approval: decided({ decidedBy: "synthetic-requester" }) }), "decisor = solicitante");
  bad(evidenceSchema, evidence({ validation: validated, approval: decided({ decision: "granted" }) }), "vocabulário de decisão do Oráculo");
});

// ---------------------------------------------------------------------------------------------------------
test("C) resultado de coleta: sucesso, vazio, não modificado e falha são explícitos", () => {
  ok(resultSchema, success(), "sucesso inline");
  ok(resultSchema, success({ content: { kind: "reference", contentRef: "storage:synthetic/normalized/1", contentSha256: SHA_B } }), "sucesso por referência");
  ok(resultSchema, empty(), "vazio");
  ok(resultSchema, empty({ emptyReason: "source_returned_empty" }));
  ok(resultSchema, resultBase({ outcome: "not_modified", basedOn: { previousResultId: "res-0", previousContentSha256: SHA_A } }), "não modificado");
  ok(resultSchema, failure(), "falha");
  bad(resultSchema, resultBase({ outcome: "partial" }), "resultado fora do vocabulário");
  bad(resultSchema, resultBase({}), "sem outcome");
});

test("C) vazio ≠ erro: cada resultado só carrega o que lhe pertence", () => {
  bad(resultSchema, success({ content: { kind: "inline", records: [] } }), "sucesso sem registros é 'empty', não 'success'");
  bad(resultSchema, empty({ error: { code: "timeout", message: "x", retryable: true } }), "vazio com erro");
  bad(resultSchema, empty({ content: { kind: "inline", records: [] } }), "vazio com conteúdo");
  bad(resultSchema, failure({ content: { kind: "inline", records: [{ externalId: UNKNOWN, data: {} }] } }), "falha com registros");
  bad(resultSchema, failure({ origin: evidence() }), "falha não carrega origem de conteúdo");
  bad(resultSchema, failure({ emptyReason: "no_matching_records" }));
  const noError = omit(failure(), "error");
  bad(resultSchema, noError, "falha sem erro estruturado");
  bad(resultSchema, empty({ emptyReason: undefined }), "vazio sem motivo");
  bad(resultSchema, resultBase({ outcome: "not_modified" }), "não modificado sem base");
});

test("C) resultado: identidade, versão de esquema e consulta geral (sem caso, sem conexão)", () => {
  const general = resultSchema.parse(success());
  assert.equal("caseRef" in general ? general.caseRef : undefined, undefined);
  assert.equal(general.connectionId, undefined);
  ok(resultSchema, success({ connectionId: "synthetic.conn-1", scope: TENANT_SCOPE }), "com conexão");
  ok(resultSchema, success({ scope: TENANT_SCOPE, caseRef: { caseId: "case-1", tenantId: "tenant-synthetic-A", workspaceId: "workspace-synthetic-A1" } }), "com caso no mesmo escopo");
  for (const field of ["sourceId", "sourceVersion", "contentSchemaVersion", "resultId", "scope"]) {
    const rest = omit(success(), field);
    bad(resultSchema, rest, `sem ${field}`);
  }
  bad(resultSchema, success({ caseRef: { caseId: "case-1", tenantId: "tenant-synthetic-A", workspaceId: "workspace-synthetic-A1" } }), "caso com escopo shared");
  bad(resultSchema, success({ scope: TENANT_SCOPE, caseRef: { caseId: "case-1", tenantId: "tenant-synthetic-B", workspaceId: "workspace-synthetic-A1" } }), "caso de outro tenant");
  bad(resultSchema, success({ scope: TENANT_SCOPE, caseRef: { caseId: "case-1", tenantId: "tenant-synthetic-A", workspaceId: "workspace-synthetic-A2" } }), "caso de outro workspace");
});

test("C) resultado: datas distintas, ausentes ou inválidas", () => {
  ok(resultSchema, success({ dates: dates({ publishedAt: { status: "known", value: "2026-11-02T08:00:00.000Z" }, validFrom: { status: "known", value: "2026-11-01" }, validUntil: { status: "known", value: "2026-12-01" } }) }), "todas conhecidas e distintas");
  ok(resultSchema, success({ dates: dates({ publishedAt: { status: "known", value: "2026-11-02" } }) }), "publicação só com data");
  for (const key of ["referenceDate", "publishedAt", "validFrom", "validUntil"]) {
    const rest = omit(dates(), key);
    bad(resultSchema, success({ dates: rest }), `${key} omitido: ausência precisa ser declarada como unknown`);
  }
  const noCollected = omit(dates(), "collectedAt");
  bad(resultSchema, success({ dates: noCollected }), "instante da coleta é obrigatório");
  bad(resultSchema, success({ dates: dates({ collectedAt: "ontem" }) }));
  bad(resultSchema, success({ dates: dates({ referenceDate: { status: "known", value: "2026-02-30" } }) }), "data inexistente");
  bad(resultSchema, success({ dates: dates({ referenceDate: { status: "known", value: "03/11/2026" } }) }), "formato errado");
  bad(resultSchema, success({ dates: dates({ publishedAt: { status: "known", value: "amanhã" } }) }));
  bad(resultSchema, success({ dates: dates({ validFrom: { status: "known", value: "2026-12-01" }, validUntil: { status: "known", value: "2026-11-01" } }) }), "vigência invertida");
  bad(resultSchema, success({ dates: dates({ referenceDate: { status: "known" } }) }), "known sem valor");
  bad(resultSchema, success({ dates: dates({ referenceDate: { status: "unknown", value: "2026-11-03" } }) }), "unknown com valor");
  bad(resultSchema, success({ dates: dates({ validFrom: "2026-11-01" }) }), "data crua fora da representação explícita");
});

test("C) resultado: evidência do original e da transformação; sem confiança numérica", () => {
  const onlyOriginal = omit((success() as unknown as { evidence: Record<string, unknown> }).evidence, "transformation");
  bad(resultSchema, success({ evidence: onlyOriginal }), "sucesso sem evidência da transformação");
  bad(resultSchema, success({ evidence: { transformation } }), "sucesso sem evidência do original");
  bad(resultSchema, empty({ evidence: { original, transformation } }), "vazio não transforma nada");
  ok(resultSchema, success({ evidence: { original: { ...original, storage: { status: "not_preserved" } }, transformation } }), "não preservar o original é explícito");
  bad(resultSchema, success({ evidence: { original: { ...original, storage: undefined }, transformation } }), "preservação não pode ser omitida");
  bad(resultSchema, success({ evidence: { original: { ...original, sha256: "xyz" }, transformation } }));
  bad(resultSchema, success({ evidence: { original, transformation: { ...transformation, deterministic: undefined } } }));
  bad(resultSchema, success({ origin: evidence({ contentSha256: SHA_B }) }), "hash da origem difere do original");
  bad(resultSchema, success({ origin: evidence({ origin: { kind: "system_obtained", sourceId: "synthetic.other", obtainedAt: T0, publisherStatus: "official" } }) }), "origem de outra fonte");
  bad(resultSchema, success({ confidence: 0.95 }), "número de confiança não substitui evidência");
  bad(resultSchema, success({ confidenceCap: 0.5 }));
  bad(resultSchema, success({ authorized: true }));
});

test("C) resultado: avisos de qualidade/desatualização/divergência e erro estruturado sem segredos", () => {
  ok(resultSchema, success({ warnings: [{ kind: "stale", severity: "warning", message: "última publicação antiga" }, { kind: "divergence", severity: "warning", message: "difere da coleta anterior" }, { kind: "quality", severity: "info", message: "campo vazio" }] }));
  bad(resultSchema, success({ warnings: [{ kind: "confidence_low", severity: "warning", message: "x" }] }));
  bad(resultSchema, success({ warnings: [{ kind: "stale", severity: "fatal", message: "x" }] }));
  ok(resultSchema, failure({ error: { code: "rate_limited", message: "limite atingido", retryable: true, httpStatus: 429 } }));
  bad(resultSchema, failure({ error: { code: "boom", message: "x", retryable: true } }), "código fora do vocabulário");
  bad(resultSchema, failure({ error: { code: "timeout", message: "x", retryable: true, httpStatus: 99 } }));
  bad(resultSchema, failure({ error: { code: "timeout", message: "x", retryable: true, stack: "at foo" } }), "sem stack trace");
  for (const message of ["falhou com Bearer abcdefgh12345678", "api_key=abc123", "password: hunter2", "GET https://example.invalid/x?token=abc123 falhou", "Authorization: abcdef"]) {
    bad(resultSchema, failure({ error: { code: "unauthorized", message, retryable: false } }), message);
  }
});

// ---------------------------------------------------------------------------------------------------------
test("E) proposta de atualização: revisão esperada, evidências e nenhuma aplicação ao caso", () => {
  ok(proposalSchema, proposal(), "proposta mínima");
  ok(proposalSchema, proposal({ changes: [{ fieldPath: "context.port", operation: "set", proposedValue: { nested: ["a", 1, null] }, previousValueSha256: SHA_B, evidenceIds: ["ev-1"] }, { fieldPath: "context.depot", operation: "clear", evidenceIds: ["ev-1"] }] }), "set e clear");
  const noRevision = omit(proposal(), "expectedRevision");
  bad(proposalSchema, noRevision, "sem revisão esperada");
  bad(proposalSchema, proposal({ expectedRevision: 0 }));
  bad(proposalSchema, proposal({ expectedRevision: 1.5 }));
  bad(proposalSchema, proposal({ evidence: [] }), "sem evidências");
  bad(proposalSchema, proposal({ changes: [] }), "sem alterações");
  bad(proposalSchema, proposal({ tenantId: undefined }), "sem tenant");
  bad(proposalSchema, proposal({ workspaceId: undefined }), "sem workspace");
  bad(proposalSchema, proposal({ caseMutationApplied: true }), "esta etapa não aplica ao caso");
  bad(proposalSchema, proposal({ operationalAuthorization: true }));
  bad(proposalSchema, proposal({ apply: true }));
});

test("E) proposta: alterações ligadas a evidências declaradas, sem campos duplicados ou caminhos perigosos", () => {
  bad(proposalSchema, proposal({ changes: [{ fieldPath: "context.port", operation: "set", proposedValue: "x", evidenceIds: ["ev-desconhecida"] }] }), "evidência não declarada");
  bad(proposalSchema, proposal({ changes: [{ fieldPath: "context.port", operation: "set", proposedValue: "x", evidenceIds: [] }] }), "alteração sem evidência");
  bad(proposalSchema, proposal({ changes: [{ fieldPath: "context.port", operation: "set", evidenceIds: ["ev-1"] }] }), "set sem valor");
  bad(proposalSchema, proposal({ changes: [{ fieldPath: "context.port", operation: "clear", proposedValue: "x", evidenceIds: ["ev-1"] }] }), "clear com valor");
  const twice = { fieldPath: "context.port", operation: "set", proposedValue: "x", evidenceIds: ["ev-1"] };
  bad(proposalSchema, proposal({ changes: [twice, twice] }), "mesmo campo duas vezes");
  bad(proposalSchema, proposal({ evidence: [{ evidenceId: "ev-1", contentSha256: SHA_A }, { evidenceId: "ev-1", contentSha256: SHA_B }] }), "evidência duplicada");
  for (const fieldPath of ["", "a b", "__proto__", "constructor.prototype", "context.__proto__.polluted", "context.items[0].constructor", "context.prototype", "context..port", ".port", "context.port;drop", "context[x]"]) {
    bad(proposalSchema, proposal({ changes: [{ fieldPath, operation: "set", proposedValue: "x", evidenceIds: ["ev-1"] }] }), `fieldPath ${JSON.stringify(fieldPath)}`);
  }
  ok(proposalSchema, proposal({ changes: [{ fieldPath: "context.items[0].code", operation: "set", proposedValue: "x", evidenceIds: ["ev-1"] }] }), "índice de lista");
});

test("E) proposta: decisão só por humano, diferente do proponente, vinculada à revisão esperada; reutiliza o vocabulário do Oráculo", () => {
  const decision = (over: Record<string, unknown> = {}) => ({ decision: "approved", note: "synthetic", decidedBy: { kind: "human", ref: "synthetic-human" }, decidedAt: T0, basedOnRevision: 3, basisHash: SHA_B, ...over });
  ok(proposalSchema, proposal({ state: "decided", decision: decision() }), "decidida");
  for (const state of ["proposed", "under_review", "withdrawn"]) ok(proposalSchema, proposal({ state }), state);
  bad(proposalSchema, proposal({ state: "decided" }), "decided sem decisão");
  bad(proposalSchema, proposal({ state: "proposed", decision: decision() }), "decisão com estado proposed");
  bad(proposalSchema, proposal({ state: "decided", decision: decision({ decidedBy: { kind: "system", ref: "synthetic-collector" } }) }), "sistema não decide");
  bad(proposalSchema, proposal({ state: "decided", decision: decision({ decidedBy: { kind: "human", ref: "synthetic-collector" } }) }), "decisor = proponente");
  bad(proposalSchema, proposal({ state: "decided", decision: decision({ basedOnRevision: 2 }) }), "revisão diferente da esperada");
  bad(proposalSchema, proposal({ state: "decided", decision: decision({ basisHash: "x" }) }));
  bad(proposalSchema, proposal({ state: "applied" }), "não há estado 'aplicada' nesta etapa");
  for (const value of ORACULO_DECISION_VALUES) ok(proposalSchema, proposal({ state: "decided", decision: decision({ decision: value }) }), `decisão ${value}`);
  bad(proposalSchema, proposal({ state: "decided", decision: decision({ decision: "granted" }) }), "vocabulário próprio não é aceito");
});
