import { activatableProductSchema } from "@eiah/contracts";
import { z } from "zod";
import { prismaGlobal, type PrismaClient } from "@repo/db";
import { createGovernedRouter } from "../middlewares/asyncHandler";
import { enforceTenant, type TenantAwareRequest } from "../middlewares/enforceTenant";
import { canUserActivateProducts } from "../services/products/productActivation";
import {
  changeVerticalAccessRevocation,
  decideVerticalAccess,
  ensureVerticalAccessStore,
  listVerticalAccessForAdmin,
  readVerticalAccess,
  readVerticalAccessRowById,
  requestVerticalAccess,
  resolveVerticalUsage,
  REVOCATION_MODES,
} from "../services/products/verticalAccessApproval";
import { acceptEvaluationTerms, declineEvaluationTerms, decideEvaluationGrant } from "../services/products/verticalEvaluation";
import {
  describeEvaluationTerms,
  evaluationDecisionInputSchema,
  evaluationPhase,
  evaluationRequestContextSchema,
  grantTermsIntegrity,
  isEvaluationOfferEnabled,
  resolveEvaluationOfferState,
  termsAreCurrent,
} from "../services/products/verticalEvaluationContract";
import { planVerticalAccessRequest } from "../services/products/verticalEvaluationPlans";
import { readPlatformAdmin } from "../services/platformAdmin";
import { listUnreadVerticalAccessNotices, markVerticalAccessNoticeRead } from "../services/products/verticalAccessNotices";

/**
 * ADR-011: liberação de verticais pela EIAH.
 * - Cliente: consulta o estado e pede a liberação (Founder ou `products.activate`).
 * - Administrador da plataforma EIAH: fila com score e decisão humana (aprovar/recusar) e
 *   revogação em três modos, troca de modo e restauração (ADR-011 §2.5).
 * O cliente nunca vê score nem sinais de billing; a fila nunca mostra dados de negócio.
 */
export const verticalAccessRouter = createGovernedRouter();
verticalAccessRouter.use("/vertical-access", enforceTenant);
verticalAccessRouter.use("/admin/vertical-approvals", enforceTenant);

const verticalSchema = activatableProductSchema;
const requestSchema = z
  .object({
    vertical: verticalSchema,
    channel: z.enum(["marketplace", "chat"]).optional(),
    /** Pedido de AVALIAÇÃO: qualificação já confirmada pelo solicitante no chat. `confirmed` literal evita envio sem confirmação. */
    evaluation: evaluationRequestContextSchema.extend({ confirmed: z.literal(true) }).strict().optional(),
  })
  .strict();
const evaluationAcceptSchema = z.object({ vertical: z.literal("IMOB"), termsHash: z.string().regex(/^[0-9a-f]{64}$/), confirmed: z.literal(true) }).strict();
const evaluationDeclineSchema = z.object({ vertical: z.literal("IMOB"), confirmed: z.literal(true) }).strict();
const adminChannelSchema = z.enum(["tela", "chat"]).optional();
const decisionSchema = z
  .object({
    decision: z.enum(["aprovar", "recusar"]),
    note: z.string().trim().max(1000).optional(),
    channel: adminChannelSchema,
    /** Só para pedido de avaliação: o administrador define duração, funcionalidades e encerramento (limites vêm da configuração). */
    evaluation: evaluationDecisionInputSchema.optional(),
  })
  .strict();
const revocationSchema = z
  .object({
    action: z.enum(["revogar", "alterar_modo", "restaurar"]),
    mode: z.enum(REVOCATION_MODES).optional(),
    note: z.string().trim().max(1000).optional(),
    channel: adminChannelSchema,
  })
  .strict()
  .refine((value) => value.action !== "alterar_modo" || Boolean(value.mode), { message: "mode is required", path: ["mode"] });

const REQUEST_FORBIDDEN = {
  code: "VERTICAL_ACCESS_REQUEST_FORBIDDEN",
  message: "Só o proprietário do tenant ou quem tem a permissão de ativar produtos pode pedir a liberação.",
} as const;

