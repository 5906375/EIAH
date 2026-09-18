// Cenário J — execução governada do Radar Social: checkpoint pré-envio,
// controle de CONCORRÊNCIA (nunca reserva financeira/orçamento), chamada
// direta e síncrona ao motor de linguagem (transporte substituído nos
// testes) e proteção de conteúdo em Run/RunEvent. Ver
// docs/architecture/radar-social-construction-plan-v1.md, Atualizações
// 1.28 a 1.33. Nenhuma chamada real a modelo em nenhum teste deste arquivo
// — createSubstituteCompletionEngine nunca acessa rede nem credencial real.
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { toSafeErrorFields } from "@eiah/core";
import {
  newTenantWorkspace, seedTenantWorkspaceUser, grantAnalysisScopes, createNamedClient,
  defaultGenerationConfigInput, createSubstituteCompletionEngine,
  holdProviderCallSlotAdvisoryLock, observeConnectionState, waitFor,
} from "./helpers";
import { createRadarKnownEntity, RadarKnownEntityNotFoundError } from "../radarKnownEntityService";
import { createRadarEntityAccessResolver, revokeRadarEntityAccess } from "../radarEntityAccessGrantService";
import { createRadarAnalysisRequest } from "../radarAnalysisRequestService";
import { claimAttempt, preserveResult, concludeAttempt, reclaimExpiredAttempt, ATTEMPT_LEASE_TTL_SECONDS } from "../radarAnalysisAttemptService";
import { RadarAnalysisAttemptConflictError } from "../radarAnalysisAttemptContract";
import {
  assertReadyForGovernedDispatch, occupyProviderCallSlot, releaseProviderCallSlot, runGovernedAnalysis,
  createAndLinkGovernedRun,
} from "../radarGovernedExecutionService";

const AGENT_KEY = "radar-governed-test-agent";
const AGENT_VERSION = "v1";

let clientSeq = 0;
function db() {
  return createNamedClient(`radar-j-${++clientSeq}-${process.pid}`).prisma;
}

async function setupGovernedRequest(
  prisma: ReturnType<typeof db>,
  prefix: string,
  conteudo?: string
) {
  const { tenantId, workspaceId } = newTenantWorkspace(prefix);
  const { userId: creatorUserId } = await seedTenantWorkspaceUser(prisma, { tenantId, workspaceId });
  await grantAnalysisScopes(prisma, { tenantId, workspaceId });
  const entity = await createRadarKnownEntity(
    { tenantId, workspaceId, actorUserId: creatorUserId, input: { displayName: "Entidade de teste — execução governada" } },
    prisma
  );
  const resolver = createRadarEntityAccessResolver(prisma);

  // WorkspaceAgentAssignment + AgentMetadata SINTÉTICOS, exclusivos de
  // teste — nunca um agente real provisionado (proibido pelo escopo desta
  // rodada). AgentMetadata é necessário porque createRunRecord resolve a
  // versão do agente por ela quando nenhuma versão explícita é passada
  // (apps/api/src/services/workspaceAgentAssignments.ts:130-144).
  await prisma.agentMetadata.upsert({
    where: { agent: AGENT_KEY },
    create: { agent: AGENT_KEY, displayName: "Agente de teste — execução governada", version: AGENT_VERSION },
    update: { version: AGENT_VERSION },
  });
  await prisma.workspaceAgentAssignment.create({
    data: { tenantId, workspaceId, agentKey: AGENT_KEY, agentVersion: AGENT_VERSION, enabled: true },
  });

  const { receiveRadarMaterial } = await import("../radarMaterialService");
  const { material } = await receiveRadarMaterial(
    {
      tenantId, workspaceId, actorUserId: creatorUserId, resolver,
      input: {
        entityId: entity.id,
        conteudo: conteudo ?? "Empresa Fictícia Alfa anunciou abertura de filial em Recife ainda este ano.",
        fonteDeclarada: "fonte de teste", operationKey: `mat-${randomUUID().slice(0, 8)}`,
      },
    },
    prisma
  );
  const request = await createRadarAnalysisRequest(
    {
      tenantId, workspaceId, actorUserId: creatorUserId, resolver,
      input: { entityId: entity.id, materialId: material.id, objective: "Avaliar oportunidade comercial", operationKey: `op-${randomUUID().slice(0, 8)}` },
      generationConfigInput: defaultGenerationConfigInput({ agentKey: AGENT_KEY, agentVersion: AGENT_VERSION }),
    },
    prisma
  );
  return { tenantId, workspaceId, creatorUserId, entity, material, request, resolver };
}

