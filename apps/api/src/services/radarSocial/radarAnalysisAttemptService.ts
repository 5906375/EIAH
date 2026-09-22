// Radar Social — serviço de RadarAnalysisAttempt: criação idempotente de
// tentativa por attemptOperationKey, protocolo explícito de posse
// (claim/preservação/conclusão) e orquestração com um executor/provedor
// SUBSTITUTO controlado. Ver
// docs/architecture/radar-social-construction-plan-v1.md, Atualizações
// 1.12, 1.15, 1.16, 1.17 e 1.18.
//
// NENHUMA chamada real a modelo, NENHUM Run publicado em fila — o
// "executor" aqui é sempre uma função injetada pelo chamador (produção
// nenhuma o fornece hoje; testes usam um duplo controlado).
import { Prisma, type PrismaClient, prismaGlobal } from "@repo/db";
import { randomUUID } from "node:crypto";
import {
  resolveGenerationConfig,
  parseGenerationConfig,
  validateAttemptOperationKey,
  attemptCreationIdentityMatches,
  preparePreservedResult,
  computePreservedResultHash,
  validateProvenanceField,
  RadarAnalysisAttemptError,
  RadarAnalysisAttemptConflictError,
  TERMINAL_ATTEMPT_STATUSES,
  type RadarAnalysisAttemptStatus,
  type GenerationConfig,
} from "./radarAnalysisAttemptContract";
import {
  validateRecommendationCandidate,
  verifyReferencesAgainstSources,
  RadarRecommendationError,
  type RadarRecommendationRecord,
} from "./radarRecommendationContract";
import {
  assertRadarSocialOperationAuthorized,
  RadarKnownEntityNotFoundError,
  RADAR_SOCIAL_READ_SCOPE,
} from "./radarKnownEntityService";
import {
  reasonCodeForRadarEntityAccessOutcome,
  type RadarEntityAccessResolver,
} from "./radarEntityAccessResolver";

export const RADAR_SOCIAL_ANALYSIS_EXECUTE_SCOPE = "radar_social.analysis.execute";

// Proposta do pacote A (Atualização 1.17) — prazo de posse, sem renovação.
export const ATTEMPT_LEASE_TTL_SECONDS = 60;

export class RadarAnalysisAttemptNotFoundError extends Error {
  constructor(readonly reasonCode: string = "radar_analysis_attempt_not_found", readonly context: Record<string, unknown> = {}) {
    super(reasonCode);
    this.name = "RadarAnalysisAttemptNotFoundError";
  }
}

interface OperationContext {
  tenantId: string;
  workspaceId: string;
}

