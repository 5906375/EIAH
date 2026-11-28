// Radar Social — serviço de RadarRecommendationEvaluation: avaliação humana
// persistida de uma RadarRecommendation já existente. Nunca consome modelo,
// nunca cria/reclama tentativa, nunca ocupa vaga de concorrência — só LÊ uma
// recomendação já existente e persiste um julgamento sobre ela. Ver
// docs/architecture/radar-social-construction-plan-v1.md, "Fechamento
// documental proposto (18/09/2026)" e "Consolidação final (18/09/2026)".
import { Prisma, type PrismaClient, prismaGlobal } from "@repo/db";
import {
  RadarRecommendationEvaluationError,
  RadarRecommendationEvaluationConflictError,
  RADAR_RECOMMENDATION_EVALUATION_CONTRACT_VERSION,
  CURRENT_CRITERIA_VERSION,
  getRubricForCriteriaVersion,
  validateRecommendationId,
  validateOperationKey,
  validateSupersedesEvaluationId,
  validateEvaluationJudgment,
  evaluationRequestIdentityMatches,
  type EvaluationRequestIdentity,
  type EvaluationJudgment,
  type RadarRecommendationEvaluationRecord,
  type RadarRecommendationEvaluationRubric,
} from "./radarRecommendationEvaluationContract";
import {
  assertRadarSocialOperationAuthorized,
  RadarKnownEntityNotFoundError,
  RADAR_SOCIAL_READ_SCOPE,
} from "./radarKnownEntityService";
import { RadarRecommendationNotFoundError } from "./radarRecommendationService";
import {
  reasonCodeForRadarEntityAccessOutcome,
  type RadarEntityAccessResolver,
} from "./radarEntityAccessResolver";

// Escopo PROVISÓRIO, mesmo aviso já usado por todo escopo do Radar — nome
// novo, não integrado a nenhuma matriz ratificada fora desta unidade.
// "read" vigente na entidade continua sendo exigido À PARTE (nunca
// presumido por este escopo sozinho) — controla a CAPACIDADE de avaliar,
// nunca a VISIBILIDADE sobre a entidade.
export const RADAR_SOCIAL_RECOMMENDATION_EVALUATE_SCOPE = "radar_social.recommendation.evaluate";

interface OperationContext {
  tenantId: string;
  workspaceId: string;
  actorUserId: string;
}

type EvaluationRow = {
  id: string; tenantId: string; workspaceId: string; contractVersion: string;
  recommendationId: string; evaluatorUserId: string; criteriaVersion: string;
  fundamentacao: string; clareza: string; utilidade: string;
  justificativa: string | null; comentario: string | null;
  supersedesEvaluationId: string | null; operationKey: string; createdAt: Date;
};

function toRecord(row: EvaluationRow): RadarRecommendationEvaluationRecord {
  return {
    id: row.id, tenantId: row.tenantId, workspaceId: row.workspaceId, contractVersion: row.contractVersion,
    recommendationId: row.recommendationId, evaluatorUserId: row.evaluatorUserId, criteriaVersion: row.criteriaVersion,
    fundamentacao: row.fundamentacao as RadarRecommendationEvaluationRecord["fundamentacao"],
    clareza: row.clareza as RadarRecommendationEvaluationRecord["clareza"],
    utilidade: row.utilidade as RadarRecommendationEvaluationRecord["utilidade"],
    justificativa: row.justificativa, comentario: row.comentario,
    supersedesEvaluationId: row.supersedesEvaluationId, operationKey: row.operationKey, createdAt: row.createdAt,
  };
}

const OPERATION_KEY_CONSTRAINT_COLUMNS = [
  "evaluator_user_id", "operation_key", "recommendation_id", "tenant_id", "workspace_id",
].sort();
const SUCCESSION_CONSTRAINT_COLUMNS = [
  "evaluator_user_id", "recommendation_id", "supersedes_evaluation_id", "tenant_id", "workspace_id",
].sort();
const ROOT_CONSTRAINT_COLUMNS = ["evaluator_user_id", "recommendation_id", "tenant_id", "workspace_id"].sort();

type EvaluationUniqueViolationKind = "operation_key" | "succession" | "root" | "unclassified" | "other";