function validCandidateResponse() {
  return {
    contractVersion: "radar-recommendation.v1",
    recommendationType: "actionable",
    summary: "Empresa Fictícia Alfa anunciou expansão para Recife.",
    statements: [
      { content: "A empresa anunciou abertura de filial em Recife.", natureza: "FACT_IN_MATERIAL", referenceIds: ["ref-1"] },
    ],
    references: [{ id: "ref-1", quote: "abertura de filial em Recife" }],
    suggestedAction: "Avaliar contato comercial com a nova filial.",
  };
}

test("exatamente um envio ao transporte: fluxo completo, resposta válida, conclusão sem chamada extra", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId, request, resolver } = await setupGovernedRequest(prisma, "j-happy");
    const { callCompletion, calls } = createSubstituteCompletionEngine(() => validCandidateResponse());

    const result = await runGovernedAnalysis(
      { tenantId, workspaceId, attemptId: request.firstAttempt.id, workerId: "w1", resolver, concurrencyLimit: 2, callCompletion },
      prisma
    );
    assert.equal(result.attempt.status, "completed");
    assert.ok(result.recommendation);
    assert.equal(calls.length, 1, "exatamente um envio ao transporte");

    const run = await prisma.run.findFirst({ where: { id: result.attempt.runId ?? undefined } });
    assert.ok(run, "Run vinculado foi criado");
    assert.equal(run!.status, "success");

    const slot = await prisma.radarProviderCallSlot.findFirst({ where: { tenantId, workspaceId, attemptId: request.firstAttempt.id } });
    assert.equal(slot!.status, "released", "vaga liberada após resultado durável obtido");
  } finally { await prisma.$disconnect(); }
});

test("repetição idempotente: ocupar a vaga duas vezes para a MESMA tentativa nunca cria uma segunda linha", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId, request } = await setupGovernedRequest(prisma, "j-slot-idempotent");
    const results = await Promise.allSettled([
      occupyProviderCallSlot({ tenantId, workspaceId, attemptId: request.firstAttempt.id, limit: 1 }, prisma),
      occupyProviderCallSlot({ tenantId, workspaceId, attemptId: request.firstAttempt.id, limit: 1 }, prisma),
    ]);
    for (const r of results) assert.equal(r.status, "fulfilled");
    const slotCount = await prisma.radarProviderCallSlot.count({ where: { tenantId, workspaceId, attemptId: request.firstAttempt.id } });
    assert.equal(slotCount, 1, "idempotente: nunca duas linhas para a mesma tentativa");
  } finally { await prisma.$disconnect(); }
});

