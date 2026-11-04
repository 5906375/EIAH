import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DATA_SOURCE_REGISTRY_V2,
  ORACULO_SOURCE_QUERY_SCOPE,
  dataSourceAccessConditionsV1Schema,
  dataSourceConnectionV1Schema,
  dataSourceV2Schema,
  sourceQueryOutcomeV1Schema,
  type DataSourceV2,
} from "@eiah/contracts";
import { createCoreSourceQueryAccess, createGuardrailAuditSink, createPreparationCasePort, type CoreAccessDeps } from "../services/logistica/control/oraculoSourceQueryCoreWiring";
import { createInMemoryAuditSink, createSourceQueryService, denyAllConnections, noAdapters } from "../services/logistica/oraculo/sourceQuery/sourceQueryService";
import type { ResolvedConnection, SourceQueryAuditSink, TrustedServerContext } from "../services/logistica/oraculo/sourceQuery/types";
import { DEFAULT_MARKET_SOURCE_REGISTRY } from "../services/imob/marketScan/marketSourceRegistry";
import { decideSourceAccess } from "../services/imob/marketScan/sourceAccessPolicyGate";
import { SYNTHETIC_OPERATION, SYNTHETIC_PURPOSE, SYNTHETIC_SOURCE_ID, canonicalSha256, createSyntheticSourceAdapter, syntheticAdapterRegistry } from "./support/syntheticSourceAdapter";

/**
 * Ligação interna mínima Oráculo → Core → adaptador → resultado/evidência, validada OFFLINE com um adaptador SINTÉTICO em memória.
 * Nada aqui usa rede, banco, ambiente, fila ou dados reais. As portas do Core são dublês de `CoreAccessDeps`; as funções reais que
 * elas representam (`resolveLogisticaContextAccess`, `TenantPolicyStore`, `hasLogisticaMemberCapability`) NÃO foram executadas.
 */
const T0 = "2026-11-03T12:00:00.000Z";
const CTX_A: TrustedServerContext = { tenantId: "tenant-synthetic-A", workspaceId: "workspace-synthetic-A1", userId: "user-synthetic-1" };
const CTX_B: TrustedServerContext = { tenantId: "tenant-synthetic-B", workspaceId: "workspace-synthetic-B1", userId: "user-synthetic-2" };
const POLICY_REF = "log.oraculo_source.query.synthetic";
const UNKNOWN = { status: "unknown" } as const;
const verified = (value: unknown) => ({ status: "verified", value, basis: "synthetic fixture", verifiedAt: T0, verifiedBy: "synthetic-reviewer", evidence: { kind: "human_review_record", ref: "synthetic-review-1" } });
const key = (...parts: string[]) => parts.join("|");

const activeSource = (over: Record<string, unknown> = {}): DataSourceV2 => dataSourceV2Schema.parse({
  schemaVersion: "eiah.data-source.v2", sourceId: SYNTHETIC_SOURCE_ID, sourceVersion: 1, name: "SYNTHETIC TEST SOURCE", scope: { kind: "shared" },
  purpose: "Fonte sintética de teste", domain: "other", granularity: verified("dataset"),
  responsibleParties: verified([{ providerId: "synthetic-provider", role: "publisher" }]), coverage: verified("synthetic"), informationKinds: verified(["reference_data"]),
  candidateAccessModes: { status: "declared", value: ["open_api"], basis: "synthetic" }, confirmedAccessModes: verified(["open_api"]),
  documentation: verified([{ kind: "official_documentation", title: "Synthetic", url: "https://example.invalid/docs" }]), authentication: verified({ requirement: "none" }),
  licenseTerms: verified({ license: "synthetic-license" }), reuseConditions: verified({ summary: "synthetic" }), usageCondition: "permitted_with_conditions",
  limits: verified([{ kind: "rate_limit", description: "synthetic" }]), costs: verified({ model: "free" }), expectedUpdateFrequency: verified("daily"), steward: verified("synthetic-steward"),
  lifecycleState: "active", authorizationGranted: false, ...over,
});
const connectionFor = (ctx: TrustedServerContext, over: Record<string, unknown> = {}) => dataSourceConnectionV1Schema.parse({
  schemaVersion: "eiah.data-source-connection.v1", connectionId: `synthetic.conn-${ctx.workspaceId.toLowerCase()}`, sourceId: SYNTHETIC_SOURCE_ID, sourceVersion: 1,
  scope: { kind: "tenant_workspace", tenantId: ctx.tenantId, workspaceId: ctx.workspaceId },
  config: { mode: "open_api", endpoint: { registeredUrl: "https://example.invalid/v1", grantsNetworkPermission: false, destinationPolicy: "validated_by_executor" } },
  configuration: "complete", enablement: { status: "enabled", enabledBy: "synthetic-admin", enabledAt: T0 }, suspension: { status: "not_suspended" },
  accessPolicyRef: { kind: "tenant_action_policy", ref: POLICY_REF }, authorizationGranted: false, ...over,
});
const conditionsFor = (conn: { connectionId: string; scope: unknown }, over: Record<string, unknown> = {}) => dataSourceAccessConditionsV1Schema.parse({
  schemaVersion: "eiah.data-source-access-conditions.v1", connectionId: conn.connectionId, sourceId: SYNTHETIC_SOURCE_ID, scope: conn.scope,
  authentication: { status: "declared", value: { requirement: "none" }, basis: "synthetic" }, reuseConditions: UNKNOWN, limits: UNKNOWN, costs: UNKNOWN, expectedUpdateFrequency: UNKNOWN,
  authorizationGranted: false, ...over,
});
const request = (over: Record<string, unknown> = {}) => ({
  schemaVersion: "eiah.source-query-request.v1", sourceId: SYNTHETIC_SOURCE_ID, operation: SYNTHETIC_OPERATION, purpose: SYNTHETIC_PURPOSE, params: { code: "0000" }, ...over,
});

