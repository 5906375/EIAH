import { z } from "zod";
import {
  DATA_SOURCE_AUTH_SCHEMES,
  DATA_SOURCE_UPDATE_FREQUENCIES,
  dataSourceAccessModeSchema,
  dataSourceCredentialRefSchema,
  dataSourceDocumentationRefV1Schema,
  dataSourceDomainSchema,
  dataSourceKnownLimitV1Schema,
  dataSourceLifecycleStateSchema,
  dataSourceScopeV1Schema,
  dataSourceUsageConditionSchema,
  type DataSourceConnectionV1,
  type DataSourceScopeV1,
  type DataSourceV1,
} from "./dataSources.js";
import { confirmedFactV2, factV2, factValue, stableId, text, uniqueArray } from "./dataSourcePrimitives.js";

/**
 * Modelo v2 de fornecedor / plataforma / fonte / condições de acesso (Oráculo SC, etapa 2 — SEM execução).
 *
 * Cardinalidades (verificadas por teste, não só declaradas):
 *   fornecedor 1—N fontes · fonte N—M responsáveis (papéis) · fonte 1—N modalidades · fonte 1—N conexões
 *   · conexão 1—1 escopo e condições próprios · plataforma 1—N módulos · fonte 0..1 plataforma/módulo.
 * Fornecedor, fonte, conexão, canal e consumidor são entidades diferentes; categoria, natureza da organização e
 * modalidade de acesso são três eixos independentes. Nada aqui concede autorização.
 *
 * Os contratos `eiah.data-source.v1` e `eiah.data-source-connection.v1` permanecem como estavam: este módulo é aditivo.
 */

// --- Eixos independentes: categoria ≠ natureza ≠ modalidade -----------------------------------------------
export const DATA_PROVIDER_CATEGORIES = [
  "public_body",
  "international_organization",
  "port_authority",
  "port_terminal",
  "empty_container_depot",
  "shipping_line",
  "maritime_agent",
  "carrier",
  "cargo_agent",
  "customs_broker",
  "importer_exporter",
  "software_or_data_provider",
  "sector_specialist_or_entity",
] as const;
export const dataProviderCategorySchema = z.enum(DATA_PROVIDER_CATEGORIES);

export const DATA_PROVIDER_NATURES = ["public_sector", "private_sector", "international_public", "civil_society_or_sectoral", "individual", "mixed"] as const;
export const dataProviderNatureSchema = z.enum(DATA_PROVIDER_NATURES);

/** Papéis de uma parte responsável por uma fonte. Uma fonte pode ter vários, sem uma "propriedade institucional" única. */
export const DATA_SOURCE_PARTY_ROLES = ["publisher", "data_owner", "operator", "intermediary", "institutional_responsible"] as const;
export const dataSourcePartyRoleSchema = z.object({ providerId: stableId, role: z.enum(DATA_SOURCE_PARTY_ROLES) }).strict();
export type DataSourcePartyRole = z.infer<typeof dataSourcePartyRoleSchema>;
const partyRoles = uniqueArray(dataSourcePartyRoleSchema, 1, 20, "partes responsáveis");

/** Tipos de informação — não se confundem (a regra de prevalência, quando houver, depende do domínio). */
export const DATA_INFORMATION_KINDS = [
  "aggregate_statistic",
  "reference_data",
  "forecast",
  "observed_event",
  "operational_confirmation",
  "normative_text",
  "document",
] as const;
export const dataInformationKindSchema = z.enum(DATA_INFORMATION_KINDS);

// --- Fornecedor -------------------------------------------------------------------------------------------
/**
 * Organização ou pessoa responsável por disponibilizar informações. Registra-se UMA vez, com N categorias; ter mais de
 * um canal ou mais de uma fonte NÃO duplica o cadastro. Categoria/natureza podem ser `unknown` ou `declared` (a confirmar).
 * Fornecedor privado pertence a um escopo tenant/workspace; este contrato não cadastra nenhum.
 */
export const dataProviderV1Schema = z.object({
  schemaVersion: z.literal("eiah.data-provider.v1"),
  providerId: stableId,
  displayName: text,
  scope: dataSourceScopeV1Schema,
  categories: factV2(uniqueArray(dataProviderCategorySchema, 1, DATA_PROVIDER_CATEGORIES.length, "categorias")),
  nature: factV2(dataProviderNatureSchema),
  /** Existir no catálogo não autoriza consultar, receber nem agir. */
  authorizationGranted: z.literal(false),
}).strict();
export type DataProviderV1 = z.infer<typeof dataProviderV1Schema>;