function classifyEvaluationUniqueViolation(error: unknown): EvaluationUniqueViolationKind {
  const typed = error as Prisma.PrismaClientKnownRequestError | undefined | null;
  if (!typed || typeof typed !== "object" || typed.code !== "P2002") return "unclassified";
  const meta = typed.meta as Record<string, unknown> | undefined;
  if (!meta || meta.modelName !== "RadarRecommendationEvaluation") return "unclassified";
  const driverAdapterError = meta.driverAdapterError as Record<string, unknown> | undefined;
  const cause = driverAdapterError?.cause as Record<string, unknown> | undefined;
  if (!cause || cause.kind !== "UniqueConstraintViolation") return "unclassified";
  const constraint = cause.constraint as Record<string, unknown> | undefined;
  const fields = constraint?.fields;
  if (!Array.isArray(fields) || fields.some((v) => typeof v !== "string")) return "unclassified";
  const sorted = [...(fields as string[])].sort();
  const matches = (expected: string[]) => sorted.length === expected.length && sorted.every((v, i) => v === expected[i]);
  if (matches(OPERATION_KEY_CONSTRAINT_COLUMNS)) return "operation_key";
  if (matches(SUCCESSION_CONSTRAINT_COLUMNS)) return "succession";
  if (matches(ROOT_CONSTRAINT_COLUMNS)) return "root";
  return "other";
}

/**
 * Compara a linha JÁ PERSISTIDA sob o mesmo operationKey contra a
 * identidade da solicitação atual — DELIBERADAMENTE sem `criteriaVersion`
 * na comparação (correção obrigatória desta unidade): essa versão é fixada
 * pelo servidor na criação e nunca recalculada num reenvio; o chamador
 * precisa ter validado `attempted` contra a rubrica CONGELADA no registro
 * (`existing.criteriaVersion`) antes de chegar aqui — nunca contra a
 * rubrica "vigente". Recuperação idempotente (retorna a linha existente,
 * `createdAt` original intacto) quando idênticas; conflito quando qualquer
 * campo diverge — nunca uma segunda gravação.
 */
function resolveRecoveryOrConflict(
  existing: EvaluationRow,
  attempted: EvaluationRequestIdentity
): { evaluation: RadarRecommendationEvaluationRecord; recovered: true } {
  const existingIdentity: EvaluationRequestIdentity = {
    recommendationId: existing.recommendationId,
    evaluatorUserId: existing.evaluatorUserId,
    fundamentacao: existing.fundamentacao as EvaluationRequestIdentity["fundamentacao"],
    clareza: existing.clareza as EvaluationRequestIdentity["clareza"],
    utilidade: existing.utilidade as EvaluationRequestIdentity["utilidade"],
    justificativa: existing.justificativa,
    comentario: existing.comentario,
    supersedesEvaluationId: existing.supersedesEvaluationId,
  };
  if (!evaluationRequestIdentityMatches(attempted, existingIdentity)) {
    throw new RadarRecommendationEvaluationConflictError("operation_key_reused_incompatible_evaluation", {
      existingEvaluationId: existing.id,
    });
  }
  return { evaluation: toRecord(existing), recovered: true };
}

/** Carrega a recomendação + a entidade a que ela pertence (via
 * attempt->analysisRequest) — mesma forma de leitura já usada por
 * getRadarRecommendation em radarRecommendationService.ts. */
async function loadRecommendationForEvaluation(
  db: PrismaClient,
  params: OperationContext & { recommendationId: string }
) {
  const row = await db.radarRecommendation.findFirst({
    where: { id: params.recommendationId, tenantId: params.tenantId, workspaceId: params.workspaceId },
    include: { attempt: { include: { analysisRequest: true } } },
  });
  if (!row) throw new RadarRecommendationNotFoundError();
  return row;
}

async function assertEntityReadAccess(
  params: OperationContext & { entityId: string; resolver: RadarEntityAccessResolver }
): Promise<void> {
  const outcome = await params.resolver({
    confirmedIdentity: params.actorUserId,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    entityId: params.entityId,
    operation: "read",
  });
  if (outcome !== "authorized") {
    throw new RadarKnownEntityNotFoundError(reasonCodeForRadarEntityAccessOutcome(outcome) ?? "radar_known_entity_not_found");
  }
}