type CaseRecord = { caseId: string; caseType: string; revision: number; context: { port: string } };
function makeRig(opts: { adapterTimeoutMs?: number; allowSynthetic?: boolean; adapters?: "synthetic" | "none"; failAuditOn?: string[]; persistedAudit?: boolean } = {}) {
  const state = {
    contexts: new Map<string, { allowed: boolean; usage: string }>(),
    policies: new Set<string>(), members: new Set<string>(),
    sources: new Map<string, DataSourceV2>(),
    connections: new Map<string, ResolvedConnection>(),
    cases: new Map<string, CaseRecord>(),
    throwInCoreDeps: false,
  };
  const calls = { context: [] as string[], policy: [] as string[], capability: [] as string[], resolve: [] as string[], caseGet: [] as string[], caseMethods: [] as string[] };
  const deps: CoreAccessDeps = {
    async resolveContext(identity) { calls.context.push(key(identity.tenantId, identity.workspaceId)); if (state.throwInCoreDeps) throw new Error("db down"); return state.contexts.get(key(identity.tenantId, identity.workspaceId)) ?? { allowed: false, usage: "blocked" } as never; },
    async resolveScopeDecision(tenantId, workspaceId, scope) {
      calls.policy.push(key(tenantId, workspaceId, scope));
      const allowed = state.policies.has(key(tenantId, workspaceId, scope.trim().toLowerCase()));
      return (allowed ? { allowed: true, reasonCode: "SCOPE_ALLOWED", tenantId, workspaceId, scope: scope.trim().toLowerCase() } : { allowed: false, reasonCode: "POLICY_NOT_FOUND", tenantId, workspaceId, scope }) as never;
    },
    async hasMemberCapability(identity, scope) { calls.capability.push(key(identity.tenantId, identity.workspaceId, identity.userId ?? "", scope)); return state.members.has(key(identity.tenantId, identity.workspaceId, identity.userId ?? "", scope.trim().toLowerCase())); },
  };
  const audit = createInMemoryAuditSink();
  const sink: SourceQueryAuditSink = {
    name: opts.persistedAudit ? "fake_durable" : audit.name,
    async record(event) {
      if (opts.failAuditOn?.includes(event.event)) throw new Error("audit store down");
      await audit.record(event);
      return opts.persistedAudit ? { durability: "persisted", ref: `fake-ledger-${audit.events.length}` } : { durability: "in_memory_only" };
    },
  };
  const adapter = createSyntheticSourceAdapter();
  const caseSnapshots = () => JSON.stringify([...state.cases.entries()]);
  const service = createSourceQueryService({
    access: createCoreSourceQueryAccess(deps),
    sources: { get: (id) => state.sources.get(id) ?? null },
    connections: { async resolve(scope, sourceId) { calls.resolve.push(key(scope.tenantId, scope.workspaceId, sourceId)); return state.connections.get(key(scope.tenantId, scope.workspaceId, sourceId)) ?? null; } },
    adapters: opts.adapters === "none" ? noAdapters : syntheticAdapterRegistry(adapter),
    cases: { async get(scope, caseId) { calls.caseGet.push(key(scope.tenantId, scope.workspaceId, caseId)); const c = state.cases.get(key(scope.tenantId, scope.workspaceId, caseId)); return c ? { caseId: c.caseId, caseType: c.caseType, revision: c.revision } : null; } },
    audit: sink,
    newId: (() => { let n = 0; return () => `id${(n += 1).toString().padStart(4, "0")}`; })(),
    now: () => new Date(T0),
    adapterTimeoutMs: opts.adapterTimeoutMs ?? 2000,
    allowSyntheticAdapters: opts.allowSynthetic ?? true,
  });
  const enable = (ctx: TrustedServerContext, withCase = false) => {
    state.contexts.set(key(ctx.tenantId, ctx.workspaceId), { allowed: true, usage: "full" });
    for (const scope of [ORACULO_SOURCE_QUERY_SCOPE, POLICY_REF]) {
      state.policies.add(key(ctx.tenantId, ctx.workspaceId, scope));
      state.members.add(key(ctx.tenantId, ctx.workspaceId, ctx.userId ?? "", scope));
    }
    const conn = connectionFor(ctx);
    state.connections.set(key(ctx.tenantId, ctx.workspaceId, SYNTHETIC_SOURCE_ID), { connection: conn, conditions: conditionsFor(conn) });
    if (withCase) state.cases.set(key(ctx.tenantId, ctx.workspaceId, "case-1"), { caseId: "case-1", caseType: "SYNTHETIC_CASE", revision: 3, context: { port: "unset" } });
  };
  state.sources.set(SYNTHETIC_SOURCE_ID, activeSource());
  enable(CTX_A, true);
  return { state, calls, deps, audit, adapter, service, enable, caseSnapshots };
}
type Rig = ReturnType<typeof makeRig>;

const outcomeOf = async (rig: Rig, req: unknown, ctx: TrustedServerContext = CTX_A) => rig.service.execute(req, ctx);
const denied = (out: Awaited<ReturnType<Rig["service"]["execute"]>>) => { assert.equal(out.status, "denied"); return out as Extract<typeof out, { status: "denied" }>; };
const executed = (out: Awaited<ReturnType<Rig["service"]["execute"]>>) => { assert.equal(out.status, "executed"); return out as Extract<typeof out, { status: "executed" }>; };

// ---------------------------------------------------------------------------------------------------------
test("caminho permitido: o adaptador é chamado UMA vez, com contexto mínimo, e o resultado chega tipado com evidência", async () => {
  const rig = makeRig();
  const out = executed(await outcomeOf(rig, request()));
  assert.equal(rig.adapter.calls.length, 1, "exatamente uma chamada ao adaptador");
  assert.equal(out.adapterInvocations, 1);
  assert.equal(out.caseMutationApplied, false);
  const { result } = out;
  assert.equal(result.outcome, "success");
  assert.equal(result.sourceId, SYNTHETIC_SOURCE_ID);
  assert.equal(result.connectionId, "synthetic.conn-workspace-synthetic-a1");
  assert.deepEqual(result.scope, { kind: "tenant_workspace", tenantId: CTX_A.tenantId, workspaceId: CTX_A.workspaceId }, "escopo do resultado é o da conexão resolvida no servidor");
  assert.equal(result.contentSchemaVersion, "synthetic.lookup.v1");
  assert.equal(result.dates.collectedAt, T0);
  assert.ok(result.warnings.some((w) => w.kind === "quality" && /sint[ée]tico/i.test(w.message)), "o resultado diz que veio de adaptador sintético");
  if (result.outcome !== "success") throw new Error("esperado success");
  // evidência: origem de sistema, hash do original e da transformação conferem; nada promovido
  assert.equal(result.origin.origin.kind, "system_obtained");
  assert.equal(result.origin.validation.status, "not_validated");
  assert.equal(result.origin.approval.status, "not_requested");
  assert.equal(result.origin.operationalAuthorization, false);
  assert.equal(result.origin.contentSha256, result.evidence.original.sha256);
  assert.equal(result.evidence.transformation.outputSha256, canonicalSha256(result.content.kind === "inline" ? result.content.records : null));
  assert.deepEqual(out.evidenceRefs, [{ evidenceId: result.origin.evidenceId, contentSha256: result.evidence.original.sha256 }]);
  assert.deepEqual(out.proposals, []);
  // contexto mínimo do adaptador: sem usuário, sem tenant/workspace soltos, sem credencial, sem URL
  const call = rig.adapter.calls[0];
  assert.deepEqual(Object.keys(call).sort(), ["connectionId", "correlationId", "operation", "params", "purpose", "scope", "sourceId", "sourceVersion"]);
  const serialized = JSON.stringify(call);
  for (const forbidden of [CTX_A.userId as string, "credref", "http", "token", "password"]) assert.equal(serialized.includes(forbidden), false, `contexto do adaptador não pode conter ${forbidden}`);
  // a saída respeita o contrato público
  assert.equal(sourceQueryOutcomeV1Schema.safeParse(out).success, true);
});