// --- Plataforma (≠ organização, ≠ fonte) -------------------------------------------------------------------
/**
 * Sistema que hospeda módulos/serviços de terceiros (p.ex. um portal governamental). Não é um fornecedor e não é uma
 * fonte: quem o opera é um fornecedor (papel), e cada módulo precisa ser identificado e só então vira fonte.
 */
export const dataPlatformV1Schema = z.object({
  schemaVersion: z.literal("eiah.data-platform.v1"),
  platformId: stableId,
  displayName: text,
  scope: dataSourceScopeV1Schema,
  operators: factV2(partyRoles),
  modules: factV2(uniqueArray(z.object({ moduleId: stableId, displayName: text }).strict(), 1, 100, "módulos")),
  mappingState: z.literal("mapped"),
  authorizationGranted: z.literal(false),
}).strict();
export type DataPlatformV1 = z.infer<typeof dataPlatformV1Schema>;

// --- Autenticação (independente de modalidade e de formato) -------------------------------------------------
export const dataSourceAuthRequirementSchema = z.object({
  requirement: z.enum(["none", "credential_required"]),
  schemes: uniqueArray(z.enum(DATA_SOURCE_AUTH_SCHEMES), 1, DATA_SOURCE_AUTH_SCHEMES.length, "esquemas").optional(),
  registrationRequired: z.boolean().optional(),
}).strict().refine((a) => !(a.requirement === "none" && a.schemes !== undefined), "esquema de autenticação com requirement none");
export type DataSourceAuthRequirement = z.infer<typeof dataSourceAuthRequirementSchema>;

const licenseTermsValue = z.object({ license: text, termsReference: text.optional() }).strict();
const reuseConditionsValue = z.object({ summary: text, attributionRequired: z.boolean().optional() }).strict();
const costsValue = z.object({ model: z.enum(["free", "paid", "mixed"]), note: text.optional() }).strict();
const accessModes = uniqueArray(dataSourceAccessModeSchema, 1, 6, "modalidades");

export const DATA_SOURCE_GRANULARITIES = ["service", "dataset", "publication", "collection_to_select"] as const;