test("disputa pela última vaga entre DUAS tentativas distintas do mesmo workspace, limite 1", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId, creatorUserId, entity, material, resolver } = await setupGovernedRequest(prisma, "j-slot-two");

    // Duas SOLICITAÇÕES diferentes no MESMO tenant/workspace, cada uma com
    // sua própria tentativa ativa legítima — exatamente o cenário que a
    // guarda de "tentativa ativa por solicitação" NÃO cobre (Atualização
    // 1.32 §2): o índice único parcial protege cada solicitação contra si
    // mesma, nunca o workspace inteiro contra várias solicitações.
    const requestA = await createRadarAnalysisRequest(
      { tenantId, workspaceId, actorUserId: creatorUserId, resolver, input: { entityId: entity.id, materialId: material.id, objective: "Solicitação A", operationKey: `opA-${randomUUID().slice(0, 8)}` }, generationConfigInput: defaultGenerationConfigInput({ agentKey: AGENT_KEY, agentVersion: AGENT_VERSION }) },
      prisma
    );
    const requestB = await createRadarAnalysisRequest(
      { tenantId, workspaceId, actorUserId: creatorUserId, resolver, input: { entityId: entity.id, materialId: material.id, objective: "Solicitação B", operationKey: `opB-${randomUUID().slice(0, 8)}` }, generationConfigInput: defaultGenerationConfigInput({ agentKey: AGENT_KEY, agentVersion: AGENT_VERSION }) },
      prisma
    );

    const [r1, r2] = await Promise.allSettled([
      occupyProviderCallSlot({ tenantId, workspaceId, attemptId: requestA.firstAttempt.id, limit: 1 }, prisma),
      occupyProviderCallSlot({ tenantId, workspaceId, attemptId: requestB.firstAttempt.id, limit: 1 }, prisma),
    ]);
    const fulfilledOccupied = [r1, r2].filter((r) => r.status === "fulfilled" && (r as PromiseFulfilledResult<{ occupied: boolean }>).value.occupied);
    const rejected = [r1, r2].filter((r) => r.status === "rejected");
    assert.equal(fulfilledOccupied.length, 1, "exatamente uma tentativa ocupa a única vaga");
    assert.equal(rejected.length, 1, "a outra é recusada por falta de vaga");
    assert.ok(
      (rejected[0] as PromiseRejectedResult).reason instanceof RadarAnalysisAttemptConflictError
      && (rejected[0] as PromiseRejectedResult).reason.reasonCode === "provider_call_slot_unavailable"
    );
  } finally { await prisma.$disconnect(); }
});

test("liberação sem duplicação: liberar uma vaga já liberada (ou nunca ocupada) é idempotente", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId, request } = await setupGovernedRequest(prisma, "j-release-idempotent");
    await occupyProviderCallSlot({ tenantId, workspaceId, attemptId: request.firstAttempt.id, limit: 2 }, prisma);
    await releaseProviderCallSlot({ tenantId, workspaceId, attemptId: request.firstAttempt.id }, prisma);
    await releaseProviderCallSlot({ tenantId, workspaceId, attemptId: request.firstAttempt.id }, prisma); // no-op
    const slot = await prisma.radarProviderCallSlot.findFirst({ where: { tenantId, workspaceId, attemptId: request.firstAttempt.id } });
    assert.equal(slot!.status, "released");

    // Nunca ocupada:
    const { tenantId: t2, workspaceId: w2, request: request2 } = await setupGovernedRequest(prisma, "j-release-never-occupied");
    await releaseProviderCallSlot({ tenantId: t2, workspaceId: w2, attemptId: request2.firstAttempt.id }, prisma); // no-op, sem erro
    const noSlot = await prisma.radarProviderCallSlot.findFirst({ where: { tenantId: t2, workspaceId: w2, attemptId: request2.firstAttempt.id } });
    assert.equal(noSlot, null);
  } finally { await prisma.$disconnect(); }
});

test("perda de posse sem liberação indevida: reclaim não libera nem ocupa a vaga", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId, request, resolver } = await setupGovernedRequest(prisma, "j-reclaim-slot");
    const { claimToken } = await claimAttempt({ tenantId, workspaceId, attemptId: request.firstAttempt.id, workerId: "w1", resolver }, prisma);
    void claimToken;
    await occupyProviderCallSlot({ tenantId, workspaceId, attemptId: request.firstAttempt.id, limit: 2 }, prisma);

    await prisma.$executeRawUnsafe(
      `UPDATE radar_analysis_attempts SET claimed_at = clock_timestamp() - ($1 || ' seconds')::interval WHERE id = $2`,
      ATTEMPT_LEASE_TTL_SECONDS + 1, request.firstAttempt.id
    );
    await reclaimExpiredAttempt({ tenantId, workspaceId, attemptId: request.firstAttempt.id, workerId: "w2" }, prisma);

    const slot = await prisma.radarProviderCallSlot.findFirst({ where: { tenantId, workspaceId, attemptId: request.firstAttempt.id } });
    assert.equal(slot!.status, "occupied", "reclaim não altera a vaga — posse e vaga são conceitos distintos");
  } finally { await prisma.$disconnect(); }
});