export interface RadarAnalysisAttemptRecord {
  id: string;
  tenantId: string;
  workspaceId: string;
  analysisRequestId: string;
  attemptOperationKey: string;
  attemptNumber: number;
  status: RadarAnalysisAttemptStatus;
  claimedByWorkerId: string | null;
  claimToken: string | null;
  claimedAt: Date | null;
  runId: string | null;
  cancelRequestedAt: Date | null;
  failureReasonCode: string | null;
  generationConfig: GenerationConfig;
  preservedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

type AttemptRow = {
  id: string; tenantId: string; workspaceId: string; analysisRequestId: string;
  attemptOperationKey: string; attemptNumber: number; status: string;
  claimedByWorkerId: string | null; claimToken: string | null; claimedAt: Date | null;
  runId: string | null; cancelRequestedAt: Date | null; failureReasonCode: string | null;
  generationConfig: unknown; preservedAt: Date | null; createdAt: Date; updatedAt: Date;
};

export function toAttemptRecord(row: AttemptRow): RadarAnalysisAttemptRecord {
  return {
    id: row.id, tenantId: row.tenantId, workspaceId: row.workspaceId,
    analysisRequestId: row.analysisRequestId, attemptOperationKey: row.attemptOperationKey,
    attemptNumber: row.attemptNumber, status: row.status as RadarAnalysisAttemptStatus,
    claimedByWorkerId: row.claimedByWorkerId, claimToken: row.claimToken, claimedAt: row.claimedAt,
    runId: row.runId, cancelRequestedAt: row.cancelRequestedAt, failureReasonCode: row.failureReasonCode,
    generationConfig: parseGenerationConfig(row.generationConfig),
    preservedAt: row.preservedAt, createdAt: row.createdAt, updatedAt: row.updatedAt,
  };
}

const ATTEMPT_OPERATION_KEY_CONSTRAINT_COLUMNS = ["tenant_id", "workspace_id", "analysis_request_id", "attempt_operation_key"].sort();

function isAttemptOperationKeyUniqueViolation(error: unknown): boolean {
  const typed = error as Prisma.PrismaClientKnownRequestError | undefined | null;
  if (!typed || typeof typed !== "object" || typed.code !== "P2002") return false;
  const meta = typed.meta as Record<string, unknown> | undefined;
  if (!meta || meta.modelName !== "RadarAnalysisAttempt") return false;
  const driverAdapterError = meta.driverAdapterError as Record<string, unknown> | undefined;
  const cause = driverAdapterError?.cause as Record<string, unknown> | undefined;
  if (!cause || cause.kind !== "UniqueConstraintViolation") return false;
  const constraint = cause.constraint as Record<string, unknown> | undefined;
  const fields = constraint?.fields;
  if (!Array.isArray(fields) || fields.some((v) => typeof v !== "string")) return false;
  const sorted = [...(fields as string[])].sort();
  return sorted.length === ATTEMPT_OPERATION_KEY_CONSTRAINT_COLUMNS.length && sorted.every((v, i) => v === ATTEMPT_OPERATION_KEY_CONSTRAINT_COLUMNS[i]);
}

// Índice único PARCIAL "no máximo uma tentativa ativa por solicitação"
// (packages/db/prisma/migrations/.../migration.sql, adição manual —
// Atualização 1.12/1.15) — mesma técnica de classificação de P2002 já usada
// acima, colunas distintas (sem attemptOperationKey) permitem diferenciar
// as duas violações sem ambiguidade.
const ONE_ACTIVE_ATTEMPT_CONSTRAINT_COLUMNS = ["tenant_id", "workspace_id", "analysis_request_id"].sort();

function isOnlyOneActiveAttemptViolation(error: unknown): boolean {
  const typed = error as Prisma.PrismaClientKnownRequestError | undefined | null;
  if (!typed || typeof typed !== "object" || typed.code !== "P2002") return false;
  const meta = typed.meta as Record<string, unknown> | undefined;
  if (!meta || meta.modelName !== "RadarAnalysisAttempt") return false;
  const driverAdapterError = meta.driverAdapterError as Record<string, unknown> | undefined;
  const cause = driverAdapterError?.cause as Record<string, unknown> | undefined;
  if (!cause || cause.kind !== "UniqueConstraintViolation") return false;
  const constraint = cause.constraint as Record<string, unknown> | undefined;
  const fields = constraint?.fields;
  if (!Array.isArray(fields) || fields.some((v) => typeof v !== "string")) return false;
  const sorted = [...(fields as string[])].sort();
  return sorted.length === ONE_ACTIVE_ATTEMPT_CONSTRAINT_COLUMNS.length && sorted.every((v, i) => v === ONE_ACTIVE_ATTEMPT_CONSTRAINT_COLUMNS[i]);
}

/** Carrega a tentativa junto com o `requestedByUserId` da solicitação —
 * toda checagem de autorização do executor/reconciliação usa essa
 * identidade ORIGINAL, nunca uma identidade nova do processo (Atualização
 * 1.16/1.18, seção "Acesso ao resultado intermediário"). */
async function loadAttemptWithRequest(
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

async function assertAttemptAccess(
  db: PrismaClient,
  params: OperationContext & { requestedByUserId: string; entityId: string; resolver: RadarEntityAccessResolver; scope: string; operation: "analyze" | "read" }
) {
  await assertRadarSocialOperationAuthorized(db, { tenantId: params.tenantId, workspaceId: params.workspaceId, actorUserId: params.requestedByUserId }, params.scope);
  const outcome = await params.resolver({
    confirmedIdentity: params.requestedByUserId,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    entityId: params.entityId,
    operation: params.operation,
  });
  if (outcome !== "authorized") {
    throw new RadarKnownEntityNotFoundError(reasonCodeForRadarEntityAccessOutcome(outcome) ?? "radar_known_entity_not_found");
  }
}

// --- B/C/D — criação idempotente de tentativa por attemptOperationKey (1.18) ---

export interface CreateIntentionalAttemptParams extends OperationContext {
  analysisRequestId: string;
  attemptOperationKey: string;
  actorUserId: string;
  generationConfigInput: {
    requestedModel: unknown; requestedMaxTokens?: unknown;
    promptTemplateVersion: unknown; knowledgePolicySnapshot: unknown;
  };
  resolver: RadarEntityAccessResolver;
}

/**
 * Cria uma tentativa nova (nova análise ou nova tentativa técnica) sob uma
 * `RadarAnalysisRequest` existente, OU recupera a já criada sob a mesma
 * `attemptOperationKey`. Identidade comparada: só
 * `{analysisRequestId, attemptOperationKey}` — `generationConfig` NUNCA
 * participa (correção da Atualização 1.18: divergência de resolução do
 * servidor nunca é conflito).
 */
export async function createOrRecoverIntentionalAttempt(
  params: CreateIntentionalAttemptParams,
  db: PrismaClient = prismaGlobal
): Promise<{ attempt: RadarAnalysisAttemptRecord; recovered: boolean }> {
  const attemptOperationKey = validateAttemptOperationKey(params.attemptOperationKey);
  await assertRadarSocialOperationAuthorized(db, params, RADAR_SOCIAL_ANALYSIS_EXECUTE_SCOPE);

  const request = await db.radarAnalysisRequest.findFirst({
    where: { id: params.analysisRequestId, tenantId: params.tenantId, workspaceId: params.workspaceId },
  });
  if (!request) throw new RadarKnownEntityNotFoundError("radar_analysis_request_not_found");

  const accessOutcome = await params.resolver({
    confirmedIdentity: params.actorUserId,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    entityId: request.entityId,
    operation: "analyze",
  });
  if (accessOutcome !== "authorized") {
    throw new RadarKnownEntityNotFoundError(reasonCodeForRadarEntityAccessOutcome(accessOutcome) ?? "radar_known_entity_not_found");
  }

  const attemptedIdentity = { analysisRequestId: params.analysisRequestId, attemptOperationKey };

  try {
    return await db.$transaction(async (tx) => {
      // Recuperação-primeiro: existe alguma tentativa sob esta chave?
      const existing = await tx.radarAnalysisAttempt.findFirst({
        where: { tenantId: params.tenantId, workspaceId: params.workspaceId, analysisRequestId: params.analysisRequestId, attemptOperationKey },
      });
      if (existing) {
        // Campos originais da operação já coincidem por construção da busca
        // acima — recupera sem NUNCA comparar generationConfig (1.18: caso A).
        if (!attemptCreationIdentityMatches({ analysisRequestId: existing.analysisRequestId, attemptOperationKey: existing.attemptOperationKey }, attemptedIdentity)) {
          throw new RadarAnalysisAttemptConflictError("attempt_operation_key_reused_incompatible_request");
        }
        return { attempt: toAttemptRecord(existing), recovered: true };
      }

      // Guarda de nova escrita: no máximo uma tentativa ATIVA por
      // solicitação (índice único parcial) — só relevante aqui de fato na
      // hora do INSERT; capturado abaixo via classificação de P2002.
      const generationConfig = resolveGenerationConfig(params.generationConfigInput);
      const attemptNumber = (await tx.radarAnalysisAttempt.count({
        where: { tenantId: params.tenantId, workspaceId: params.workspaceId, analysisRequestId: params.analysisRequestId },
      })) + 1;

      const created = await tx.radarAnalysisAttempt.create({
        data: {
          tenantId: params.tenantId, workspaceId: params.workspaceId,
          analysisRequestId: params.analysisRequestId, attemptOperationKey,
          attemptNumber, status: "pending",
          generationConfig: generationConfig as unknown as Prisma.InputJsonValue,
        },
      });
      return { attempt: toAttemptRecord(created), recovered: false };
    }, { maxWait: 5000, timeout: 10000 });
  } catch (e) {
    if (isAttemptOperationKeyUniqueViolation(e)) {
      // Corrida real: duas criações concorrentes com a mesma chave. A
      // perdedora relê num client novo (nunca a transação abortada) e
      // recupera — nunca gera conflito por generationConfig divergente
      // (1.18: caso C).
      const existing = await db.radarAnalysisAttempt.findFirst({
        where: { tenantId: params.tenantId, workspaceId: params.workspaceId, analysisRequestId: params.analysisRequestId, attemptOperationKey },
      });
      if (!existing) throw e;
      return { attempt: toAttemptRecord(existing), recovered: true };
    }
    if (isOnlyOneActiveAttemptViolation(e)) {
      // Guarda de NOVA escrita (índice único parcial, Atualização 1.12/1.15):
      // já existe uma tentativa pending/running para esta solicitação sob
      // OUTRA attemptOperationKey — condição diferente da recuperação por
      // chave (acima), nunca confundida com ela.
      throw new RadarAnalysisAttemptConflictError("only_one_active_attempt_allowed", { analysisRequestId: params.analysisRequestId });
    }
    throw e;
  }
}

// --- Protocolo explícito de posse (Atualização 1.18) -----------------------

/**
 * Passo "iniciar tentativa": `pending -> running`, gerando um `claimToken`
 * novo. Segue o protocolo de 7 passos: BEGIN (transação) -> `SELECT ...
 * FOR UPDATE` (trava) -> ler estado sob a trava -> comparar em código ->
 * `UPDATE` condicionado -> 0 linhas = recusa limpa -> COMMIT.
 */
export async function claimAttempt(
  params: OperationContext & { attemptId: string; workerId: string; resolver: RadarEntityAccessResolver },
  db: PrismaClient = prismaGlobal
): Promise<{ attempt: RadarAnalysisAttemptRecord; claimToken: string }> {
  const withRequest = await loadAttemptWithRequest(db, params);
  await assertAttemptAccess(db, {
    tenantId: params.tenantId, workspaceId: params.workspaceId,
    requestedByUserId: withRequest.analysisRequest.requestedByUserId,
    entityId: withRequest.analysisRequest.entityId, resolver: params.resolver,
    scope: RADAR_SOCIAL_ANALYSIS_EXECUTE_SCOPE, operation: "analyze",
  });

  const newToken = randomUUID();
  return await db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string; status: string }>>(Prisma.sql`
      SELECT id, status FROM radar_analysis_attempts
      WHERE id = ${params.attemptId} AND tenant_id = ${params.tenantId} AND workspace_id = ${params.workspaceId}
      FOR UPDATE
    `);
    if (rows.length === 0) throw new RadarAnalysisAttemptNotFoundError();
    if (rows[0]!.status !== "pending") {
      throw new RadarAnalysisAttemptConflictError("attempt_not_pending", { status: rows[0]!.status });
    }

    const affected = await tx.$executeRaw(Prisma.sql`
      UPDATE radar_analysis_attempts
      SET status = 'running', claim_token = ${newToken}, claimed_by_worker_id = ${params.workerId},
          claimed_at = clock_timestamp(), updated_at = clock_timestamp()
      WHERE id = ${params.attemptId} AND tenant_id = ${params.tenantId} AND workspace_id = ${params.workspaceId}
        AND status = 'pending'
    `);
    if (affected === 0) {
      throw new RadarAnalysisAttemptConflictError("claim_lost_race");
    }
    const updated = await tx.radarAnalysisAttempt.findFirstOrThrow({
      where: { id: params.attemptId, tenantId: params.tenantId, workspaceId: params.workspaceId },
    });
    return { attempt: toAttemptRecord(updated), claimToken: newToken };
  }, { maxWait: 5000, timeout: 10000 });
}

