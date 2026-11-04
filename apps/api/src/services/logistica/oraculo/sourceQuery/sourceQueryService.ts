import { createHash, randomUUID } from "node:crypto";
import { clearTimeout, setTimeout } from "node:timers";
import {
  ORACULO_SOURCE_SCOPE_PREFIX,
  caseUpdateProposalV1Schema,
  checkAccessConditionsAgainstConnection,
  checkConnectionAgainstSourceV2,
  collectionResultV1Schema,
  dataSourceAccessConditionsV1Schema,
  dataSourceConnectionV1Schema,
  dataSourceV2Schema,
  isConnectionVisibleInScope,
  sourceQueryOutcomeV1Schema,
  sourceQueryRequestV1Schema,
  type CaseUpdateProposalV1,
  type CollectionResultV1,
  type SourceQueryDenialCode,
  type SourceQueryOutcomeV1,
} from "@eiah/contracts";
import {
  adapterOutcomeSchema,
  type AdapterOutcome,
  type CasePort,
  type ConnectionResolverPort,
  type SourceAdapterRegistryPort,
  type SourceCatalogPort,
  type SourceQueryAccessPort,
  type SourceQueryAuditEvent,
  type SourceQueryAuditSink,
  type TrustedServerContext,
} from "./types";

/**
 * Serviço do Oráculo para consultar uma fonte: solicitação → autorização no Core → despacho ao adaptador → resultado/evidência.
 *
 * Síncrono e em processo (como o precedente do market scan do IMOB): uma consulta NÃO cria caso, run nem fila. Como não há fila,
 * a autorização é avaliada imediatamente antes do despacho, em cada chamada — nunca reutilizada de uma chamada anterior.
 * Negação por padrão: qualquer porta ausente, exceção ou dúvida resulta em `denied` sem chamar o adaptador.
 *
 * Não é um runtime, executor, fila, registro de agentes nem sistema de autorização: compõe as verificações existentes (via `access`)
 * e delega a execução a um adaptador injetado.
 */
export type SourceQueryServiceDeps = {
  access: SourceQueryAccessPort;
  sources: SourceCatalogPort;
  connections: ConnectionResolverPort;
  adapters: SourceAdapterRegistryPort;
  cases: CasePort;
  /** Obrigatório e sem padrão: quem monta o serviço escolhe (e declara) onde a auditoria vai. */
  audit: SourceQueryAuditSink;
  now?: () => Date;
  newId?: () => string;
  adapterTimeoutMs?: number;
  /** Só testes. Em produção NUNCA se ativa: adaptadores sintéticos são recusados. */
  allowSyntheticAdapters?: boolean;
};

type Audit = SourceQueryOutcomeV1["audit"];
type Denied = Extract<SourceQueryOutcomeV1, { status: "denied" }>;

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as object).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** Padrão negar-tudo: sem armazenamento de conexões implementado, nenhuma fonte tem conexão. */
export const denyAllConnections: ConnectionResolverPort = { resolve: async () => null };
export const noAdapters: SourceAdapterRegistryPort = { find: () => null };

/** Auditoria somente em memória: declara honestamente `in_memory_only`. Serve a testes e a execuções sem destino durável. */
export function createInMemoryAuditSink(): SourceQueryAuditSink & { readonly events: readonly SourceQueryAuditEvent[] } {
  const events: SourceQueryAuditEvent[] = [];
  return {
    name: "in_memory",
    events,
    async record(event) {
      events.push(event);
      return { durability: "in_memory_only" };
    },
  };
}