test("associação Run↔tentativa é atômica: posse obsoleta na escrita de vínculo desfaz a transação inteira, zero Run órfão", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId, request, resolver } = await setupGovernedRequest(prisma, "j-link-atomic");
    const { claimToken: staleClaimToken } = await claimAttempt(
      { tenantId, workspaceId, attemptId: request.firstAttempt.id, workerId: "w1", resolver },
      prisma
    );

    // Simula posse perdida DEPOIS do checkpoint (assertReadyForGovernedDispatch
    // já teria aprovado staleClaimToken) e ANTES da escrita de vínculo — o
    // mesmo tipo de janela que uma espera real (ex.: trava consultiva de
    // occupyProviderCallSlot) poderia abrir. Mesma técnica de backdating já
    // usada no teste "perda de posse sem liberação indevida".
    await prisma.$executeRawUnsafe(
      `UPDATE radar_analysis_attempts SET claimed_at = clock_timestamp() - ($1 || ' seconds')::interval WHERE id = $2`,
      ATTEMPT_LEASE_TTL_SECONDS + 1, request.firstAttempt.id
    );
    await reclaimExpiredAttempt({ tenantId, workspaceId, attemptId: request.firstAttempt.id, workerId: "w2" }, prisma);

    await assert.rejects(
      () => createAndLinkGovernedRun(
        {
          tenantId, workspaceId, attemptId: request.firstAttempt.id, claimToken: staleClaimToken,
          requestedByUserId: request.request.requestedByUserId, agentKey: AGENT_KEY,
          analysisRequestId: request.request.id, requestedModel: "radar-test-model-v1",
          promptTemplateVersion: "v1", requestedMaxTokens: 512,
        },
        prisma
      ),
      (e: unknown) => e instanceof RadarAnalysisAttemptConflictError && e.reasonCode === "governed_dispatch_run_link_lost_claim"
    );

    const attempt = await prisma.radarAnalysisAttempt.findFirstOrThrow({ where: { id: request.firstAttempt.id } });
    assert.equal(attempt.runId, null, "nenhuma associação parcial sobrevive ao rollback");

    const runsInScope = await prisma.run.findMany({ where: { tenantId, workspaceId } });
    const orphanRun = runsInScope.find((r) => (r.request as { radarAnalysisAttemptId?: string } | null)?.radarAnalysisAttemptId === request.firstAttempt.id);
    assert.equal(orphanRun, undefined, "nenhum Run órfão foi deixado pelo ROLLBACK");
  } finally { await prisma.$disconnect(); }
});