export interface SubstituteExecutorInput {
  objective: string;
  additionalContext: string | null;
  materialConteudo: string;
  generationConfig: GenerationConfig;
}

export interface SubstituteExecutorOutput {
  candidate: unknown;
  provider: string;
  model: string;
  providerRequestId: string;
}

/** Assinatura do executor/provedor SUBSTITUTO — nenhuma implementação de
 * produção existe nesta unidade; só duplos controlados em `__tests__/`. */
export type SubstituteAnalysisExecutor = (input: SubstituteExecutorInput) => Promise<SubstituteExecutorOutput>;

/**
 * Passo "preservar resultado durável": `running ->
 * provider_responded_pending_persistence`. Mede/valida tamanho ANTES de
 * qualquer escrita; `clock_timestamp()` avaliado no instante da própria
 * escrita condicionada, nunca reaproveitado de uma leitura anterior.
 */
export async function preserveResult(
  params: OperationContext & { attemptId: string; claimToken: string; executorOutput: SubstituteExecutorOutput },
  db: PrismaClient = prismaGlobal
): Promise<RadarAnalysisAttemptRecord> {
  // Validação de forma/tamanho ANTES de qualquer escrita (Atualização 1.18).
  const prepared = preparePreservedResult(params.executorOutput.candidate);
  const provider = validateProvenanceField(params.executorOutput.provider, "provider");
  const model = validateProvenanceField(params.executorOutput.model, "model");
  const providerRequestId = validateProvenanceField(params.executorOutput.providerRequestId, "providerRequestId");

  return await db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string; status: string; claim_token: string | null; claimed_at: Date | null }>>(Prisma.sql`
      SELECT id, status, claim_token, claimed_at FROM radar_analysis_attempts
      WHERE id = ${params.attemptId} AND tenant_id = ${params.tenantId} AND workspace_id = ${params.workspaceId}
      FOR UPDATE
    `);
    if (rows.length === 0) throw new RadarAnalysisAttemptNotFoundError();

    const affected = await tx.$executeRaw(Prisma.sql`
      UPDATE radar_analysis_attempts
      SET status = 'provider_responded_pending_persistence',
          preserved_result_payload = ${JSON.stringify(prepared.payload)}::jsonb,
          preserved_result_hash = ${prepared.hash},
          preserved_result_version = ${"radar-analysis-preserved-result.v1"},
          preserved_result_provider = ${provider},
          preserved_result_model = ${model},
          preserved_result_provider_request_id = ${providerRequestId},
          preserved_at = clock_timestamp(),
          updated_at = clock_timestamp()
      WHERE id = ${params.attemptId} AND tenant_id = ${params.tenantId} AND workspace_id = ${params.workspaceId}
        AND claim_token = ${params.claimToken} AND status = 'running'
        AND clock_timestamp() < claimed_at + (${ATTEMPT_LEASE_TTL_SECONDS} || ' seconds')::interval
    `);
    if (affected === 0) {
      throw new RadarAnalysisAttemptConflictError("preserve_result_rejected_stale_or_expired_claim");
    }
    const updated = await tx.radarAnalysisAttempt.findFirstOrThrow({
      where: { id: params.attemptId, tenantId: params.tenantId, workspaceId: params.workspaceId },
    });
    return toAttemptRecord(updated);
  }, { maxWait: 5000, timeout: 10000 });
}

