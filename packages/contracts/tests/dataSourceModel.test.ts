import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { ZodTypeAny } from "zod";
import {
  DATA_PROVIDER_CATEGORIES,
  DATA_SOURCE_ACCESS_MODES,
  DATA_SOURCE_CATALOG_V1,
  DATA_SOURCE_REGISTRY_V2,
  checkAccessConditionsAgainstConnection,
  checkConnectionAgainstSourceV2,
  dataPlatformV1Schema as platformSchema,
  dataProviderV1Schema as providerSchema,
  dataSourceAccessConditionsV1Schema as conditionsSchema,
  dataSourceConnectionV1Schema as connectionSchema,
  dataSourceV1Schema as sourceV1Schema,
  dataSourceV2Schema as sourceSchema,
  listProvidersOfSource,
  listSourcesOfProvider,
  listUnverifiedDataSourceMetadataV2,
  upgradeDataSourceV1ToV2,
  validateDataSourceRegistryV2,
} from "../src/index.js";

// ---- Fixtures 100% sintéticas: nenhuma organização real além das já citadas no catálogo, nenhum dado operacional. ----
const T0 = "2026-11-03T12:00:00.000Z";
const UNKNOWN = { status: "unknown" } as const;
const declared = (value: unknown) => ({ status: "declared", value, basis: "synthetic fixture" });
const verified = (value: unknown) => ({
  status: "verified", value, basis: "synthetic fixture", verifiedAt: T0, verifiedBy: "synthetic-reviewer",
  evidence: { kind: "human_review_record", ref: "synthetic-review-1" },
});
const notApplicable = { status: "not_applicable", justification: "synthetic justification" };
const omit = (obj: object, key: string): Record<string, unknown> => Object.fromEntries(Object.entries(obj).filter(([k]) => k !== key));
const ok = (schema: ZodTypeAny, value: unknown, label = "") => assert.equal(schema.safeParse(value).success, true, `deveria ser válido ${label}`);
const bad = (schema: ZodTypeAny, value: unknown, label = "") => assert.equal(schema.safeParse(value).success, false, `deveria ser inválido ${label}`);
const paths = (schema: ZodTypeAny, value: unknown) => (schema.safeParse(value).error?.issues ?? []).map((i) => i.path.join("."));

const SHARED = { kind: "shared" };
const TENANT_A = { kind: "tenant_workspace", tenantId: "tenant-synthetic-A", workspaceId: "workspace-synthetic-A1" };
const TENANT_B = { kind: "tenant_workspace", tenantId: "tenant-synthetic-B", workspaceId: "workspace-synthetic-B1" };

const provider = (over: Record<string, unknown> = {}) => ({
  schemaVersion: "eiah.data-provider.v1", providerId: "synthetic-provider", displayName: "Synthetic Provider", scope: SHARED,
  categories: declared(["public_body"]), nature: declared("public_sector"), authorizationGranted: false, ...over,
});
const platform = (over: Record<string, unknown> = {}) => ({
  schemaVersion: "eiah.data-platform.v1", platformId: "synthetic.platform", displayName: "Synthetic Platform", scope: SHARED,
  operators: UNKNOWN, modules: UNKNOWN, mappingState: "mapped", authorizationGranted: false, ...over,
});
const source = (over: Record<string, unknown> = {}) => ({
  schemaVersion: "eiah.data-source.v2", sourceId: "synthetic.source", sourceVersion: 1, name: "Synthetic Source", scope: SHARED,
  purpose: "Synthetic purpose", domain: "other", granularity: UNKNOWN, responsibleParties: UNKNOWN, coverage: UNKNOWN,
  informationKinds: UNKNOWN, candidateAccessModes: UNKNOWN, confirmedAccessModes: UNKNOWN, documentation: UNKNOWN,
  authentication: UNKNOWN, licenseTerms: UNKNOWN, reuseConditions: UNKNOWN, usageCondition: "not_assessed", limits: UNKNOWN,
  costs: UNKNOWN, expectedUpdateFrequency: UNKNOWN, steward: UNKNOWN, lifecycleState: "mapped", authorizationGranted: false, ...over,
});
const fullyVerifiedSource = (over: Record<string, unknown> = {}) => source({
  granularity: verified("dataset"),
  responsibleParties: verified([{ providerId: "synthetic-provider", role: "publisher" }]),
  coverage: verified("synthetic coverage"),
  informationKinds: verified(["reference_data"]),
  candidateAccessModes: declared(["open_api"]),
  confirmedAccessModes: verified(["open_api"]),
  documentation: verified([{ kind: "official_documentation", title: "Synthetic docs", url: "https://example.invalid/docs" }]),
  authentication: verified({ requirement: "none" }),
  licenseTerms: verified({ license: "synthetic-license" }),
  reuseConditions: verified({ summary: "synthetic" }),
  usageCondition: "permitted_with_conditions",
  limits: verified([{ kind: "rate_limit", description: "synthetic" }]),
  costs: verified({ model: "free" }),
  expectedUpdateFrequency: verified("daily"),
  steward: verified("synthetic-steward"),
  ...over,
});