test("autorização revogada durante a espera REAL pela vaga é recusada antes do envio: zero chamadas ao transporte, zero recomendação, vaga liberada, nenhum Run", async () => {
  const runnerAppName = `radar-j-revoke-runner-${randomUUID().slice(0, 8)}`;
  const { prisma: runnerPrisma, close: closeRunner } = createNamedClient(runnerAppName);
  const blockerAppName = `radar-j-revoke-blocker-${randomUUID().slice(0, 8)}`;
  const { prisma: revokerPrisma, close: closeRevoker } = createNamedClient(`radar-j-revoke-actor-${randomUUID().slice(0, 8)}`);
  const { prisma: observerPrisma, pool: observerPool, close: closeObserver } = createNamedClient(`radar-j-revoke-observer-${randomUUID().slice(0, 8)}`);
  void observerPrisma;

  try {
    const { tenantId, workspaceId, entity, request, resolver, creatorUserId } = await setupGovernedRequest(runnerPrisma, "j-revoke-wait");

    // Bloqueia deterministicamente o MESMO recurso que occupyProviderCallSlot
    // usa (a trava consultiva da vaga, chaveada por tenant:workspace) — NUNCA
    // a posse (claimToken/status/TTL), que continua válida o cenário inteiro.
    let signalLockAcquired!: () => void;
    const lockAcquiredPromise = new Promise<void>((resolve) => { signalLockAcquired = resolve; });
    let releaseLock!: () => void;
    const releaseLockPromise = new Promise<void>((resolve) => { releaseLock = resolve; });
    const blockerHeld = holdProviderCallSlotAdvisoryLock(
      blockerAppName, { tenantId, workspaceId }, signalLockAcquired, releaseLockPromise
    );
    await lockAcquiredPromise; // barreira real: a trava já está retida pelo bloqueador

    const { callCompletion, calls } = createSubstituteCompletionEngine(() => validCandidateResponse());
    const analysisPromise = runGovernedAnalysis(
      { tenantId, workspaceId, attemptId: request.firstAttempt.id, workerId: "w1", resolver, concurrencyLimit: 2, callCompletion },
      runnerPrisma
    );

    // Barreira real (sem sleep como prova): espera até que a conexão do
    // runner esteja de fato esperando por uma trava (occupyProviderCallSlot
    // bloqueado em pg_advisory_xact_lock, contendo com o bloqueador acima).
    await waitFor(
      async () => {
        const st = await observeConnectionState(observerPool, runnerAppName);
        return st.waitEventType === "Lock";
      },
      { timeoutMs: 5000, intervalMs: 20, label: "runGovernedAnalysis bloqueado na trava consultiva de occupyProviderCallSlot" }
    );

    // Revoga o grant "analyze" do próprio solicitante, numa transação
    // DIFERENTE (ponto de serialização da linha de RadarKnownEntity — nunca
    // contende com a trava consultiva da vaga) — confirma o COMMIT pelo
    // retorno resolvido, não por suposição de tempo.
    const revokeResult = await revokeRadarEntityAccess(
      { tenantId, workspaceId, actorUserId: creatorUserId, entityId: entity.id, granteeUserId: creatorUserId, operation: "analyze" },
      revokerPrisma
    );
    assert.equal(revokeResult.revoked, true, "revogação comprovadamente commitada antes de liberar a espera");

    // Libera a espera real e aguarda o bloqueador terminar (a trava é
    // efetivamente liberada só no COMMIT da transação do bloqueador).
    releaseLock();
    await blockerHeld;

    await assert.rejects(
      () => analysisPromise,
      (e: unknown) => e instanceof RadarKnownEntityNotFoundError && e.reasonCode === "radar_entity_access_access_denied"
    );
    assert.equal(calls.length, 0, "zero chamadas ao transporte — recusado ANTES do envio, não depois");

    const attempt = await runnerPrisma.radarAnalysisAttempt.findFirstOrThrow({ where: { id: request.firstAttempt.id } });
    assert.equal(attempt.status, "running", "recusa pré-envio não muda o status da tentativa (nenhuma escrita de desfecho ocorre aqui)");
    assert.equal(attempt.runId, null, "nenhum Run associado — a falha ocorre antes de createAndLinkGovernedRun");

    const recommendation = await runnerPrisma.radarRecommendation.findFirst({ where: { attemptId: request.firstAttempt.id } });
    assert.equal(recommendation, null, "nenhuma recomendação criada");

    const slot = await runnerPrisma.radarProviderCallSlot.findFirst({ where: { tenantId, workspaceId, attemptId: request.firstAttempt.id } });
    assert.equal(slot?.status, "released", "vaga tratada como falha pré-envio: ocupada e depois liberada, nunca deixada presa");

    const runsInScope = await runnerPrisma.run.findMany({ where: { tenantId, workspaceId } });
    const relatedRun = runsInScope.find((r) => (r.request as { radarAnalysisAttemptId?: string } | null)?.radarAnalysisAttemptId === request.firstAttempt.id);
    assert.equal(relatedRun, undefined, "nenhum Run criado — a falha ocorre antes da criação do Run");
  } finally {
    await closeRunner();
    await closeRevoker();
    await closeObserver();
  }
});

