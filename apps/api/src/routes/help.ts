import { Router } from "express";
import { z } from "zod";
import { enforceTenant, type TenantAwareRequest } from "../middlewares/enforceTenant";
import { queryEiahHelpKnowledge, seedEiahHelpKnowledge } from "../services/eiahHelpKnowledge";

const helpRouter = Router();
helpRouter.use(enforceTenant);

const HelpQuerySchema = z.object({
  q: z.string().trim().min(1),
  topK: z.coerce.number().int().min(1).max(20).optional(),
});

const HelpdeskSessionSchema = z.object({
  tenantId: z.string().trim().min(1),
  workspaceId: z.string().trim().min(1),
  runId: z.string().trim().min(1).optional().nullable(),
  intent: z.enum(["help", "proposal", "product_explain", "unknown"]),
  confidence: z.number().min(0).max(1),
  fallbackReason: z.string().trim().optional().nullable(),
  message: z.string().trim().min(1),
  response: z.string().trim().min(1),
  recommendedPlan: z.string().trim().optional().nullable(),
  estimatedValue: z.number().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

helpRouter.get("/help/eiah/query", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const parsed = HelpQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_QUERY", message: parsed.error.flatten() },
    });
  }

  const result = await queryEiahHelpKnowledge({
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    prisma: prisma as any,
    query: parsed.data.q,
    topK: parsed.data.topK,
  });

  return res.json({
    ok: true,
    data: result,
  });
});

helpRouter.post("/help/eiah/reindex", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const result = await seedEiahHelpKnowledge({
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    prisma: prisma as any,
  });

  return res.json({
    ok: true,
    data: result,
  });
});

helpRouter.post("/helpdesk/session", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const parsed = HelpdeskSessionSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_PAYLOAD", message: parsed.error.flatten() },
    });
  }

  if (
    parsed.data.tenantId !== authContext.tenantId ||
    parsed.data.workspaceId !== authContext.workspaceId
  ) {
    return res.status(403).json({
      ok: false,
      error: { code: "TENANT_SCOPE_MISMATCH", message: "Payload tenant/workspace mismatch" },
    });
  }

  const logger = (req as any).logger ?? console;
  logger.info(
    {
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      intent: parsed.data.intent,
      confidence: parsed.data.confidence,
      runId: parsed.data.runId ?? null,
    },
    "helpdesk.request"
  );
  logger.info(
    {
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      intent: parsed.data.intent,
      confidence: parsed.data.confidence,
      fallbackReason: parsed.data.fallbackReason ?? null,
    },
    "helpdesk.intent.detected"
  );

  try {
    const client = prisma as any;
    if (!client.helpdeskSession) {
      return res.status(503).json({
        ok: false,
        error: { code: "HELPDESK_NOT_AVAILABLE", message: "helpdesk_sessions model unavailable" },
      });
    }
    const created = await client.helpdeskSession.create({
      data: {
        tenantId: parsed.data.tenantId,
        workspaceId: parsed.data.workspaceId,
        runId: parsed.data.runId ?? null,
        intent: parsed.data.intent,
        confidence: parsed.data.confidence,
        fallbackReason: parsed.data.fallbackReason ?? null,
        message: parsed.data.message,
        response: parsed.data.response,
        recommendedPlan: parsed.data.recommendedPlan ?? null,
        estimatedValue: parsed.data.estimatedValue ?? null,
        metadata: parsed.data.metadata ?? undefined,
      },
      select: { id: true },
    });

    const fallbackUsed = Boolean((parsed.data.metadata as Record<string, unknown> | undefined)?.fallbackUsed);
    const responseRejected = Boolean((parsed.data.metadata as Record<string, unknown> | undefined)?.responseRejected);
    if (fallbackUsed) {
      logger.warn(
        { tenantId: authContext.tenantId, workspaceId: authContext.workspaceId, runId: parsed.data.runId ?? null },
        "helpdesk.fallback.used"
      );
    }
    if (responseRejected) {
      logger.warn(
        { tenantId: authContext.tenantId, workspaceId: authContext.workspaceId, runId: parsed.data.runId ?? null },
        "helpdesk.response.rejected"
      );
    }
    logger.info(
      { tenantId: authContext.tenantId, workspaceId: authContext.workspaceId, runId: parsed.data.runId ?? null, id: created.id },
      "helpdesk.response.generated"
    );

    return res.status(201).json({
      ok: true,
      data: created,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: {
        code: "HELPDESK_SESSION_CREATE_FAILED",
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
});

export { helpRouter };