const ENDPOINT = { registeredUrl: "https://example.invalid/v1", grantsNetworkPermission: false, destinationPolicy: "validated_by_executor" };
const CREDREF = "credref:synthetic-0001";
const CONFIGS: Record<string, Record<string, unknown>> = {
  open_api: { mode: "open_api", endpoint: ENDPOINT },
  authenticated_api: { mode: "authenticated_api", endpoint: ENDPOINT, authScheme: "api_key", credentialRef: CREDREF },
  data_file: { mode: "data_file", expectedFormat: "json", origin: { kind: "tenant_upload" } },
  private_api: { mode: "private_api", supplierRef: "synthetic-provider", endpoint: ENDPOINT, authScheme: "bearer_token", credentialRef: CREDREF },
  channel_message: { mode: "channel_message", channel: "whatsapp", direction: "inbound", acceptsAttachments: true, channelBindingRef: "binding-synthetic-1", caseBinding: "required" },
  manual_entry: { mode: "manual_entry", entryAuthority: "authorized_human", requiredScope: "synthetic.scope.write" },
};
const connection = (config: Record<string, unknown>, over: Record<string, unknown> = {}) => connectionSchema.parse({
  schemaVersion: "eiah.data-source-connection.v1", connectionId: "synthetic.conn-1", sourceId: "synthetic.source", sourceVersion: 1, scope: TENANT_A,
  config, configuration: "incomplete", enablement: { status: "disabled" }, suspension: { status: "not_suspended" },
  accessPolicyRef: { kind: "none_declared" }, authorizationGranted: false, ...over,
});
const conditions = (over: Record<string, unknown> = {}) => ({
  schemaVersion: "eiah.data-source-access-conditions.v1", connectionId: "synthetic.conn-1", sourceId: "synthetic.source", scope: TENANT_A,
  authentication: UNKNOWN, reuseConditions: UNKNOWN, limits: UNKNOWN, costs: UNKNOWN, expectedUpdateFrequency: UNKNOWN, authorizationGranted: false, ...over,
});

// ---------------------------------------------------------------------------------------------------------
test("compatibilidade v1: os arquivos e o catálogo v1 permanecem exatamente como foram entregues", () => {
  const sha = (file: string) => createHash("sha256").update(readFileSync(new URL(`../src/${file}`, import.meta.url))).digest("hex");
  // Hash do conteúdo v1 entregue na etapa anterior. Alterar o v1 exige decisão consciente: novo schemaVersion + novo valor aqui.
  assert.equal(sha("dataSources.ts"), "6b1e15e407c8002a65d65f53cd15a260ec8db805535db779030ebae457594e7f");
  assert.equal(sha("dataSourceCatalog.ts"), "a148c9de0c1ef8897c306781587c87f2ce4ce562b1fe791de1da25c26f6b4d8d");
  assert.equal(DATA_SOURCE_CATALOG_V1.length, 4);
  assert.deepEqual(DATA_SOURCE_CATALOG_V1.map((s) => s.schemaVersion), Array(4).fill("eiah.data-source.v1"));
  for (const entry of DATA_SOURCE_CATALOG_V1) ok(sourceV1Schema, entry, entry.sourceId);
});

test("compatibilidade v1→v2: as 4 fontes iniciais são preservadas por migração, sem forçar valores", () => {
  const initial = DATA_SOURCE_REGISTRY_V2.sources.slice(0, 4);
  assert.deepEqual(initial.map((s) => s.sourceId), DATA_SOURCE_CATALOG_V1.map((s) => s.sourceId), "mesmos ids, mesma ordem");
  initial.forEach((v2, i) => {
    const v1 = DATA_SOURCE_CATALOG_V1[i];
    assert.equal(v2.sourceVersion, v1.sourceVersion);
    assert.equal(v2.purpose, v1.purpose);
    assert.equal(v2.domain, v1.domain);
    assert.equal(v2.lifecycleState, v1.lifecycleState);
    assert.equal(v2.usageCondition, v1.usageCondition);
    assert.equal(v2.legacyProviderLabel, v1.provider, "rótulo de provedor do v1 preservado como rastro");
    assert.deepEqual(v2.candidateAccessModes, v1.supportedAccessModes, "o v1 'declared' vira candidata, NÃO confirmada");
    assert.deepEqual(v2.confirmedAccessModes, UNKNOWN);
    for (const [a, b] of [["coverage", "coverage"], ["documentation", "documentation"], ["licenseTerms", "licenseTerms"], ["limits", "knownLimits"], ["expectedUpdateFrequency", "expectedUpdateFrequency"], ["steward", "steward"]] as const) {
      assert.deepEqual(v2[a], v1[b], `${v2.sourceId}.${a}`);
    }
    for (const field of ["granularity", "informationKinds", "authentication", "reuseConditions", "costs"] as const) assert.deepEqual(v2[field], UNKNOWN, `${field} segue desconhecido`);
  });
});