export interface SubmitRadarRecommendationEvaluationParams extends OperationContext {
  recommendationId: string;
  operationKey: string;
  resolver: RadarEntityAccessResolver;
  fundamentacao: unknown;
  clareza: unknown;
  utilidade: unknown;
  justificativa: unknown;
  comentario: unknown;
  // Presente = correção (aponta para a avaliação raiz/anterior da MESMA
  // cadeia); ausente/null = avaliação raiz nova.
  supersedesEvaluationId?: unknown;
  // Duplos de teste (mesmo padrão de `db: PrismaClient = prismaGlobal` e de
  // `callCompletion` em runGovernedAnalysis) — produção NUNCA passa isso,
  // usa sempre os exports reais do contrato. Permitem provar que uma
  // mudança na rubrica "vigente" entre duas chamadas não afeta a
  // interpretação de uma avaliação já persistida sob uma versão anterior,
  // sem precisar adicionar uma entrada fictícia ao mapa real de produção.
  currentCriteriaVersionForTesting?: string;
  rubricsForTesting?: Record<string, RadarRecommendationEvaluationRubric>;
}

export interface SubmitRadarRecommendationEvaluationResult {
  evaluation: RadarRecommendationEvaluationRecord;
  recovered: boolean;
}

/**
 * Cria (ou recupera idempotentemente) uma avaliação — raiz nova ou
 * correção explícita de uma cadeia existente. Nunca chama
 * runCompletion/runGovernedAnalysis, nunca cria RadarAnalysisAttempt, nunca
 * ocupa RadarProviderCallSlot — só lê a RadarRecommendation alvo e persiste
 * o julgamento.
 */
