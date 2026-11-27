import { z } from "zod";
import type { PrismaClient } from "@repo/db";
import { createGovernedRouter } from "../middlewares/asyncHandler";
import { enforceTenant, type TenantAwareRequest } from "../middlewares/enforceTenant";
import {
  createFrontDoorBillingAccount,
  FRONT_DOOR_PLAN_CODES,
  FrontDoorBillingError,
  payFrontDoorFirstMonth,
  readFrontDoorBilling,
} from "../services/frontDoorBilling";

/**
 * ADR-011 §2.8: conta de billing e primeira mensalidade simulada pela conversa do front door.
 * O cartão da conversa chama estas rotas direto; criar e pagar exigem confirmação explícita.
 */
export const frontDoorBillingRouter = createGovernedRouter();
frontDoorBillingRouter.use("/front-door/billing", enforceTenant);

const accountSchema = z
  .object({
    planCode: z.enum(FRONT_DOOR_PLAN_CODES as [string, ...string[]]),
    confirmed: z.literal(true),
  })
  .strict();
const paymentSchema = z.object({ confirmed: z.literal(true) }).strict();

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

function sendError(res: { status: (code: number) => { json: (body: unknown) => unknown } }, error: unknown) {
  if (error instanceof FrontDoorBillingError) {
    return res.status(error.status).json({ ok: false, error: { code: error.code, message: error.message } });
  }
  throw error;
}

frontDoorBillingRouter.get("/front-door/billing", async (req, res) => {
  const context = scope(req as TenantAwareRequest);
  if (!context) return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING" } });
  return res.json({ ok: true, data: await readFrontDoorBilling(context) });
});

frontDoorBillingRouter.post("/front-door/billing/account", async (req, res) => {
  const context = scope(req as TenantAwareRequest);
  if (!context) return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING" } });
  const parsed = accountSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    // Sem confirmação explícita (ou plano fora da lista) nada é criado.
    return res.status(400).json({ ok: false, error: { code: "BILLING_CONFIRMATION_REQUIRED", details: parsed.error.flatten() } });
  }
  try {
    const result = await createFrontDoorBillingAccount({ ...context, planCode: parsed.data.planCode as (typeof FRONT_DOOR_PLAN_CODES)[number] });
    return res.status(result.outcome === "created" ? 201 : 200).json({ ok: true, data: result });
  } catch (error) {
    return sendError(res, error);
  }
});

frontDoorBillingRouter.post("/front-door/billing/first-payment", async (req, res) => {
  const context = scope(req as TenantAwareRequest);
  if (!context) return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING" } });
  const parsed = paymentSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: { code: "BILLING_CONFIRMATION_REQUIRED", details: parsed.error.flatten() } });
  }
  try {
    const result = await payFrontDoorFirstMonth(context);
    return res.status(result.outcome === "paid" ? 201 : 200).json({ ok: true, data: result });
  } catch (error) {
    return sendError(res, error);
  }
});