export function createSourceQueryService(deps: SourceQueryServiceDeps) {
  const now = deps.now ?? (() => new Date());
  const newId = deps.newId ?? (() => randomUUID().replace(/-/g, ""));
  const timeoutMs = deps.adapterTimeoutMs ?? 10_000;

  async function execute(rawRequest: unknown, context: TrustedServerContext): Promise<SourceQueryOutcomeV1> {
    const rawCorrelation = (rawRequest as { correlationId?: unknown } | null)?.correlationId;
    const parsedRequest = sourceQueryRequestV1Schema.safeParse(rawRequest);
    const correlationId = parsedRequest.success && parsedRequest.data.correlationId ? parsedRequest.data.correlationId
      : typeof rawCorrelation === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(rawCorrelation) ? rawCorrelation : `corr_${newId()}`;
    const auditBase = {
      tenantId: String(context?.tenantId ?? ""), workspaceId: String(context?.workspaceId ?? ""),
      userId: typeof context?.userId === "string" && context.userId.trim() ? context.userId : null, correlationId,
    };
    // `persisted` só é declarado se TODOS os eventos desta chamada foram confirmados como duráveis pelo destino; erro ou memória => não.
    const auditRefs: string[] = [];
    let auditCalls = 0;
    let allPersisted = true;
    const tracked = async (event: Omit<SourceQueryAuditEvent, "tenantId" | "workspaceId" | "userId" | "correlationId">) => {
      auditCalls += 1;
      try {
        const result = await deps.audit.record({ ...auditBase, ...event });
        if (result.durability !== "persisted") allPersisted = false;
        if (result.ref) auditRefs.push(result.ref);
      } catch (error) {
        allPersisted = false;
        throw error;
      }
    };
    const auditDescriptor = (): Audit => ({ durability: auditCalls > 0 && allPersisted ? "persisted" : "in_memory_only", sink: deps.audit.name, eventRefs: auditRefs.slice(0, 10) });

    const deny = async (stage: Denied["stage"], reasonCode: SourceQueryDenialCode, extra: { sourceId?: string; connectionId?: string; operation?: string; paramsSha256?: string } = {}): Promise<SourceQueryOutcomeV1> => {
      try { await tracked({ event: "oraculo.source_query.denied", stage, reasonCode, ...extra }); } catch { /* a negação não depende do registro */ }
      return sourceQueryOutcomeV1Schema.parse({
        schemaVersion: "eiah.source-query-outcome.v1", correlationId, status: "denied", stage, reasonCode,
        adapterInvoked: false, caseMutationApplied: false, audit: auditDescriptor(),
      });
    };

    // 0. Identidade/escopo vêm do servidor. Sem eles não há o que avaliar.
    if (!auditBase.tenantId.trim() || !auditBase.workspaceId.trim() || !auditBase.userId) return deny("access", "CONTEXT_MISSING");

    // 1. Solicitação estrita: tenant/workspace/usuário/URL/credencial/autorização enviados pelo cliente não existem no contrato e são rejeitados.
    if (!parsedRequest.success) return deny("request", "REQUEST_INVALID");
    const request = parsedRequest.data;
    const identity: TrustedServerContext = { tenantId: auditBase.tenantId, workspaceId: auditBase.workspaceId, userId: auditBase.userId };
    const scope = { tenantId: identity.tenantId, workspaceId: identity.workspaceId };
    const paramsSha256 = sha256(canonicalJson(request.params));
    const tags = { sourceId: request.sourceId, operation: request.operation, paramsSha256 };

    // 2. Acesso geral do Core, ANTES de revelar qualquer detalhe de fonte/conexão (negação uniforme para quem não tem acesso).
    let general: Awaited<ReturnType<SourceQueryAccessPort["checkQueryAccess"]>>;
    try { general = await deps.access.checkQueryAccess(identity); } catch { general = { allowed: false, reasonCode: "ACCESS_CONTEXT_DENIED" }; }
    if (!general.allowed) return deny("access", general.reasonCode);

    // 3. Fonte: conhecida, íntegra e ESTADO TÉCNICO ativo. Mapeada/em configuração/em teste/validada/suspensa não consultam.
    let source: ReturnType<typeof dataSourceV2Schema.parse> | null = null;
    try {
      const found = await deps.sources.get(request.sourceId);
      const parsed = found ? dataSourceV2Schema.safeParse(found) : null;
      source = parsed?.success ? parsed.data : null;
    } catch { source = null; }
    if (!source || source.sourceId !== request.sourceId) return deny("source", "SOURCE_UNKNOWN", tags);
    if (source.scope.kind === "tenant_workspace" && (source.scope.tenantId !== scope.tenantId || source.scope.workspaceId !== scope.workspaceId)) return deny("source", "SOURCE_SCOPE_MISMATCH", tags);
    if (source.lifecycleState === "suspended") return deny("source", "SOURCE_SUSPENDED", tags);
    // A condição de uso é um conceito separado do estado técnico; o contrato da fonte (v2) já impede `active` sem uso permitido e licença verificada.
    if (source.lifecycleState !== "active") return deny("source", "SOURCE_NOT_ACTIVE", tags);
    const granularity = source.granularity.status === "declared" || source.granularity.status === "verified" ? source.granularity.value : undefined;
    if (granularity === "collection_to_select") return deny("source", "SOURCE_NOT_SPECIFIC", tags);

    // 4. Conexão aplicável ao escopo do servidor.
    let resolved: Awaited<ReturnType<ConnectionResolverPort["resolve"]>> = null;
    try { resolved = await deps.connections.resolve(scope, source.sourceId); } catch { resolved = null; }
    if (!resolved) return deny("connection", "CONNECTION_MISSING", tags);
    const parsedConnection = dataSourceConnectionV1Schema.safeParse(resolved.connection);
    if (!parsedConnection.success) return deny("connection", "CONNECTION_INCOMPATIBLE", tags);
    const connection = parsedConnection.data;
    const withConnection = { ...tags, connectionId: connection.connectionId };
    if (!isConnectionVisibleInScope(connection, scope)) return deny("connection", "CONNECTION_SCOPE_MISMATCH", withConnection);
    if (checkConnectionAgainstSourceV2(connection, source).length > 0) return deny("connection", "CONNECTION_INCOMPATIBLE", withConnection);
    if (connection.suspension.status === "suspended") return deny("connection", "CONNECTION_SUSPENDED", withConnection);
    // Rascunho (incompleto) é "não configurado"; completo e não habilitado é "desabilitado". O contrato impede habilitar o incompleto.
    if (connection.configuration !== "complete") return deny("connection", "CONNECTION_NOT_CONFIGURED", withConnection);
    if (connection.enablement.status !== "enabled") return deny("connection", "CONNECTION_DISABLED", withConnection);
    const parsedConditions = resolved.conditions ? dataSourceAccessConditionsV1Schema.safeParse(resolved.conditions) : null;
    if (!parsedConditions?.success || checkAccessConditionsAgainstConnection(parsedConditions.data, connection).length > 0) return deny("connection", "CONDITIONS_MISSING_OR_INCOMPATIBLE", withConnection);
    const authentication = parsedConditions.data.authentication;
    const authValue = authentication.status === "declared" || authentication.status === "verified" ? authentication.value : undefined;
    if (!authValue) return deny("connection", "AUTHENTICATION_UNKNOWN", withConnection);
    // Não existe resolvedor de credenciais: nada que exija credencial pode ser executado hoje (nem a referência opaca é repassada ao adaptador).
    if (authValue.requirement !== "none") return deny("connection", "CREDENTIAL_RESOLUTION_UNAVAILABLE", withConnection);

    // 5. Política exata referenciada pela conexão (mecanismo existente do Core), restrita ao prefixo do Oráculo.
    const policyRef = connection.accessPolicyRef;
    if (policyRef.kind !== "tenant_action_policy" || !policyRef.ref.toLowerCase().startsWith(ORACULO_SOURCE_SCOPE_PREFIX)) return deny("policy", "POLICY_REFERENCE_INVALID", withConnection);
    let policyAllowed = false;
    try { policyAllowed = (await deps.access.checkConnectionPolicy(identity, policyRef.ref)).allowed === true; } catch { policyAllowed = false; }
    if (!policyAllowed) return deny("policy", "CONNECTION_POLICY_DENIED", withConnection);

    // 6. Adaptador, operação, finalidade e parâmetros: tudo validado ANTES de despachar. Nada vindo do cliente escolhe destino.
    const adapter = deps.adapters.find(source.sourceId, connection.config.mode);
    if (!adapter || adapter.descriptor.sourceId !== source.sourceId || adapter.descriptor.mode !== connection.config.mode) return deny("adapter", "ADAPTER_NOT_REGISTERED", withConnection);
    if (adapter.descriptor.synthetic === true && deps.allowSyntheticAdapters !== true) return deny("adapter", "ADAPTER_SYNTHETIC_NOT_ALLOWED", withConnection);
    const operation = Object.prototype.hasOwnProperty.call(adapter.descriptor.operations, request.operation) ? adapter.descriptor.operations[request.operation] : undefined;
    if (!operation) return deny("adapter", "OPERATION_NOT_SUPPORTED", withConnection);
    if (!operation.allowedPurposes.includes(request.purpose)) return deny("adapter", "PURPOSE_NOT_ALLOWED", withConnection);
    const params = operation.paramsSchema.safeParse(request.params);
    if (!params.success) return deny("parameters", "PARAMETERS_INVALID", withConnection);

    // 7. Caso (opcional): existência, escopo e revisão verificados no servidor. Somente leitura.
    let caseInfo: { caseId: string; caseType: string; revision: number } | null = null;
    if (request.caseRef) {
      try { caseInfo = await deps.cases.get(scope, request.caseRef.caseId); } catch { caseInfo = null; }
      if (!caseInfo || caseInfo.caseId !== request.caseRef.caseId) return deny("case", "CASE_NOT_FOUND", withConnection);
      if (caseInfo.revision !== request.caseRef.expectedRevision) return deny("case", "CASE_REVISION_MISMATCH", withConnection);
    }

    // 8. Rastro ANTES do despacho: se não for possível registrar a autorização, nada sai (fail-closed).
    try { await tracked({ event: "oraculo.source_query.authorized", ...withConnection }); } catch { return deny("audit", "AUDIT_UNAVAILABLE", withConnection); }

    // 9. Despacho: exatamente uma chamada, com o contexto mínimo.
    let raw: unknown;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failure: { code: "timeout" | "internal_error"; message: string; retryable: boolean } | null = null;
    try {
      raw = await Promise.race([
        adapter.execute({
          correlationId, sourceId: source.sourceId, sourceVersion: source.sourceVersion, connectionId: connection.connectionId,
          operation: request.operation, purpose: request.purpose, params: params.data as Record<string, unknown>, scope: connection.scope,
        }),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("adapter_timeout")), timeoutMs); }),
      ]);
    } catch (error) {
      // A mensagem da exceção NÃO é repassada (pode conter detalhes internos ou segredos).
      failure = (error as Error)?.message === "adapter_timeout"
        ? { code: "timeout", message: "tempo esgotado ao consultar a fonte", retryable: true }
        : { code: "internal_error", message: "falha interna no adaptador da fonte", retryable: false };
    } finally { if (timer) clearTimeout(timer); }

    const warningsBase = adapter.descriptor.synthetic === true ? [{ kind: "quality" as const, severity: "info" as const, message: "adaptador sintético (somente teste); dados não são de uma fonte real" }] : [];
    const collectedAt = now().toISOString();
    const resultScope = request.caseRef ? { kind: "tenant_workspace" as const, ...scope } : connection.scope;
    const base = {
      schemaVersion: "eiah.collection-result.v1" as const, resultId: `res_${newId()}`, sourceId: source.sourceId, sourceVersion: source.sourceVersion,
      connectionId: connection.connectionId, contentSchemaVersion: operation.contentSchemaVersion, scope: resultScope,
      ...(request.caseRef && caseInfo ? { caseRef: { caseId: caseInfo.caseId, tenantId: scope.tenantId, workspaceId: scope.workspaceId } } : {}),
    };
    const unknownDates = { referenceDate: { status: "unknown" as const }, publishedAt: { status: "unknown" as const }, validFrom: { status: "unknown" as const }, validUntil: { status: "unknown" as const } };
    const failureResult = (code: "timeout" | "internal_error" | "invalid_response" | "schema_violation", message: string, retryable: boolean): CollectionResultV1 =>
      collectionResultV1Schema.parse({ ...base, outcome: "failure", dates: { collectedAt, ...unknownDates }, warnings: warningsBase, error: { code, message, retryable } });

    let result: CollectionResultV1;
    let proposals: CaseUpdateProposalV1[] = [];
    let evidenceRefs: Array<{ evidenceId: string; contentSha256: string }> = [];
    if (failure) {
      result = failureResult(failure.code, failure.message, failure.retryable);
    } else {
      const parsedOutcome = adapterOutcomeSchema.safeParse(raw);
      if (!parsedOutcome.success) {
        result = failureResult("invalid_response", "resposta do adaptador fora do contrato", false);
      } else {
        const built = assemble(parsedOutcome.data);
        result = built.result; proposals = built.proposals; evidenceRefs = built.evidenceRefs;
      }
    }

    function assemble(outcome: AdapterOutcome): { result: CollectionResultV1; proposals: CaseUpdateProposalV1[]; evidenceRefs: Array<{ evidenceId: string; contentSha256: string }> } {
      const dates = { collectedAt, ...outcome.dates };
      const warnings = [...warningsBase, ...outcome.warnings];
      const bad = (message: string) => ({ result: failureResult("schema_violation", message, false), proposals: [], evidenceRefs: [] });
      try {
        if (outcome.outcome === "failure") return { result: collectionResultV1Schema.parse({ ...base, outcome: "failure", dates, warnings, error: outcome.error }), proposals: [], evidenceRefs: [] };
        if (outcome.outcome === "not_modified") return { result: collectionResultV1Schema.parse({ ...base, outcome: "not_modified", dates, warnings, basedOn: outcome.basedOn }), proposals: [], evidenceRefs: [] };
        const evidenceId = `ev_${newId()}`;
        const origin = {
          schemaVersion: "eiah.origin-evidence.v1" as const, evidenceId,
          origin: { kind: "system_obtained" as const, sourceId: source!.sourceId, connectionId: connection.connectionId, obtainedAt: collectedAt, publisherStatus: adapter!.descriptor.publisherStatus, systemRef: adapter!.descriptor.adapterId },
          contentSha256: outcome.original.sha256,
          // Nada é promovido: obtido de sistema NÃO é validado nem aprovado nem autorizado.
          validation: { status: "not_validated" as const }, approval: { status: "not_requested" as const }, operationalAuthorization: false as const,
        };
        if (outcome.outcome === "empty") {
          return { result: collectionResultV1Schema.parse({ ...base, outcome: "empty", dates, warnings, emptyReason: outcome.emptyReason, origin, evidence: { original: outcome.original } }), proposals: [], evidenceRefs: [{ evidenceId, contentSha256: outcome.original.sha256 }] };
        }
        // Integridade: o hash normalizado declarado pelo adaptador precisa corresponder ao conteúdo realmente devolvido.
        if (outcome.transformation.outputSha256 !== sha256(canonicalJson(outcome.records))) return bad("hash do conteúdo normalizado diverge do conteúdo devolvido");
        if (outcome.transformation.inputSha256 !== outcome.original.sha256) return bad("hash de entrada da transformação diverge do original");
        const result = collectionResultV1Schema.parse({
          ...base, outcome: "success", dates, warnings, content: { kind: "inline", records: outcome.records }, origin,
          evidence: { original: outcome.original, transformation: outcome.transformation },
        });
        const suggested = outcome.suggestedChanges ?? [];
        let built: CaseUpdateProposalV1[] = [];
        if (suggested.length > 0) {
          if (!caseInfo) return bad("o adaptador sugeriu alterações sem a consulta pertencer a um caso");
          // Proposta, nunca aplicação: estado `proposed`, sem decisão, `caseMutationApplied: false`.
          built = [caseUpdateProposalV1Schema.parse({
            schemaVersion: "eiah.case-update-proposal.v1", proposalId: `prop_${newId()}`, caseId: caseInfo.caseId, caseType: caseInfo.caseType,
            tenantId: scope.tenantId, workspaceId: scope.workspaceId, expectedRevision: caseInfo.revision,
            changes: suggested.map((change) => ({ ...change, evidenceIds: [evidenceId] })),
            evidence: [{ evidenceId, contentSha256: outcome.original.sha256 }],
            proposedBy: { kind: "system", ref: `oraculo.source-query:${source!.sourceId}` }, proposedAt: collectedAt,
            state: "proposed", caseMutationApplied: false, operationalAuthorization: false,
          })];
        }
        return { result, proposals: built, evidenceRefs: [{ evidenceId, contentSha256: outcome.original.sha256 }] };
      } catch {
        return bad("resultado do adaptador não satisfaz os contratos de resultado/evidência");
      }
    }

    // 10. Conclusão registrada (melhor esforço: a consulta já ocorreu e foi autorizada com rastro).
    try { await tracked({ event: "oraculo.source_query.completed", ...withConnection, resultOutcome: result.outcome }); } catch { /* já refletido em auditDescriptor (allPersisted=false) */ }

    return sourceQueryOutcomeV1Schema.parse({
      schemaVersion: "eiah.source-query-outcome.v1", correlationId, status: "executed", adapterInvocations: 1,
      result, proposals, evidenceRefs, caseMutationApplied: false, audit: auditDescriptor(),
    });
  }

  return { execute };
}
export type SourceQueryService = ReturnType<typeof createSourceQueryService>;
