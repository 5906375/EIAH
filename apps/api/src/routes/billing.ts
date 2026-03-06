import { Router } from "express";
import { enforceTenant, TenantAwareRequest } from "../middlewares/enforceTenant";
import {
  chargeRun,
  estimateCostCents,
  getQuota,
} from "../services/billing";
import {
  BillingLedgerService,
  QuotaUsageService,
  ensureTenantBillingDefaults,
} from "../services/tenantBilling";
import {
  enqueuePlanCreationJob,
  evaluatePlanSpecNeeds,
  safeParsePlanSpec,
} from "../services/plans";

export const billingRouter = Router();
billingRouter.use(enforceTenant);

function parseOptionalDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function parseOptionalInt(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.trunc(parsed);
}

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

  const { idempotencyKey: _ignored, ...candidate } = body;
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

billingRouter.get("/billing/tenant/summary", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const quotaUsageService = new QuotaUsageService(prisma);
  const from = parseOptionalDate(req.query.from);
  const to = parseOptionalDate(req.query.to);
  const cycle = from && to ? { cycleStart: from, cycleEnd: to } : await quotaUsageService.resolveCycle({
    tenantId: authContext.tenantId,
  });

  const client = prisma as any;
  const [account, policy, entries, usage] = await Promise.all([
    client.tenantBillingAccount.findUnique({ where: { tenantId: authContext.tenantId } }),
    client.tenantQuotaPolicy.findUnique({ where: { tenantId: authContext.tenantId } }),
    client.billingLedger.findMany({
      where: {
        tenantId: authContext.tenantId,
        createdAt: { gte: cycle.cycleStart, lt: cycle.cycleEnd },
      },
      select: {
        id: true,
        workspaceId: true,
        entryType: true,
        amountCents: true,
        currency: true,
      },
    }),
    client.tenantQuotaUsage.findUnique({
      where: {
        tenantId_cycleStart_cycleEnd: {
          tenantId: authContext.tenantId,
          cycleStart: cycle.cycleStart,
          cycleEnd: cycle.cycleEnd,
        },
      },
    }),
  ]);

  const workspaces = await client.workspace.findMany({
    where: { tenantId: authContext.tenantId },
    select: { id: true, name: true },
  });
  const workspaceNameById = new Map(workspaces.map((ws: { id: string; name: string }) => [ws.id, ws.name]));

  const totals = {
    runs: 0,
    costCents: 0,
    currency: account?.currency ?? "BRL",
  };
  const byWorkspace = new Map<
    string,
    { workspaceId: string; workspaceName: string; runs: number; costCents: number }
  >();

  for (const entry of entries) {
    totals.costCents += Number(entry.amountCents ?? 0);
    if (entry.entryType === "debit" && Number(entry.amountCents ?? 0) > 0) {
      totals.runs += 1;
    }
    const key = entry.workspaceId ?? "workspace:unknown";
    const current = byWorkspace.get(key) ?? {
      workspaceId: entry.workspaceId ?? "unknown",
      workspaceName: entry.workspaceId ? workspaceNameById.get(entry.workspaceId) ?? entry.workspaceId : "Sem workspace",
      runs: 0,
      costCents: 0,
    };
    current.costCents += Number(entry.amountCents ?? 0);
    if (entry.entryType === "debit" && Number(entry.amountCents ?? 0) > 0) {
      current.runs += 1;
    }
    byWorkspace.set(key, current);
  }

  return res.json({
    ok: true,
    data: {
      tenantId: authContext.tenantId,
      cycleStart: cycle.cycleStart.toISOString(),
      cycleEnd: cycle.cycleEnd.toISOString(),
      account: account
        ? {
            planCode: account.planCode,
            currency: account.currency,
            status: account.status,
            cycleAnchorDay: account.cycleAnchorDay,
          }
        : null,
      policy: policy
        ? {
            softLimitPct: policy.softLimitPct,
            hardLimitPct: policy.hardLimitPct,
            monthlyRunsLimit: policy.monthlyRunsLimit,
            monthlyCostCentsLimit: policy.monthlyCostCentsLimit,
          }
        : null,
      totals,
      usage: usage
        ? {
            runs: usage.runs,
            costCents: usage.costCents,
            tokens: usage.tokens,
            storageMb: usage.storageMb,
            updatedAt: usage.updatedAt,
          }
        : null,
      byWorkspace: Array.from(byWorkspace.values()).sort((a, b) => a.workspaceName.localeCompare(b.workspaceName)),
    },
  });
});

billingRouter.get("/billing/tenant/usage", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const from = parseOptionalDate(req.query.from);
  const to = parseOptionalDate(req.query.to);
  if ((from && !to) || (!from && to)) {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_RANGE", message: "from and to must be provided together" },
    });
  }

  const client = prisma as any;
  const where: Record<string, unknown> = { tenantId: authContext.tenantId };
  if (from && to) {
    where.cycleStart = { gte: from };
    where.cycleEnd = { lte: to };
  }

  const items = await client.tenantQuotaUsage.findMany({
    where,
    orderBy: { cycleStart: "desc" },
    take: 36,
  });

  return res.json({
    ok: true,
    data: {
      tenantId: authContext.tenantId,
      items,
    },
  });
});