test("migração v1→v2 recusa promover fato 'verified' sem evidência da verificação", () => {
  const v1Verified = sourceV1Schema.parse({
    ...DATA_SOURCE_CATALOG_V1[0],
    coverage: { status: "verified", value: "synthetic", basis: "b", verifiedAt: T0, verifiedBy: "someone" },
  });
  assert.deepEqual(upgradeDataSourceV1ToV2(v1Verified, { name: "x" }), { ok: false, reason: "V1_VERIFIED_FACT_WITHOUT_EVIDENCE", field: "coverage" });
  const v1Modes = sourceV1Schema.parse({ ...DATA_SOURCE_CATALOG_V1[0], supportedAccessModes: { status: "verified", value: ["open_api"], basis: "b", verifiedAt: T0, verifiedBy: "someone" } });
  assert.deepEqual(upgradeDataSourceV1ToV2(v1Modes, { name: "x" }), { ok: false, reason: "V1_VERIFIED_FACT_WITHOUT_EVIDENCE", field: "supportedAccessModes" }, "modalidade verificada no v1 não vira 'confirmada' por migração");
});

// ---------------------------------------------------------------------------------------------------------
test("modelo de incerteza: unknown, declared, verified e not_applicable são estados distintos e explícitos", () => {
  ok(sourceSchema, source(), "tudo desconhecido");
  ok(sourceSchema, fullyVerifiedSource(), "tudo verificado");
  ok(sourceSchema, source({ costs: notApplicable, steward: notApplicable }), "não aplicável justificado");
  for (const field of ["coverage", "responsibleParties", "candidateAccessModes", "confirmedAccessModes", "licenseTerms", "authentication", "limits"]) bad(sourceSchema, omit(source(), field), `omissão de ${field}`);
  bad(sourceSchema, source({ coverage: { status: "declared", value: "x" } }), "declared sem base");
  bad(sourceSchema, source({ coverage: { status: "verified", value: "x", basis: "b", verifiedAt: T0, verifiedBy: "p" } }), "verified sem evidência da verificação");
  bad(sourceSchema, source({ coverage: { status: "not_applicable" } }), "não aplicável sem justificativa");
  bad(sourceSchema, source({ coverage: { status: "unknown", value: "x" } }), "unknown não carrega valor");
  bad(sourceSchema, source({ metadataVerified: true }), "não existe booleano único de verificação do cadastro");
  bad(sourceSchema, source({ confidence: 0.9 }));
  bad(sourceSchema, source({ authorizationGranted: true }));
});

test("modalidades candidatas × confirmadas: 'declared' nunca vale como confirmação", () => {
  ok(sourceSchema, source({ candidateAccessModes: declared(["open_api", "data_file"]) }));
  ok(sourceSchema, source({ confirmedAccessModes: verified(["open_api"]) }));
  bad(sourceSchema, source({ confirmedAccessModes: declared(["open_api"]) }), "confirmada só com verificação");
  bad(sourceSchema, source({ candidateAccessModes: declared(["open_api", "open_api"]) }), "duplicadas");
  bad(sourceSchema, source({ candidateAccessModes: declared(["soap"]) }));
  bad(sourceSchema, source({ candidateAccessModes: declared([]) }), "lista vazia não é conhecimento");
  for (const mode of DATA_SOURCE_ACCESS_MODES) ok(sourceSchema, source({ candidateAccessModes: declared([mode]) }), mode);
  const src = sourceSchema.parse(source({ candidateAccessModes: declared(["open_api", "data_file"]) }));
  assert.deepEqual(checkConnectionAgainstSourceV2(connection(CONFIGS.open_api), src), ["ACCESS_MODE_NOT_CONFIRMED"], "candidata ≠ confirmada");
  assert.deepEqual(checkConnectionAgainstSourceV2(connection(CONFIGS.private_api), src), ["ACCESS_MODE_NOT_DECLARED"]);
  const confirmed = sourceSchema.parse(source({ candidateAccessModes: declared(["open_api"]), confirmedAccessModes: verified(["open_api"]) }));
  assert.deepEqual(checkConnectionAgainstSourceV2(connection(CONFIGS.open_api), confirmed), []);
  const unknownModes = sourceSchema.parse(source());
  assert.deepEqual(checkConnectionAgainstSourceV2(connection(CONFIGS.open_api), unknownModes), ["ACCESS_MODES_UNKNOWN"], "desconhecida não equivale a 'qualquer uma'");
});

