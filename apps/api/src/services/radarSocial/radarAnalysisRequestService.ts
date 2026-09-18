// Radar Social — serviço de RadarAnalysisRequest: criação idempotente da
// solicitação de análise, com a primeira RadarAnalysisAttempt nascendo
// junto (Atualização 1.11/1.14/1.15/1.18 do plano). NÃO executa análise,
// NÃO chama executor/provedor, NÃO publica Run/fila.
import { Prisma, type PrismaClient, prismaGlobal } from "@repo/db";
import {
  validateCreateRadarAnalysisRequestInput,
  type CreateRadarAnalysisRequestInput,
  type RadarAnalysisRequestIdentity,
  type RadarAnalysisRequestRecord,
  RadarAnalysisRequestConflictError,
} from "./radarAnalysisRequestContract";
import {
  resolveGenerationConfig,
  INITIAL_ATTEMPT_OPERATION_KEY,
  type GenerationConfig,
} from "./radarAnalysisAttemptContract";
import type { RadarAnalysisAttemptRecord } from "./radarAnalysisAttemptService";
import { toAttemptRecord } from "./radarAnalysisAttemptService";
import {
  assertRadarSocialOperationAuthorized,
  RadarKnownEntityNotFoundError,
} from "./radarKnownEntityService";
import {
  reasonCodeForRadarEntityAccessOutcome,
  type RadarEntityAccessResolver,
} from "./radarEntityAccessResolver";

// Escopo PROVISÓRIO, mesmo aviso já usado pelos demais escopos do Radar —
// nome novo, não integrado a nenhuma matriz ratificada fora desta unidade.
export const RADAR_SOCIAL_ANALYSIS_REQUEST_SCOPE = "radar_social.analysis.request";

interface OperationContext {
  tenantId: string;
  workspaceId: string;
  actorUserId: string;
}

function toRequestRecord(row: {
  id: string; tenantId: string; workspaceId: string; entityId: string; materialId: string;
  objective: string; additionalContext: string | null; requestedByUserId: string;
  operationKey: string; createdAt: Date;
}): RadarAnalysisRequestRecord {
  return {
    id: row.id, tenantId: row.tenantId, workspaceId: row.workspaceId, entityId: row.entityId,
    materialId: row.materialId, objective: row.objective, additionalContext: row.additionalContext,
    requestedByUserId: row.requestedByUserId, operationKey: row.operationKey, createdAt: row.createdAt,
  };
}

function requestRowIdentity(row: {
  entityId: string; materialId: string; objective: string; additionalContext: string | null; requestedByUserId: string;
}): RadarAnalysisRequestIdentity {
  return {
    entityId: row.entityId, materialId: row.materialId, objective: row.objective,
    additionalContext: row.additionalContext, requestedByUserId: row.requestedByUserId,
  };
}

const OPERATION_KEY_CONSTRAINT_COLUMNS = ["tenant_id", "workspace_id", "operation_key"].sort();

function isRequestOperationKeyUniqueViolation(error: unknown): boolean {
  const typed = error as Prisma.PrismaClientKnownRequestError | undefined | null;
  if (!typed || typeof typed !== "object" || typed.code !== "P2002") return false;
  const meta = typed.meta as Record<string, unknown> | undefined;
  if (!meta || meta.modelName !== "RadarAnalysisRequest") return false;
  const driverAdapterError = meta.driverAdapterError as Record<string, unknown> | undefined;
  const cause = driverAdapterError?.cause as Record<string, unknown> | undefined;
  if (!cause || cause.kind !== "UniqueConstraintViolation") return false;
  const constraint = cause.constraint as Record<string, unknown> | undefined;
  const fields = constraint?.fields;
  if (!Array.isArray(fields) || fields.some((v) => typeof v !== "string")) return false;
  const sorted = [...(fields as string[])].sort();
  return sorted.length === OPERATION_KEY_CONSTRAINT_COLUMNS.length && sorted.every((v, i) => v === OPERATION_KEY_CONSTRAINT_COLUMNS[i]);
}

