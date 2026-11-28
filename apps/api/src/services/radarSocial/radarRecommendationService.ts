// Radar Social — serviço de RadarRecommendation: recuperação por leitura
// autorizada, sem consumo de modelo e sem criar tentativa nova (Atualização
// 1.12/1.15/1.17/1.18 do plano). Nenhuma escrita acontece aqui — a criação
// de RadarRecommendation vive em radarAnalysisAttemptService.ts::concludeAttempt.
import { type PrismaClient, prismaGlobal } from "@repo/db";
import {
  RadarRecommendationError,
  type RecommendationStatement,
  type RecommendationReference,
  type RadarRecommendationProvenance,
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

export class RadarRecommendationNotFoundError extends Error {
  constructor(readonly reasonCode: string = "radar_recommendation_not_found", readonly context: Record<string, unknown> = {}) {
    super(reasonCode);
    this.name = "RadarRecommendationNotFoundError";
  }
}

function toRecommendationRecord(row: {
  id: string; tenantId: string; workspaceId: string; attemptId: string; recommendationType: string;
  summary: string; statements: unknown; references: unknown; limitations: string | null;
  suggestedAction: string | null; insufficientEvidenceReason: string | null; doNotActReason: string | null;
  provenance: unknown; createdAt: Date;
}): RadarRecommendationRecord {
  return {
    id: row.id, tenantId: row.tenantId, workspaceId: row.workspaceId, attemptId: row.attemptId,
    recommendationType: row.recommendationType as RadarRecommendationRecord["recommendationType"],
    summary: row.summary,
    statements: row.statements as RecommendationStatement[],
    references: row.references as RecommendationReference[],
    limitations: row.limitations, suggestedAction: row.suggestedAction,
    insufficientEvidenceReason: row.insufficientEvidenceReason, doNotActReason: row.doNotActReason,
    provenance: row.provenance as RadarRecommendationProvenance,
    createdAt: row.createdAt,
  };
}

/**
 * Recuperar recomendação — LEITURA autorizada. Nunca consome modelo, nunca
 * cria/reclama tentativa. Usuários finais só acessam a recomendação já
 * validada por esta função — nunca `preservedResultPayload` (interno,
 * exclusivo do executor/reconciliação, ver radarAnalysisAttemptService.ts).
 */
export async function getRadarRecommendation(
  params: { tenantId: string; workspaceId: string; actorUserId: string; attemptId: string; resolver: RadarEntityAccessResolver },
  db: PrismaClient = prismaGlobal
): Promise<RadarRecommendationRecord> {
  await assertRadarSocialOperationAuthorized(db, params, RADAR_SOCIAL_READ_SCOPE);

  const recommendation = await db.radarRecommendation.findFirst({
    where: { attemptId: params.attemptId, tenantId: params.tenantId, workspaceId: params.workspaceId },
    include: { attempt: { include: { analysisRequest: true } } },
  });
  if (!recommendation) throw new RadarRecommendationNotFoundError();

  const outcome = await params.resolver({
    confirmedIdentity: params.actorUserId,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    entityId: recommendation.attempt.analysisRequest.entityId,
    operation: "read",
  });
  if (outcome !== "authorized") {
    throw new RadarRecommendationNotFoundError(reasonCodeForRadarEntityAccessOutcome(outcome) ?? "radar_recommendation_not_found");
  }

  return toRecommendationRecord(recommendation);
}

export { RadarRecommendationError };
