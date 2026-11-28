// Radar Social — demonstração interna navegável. Router HTTP fino: cada
// rota só extrai identidade de req.authContext (nunca de corpo/query),
// resolve o resolvedor real de acesso e delega inteiramente aos serviços já
// implementados/testados em apps/api/src/services/radarSocial/*.ts. Nenhuma
// regra de autorização, idempotência ou concorrência é reimplementada aqui.
//
// Caminho de execução: runGovernedAnalysis (execução GOVERNADA), nunca
// runSimulatedAnalysis — decisão corrigida em
// docs/architecture/radar-social-construction-plan-v1.md, "Fechamento
// documental da demonstração interna" e "Precisões de isolamento — rodada
// 2". `demoSubstituteCallCompletion`, abaixo, é o ÚNICO transporte que esta
// rota pode alcançar — nunca importa `runCompletion` de "@eiah/core"
// diretamente (verificável estaticamente; ver teste estrutural em
// apps/api/src/tests/radar-routes.test.ts).
import { randomUUID } from "node:crypto";
import type { Response } from "express";
import { prismaGlobal, type PrismaClient } from "@repo/db";
import type { ChatCompletionRequest, ChatCompletionResponse } from "@eiah/core";
import { createGovernedRouter } from "../middlewares/asyncHandler";
import { enforceTenant, type TenantAwareRequest } from "../middlewares/enforceTenant";
import { requireScope } from "../middlewares/requireScope";
import { isRadarSocialDemoDbVerified } from "./radarSocialDemoGate";

import {
  listRadarKnownEntities,
  getRadarKnownEntity,
  RadarKnownEntityNotFoundError,
  RadarKnownEntityConflictError,
  RADAR_SOCIAL_READ_SCOPE,
} from "../services/radarSocial/radarKnownEntityService";
import { RadarKnownEntityError } from "../services/radarSocial/radarKnownEntityContract";
import { RadarSocialAuthorizationError } from "../services/radarSocial/radarEntityAccessResolver";
import { createRadarEntityAccessResolver } from "../services/radarSocial/radarEntityAccessGrantService";
import {
  listRadarMaterials,
  receiveRadarMaterial,
  RadarMaterialNotFoundError,
  RADAR_SOCIAL_MATERIAL_WRITE_SCOPE,
} from "../services/radarSocial/radarMaterialService";
import { RadarMaterialError, RadarMaterialConflictError } from "../services/radarSocial/radarMaterialContract";
import {
  createRadarAnalysisRequest,
  RADAR_SOCIAL_ANALYSIS_REQUEST_SCOPE,
} from "../services/radarSocial/radarAnalysisRequestService";
import { RadarAnalysisRequestError, RadarAnalysisRequestConflictError } from "../services/radarSocial/radarAnalysisRequestContract";
import {
  getRadarAnalysisAttempt,
  RadarAnalysisAttemptNotFoundError,
  RADAR_SOCIAL_ANALYSIS_EXECUTE_SCOPE,
  type RadarAnalysisAttemptRecord,
} from "../services/radarSocial/radarAnalysisAttemptService";
import { RadarAnalysisAttemptError, RadarAnalysisAttemptConflictError } from "../services/radarSocial/radarAnalysisAttemptContract";
import { runGovernedAnalysis } from "../services/radarSocial/radarGovernedExecutionService";
import { getRadarRecommendation, RadarRecommendationNotFoundError } from "../services/radarSocial/radarRecommendationService";
import { RadarRecommendationError, type RadarRecommendationRecord } from "../services/radarSocial/radarRecommendationContract";
import {
  submitRadarRecommendationEvaluation,
  listRadarRecommendationEvaluationsForRecommendation,
  RadarRecommendationEvaluationNotFoundError,
  RADAR_SOCIAL_RECOMMENDATION_EVALUATE_SCOPE,
} from "../services/radarSocial/radarRecommendationEvaluationService";
import {
  RadarRecommendationEvaluationError,
  RadarRecommendationEvaluationConflictError,
} from "../services/radarSocial/radarRecommendationEvaluationContract";
import { WorkspaceAgentAssignmentError } from "../services/workspaceAgentAssignments";