test("caminho negado NÃO chama o adaptador: cada recusa tem estágio e código próprios e é auditada", async () => {
  type Case = [string, (...args: [Rig]) => unknown, Record<string, unknown>, string, string];
  const cases: Case[] = [
    ["contexto da vertical negado", (r) => r.state.contexts.set(key(CTX_A.tenantId, CTX_A.workspaceId), { allowed: false, usage: "blocked" }), {}, "access", "ACCESS_CONTEXT_DENIED"],
    ["contexto somente leitura (revogado) não faz consulta externa", (r) => r.state.contexts.set(key(CTX_A.tenantId, CTX_A.workspaceId), { allowed: true, usage: "read_only" }), {}, "access", "ACCESS_CONTEXT_DENIED"],
    ["sem política exata de consulta no workspace", (r) => r.state.policies.delete(key(CTX_A.tenantId, CTX_A.workspaceId, ORACULO_SOURCE_QUERY_SCOPE)), {}, "access", "QUERY_SCOPE_DENIED"],
    ["sem capacidade explícita de consulta no vínculo do membro", (r) => r.state.members.delete(key(CTX_A.tenantId, CTX_A.workspaceId, CTX_A.userId as string, ORACULO_SOURCE_QUERY_SCOPE)), {}, "access", "QUERY_SCOPE_DENIED"],
    ["falha na avaliação do Core nega (fail-closed)", (r) => { r.state.throwInCoreDeps = true; }, {}, "access", "ACCESS_CONTEXT_DENIED"],
    ["fonte desconhecida", () => undefined, { sourceId: "synthetic.unknown-source" }, "source", "SOURCE_UNKNOWN"],
    ["fonte mapeada (estado técnico)", (r) => r.state.sources.set(SYNTHETIC_SOURCE_ID, activeSource({ lifecycleState: "mapped" })), {}, "source", "SOURCE_NOT_ACTIVE"],
    ["fonte em configuração", (r) => r.state.sources.set(SYNTHETIC_SOURCE_ID, activeSource({ lifecycleState: "configuring" })), {}, "source", "SOURCE_NOT_ACTIVE"],
    ["fonte em teste", (r) => r.state.sources.set(SYNTHETIC_SOURCE_ID, activeSource({ lifecycleState: "testing" })), {}, "source", "SOURCE_NOT_ACTIVE"],
    ["fonte validada mas não ativa (validada ≠ autorizada)", (r) => r.state.sources.set(SYNTHETIC_SOURCE_ID, activeSource({ lifecycleState: "validated" })), {}, "source", "SOURCE_NOT_ACTIVE"],
    ["fonte suspensa", (r) => r.state.sources.set(SYNTHETIC_SOURCE_ID, activeSource({ lifecycleState: "suspended" })), {}, "source", "SOURCE_SUSPENDED"],
    ["fonte de outro tenant", (r) => r.state.sources.set(SYNTHETIC_SOURCE_ID, activeSource({ scope: { kind: "tenant_workspace", tenantId: CTX_B.tenantId, workspaceId: CTX_B.workspaceId } })), {}, "source", "SOURCE_SCOPE_MISMATCH"],
    ["fonte com metadado inválido não é utilizável", (r) => r.state.sources.set(SYNTHETIC_SOURCE_ID, { ...activeSource(), authorizationGranted: true } as never), {}, "source", "SOURCE_UNKNOWN"],
    ["sem conexão", (r) => r.state.connections.delete(key(CTX_A.tenantId, CTX_A.workspaceId, SYNTHETIC_SOURCE_ID)), {}, "connection", "CONNECTION_MISSING"],
    ["resolvedor devolve conexão de outro workspace", (r) => r.state.connections.set(key(CTX_A.tenantId, CTX_A.workspaceId, SYNTHETIC_SOURCE_ID), { connection: connectionFor(CTX_B), conditions: conditionsFor(connectionFor(CTX_B)) }), {}, "connection", "CONNECTION_SCOPE_MISMATCH"],
    ["conexão desabilitada", (r) => { const c = connectionFor(CTX_A, { enablement: { status: "disabled" } }); r.state.connections.set(key(CTX_A.tenantId, CTX_A.workspaceId, SYNTHETIC_SOURCE_ID), { connection: c, conditions: conditionsFor(c) }); }, {}, "connection", "CONNECTION_DISABLED"],
    ["conexão suspensa", (r) => { const c = connectionFor(CTX_A, { enablement: { status: "disabled" }, suspension: { status: "suspended", reason: "synthetic", suspendedBy: "synthetic-admin", suspendedAt: T0 } }); r.state.connections.set(key(CTX_A.tenantId, CTX_A.workspaceId, SYNTHETIC_SOURCE_ID), { connection: c, conditions: conditionsFor(c) }); }, {}, "connection", "CONNECTION_SUSPENDED"],
    ["conexão não configurada (rascunho)", (r) => { const c = connectionFor(CTX_A, { configuration: "incomplete", enablement: { status: "disabled" } }); r.state.connections.set(key(CTX_A.tenantId, CTX_A.workspaceId, SYNTHETIC_SOURCE_ID), { connection: c, conditions: conditionsFor(c) }); }, {}, "connection", "CONNECTION_NOT_CONFIGURED"],
    ["modalidade da conexão não confirmada na fonte", (r) => { const c = connectionFor(CTX_A, { config: { mode: "data_file", expectedFormat: "json", origin: { kind: "tenant_upload" } } }); r.state.connections.set(key(CTX_A.tenantId, CTX_A.workspaceId, SYNTHETIC_SOURCE_ID), { connection: c, conditions: conditionsFor(c) }); }, {}, "connection", "CONNECTION_INCOMPATIBLE"],
    ["versão da fonte diferente da conexão", (r) => { const c = connectionFor(CTX_A, { sourceVersion: 2 }); r.state.connections.set(key(CTX_A.tenantId, CTX_A.workspaceId, SYNTHETIC_SOURCE_ID), { connection: c, conditions: conditionsFor(c) }); }, {}, "connection", "CONNECTION_INCOMPATIBLE"],
    ["conexão sem condições de acesso", (r) => { const c = connectionFor(CTX_A); r.state.connections.set(key(CTX_A.tenantId, CTX_A.workspaceId, SYNTHETIC_SOURCE_ID), { connection: c, conditions: null }); }, {}, "connection", "CONDITIONS_MISSING_OR_INCOMPATIBLE"],
    ["condições de outra conexão", (r) => { const c = connectionFor(CTX_A); r.state.connections.set(key(CTX_A.tenantId, CTX_A.workspaceId, SYNTHETIC_SOURCE_ID), { connection: c, conditions: conditionsFor({ connectionId: "synthetic.conn-other", scope: c.scope }) }); }, {}, "connection", "CONDITIONS_MISSING_OR_INCOMPATIBLE"],
    ["autenticação desconhecida não é 'sem autenticação'", (r) => { const c = connectionFor(CTX_A); r.state.connections.set(key(CTX_A.tenantId, CTX_A.workspaceId, SYNTHETIC_SOURCE_ID), { connection: c, conditions: conditionsFor(c, { authentication: UNKNOWN }) }); }, {}, "connection", "AUTHENTICATION_UNKNOWN"],
    ["exige credencial e não há resolvedor de credenciais", (r) => { const c = connectionFor(CTX_A); r.state.connections.set(key(CTX_A.tenantId, CTX_A.workspaceId, SYNTHETIC_SOURCE_ID), { connection: c, conditions: conditionsFor(c, { authentication: { status: "declared", value: { requirement: "credential_required", schemes: ["api_key"] }, basis: "synthetic" }, credentialRef: "credref:synthetic-0001" }) }); }, {}, "connection", "CREDENTIAL_RESOLUTION_UNAVAILABLE"],
    ["política referenciada de outro tipo", (r) => { const c = connectionFor(CTX_A, { accessPolicyRef: { kind: "tenant_product_installation", ref: "LOGISTICA" } }); r.state.connections.set(key(CTX_A.tenantId, CTX_A.workspaceId, SYNTHETIC_SOURCE_ID), { connection: c, conditions: conditionsFor(c) }); }, {}, "policy", "POLICY_REFERENCE_INVALID"],
    ["conexão não pode apontar para escopo de outro domínio", (r) => { const c = connectionFor(CTX_A, { accessPolicyRef: { kind: "tenant_action_policy", ref: "billing.write" } }); r.state.connections.set(key(CTX_A.tenantId, CTX_A.workspaceId, SYNTHETIC_SOURCE_ID), { connection: c, conditions: conditionsFor(c) }); r.state.policies.add(key(CTX_A.tenantId, CTX_A.workspaceId, "billing.write")); r.state.members.add(key(CTX_A.tenantId, CTX_A.workspaceId, CTX_A.userId as string, "billing.write")); }, {}, "policy", "POLICY_REFERENCE_INVALID"],
    ["sem política exata do escopo da conexão", (r) => r.state.policies.delete(key(CTX_A.tenantId, CTX_A.workspaceId, POLICY_REF)), {}, "policy", "CONNECTION_POLICY_DENIED"],
    ["sem capacidade do membro para o escopo da conexão", (r) => r.state.members.delete(key(CTX_A.tenantId, CTX_A.workspaceId, CTX_A.userId as string, POLICY_REF)), {}, "policy", "CONNECTION_POLICY_DENIED"],
    ["operação não suportada", () => undefined, { operation: "synthetic_delete_everything" }, "adapter", "OPERATION_NOT_SUPPORTED"],
    ["operação herdada do protótipo", () => undefined, { operation: "constructor" }, "adapter", "OPERATION_NOT_SUPPORTED"],
    ["finalidade não permitida para a operação", () => undefined, { purpose: "marketing_enrichment" }, "adapter", "PURPOSE_NOT_ALLOWED"],
    ["parâmetro fora do formato", () => undefined, { params: { code: "12" } }, "parameters", "PARAMETERS_INVALID"],
    ["parâmetro extra: URL", () => undefined, { params: { code: "0000", url: "https://evil.invalid/steal" } }, "parameters", "PARAMETERS_INVALID"],
    ["parâmetro extra: tenant", () => undefined, { params: { code: "0000", tenantId: CTX_B.tenantId } }, "parameters", "PARAMETERS_INVALID"],
    ["parâmetro obrigatório ausente", () => undefined, { params: {} }, "parameters", "PARAMETERS_INVALID"],
    ["parâmetro com tipo errado", () => undefined, { params: { code: 1234 } }, "parameters", "PARAMETERS_INVALID"],
    ["caso inexistente", () => undefined, { caseRef: { caseId: "case-404", expectedRevision: 3 } }, "case", "CASE_NOT_FOUND"],
    ["revisão do caso diferente da esperada", () => undefined, { caseRef: { caseId: "case-1", expectedRevision: 2 } }, "case", "CASE_REVISION_MISMATCH"],
  ];
  for (const [label, setup, override, stage, reasonCode] of cases) {
    const rig = makeRig();
    setup(rig);
    const out = denied(await outcomeOf(rig, request(override)));
    assert.equal(out.stage, stage, label);
    assert.equal(out.reasonCode, reasonCode, label);
    assert.equal(out.adapterInvoked, false, label);
    assert.equal(out.caseMutationApplied, false, label);
    assert.equal(rig.adapter.calls.length, 0, `${label}: o adaptador não pode ser chamado`);
    const last = rig.audit.events.at(-1);
    assert.deepEqual([last?.event, last?.reasonCode, last?.stage], ["oraculo.source_query.denied", reasonCode, stage], `${label}: recusa auditada`);
    assert.equal(sourceQueryOutcomeV1Schema.safeParse(out).success, true, label);
  }
  assert.equal(cases.length, 38);
});