export async function submitRadarRecommendationEvaluation(
  params: SubmitRadarRecommendationEvaluationParams,
  db: PrismaClient = prismaGlobal
): Promise<SubmitRadarRecommendationEvaluationResult> {
  await assertRadarSocialOperationAuthorized(db, params, RADAR_SOCIAL_RECOMMENDATION_EVALUATE_SCOPE);

  const recommendationId = validateRecommendationId(params.recommendationId);
  const operationKey = validateOperationKey(params.operationKey);
  const supersedesEvaluationId = validateSupersedesEvaluationId(params.supersedesEvaluationId);

  const recommendationRow = await loadRecommendationForEvaluation(db, {
    tenantId: params.tenantId, workspaceId: params.workspaceId, actorUserId: params.actorUserId, recommendationId,
  });
  const entityId = recommendationRow.attempt.analysisRequest.entityId;
  await assertEntityReadAccess({ ...params, entityId });

  const attemptedIdentityBase = { recommendationId, evaluatorUserId: params.actorUserId, supersedesEvaluationId };
  const rawJudgmentInput = {
    fundamentacao: params.fundamentacao, clareza: params.clareza, utilidade: params.utilidade,
    justificativa: params.justificativa, comentario: params.comentario,
  };
  const currentCriteriaVersion = params.currentCriteriaVersionForTesting ?? CURRENT_CRITERIA_VERSION;
  const rubrics = params.rubricsForTesting;

  try {
    return await db.$transaction(async (tx) => {
      // Recuperação-primeiro: existe uma linha sob a MESMA chave? Se sim,
      // valida o que foi RESUBMETIDO AGORA contra a rubrica CONGELADA no
      // registro — nunca a vigente — e compara identidade completa (sem
      // criteriaVersion, ver evaluationRequestIdentityMatches).
      const existingByOperationKey = await tx.radarRecommendationEvaluation.findFirst({
        where: {
          tenantId: params.tenantId, workspaceId: params.workspaceId,
          recommendationId, evaluatorUserId: params.actorUserId, operationKey,
        },
      });
      if (existingByOperationKey) {
        const frozenRubric = getRubricForCriteriaVersion(existingByOperationKey.criteriaVersion, rubrics);
        const judgment = validateEvaluationJudgment(rawJudgmentInput, frozenRubric);
        return resolveRecoveryOrConflict(existingByOperationKey, { ...attemptedIdentityBase, ...judgment });
      }

      // Escrita genuinamente NOVA: usa a rubrica CORRENTE — nenhuma linha
      // prévia existe para "congelar" a partir dela.
      const currentRubric = getRubricForCriteriaVersion(currentCriteriaVersion, rubrics);
      const judgment: EvaluationJudgment = validateEvaluationJudgment(rawJudgmentInput, currentRubric);

      // Ponto de serialização com a revogação/concessão de grants: trava a
      // MESMA linha de RadarKnownEntity que revokeRadarEntityAccess/
      // grantRadarEntityAccess já travam (radarEntityAccessGrantService.ts),
      // nunca outro recurso — e revalida "read" NESTE INSTANTE, sob a
      // trava, nunca reaproveitando a checagem já feita antes da espera
      // (assertEntityReadAccess, acima, pode ter ocorrido muito antes desta
      // transação sequer começar). Uma revogação concorrente só pode
      // commitar antes desta trava ser obtida (e então já é vista aqui,
      // abortando a escrita) ou depois dela ser liberada (nunca no meio) —
      // sem prometer atomicidade com TenantMembership/checkScopePermission
      // (workspace/escopo), que não participam deste lock (achado real
      // desta rodada: a ausência completa deste passo permitia que uma
      // revogação comprovadamente concluída ANTES do commit da escrita
      // não fosse detectada, mesmo sem qualquer FOR UPDATE explícito — a
      // sequência de idas e vindas ao banco dentro da transação já era
      // "espera" suficiente para a corrida ocorrer).
      await tx.$queryRaw(Prisma.sql`
        SELECT id FROM radar_known_entities
        WHERE id = ${entityId} AND tenant_id = ${params.tenantId} AND workspace_id = ${params.workspaceId}
        FOR UPDATE
      `);
      const revalidatedOutcome = await params.resolver({
        confirmedIdentity: params.actorUserId, tenantId: params.tenantId, workspaceId: params.workspaceId,
        entityId, operation: "read",
      });
      if (revalidatedOutcome !== "authorized") {
        throw new RadarKnownEntityNotFoundError(reasonCodeForRadarEntityAccessOutcome(revalidatedOutcome) ?? "radar_known_entity_not_found");
      }

      if (supersedesEvaluationId) {
        // Guarda de nova escrita (correção): predecessora precisa existir,
        // na MESMA cadeia (recomendação+avaliador), e ainda não ter
        // sucessora — mesma técnica de RadarMaterial.supersedesMaterialId
        // (radarMaterialService.ts), sem FOR UPDATE: a constraint de
        // sucessora única (@@unique([supersedesEvaluationId, ...])) é a
        // rede de segurança final contra a corrida real, capturada abaixo.
        const predecessor = await tx.radarRecommendationEvaluation.findFirst({
          where: {
            id: supersedesEvaluationId, tenantId: params.tenantId, workspaceId: params.workspaceId,
            recommendationId, evaluatorUserId: params.actorUserId,
          },
        });
        if (!predecessor) {
          throw new RadarRecommendationEvaluationError("supersedes_evaluation_not_found", { supersedesEvaluationId });
        }
        const alreadySuperseded = await tx.radarRecommendationEvaluation.findFirst({
          where: {
            supersedesEvaluationId, tenantId: params.tenantId, workspaceId: params.workspaceId,
            recommendationId, evaluatorUserId: params.actorUserId,
          },
        });
        if (alreadySuperseded) {
          throw new RadarRecommendationEvaluationConflictError("evaluation_already_corrected", {
            supersedesEvaluationId, successorEvaluationId: alreadySuperseded.id,
          });
        }
      }

      const created = await tx.radarRecommendationEvaluation.create({
        data: {
          tenantId: params.tenantId, workspaceId: params.workspaceId,
          contractVersion: RADAR_RECOMMENDATION_EVALUATION_CONTRACT_VERSION,
          recommendationId, evaluatorUserId: params.actorUserId,
          criteriaVersion: currentCriteriaVersion,
          fundamentacao: judgment.fundamentacao, clareza: judgment.clareza, utilidade: judgment.utilidade,
          justificativa: judgment.justificativa, comentario: judgment.comentario,
          supersedesEvaluationId, operationKey,
        },
      });
      return { evaluation: toRecord(created), recovered: false };
    }, { maxWait: 5000, timeout: 10000 });
  } catch (e) {
    const kind = classifyEvaluationUniqueViolation(e);
    if (kind === "unclassified" || kind === "other") throw e;
    // Corrida real: duas tentativas concorrentes passaram ambas pela
    // "nenhuma linha prévia" acima antes de uma delas confirmar. Resolve
    // FORA da transação abortada, com uma leitura nova no client raiz —
    // nunca reutiliza `tx` depois do rollback.
    if (kind === "operation_key") {
      const existing = await db.radarRecommendationEvaluation.findFirst({
        where: {
          tenantId: params.tenantId, workspaceId: params.workspaceId,
          recommendationId, evaluatorUserId: params.actorUserId, operationKey,
        },
      });
      if (!existing) throw e;
      // Recupera o VENCEDOR com sua versão CONGELADA — nunca recalcula a
      // vigente (correção obrigatória desta unidade).
      const winningRubric = getRubricForCriteriaVersion(existing.criteriaVersion, rubrics);
      const judgment = validateEvaluationJudgment(rawJudgmentInput, winningRubric);
      return resolveRecoveryOrConflict(existing, { ...attemptedIdentityBase, ...judgment });
    }
    if (kind === "succession") {
      throw new RadarRecommendationEvaluationConflictError("evaluation_already_corrected", { supersedesEvaluationId });
    }
    // kind === "root"
    throw new RadarRecommendationEvaluationConflictError("root_already_exists_use_correction", {
      recommendationId, evaluatorUserId: params.actorUserId,
    });
  }
}