// --- Fonte v2 ---------------------------------------------------------------------------------------------
export const dataSourceV2Schema = z.object({
  schemaVersion: z.literal("eiah.data-source.v2"),
  sourceId: stableId,
  sourceVersion: z.number().int().positive(),
  name: text,
  scope: dataSourceScopeV1Schema,
  purpose: text,
  domain: dataSourceDomainSchema,
  /** `collection_to_select` = ainda é um conjunto a selecionar; não pode avançar nem receber conexão. */
  granularity: factV2(z.enum(DATA_SOURCE_GRANULARITIES)),
  platform: z.object({ platformId: stableId, module: factV2(stableId) }).strict().optional(),
  /** Vários papéis, sem presumir um único proprietário. `unknown` = responsável ainda não identificado. */
  responsibleParties: factV2(partyRoles),
  coverage: factV2(text),
  informationKinds: factV2(uniqueArray(dataInformationKindSchema, 1, DATA_INFORMATION_KINDS.length, "tipos de informação")),
  /** Hipóteses de acesso (declaradas) — NÃO são confirmação. */
  candidateAccessModes: factV2(accessModes),
  /** Só vale o que foi verificado, com evidência. `declared` não existe aqui. */
  confirmedAccessModes: confirmedFactV2(accessModes),
  documentation: factV2(uniqueArray(dataSourceDocumentationRefV1Schema, 1, 20, "referências")),
  authentication: factV2(dataSourceAuthRequirementSchema),
  licenseTerms: factV2(licenseTermsValue),
  reuseConditions: factV2(reuseConditionsValue),
  usageCondition: dataSourceUsageConditionSchema,
  limits: factV2(uniqueArray(dataSourceKnownLimitV1Schema, 1, 20, "limites")),
  costs: factV2(costsValue),
  expectedUpdateFrequency: factV2(z.enum(DATA_SOURCE_UPDATE_FREQUENCIES)),
  /** Responsável INTERNO (curadoria no EIAH), distinto das partes responsáveis externas. */
  steward: factV2(text),
  lifecycleState: dataSourceLifecycleStateSchema,
  /** Rótulo de provedor do cadastro v1, preservado só como rastro de migração. */
  legacyProviderLabel: text.optional(),
  authorizationGranted: z.literal(false),
}).strict().superRefine((source, ctx) => {
  const issue = (path: string, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
  const permitted = source.usageCondition === "permitted" || source.usageCondition === "permitted_with_conditions";
  // Desconhecido nunca vira aceitação de termos.
  if (permitted && source.licenseTerms.status !== "verified") issue("usageCondition", "condição de uso permitida exige licença/termos verificados");
  if (source.granularity.status === "declared" && source.granularity.value === "collection_to_select" && source.lifecycleState !== "mapped") {
    issue("lifecycleState", "conjunto ainda a selecionar não pode sair de mapped");
  }
  if (source.lifecycleState !== "validated" && source.lifecycleState !== "active") return;
  const need = (ok: boolean, path: string, what: string) => { if (!ok) issue(path, `estado ${source.lifecycleState} exige ${what}`); };
  need(source.confirmedAccessModes.status === "verified", "confirmedAccessModes", "modalidades confirmadas (verificadas)");
  need(source.licenseTerms.status === "verified", "licenseTerms", "licença/termos verificados");
  need(source.documentation.status === "verified", "documentation", "documentação verificada");
  need(source.authentication.status === "verified", "authentication", "requisito de autenticação verificado");
  need(source.responsibleParties.status === "verified", "responsibleParties", "responsáveis verificados");
  need(source.granularity.status === "verified" && source.granularity.value !== "collection_to_select", "granularity", "granularidade específica verificada");
  need(permitted, "usageCondition", "condição de uso avaliada e permitida");
});
export type DataSourceV2 = z.infer<typeof dataSourceV2Schema>;

const SOURCE_V2_FACT_FIELDS = [
  "granularity", "responsibleParties", "coverage", "informationKinds", "candidateAccessModes", "confirmedAccessModes", "documentation",
  "authentication", "licenseTerms", "reuseConditions", "limits", "costs", "expectedUpdateFrequency", "steward",
] as const;
/** Campos ainda NÃO verificados (unknown ou apenas declared). `not_applicable` justificado conta como resolvido. */
export function listUnverifiedDataSourceMetadataV2(source: DataSourceV2): string[] {
  const pending: string[] = SOURCE_V2_FACT_FIELDS.filter((f) => source[f].status === "unknown" || source[f].status === "declared");
  if (source.usageCondition === "not_assessed") pending.push("usageCondition");
  return pending;
}

// --- Migração v1 → v2 (explícita; nunca promove silenciosamente) -----------------------------------------------
export type DataSourceUpgradeExtras = {
  name: string;
  responsibleParties?: DataSourceV2["responsibleParties"];
  platform?: DataSourceV2["platform"];
};
export type DataSourceUpgradeResult =
  | { ok: true; source: DataSourceV2 }
  | { ok: false; reason: "V1_VERIFIED_FACT_WITHOUT_EVIDENCE"; field: string };

const UNKNOWN = { status: "unknown" } as const;
/**
 * Preserva identidade, versão, finalidade, domínio, estado e todos os fatos unknown/declared do v1. Um fato `verified` do
 * v1 NÃO tem evidência da verificação (o v2 exige): a migração recusa em vez de rebaixar ou inventar evidência.
 */
export function upgradeDataSourceV1ToV2(v1: DataSourceV1, extras: DataSourceUpgradeExtras): DataSourceUpgradeResult {
  const carry = <T>(field: string, fact: { status: "unknown" } | { status: "declared"; value: T; basis: string } | { status: "verified"; value: T }):
    { ok: true; value: { status: "unknown" } | { status: "declared"; value: T; basis: string } } | { ok: false; field: string } => {
    if (fact.status === "verified") return { ok: false, field };
    return { ok: true, value: fact };
  };
  const pairs = {
    coverage: carry("coverage", v1.coverage),
    candidateAccessModes: carry("supportedAccessModes", v1.supportedAccessModes),
    documentation: carry("documentation", v1.documentation),
    licenseTerms: carry("licenseTerms", v1.licenseTerms),
    expectedUpdateFrequency: carry("expectedUpdateFrequency", v1.expectedUpdateFrequency),
    limits: carry("knownLimits", v1.knownLimits),
    steward: carry("steward", v1.steward),
  };
  for (const pair of Object.values(pairs)) if (!pair.ok) return { ok: false, reason: "V1_VERIFIED_FACT_WITHOUT_EVIDENCE", field: pair.field };
  const v = (key: keyof typeof pairs) => (pairs[key] as { ok: true; value: never }).value;
  const source = {
    schemaVersion: "eiah.data-source.v2",
    sourceId: v1.sourceId,
    sourceVersion: v1.sourceVersion,
    name: extras.name,
    scope: { kind: "shared" },
    purpose: v1.purpose,
    domain: v1.domain,
    granularity: UNKNOWN,
    ...(extras.platform ? { platform: extras.platform } : {}),
    responsibleParties: extras.responsibleParties ?? UNKNOWN,
    coverage: v("coverage"),
    informationKinds: UNKNOWN,
    candidateAccessModes: v("candidateAccessModes"),
    confirmedAccessModes: UNKNOWN,
    documentation: v("documentation"),
    authentication: UNKNOWN,
    licenseTerms: v("licenseTerms"),
    reuseConditions: UNKNOWN,
    usageCondition: v1.usageCondition,
    limits: v("limits"),
    costs: UNKNOWN,
    expectedUpdateFrequency: v("expectedUpdateFrequency"),
    steward: v("steward"),
    lifecycleState: v1.lifecycleState,
    legacyProviderLabel: v1.provider,
    authorizationGranted: false,
  };
  return { ok: true, source: dataSourceV2Schema.parse(source) };
}

// --- Condições de acesso próprias da conexão ---------------------------------------------------------------
/**
 * Autenticação e condições de uso/limite/custo de UMA conexão, separadas da modalidade e do formato: um arquivo pode exigir
 * credencial, uma API pública pode exigir chave, um fornecedor privado pode não exigir nenhuma. Não altera o contrato de
 * conexão v1; liga-se a ele por `connectionId`, com o mesmo escopo.
 */
export const dataSourceAccessConditionsV1Schema = z.object({
  schemaVersion: z.literal("eiah.data-source-access-conditions.v1"),
  connectionId: stableId,
  sourceId: stableId,
  scope: dataSourceScopeV1Schema,
  authentication: factV2(dataSourceAuthRequirementSchema),
  credentialRef: dataSourceCredentialRefSchema.optional(),
  reuseConditions: factV2(reuseConditionsValue),
  limits: factV2(uniqueArray(dataSourceKnownLimitV1Schema, 1, 20, "limites")),
  costs: factV2(costsValue),
  expectedUpdateFrequency: factV2(z.enum(DATA_SOURCE_UPDATE_FREQUENCIES)),
  authorizationGranted: z.literal(false),
}).strict().superRefine((c, ctx) => {
  const auth = factValue(c.authentication);
  if (c.credentialRef && auth?.requirement === "none") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["credentialRef"], message: "credencial referenciada, mas a autenticação declarada é none" });
  }
});
export type DataSourceAccessConditionsV1 = z.infer<typeof dataSourceAccessConditionsV1Schema>;