test("estado mapped sem ativação implícita; ativar exige tudo verificado e ainda assim não autoriza", () => {
  for (const state of ["mapped", "configuring", "testing", "suspended"]) ok(sourceSchema, source({ lifecycleState: state }), state);
  const active = sourceSchema.parse(fullyVerifiedSource({ lifecycleState: "active" }));
  assert.equal(active.authorizationGranted, false);
  for (const lifecycleState of ["validated", "active"]) {
    const p = paths(sourceSchema, source({ lifecycleState }));
    for (const field of ["confirmedAccessModes", "licenseTerms", "documentation", "authentication", "responsibleParties", "granularity", "usageCondition"]) {
      assert.ok(p.includes(field), `${lifecycleState} sem ${field} verificado deveria falhar: ${p}`);
    }
  }
  bad(sourceSchema, fullyVerifiedSource({ lifecycleState: "active", candidateAccessModes: declared(["open_api"]), confirmedAccessModes: declared(["open_api"]) }), "ativa com modalidade só declarada");
  bad(sourceSchema, fullyVerifiedSource({ lifecycleState: "active", usageCondition: "denied" }));
  bad(sourceSchema, fullyVerifiedSource({ lifecycleState: "active", responsibleParties: declared([{ providerId: "synthetic-provider", role: "publisher" }]) }), "responsável só declarado");
  bad(sourceSchema, fullyVerifiedSource({ lifecycleState: "active", granularity: verified("collection_to_select") }), "conjunto ainda a selecionar");
  // regra própria (independente da de active): um conjunto declarado como "a selecionar" não sai de mapped
  for (const lifecycleState of ["configuring", "testing", "validated", "active", "suspended"]) {
    assert.ok(paths(sourceSchema, source({ granularity: declared("collection_to_select"), lifecycleState })).includes("lifecycleState"), `collection_to_select em ${lifecycleState}`);
  }
  ok(sourceSchema, source({ granularity: declared("collection_to_select"), lifecycleState: "mapped" }), "a selecionar permanece mapped");
  ok(sourceSchema, source({ granularity: declared("dataset"), lifecycleState: "configuring" }), "específico pode avançar de estado técnico");
});

test("metadado desconhecido nunca vira aceitação de termos nem autorização", () => {
  bad(sourceSchema, source({ usageCondition: "permitted" }), "uso permitido com licença desconhecida");
  bad(sourceSchema, source({ usageCondition: "permitted_with_conditions", licenseTerms: declared({ license: "x" }) }), "licença só declarada");
  bad(sourceSchema, source({ usageCondition: "permitted_with_conditions", licenseTerms: notApplicable }), "não aplicável não equivale a termos aceitos");
  ok(sourceSchema, source({ usageCondition: "permitted_with_conditions", licenseTerms: verified({ license: "x" }) }));
  ok(sourceSchema, source({ usageCondition: "restricted" }), "restrição pode ser registrada sem licença");
  const unknownEverything = sourceSchema.parse(source());
  assert.equal(unknownEverything.usageCondition, "not_assessed");
  assert.equal(unknownEverything.authorizationGranted, false);
  assert.deepEqual(listUnverifiedDataSourceMetadataV2(unknownEverything), ["granularity", "responsibleParties", "coverage", "informationKinds", "candidateAccessModes", "confirmedAccessModes", "documentation", "authentication", "licenseTerms", "reuseConditions", "limits", "costs", "expectedUpdateFrequency", "steward", "usageCondition"]);
  assert.deepEqual(listUnverifiedDataSourceMetadataV2(sourceSchema.parse(fullyVerifiedSource({ candidateAccessModes: declared(["open_api"]) }))), ["candidateAccessModes"], "declarado segue pendente; verificado e não aplicável não");
  assert.deepEqual(listUnverifiedDataSourceMetadataV2(sourceSchema.parse(source({ costs: notApplicable }))).includes("costs"), false);
});

// ---------------------------------------------------------------------------------------------------------
test("fornecedor: múltiplas categorias, natureza independente, classificação desconhecida ou a confirmar", () => {
  ok(providerSchema, provider());
  ok(providerSchema, provider({ categories: declared(["customs_broker", "cargo_agent", "importer_exporter"]) }), "várias categorias");
  ok(providerSchema, provider({ categories: UNKNOWN, nature: UNKNOWN }), "classificação desconhecida");
  ok(providerSchema, provider({ categories: declared(["public_body"]), nature: declared("private_sector") }), "categoria e natureza são eixos independentes");
  for (const category of DATA_PROVIDER_CATEGORIES) ok(providerSchema, provider({ categories: declared([category]) }), category);
  assert.equal(DATA_PROVIDER_CATEGORIES.length, 13);
  bad(providerSchema, provider({ categories: declared(["public_body", "public_body"]) }), "categoria duplicada");
  bad(providerSchema, provider({ categories: declared(["marketplace"]) }), "categoria fora do vocabulário");
  bad(providerSchema, provider({ categories: declared([]) }));
  bad(providerSchema, provider({ nature: declared("open_api") }), "modalidade não é natureza");
  bad(providerSchema, provider({ categories: declared(["open_api"]) }), "modalidade não é categoria");
  bad(providerSchema, provider({ sources: ["synthetic.source"] }), "o fornecedor não embute fontes (cadastro único)");
  bad(providerSchema, provider({ accessMode: "open_api" }), "o fornecedor não tem modalidade");
  bad(providerSchema, provider({ authorizationGranted: true }));
  ok(providerSchema, provider({ providerId: "supplier-synthetic-1", scope: TENANT_A, categories: declared(["shipping_line"]) }), "fornecedor privado é de um tenant/workspace");
});