// --- Identidade de agente/config fixadas no SERVIDOR (nunca do corpo) -----
//
// "radar-test-model-v1" é o ÚNICO valor aceito por resolveGenerationConfig
// (SUPPORTED_MODELS, radarAnalysisAttemptContract.ts) — reaproveitado aqui,
// não inventado. O par agentKey/agentVersion abaixo precisa corresponder
// EXATAMENTE ao AgentMetadata/WorkspaceAgentAssignment sintéticos preparados
// para a demonstração (ver apps/api/scripts/seedRadarSocialDemo.ts) — as
// duas pontas usam a MESMA constante, nunca duas fontes independentes.
export const RADAR_DEMO_AGENT_KEY = "radar-social-demo-agent" as const;
export const RADAR_DEMO_AGENT_VERSION = "1.0.0" as const;
const RADAR_DEMO_REQUESTED_MODEL = "radar-test-model-v1" as const;
const RADAR_DEMO_PROMPT_TEMPLATE_VERSION = "radar-social-demo-template.v1" as const;
const RADAR_DEMO_MAX_TOKENS = 512;
export const RADAR_DEMO_CONCURRENCY_LIMIT = 1;
const RADAR_DEMO_KNOWLEDGE_POLICY = {
  llmUsageMode: "grounded_reasoning",
  provenancePolicy: "recommended",
  maskingPolicy: "none",
} as const;

// Campos de identidade de agente/config — nunca aceitos do corpo desta rota
// (Fechamento documental, seção 1/2): o navegador não escolhe agente,
// versão, política de conhecimento, limite de concorrência ou transporte.
const FORBIDDEN_ANALYSIS_REQUEST_FIELDS = [
  "agentKey",
  "agentVersion",
  "knowledgePolicySnapshot",
  "requestedModel",
  "requestedMaxTokens",
  "promptTemplateVersion",
] as const;

// --- Transporte substituto — ÚNICO caminho alcançável por esta rota -------
//
// Contador de evidência COMPLEMENTAR (nunca prova suficiente sozinha de
// ausência de rede real — ver seção C das "Precisões de isolamento — rodada
// 2"; a prova primária é o teste estrutural de ausência de import de
// runCompletion, em radar-routes.test.ts).
export let radarDemoSubstituteCallCount = 0;
export function resetRadarDemoSubstituteCallCountForTesting(): void {
  radarDemoSubstituteCallCount = 0;
}

const MATERIAL_MARKER = "Material:\n";
const CONTEXT_MARKER = "\n\nContexto adicional:\n";

/**
 * Extrai literalmente o texto do material a partir da mensagem de usuário
 * montada por runGovernedAnalysis (radarGovernedExecutionService.ts) — os
 * mesmos dois marcadores usados lá para compor a mensagem são usados aqui
 * para decompô-la, garantindo que a citação devolvida seja um SUBSTRING
 * literal de `material.conteudo` (exigido por verifyReferencesAgainstSources,
 * radarRecommendationContract.ts) sem precisar reler o material do banco.
 */
function extractMaterialQuote(userMessage: string): string {
  const materialIndex = userMessage.indexOf(MATERIAL_MARKER);
  if (materialIndex < 0) return "";
  const afterMaterial = userMessage.slice(materialIndex + MATERIAL_MARKER.length);
  const contextIndex = afterMaterial.indexOf(CONTEXT_MARKER);
  const materialOnly = contextIndex >= 0 ? afterMaterial.slice(0, contextIndex) : afterMaterial;
  return materialOnly.slice(0, Math.min(120, materialOnly.length));
}

/**
 * Transporte SUBSTITUTO hardcoded — nunca chama runCompletion nem qualquer
 * provedor real. Produz um candidato estruturalmente válido
 * (RecommendationCandidate) cuja única referência é uma citação literal do
 * próprio material, para que concludeAttempt valide com sucesso e a
 * demonstração alcance um estado "completed" real, não só "failed".
 */