test("recusas por entrada e por contexto: solicitação inválida, contexto sem usuário/tenant, auditoria indisponível", async () => {
  for (const [label, raw] of [["não-objeto", "texto"], ["nulo", null], ["versão errada", request({ schemaVersion: "eiah.source-query-request.v2" })], ["campo extra", request({ extra: 1 })], ["sem fonte", { ...request(), sourceId: undefined }], ["correlação curta", request({ correlationId: "abc" })], ["params gigante", request({ params: { code: "0000", blob: "x".repeat(9000) } })]] as const) {
    const rig = makeRig();
    const out = denied(await outcomeOf(rig, raw));
    assert.deepEqual([out.stage, out.reasonCode], ["request", "REQUEST_INVALID"], label);
    assert.equal(rig.adapter.calls.length, 0, label);
    assert.equal(rig.calls.context.length, 0, `${label}: nem o Core é consultado com entrada inválida`);
  }
  for (const [label, ctx] of [["sem usuário", { ...CTX_A, userId: undefined }], ["usuário vazio", { ...CTX_A, userId: "  " }], ["sem tenant", { ...CTX_A, tenantId: "" }], ["sem workspace", { ...CTX_A, workspaceId: "" }]] as const) {
    const rig = makeRig();
    const out = denied(await outcomeOf(rig, request(), ctx as TrustedServerContext));
    assert.deepEqual([out.stage, out.reasonCode], ["access", "CONTEXT_MISSING"], label);
    assert.equal(rig.adapter.calls.length + rig.calls.context.length, 0, label);
  }
  const noAudit = makeRig({ failAuditOn: ["oraculo.source_query.authorized"] });
  const out = denied(await outcomeOf(noAudit, request()));
  assert.deepEqual([out.stage, out.reasonCode], ["audit", "AUDIT_UNAVAILABLE"]);
  assert.equal(noAudit.adapter.calls.length, 0, "sem rastro da autorização, nada é despachado");
  const noAuditOnDeny = makeRig({ failAuditOn: ["oraculo.source_query.denied"] });
  noAuditOnDeny.state.sources.clear();
  assert.equal(denied(await outcomeOf(noAuditOnDeny, request())).reasonCode, "SOURCE_UNKNOWN", "falha de auditoria numa negação não vira permissão");
});