test("plataforma ≠ organização ≠ fonte; módulos e operadores por identificar", () => {
  ok(platformSchema, platform());
  ok(platformSchema, platform({ modules: declared([{ moduleId: "synthetic.module-a", displayName: "Módulo A" }]), operators: declared([{ providerId: "synthetic-provider", role: "operator" }]) }));
  bad(platformSchema, platform({ modules: declared([{ moduleId: "m-one", displayName: "A" }, { moduleId: "m-one", displayName: "A" }]) }), "módulo duplicado");
  bad(platformSchema, platform({ mappingState: "active" }), "plataforma nasce mapeada");
  bad(platformSchema, platform({ providerId: "synthetic-provider" }), "plataforma não é fornecedor");
  bad(platformSchema, platform({ categories: declared(["public_body"]) }), "plataforma não tem categoria de fornecedor");
  bad(platformSchema, platform({ candidateAccessModes: declared(["open_api"]) }), "plataforma não é fonte");
  const reg = DATA_SOURCE_REGISTRY_V2;
  assert.deepEqual(reg.platforms.map((p) => p.platformId), ["siscomex.portal-unico"]);
  assert.equal(reg.providers.some((p) => /siscomex|portal/i.test(p.providerId + p.displayName)), false, "Portal Único não é cadastrado como organização");
  assert.equal(reg.sources.some((s) => /siscomex|portal-unico/i.test(s.sourceId)), false, "nem como fonte: módulos ainda a identificar");
  assert.deepEqual([reg.platforms[0].operators, reg.platforms[0].modules], [UNKNOWN, UNKNOWN]);
});

// ---------------------------------------------------------------------------------------------------------
test("autenticação independe da modalidade e do formato; 'sem credencial' não é premissa", () => {
  const authRequired = declared({ requirement: "credential_required", schemes: ["api_key"], registrationRequired: true });
  const authNone = declared({ requirement: "none" });
  // arquivo com credencial; API pública com chave; fornecedor privado sem autenticação
  ok(conditionsSchema, conditions({ authentication: authRequired, credentialRef: CREDREF }), "arquivo (data_file) exigindo credencial");
  ok(conditionsSchema, conditions({ authentication: authRequired }), "API aberta que exige chave/registro");
  ok(conditionsSchema, conditions({ authentication: authNone }), "fornecedor privado sem autenticação");
  ok(conditionsSchema, conditions(), "autenticação desconhecida");
  bad(conditionsSchema, conditions({ authentication: authNone, credentialRef: CREDREF }), "credencial para autenticação none");
  bad(conditionsSchema, conditions({ authentication: declared({ requirement: "none", schemes: ["basic"] }) }));
  bad(conditionsSchema, conditions({ authentication: declared({ requirement: "credential_required", schemes: [] }) }));
  bad(conditionsSchema, conditions({ credentialRef: "sk-live-abcdefghijklmnop" }), "segredo no lugar da referência");
  for (const key of ["apiKey", "token", "password", "secret"]) bad(conditionsSchema, conditions({ [key]: "x" }), key);
  bad(conditionsSchema, conditions({ authorizationGranted: true }));

  const issues = (cond: Record<string, unknown>, conn: ReturnType<typeof connection>) => checkAccessConditionsAgainstConnection(conditionsSchema.parse(cond), conn);
  // arquivo anônimo × arquivo com credencial: mesma modalidade, autenticações diferentes
  const file = connection(CONFIGS.data_file);
  assert.deepEqual(issues(conditions({ authentication: authNone }), file), []);
  assert.deepEqual(issues(conditions({ authentication: authRequired, credentialRef: CREDREF }), connection(CONFIGS.data_file, { configuration: "complete" })), []);
  assert.deepEqual(issues(conditions({ authentication: authRequired }), connection(CONFIGS.data_file, { configuration: "complete" })), ["CREDENTIAL_REQUIRED_BUT_MISSING"]);
  assert.deepEqual(issues(conditions({ authentication: authRequired }), connection(CONFIGS.data_file, { configuration: "incomplete" })), [], "rascunho incompleto ainda não exige");
  assert.deepEqual(issues(conditions({ authentication: authRequired }), connection(CONFIGS.open_api, { configuration: "complete" })), ["CREDENTIAL_REQUIRED_BUT_MISSING"], "API 'aberta' que exige credencial");
  assert.deepEqual(issues(conditions({ authentication: UNKNOWN }), connection(CONFIGS.open_api, { configuration: "complete" })), [], "desconhecido não é exigência nem dispensa");
  assert.deepEqual(issues(conditions({ authentication: authNone }), connection(CONFIGS.private_api, { configuration: "complete" })), [], "privada pode não exigir autenticação");
  // coerência com a configuração v1 existente (que continua inalterada)
  assert.deepEqual(issues(conditions({ authentication: authRequired }), connection(CONFIGS.authenticated_api, { configuration: "complete" })), [], "credencial vem da config v1");
  assert.deepEqual(issues(conditions({ authentication: authRequired, credentialRef: "credref:other-9999" }), connection(CONFIGS.authenticated_api)), ["CREDENTIAL_REF_CONFLICT"]);
  assert.deepEqual(issues(conditions({ authentication: declared({ requirement: "credential_required", schemes: ["mtls"] }) }), connection(CONFIGS.authenticated_api)), ["AUTH_SCHEME_CONFLICT"]);
});