async function demoSubstituteCallCompletion(req: ChatCompletionRequest): Promise<ChatCompletionResponse> {
  radarDemoSubstituteCallCount += 1;
  const userMessage = req.messages.find((m) => m.role === "user")?.content ?? "";
  const quote = extractMaterialQuote(userMessage) || "demonstração interna";
  const candidate = {
    contractVersion: "radar-recommendation.v1",
    recommendationType: "actionable",
    summary:
      "Análise simulada de demonstração interna — resumo produzido pelo transporte substituto local, sem contato com provedor real.",
    statements: [
      {
        content: "Trecho do material citado literalmente para fins de demonstração.",
        natureza: "FACT_IN_MATERIAL",
        referenceIds: ["ref-1"],
        confidenceLevel: "medium",
      },
    ],
    references: [{ id: "ref-1", quote }],
    suggestedAction: "Revisar manualmente antes de qualquer decisão — resultado simulado, sem modelo real.",
  };
  return {
    id: `radar-demo-${randomUUID()}`,
    output: JSON.stringify(candidate),
    raw: null,
    finishReason: "stop",
    provider: "radar-demo-substitute",
    model: RADAR_DEMO_REQUESTED_MODEL,
    requestId: `radar-demo-req-${randomUUID()}`,
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  };
}

// --- Mapeamento de erro -> HTTP --------------------------------------------

const NOT_FOUND_ERRORS = [
  RadarKnownEntityNotFoundError,
  RadarMaterialNotFoundError,
  RadarRecommendationNotFoundError,
  RadarRecommendationEvaluationNotFoundError,
  RadarAnalysisAttemptNotFoundError,
] as const;
const CONFLICT_ERRORS = [
  RadarKnownEntityConflictError,
  RadarMaterialConflictError,
  RadarAnalysisRequestConflictError,
  RadarAnalysisAttemptConflictError,
  RadarRecommendationEvaluationConflictError,
] as const;
const BAD_REQUEST_ERRORS = [
  RadarKnownEntityError,
  RadarMaterialError,
  RadarAnalysisRequestError,
  RadarAnalysisAttemptError,
  RadarRecommendationError,
  RadarRecommendationEvaluationError,
] as const;

function hasReasonCode(err: unknown): err is { reasonCode: string } {
  return typeof err === "object" && err !== null && typeof (err as { reasonCode?: unknown }).reasonCode === "string";
}

/** Nunca revela mais que o serviço já revela — só traduz para status HTTP.
 * Retorna null quando o erro não é reconhecido (deixa propagar para
 * governedErrorHandler, 500 genérico). */
function respondToRadarError(res: Response, err: unknown): boolean {
  const reasonCode = hasReasonCode(err) ? err.reasonCode : "radar_social_unknown_error";
  if (err instanceof RadarSocialAuthorizationError) {
    res.status(403).json({ ok: false, error: { code: reasonCode, message: "Acesso negado" } });
    return true;
  }
  if (NOT_FOUND_ERRORS.some((C) => err instanceof C)) {
    res.status(404).json({ ok: false, error: { code: reasonCode, message: "Não encontrado ou sem acesso" } });
    return true;
  }
  if (CONFLICT_ERRORS.some((C) => err instanceof C)) {
    res.status(409).json({ ok: false, error: { code: reasonCode, message: "Conflito de operação" } });
    return true;
  }
  if (err instanceof WorkspaceAgentAssignmentError) {
    res
      .status(503)
      .json({ ok: false, error: { code: reasonCode, message: "Demonstração indisponível — configuração de agente incompleta" } });
    return true;
  }
  if (BAD_REQUEST_ERRORS.some((C) => err instanceof C)) {
    res.status(400).json({ ok: false, error: { code: reasonCode, message: "Entrada inválida" } });
    return true;
  }
  return false;
}

// --- Serialização (nunca expõe claimToken/preservedResultPayload/Run cru) -

function serializeEntity(e: { id: string; displayName: string; status: string; externalRef: string | null; revision: number }) {
  return { id: e.id, displayName: e.displayName, status: e.status, externalRef: e.externalRef, revision: e.revision };
}