export interface GetRadarRecommendationEvaluationParams extends OperationContext {
  evaluationId: string;
  resolver: RadarEntityAccessResolver;
}

export class RadarRecommendationEvaluationNotFoundError extends Error {
  constructor(readonly reasonCode: string = "radar_recommendation_evaluation_not_found", readonly context: Record<string, unknown> = {}) {
    super(reasonCode);
    this.name = "RadarRecommendationEvaluationNotFoundError";
  }
}

/** Leitura de UMA avaliação — de si mesmo ou de terceiros, MESMA regra
 * (Atualização "Fechamento documental proposto", seção B): RADAR_SOCIAL_READ_SCOPE
 * + "read" vigente na entidade da recomendação. Nunca cria/consome nada. */
export async function getRadarRecommendationEvaluation(
  params: GetRadarRecommendationEvaluationParams,
  db: PrismaClient = prismaGlobal
): Promise<RadarRecommendationEvaluationRecord> {
  await assertRadarSocialOperationAuthorized(db, params, RADAR_SOCIAL_READ_SCOPE);

  const row = await db.radarRecommendationEvaluation.findFirst({
    where: { id: params.evaluationId, tenantId: params.tenantId, workspaceId: params.workspaceId },
  });
  if (!row) throw new RadarRecommendationEvaluationNotFoundError();

  const recommendationRow = await loadRecommendationForEvaluation(db, {
    tenantId: params.tenantId, workspaceId: params.workspaceId, actorUserId: params.actorUserId,
    recommendationId: row.recommendationId,
  });
  const entityId = recommendationRow.attempt.analysisRequest.entityId;

  const outcome = await params.resolver({
    confirmedIdentity: params.actorUserId, tenantId: params.tenantId, workspaceId: params.workspaceId,
    entityId, operation: "read",
  });
  if (outcome !== "authorized") {
    throw new RadarRecommendationEvaluationNotFoundError(reasonCodeForRadarEntityAccessOutcome(outcome) ?? "radar_recommendation_evaluation_not_found");
  }
  return toRecord(row);
}

export interface ListRadarRecommendationEvaluationsParams extends OperationContext {
  recommendationId: string;
  resolver: RadarEntityAccessResolver;
}

/** Lista TODAS as avaliações (todas as cadeias, todos os avaliadores) de
 * UMA recomendação — acesso HERDADO da entidade (mesma política de
 * getRadarRecommendationEvaluation): uma única checagem do resolvedor
 * governa a página inteira, já que todas as linhas pertencem à MESMA
 * recomendação/entidade (nunca uma ACL por avaliação). */
export async function listRadarRecommendationEvaluationsForRecommendation(
  params: ListRadarRecommendationEvaluationsParams,
  db: PrismaClient = prismaGlobal
): Promise<RadarRecommendationEvaluationRecord[]> {
  await assertRadarSocialOperationAuthorized(db, params, RADAR_SOCIAL_READ_SCOPE);

  const recommendationId = validateRecommendationId(params.recommendationId);
  const recommendationRow = await loadRecommendationForEvaluation(db, {
    tenantId: params.tenantId, workspaceId: params.workspaceId, actorUserId: params.actorUserId, recommendationId,
  });
  const entityId = recommendationRow.attempt.analysisRequest.entityId;
  await assertEntityReadAccess({ ...params, entityId });

  const rows = await db.radarRecommendationEvaluation.findMany({
    where: { tenantId: params.tenantId, workspaceId: params.workspaceId, recommendationId },
    orderBy: [{ evaluatorUserId: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(toRecord);
}
