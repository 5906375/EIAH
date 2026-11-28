// Radar Social — execução GOVERNADA: checkpoint pré-envio, controle de
// CONCORRÊNCIA (nunca reserva financeira/de orçamento) e chamada direta e
// síncrona a runCompletion (nunca via fila ou executeCapability). Ver
// docs/architecture/radar-social-construction-plan-v1.md, Atualizações
// 1.28 a 1.32.
//
// NENHUM agente real é provisionado aqui — assertWorkspaceAgentEnabled
// exige um WorkspaceAgentAssignment já existente (sintético em teste,
// nunca criado por este arquivo). NENHUMA chamada passa por
// executeCapability/a fila BullMQ — decisão deliberada (Atualização 1.32):
// evita o retry de fallback de provedor de capabilityExecution.ts e o
// attempts:3 padrão da fila.
import { Prisma, type PrismaClient, prismaGlobal } from "@repo/db";
import { runCompletion, toSafeErrorFields, type ChatCompletionRequest, type ChatCompletionResponse } from "@eiah/core";
import {
  parseGenerationConfig,
  RadarAnalysisAttemptError,
  RadarAnalysisAttemptConflictError,
} from "./radarAnalysisAttemptContract";
import {
  assertRadarSocialOperationAuthorized,
  RadarKnownEntityNotFoundError,
} from "./radarKnownEntityService";
import {
  reasonCodeForRadarEntityAccessOutcome,
  type RadarEntityAccessResolver,
} from "./radarEntityAccessResolver";
import {
  RADAR_SOCIAL_ANALYSIS_EXECUTE_SCOPE,
  ATTEMPT_LEASE_TTL_SECONDS,
  RadarAnalysisAttemptNotFoundError,
  claimAttempt,
  preserveResult,
  concludeAttempt,
  type ConcludeAttemptResult,
} from "./radarAnalysisAttemptService";
import { assertWorkspaceAgentEnabled } from "../workspaceAgentAssignments";
import { createRunRecord, finalizeRunRecord } from "../runs";

interface OperationContext {
  tenantId: string;
  workspaceId: string;
}

/** Carrega a tentativa + a solicitação — mesma forma da versão privada já
 * existente em radarAnalysisAttemptService.ts, reimplementada aqui para não
 * alterar o export surface do arquivo já testado do pacote A. */
async function loadAttemptForGovernedDispatch(
  db: PrismaClient,
  params: OperationContext & { attemptId: string }
) {
  const attempt = await db.radarAnalysisAttempt.findFirst({
    where: { id: params.attemptId, tenantId: params.tenantId, workspaceId: params.workspaceId },
    include: { analysisRequest: true },
  });
  if (!attempt) throw new RadarAnalysisAttemptNotFoundError();
  return attempt;
}

export interface GovernedDispatchContext extends OperationContext {
  attemptId: string;
  claimToken: string;
  resolver: RadarEntityAccessResolver;
}

export interface GovernedDispatchReady {
  requestedByUserId: string;
  entityId: string;
  analysisRequestId: string;
  materialId: string;
  objective: string;
  additionalContext: string | null;
  generationConfig: ReturnType<typeof parseGenerationConfig>;
}

/**
 * Checkpoint pré-envio (Atualização 1.29 §2, 1.32 §1): revalida, nesta
 * ordem, identidade/membership/escopo, acesso à entidade, habilitação do
 * agente, posse vigente (leitura de confirmação, nunca reaproveitando o
 * claim) e permissão de conteúdo — tudo de novo, nunca reaproveitando
 * nenhuma checagem anterior a esta chamada. NÃO ocupa vaga de concorrência
 * (isso é decidido separadamente, sempre por último, em
 * `occupyProviderCallSlot`).
 */