function serializeMaterial(m: {
  id: string; entityId: string; conteudo: string; fonteDeclarada: string;
  capturadoEm: Date | null; supersedesMaterialId: string | null; providedByUserId: string; recebidoEm: Date;
}) {
  return {
    id: m.id, entityId: m.entityId, conteudo: m.conteudo, fonteDeclarada: m.fonteDeclarada,
    capturadoEm: m.capturadoEm, supersedesMaterialId: m.supersedesMaterialId,
    providedByUserId: m.providedByUserId, recebidoEm: m.recebidoEm,
  };
}

function serializeRequest(r: { id: string; entityId: string; materialId: string; objective: string; additionalContext: string | null; createdAt: Date }) {
  return { id: r.id, entityId: r.entityId, materialId: r.materialId, objective: r.objective, additionalContext: r.additionalContext, createdAt: r.createdAt };
}

// claimToken NUNCA exposto — único campo omitido de RadarAnalysisAttemptRecord.
function serializeAttempt(a: RadarAnalysisAttemptRecord) {
  const { claimToken: _claimToken, ...rest } = a;
  return rest;
}

function serializeRecommendation(r: RadarRecommendationRecord) {
  return r;
}

function serializeEvaluation(e: {
  id: string; recommendationId: string; evaluatorUserId: string; criteriaVersion: string;
  fundamentacao: string; clareza: string; utilidade: string; justificativa: string | null;
  comentario: string | null; supersedesEvaluationId: string | null; createdAt: Date;
}) {
  return {
    id: e.id, recommendationId: e.recommendationId, evaluatorUserId: e.evaluatorUserId, criteriaVersion: e.criteriaVersion,
    fundamentacao: e.fundamentacao, clareza: e.clareza, utilidade: e.utilidade, justificativa: e.justificativa,
    comentario: e.comentario, supersedesEvaluationId: e.supersedesEvaluationId, createdAt: e.createdAt,
  };
}

// --- Auth helper ------------------------------------------------------------

function requireAuth(req: TenantAwareRequest, res: Response): { tenantId: string; workspaceId: string; actorUserId: string; db: PrismaClient } | null {
  if (!req.authContext || !req.prisma) {
    res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
    return null;
  }
  if (!req.authContext.userId) {
    res.status(401).json({ ok: false, error: { code: "USER_IDENTITY_REQUIRED", message: "Token has no associated user" } });
    return null;
  }
  return { tenantId: req.authContext.tenantId, workspaceId: req.authContext.workspaceId, actorUserId: req.authContext.userId, db: req.prisma };
}

// --- Router ------------------------------------------------------------------

export const radarSocialRouter = createGovernedRouter();

// Verificação de habilitação/banco ANTES de qualquer autenticação ou lógica
// do Radar (Precisões de isolamento — rodada 2, seções A/B): nenhuma leitura
// ou escrita de tabela do Radar ocorre antes desta resolver `true`.
radarSocialRouter.use(async (_req, res, next) => {
  const verified = await isRadarSocialDemoDbVerified(prismaGlobal);
  if (!verified) {
    return res.status(503).json({
      ok: false,
      error: { code: "RADAR_DEMO_UNAVAILABLE", message: "Demonstração interna do Radar Social indisponível — ambiente ou banco não verificado" },
    });
  }
  return next();
});
radarSocialRouter.use(enforceTenant);

radarSocialRouter.get("/entities", requireScope(RADAR_SOCIAL_READ_SCOPE), async (req, res) => {
  const auth = requireAuth(req as TenantAwareRequest, res);
  if (!auth) return;
  const resolver = createRadarEntityAccessResolver(auth.db);
  const limitRaw = Number(req.query.limit ?? 50);
  const limit = Number.isInteger(limitRaw) && limitRaw > 0 && limitRaw <= 200 ? limitRaw : 50;
  const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
  try {
    const result = await listRadarKnownEntities({ ...auth, resolver, limit, cursor }, auth.db);
    res.json({ ok: true, items: result.items.map(serializeEntity), nextCursor: result.nextCursor });
  } catch (err) {
    if (!respondToRadarError(res, err)) throw err;
  }
});