test("identidade, escopo, URL, credencial e autorização enviados pelo cliente/LLM não existem no contrato e nunca substituem o servidor", async () => {
  const injections: Array<[string, unknown]> = [
    ["tenantId", CTX_B.tenantId], ["workspaceId", CTX_B.workspaceId], ["userId", CTX_B.userId], ["url", "https://evil.invalid/x"], ["endpoint", "https://evil.invalid/x"],
    ["credentialRef", "credref:steal-0001"], ["apiKey", "sk-live-abcdef"], ["token", "t"], ["authorization", "Bearer abcdefgh12345678"], ["allowed", true],
    ["grantsAuthorization", true], ["scope", { kind: "shared" }], ["connectionId", "synthetic.conn-workspace-synthetic-b1"], ["adapter", "evil"], ["policyScope", "log.oraculo_source.query"],
  ];
  for (const [field, value] of injections) {
    const rig = makeRig();
    rig.enable(CTX_B);
    const out = denied(await outcomeOf(rig, request({ [field]: value })));
    assert.equal(out.reasonCode, "REQUEST_INVALID", field);
    assert.equal(rig.adapter.calls.length, 0, field);
    assert.equal(rig.calls.context.length + rig.calls.policy.length + rig.calls.resolve.length, 0, `${field}: nada foi avaliado com dados do cliente`);
  }
  // Solicitação válida: toda avaliação usa EXCLUSIVAMENTE o contexto do servidor.
  const rig = makeRig();
  rig.enable(CTX_B);
  executed(await outcomeOf(rig, request(), CTX_A));
  const everything = [...rig.calls.context, ...rig.calls.policy, ...rig.calls.capability, ...rig.calls.resolve];
  assert.ok(everything.length >= 6);
  assert.ok(everything.every((entry) => entry.startsWith(`${CTX_A.tenantId}|${CTX_A.workspaceId}`)), `só o escopo do servidor foi usado: ${everything.join(" ; ")}`);
  assert.equal(JSON.stringify(rig.audit.events).includes(CTX_B.tenantId), false);
  assert.equal(rig.audit.events.every((e) => e.tenantId === CTX_A.tenantId && e.workspaceId === CTX_A.workspaceId && e.userId === CTX_A.userId), true, "auditoria usa a identidade do servidor");
});

test("isolamento entre workspaces: conexão, política, capacidade e caso não vazam de um escopo para outro", async () => {
  const rig = makeRig();
  rig.enable(CTX_B, true);
  const a = executed(await outcomeOf(rig, request(), CTX_A));
  const b = executed(await outcomeOf(rig, request(), CTX_B));
  assert.notEqual(a.result.connectionId, b.result.connectionId);
  assert.deepEqual(rig.adapter.calls.map((c) => c.connectionId), ["synthetic.conn-workspace-synthetic-a1", "synthetic.conn-workspace-synthetic-b1"], "cada escopo usa a própria conexão");
  // usuário de A num workspace de B sem vínculo: negado, sem chamar o adaptador
  const before = rig.adapter.calls.length;
  const foreignUser = denied(await outcomeOf(rig, request(), { ...CTX_B, userId: CTX_A.userId }));
  assert.equal(foreignUser.reasonCode, "QUERY_SCOPE_DENIED");
  // mesmo tenant, outro workspace sem nada configurado
  const sibling = denied(await outcomeOf(rig, request(), { ...CTX_A, workspaceId: "workspace-synthetic-A2" }));
  assert.equal(sibling.reasonCode, "ACCESS_CONTEXT_DENIED");
  assert.equal(rig.adapter.calls.length, before);
  // workspace sem conexão (mas com acesso) não enxerga a conexão de A
  const lonely: TrustedServerContext = { tenantId: "tenant-synthetic-C", workspaceId: "workspace-synthetic-C1", userId: "user-synthetic-3" };
  rig.enable(lonely);
  rig.state.connections.delete(key(lonely.tenantId, lonely.workspaceId, SYNTHETIC_SOURCE_ID));
  assert.equal(denied(await outcomeOf(rig, request(), lonely)).reasonCode, "CONNECTION_MISSING");
  // caso de B não existe para A
  rig.state.cases.delete(key(CTX_A.tenantId, CTX_A.workspaceId, "case-1"));
  assert.equal(denied(await outcomeOf(rig, request({ caseRef: { caseId: "case-1", expectedRevision: 3 } }), CTX_A)).reasonCode, "CASE_NOT_FOUND");
  assert.equal(executed(await outcomeOf(rig, request({ caseRef: { caseId: "case-1", expectedRevision: 3 } }), CTX_B)).result.caseRef?.workspaceId, CTX_B.workspaceId);
});