const DECISION_ERRORS = {
  VERTICAL_ACCESS_NOT_FOUND: { status: 404, message: "Pedido de liberação não encontrado." },
  VERTICAL_ACCESS_NOT_AWAITING_DECISION: { status: 409, message: "Este pedido não está aguardando decisão." },
  VERTICAL_ACCESS_NOTE_REQUIRED: {
    status: 400,
    message: "Escreva uma observação: ela é obrigatória ao recusar e ao decidir contra a recomendação do agente.",
  },
  VERTICAL_ACCESS_EVALUATION_REQUIRES_TERMS: {
    status: 409,
    message: "Pedido de avaliação: defina as condições (duração, funcionalidades e encerramento) para aprovar.",
  },
} as const;

/** Erros das transições de avaliação (decisão com termos). Nenhum revela a configuração da oferta ao solicitante. */
const EVALUATION_DECISION_ERRORS = {
  NOT_FOUND: { status: 404, message: "Pedido não encontrado." },
  NOT_EVALUATION: { status: 400, message: "Este pedido não é de avaliação." },
  OFFER_UNAVAILABLE: { status: 409, message: "A oferta de avaliação não está habilitada: não é possível propor condições." },
  NOT_AWAITING_DECISION: { status: 409, message: "Este pedido não está aguardando decisão." },
  NOTE_REQUIRED: { status: 400, message: "Escreva uma observação: ela é obrigatória ao recusar e ao decidir contra a recomendação do agente." },
  SELF_DECISION_FORBIDDEN: { status: 403, message: "Quem fez o pedido não pode decidi-lo." },
  TERMS_INVALID: { status: 400, message: "As condições são incompletas ou contraditórias com a configuração vigente." },
  CONFLICT: { status: 409, message: "O pedido mudou enquanto você decidia. Atualize e decida de novo." },
} as const;
const EVALUATION_ACCEPT_ERRORS = {
  NOT_FOUND: { status: 404, message: "Não há condições de avaliação para aceitar." },
  OFFER_UNAVAILABLE: { status: 409, message: "A avaliação não está disponível no momento." },
  NOT_PENDING: { status: 409, message: "Não há condições aguardando aceite." },
  NOT_REQUESTER: { status: 403, message: "Só quem fez o pedido pode aceitar as condições." },
  TERMS_MISMATCH: { status: 409, message: "As condições mudaram desde que você as viu. Veja-as de novo." },
  TERMS_STALE: { status: 409, message: "A versão das condições não está mais vigente. A EIAH precisa propor de novo." },
  CONFLICT: { status: 409, message: "O estado mudou. Atualize e tente de novo." },
} as const;

const REVOCATION_ERRORS = {
  VERTICAL_ACCESS_NOT_FOUND: { status: 404, message: "Liberação não encontrada." },
  VERTICAL_ACCESS_INVALID_TRANSITION: {
    status: 409,
    message: "Só uma liberação aprovada pode ser revogada, e só uma revogada pode ter o modo trocado ou ser restaurada.",
  },
  VERTICAL_ACCESS_NOTE_REQUIRED: { status: 400, message: "Escreva uma observação: ela é obrigatória ao revogar e ao trocar o modo." },
  VERTICAL_ACCESS_MODE_UNCHANGED: { status: 409, message: "A liberação já está revogada neste modo." },
} as const;

/** O que o cliente vê: só o estado, o uso que ele permite e quando mudou. */
function clientView(row: Awaited<ReturnType<typeof readVerticalAccess>>, vertical: string) {
  // A possibilidade de avaliação só é anunciada quando a oferta está HABILITADA (configuração autorizada + decisões
  // obrigatórias ratificadas) e este workspace pode pedi-la; nunca se revela o motivo de estar desligada.
  const offerAvailable =
    vertical === "IMOB" && planVerticalAccessRequest({ existing: row, evaluation: true, vertical, offer: resolveEvaluationOfferState() }).ok;
  const phase = evaluationPhase(row);
  return {
    vertical,
    status: row?.status ?? "nao_solicitado",
    usage: resolveVerticalUsage(row),
    revocationMode: row?.revocationMode ?? null,
    requestedAt: row?.requestedAt ?? null,
    decidedAt: row?.decidedAt ?? null,
    // Só aparece quando há algo a dizer (oferta disponível ou grant presente): sem avaliação, o corpo é exatamente o legado.
    ...(offerAvailable || phase !== null ? { evaluation: { offerAvailable, phase } } : {}),
  };
}