billingRouter.get("/billing/tenant/workspaces", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const client = prisma as any;
  const quotaUsageService = new QuotaUsageService(prisma);
  const cycle = await quotaUsageService.resolveCycle({ tenantId: authContext.tenantId });

  const [workspaces, grants, entries] = await Promise.all([
    client.workspace.findMany({
      where: { tenantId: authContext.tenantId },
      orderBy: { createdAt: "asc" },
    }),
    client.workspaceQuotaGrant.findMany({
      where: { tenantId: authContext.tenantId },
    }),
    client.billingLedger.findMany({
      where: {
        tenantId: authContext.tenantId,
        createdAt: { gte: cycle.cycleStart, lt: cycle.cycleEnd },
      },
      select: {
        workspaceId: true,
        entryType: true,
        amountCents: true,
      },
    }),
  ]);

  const grantByWorkspace = new Map(grants.map((grant: any) => [grant.workspaceId, grant]));
  const usageByWorkspace = new Map<string, { runs: number; costCents: number }>();
  for (const entry of entries) {
    const workspaceId = entry.workspaceId;
    if (!workspaceId) continue;
    const current = usageByWorkspace.get(workspaceId) ?? { runs: 0, costCents: 0 };
    current.costCents += Number(entry.amountCents ?? 0);
    if (entry.entryType === "debit" && Number(entry.amountCents ?? 0) > 0) {
      current.runs += 1;
    }
    usageByWorkspace.set(workspaceId, current);
  }

  const items = workspaces.map((workspace: any) => {
    const grant = grantByWorkspace.get(workspace.id) ?? null;
    const usage = usageByWorkspace.get(workspace.id) ?? { runs: 0, costCents: 0 };
    return {
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      isActiveWorkspace: workspace.id === authContext.workspaceId,
      grant: grant
        ? {
            enabled: grant.enabled,
            localRunLimit: grant.localRunLimit,
            localCostCentsLimit: grant.localCostCentsLimit,
            updatedAt: grant.updatedAt,
          }
        : null,
      usage,
    };
  });

  return res.json({
    ok: true,
    data: {
      tenantId: authContext.tenantId,
      cycleStart: cycle.cycleStart.toISOString(),
      cycleEnd: cycle.cycleEnd.toISOString(),
      items,
    },
  });
});

billingRouter.patch("/billing/tenant/workspaces/:id/grant", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const workspaceId = req.params.id;
  const enabled = req.body?.enabled;
  const localRunLimit = parseOptionalInt(req.body?.localRunLimit);
  const localCostCentsLimit = parseOptionalInt(req.body?.localCostCentsLimit);

  if (
    enabled === undefined &&
    localRunLimit === null &&
    localCostCentsLimit === null
  ) {
    return res.status(400).json({
      ok: false,
      error: {
        code: "MISSING_REQUIRED",
        message: "enabled and/or localRunLimit and/or localCostCentsLimit",
      },
    });
  }

  const client = prisma as any;
  const workspace = await client.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, tenantId: true },
  });
  if (!workspace || workspace.tenantId !== authContext.tenantId) {
    return res.status(404).json({
      ok: false,
      error: { code: "WORKSPACE_NOT_FOUND", message: "Workspace not found for tenant" },
    });
  }

  await ensureTenantBillingDefaults(prisma, {
    tenantId: authContext.tenantId,
    workspaceId,
  });

  const grant = await client.workspaceQuotaGrant.upsert({
    where: {
      tenantId_workspaceId: {
        tenantId: authContext.tenantId,
        workspaceId,
      },
    },
    create: {
      tenantId: authContext.tenantId,
      workspaceId,
      enabled: typeof enabled === "boolean" ? enabled : true,
      localRunLimit,
      localCostCentsLimit,
    },
    update: {
      ...(typeof enabled === "boolean" ? { enabled } : {}),
      ...(localRunLimit !== null ? { localRunLimit } : {}),
      ...(localCostCentsLimit !== null ? { localCostCentsLimit } : {}),
      updatedAt: new Date(),
    },
  });

  return res.json({ ok: true, data: grant });
});