radarSocialRouter.get("/entities/:id", requireScope(RADAR_SOCIAL_READ_SCOPE), async (req, res) => {
  const auth = requireAuth(req as TenantAwareRequest, res);
  if (!auth) return;
  const resolver = createRadarEntityAccessResolver(auth.db);
  try {
    const entity = await getRadarKnownEntity({ ...auth, entityId: req.params.id!, resolver }, auth.db);
    const materials = await listRadarMaterials({ ...auth, entityId: req.params.id!, resolver, limit: 100 }, auth.db);
    res.json({ ok: true, entity: serializeEntity(entity), materials: materials.items.map(serializeMaterial) });
  } catch (err) {
    if (!respondToRadarError(res, err)) throw err;
  }
});

radarSocialRouter.post("/entities/:id/materials", requireScope(RADAR_SOCIAL_MATERIAL_WRITE_SCOPE), async (req, res) => {
  const auth = requireAuth(req as TenantAwareRequest, res);
  if (!auth) return;
  const resolver = createRadarEntityAccessResolver(auth.db);
  const body = (req.body ?? {}) as Record<string, unknown>;
  try {
    const result = await receiveRadarMaterial(
      {
        ...auth,
        resolver,
        input: {
          entityId: req.params.id!,
          conteudo: body.conteudo as string,
          fonteDeclarada: body.fonteDeclarada as string,
          capturadoEm: (body.capturadoEm as string | null | undefined) ?? null,
          supersedesMaterialId: (body.supersedesMaterialId as string | null | undefined) ?? null,
          operationKey: body.operationKey as string,
        },
      },
      auth.db
    );
    res.status(result.recovered ? 200 : 201).json({ ok: true, recovered: result.recovered, material: serializeMaterial(result.material) });
  } catch (err) {
    if (!respondToRadarError(res, err)) throw err;
  }
});

radarSocialRouter.post("/entities/:id/analysis-requests", requireScope(RADAR_SOCIAL_ANALYSIS_REQUEST_SCOPE), async (req, res) => {
  const auth = requireAuth(req as TenantAwareRequest, res);
  if (!auth) return;
  const body = (req.body ?? {}) as Record<string, unknown>;
  const forbiddenPresent = FORBIDDEN_ANALYSIS_REQUEST_FIELDS.filter((f) => body[f] !== undefined);
  if (forbiddenPresent.length > 0) {
    res.status(400).json({
      ok: false,
      error: {
        code: "radar_demo_agent_identity_not_client_controlled",
        message: `Campos não permitidos nesta rota: ${forbiddenPresent.join(", ")}`,
      },
    });
    return;
  }
  const resolver = createRadarEntityAccessResolver(auth.db);
  try {
    const result = await createRadarAnalysisRequest(
      {
        ...auth,
        resolver,
        input: {
          entityId: req.params.id!,
          materialId: body.materialId as string,
          objective: body.objective as string,
          additionalContext: (body.additionalContext as string | null | undefined) ?? null,
          operationKey: body.operationKey as string,
        },
        generationConfigInput: {
          requestedModel: RADAR_DEMO_REQUESTED_MODEL,
          requestedMaxTokens: RADAR_DEMO_MAX_TOKENS,
          promptTemplateVersion: RADAR_DEMO_PROMPT_TEMPLATE_VERSION,
          knowledgePolicySnapshot: RADAR_DEMO_KNOWLEDGE_POLICY,
          agentKey: RADAR_DEMO_AGENT_KEY,
          agentVersion: RADAR_DEMO_AGENT_VERSION,
        },
      },
      auth.db
    );
    res.status(result.recovered ? 200 : 201).json({
      ok: true,
      recovered: result.recovered,
      request: serializeRequest(result.request),
      firstAttempt: serializeAttempt(result.firstAttempt),
    });
  } catch (err) {
    if (!respondToRadarError(res, err)) throw err;
  }
});