export interface ConcludeAttemptResult {
  attempt: RadarAnalysisAttemptRecord;
  recommendation: RadarRecommendationRecord | null;
}

/**
 * Passo "validar/concluir": lê `preservedResultPayload` (sem chamar o
 * provedor de novo), valida o candidato e suas referências contra o
 * material/contexto, e persiste `RadarRecommendation` + `status='completed'`
 * numa única transação condicionada — ou marca `failed` sem criar
 * recomendação, se a validação falhar.
 */
export async function concludeAttempt(
  params: OperationContext & { attemptId: string; claimToken: string; resolver: RadarEntityAccessResolver },
  db: PrismaClient = prismaGlobal
): Promise<ConcludeAttemptResult> {
  const withRequest = await loadAttemptWithRequest(db, params);
  await assertAttemptAccess(db, {
    tenantId: params.tenantId, workspaceId: params.workspaceId,
    requestedByUserId: withRequest.analysisRequest.requestedByUserId,
    entityId: withRequest.analysisRequest.entityId, resolver: params.resolver,
    scope: RADAR_SOCIAL_ANALYSIS_EXECUTE_SCOPE, operation: "analyze",
  });

  if (withRequest.status !== "provider_responded_pending_persistence" || !withRequest.preservedResultPayload) {
    throw new RadarAnalysisAttemptConflictError("no_preserved_result_to_conclude", { status: withRequest.status });
  }

  const material = await db.radarMaterial.findFirst({
    where: { id: withRequest.analysisRequest.materialId, tenantId: params.tenantId, workspaceId: params.workspaceId },
  });
  if (!material) throw new RadarKnownEntityNotFoundError("radar_material_not_found_in_scope");

  let failure: { reasonCode: string; context?: Record<string, unknown> } | null = null;
  let candidate: ReturnType<typeof validateRecommendationCandidate> | null = null;
  try {
    candidate = validateRecommendationCandidate(withRequest.preservedResultPayload);
    // Recomputa o hash sobre a forma relida (regra de reconstrução:
    // reordena chaves antes de comparar — nunca depende da ordem bruta
    // devolvida pelo banco, Atualização 1.18).
    const recomputedHash = computePreservedResultHash(withRequest.preservedResultPayload as never);
    if (recomputedHash !== withRequest.preservedResultHash) {
      throw new RadarAnalysisAttemptError("preserved_result_hash_mismatch");
    }
    const sources = [material.conteudo, withRequest.analysisRequest.additionalContext].filter((s): s is string => typeof s === "string");
    verifyReferencesAgainstSources(candidate.references, sources);
  } catch (e) {
    if (e instanceof RadarRecommendationError || e instanceof RadarAnalysisAttemptError) {
      failure = { reasonCode: e.reasonCode, context: e.context };
    } else {
      throw e;
    }
  }

  return await db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id FROM radar_analysis_attempts
      WHERE id = ${params.attemptId} AND tenant_id = ${params.tenantId} AND workspace_id = ${params.workspaceId}
      FOR UPDATE
    `);
    if (rows.length === 0) throw new RadarAnalysisAttemptNotFoundError();

    // Ponto de serialização único (Atualização 1.24/1.25): trava a
    // entidade DEPOIS da tentativa (mesma ordem sempre — nenhum caminho
    // trava entidade antes de tentativa), e revalida `analyze` do
    // requestedByUserId NESTE INSTANTE, sob a trava — nunca reaproveitando
    // a checagem já feita antes da transação. Uma revogação concorrente da
    // mesma linha de grant só pode commitar antes desta trava ser obtida
    // (e então já é vista aqui) ou depois dela ser liberada (nunca no
    // meio) — sem prometer atomicidade com TenantMembership/escopo, que
    // não participam deste lock.
    await tx.$queryRaw(Prisma.sql`
      SELECT id FROM radar_known_entities
      WHERE id = ${withRequest.analysisRequest.entityId} AND tenant_id = ${params.tenantId} AND workspace_id = ${params.workspaceId}
      FOR UPDATE
    `);
    const revalidatedOutcome = await params.resolver({
      confirmedIdentity: withRequest.analysisRequest.requestedByUserId,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      entityId: withRequest.analysisRequest.entityId,
      operation: "analyze",
    });
    if (revalidatedOutcome !== "authorized") {
      // Revogação efetivada em algum momento até este instante — nenhuma
      // recomendação é criada, nenhuma mudança de status ocorre (a
      // tentativa permanece em provider_responded_pending_persistence,
      // retomável sem nova chamada ao provedor depois de uma reconcessão —
      // revogação é sempre PROSPECTIVA, nunca desfaz o que já foi
      // produzido, Atualização 1.24 seção 4).
      throw new RadarAnalysisAttemptConflictError("entity_access_revoked_before_conclusion", {
        outcome: revalidatedOutcome,
      });
    }

    if (failure) {
      const affected = await tx.$executeRaw(Prisma.sql`
        UPDATE radar_analysis_attempts
        SET status = 'failed', failure_reason_code = ${failure.reasonCode}, updated_at = clock_timestamp()
        WHERE id = ${params.attemptId} AND tenant_id = ${params.tenantId} AND workspace_id = ${params.workspaceId}
          AND claim_token = ${params.claimToken} AND status = 'provider_responded_pending_persistence'
          AND clock_timestamp() < claimed_at + (${ATTEMPT_LEASE_TTL_SECONDS} || ' seconds')::interval
      `);
      if (affected === 0) throw new RadarAnalysisAttemptConflictError("conclude_rejected_stale_or_expired_claim");
      const updated = await tx.radarAnalysisAttempt.findFirstOrThrow({ where: { id: params.attemptId, tenantId: params.tenantId, workspaceId: params.workspaceId } });
      return { attempt: toAttemptRecord(updated), recommendation: null };
    }

    const provenance = {
      generatedByAgent: "radar-test-model-v1",
      provider: withRequest.preservedResultProvider ?? "",
      model: withRequest.preservedResultModel ?? "",
      providerRequestId: withRequest.preservedResultProviderRequestId ?? "",
      generatedAt: new Date().toISOString(),
    };

    const createdRecommendation = await tx.radarRecommendation.create({
      data: {
        tenantId: params.tenantId, workspaceId: params.workspaceId, attemptId: params.attemptId,
        recommendationType: candidate!.recommendationType, summary: candidate!.summary,
        statements: candidate!.statements as unknown as Prisma.InputJsonValue,
        references: candidate!.references as unknown as Prisma.InputJsonValue,
        limitations: candidate!.limitations ?? null,
        suggestedAction: candidate!.suggestedAction ?? null,
        insufficientEvidenceReason: candidate!.insufficientEvidenceReason ?? null,
        doNotActReason: candidate!.doNotActReason ?? null,
        provenance: provenance as unknown as Prisma.InputJsonValue,
      },
    });

    const affected = await tx.$executeRaw(Prisma.sql`
      UPDATE radar_analysis_attempts
      SET status = 'completed', updated_at = clock_timestamp()
      WHERE id = ${params.attemptId} AND tenant_id = ${params.tenantId} AND workspace_id = ${params.workspaceId}
        AND claim_token = ${params.claimToken} AND status = 'provider_responded_pending_persistence'
        AND clock_timestamp() < claimed_at + (${ATTEMPT_LEASE_TTL_SECONDS} || ' seconds')::interval
    `);
    if (affected === 0) {
      // 0 linhas: posse perdida entre a checagem inicial e este instante —
      // descarta a transação inteira (a recomendação criada acima também é
      // desfeita pelo ROLLBACK), sem recomendação órfã.
      throw new RadarAnalysisAttemptConflictError("conclude_rejected_stale_or_expired_claim");
    }
    const updated = await tx.radarAnalysisAttempt.findFirstOrThrow({ where: { id: params.attemptId, tenantId: params.tenantId, workspaceId: params.workspaceId } });
    return {
      attempt: toAttemptRecord(updated),
      recommendation: {
        id: createdRecommendation.id, tenantId: createdRecommendation.tenantId, workspaceId: createdRecommendation.workspaceId,
        attemptId: createdRecommendation.attemptId, recommendationType: createdRecommendation.recommendationType as never,
        summary: createdRecommendation.summary, statements: candidate!.statements, references: candidate!.references,
        limitations: createdRecommendation.limitations, suggestedAction: createdRecommendation.suggestedAction,
        insufficientEvidenceReason: createdRecommendation.insufficientEvidenceReason, doNotActReason: createdRecommendation.doNotActReason,
        provenance, createdAt: createdRecommendation.createdAt,
      },
    };
  }, { maxWait: 5000, timeout: 10000 });
}

/**
 * Reconciliação: reivindica uma tentativa cuja posse expirou
 * (`clock_timestamp() >= claimed_at + TTL`), gerando um `claimToken` NOVO —
 * nunca reaproveita o token do trabalhador anterior. Só age sobre
 * `running`/`provider_responded_pending_persistence`; nunca sobre `pending`
 * (que usa `claimAttempt`) nem sobre estado terminal.
 */
export async function reclaimExpiredAttempt(
  params: OperationContext & { attemptId: string; workerId: string },
  db: PrismaClient = prismaGlobal
): Promise<{ attempt: RadarAnalysisAttemptRecord; claimToken: string }> {
  const newToken = randomUUID();
  return await db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string; status: string }>>(Prisma.sql`
      SELECT id, status FROM radar_analysis_attempts
      WHERE id = ${params.attemptId} AND tenant_id = ${params.tenantId} AND workspace_id = ${params.workspaceId}
      FOR UPDATE
    `);
    if (rows.length === 0) throw new RadarAnalysisAttemptNotFoundError();
    if (!["running", "provider_responded_pending_persistence"].includes(rows[0]!.status)) {
      throw new RadarAnalysisAttemptConflictError("attempt_not_reclaimable", { status: rows[0]!.status });
    }
    const affected = await tx.$executeRaw(Prisma.sql`
      UPDATE radar_analysis_attempts
      SET claim_token = ${newToken}, claimed_by_worker_id = ${params.workerId}, claimed_at = clock_timestamp(), updated_at = clock_timestamp()
      WHERE id = ${params.attemptId} AND tenant_id = ${params.tenantId} AND workspace_id = ${params.workspaceId}
        AND status IN ('running', 'provider_responded_pending_persistence')
        AND clock_timestamp() >= claimed_at + (${ATTEMPT_LEASE_TTL_SECONDS} || ' seconds')::interval
    `);
    if (affected === 0) {
      throw new RadarAnalysisAttemptConflictError("reclaim_rejected_not_expired_or_lost_race");
    }
    const updated = await tx.radarAnalysisAttempt.findFirstOrThrow({ where: { id: params.attemptId, tenantId: params.tenantId, workspaceId: params.workspaceId } });
    return { attempt: toAttemptRecord(updated), claimToken: newToken };
  }, { maxWait: 5000, timeout: 10000 });
}

/** Marca um pedido de cancelamento — não interrompe uma chamada em curso,
 * não muda `status` sozinho. O EXECUTOR observa isto no seu próprio
 * checkpoint (aqui: dentro de `runSimulatedAnalysis`, antes de concluir). */
export async function requestAttemptCancellation(
  params: OperationContext & { attemptId: string },
  db: PrismaClient = prismaGlobal
): Promise<void> {
  await db.radarAnalysisAttempt.updateMany({
    where: { id: params.attemptId, tenantId: params.tenantId, workspaceId: params.workspaceId, cancelRequestedAt: null },
    data: { cancelRequestedAt: new Date() },
  });
}

/**
 * Orquestração de ponta a ponta com o executor SUBSTITUTO: claim -> chamar
 * o substituto -> preservar -> concluir. Demonstra o fluxo "análise
 * simulada" sem Run, fila ou chamada real. Se `cancelRequestedAt` já
 * estiver marcado no momento do checkpoint pós-resposta, efetiva o
 * cancelamento em vez de concluir.
 */
export async function runSimulatedAnalysis(
  params: OperationContext & {
    attemptId: string; workerId: string; resolver: RadarEntityAccessResolver;
    executor: SubstituteAnalysisExecutor;
  },
  db: PrismaClient = prismaGlobal
): Promise<ConcludeAttemptResult> {
  const withRequest = await loadAttemptWithRequest(db, params);
  await assertAttemptAccess(db, {
    tenantId: params.tenantId, workspaceId: params.workspaceId,
    requestedByUserId: withRequest.analysisRequest.requestedByUserId,
    entityId: withRequest.analysisRequest.entityId, resolver: params.resolver,
    scope: RADAR_SOCIAL_ANALYSIS_EXECUTE_SCOPE, operation: "analyze",
  });

  const material = await db.radarMaterial.findFirst({
    where: { id: withRequest.analysisRequest.materialId, tenantId: params.tenantId, workspaceId: params.workspaceId },
  });
  if (!material) throw new RadarKnownEntityNotFoundError("radar_material_not_found_in_scope");

  const { claimToken } = await claimAttempt(params, db);

  const executorOutput = await params.executor({
    objective: withRequest.analysisRequest.objective,
    additionalContext: withRequest.analysisRequest.additionalContext,
    materialConteudo: material.conteudo,
    generationConfig: parseGenerationConfig(withRequest.generationConfig),
  });

  await preserveResult({ tenantId: params.tenantId, workspaceId: params.workspaceId, attemptId: params.attemptId, claimToken, executorOutput }, db);

  const refreshed = await db.radarAnalysisAttempt.findFirstOrThrow({ where: { id: params.attemptId, tenantId: params.tenantId, workspaceId: params.workspaceId } });
  if (refreshed.cancelRequestedAt) {
    await db.radarAnalysisAttempt.updateMany({
      where: { id: params.attemptId, tenantId: params.tenantId, workspaceId: params.workspaceId, status: "provider_responded_pending_persistence", claimToken },
      data: { status: "cancelled" },
    });
    const cancelled = await db.radarAnalysisAttempt.findFirstOrThrow({ where: { id: params.attemptId, tenantId: params.tenantId, workspaceId: params.workspaceId } });
    return { attempt: toAttemptRecord(cancelled), recommendation: null };
  }

  return await concludeAttempt({ tenantId: params.tenantId, workspaceId: params.workspaceId, attemptId: params.attemptId, claimToken, resolver: params.resolver }, db);
}

export async function getRadarAnalysisAttempt(
  params: OperationContext & { attemptId: string; resolver: RadarEntityAccessResolver },
  db: PrismaClient = prismaGlobal
): Promise<RadarAnalysisAttemptRecord> {
  const withRequest = await loadAttemptWithRequest(db, params);
  await assertAttemptAccess(db, {
    tenantId: params.tenantId, workspaceId: params.workspaceId,
    requestedByUserId: withRequest.analysisRequest.requestedByUserId,
    entityId: withRequest.analysisRequest.entityId, resolver: params.resolver,
    scope: RADAR_SOCIAL_READ_SCOPE, operation: "read",
  });
  return toAttemptRecord(withRequest);
}

export { TERMINAL_ATTEMPT_STATUSES };