test("resultado desconhecido bloqueando repetição: transporte lança, tentativa permanece running, vaga permanece ocupada, Run finalizado com erro saneado", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId, request, resolver } = await setupGovernedRequest(prisma, "j-unknown");
    const secretMarker = `SECRETO-${randomUUID()}`;
    const { callCompletion, calls } = createSubstituteCompletionEngine(() => {
      const err = new Error(`falha de transporte simulada: ${secretMarker}`) as Error & { code?: string; status?: number };
      err.code = "timeout_error";
      err.status = 504;
      throw err;
    });

    await assert.rejects(
      () => runGovernedAnalysis({ tenantId, workspaceId, attemptId: request.firstAttempt.id, workerId: "w1", resolver, concurrencyLimit: 2, callCompletion }, prisma)
    );
    assert.equal(calls.length, 1, "nenhuma segunda chamada automática");

    const attempt = await prisma.radarAnalysisAttempt.findFirstOrThrow({ where: { id: request.firstAttempt.id } });
    assert.equal(attempt.status, "running", "resultado desconhecido: permanece ambíguo, nunca failed");

    const slot = await prisma.radarProviderCallSlot.findFirst({ where: { tenantId, workspaceId, attemptId: request.firstAttempt.id } });
    assert.equal(slot!.status, "occupied", "vaga NÃO liberada por resultado desconhecido");

    const run = await prisma.run.findFirst({ where: { id: attempt.runId ?? undefined } });
    assert.ok(run, "Run foi criado antes do envio");
    assert.equal(run!.status, "error");
    const runJson = JSON.stringify(run!.response);
    assert.ok(!runJson.includes(secretMarker), "marcador sensível ausente do Run.response");
    assert.ok(!runJson.includes("falha de transporte simulada"), "mensagem bruta ausente do Run.response");

    // Nenhuma nova chamada automática mesmo tentando retomar a conclusão
    // diretamente (não há resultado preservado — concludeAttempt rejeita).
    await assert.rejects(
      () => concludeAttempt({ tenantId, workspaceId, attemptId: request.firstAttempt.id, claimToken: attempt.claimToken!, resolver }, prisma)
    );
    assert.equal(calls.length, 1, "ainda exatamente uma chamada — recuperação não dispara nova chamada");
  } finally { await prisma.$disconnect(); }
});

test("saneamento de erro: marcador sensível sintético nunca sobrevive a toSafeErrorFields", () => {
  const secretMarker = `SECRETO-${randomUUID()}`;
  const err = new Error(`provider said: ${secretMarker}`) as Error & { code?: string; status?: number; requestId?: string };
  err.name = "APIError";
  err.code = "rate_limit_exceeded";
  err.status = 429;
  err.requestId = "req-abc123";
  const safe = toSafeErrorFields(err);
  const serialized = JSON.stringify(safe);
  assert.ok(!serialized.includes(secretMarker));
  assert.ok(!serialized.includes("provider said"));
  assert.equal(safe.errorName, "APIError");
  assert.equal(safe.httpStatus, 429);
  assert.equal(safe.providerErrorCode, "rate_limit_exceeded");
  assert.equal(safe.providerRequestId, "req-abc123");

  // Campo com formato suspeito (texto livre disfarçado de código) é descartado.
  const suspicious = new Error("x") as Error & { code?: string };
  suspicious.code = `leaked ${secretMarker} content with spaces`;
  const safeSuspicious = toSafeErrorFields(suspicious);
  assert.equal(safeSuspicious.providerErrorCode, null, "código fora do formato esperado vira null, nunca repassado");
});

test("recuperação sem novo envio: resultado durável retomado por concludeAttempt não chama o transporte de novo", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId, request, resolver } = await setupGovernedRequest(prisma, "j-recover");
    const { callCompletion, calls } = createSubstituteCompletionEngine(() => validCandidateResponse());

    const { claimToken } = await claimAttempt({ tenantId, workspaceId, attemptId: request.firstAttempt.id, workerId: "w1", resolver }, prisma);
    await assertReadyForGovernedDispatch({ tenantId, workspaceId, attemptId: request.firstAttempt.id, claimToken, resolver }, prisma);
    await occupyProviderCallSlot({ tenantId, workspaceId, attemptId: request.firstAttempt.id, limit: 2 }, prisma);
    const response = await callCompletion({ model: "radar-test-model-v1", messages: [], retries: 1 });
    await preserveResult(
      { tenantId, workspaceId, attemptId: request.firstAttempt.id, claimToken, executorOutput: { candidate: JSON.parse(response.output), provider: response.provider, model: response.model, providerRequestId: response.requestId ?? response.id } },
      prisma
    );
    await releaseProviderCallSlot({ tenantId, workspaceId, attemptId: request.firstAttempt.id }, prisma);
    assert.equal(calls.length, 1);

    // "Queda simulada" aqui: retomada só com concludeAttempt, sem tocar o transporte.
    const concluded = await concludeAttempt({ tenantId, workspaceId, attemptId: request.firstAttempt.id, claimToken, resolver }, prisma);
    assert.equal(concluded.attempt.status, "completed");
    assert.ok(concluded.recommendation);
    assert.equal(calls.length, 1, "conclusão retomada não chama o transporte de novo");

    const slot = await prisma.radarProviderCallSlot.findFirst({ where: { tenantId, workspaceId, attemptId: request.firstAttempt.id } });
    assert.equal(slot!.status, "released", "sem nova ocupação de vaga na recuperação");
  } finally { await prisma.$disconnect(); }
});