export interface GenerationConfigInput {
  requestedModel: unknown;
  requestedMaxTokens?: unknown;
  promptTemplateVersion: unknown;
  knowledgePolicySnapshot: unknown;
  agentKey?: unknown;
  agentVersion?: unknown;
}

export interface CreateRadarAnalysisRequestParams extends OperationContext {
  input: CreateRadarAnalysisRequestInput;
  // Resolução server-side da configuração da PRIMEIRA tentativa — nunca do
  // corpo do chamador (Atualização 1.16/1.17/1.18). Num sistema real, viria
  // do perfil do agente/política vigente; nesta unidade é fornecida
  // explicitamente por quem chama o serviço (nenhum agente real existe).
  generationConfigInput: GenerationConfigInput;
  resolver: RadarEntityAccessResolver;
}

export interface CreateRadarAnalysisRequestResult {
  request: RadarAnalysisRequestRecord;
  firstAttempt: RadarAnalysisAttemptRecord;
  recovered: boolean;
}

/**
 * Cria (ou recupera idempotentemente) uma solicitação de análise, com sua
 * primeira tentativa (`attemptOperationKey` fixo `"initial"`) nascendo na
 * mesma transação. Reenvio com a mesma `operationKey` e identidade completa
 * idêntica recupera a solicitação e a tentativa já existentes, sem
 * recalcular `generationConfig` (Atualização 1.18) e sem criar nada novo.
 */
export async function createRadarAnalysisRequest(
  params: CreateRadarAnalysisRequestParams,
  db: PrismaClient = prismaGlobal
): Promise<CreateRadarAnalysisRequestResult> {
  await assertRadarSocialOperationAuthorized(db, params, RADAR_SOCIAL_ANALYSIS_REQUEST_SCOPE);
  const validated = validateCreateRadarAnalysisRequestInput(params.input);

  const entity = await db.radarKnownEntity.findFirst({
    where: { id: validated.entityId, tenantId: params.tenantId, workspaceId: params.workspaceId },
  });
  if (!entity) throw new RadarKnownEntityNotFoundError();

  const material = await db.radarMaterial.findFirst({
    where: { id: validated.materialId, tenantId: params.tenantId, workspaceId: params.workspaceId, entityId: validated.entityId },
  });
  if (!material) throw new RadarKnownEntityNotFoundError("radar_material_not_found_in_scope");

  const accessOutcome = await params.resolver({
    confirmedIdentity: params.actorUserId,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    entityId: validated.entityId,
    operation: "analyze",
  });
  if (accessOutcome !== "authorized") {
    throw new RadarKnownEntityNotFoundError(reasonCodeForRadarEntityAccessOutcome(accessOutcome) ?? "radar_known_entity_not_found");
  }

  const attemptedIdentity: RadarAnalysisRequestIdentity = {
    entityId: validated.entityId,
    materialId: validated.materialId,
    objective: validated.objective,
    additionalContext: validated.additionalContext,
    requestedByUserId: params.actorUserId,
  };

  try {
    return await db.$transaction(async (tx) => {
      // Recuperação-primeiro, mesma ordem já usada em RadarMaterial: procura
      // uma solicitação existente sob a MESMA operationKey antes de validar
      // qualquer coisa relativa a uma escrita nova.
      const existingByOperationKey = await tx.radarAnalysisRequest.findFirst({
        where: { tenantId: params.tenantId, workspaceId: params.workspaceId, operationKey: validated.operationKey },
        include: { attempts: true },
      });
      if (existingByOperationKey) {
        return resolveRecoveryOrConflict(existingByOperationKey, attemptedIdentity);
      }

      const generationConfig = resolveGenerationConfig({
        requestedModel: params.generationConfigInput.requestedModel,
        requestedMaxTokens: params.generationConfigInput.requestedMaxTokens,
        promptTemplateVersion: params.generationConfigInput.promptTemplateVersion,
        knowledgePolicySnapshot: params.generationConfigInput.knowledgePolicySnapshot,
        agentKey: params.generationConfigInput.agentKey,
        agentVersion: params.generationConfigInput.agentVersion,
      });

      const createdRequest = await tx.radarAnalysisRequest.create({
        data: {
          tenantId: params.tenantId,
          workspaceId: params.workspaceId,
          entityId: validated.entityId,
          materialId: validated.materialId,
          objective: validated.objective,
          additionalContext: validated.additionalContext,
          requestedByUserId: params.actorUserId,
          operationKey: validated.operationKey,
        },
      });

      const createdAttempt = await tx.radarAnalysisAttempt.create({
        data: {
          tenantId: params.tenantId,
          workspaceId: params.workspaceId,
          analysisRequestId: createdRequest.id,
          attemptOperationKey: INITIAL_ATTEMPT_OPERATION_KEY,
          attemptNumber: 1,
          status: "pending",
          generationConfig: generationConfig as unknown as Prisma.InputJsonValue,
        },
      });

      return {
        request: toRequestRecord(createdRequest),
        firstAttempt: toAttemptRecord(createdAttempt),
        recovered: false,
      };
    }, { maxWait: 5000, timeout: 10000 });
  } catch (e) {
    if (isRequestOperationKeyUniqueViolation(e)) {
      const existing = await db.radarAnalysisRequest.findFirst({
        where: { tenantId: params.tenantId, workspaceId: params.workspaceId, operationKey: validated.operationKey },
        include: { attempts: true },
      });
      if (!existing) throw e;
      return resolveRecoveryOrConflict(existing, attemptedIdentity);
    }
    throw e;
  }
}