test("resultado vazio ≠ falha: cada um mantém seu tipo, e erro do adaptador não vaza segredo", async () => {
  const run = async (code: string, opts: Parameters<typeof makeRig>[0] = {}) => { const rig = makeRig(opts); const out = executed(await outcomeOf(rig, request({ params: { code } }))); assert.equal(rig.adapter.calls.length, 1, code); return out; };
  const empty = await run("0001");
  assert.equal(empty.result.outcome, "empty");
  assert.equal(empty.result.outcome === "empty" && empty.result.emptyReason, "no_matching_records");
  assert.equal(empty.evidenceRefs.length, 1, "vazio é uma resposta real e tem evidência");
  assert.equal("error" in empty.result, false);
  const failure = await run("0002");
  assert.equal(failure.result.outcome, "failure");
  assert.deepEqual(failure.result.outcome === "failure" && [failure.result.error.code, failure.result.error.retryable], ["source_unavailable", true]);
  assert.equal(failure.evidenceRefs.length, 0, "falha não carrega evidência de conteúdo");
  assert.equal("origin" in failure.result, false);
  assert.equal((await run("0009")).result.outcome, "not_modified");
  // adaptador lança com segredo na mensagem
  const thrown = await run("0003");
  assert.deepEqual(thrown.result.outcome === "failure" && thrown.result.error.code, "internal_error");
  assert.equal(JSON.stringify(thrown).includes("abc123"), false);
  assert.equal(JSON.stringify(thrown).includes("secret-token"), false);
  // timeout
  const slow = await run("0007", { adapterTimeoutMs: 25 });
  assert.deepEqual(slow.result.outcome === "failure" && [slow.result.error.code, slow.result.error.retryable], ["timeout", true]);
  // contrato violado pelo adaptador
  const garbage = await run("0006");
  assert.equal(garbage.result.outcome === "failure" && garbage.result.error.code, "invalid_response");
  const integrity = await run("0005");
  assert.equal(integrity.result.outcome === "failure" && integrity.result.error.code, "schema_violation", "hash normalizado que não confere é rejeitado");
  const leaky = await run("0010");
  assert.equal(leaky.result.outcome === "failure" && leaky.result.error.code, "schema_violation");
  assert.equal(JSON.stringify(leaky).includes("api_key=abc123"), false, "mensagem com segredo do adaptador não é repassada");
});

test("correlação e evidência chegam ao consumidor; auditoria diz o que foi (e o que NÃO foi) registrado", async () => {
  const rig = makeRig();
  const given = executed(await outcomeOf(rig, request({ correlationId: "corr-client-0001" })));
  assert.equal(given.correlationId, "corr-client-0001");
  assert.equal(rig.adapter.calls[0].correlationId, "corr-client-0001");
  assert.deepEqual(rig.audit.events.map((e) => [e.event, e.correlationId]), [["oraculo.source_query.authorized", "corr-client-0001"], ["oraculo.source_query.completed", "corr-client-0001"]]);
  const generated = executed(await outcomeOf(rig, request()));
  assert.match(generated.correlationId, /^corr_id\d+$/, "gerada pelo servidor quando ausente");
  assert.notEqual(generated.correlationId, given.correlationId);
  assert.notEqual(generated.result.resultId, given.result.resultId);
  // parâmetros nunca vão para a auditoria — só o hash
  const events = JSON.stringify(rig.audit.events);
  assert.equal(events.includes("\"0000\""), false);
  assert.ok(rig.audit.events.every((e) => /^[a-f0-9]{64}$/.test(e.paramsSha256 ?? "")));
  assert.deepEqual(rig.audit.events.at(-1)?.resultOutcome, "success");
  // honestidade: auditoria só em memória NÃO é declarada persistida
  assert.deepEqual(given.audit, { durability: "in_memory_only", sink: "in_memory", eventRefs: [] });
  // só se o destino confirmar durabilidade
  const durable = makeRig({ persistedAudit: true });
  const durableOut = executed(await outcomeOf(durable, request()));
  assert.equal(durableOut.audit.durability, "persisted");
  assert.deepEqual([durableOut.audit.sink, durableOut.audit.eventRefs.length], ["fake_durable", 2]);
  // negado com destino durável também é persistido; sem confirmação, nunca
  const durableDeny = makeRig({ persistedAudit: true });
  durableDeny.state.sources.clear();
  assert.equal(denied(await outcomeOf(durableDeny, request())).audit.durability, "persisted");
  assert.equal(denied(await outcomeOf(makeRig(), request({ params: { code: "1" } }))).audit.durability, "in_memory_only");
});

test("consulta não altera o caso; sugestão do adaptador volta como PROPOSTA, nunca aplicada nem decidida", async () => {
  const rig = makeRig();
  const before = rig.caseSnapshots();
  const plain = executed(await outcomeOf(rig, request({ caseRef: { caseId: "case-1", expectedRevision: 3 } })));
  assert.equal(plain.result.caseRef?.caseId, "case-1");
  assert.deepEqual(plain.result.scope, { kind: "tenant_workspace", tenantId: CTX_A.tenantId, workspaceId: CTX_A.workspaceId });
  assert.deepEqual(plain.proposals, []);
  const withProposal = executed(await outcomeOf(rig, request({ caseRef: { caseId: "case-1", expectedRevision: 3 }, params: { code: "0004" } })));
  assert.equal(withProposal.proposals.length, 1);
  const proposal = withProposal.proposals[0];
  assert.equal(proposal.state, "proposed");
  assert.equal(proposal.decision, undefined, "proposta não vira decisão");
  assert.equal(proposal.caseMutationApplied, false);
  assert.equal(proposal.operationalAuthorization, false);
  assert.equal(proposal.expectedRevision, 3);
  assert.deepEqual([proposal.tenantId, proposal.workspaceId, proposal.caseType], [CTX_A.tenantId, CTX_A.workspaceId, "SYNTHETIC_CASE"]);
  assert.deepEqual(proposal.proposedBy, { kind: "system", ref: `oraculo.source-query:${SYNTHETIC_SOURCE_ID}` });
  assert.deepEqual(proposal.evidence, withProposal.evidenceRefs, "a proposta cita a evidência da consulta");
  assert.deepEqual(proposal.changes.map((c) => [c.fieldPath, c.operation, c.evidenceIds.length]), [["context.port", "set", 1]]);
  assert.equal(rig.caseSnapshots(), before, "o caso permanece idêntico");
  assert.equal(rig.state.cases.get(key(CTX_A.tenantId, CTX_A.workspaceId, "case-1"))?.context.port, "unset");
  assert.ok(rig.calls.caseGet.length >= 2 && rig.calls.caseGet.every((c) => c.startsWith(`${CTX_A.tenantId}|${CTX_A.workspaceId}|`)), "o caso só é lido, no escopo do servidor");
  // sem caso, sugestão é violação do contrato do adaptador (nada é proposto)
  const orphan = executed(await outcomeOf(rig, request({ params: { code: "0008" } })));
  assert.equal(orphan.result.outcome, "failure");
  assert.deepEqual(orphan.proposals, []);
  // a porta de caso não tem escrita
  const casePort = createPreparationCasePort(() => ({ get: async () => null }));
  assert.deepEqual(Object.keys(casePort), ["get"]);
});