verticalAccessRouter.get("/vertical-access", async (req, res) => {
  const request = req as TenantAwareRequest;
  const parsed = verticalSchema.safeParse(String(req.query.vertical ?? "IMOB").toUpperCase());
  if (!parsed.success) return res.status(400).json({ ok: false, error: { code: "INVALID_VERTICAL" } });
  if (!request.authContext || !request.prisma) {
    return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING" } });
  }
  const row = await readVerticalAccess({
    prisma: request.prisma as unknown as PrismaClient,
    tenantId: request.authContext.tenantId,
    workspaceId: request.authContext.workspaceId,
    vertical: parsed.data,
  });
  return res.json({ ok: true, data: clientView(row, parsed.data) });
});

verticalAccessRouter.post("/vertical-access/request", async (req, res) => {
  const request = req as TenantAwareRequest;
  const parsed = requestSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: { code: "INVALID_PAYLOAD", details: parsed.error.flatten() } });
  }
  if (!request.authContext || !request.prisma) {
    return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING" } });
  }
  const prisma = request.prisma as unknown as PrismaClient;
  const { tenantId, workspaceId, userId } = request.authContext;
  const allowed = await canUserActivateProducts({ prisma, tenantId, workspaceId, userId: userId ?? null });
  if (!allowed || !userId) return res.status(403).json({ ok: false, error: REQUEST_FORBIDDEN });

  if (parsed.data.evaluation && parsed.data.vertical !== "IMOB") {
    return res.status(400).json({ ok: false, error: { code: "EVALUATION_VERTICAL_UNSUPPORTED" } });
  }
  const { confirmed: _confirmed, ...evaluationContext } = parsed.data.evaluation ?? { confirmed: true as const };
  const result = await requestVerticalAccess({
    prisma,
    tenantId,
    workspaceId,
    vertical: parsed.data.vertical,
    userId,
    channel: parsed.data.channel ?? "marketplace",
    evaluation: parsed.data.evaluation ? (evaluationContext as never) : null,
  });
  if (result.outcome === "evaluation_unavailable") {
    return res.status(409).json({ ok: false, error: { code: "EVALUATION_OFFER_UNAVAILABLE", message: "A avaliação não está disponível no momento. Nada foi enviado." } });
  }
  if (result.outcome === "evaluation_already_used") {
    return res.status(409).json({ ok: false, error: { code: "EVALUATION_ALREADY_USED", message: "A avaliação deste workspace já foi iniciada." } });
  }
  return res.status(result.outcome === "requested" ? 201 : 200).json({
    ok: true,
    data: { outcome: result.outcome, ...clientView(result.approval, parsed.data.vertical) },
  });
});

/**
 * Avaliação — condições propostas pela EIAH, vistas pelo solicitante. Texto composto no servidor só a partir dos termos
 * validados e da configuração vigente; se a versão não está mais vigente, não mostra condições (`stale`).
 */
verticalAccessRouter.get("/vertical-access/evaluation/terms", async (req, res) => {
  const request = req as TenantAwareRequest;
  if (!request.authContext || !request.prisma) return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING" } });
  const prisma = request.prisma as unknown as PrismaClient;
  const { tenantId, workspaceId, userId } = request.authContext;
  if (!(await canUserActivateProducts({ prisma, tenantId, workspaceId, userId: userId ?? null }))) {
    return res.status(403).json({ ok: false, error: REQUEST_FORBIDDEN });
  }
  const row = await readVerticalAccess({ prisma, tenantId, workspaceId, vertical: "IMOB" });
  const phase = evaluationPhase(row);
  if (!row || row.grantKind !== "evaluation" || row.status !== "pre_ativacao") return res.json({ ok: true, data: { phase, available: false } });
  const offer = resolveEvaluationOfferState();
  const integrity = grantTermsIntegrity(row);
  if (!isEvaluationOfferEnabled(offer) || !integrity.ok || !termsAreCurrent(integrity.terms, offer.config).ok) {
    return res.json({ ok: true, data: { phase, available: false, stale: true } });
  }
  return res.json({
    ok: true,
    data: {
      phase,
      available: true,
      termsHash: row.grantTermsHash,
      accepted: Boolean(row.grantAcceptedAt),
      requesterIsViewer: row.requestedByUserId === userId,
      text: describeEvaluationTerms(integrity.terms, offer.config.conditions.text),
    },
  });
});