test("conexão tem escopo e condições próprios; várias conexões por fonte sem cruzar escopos", () => {
  const a = connection(CONFIGS.open_api, { connectionId: "synthetic.conn-a", scope: TENANT_A });
  const b = connection(CONFIGS.open_api, { connectionId: "synthetic.conn-b", scope: TENANT_B });
  const shared = connection(CONFIGS.open_api, { connectionId: "synthetic.conn-c", scope: SHARED });
  const src = sourceSchema.parse(source({ candidateAccessModes: declared(["open_api"]), confirmedAccessModes: verified(["open_api"]) }));
  for (const c of [a, b, shared]) assert.deepEqual(checkConnectionAgainstSourceV2(c, src), [], c.connectionId);
  assert.equal(new Set([a, b, shared].map((c) => c.sourceId)).size, 1, "3 conexões da MESMA fonte");
  // condições são por conexão: cada uma tem as suas, e o escopo precisa coincidir com o da conexão
  const own = (conn: ReturnType<typeof connection>, over: Record<string, unknown> = {}) => conditionsSchema.parse(conditions({ connectionId: conn.connectionId, scope: conn.scope, limits: declared([{ kind: "rate_limit", description: conn.connectionId }]), ...over }));
  assert.deepEqual(checkAccessConditionsAgainstConnection(own(a), a), []);
  assert.deepEqual(checkAccessConditionsAgainstConnection(own(b), b), []);
  assert.deepEqual(checkAccessConditionsAgainstConnection(own(a), b), ["CONNECTION_ID_MISMATCH", "SCOPE_MISMATCH"], "condições de A não valem para B");
  assert.deepEqual(checkAccessConditionsAgainstConnection(own(a, { scope: SHARED }), a), ["SCOPE_MISMATCH"]);
  assert.deepEqual(checkAccessConditionsAgainstConnection(own(a, { sourceId: "synthetic.other" }), a), ["SOURCE_ID_MISMATCH"]);
  // fonte de um tenant não é visível a conexão de outro
  const tenantSource = sourceSchema.parse(source({ scope: TENANT_A, candidateAccessModes: declared(["open_api"]), confirmedAccessModes: verified(["open_api"]) }));
  assert.deepEqual(checkConnectionAgainstSourceV2(a, tenantSource), []);
  assert.deepEqual(checkConnectionAgainstSourceV2(b, tenantSource), ["SCOPE_NOT_VISIBLE_TO_CONNECTION"]);
  assert.deepEqual(checkConnectionAgainstSourceV2(shared, tenantSource), ["SCOPE_NOT_VISIBLE_TO_CONNECTION"]);
  // versão/identidade e granularidade
  assert.deepEqual(checkConnectionAgainstSourceV2(connection(CONFIGS.open_api, { sourceVersion: 2 }), src), ["SOURCE_VERSION_MISMATCH"]);
  assert.deepEqual(checkConnectionAgainstSourceV2(connection(CONFIGS.open_api, { sourceId: "synthetic.other" }), src), ["SOURCE_ID_MISMATCH"]);
  const toSelect = sourceSchema.parse(source({ granularity: declared("collection_to_select"), candidateAccessModes: declared(["open_api"]) }));
  assert.ok(checkConnectionAgainstSourceV2(a, toSelect).includes("SOURCE_NOT_SPECIFIC"), "conjunto a selecionar não recebe conexão");
});

// ---------------------------------------------------------------------------------------------------------
test("cardinalidades: fornecedor 1—N fontes, fonte N responsáveis e N modalidades, sem duplicar cadastros", () => {
  const registry = {
    providers: [provider({ providerId: "p-one", categories: declared(["customs_broker", "cargo_agent"]) }), provider({ providerId: "p-two", categories: declared(["software_or_data_provider"]) })],
    platforms: [platform({ operators: declared([{ providerId: "p-two", role: "operator" }]), modules: declared([{ moduleId: "mod-a", displayName: "A" }, { moduleId: "mod-b", displayName: "B" }]) })],
    sources: [
      source({ sourceId: "src.one", responsibleParties: declared([{ providerId: "p-one", role: "publisher" }, { providerId: "p-two", role: "operator" }]), candidateAccessModes: declared(["open_api", "data_file", "authenticated_api"]), platform: { platformId: "synthetic.platform", module: declared("mod-a") } }),
      source({ sourceId: "src.two", responsibleParties: declared([{ providerId: "p-one", role: "data_owner" }]), platform: { platformId: "synthetic.platform", module: declared("mod-b") } }),
    ],
  };
  assert.deepEqual(validateDataSourceRegistryV2(registry), { ok: true, issues: [] });
  const parsed = { providers: registry.providers.map((p) => providerSchema.parse(p)), platforms: registry.platforms.map((p) => platformSchema.parse(p)), sources: registry.sources.map((s) => sourceSchema.parse(s)) };
  assert.deepEqual(listSourcesOfProvider(parsed, "p-one").map((s) => s.sourceId), ["src.one", "src.two"], "um fornecedor, duas fontes");
  assert.deepEqual(listSourcesOfProvider(parsed, "p-two").map((s) => s.sourceId), ["src.one"]);
  assert.deepEqual(listProvidersOfSource(parsed, "src.one").map((p) => p.providerId), ["p-one", "p-two"], "uma fonte, dois responsáveis com papéis distintos");
  assert.equal(parsed.providers.length, 2, "nenhum fornecedor criado para representar categoria ou fonte");
  assert.equal(parsed.providers[0].categories.status === "declared" && parsed.providers[0].categories.value.length, 2);
  assert.equal(parsed.sources[0].candidateAccessModes.status === "declared" && parsed.sources[0].candidateAccessModes.value.length, 3, "uma fonte, três modalidades");
  bad(sourceSchema, source({ responsibleParties: declared([{ providerId: "p-one", role: "publisher" }, { providerId: "p-one", role: "publisher" }]) }), "parte duplicada");
  ok(sourceSchema, source({ responsibleParties: declared([{ providerId: "p-one", role: "publisher" }, { providerId: "p-one", role: "operator" }]) }), "o mesmo fornecedor pode ter papéis distintos");
  bad(sourceSchema, source({ responsibleParties: declared([{ providerId: "p-one", role: "owner" }]) }), "papel fora do vocabulário");
  bad(sourceSchema, source({ responsibleParties: declared([{ providerId: "p-one", role: "publisher", share: 100 }]) }), "sem propriedade institucional única/percentual");
});