export async function assertReadyForGovernedDispatch(
  params: GovernedDispatchContext,
  db: PrismaClient = prismaGlobal
): Promise<GovernedDispatchReady> {
  const withRequest = await loadAttemptForGovernedDispatch(db, params);
  const requestedByUserId = withRequest.analysisRequest.requestedByUserId;
  const entityId = withRequest.analysisRequest.entityId;

  await assertRadarSocialOperationAuthorized(
    db,
    { tenantId: params.tenantId, workspaceId: params.workspaceId, actorUserId: requestedByUserId },
    RADAR_SOCIAL_ANALYSIS_EXECUTE_SCOPE
  );

  const accessOutcome = await params.resolver({
    confirmedIdentity: requestedByUserId,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    entityId,
    operation: "analyze",
  });
  if (accessOutcome !== "authorized") {
    throw new RadarKnownEntityNotFoundError(reasonCodeForRadarEntityAccessOutcome(accessOutcome) ?? "radar_known_entity_not_found");
  }

  const generationConfig = parseGenerationConfig(withRequest.generationConfig);
  if (!generationConfig.agentKey) {
    throw new RadarAnalysisAttemptError("governed_dispatch_agent_key_missing");
  }
  await assertWorkspaceAgentEnabled({
    prisma: db,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    agentKey: generationConfig.agentKey,
    agentVersion: generationConfig.agentVersion ?? undefined,
    userId: requestedByUserId,
  });

  // Posse: leitura de CONFIRMAÇÃO (SELECT puro), nunca a escrita condicionada
  // (essa continua sendo o gate final, dentro de preserveResult, na volta).
  const possessionRows = await db.$queryRaw<Array<{ ok: boolean }>>(Prisma.sql`
    SELECT (
      claim_token = ${params.claimToken}
      AND status = 'running'
      AND clock_timestamp() < claimed_at + (${ATTEMPT_LEASE_TTL_SECONDS} || ' seconds')::interval
    ) AS ok
    FROM radar_analysis_attempts
    WHERE id = ${params.attemptId} AND tenant_id = ${params.tenantId} AND workspace_id = ${params.workspaceId}
  `);
  if (possessionRows.length === 0 || !possessionRows[0]!.ok) {
    throw new RadarAnalysisAttemptConflictError("governed_dispatch_rejected_stale_or_expired_claim");
  }

  const llmUsageMode = generationConfig.knowledgePolicySnapshot.llmUsageMode;
  if (llmUsageMode === "none" || llmUsageMode === "disallowed_for_critical_execution") {
    throw new RadarAnalysisAttemptError("governed_dispatch_llm_usage_not_permitted", { llmUsageMode });
  }

  return {
    requestedByUserId,
    entityId,
    analysisRequestId: withRequest.analysisRequest.id,
    materialId: withRequest.analysisRequest.materialId,
    objective: withRequest.analysisRequest.objective,
    additionalContext: withRequest.analysisRequest.additionalContext,
    generationConfig,
  };
}

export interface ProviderCallSlotParams extends OperationContext {
  attemptId: string;
  limit: number;
}

/**
 * Controle de CONCORRÊNCIA (nunca reserva financeira) — no máximo `limit`
 * vagas ocupadas simultaneamente por tenant/workspace, entre tentativas do
 * Radar. `limit` é sempre fornecido pelo chamador (nunca lido de
 * WorkspaceQuotaGrant, que mede acúmulo mensal — pergunta diferente,
 * Atualização 1.32 §1); ausência/valor inválido bloqueia (fail-closed).
 * Trava consultiva por transação (`pg_advisory_xact_lock`), chaveada por
 * tenant/workspace, fecha o "phantom insert" que uma simples
 * `SELECT...FOR UPDATE` sobre linhas já existentes não fecharia (linhas
 * novas ainda não existem para serem travadas).
 */