test("sem fila e sem cache de autorização: a política é reavaliada a cada execução (revogar vale já na chamada seguinte)", async () => {
  const rig = makeRig();
  executed(await outcomeOf(rig, request()));
  rig.state.policies.delete(key(CTX_A.tenantId, CTX_A.workspaceId, POLICY_REF));
  assert.equal(denied(await outcomeOf(rig, request())).reasonCode, "CONNECTION_POLICY_DENIED");
  rig.state.policies.add(key(CTX_A.tenantId, CTX_A.workspaceId, POLICY_REF));
  executed(await outcomeOf(rig, request()));
  rig.state.contexts.set(key(CTX_A.tenantId, CTX_A.workspaceId), { allowed: true, usage: "read_only" });
  assert.equal(denied(await outcomeOf(rig, request())).reasonCode, "ACCESS_CONTEXT_DENIED");
  rig.state.contexts.set(key(CTX_A.tenantId, CTX_A.workspaceId), { allowed: true, usage: "full" });
  rig.state.sources.set(SYNTHETIC_SOURCE_ID, activeSource({ lifecycleState: "suspended" }));
  assert.equal(denied(await outcomeOf(rig, request())).reasonCode, "SOURCE_SUSPENDED");
  assert.equal(rig.adapter.calls.length, 2, "duas execuções permitidas, três negadas, nenhuma chamada extra");
});

test("padrão negar-tudo e catálogo real: nenhuma fonte mapeada é consultável, mesmo com acesso, conexão e adaptador presentes", async () => {
  const registry = DATA_SOURCE_REGISTRY_V2;
  const snapshot = JSON.stringify(registry);
  for (const source of registry.sources) {
    assert.equal(source.lifecycleState, "mapped");
    // (a) padrão de produção: sem armazenamento de conexões e sem adaptadores
    const rig = makeRig({ adapters: "none" });
    const prod = createSourceQueryService({
      access: createCoreSourceQueryAccess(rig.deps), sources: { get: (id) => registry.sources.find((s) => s.sourceId === id) ?? null },
      connections: denyAllConnections, adapters: noAdapters, cases: { get: async () => null }, audit: createInMemoryAuditSink(),
    });
    const a = denied(await prod.execute(request({ sourceId: source.sourceId }), CTX_A));
    assert.deepEqual([a.stage, a.reasonCode], ["source", "SOURCE_NOT_ACTIVE"], source.sourceId);
    // (b) mesmo com conexão apontando para ela e adaptador registrado, continua negada (mapped não vira permissão)
    const b = makeRig();
    b.state.sources.set(source.sourceId, source);
    const conn = connectionFor(CTX_A, { sourceId: source.sourceId });
    b.state.connections.set(key(CTX_A.tenantId, CTX_A.workspaceId, source.sourceId), { connection: conn, conditions: conditionsFor(conn, { sourceId: source.sourceId }) });
    const out = denied(await outcomeOf(b, request({ sourceId: source.sourceId })));
    assert.equal(out.reasonCode, "SOURCE_NOT_ACTIVE", source.sourceId);
    assert.equal(b.adapter.calls.length, 0);
  }
  assert.equal(JSON.stringify(registry), snapshot, "o teste não alterou o catálogo");
  assert.equal(registry.sources.some((s) => s.sourceId === SYNTHETIC_SOURCE_ID), false, "o adaptador/fonte sintético não está no catálogo");
  // Adaptador sintético é recusado fora de teste
  const rig = makeRig({ allowSynthetic: false });
  assert.equal(denied(await outcomeOf(rig, request())).reasonCode, "ADAPTER_SYNTHETIC_NOT_ALLOWED");
  assert.equal(rig.adapter.calls.length, 0);
  assert.equal(denied(await outcomeOf(makeRig({ adapters: "none" }), request())).reasonCode, "ADAPTER_NOT_REGISTERED");
});

// ---------------------------------------------------------------------------------------------------------
test("composição com o Core: exige contexto pleno + política exata + capacidade do membro, sempre com a identidade do servidor", async () => {
  const mk = (over: Partial<CoreAccessDeps> = {}) => {
    const log: string[] = [];
    const deps: CoreAccessDeps = {
      async resolveContext() { log.push("context"); return { allowed: true, usage: "full" }; },
      async resolveScopeDecision(t, w, s) { log.push(`policy:${t}|${w}|${s}`); return { allowed: true, reasonCode: "SCOPE_ALLOWED", tenantId: t, workspaceId: w, scope: s.trim().toLowerCase() } as never; },
      async hasMemberCapability(i, s) { log.push(`cap:${i.userId}|${s}`); return true; },
      ...over,
    };
    return { log, access: createCoreSourceQueryAccess(deps) };
  };
  const ok = mk();
  assert.deepEqual(await ok.access.checkQueryAccess(CTX_A), { allowed: true });
  assert.deepEqual(ok.log, ["context", `policy:${CTX_A.tenantId}|${CTX_A.workspaceId}|${ORACULO_SOURCE_QUERY_SCOPE}`, `cap:${CTX_A.userId}|${ORACULO_SOURCE_QUERY_SCOPE}`]);
  const ro = mk({ resolveContext: async () => ({ allowed: true, usage: "read_only" }) });
  assert.deepEqual(await ro.access.checkQueryAccess(CTX_A), { allowed: false, reasonCode: "ACCESS_CONTEXT_DENIED" });
  assert.deepEqual(ro.log, [], "contexto não pleno: política nem é consultada");
  // decisão de política para OUTRO escopo/tenant/workspace não vale, mesmo com allowed: true
  for (const wrong of [{ scope: "log.context.read" }, { tenantId: "tenant-outro" }, { workspaceId: "workspace-outro" }]) {
    const m = mk({ resolveScopeDecision: async (t, w, s) => ({ allowed: true, reasonCode: "SCOPE_ALLOWED", tenantId: t, workspaceId: w, scope: s.trim().toLowerCase(), ...wrong }) as never });
    assert.deepEqual(await m.access.checkQueryAccess(CTX_A), { allowed: false, reasonCode: "QUERY_SCOPE_DENIED" }, JSON.stringify(wrong));
  }
  assert.deepEqual(await mk({ hasMemberCapability: async () => false }).access.checkQueryAccess(CTX_A), { allowed: false, reasonCode: "QUERY_SCOPE_DENIED" });
  assert.deepEqual(await mk({ resolveContext: async () => { throw new Error("boom"); } }).access.checkQueryAccess(CTX_A), { allowed: false, reasonCode: "ACCESS_CONTEXT_DENIED" });
  // política de conexão: só sob o prefixo do Oráculo, sem consultar o Core para escopos de outros domínios
  const p = mk();
  assert.deepEqual(await p.access.checkConnectionPolicy(CTX_A, "billing.write"), { allowed: false });
  assert.deepEqual(await p.access.checkConnectionPolicy(CTX_A, "log.context.read"), { allowed: false });
  assert.deepEqual(p.log, []);
  assert.deepEqual(await p.access.checkConnectionPolicy(CTX_A, "LOG.ORACULO_SOURCE.Query.X"), { allowed: true }, "escopo normalizado como no TenantPolicyStore");
  assert.deepEqual(await mk({ hasMemberCapability: async () => false }).access.checkConnectionPolicy(CTX_A, POLICY_REF), { allowed: false });
  assert.deepEqual(await mk({ resolveScopeDecision: async () => { throw new Error("db"); } }).access.checkConnectionPolicy(CTX_A, POLICY_REF), { allowed: false });
});

