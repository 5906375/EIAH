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

const HelpdeskSessionsQuerySchema = z.object({
  workspaceId: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

type HelpdeskUxIssueCategory =
  | "clarification_overuse"
  | "generic_fallback"
  | "too_systemic"
  | "natural_request_not_understood"
  | "unnecessary_run_creation"
  | "healthy_or_inconclusive";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function classifyHelpdeskUxIssue(params: {
  runId: string | null;
  intent: string;
  message: string;
  response: string;
  metadata?: unknown;
}): HelpdeskUxIssueCategory {
  const metadata = asRecord(params.metadata);
  const normalizedMessage = params.message.toLowerCase();
  const normalizedResponse = params.response.toLowerCase();
  const fallbackUsed = metadata?.fallbackUsed === true;
  const responseRejected = metadata?.responseRejected === true;

  if (
    normalizedResponse.includes("escolha uma direção para eu responder com mais precisão") ||
    normalizedResponse.includes("preciso de uma clarificação")
  ) {
    return "clarification_overuse";
  }

  if (
    normalizedResponse.includes("não entendi essa solicitação") ||
    normalizedResponse.includes("nao entendi essa solicitacao")
  ) {
    return "natural_request_not_understood";
  }

  if (fallbackUsed || responseRejected || params.intent === "unknown") {
    return "generic_fallback";
  }

  if (
    normalizedResponse.includes("confiança de interpretação") ||
    normalizedResponse.includes("confianca de interpretacao") ||
    normalizedResponse.includes("proveniência:") ||
    normalizedResponse.includes("proveniencia:") ||
    normalizedResponse.includes("sinais:")
  ) {
    return "too_systemic";
  }

  if (
    params.runId &&
    (normalizedMessage.includes("especialidades") ||
      normalizedMessage.includes("o que o site") ||
      normalizedMessage.includes("o que posso usar aqui") ||
      normalizedMessage.includes("como o site pode me ajudar"))
  ) {
    return "unnecessary_run_creation";
  }

  return "healthy_or_inconclusive";
}

function asStringRecord(value: unknown): Record<string, unknown> {
  return asRecord(value) ?? {};
}

type HelpdeskSessionRow = {
  id: string;
  runId: string;
  metadata?: unknown;
};

type NormalizedHelpdeskSession = {
  id: string;
  runId: string;
  agent: string | null;
  status: string | null;
  intent: string;
  confidence: number;
  fallbackReason: string | null;
  message: string;
  response: string;
  recommendedPlan: string | null;
  estimatedValue: number | null;
  createdAt: string;
  uxIssueCategory: HelpdeskUxIssueCategory;
};

function humanizeUxIssue(category: HelpdeskUxIssueCategory) {
  switch (category) {
    case "clarification_overuse":
      return "Clarificação em excesso";
    case "generic_fallback":
      return "Fallback genérico";
    case "too_systemic":
      return "Resposta excessivamente sistêmica";
    case "natural_request_not_understood":
      return "Pedido humano não compreendido";
    case "unnecessary_run_creation":
      return "Run desnecessária";
    default:
      return "Saudável ou inconclusivo";
  }
}

function buildHelpdeskUxReportText(params: {
  workspaceId: string;
  generatedAt: string;
  groups: Array<{
    runId: string;
    agent: string | null;
    uxIssueCategory: HelpdeskUxIssueCategory;
    interactions: Array<{ createdAt: string; message: string; response: string }>;
  }>;
  summary: Record<string, number>;
}) {
  const lines = [
    "Relatorio UX do Chat Launcher",
    `Workspace: ${params.workspaceId}`,
    `Gerado em: ${params.generatedAt}`,
    "",
    "Resumo por categoria:",
    ...Object.entries(params.summary).map(([key, count]) => `- ${humanizeUxIssue(key as HelpdeskUxIssueCategory)}: ${count}`),
    "",
    "Evidencias por run:",
  ];

  params.groups.forEach((group) => {
    const latest = group.interactions[0];
    lines.push(
      "",
      `Run: ${group.runId}`,
      `Agente: ${group.agent ?? "-"}`,
      `Categoria UX: ${humanizeUxIssue(group.uxIssueCategory)}`,
      `Ultima interacao: ${latest?.createdAt ?? "-"}`,
      `Pergunta: ${latest?.message ?? "-"}`,
      `Resposta: ${latest?.response ?? "-"}`,
    );
  });

  return lines.join("\n");
}

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

  const allowed = new Set(["evidenciado", "parcial", "proposta", "canonica"]);
  const hasInvalidHitStatus = result.hits.some(
    (hit) => !hit.status || !allowed.has(String(hit.status))
  );
  if (hasInvalidHitStatus || !result.responseStatus || !allowed.has(result.responseStatus)) {
    return res.status(500).json({
      ok: false,
      error: {
        code: "HELP_RESPONSE_GUARDRAIL_FAILED",
        message: "Help response status guardrail failed",
      },
    });
  }

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

helpRouter.get("/helpdesk/sessions", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const parsed = HelpdeskSessionsQuerySchema.safeParse(req.query ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_QUERY", message: parsed.error.flatten() },
    });
  }

  const workspaceId = parsed.data.workspaceId ?? authContext.workspaceId;
  const limit = parsed.data.limit ?? 200;
  const client = prisma as any;

  if (!client.helpdeskSession) {
    return res.status(503).json({
      ok: false,
      error: { code: "HELPDESK_NOT_AVAILABLE", message: "helpdesk_sessions model unavailable" },
    });
  }

  const rows = await client.helpdeskSession.findMany({
    where: {
      tenantId: authContext.tenantId,
      workspaceId,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const helpdeskRows = rows as HelpdeskSessionRow[];
  const runIds = helpdeskRows.reduce((acc: string[], row) => {
    const runId = row.runId;
    if (typeof runId !== "string" || !runId.trim() || acc.includes(runId)) {
      return acc;
    }
    acc.push(runId);
    return acc;
  }, []);
  const runs =
    runIds.length > 0
      ? await prisma.run.findMany({
          where: {
            tenantId: authContext.tenantId,
            workspaceId,
            id: { in: runIds },
          },
          select: { id: true, agent: true, status: true, createdAt: true },
        })
      : [];
  const runById = new Map(runs.map((run) => [run.id, run]));

  const normalized: NormalizedHelpdeskSession[] = helpdeskRows.map((row: any) => {
    const uxIssueCategory = classifyHelpdeskUxIssue({
      runId: row.runId ?? null,
      intent: String(row.intent ?? "unknown"),
      message: String(row.message ?? ""),
      response: String(row.response ?? ""),
      metadata: row.metadata,
    });
    return {
      id: row.id,
      runId: row.runId ?? "DEFAULT",
      agent: row.runId ? runById.get(row.runId)?.agent ?? null : null,
      status: row.runId ? runById.get(row.runId)?.status ?? null : null,
      intent: row.intent,
      confidence: row.confidence,
      fallbackReason: row.fallbackReason ?? null,
      message: row.message,
      response: row.response,
      recommendedPlan: row.recommendedPlan ?? null,
      estimatedValue: row.estimatedValue ?? null,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
      uxIssueCategory,
    };
  });
  const metadataById = new Map<string, Record<string, unknown>>(
    helpdeskRows.map((row: HelpdeskSessionRow) => [row.id, asStringRecord(row.metadata)])
  );

  const groupsMap = new Map<string, typeof normalized>();
  normalized.forEach((item: NormalizedHelpdeskSession) => {
    const current = groupsMap.get(item.runId) ?? [];
    current.push(item);
    groupsMap.set(item.runId, current);
  });

  const summary = normalized.reduce((acc: Record<string, number>, item: NormalizedHelpdeskSession) => {
    acc[item.uxIssueCategory] = (acc[item.uxIssueCategory] ?? 0) + 1;
    return acc;
  }, {});

  const rolloutStageCounts = normalized.reduce((acc: Record<string, number>, item: NormalizedHelpdeskSession) => {
    const metadata = metadataById.get(item.id) ?? {};
    const stage = typeof metadata.rolloutStage === "string" && metadata.rolloutStage.trim() ? metadata.rolloutStage.trim() : "shadow";
    acc[stage] = (acc[stage] ?? 0) + 1;
    return acc;
  }, {});

  const totalQuickRepliesShown = normalized.reduce((acc: number, item: NormalizedHelpdeskSession) => {
    const metadata = metadataById.get(item.id) ?? {};
    const shown = typeof metadata.quickRepliesShown === "number" ? metadata.quickRepliesShown : 0;
    return acc + shown;
  }, 0);
  const quickReplyClicks = normalized.reduce((acc: number, item: NormalizedHelpdeskSession) => {
    const metadata = metadataById.get(item.id) ?? {};
    return acc + (metadata.quickReplyUsed === true ? 1 : 0);
  }, 0);
  const clarificationCount = normalized.reduce((acc: number, item: NormalizedHelpdeskSession) => {
    const metadata = metadataById.get(item.id) ?? {};
    return acc + (metadata.clarificationIssued === true ? 1 : 0);
  }, 0);
  const handoffOffered = normalized.reduce((acc: number, item: NormalizedHelpdeskSession) => {
    const metadata = metadataById.get(item.id) ?? {};
    return acc + (metadata.handoffOffered === true ? 1 : 0);
  }, 0);
  const handoffEligible = normalized.reduce((acc: number, item: NormalizedHelpdeskSession) => {
    const metadata = metadataById.get(item.id) ?? {};
    return acc + (metadata.handoffEligible === true ? 1 : 0);
  }, 0);
  const legacyCompatibilityTurns = normalized.reduce((acc: number, item: NormalizedHelpdeskSession) => {
    const metadata = metadataById.get(item.id) ?? {};
    return acc + (metadata.compatibilityMode === "legacy_conservative" ? 1 : 0);
  }, 0);
  const attachmentOffered = normalized.reduce((acc: number, item: NormalizedHelpdeskSession) => {
    const metadata = metadataById.get(item.id) ?? {};
    return acc + (metadata.attachmentOffered === true ? 1 : 0);
  }, 0);
  const attachmentUsed = normalized.reduce((acc: number, item: NormalizedHelpdeskSession) => {
    const metadata = metadataById.get(item.id) ?? {};
    return acc + (metadata.attachmentUsed === true ? 1 : 0);
  }, 0);

  const threadCounts = helpdeskRows.reduce((acc: Record<string, number>, row: HelpdeskSessionRow) => {
    const metadata = asStringRecord(row.metadata);
    const threadKey =
      typeof metadata.threadKey === "string" && metadata.threadKey.trim()
        ? metadata.threadKey.trim()
        : row.runId ?? row.id;
    acc[threadKey] = (acc[threadKey] ?? 0) + 1;
    return acc;
  }, {});
  const estimatedAbandonedThreads = Object.values(threadCounts).filter((count) => count === 1).length;

  const groups = [...groupsMap.entries()].map(([runId, items]) => {
    const categoryCount = items.reduce((acc: Record<string, number>, item: NormalizedHelpdeskSession) => {
      acc[item.uxIssueCategory] = (acc[item.uxIssueCategory] ?? 0) + 1;
      return acc;
    }, {});
    const uxIssueCategory =
      (Object.entries(categoryCount).sort((a, b) => b[1] - a[1])[0]?.[0] as HelpdeskUxIssueCategory | undefined) ??
      "healthy_or_inconclusive";
    const latest = items[0] ?? null;
    return {
      runId,
      agent: latest?.agent ?? null,
      status: latest?.status ?? null,
      entries: items.length,
      lastInteractionAt: latest?.createdAt ?? null,
      uxIssueCategory,
      uxIssueLabel: humanizeUxIssue(uxIssueCategory),
      interactions: items,
    };
  });
  const healthySamples = groups.filter((group) => group.uxIssueCategory === "healthy_or_inconclusive").length;
  const needsReview = groups.filter((group) => group.uxIssueCategory !== "healthy_or_inconclusive").length;
  const totalSessions = normalized.length || 1;
  const totalThreads = Math.max(1, Object.keys(threadCounts).length);
  const rolloutMetrics = {
    rolloutStageCounts,
    chips: {
      avgShownPerTurn: Number((totalQuickRepliesShown / totalSessions).toFixed(2)),
      quickReplyClicks,
      quickReplyClickRate: Number((quickReplyClicks / totalSessions).toFixed(4)),
    },
    clarifications: {
      total: clarificationCount,
      ratePerTurn: Number((clarificationCount / totalSessions).toFixed(4)),
    },
    handoff: {
      offered: handoffOffered,
      eligible: handoffEligible,
      successfulRate: handoffOffered > 0 ? Number((handoffEligible / handoffOffered).toFixed(4)) : 0,
    },
    compatibility: {
      snapshotTurns: normalized.length - legacyCompatibilityTurns,
      legacyCompatibilityTurns,
      legacyTurnRate: Number((legacyCompatibilityTurns / totalSessions).toFixed(4)),
    },
    attachment: {
      offered: attachmentOffered,
      used: attachmentUsed,
      adoptionRate: attachmentOffered > 0 ? Number((attachmentUsed / attachmentOffered).toFixed(4)) : 0,
    },
    abandonment: {
      estimatedThreads: estimatedAbandonedThreads,
      estimatedRate: Number((estimatedAbandonedThreads / totalThreads).toFixed(4)),
    },
    qualitativeReview: {
      needsReview,
      healthySamples,
    },
  };

  const generatedAt = new Date().toISOString();
  const reportText = buildHelpdeskUxReportText({
    workspaceId,
    generatedAt,
    groups: groups.map((group) => ({
      runId: group.runId,
      agent: group.agent,
      uxIssueCategory: group.uxIssueCategory,
      interactions: group.interactions.slice(0, 1).map((item) => ({
        createdAt: item.createdAt,
        message: item.message,
        response: item.response,
      })),
    })),
    summary,
  });

  return res.json({
    ok: true,
    data: {
      workspaceId,
      generatedAt,
      totalSessions: normalized.length,
      totalRunGroups: groups.length,
      summary,
      rolloutMetrics,
      groups,
      reportText,
    },
  });
});

export { helpRouter };