function resolveRecoveryOrConflict(
  existing: Parameters<typeof requestRowIdentity>[0] & {
    id: string; tenantId: string; workspaceId: string; operationKey: string; createdAt: Date;
    attempts: Array<Parameters<typeof toAttemptRecord>[0]>;
  },
  attempted: RadarAnalysisRequestIdentity
): CreateRadarAnalysisRequestResult {
  const matches =
    existing.entityId === attempted.entityId &&
    existing.materialId === attempted.materialId &&
    existing.objective === attempted.objective &&
    (existing.additionalContext ?? null) === (attempted.additionalContext ?? null) &&
    existing.requestedByUserId === attempted.requestedByUserId;
  if (!matches) {
    throw new RadarAnalysisRequestConflictError("operation_key_reused_incompatible_request", { existingRequestId: existing.id });
  }
  const firstAttempt = existing.attempts.find((a) => a.attemptOperationKey === INITIAL_ATTEMPT_OPERATION_KEY) ?? existing.attempts[0];
  if (!firstAttempt) {
    throw new RadarAnalysisRequestConflictError("existing_request_without_initial_attempt", { existingRequestId: existing.id });
  }
  return {
    request: toRequestRecord(existing),
    firstAttempt: toAttemptRecord(firstAttempt),
    recovered: true,
  };
}

export async function getRadarAnalysisRequest(
  params: OperationContext & { requestId: string; resolver: RadarEntityAccessResolver },
  db: PrismaClient = prismaGlobal
): Promise<RadarAnalysisRequestRecord> {
  await assertRadarSocialOperationAuthorized(db, params, RADAR_SOCIAL_ANALYSIS_REQUEST_SCOPE);
  const row = await db.radarAnalysisRequest.findFirst({
    where: { id: params.requestId, tenantId: params.tenantId, workspaceId: params.workspaceId },
  });
  if (!row) throw new RadarKnownEntityNotFoundError("radar_analysis_request_not_found");

  const outcome = await params.resolver({
    confirmedIdentity: params.actorUserId,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    entityId: row.entityId,
    operation: "analyze",
  });
  if (outcome !== "authorized") {
    throw new RadarKnownEntityNotFoundError(reasonCodeForRadarEntityAccessOutcome(outcome) ?? "radar_known_entity_not_found");
  }
  return toRequestRecord(row);
}

export type { GenerationConfig };
