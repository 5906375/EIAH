import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DATA_SOURCE_CATALOG_V1,
  DATA_SOURCE_REGISTRY_V2,
  checkAccessConditionsAgainstConnection,
  dataSourceAccessConditionsV1Schema,
  ORACULO_DECISION_VALUES,
  ORACULO_PREPARATION_CASE_TYPE,
  caseUpdateProposalV1Schema,
  collectionResultV1Schema,
  dataSourceConnectionV1Schema,
  oraculoEvidenceV1Schema,
  originEvidenceV1Schema,
} from "@eiah/contracts";
import { DEFAULT_MARKET_SOURCE_REGISTRY } from "../services/imob/marketScan/marketSourceRegistry";
import { decideSourceAccess } from "../services/imob/marketScan/sourceAccessPolicyGate";

/**
 * Compatibilidade com consumidores EXISTENTES. Esta etapa não alterou nenhum deles; estes testes provam que
 * (1) o registro/gate do IMOB continuam com o comportamento anterior, (2) o catálogo novo não é um registro
 * concorrente nem concede acesso por existir, (3) o formato da conexão cabe no `ConnectorInstance` atual sem
 * migração, e (4) os contratos novos reutilizam o vocabulário e os formatos já usados pelo Oráculo.
 */
const readRepoFile = (relative: string) => readFileSync(new URL(`../../../../${relative}`, import.meta.url), "utf8");

test("IMOB: registro e gate preservam o comportamento anterior (4 fontes IMOB, mesmas decisões)", () => {
  assert.deepEqual(DEFAULT_MARKET_SOURCE_REGISTRY.map((entry) => entry.sourceId), ["internal_crm", "tenant_inventory_import", "manual_input", "public_web_assisted"]);
  const allowed = decideSourceAccess({ sourceId: "internal_crm", requestedMode: "internal_crm", operation: "market_scan_region", tenantId: "tenant-synthetic-A", workspaceId: "workspace-synthetic-A1" });
  assert.equal(allowed.allowed, true);
  const noTenant = decideSourceAccess({ sourceId: "internal_crm", requestedMode: "internal_crm", operation: "market_scan_region", workspaceId: "workspace-synthetic-A1" });
  assert.equal(noTenant.allowed === false && noTenant.reasonCode, "TENANT_SCOPE_REQUIRED");
  const unknown = decideSourceAccess({ sourceId: "nao.existe", requestedMode: "official_api", operation: "market_scan_region", tenantId: "t", workspaceId: "w" });
  assert.equal(unknown.allowed === false && unknown.reasonCode, "SOURCE_NOT_AUTHORIZED");
});

test("catálogo novo não é registro concorrente: ids disjuntos e o gate do IMOB não o reconhece", () => {
  const imobIds = new Set(DEFAULT_MARKET_SOURCE_REGISTRY.map((entry) => entry.sourceId));
  for (const source of DATA_SOURCE_CATALOG_V1) {
    assert.equal(imobIds.has(source.sourceId), false, `${source.sourceId} não pode colidir com o registro IMOB`);
    // Constar no catálogo não concede nada: o gate existente nega qualquer modalidade/operação para essas fontes.
    for (const requestedMode of ["official_api", "partner_feed", "licensed_provider", "manual_input"] as const) {
      const decision = decideSourceAccess({ sourceId: source.sourceId, requestedMode, operation: "market_scan_region", tenantId: "tenant-synthetic-A", workspaceId: "workspace-synthetic-A1" });
      assert.equal(decision.allowed, false, `${source.sourceId}/${requestedMode}`);
      assert.equal(decision.allowed === false && decision.reasonCode, "SOURCE_NOT_AUTHORIZED");
    }
  }
});

test("contratos novos são independentes do código IMOB (nenhuma generalização do registro/gate do IMOB)", () => {
  for (const file of ["packages/contracts/src/dataSources.ts", "packages/contracts/src/dataSourceCatalog.ts"]) {
    const code = readRepoFile(file);
    assert.doesNotMatch(code, /imob/i, `${file} não pode depender de, nem nomear, o IMOB`);
    assert.doesNotMatch(code, /apps\/|\.\.\/\.\.\/apps/, `${file} não importa de apps/*`);
  }
});