export async function occupyProviderCallSlot(
  params: ProviderCallSlotParams,
  db: PrismaClient = prismaGlobal
): Promise<{ occupied: boolean }> {
  if (!Number.isInteger(params.limit) || params.limit <= 0) {
    throw new RadarAnalysisAttemptConflictError("provider_call_slot_limit_invalid", { limit: params.limit });
  }
  const lockKey = `${params.tenantId}:${params.workspaceId}`;

  return await db.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext('radar_provider_call_slot'), hashtext(${lockKey}))`);

    const existing = await tx.radarProviderCallSlot.findFirst({
      where: { tenantId: params.tenantId, workspaceId: params.workspaceId, attemptId: params.attemptId },
    });
    if (existing) {
      // Idempotente: nunca ocupa uma segunda vaga para a mesma tentativa.
      // Se a linha já existir com status "released" (desfecho já conhecido
      // para esta tentativa), esta função NÃO a reativa nem reavalia
      // capacidade — devolve occupied:false, fail-closed. Isso é seguro
      // porque, no caminho real (runGovernedAnalysis), `claimAttempt` já
      // exige status='pending' antes de chegar aqui, e uma tentativa cuja
      // vaga já foi liberada nunca está mais em 'pending' — logo este ramo
      // só é alcançável chamando occupyProviderCallSlot diretamente (fora
      // da orquestração), nunca pelo fluxo real.
      return { occupied: existing.status === "occupied" };
    }

    const occupiedCount = await tx.radarProviderCallSlot.count({
      where: { tenantId: params.tenantId, workspaceId: params.workspaceId, status: "occupied" },
    });
    if (occupiedCount >= params.limit) {
      throw new RadarAnalysisAttemptConflictError("provider_call_slot_unavailable", {
        tenantId: params.tenantId, workspaceId: params.workspaceId, limit: params.limit,
      });
    }

    await tx.radarProviderCallSlot.create({
      data: {
        tenantId: params.tenantId, workspaceId: params.workspaceId, attemptId: params.attemptId,
        status: "occupied", occupiedAt: new Date(),
      },
    });
    return { occupied: true };
  }, { maxWait: 5000, timeout: 10000 });
}

/**
 * Libera a vaga — idempotente (no-op se já liberada ou nunca ocupada).
 * Chamado SÓ quando o desfecho é conhecido: falha comprovadamente anterior
 * ao envio, ou resultado durável obtido (`preserveResult` bem-sucedido) —
 * nunca por timeout nem por perda de posse (Atualização 1.32 §2).
 */
export async function releaseProviderCallSlot(
  params: OperationContext & { attemptId: string },
  db: PrismaClient = prismaGlobal
): Promise<void> {
  await db.radarProviderCallSlot.updateMany({
    where: { tenantId: params.tenantId, workspaceId: params.workspaceId, attemptId: params.attemptId, status: "occupied" },
    data: { status: "released", releasedAt: new Date() },
  });
}

export interface CreateAndLinkGovernedRunParams extends OperationContext {
  attemptId: string;
  claimToken: string;
  requestedByUserId: string;
  agentKey: string;
  analysisRequestId: string;
  requestedModel: unknown;
  promptTemplateVersion: unknown;
  requestedMaxTokens: unknown;
}

/**
 * Cria o Run (payload OPACO) e vincula à tentativa na MESMA transação,
 * revalidando posse (claim_token + status + TTL) imediatamente antes da
 * escrita de vínculo — nunca reaproveitando a checagem já feita em
 * `assertReadyForGovernedDispatch`, que pode ter ocorrido ANTES de uma
 * espera (ex.: a trava consultiva de `occupyProviderCallSlot`). Mesmo
 * padrão de `affected === 0 -> aborta a transação inteira` já usado em
 * `preserveResult`/`concludeAttempt` (radarAnalysisAttemptService.ts) —
 * achado desta revisão: a versão original desta escrita (antes inline em
 * `runGovernedAnalysis`) não conferia linhas afetadas, então uma posse
 * perdida DEPOIS do checkpoint e ANTES desta escrita passaria batido,
 * deixando um Run criado sem vínculo confirmado. Extraída para função
 * própria para ser testável isoladamente com um claimToken já obsoleto.
 */
export async function createAndLinkGovernedRun(
  params: CreateAndLinkGovernedRunParams,
  db: PrismaClient = prismaGlobal
): Promise<string> {
  return await db.$transaction(async (tx) => {
    const runRecord = await createRunRecord({
      prisma: tx,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      userId: params.requestedByUserId,
      agent: params.agentKey,
      status: "running",
      request: {
        radarAnalysisAttemptId: params.attemptId,
        radarAnalysisRequestId: params.analysisRequestId,
        requestedModel: params.requestedModel,
        promptTemplateVersion: params.promptTemplateVersion,
        requestedMaxTokens: params.requestedMaxTokens,
      },
    });
    const createdRunId = (runRecord as { id: string }).id;
    const linked = await tx.$executeRaw(Prisma.sql`
      UPDATE radar_analysis_attempts
      SET run_id = ${createdRunId}, updated_at = clock_timestamp()
      WHERE id = ${params.attemptId} AND tenant_id = ${params.tenantId} AND workspace_id = ${params.workspaceId}
        AND claim_token = ${params.claimToken} AND status = 'running'
        AND clock_timestamp() < claimed_at + (${ATTEMPT_LEASE_TTL_SECONDS} || ' seconds')::interval
    `);
    if (linked === 0) {
      // Posse perdida entre o checkpoint e este instante — desfaz a
      // transação inteira (o Run recém-criado acima também é desfeito pelo
      // ROLLBACK): zero Run órfão, nenhuma associação parcial.
      throw new RadarAnalysisAttemptConflictError("governed_dispatch_run_link_lost_claim");
    }
    return createdRunId;
  }, { maxWait: 5000, timeout: 10000 });
}

export interface RunGovernedAnalysisParams extends OperationContext {
  attemptId: string;
  workerId: string;
  resolver: RadarEntityAccessResolver;
  concurrencyLimit: number;
  // Duplo de teste (Atualização 1.30 §6); produção usaria o real por
  // default — runCompletion em si não pula nenhum controle do Radar, quem
  // pularia seria não chamar o checkpoint, não a implementação do transporte.
  callCompletion?: (req: ChatCompletionRequest) => Promise<ChatCompletionResponse>;
}

/**
 * Orquestração de ponta a ponta com o motor REAL (ou seu duplo de teste):
 * claim -> checkpoint pré-envio -> ocupar vaga -> Run (payload opaco) ->
 * runCompletion (retries:1, sem fila, sem fallback de provedor) ->
 * preservar -> liberar vaga -> concluir. Espelha runSimulatedAnalysis, sem
 * substituí-la.
 */
export async function runGovernedAnalysis(
  params: RunGovernedAnalysisParams,
  db: PrismaClient = prismaGlobal
): Promise<ConcludeAttemptResult> {
  const callCompletion = params.callCompletion ?? runCompletion;

  const { claimToken } = await claimAttempt(
    { tenantId: params.tenantId, workspaceId: params.workspaceId, attemptId: params.attemptId, workerId: params.workerId, resolver: params.resolver },
    db
  );

  const ready = await assertReadyForGovernedDispatch(
    { tenantId: params.tenantId, workspaceId: params.workspaceId, attemptId: params.attemptId, claimToken, resolver: params.resolver },
    db
  );

  const material = await db.radarMaterial.findFirst({
    where: { id: ready.materialId, tenantId: params.tenantId, workspaceId: params.workspaceId },
  });
  if (!material) throw new RadarKnownEntityNotFoundError("radar_material_not_found_in_scope");

  // Autorização de consumo (concorrência) — SEMPRE a última checagem antes
  // de qualquer efeito colateral real (Run, chamada ao provedor).
  const occupancy = await occupyProviderCallSlot(
    { tenantId: params.tenantId, workspaceId: params.workspaceId, attemptId: params.attemptId, limit: params.concurrencyLimit },
    db
  );
  if (!occupancy.occupied) {
    throw new RadarAnalysisAttemptConflictError("provider_call_slot_unavailable");
  }

  let runId: string;
  let readyBeforeDispatch: GovernedDispatchReady;
  try {
    // claimToken/status/TTL (posse) NÃO substituem acesso à
    // entidade/membership/escopo/habilitação do agente (autorização) — são
    // dimensões distintas. `occupyProviderCallSlot`, acima, é a única
    // espera potencialmente longa do caminho (trava consultiva sob
    // contenção de outro tenant/workspace); uma revogação real do grant
    // "analyze" pode ocorrer durante essa espera, e `createAndLinkGovernedRun`
    // sozinho só revalida posse, não autorização. Revalida aqui o checkpoint
    // INTEIRO de novo (identidade/membership/escopo, acesso à entidade,
    // habilitação do agente, posse e permissão de conteúdo) — mesma função
    // já usada antes da espera, chamada de novo, nunca reaproveitando o
    // resultado anterior — imediatamente antes de qualquer efeito colateral
    // real (Run, envio). Achado desta rodada: antes desta chamada, uma
    // revogação durante a espera da vaga passava batida e o transporte
    // ainda era chamado.
    readyBeforeDispatch = await assertReadyForGovernedDispatch(
      { tenantId: params.tenantId, workspaceId: params.workspaceId, attemptId: params.attemptId, claimToken, resolver: params.resolver },
      db
    );

    // Run com payload OPACO — nunca material/objetivo/prompt (Atualização
    // 1.30 §3): só rótulos de configuração e referências opacas. Criação do
    // Run e vínculo com a tentativa na MESMA transação, com revalidação de
    // posse imediatamente antes da escrita de vínculo — ver
    // createAndLinkGovernedRun.
    runId = await createAndLinkGovernedRun(
      {
        tenantId: params.tenantId, workspaceId: params.workspaceId, attemptId: params.attemptId, claimToken,
        requestedByUserId: readyBeforeDispatch.requestedByUserId, agentKey: readyBeforeDispatch.generationConfig.agentKey!,
        analysisRequestId: readyBeforeDispatch.analysisRequestId, requestedModel: readyBeforeDispatch.generationConfig.requestedModel,
        promptTemplateVersion: readyBeforeDispatch.generationConfig.promptTemplateVersion, requestedMaxTokens: readyBeforeDispatch.generationConfig.requestedMaxTokens,
      },
      db
    );
  } catch (preDispatchError) {
    // Falha comprovadamente ANTERIOR ao envio — callCompletion nunca foi
    // chamado. Único caso de liberação automática (Atualização 1.32 §2/§3).
    await releaseProviderCallSlot({ tenantId: params.tenantId, workspaceId: params.workspaceId, attemptId: params.attemptId }, db);
    throw preDispatchError;
  }

  let completionResponse: ChatCompletionResponse;
  try {
    completionResponse = await callCompletion({
      model: readyBeforeDispatch.generationConfig.requestedModel,
      messages: [
        { role: "system", content: `radar-template:${readyBeforeDispatch.generationConfig.promptTemplateVersion}` },
        {
          role: "user",
          content: `Objetivo: ${readyBeforeDispatch.objective}\n\nMaterial:\n${material.conteudo}${
            readyBeforeDispatch.additionalContext ? `\n\nContexto adicional:\n${readyBeforeDispatch.additionalContext}` : ""
          }`,
        },
      ],
      maxTokens: readyBeforeDispatch.generationConfig.requestedMaxTokens,
      retries: 1,
    });
  } catch (dispatchError) {
    // Resultado DESCONHECIDO: NÃO libera a vaga, NÃO marca a tentativa como
    // failed — permanece `running`, ambígua, por design (Atualização
    // 1.28/1.32). O Run em si é finalizado com erro saneado — fato sobre a
    // chamada, distinto da interpretação do Radar sobre a tentativa.
    const safeFields = toSafeErrorFields(dispatchError);
    await finalizeRunRecord({
      prisma: db, runId, tenantId: params.tenantId, workspaceId: params.workspaceId,
      status: "error",
      response: { outcome: "error", ...safeFields },
      errorCode: safeFields.providerErrorCode ?? safeFields.errorName ?? "unknown",
    });
    throw dispatchError;
  }

  await finalizeRunRecord({
    prisma: db, runId, tenantId: params.tenantId, workspaceId: params.workspaceId,
    status: "success",
    response: {
      outcome: "delivered",
      providerRequestId: completionResponse.requestId ?? null,
      finishReason: completionResponse.finishReason ?? null,
      usage: completionResponse.usage ?? null,
    },
  });

  let candidate: unknown;
  try {
    candidate = JSON.parse(completionResponse.output);
  } catch {
    // Saída não interpretável como candidato — segue para preserveResult/
    // concludeAttempt normalmente; a validação de forma existente rejeita
    // com uma falha comum, sem tratamento especial aqui.
    candidate = { unparsedOutput: true };
  }

  await preserveResult(
    {
      tenantId: params.tenantId, workspaceId: params.workspaceId, attemptId: params.attemptId, claimToken,
      executorOutput: {
        candidate,
        provider: completionResponse.provider,
        model: completionResponse.model,
        providerRequestId: completionResponse.requestId ?? completionResponse.id,
      },
    },
    db
  );

  // Resultado durável obtido — a ambiguidade "o provedor respondeu?" está
  // resolvida; libera a vaga já aqui, antes de concludeAttempt decidir se o
  // conteúdo é válido (Atualização 1.32 §2, linha "resultado durável").
  await releaseProviderCallSlot({ tenantId: params.tenantId, workspaceId: params.workspaceId, attemptId: params.attemptId }, db);

  return await concludeAttempt(
    { tenantId: params.tenantId, workspaceId: params.workspaceId, attemptId: params.attemptId, claimToken, resolver: params.resolver },
    db
  );
}