test("auditoria pelo mecanismo existente: só se declara persistida depois da escrita; falha impede o despacho", async () => {
  const writes: Array<Record<string, unknown>> = [];
  const sink = createGuardrailAuditSink({ prisma: {} as never, record: (async (params: Record<string, unknown>) => { writes.push(params); }) as never });
  const rig = makeRig();
  const service = createSourceQueryService({
    access: createCoreSourceQueryAccess(rig.deps), sources: { get: () => activeSource() }, connections: { resolve: async (s, id) => rig.state.connections.get(key(s.tenantId, s.workspaceId, id)) ?? null },
    adapters: syntheticAdapterRegistry(rig.adapter), cases: { get: async () => null }, audit: sink, allowSyntheticAdapters: true, now: () => new Date(T0),
  });
  const out = executed(await service.execute(request(), CTX_A));
  assert.equal(out.audit.durability, "persisted");
  assert.equal(out.audit.sink, "guardrail_audit_ledger");
  assert.deepEqual(writes.map((w) => w.eventType), ["oraculo.source_query.authorized", "oraculo.source_query.completed"]);
  for (const w of writes) {
    assert.deepEqual([w.tenantId, w.workspaceId, w.runId], [CTX_A.tenantId, CTX_A.workspaceId, null]);
    assert.equal(JSON.stringify(w.metadata).includes("\"0000\""), false, "valores dos parâmetros não são gravados");
    assert.match(String((w.metadata as { paramsSha256: string }).paramsSha256), /^[a-f0-9]{64}$/);
  }
  // falha na escrita: nada é despachado
  const failing = createGuardrailAuditSink({ prisma: {} as never, record: (async () => { throw new Error("ledger down"); }) as never });
  const rig2 = makeRig();
  const blocked = createSourceQueryService({
    access: createCoreSourceQueryAccess(rig2.deps), sources: { get: () => activeSource() }, connections: { resolve: async (s, id) => rig2.state.connections.get(key(s.tenantId, s.workspaceId, id)) ?? null },
    adapters: syntheticAdapterRegistry(rig2.adapter), cases: { get: async () => null }, audit: failing, allowSyntheticAdapters: true,
  });
  const out2 = denied(await blocked.execute(request(), CTX_A));
  assert.deepEqual([out2.stage, out2.reasonCode, out2.audit.durability], ["audit", "AUDIT_UNAVAILABLE", "in_memory_only"]);
  assert.equal(rig2.adapter.calls.length, 0);
  // repositório do Oráculo como porta de caso (somente leitura)
  const port = createPreparationCasePort((scope) => ({ get: async (id) => (scope.tenantId === CTX_A.tenantId && id === "case-1" ? { caseId: id, caseType: "ORACULO_EMPTY_RETURN_PREPARATION_V1", revision: 7, extra: "ignorado" } as never : null) }));
  assert.deepEqual(await port.get(CTX_A, "case-1"), { caseId: "case-1", caseType: "ORACULO_EMPTY_RETURN_PREPARATION_V1", revision: 7 });
  assert.equal(await port.get(CTX_B, "case-1"), null);
});

test("não há runtime, executor, fila, rede nem autorização paralelos; consumidores existentes mantêm o comportamento", () => {
  const read = (relative: string) => readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");
  for (const file of ["services/logistica/oraculo/sourceQuery/sourceQueryService.ts", "services/logistica/oraculo/sourceQuery/types.ts", "services/logistica/control/oraculoSourceQueryCoreWiring.ts"]) {
    const code = read(file);
    assert.doesNotMatch(code, /\bfetch\s*\(|callLegacyApi|legacyApiConnector|MCPExecutor|ToolRegistry|mcp-runner|bullmq|\bQueue\b|node:http|node:https|node:net|child_process|process\.env|setInterval|XMLHttpRequest/, `${file}: sem rede, fila, executor ou ambiente`);
    assert.doesNotMatch(code, /prismaGlobal|\$queryRaw|\bprisma\.[a-z]/i, `${file}: sem acesso direto a banco`);
    if (!file.includes("CoreWiring")) assert.doesNotMatch(code, /@repo\/db/, `${file}: só a ligação com o Core conhece o tipo do cliente de banco`);
  }
  const service = read("services/logistica/oraculo/sourceQuery/sourceQueryService.ts");
  assert.doesNotMatch(service, /@eiah\/core|TenantPolicyStore|logisticaContextAccess/, "o serviço não importa o Core: só consome a porta de acesso");
  // IMOB: registro e gate preservados; ids do ensaio não colidem
  assert.deepEqual(DEFAULT_MARKET_SOURCE_REGISTRY.map((e) => e.sourceId), ["internal_crm", "tenant_inventory_import", "manual_input", "public_web_assisted"]);
  assert.equal(decideSourceAccess({ sourceId: "internal_crm", requestedMode: "internal_crm", operation: "market_scan_region", tenantId: "t", workspaceId: "w" }).allowed, true);
  const imob = decideSourceAccess({ sourceId: SYNTHETIC_SOURCE_ID, requestedMode: "official_api", operation: "market_scan_region", tenantId: "t", workspaceId: "w" });
  assert.equal(imob.allowed === false && imob.reasonCode, "SOURCE_NOT_AUTHORIZED");
});