test("ConnectorInstance: o formato da conexão cabe no modelo existente; estado e segredo NÃO existem lá (dependência documentada)", () => {
  const schema = readRepoFile("packages/db/prisma/schema.prisma");
  const block = /model ConnectorInstance \{([\s\S]*?)\n\}/.exec(schema)?.[1];
  assert.ok(block, "model ConnectorInstance deve existir");
  const fields = new Map(block.split("\n").map((line) => line.trim().split(/\s+/)).filter((parts) => parts.length >= 2 && !parts[0].startsWith("@@") && !parts[0].startsWith("//")).map(([name, type]) => [name, type]));
  // Reaproveitável: escopo tenant/workspace, identificador do conector e config Json.
  assert.equal(fields.get("tenantId"), "String");
  assert.equal(fields.get("workspaceId"), "String");
  assert.equal(fields.get("connector"), "String");
  assert.equal(fields.get("config"), "Json?");
  // Lacunas que exigirão decisão/migração FUTURA (não feita aqui): estado de habilitação/suspensão e referência de credencial.
  for (const missing of ["status", "enabled", "suspended", "credentialRef", "sourceId"]) assert.equal(fields.has(missing), false, `ConnectorInstance ainda não tem ${missing}`);
  // E nunca deve haver coluna que guarde o segredo em si (uma `credentialRef` opaca, futura, não é segredo).
  for (const name of fields.keys()) assert.doesNotMatch(name, /secret|token|password|api_?key/i, `coluna suspeita: ${name}`);
  // Entrada válida do contrato usa só o que o modelo comporta como `config` (JSON) + escopo.
  const parsed = dataSourceConnectionV1Schema.parse({
    schemaVersion: "eiah.data-source-connection.v1", connectionId: "synthetic.conn-1", sourceId: "synthetic.open-api", sourceVersion: 1,
    scope: { kind: "tenant_workspace", tenantId: "tenant-synthetic-A", workspaceId: "workspace-synthetic-A1" },
    config: { mode: "open_api", endpoint: { registeredUrl: "https://example.invalid/v1", grantsNetworkPermission: false, destinationPolicy: "validated_by_executor" } },
    configuration: "incomplete", enablement: { status: "disabled" }, suspension: { status: "not_suspended" }, accessPolicyRef: { kind: "none_declared" }, authorizationGranted: false,
  });
  assert.doesNotThrow(() => JSON.stringify(parsed.config), "config é serializável como Json");
});

test("Oráculo: contratos novos reutilizam o vocabulário de decisão e o formato sha256 da preparação", () => {
  const sha = "c".repeat(64);
  // O mesmo sha256 aceito na evidência documental do Oráculo é aceito na evidência de origem.
  const oraculoEvidence = { documentId: "doc-1", kind: "other", sourceDescription: "synthetic", fileName: "f.pdf", mimeType: "application/pdf", sizeBytes: 1, sha256: sha, uploadedAt: "2026-11-03T12:00:00.000Z", linkedAt: "2026-11-03T12:00:00.000Z", linkedBy: "u", reviewStatus: "unreviewed" };
  assert.equal(oraculoEvidenceV1Schema.safeParse(oraculoEvidence).success, true);
  const origin = { schemaVersion: "eiah.origin-evidence.v1", evidenceId: "ev-1", origin: { kind: "manual_entry", enteredBy: "u", enteredAt: "2026-11-03T12:00:00.000Z", entryBasis: "synthetic" }, contentSha256: sha, validation: { status: "not_validated" }, approval: { status: "not_requested" }, operationalAuthorization: false };
  assert.equal(originEvidenceV1Schema.safeParse(origin).success, true);
  assert.equal(originEvidenceV1Schema.safeParse({ ...origin, contentSha256: sha.toUpperCase() }).success, false);
  // A proposta aceita exatamente os valores de decisão do Oráculo e o tipo de caso da preparação como `caseType`.
  const proposal = (decision: string) => ({
    schemaVersion: "eiah.case-update-proposal.v1", proposalId: "p-1", caseId: "case-1", caseType: ORACULO_PREPARATION_CASE_TYPE, tenantId: "t", workspaceId: "w",
    expectedRevision: 1, changes: [{ fieldPath: "context.port", operation: "set", proposedValue: "x", evidenceIds: ["ev-1"] }], evidence: [{ evidenceId: "ev-1", contentSha256: sha }],
    proposedBy: { kind: "system", ref: "collector" }, proposedAt: "2026-11-03T12:00:00.000Z", state: "decided",
    decision: { decision, note: "n", decidedBy: { kind: "human", ref: "human" }, decidedAt: "2026-11-03T12:00:00.000Z", basedOnRevision: 1, basisHash: sha },
    caseMutationApplied: false, operationalAuthorization: false,
  });
  for (const value of ORACULO_DECISION_VALUES) assert.equal(caseUpdateProposalV1Schema.safeParse(proposal(value)).success, true, value);
  assert.equal(caseUpdateProposalV1Schema.safeParse(proposal("granted")).success, false);
});

test("resultado de coleta aceita consulta geral: não exige caso nem conexão", () => {
  const result = {
    schemaVersion: "eiah.collection-result.v1", resultId: "r-1", sourceId: "bcb.ptax", sourceVersion: 1, contentSchemaVersion: "synthetic.v1", scope: { kind: "shared" },
    dates: { collectedAt: "2026-11-03T12:00:00.000Z", referenceDate: { status: "unknown" }, publishedAt: { status: "unknown" }, validFrom: { status: "unknown" }, validUntil: { status: "unknown" } },
    warnings: [], outcome: "failure", error: { code: "source_unavailable", message: "fixture sintética", retryable: true },
  };
  assert.equal(collectionResultV1Schema.safeParse(result).success, true);
  assert.equal(collectionResultV1Schema.safeParse({ ...result, caseRef: { caseId: "c", tenantId: "t", workspaceId: "w" } }).success, false, "caso exige escopo tenant/workspace");
});