test("registro: identificadores duplicados, referências inexistentes e violações de escopo", () => {
  const base = () => ({ providers: [provider()], platforms: [platform()], sources: [source()] });
  assert.deepEqual(validateDataSourceRegistryV2(base()), { ok: true, issues: [] });
  const codes = (r: { providers: unknown[]; platforms: unknown[]; sources: unknown[] }) => validateDataSourceRegistryV2(r).issues.map((i) => `${i.code}:${i.entity}`);
  assert.deepEqual(codes({ ...base(), providers: [provider(), provider()] }), ["DUPLICATE_ID:provider"]);
  assert.deepEqual(codes({ ...base(), platforms: [platform(), platform()] }), ["DUPLICATE_ID:platform"]);
  assert.deepEqual(codes({ ...base(), sources: [source(), source()] }), ["DUPLICATE_ID:source"]);
  assert.deepEqual(codes({ ...base(), sources: [source({ responsibleParties: declared([{ providerId: "ghost", role: "publisher" }]) })] }), ["UNKNOWN_PROVIDER_REF:source"]);
  assert.deepEqual(codes({ ...base(), platforms: [platform({ operators: declared([{ providerId: "ghost", role: "operator" }]) })] }), ["UNKNOWN_PROVIDER_REF:platform"]);
  assert.deepEqual(codes({ ...base(), sources: [source({ platform: { platformId: "ghost.platform", module: UNKNOWN } })] }), ["UNKNOWN_PLATFORM_REF:source"]);
  const withModules = { providers: [provider()], platforms: [platform({ modules: declared([{ moduleId: "mod-a", displayName: "A" }]) })] };
  assert.deepEqual(codes({ ...withModules, sources: [source({ platform: { platformId: "synthetic.platform", module: declared("mod-z") } })] }), ["UNKNOWN_PLATFORM_MODULE:source"]);
  assert.deepEqual(codes({ ...withModules, sources: [source({ platform: { platformId: "synthetic.platform", module: declared("mod-a") } })] }), []);
  assert.deepEqual(codes({ ...base(), sources: [source({ platform: { platformId: "synthetic.platform", module: declared("mod-z") } })] }), [], "módulos da plataforma desconhecidos: não dá para refutar");
  assert.deepEqual(codes({ providers: [provider()], platforms: [], sources: [source({ platform: { platformId: "x.platform", module: UNKNOWN } }), "lixo", null] }), ["INVALID_ENTRY:source", "INVALID_ENTRY:source", "UNKNOWN_PLATFORM_REF:source"]);
  // escopo
  const tenantProvider = provider({ providerId: "tenant-supplier", scope: TENANT_A });
  const refTo = (providerId: string) => declared([{ providerId, role: "publisher" }]);
  assert.deepEqual(codes({ providers: [tenantProvider], platforms: [], sources: [source({ scope: SHARED, responsibleParties: refTo("tenant-supplier") })] }), ["SCOPE_VIOLATION:source"], "fonte compartilhada não referencia fornecedor de tenant");
  assert.deepEqual(codes({ providers: [tenantProvider], platforms: [], sources: [source({ scope: TENANT_B, responsibleParties: refTo("tenant-supplier") })] }), ["SCOPE_VIOLATION:source"], "nem outro tenant");
  assert.deepEqual(codes({ providers: [tenantProvider], platforms: [], sources: [source({ scope: TENANT_A, responsibleParties: refTo("tenant-supplier") })] }), []);
  assert.deepEqual(codes({ providers: [provider()], platforms: [], sources: [source({ scope: TENANT_A, responsibleParties: refTo("synthetic-provider") })] }), [], "fonte de tenant pode usar fornecedor compartilhado");
});