radarSocialRouter.post("/attempts/:attemptId/run", requireScope(RADAR_SOCIAL_ANALYSIS_EXECUTE_SCOPE), async (req, res) => {
  const auth = requireAuth(req as TenantAwareRequest, res);
  if (!auth) return;
  const resolver = createRadarEntityAccessResolver(auth.db);
  try {
    const result = await runGovernedAnalysis(
      {
        tenantId: auth.tenantId,
        workspaceId: auth.workspaceId,
        attemptId: req.params.attemptId!,
        workerId: auth.actorUserId,
        resolver,
        concurrencyLimit: RADAR_DEMO_CONCURRENCY_LIMIT,
        callCompletion: demoSubstituteCallCompletion,
      },
      auth.db
    );
    res.json({
      ok: true,
      attempt: serializeAttempt(result.attempt),
      recommendation: result.recommendation ? serializeRecommendation(result.recommendation) : null,
    });
  } catch (err) {
    if (!respondToRadarError(res, err)) throw err;
  }
});

radarSocialRouter.get("/attempts/:attemptId", requireScope(RADAR_SOCIAL_READ_SCOPE), async (req, res) => {
  const auth = requireAuth(req as TenantAwareRequest, res);
  if (!auth) return;
  const resolver = createRadarEntityAccessResolver(auth.db);
  try {
    const attempt = await getRadarAnalysisAttempt({ ...auth, attemptId: req.params.attemptId!, resolver }, auth.db);
    res.json({ ok: true, attempt: serializeAttempt(attempt) });
  } catch (err) {
    if (!respondToRadarError(res, err)) throw err;
  }
});

radarSocialRouter.get("/analysis-requests/:id/recommendation", requireScope(RADAR_SOCIAL_READ_SCOPE), async (req, res) => {
  const auth = requireAuth(req as TenantAwareRequest, res);
  if (!auth) return;
  const resolver = createRadarEntityAccessResolver(auth.db);
  try {
    const attempt = await auth.db.radarAnalysisAttempt.findFirst({
      where: { analysisRequestId: req.params.id!, tenantId: auth.tenantId, workspaceId: auth.workspaceId },
      orderBy: { attemptNumber: "desc" },
    });
    if (!attempt) throw new RadarRecommendationNotFoundError();
    const recommendation = await getRadarRecommendation({ ...auth, attemptId: attempt.id, resolver }, auth.db);
    res.json({ ok: true, recommendation: serializeRecommendation(recommendation) });
  } catch (err) {
    if (!respondToRadarError(res, err)) throw err;
  }
});

radarSocialRouter.post("/recommendations/:id/evaluations", requireScope(RADAR_SOCIAL_RECOMMENDATION_EVALUATE_SCOPE), async (req, res) => {
  const auth = requireAuth(req as TenantAwareRequest, res);
  if (!auth) return;
  const resolver = createRadarEntityAccessResolver(auth.db);
  const body = (req.body ?? {}) as Record<string, unknown>;
  try {
    const result = await submitRadarRecommendationEvaluation(
      {
        ...auth,
        recommendationId: req.params.id!,
        operationKey: body.operationKey as string,
        resolver,
        fundamentacao: body.fundamentacao,
        clareza: body.clareza,
        utilidade: body.utilidade,
        justificativa: body.justificativa ?? null,
        comentario: body.comentario ?? null,
        supersedesEvaluationId: body.supersedesEvaluationId ?? null,
      },
      auth.db
    );
    res.status(result.recovered ? 200 : 201).json({ ok: true, recovered: result.recovered, evaluation: serializeEvaluation(result.evaluation) });
  } catch (err) {
    if (!respondToRadarError(res, err)) throw err;
  }
});

radarSocialRouter.get("/recommendations/:id/evaluations", requireScope(RADAR_SOCIAL_READ_SCOPE), async (req, res) => {
  const auth = requireAuth(req as TenantAwareRequest, res);
  if (!auth) return;
  const resolver = createRadarEntityAccessResolver(auth.db);
  try {
    const evaluations = await listRadarRecommendationEvaluationsForRecommendation({ ...auth, recommendationId: req.params.id!, resolver }, auth.db);
    res.json({ ok: true, evaluations: evaluations.map(serializeEvaluation) });
  } catch (err) {
    if (!respondToRadarError(res, err)) throw err;
  }
});