billingRouter.patch("/billing/tenant/quotas", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const softLimitPct = parseOptionalInt(req.body?.softLimitPct);
  const hardLimitPct = parseOptionalInt(req.body?.hardLimitPct);
  const monthlyRunsLimit = parseOptionalInt(req.body?.monthlyRunsLimit);
  const monthlyCostCentsLimit = parseOptionalInt(req.body?.monthlyCostCentsLimit);

  if (
    softLimitPct === null &&
    hardLimitPct === null &&
    monthlyRunsLimit === null &&
    monthlyCostCentsLimit === null
  ) {
    return res.status(400).json({
      ok: false,
      error: { code: "MISSING_REQUIRED", message: "No quota field provided" },
    });
  }

  const client = prisma as any;
  const existing = await client.tenantQuotaPolicy.findUnique({
    where: { tenantId: authContext.tenantId },
  });
  const nextSoft = softLimitPct ?? existing?.softLimitPct ?? 80;
  const nextHard = hardLimitPct ?? existing?.hardLimitPct ?? 100;
  if (nextSoft < 0 || nextSoft > 100 || nextHard < 0 || nextHard > 100 || nextSoft > nextHard) {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_LIMITS", message: "soft/hard limits must be 0-100 and soft<=hard" },
    });
  }

  const policy = await client.tenantQuotaPolicy.upsert({
    where: { tenantId: authContext.tenantId },
    create: {
      tenantId: authContext.tenantId,
      softLimitPct: nextSoft,
      hardLimitPct: nextHard,
      monthlyRunsLimit,
      monthlyCostCentsLimit,
    },
    update: {
      softLimitPct: nextSoft,
      hardLimitPct: nextHard,
      ...(monthlyRunsLimit !== null ? { monthlyRunsLimit } : {}),
      ...(monthlyCostCentsLimit !== null ? { monthlyCostCentsLimit } : {}),
      updatedAt: new Date(),
    },
  });

  return res.json({ ok: true, data: policy });
});

billingRouter.get("/billing/tenant/ledger", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const from = parseOptionalDate(req.query.from);
  const to = parseOptionalDate(req.query.to);
  const entryType = typeof req.query.type === "string" ? req.query.type : undefined;
  const workspaceId = typeof req.query.workspaceId === "string" ? req.query.workspaceId : undefined;
  const limitParsed = parseOptionalInt(req.query.limit);
  const limit = limitParsed == null ? 100 : Math.max(1, Math.min(500, limitParsed));

  const where: Record<string, unknown> = { tenantId: authContext.tenantId };
  if (entryType) where.entryType = entryType;
  if (workspaceId) where.workspaceId = workspaceId;
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
    };
  }

  const client = prisma as any;
  const [entries, workspaces] = await Promise.all([
    client.billingLedger.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
    }),
    client.workspace.findMany({
      where: { tenantId: authContext.tenantId },
      select: { id: true, name: true },
    }),
  ]);
  const workspaceNameById = new Map(workspaces.map((ws: { id: string; name: string }) => [ws.id, ws.name]));

  return res.json({
    ok: true,
    data: {
      tenantId: authContext.tenantId,
      items: entries.map((entry: any) => ({
        ...entry,
        workspaceName: entry.workspaceId ? workspaceNameById.get(entry.workspaceId) ?? entry.workspaceId : null,
      })),
    },
  });
});

billingRouter.post("/billing/tenant/adjustment", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const amountCents = parseOptionalInt(req.body?.amountCents);
  const workspaceId = typeof req.body?.workspaceId === "string" ? req.body.workspaceId : null;
  const runId = typeof req.body?.runId === "string" ? req.body.runId : null;
  const currency = typeof req.body?.currency === "string" ? req.body.currency : "BRL";
  const description = typeof req.body?.description === "string" ? req.body.description : null;
  const requestId = typeof req.body?.requestId === "string" ? req.body.requestId : null;
  const provider = typeof req.body?.provider === "string" ? req.body.provider : null;
  const model = typeof req.body?.model === "string" ? req.body.model : null;

  if (amountCents == null || amountCents === 0) {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_AMOUNT", message: "amountCents must be a non-zero integer" },
    });
  }

  const client = prisma as any;
  if (workspaceId) {
    const workspace = await client.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, tenantId: true },
    });
    if (!workspace || workspace.tenantId !== authContext.tenantId) {
      return res.status(404).json({
        ok: false,
        error: { code: "WORKSPACE_NOT_FOUND", message: "Workspace not found for tenant" },
      });
    }
  }

  const ledgerService = new BillingLedgerService(prisma);
  const quotaUsageService = new QuotaUsageService(prisma);
  const ledgerResult = await ledgerService.insertAdjustment({
    tenantId: authContext.tenantId,
    workspaceId,
    runId,
    amountCents,
    currency,
    description,
    requestId,
    provider,
    model,
  });

  const usageSnapshot = await quotaUsageService.incrementFromEvent({
    tenantId: authContext.tenantId,
    amountCents,
    entryType: "adjustment",
  });

  return res.status(201).json({
    ok: true,
    data: {
      inserted: ledgerResult.inserted,
      ledger: ledgerResult.entry,
      usage: usageSnapshot.usage,
      cycleStart: usageSnapshot.cycle.cycleStart.toISOString(),
      cycleEnd: usageSnapshot.cycle.cycleEnd.toISOString(),
    },
  });
});

/** Webhook do gateway de pagamento (Stripe/MercadoPago/Asaas) */
billingRouter.post("/webhooks/billing", async (_req, res) => {
  // TODO: verificar assinatura, atualizar PaymentTx/credits.
  return res.status(200).send("ok");
});