const sameScope = (a: DataSourceScopeV1, b: DataSourceScopeV1) =>
  a.kind === "shared" ? b.kind === "shared" : b.kind === "tenant_workspace" && a.tenantId === b.tenantId && a.workspaceId === b.workspaceId;

export type AccessConditionsIssue =
  | "CONNECTION_ID_MISMATCH"
  | "SOURCE_ID_MISMATCH"
  | "SCOPE_MISMATCH"
  | "CREDENTIAL_REF_CONFLICT"
  | "AUTH_SCHEME_CONFLICT"
  | "CREDENTIAL_REQUIRED_BUT_MISSING";

/** Coerência estrutural entre condições e conexão v1. Não decide acesso. */
export function checkAccessConditionsAgainstConnection(conditions: DataSourceAccessConditionsV1, connection: DataSourceConnectionV1): AccessConditionsIssue[] {
  const issues: AccessConditionsIssue[] = [];
  if (conditions.connectionId !== connection.connectionId) issues.push("CONNECTION_ID_MISMATCH");
  if (conditions.sourceId !== connection.sourceId) issues.push("SOURCE_ID_MISMATCH");
  if (!sameScope(conditions.scope, connection.scope)) issues.push("SCOPE_MISMATCH");
  const cfg = connection.config;
  const cfgRef = "credentialRef" in cfg ? cfg.credentialRef : undefined;
  if (conditions.credentialRef && cfgRef && conditions.credentialRef !== cfgRef) issues.push("CREDENTIAL_REF_CONFLICT");
  const auth = factValue(conditions.authentication);
  const cfgScheme = "authScheme" in cfg ? cfg.authScheme : undefined;
  if (auth?.schemes && cfgScheme && !auth.schemes.includes(cfgScheme)) issues.push("AUTH_SCHEME_CONFLICT");
  if (auth?.requirement === "credential_required" && connection.configuration === "complete" && !(conditions.credentialRef ?? cfgRef)) {
    issues.push("CREDENTIAL_REQUIRED_BUT_MISSING");
  }
  return issues;
}

