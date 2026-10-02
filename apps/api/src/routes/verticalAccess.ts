import { z } from "zod";
import { prismaGlobal, type PrismaClient } from "@repo/db";
import { createGovernedRouter } from "../middlewares/asyncHandler";
import { enforceTenant, type TenantAwareRequest } from "../middlewares/enforceTenant";
import { canUserActivateProducts } from "../services/products/productActivation";
import {
  changeVerticalAccessRevocation,
  decideVerticalAccess,
  listVerticalAccessForAdmin,
  readVerticalAccess,
  requestVerticalAccess,
  resolveVerticalUsage,
  REVOCATION_MODES,
} from "../services/products/verticalAccessApproval";
import { readPlatformAdmin } from "../services/platformAdmin";

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

const verticalSchema = z.enum(["IMOB"]);
const requestSchema = z.object({ vertical: verticalSchema }).strict();
const decisionSchema = z
  .object({
    decision: z.enum(["aprovar", "recusar"]),
    note: z.string().trim().max(1000).optional(),
  })
  .strict();
const revocationSchema = z
  .object({
    action: z.enum(["revogar", "alterar_modo", "restaurar"]),
    mode: z.enum(REVOCATION_MODES).optional(),
    note: z.string().trim().max(1000).optional(),
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
  return {
    vertical,
    status: row?.status ?? "nao_solicitado",
    usage: resolveVerticalUsage(row),
    revocationMode: row?.revocationMode ?? null,
    requestedAt: row?.requestedAt ?? null,
    decidedAt: row?.decidedAt ?? null,
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

  const result = await requestVerticalAccess({ prisma, tenantId, workspaceId, vertical: parsed.data.vertical, userId });
  return res.status(result.outcome === "requested" ? 201 : 200).json({
    ok: true,
    data: { outcome: result.outcome, ...clientView(result.approval, parsed.data.vertical) },
  });
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
  return res.json({ ok: true, data: { awaiting, items } });
});

verticalAccessRouter.post("/admin/vertical-approvals/:approvalId/decision", async (req, res) => {
  const admin = await requirePlatformAdmin(req as TenantAwareRequest);
  if (!admin) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
  const parsed = decisionSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: { code: "INVALID_PAYLOAD", details: parsed.error.flatten() } });
  }
  const result = await decideVerticalAccess({
    prisma: prismaGlobal as unknown as PrismaClient,
    approvalId: String(req.params.approvalId),
    adminEmail: admin.email,
    decision: parsed.data.decision,
    note: parsed.data.note ?? null,
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
  });
  if (!result.ok) {
    const error = REVOCATION_ERRORS[result.code];
    return res.status(error.status).json({ ok: false, error: { code: result.code, message: error.message } });
  }
  return res.json({ ok: true, data: result.approval });
});