// ---------------------------------------------------------------------------------------------------------
test("catálogo candidato: fornecedores e fontes mapeados, tudo mapped, nada inventado", () => {
  const reg = DATA_SOURCE_REGISTRY_V2;
  assert.deepEqual(validateDataSourceRegistryV2(reg), { ok: true, issues: [] });
  assert.deepEqual(reg.sources.map((s) => s.sourceId), [
    "receita.classif.ncm", "ibge.localidades", "bcb.ptax", "mdic.comexstat",
    "lexml.service-to-confirm", "imprensa-nacional.dou-inlabs", "antaq.datasets-to-select", "un.comtrade.service-to-confirm", "omc.data-services-to-select",
  ]);
  assert.deepEqual(reg.providers.map((p) => p.providerId), ["receita-federal", "ibge", "banco-central", "mdic", "imprensa-nacional", "antaq", "omc"]);
  for (const s of reg.sources) {
    assert.equal(s.lifecycleState, "mapped", `${s.sourceId} permanece mapped`);
    assert.equal(s.authorizationGranted, false);
    assert.equal(s.usageCondition, "not_assessed");
    assert.equal(s.scope.kind, "shared");
    assert.deepEqual(s.confirmedAccessModes, UNKNOWN, `${s.sourceId}: nenhuma modalidade confirmada`);
    for (const field of ["coverage", "informationKinds", "documentation", "authentication", "licenseTerms", "reuseConditions", "limits", "costs", "expectedUpdateFrequency", "steward"] as const) assert.deepEqual(s[field], UNKNOWN, `${s.sourceId}.${field}`);
    assert.ok(listUnverifiedDataSourceMetadataV2(s).length >= 12, s.sourceId);
  }
  for (const p of reg.providers) { assert.equal(p.scope.kind, "shared"); assert.equal(p.categories.status, "declared"); assert.equal(p.authorizationGranted, false); }
  // candidatos: modalidade NÃO forçada
  for (const s of reg.sources.slice(4)) assert.deepEqual(s.candidateAccessModes, UNKNOWN, `${s.sourceId}: modalidade a confirmar, não forçada`);
  const byId = (id: string) => reg.sources.find((s) => s.sourceId === id)!;
  assert.deepEqual(byId("lexml.service-to-confirm").responsibleParties, UNKNOWN, "LexML: responsabilidade institucional a confirmar");
  assert.deepEqual(byId("un.comtrade.service-to-confirm").responsibleParties, UNKNOWN, "UN Comtrade: responsável a confirmar");
  assert.equal(reg.providers.some((p) => /lexml|comtrade|^onu|united/i.test(p.providerId + p.displayName)), false, "nenhum fornecedor inventado para LexML/UN Comtrade");
  for (const id of ["antaq.datasets-to-select", "omc.data-services-to-select"]) { const g = byId(id).granularity; assert.ok(g.status === "declared" && g.value === "collection_to_select", id); }
  const dou = byId("imprensa-nacional.dou-inlabs").responsibleParties;
  assert.ok(dou.status === "declared" && dou.value[0].providerId === "imprensa-nacional" && dou.value[0].role === "institutional_responsible");
  // nenhuma conexão, credencial, parceiro privado ou canal no catálogo
  assert.equal(reg.providers.some((p) => p.scope.kind !== "shared") || reg.sources.some((s) => s.scope.kind !== "shared"), false);
  assert.deepEqual(Object.keys(reg).sort(), ["platforms", "providers", "sources"]);
  assert.equal(JSON.stringify(reg).includes("credref:"), false);
  assert.throws(() => { (reg.sources as unknown as unknown[]).push({}); }, TypeError);
  assert.throws(() => { (reg.sources[0] as { lifecycleState: string }).lifecycleState = "active"; }, TypeError);
});

test("módulos novos são puros: sem rede, ambiente, timers, criptografia ou dependências de blockchain/oráculo externo", () => {
  const files = ["dataSourcePrimitives.ts", "dataSourceModel.ts", "dataSourceProvenance.ts", "supplierChannel.ts", "dataSourceCandidateCatalog.ts", "dataSourceQuery.ts"];
  for (const file of files) {
    const code = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(code, /\bfetch\s*\(|process\.env|node:|XMLHttpRequest|WebSocket|setInterval|setTimeout|require\(|crypto\.|createHash|createVerify|subtle/, `${file} deve ser puro`);
    assert.doesNotMatch(code, /chainlink|ethers|web3|viem|solidity|smart.?contract|\bDON\b|\bCCIP\b/i, `${file} não pode depender de tecnologias de blockchain/oráculo externo`);
    const specifiers = [...code.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
    assert.ok(specifiers.every((s) => s === "zod" || s.startsWith("./")), `${file} só importa zod e módulos locais: ${specifiers}`);
  }
  for (const manifest of ["../package.json", "../../../package.json"]) {
    const pkg = JSON.parse(readFileSync(new URL(manifest, import.meta.url), "utf8")) as Record<string, Record<string, string> | undefined>;
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies });
    assert.deepEqual(deps.filter((d) => /chainlink|ethers|web3|viem|hardhat|wagmi/i.test(d)), [], manifest);
  }
});
