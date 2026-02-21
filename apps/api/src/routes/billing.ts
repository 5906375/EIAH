import { Router } from "express";
import { enforceTenant, TenantAwareRequest } from "../middlewares/enforceTenant";
import {
  chargeRun,
  estimateCostCents,
  getQuota,
} from "../services/billing";
import {
  enqueuePlanCreationJob,
  evaluatePlanSpecNeeds,
  safeParsePlanSpec,
} from "../services/plans";

export const billingRouter = Router();
billingRouter.use(enforceTenant);

billingRouter.post("/billing/estimate", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const { agent, inputBytes, tools, projectId } = req.body ?? {};
  const workspaceId = projectId ?? authContext.workspaceId;

  if (!agent || typeof inputBytes !== "number" || !workspaceId) {
    return res.status(400).json({
      ok: false,
      error: {
        code: "MISSING_REQUIRED",
        message: "agent, inputBytes, workspaceId",
      },
    });
  }

  const estimateCents = await estimateCostCents({
    agent,
    inputBytes,
    tools,
    tenantId: authContext.tenantId,
    workspaceId,
    prisma,
  });

  if (estimateCents === null) {
    return res.status(404).json({
      ok: false,
      error: {
        code: "WORKSPACE_NOT_FOUND",
        message: "Workspace not found for tenant",
      },
    });
  }

  return res.json({ ok: true, data: { estimateCents, currency: "BRL" } });
});

billingRouter.post("/billing/charge", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const { runId, projectId, costCents } = req.body ?? {};
  const workspaceId = projectId ?? authContext.workspaceId;

  if (!runId || !workspaceId || typeof costCents !== "number") {
    return res.status(400).json({
      ok: false,
      error: {
        code: "MISSING_REQUIRED",
        message: "runId, workspaceId, costCents",
      },
    });
  }

  const charged = await chargeRun({
    tenantId: authContext.tenantId,
    workspaceId,
    runId,
    costCents,
    prisma,
  });
  if (!charged) {
    return res.status(404).json({
      ok: false,
      error: {
        code: "RUN_NOT_FOUND",
        message: "Run not found for tenant/workspace",
      },
    });
  }
  return res.json({ ok: true });
});

billingRouter.post("/plans/simulate", async (req, res) => {
  const { authContext } = req as TenantAwareRequest;
  if (!authContext) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const parseResult = safeParsePlanSpec(req.body ?? {});

  if (!parseResult.success) {
    return res.status(422).json({
      ok: false,
      error: {
        code: "INVALID_PLAN_SPEC",
        message: "Plan spec validation failed",
        issues: parseResult.error.issues,
      },
    });
  }

  return res.json({
    ok: true,
    data: {
      spec: parseResult.data,
      needMoreInfo: evaluatePlanSpecNeeds(parseResult.data),
    },
  });
});

billingRouter.post("/plans", async (req, res) => {
  const { authContext } = req as TenantAwareRequest;
  if (!authContext) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const { idempotencyKey } = body;

  if (idempotencyKey !== undefined && typeof idempotencyKey !== "string") {
    return res.status(400).json({
      ok: false,
      error: {
        code: "INVALID_IDEMPOTENCY_KEY",
        message: "idempotencyKey must be a string when provided",
      },
    });
  }

  const candidate = { ...body };
  delete candidate.idempotencyKey;
  const parseResult = safeParsePlanSpec(candidate);

  if (!parseResult.success) {
    return res.status(422).json({
      ok: false,
      error: {
        code: "INVALID_PLAN_SPEC",
        message: "Plan spec validation failed",
        issues: parseResult.error.issues,
      },
    });
  }

  const needMoreInfo = evaluatePlanSpecNeeds(parseResult.data);

  try {
    const job = await enqueuePlanCreationJob({
      spec: parseResult.data,
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      userId: authContext.userId,
      idempotencyKey: idempotencyKey ?? null,
    });

    return res.status(202).json({
      ok: true,
      data: {
        planId: parseResult.data.plan_id,
        jobId: job.jobId,
        idempotencyKey: job.idempotencyKey,
        needsAdditionalInfo: Boolean(needMoreInfo),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({
      ok: false,
      error: {
        code: "PLAN_CREATION_ENQUEUE_FAILED",
        message,
      },
    });
  }
});

billingRouter.get("/plans/quotas", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const workspaceId = String(req.query.projectId ?? authContext.workspaceId ?? "");
  if (!workspaceId) {
    return res.status(400).json({
      ok: false,
      error: {
        code: "MISSING_REQUIRED",
        message: "workspaceId",
      },
    });
  }

  const quota = await getQuota({
    tenantId: authContext.tenantId,
    workspaceId,
    prisma,
  });

  if (!quota) {
    return res.status(404).json({
      ok: false,
      error: {
        code: "WORKSPACE_NOT_FOUND",
        message: "Workspace not found for tenant",
      },
    });
  }
  return res.json({ ok: true, data: quota });
});

/** Webhook do gateway de pagamento (Stripe/MercadoPago/Asaas) */
billingRouter.post("/webhooks/billing", async (_req, res) => {
  // TODO: verificar assinatura, atualizar PaymentTx/credits.
  return res.status(200).send("ok");
});