// ---- Etapa 2: modelo v2 (fornecedor/plataforma/fonte v2, proveniência, canal) sobre os mesmos consumidores ----
const CALLER = { tenantId: "tenant-synthetic-A", workspaceId: "workspace-synthetic-A1" };

test("v2: ids de fornecedor, plataforma e fonte não colidem com o registro IMOB, e o gate do IMOB nega todas as fontes novas", () => {
  const imobIds = new Set(DEFAULT_MARKET_SOURCE_REGISTRY.map((entry) => entry.sourceId));
  const ids = [...DATA_SOURCE_REGISTRY_V2.providers.map((p) => p.providerId), ...DATA_SOURCE_REGISTRY_V2.platforms.map((p) => p.platformId), ...DATA_SOURCE_REGISTRY_V2.sources.map((s) => s.sourceId)];
  for (const id of ids) assert.equal(imobIds.has(id), false, `${id} não pode colidir com o registro IMOB`);
  assert.equal(new Set(ids).size, ids.length, "ids únicos entre as três entidades");
  for (const source of DATA_SOURCE_REGISTRY_V2.sources) {
    for (const requestedMode of ["official_api", "partner_feed", "licensed_provider", "manual_input", "public_web_assisted"] as const) {
      const decision = decideSourceAccess({ sourceId: source.sourceId, requestedMode, operation: "market_scan_region", ...CALLER });
      assert.equal(decision.allowed === false && decision.reasonCode, "SOURCE_NOT_AUTHORIZED", `${source.sourceId}/${requestedMode}: existir no catálogo candidato não autoriza`);
    }
  }
  // O vocabulário "provider" do IMOB (implementação de conector) NÃO é o fornecedor do v2: nenhum providerId v2 é um id de conector IMOB.
  for (const provider of DATA_SOURCE_REGISTRY_V2.providers) assert.equal(["internal_crm", "tenant_inventory_import", "manual_input", "public_web_assisted"].includes(provider.providerId), false);
});

test("v2: condições de acesso se acoplam à conexão v1 existente em todas as modalidades, sem alterá-la", () => {
  const endpoint = { registeredUrl: "https://example.invalid/v1", grantsNetworkPermission: false, destinationPolicy: "validated_by_executor" };
  const configs: Record<string, Record<string, unknown>> = {
    open_api: { mode: "open_api", endpoint },
    authenticated_api: { mode: "authenticated_api", endpoint, authScheme: "api_key", credentialRef: "credref:synthetic-0001" },
    data_file: { mode: "data_file", expectedFormat: "json", origin: { kind: "tenant_upload" } },
    private_api: { mode: "private_api", supplierRef: "synthetic-provider", endpoint, authScheme: "bearer_token", credentialRef: "credref:synthetic-0001" },
    channel_message: { mode: "channel_message", channel: "whatsapp", direction: "inbound", acceptsAttachments: false, channelBindingRef: "binding-synthetic-1", caseBinding: "required" },
    manual_entry: { mode: "manual_entry", entryAuthority: "authorized_human", requiredScope: "synthetic.scope.write" },
  };
  const scope = { kind: "tenant_workspace", ...CALLER };
  for (const [mode, config] of Object.entries(configs)) {
    const connection = dataSourceConnectionV1Schema.parse({
      schemaVersion: "eiah.data-source-connection.v1", connectionId: "synthetic.conn-1", sourceId: "synthetic.source", sourceVersion: 1, scope, config,
      configuration: "incomplete", enablement: { status: "disabled" }, suspension: { status: "not_suspended" }, accessPolicyRef: { kind: "none_declared" }, authorizationGranted: false,
    });
    const unknown = { status: "unknown" };
    const conditions = dataSourceAccessConditionsV1Schema.parse({
      schemaVersion: "eiah.data-source-access-conditions.v1", connectionId: "synthetic.conn-1", sourceId: "synthetic.source", scope,
      authentication: unknown, reuseConditions: unknown, limits: unknown, costs: unknown, expectedUpdateFrequency: unknown, authorizationGranted: false,
    });
    assert.deepEqual(checkAccessConditionsAgainstConnection(conditions, connection), [], mode);
  }
});

test("v2: nenhum fornecedor privado, conexão, credencial ou canal foi cadastrado no catálogo candidato", () => {
  const serialized = JSON.stringify(DATA_SOURCE_REGISTRY_V2);
  assert.doesNotMatch(serialized, /credref:|tenant_workspace|whatsapp|supplier_declared/);
  assert.equal(DATA_SOURCE_REGISTRY_V2.sources.every((s) => s.lifecycleState === "mapped" && s.authorizationGranted === false), true);
});