verticalAccessRouter.post("/vertical-access/evaluation/accept", async (req, res) => {
  const request = req as TenantAwareRequest;
  const parsed = evaluationAcceptSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ ok: false, error: { code: "EVALUATION_CONFIRMATION_REQUIRED", details: parsed.error.flatten() } });
  if (!request.authContext || !request.prisma || !request.authContext.userId) return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING" } });
  const prisma = request.prisma as unknown as PrismaClient;
  const { tenantId, workspaceId, userId } = request.authContext;
  if (!(await canUserActivateProducts({ prisma, tenantId, workspaceId, userId }))) return res.status(403).json({ ok: false, error: REQUEST_FORBIDDEN });
  const result = await acceptEvaluationTerms({ prisma, tenantId, workspaceId, userId, termsHash: parsed.data.termsHash, vertical: parsed.data.vertical });
  if (!result.ok) {
    const error = EVALUATION_ACCEPT_ERRORS[result.code];
    return res.status(error.status).json({ ok: false, error: { code: `EVALUATION_${result.code}`, message: error.message } });
  }
  return res.json({ ok: true, data: { outcome: result.outcome, activated: false } });
});

verticalAccessRouter.post("/vertical-access/evaluation/decline", async (req, res) => {
  const request = req as TenantAwareRequest;
  const parsed = evaluationDeclineSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ ok: false, error: { code: "EVALUATION_CONFIRMATION_REQUIRED", details: parsed.error.flatten() } });
  if (!request.authContext || !request.prisma || !request.authContext.userId) return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING" } });
  const prisma = request.prisma as unknown as PrismaClient;
  const { tenantId, workspaceId, userId } = request.authContext;
  if (!(await canUserActivateProducts({ prisma, tenantId, workspaceId, userId }))) return res.status(403).json({ ok: false, error: REQUEST_FORBIDDEN });
  const result = await declineEvaluationTerms({ prisma, tenantId, workspaceId, userId, vertical: parsed.data.vertical });
  if (!result.ok) return res.status(result.code === "NOT_REQUESTER" ? 403 : 409).json({ ok: false, error: { code: `EVALUATION_${result.code}` } });
  return res.json({ ok: true, data: { outcome: result.outcome } });
});

/** ADR-011 §2.4: avisos da liberação para quem está no workspace (sem score nem billing). */
verticalAccessRouter.get("/vertical-access/notices", async (req, res) => {
  const request = req as TenantAwareRequest;
  const userId = request.authContext?.userId;
  if (!request.authContext || !request.prisma || !userId) {
    return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING" } });
  }
  const prisma = request.prisma as unknown as PrismaClient;
  await ensureVerticalAccessStore(prisma);
  const notices = await listUnreadVerticalAccessNotices({
    prisma,
    tenantId: request.authContext.tenantId,
    workspaceId: request.authContext.workspaceId,
    userId,
  });
  return res.json({ ok: true, data: { notices } });
});

verticalAccessRouter.post("/vertical-access/notices/:noticeId/read", async (req, res) => {
  const request = req as TenantAwareRequest;
  const userId = request.authContext?.userId;
  if (!request.authContext || !request.prisma || !userId) {
    return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING" } });
  }
  const prisma = request.prisma as unknown as PrismaClient;
  await ensureVerticalAccessStore(prisma);
  const found = await markVerticalAccessNoticeRead({
    prisma,
    tenantId: request.authContext.tenantId,
    workspaceId: request.authContext.workspaceId,
    userId,
    noticeId: String(req.params.noticeId),
  });
  if (!found) return res.status(404).json({ ok: false, error: { code: "NOTICE_NOT_FOUND" } });
  return res.json({ ok: true });
});

/** Não revela a existência da fila para quem não é administrador EIAH. */
async function requirePlatformAdmin(request: TenantAwareRequest) {
  return readPlatformAdmin({ prisma: prismaGlobal as unknown as PrismaClient, userId: request.authContext?.userId ?? null });
}

