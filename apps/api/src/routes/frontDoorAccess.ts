import { z } from "zod";
import type { PrismaClient } from "@repo/db";
import { createGovernedRouter } from "../middlewares/asyncHandler";
import { enforceTenant, type TenantAwareRequest } from "../middlewares/enforceTenant";
import { createFrontDoorAccess, readFrontDoorAccessOptions } from "../services/frontDoorAccess";

/**
 * ADR-011 §2.7: criação de acessos pelo front door (`/app/chat`). O painel chama estas rotas direto;
 * o e-mail e o link nunca passam pelo histórico da conversa. O link aparece só nesta resposta.
 */
export const frontDoorAccessRouter = createGovernedRouter();
frontDoorAccessRouter.use("/front-door/accesses", enforceTenant);

const createSchema = z
  .object({
    email: z.string().trim().email().max(254),
    fullName: z.string().trim().min(1).max(160).optional(),
    roleKey: z.string().trim().min(1).max(60),
  })
  .strict();

function scope(req: TenantAwareRequest) {
  const userId = req.authContext?.userId;
  if (!req.authContext || !req.prisma || !userId) return null;
  return {
    prisma: req.prisma as unknown as PrismaClient,
    tenantId: req.authContext.tenantId,
    workspaceId: req.authContext.workspaceId,
    userId,
  };
}

frontDoorAccessRouter.get("/front-door/accesses/options", async (req, res) => {
  const context = scope(req as TenantAwareRequest);
  if (!context) return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING" } });
  return res.json({ ok: true, data: await readFrontDoorAccessOptions(context) });
});

frontDoorAccessRouter.post("/front-door/accesses", async (req, res) => {
  const context = scope(req as TenantAwareRequest);
  if (!context) return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING" } });
  const parsed = createSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: { code: "INVALID_PAYLOAD", details: parsed.error.flatten() } });
  }
  try {
    const result = await createFrontDoorAccess({ ...context, ...parsed.data });
    return res.status(201).json({ ok: true, data: result });
  } catch (error) {
    const maybe = error as { code?: string; status?: number; message?: string };
    if (maybe?.status) {
      return res.status(maybe.status).json({ ok: false, error: { code: maybe.code ?? "FRONT_DOOR_ACCESS_FAILED", message: maybe.message } });
    }
    throw error;
  }
});