// --- Compatibilidade conexão × fonte v2 --------------------------------------------------------------------
export type ConnectionSourceV2Issue =
  | "SOURCE_ID_MISMATCH"
  | "SOURCE_VERSION_MISMATCH"
  | "SOURCE_NOT_SPECIFIC"
  | "SCOPE_NOT_VISIBLE_TO_CONNECTION"
  | "ACCESS_MODES_UNKNOWN"
  | "ACCESS_MODE_NOT_DECLARED"
  | "ACCESS_MODE_NOT_CONFIRMED";

/**
 * Estrutural, não é decisão de acesso. `ACCESS_MODE_NOT_CONFIRMED` distingue "só candidata" de "confirmada": quem for
 * habilitar a conexão deve tratá-la como impeditivo; este módulo apenas a torna visível.
 */
export function checkConnectionAgainstSourceV2(connection: DataSourceConnectionV1, source: DataSourceV2): ConnectionSourceV2Issue[] {
  const issues: ConnectionSourceV2Issue[] = [];
  if (connection.sourceId !== source.sourceId) issues.push("SOURCE_ID_MISMATCH");
  if (connection.sourceVersion !== source.sourceVersion) issues.push("SOURCE_VERSION_MISMATCH");
  const granularity = factValue(source.granularity);
  if (granularity === "collection_to_select") issues.push("SOURCE_NOT_SPECIFIC");
  if (source.scope.kind === "tenant_workspace" && !sameScope(source.scope, connection.scope)) issues.push("SCOPE_NOT_VISIBLE_TO_CONNECTION");
  const candidates = factValue(source.candidateAccessModes) ?? [];
  const confirmed = factValue(source.confirmedAccessModes) ?? [];
  const mode = connection.config.mode;
  if (candidates.length === 0 && confirmed.length === 0) issues.push("ACCESS_MODES_UNKNOWN");
  else if (!candidates.includes(mode) && !confirmed.includes(mode)) issues.push("ACCESS_MODE_NOT_DECLARED");
  else if (!confirmed.includes(mode)) issues.push("ACCESS_MODE_NOT_CONFIRMED");
  return issues;
}

// --- Registro (fornecedores + plataformas + fontes): integridade referencial -------------------------------------
export type DataSourceRegistryIssueCode =
  | "INVALID_ENTRY"
  | "DUPLICATE_ID"
  | "UNKNOWN_PROVIDER_REF"
  | "UNKNOWN_PLATFORM_REF"
  | "UNKNOWN_PLATFORM_MODULE"
  | "SCOPE_VIOLATION";
export type DataSourceRegistryIssue = { code: DataSourceRegistryIssueCode; entity: "provider" | "platform" | "source"; index: number; id?: string; message: string };
export type DataSourceRegistryV2 = {
  providers: readonly DataProviderV1[];
  platforms: readonly DataPlatformV1[];
  sources: readonly DataSourceV2[];
};

/** Entidade em `from` só pode referenciar entidade compartilhada ou do MESMO tenant/workspace. */
const scopeCanReference = (from: DataSourceScopeV1, to: DataSourceScopeV1) => to.kind === "shared" || sameScope(from, to);