test("falha que não aciona segundo provedor: exatamente uma chamada mesmo após erro, sem fallback de provedor no caminho Radar", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId, request, resolver } = await setupGovernedRequest(prisma, "j-nofallback");
    let invocationCount = 0;
    const { callCompletion } = createSubstituteCompletionEngine((req) => {
      invocationCount += 1;
      assert.equal(req.model, "radar-test-model-v1", "nunca troca de modelo/provedor entre chamadas — não há fallback no caminho Radar");
      throw new Error("falha simulada");
    });

    await assert.rejects(
      () => runGovernedAnalysis({ tenantId, workspaceId, attemptId: request.firstAttempt.id, workerId: "w1", resolver, concurrencyLimit: 2, callCompletion }, prisma)
    );
    assert.equal(invocationCount, 1, "exatamente uma invocação — sem fallback para outro provedor/modelo (capabilityExecution.ts não é atravessado)");
  } finally { await prisma.$disconnect(); }
});

test("confidencialidade: Run criado pela execução governada nunca expõe material, objetivo, prompt ou resposta em campos genéricos", async () => {
  const prisma = db();
  try {
    const materialTexto = "Texto sigiloso da Empresa Fictícia Beta sobre fusão confidencial.";
    const { tenantId, workspaceId, request, resolver } = await setupGovernedRequest(prisma, "j-confidential", materialTexto);
    const { callCompletion } = createSubstituteCompletionEngine(() => validCandidateResponse());

    const result = await runGovernedAnalysis({ tenantId, workspaceId, attemptId: request.firstAttempt.id, workerId: "w1", resolver, concurrencyLimit: 2, callCompletion }, prisma);
    assert.ok(result.attempt.runId);

    // Leitura GENÉRICA do Run — mesma forma que qualquer leitor com token de
    // tenant/workspace (sem grant de entidade) enxergaria via GET /runs/:id.
    const run = await prisma.run.findFirstOrThrow({ where: { id: result.attempt.runId! } });
    const runRequestJson = JSON.stringify(run.request);
    const runResponseJson = JSON.stringify(run.response);
    assert.ok(!runRequestJson.includes(materialTexto), "material ausente de Run.request");
    assert.ok(!runRequestJson.includes(request.request.objective), "objetivo ausente de Run.request");
    assert.ok(!runResponseJson.includes(validCandidateResponse().summary), "resposta/recomendação ausente de Run.response");

    // runGovernedAnalysis nunca chama emitRunEvent (createRunRecord/
    // finalizeRunRecord não emitem RunEvent por si — isso é responsabilidade
    // de quem chama pelas rotas genéricas, apps/api/src/routes/agents.ts,
    // que este caminho não atravessa). A ausência de RunEvent aqui é
    // esperada e verificada explicitamente — não uma checagem vazia por
    // acidente; se algum dia este caminho passar a emitir RunEvent, este
    // assert falha e força revisão do conteúdo do payload.
    const events = await prisma.runEvent.findMany({ where: { runId: run.id } });
    assert.equal(events.length, 0, "runGovernedAnalysis não emite RunEvent — nada a redigir aqui ainda");
    for (const event of events) {
      const payloadJson = JSON.stringify(event.payload);
      assert.ok(!payloadJson.includes(materialTexto), "material ausente de RunEvent.payload");
    }
  } finally { await prisma.$disconnect(); }
});