verticalAccessRouter.get("/admin/vertical-approvals", async (req, res) => {
  const admin = await requirePlatformAdmin(req as TenantAwareRequest);
  if (!admin) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
  const items = await listVerticalAccessForAdmin({ prisma: prismaGlobal as unknown as PrismaClient });
  const awaiting = items.filter((item) => ["pendente", "em_analise", "aguardando_humano"].includes(item.status)).length;
  // Só o administrador vê o estado da oferta e os motivos de bloqueio (decisões pendentes, configuração).
  const offer = resolveEvaluationOfferState();
  const evaluationOffer = isEvaluationOfferEnabled(offer)
    ? {
        state: offer.state,
        reasons: offer.reasons,
        limits: {
          maxDurationDays: offer.config.maxDurationDays,
          allowedActions: offer.config.allowedActions,
          closureModes: offer.config.closureModes,
          conditionsVersion: offer.config.conditions.version,
        },
      }
    : { state: offer.state, reasons: offer.reasons, limits: null };
  return res.json({ ok: true, data: { awaiting, items, evaluationOffer } });
});

verticalAccessRouter.post("/admin/vertical-approvals/:approvalId/decision", async (req, res) => {
  const admin = await requirePlatformAdmin(req as TenantAwareRequest);
  if (!admin) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
  const parsed = decisionSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: { code: "INVALID_PAYLOAD", details: parsed.error.flatten() } });
  }
  const adminPrisma = prismaGlobal as unknown as PrismaClient;
  const target = await readVerticalAccessRowById(adminPrisma, String(req.params.approvalId));
  if (target?.grantKind === "evaluation") {
    // Pedido de avaliação: a decisão propõe termos (não é aceite nem ativação). Recusar não exige termos.
    const evaluationResult = await decideEvaluationGrant({
      prisma: adminPrisma,
      approvalId: target.id,
      adminEmail: admin.email,
      adminUserId: admin.userId,
      decision: parsed.data.decision,
      note: parsed.data.note ?? null,
      input: parsed.data.evaluation,
      channel: parsed.data.channel ?? "tela",
    });
    if (!evaluationResult.ok) {
      const error = EVALUATION_DECISION_ERRORS[evaluationResult.code];
      return res.status(error.status).json({ ok: false, error: { code: `EVALUATION_${evaluationResult.code}`, message: error.message, issues: evaluationResult.issues } });
    }
    return res.json({ ok: true, data: evaluationResult.approval });
  }
  if (parsed.data.evaluation) return res.status(400).json({ ok: false, error: { code: "NOT_EVALUATION", message: EVALUATION_DECISION_ERRORS.NOT_EVALUATION.message } });
  const result = await decideVerticalAccess({
    prisma: adminPrisma,
    approvalId: String(req.params.approvalId),
    adminEmail: admin.email,
    decision: parsed.data.decision,
    note: parsed.data.note ?? null,
    channel: parsed.data.channel ?? "tela",
  });
  if (!result.ok) {
    const error = DECISION_ERRORS[result.code];
    return res.status(error.status).json({ ok: false, error: { code: result.code, message: error.message } });
  }
  return res.json({ ok: true, data: result.approval });
});

verticalAccessRouter.post("/admin/vertical-approvals/:approvalId/revocation", async (req, res) => {
  const admin = await requirePlatformAdmin(req as TenantAwareRequest);
  if (!admin) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
  const parsed = revocationSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: { code: "INVALID_PAYLOAD", details: parsed.error.flatten() } });
  }
  const result = await changeVerticalAccessRevocation({
    prisma: prismaGlobal as unknown as PrismaClient,
    approvalId: String(req.params.approvalId),
    adminEmail: admin.email,
    action: parsed.data.action,
    mode: parsed.data.mode ?? null,
    note: parsed.data.note ?? null,
    channel: parsed.data.channel ?? "tela",
  });
  if (!result.ok) {
    const error = REVOCATION_ERRORS[result.code];
    return res.status(error.status).json({ ok: false, error: { code: result.code, message: error.message } });
  }
  return res.json({ ok: true, data: result.approval });
});