export function validateDataSourceRegistryV2(candidate: { providers: readonly unknown[]; platforms: readonly unknown[]; sources: readonly unknown[] }): { ok: boolean; issues: DataSourceRegistryIssue[] } {
  const issues: DataSourceRegistryIssue[] = [];
  const idOf = (c: unknown, key: string) => (typeof (c as Record<string, unknown>)?.[key] === "string" ? ((c as Record<string, string>)[key]) : undefined);
  const parseAll = <S extends z.ZodTypeAny>(entity: DataSourceRegistryIssue["entity"], schema: S, items: readonly unknown[], idKey: string) => {
    const seen = new Set<string>();
    const valid: Array<{ index: number; value: z.infer<S> }> = [];
    items.forEach((item, index) => {
      const parsed = schema.safeParse(item);
      if (!parsed.success) {
        issues.push({ code: "INVALID_ENTRY", entity, index, id: idOf(item, idKey), message: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ") });
        return;
      }
      const id = (parsed.data as Record<string, string>)[idKey];
      if (seen.has(id)) { issues.push({ code: "DUPLICATE_ID", entity, index, id, message: `${idKey} duplicado` }); return; }
      seen.add(id);
      valid.push({ index, value: parsed.data });
    });
    return valid;
  };
  const providers = parseAll("provider", dataProviderV1Schema, candidate.providers, "providerId");
  const platforms = parseAll("platform", dataPlatformV1Schema, candidate.platforms, "platformId");
  const sources = parseAll("source", dataSourceV2Schema, candidate.sources, "sourceId");
  const providerById = new Map(providers.map((p) => [p.value.providerId, p.value]));
  const platformById = new Map(platforms.map((p) => [p.value.platformId, p.value]));

  const checkParties = (entity: "platform" | "source", index: number, id: string, scope: DataSourceScopeV1, parties: readonly DataSourcePartyRole[] | undefined) => {
    for (const party of parties ?? []) {
      const provider = providerById.get(party.providerId);
      if (!provider) issues.push({ code: "UNKNOWN_PROVIDER_REF", entity, index, id, message: `fornecedor inexistente: ${party.providerId}` });
      else if (!scopeCanReference(scope, provider.scope)) issues.push({ code: "SCOPE_VIOLATION", entity, index, id, message: `escopo não pode referenciar o fornecedor ${party.providerId}` });
    }
  };
  for (const { index, value: platform } of platforms) checkParties("platform", index, platform.platformId, platform.scope, factValue(platform.operators));
  for (const { index, value: source } of sources) {
    checkParties("source", index, source.sourceId, source.scope, factValue(source.responsibleParties));
    if (!source.platform) continue;
    const platform = platformById.get(source.platform.platformId);
    if (!platform) { issues.push({ code: "UNKNOWN_PLATFORM_REF", entity: "source", index, id: source.sourceId, message: `plataforma inexistente: ${source.platform.platformId}` }); continue; }
    if (!scopeCanReference(source.scope, platform.scope)) issues.push({ code: "SCOPE_VIOLATION", entity: "source", index, id: source.sourceId, message: `escopo não pode referenciar a plataforma ${platform.platformId}` });
    const moduleId = factValue(source.platform.module);
    const modules = factValue(platform.modules);
    if (moduleId && modules && !modules.some((m) => m.moduleId === moduleId)) {
      issues.push({ code: "UNKNOWN_PLATFORM_MODULE", entity: "source", index, id: source.sourceId, message: `módulo inexistente na plataforma: ${moduleId}` });
    }
  }
  return { ok: issues.length === 0, issues };
}

/** Consultas de cardinalidade sobre um registro já validado (nenhuma cria entidade). */
export const listSourcesOfProvider = (registry: DataSourceRegistryV2, providerId: string) =>
  registry.sources.filter((s) => (factValue(s.responsibleParties) ?? []).some((p) => p.providerId === providerId));
export const listProvidersOfSource = (registry: DataSourceRegistryV2, sourceId: string) => {
  const source = registry.sources.find((s) => s.sourceId === sourceId);
  const ids = new Set((source ? factValue(source.responsibleParties) ?? [] : []).map((p) => p.providerId));
  return registry.providers.filter((p) => ids.has(p.providerId));
};
