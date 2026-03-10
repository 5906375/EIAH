import { Router } from "express";
import crypto from "node:crypto";
import { enforceTenant, type TenantAwareRequest } from "../middlewares/enforceTenant";

export const imobRouter = Router();
imobRouter.use(enforceTenant);

function parseWindowStart(windowRaw: unknown) {
  const normalized = typeof windowRaw === "string" ? windowRaw : "7d";
  const now = Date.now();
  if (normalized === "30d") return new Date(now - 30 * 24 * 60 * 60 * 1000);
  return new Date(now - 7 * 24 * 60 * 60 * 1000);
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function extractReasonCodes(payload: unknown): string[] {
  const obj = asObject(payload);
  if (!obj) return [];
  const candidates = [
    obj.reasonCodes,
    obj.reasons,
    asObject(obj.guard)?.reasonCodes,
  ];
  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;
    const values = candidate.filter((item) => typeof item === "string") as string[];
    if (values.length > 0) return values;
  }
  return [];
}

function extractAction(run: any) {
  const request = asObject(run?.request);
  const metadata = asObject(request?.metadata);
  const action = metadata?.action;
  if (typeof action === "string") return action;
  const protocolAction = metadata?.protocolAction;
  if (typeof protocolAction === "string") return protocolAction;
  return null;
}

function isImobRun(run: any) {
  const action = extractAction(run);
  if (action && action.startsWith("realestate.")) return true;
  const request = asObject(run?.request);
  const metadata = asObject(request?.metadata);
  return metadata?.domain === "imob";
}

function ageHours(dateRaw: unknown) {
  if (!dateRaw) return 0;
  const parsed = new Date(String(dateRaw));
  if (Number.isNaN(parsed.getTime())) return 0;
  return (Date.now() - parsed.getTime()) / (1000 * 60 * 60);
}

const IMOB_CHAT_AGENT_ID = "imob-chat";
const CHAT_KEY_CONVERSATION_CREATED = "conversation.created";
const CHAT_KEY_MESSAGE = "conversation.message";
const CHAT_KEY_TELEMETRY = "conversation.telemetry";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getConversationIdFromMetadata(metadata: unknown): string | null {
  const obj = asObject(metadata);
  return asString(obj?.conversationId);
}

function getRoleFromMetadata(metadata: unknown): "user" | "assistant" | "system" {
  const obj = asObject(metadata);
  const role = asString(obj?.role);
  if (role === "assistant" || role === "system" || role === "user") return role;
  return "assistant";
}

function getThreadIdFromMetadata(metadata: unknown): string | null {
  const obj = asObject(metadata);
  return asString(obj?.threadId);
}

function getThreadLabelFromMetadata(metadata: unknown): string | null {
  const obj = asObject(metadata);
  return asString(obj?.threadLabel);
}

function getThreadStatusFromMetadata(metadata: unknown): "active" | "done" | "blocked" | null {
  const obj = asObject(metadata);
  const status = asString(obj?.threadStatus);
  if (status === "active" || status === "done" || status === "blocked") return status;
  return null;
}

function toIso(value: Date | string | null | undefined) {
  if (!value) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function parseNumericTelemetryValue(content: string | null | undefined) {
  const source = typeof content === "string" ? content : "";
  const chunks = source.split(":");
  const maybeValue = Number(chunks[chunks.length - 1]);
  return Number.isFinite(maybeValue) ? maybeValue : null;
}

imobRouter.get("/command-center/funnel-health", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const workspaceId = String(req.query.workspaceId ?? authContext.workspaceId);
  const window = req.query.window === "30d" ? "30d" : "7d";
  const since = parseWindowStart(window);

  const runs = await prisma.run.findMany({
    where: {
      tenantId: authContext.tenantId,
      workspaceId,
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  const scopedRuns = runs.filter(isImobRun);
  const runIds = scopedRuns.map((run) => run.id);

  const events = runIds.length
    ? await prisma.runEvent.findMany({
        where: {
          tenantId: authContext.tenantId,
          workspaceId,
          runId: { in: runIds },
        },
        orderBy: { createdAt: "desc" },
        take: 3000,
      })
    : [];

  const reasonCount = new Map<string, number>();
  for (const event of events) {
    const codes = extractReasonCodes(event.payload);
    for (const code of codes) {
      reasonCount.set(code, (reasonCount.get(code) ?? 0) + 1);
    }
  }

  const blockedRuns = scopedRuns.filter((run) => run.status === "blocked");
  const inFlightRuns = scopedRuns.filter((run) => run.status === "pending" || run.status === "running");
  const pendingApprovals = inFlightRuns.length;

  const byStatus = ["pending", "running", "blocked", "success", "error"]
    .map((status) => {
      const items = scopedRuns.filter((run) => run.status === status);
      const buckets = { h24: 0, h48: 0, h72: 0, gt72: 0 };
      for (const run of items) {
        const hours = ageHours(run.updatedAt ?? run.createdAt);
        if (hours <= 24) buckets.h24 += 1;
        else if (hours <= 48) buckets.h48 += 1;
        else if (hours <= 72) buckets.h72 += 1;
        else buckets.gt72 += 1;
      }
      return { status, count: items.length, ageBuckets: buckets };
    })
    .filter((entry) => entry.count > 0);

  const byReasonCode = Array.from(reasonCount.entries())
    .map(([reasonCode, count]) => ({
      reasonCode,
      count,
      severity: reasonCode.includes("RISK") || reasonCode.includes("THRESHOLD") ? "CRITICAL" : "BLOCK",
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const topBlockedRuns = blockedRuns
    .map((run) => ({
      runId: run.id,
      status: run.status,
      reasonCodes: events
        .filter((event) => event.runId === run.id)
        .flatMap((event) => extractReasonCodes(event.payload))
        .slice(0, 4),
      ageHours: Number(ageHours(run.updatedAt ?? run.createdAt).toFixed(1)),
      lastUpdatedAt: (run.updatedAt ?? run.createdAt).toISOString(),
      txId: run.txId ?? null,
      criticalHash: run.criticalHash ?? null,
    }))
    .sort((a, b) => b.ageHours - a.ageHours)
    .slice(0, 20);

  return res.json({
    ok: true,
    data: {
      workspaceId,
      module: "imob",
      window,
      generatedAt: new Date().toISOString(),
      summary: {
        blockedTotal: blockedRuns.length,
        pendingApprovals,
        pendingLegal: blockedRuns.length,
        salesKitPendingReview: inFlightRuns.length,
        partialSettlements: scopedRuns.filter((run) => run.status === "running").length,
      },
      byStatus,
      byReasonCode,
      topBlockedRuns,
      actions: [
        { actionId: "OPEN_APPROVAL_QUEUE", label: "Abrir aprovacoes", enabled: true },
        { actionId: "OPEN_BLOCKED_RUNS", label: "Abrir bloqueios", enabled: true },
      ],
    },
  });
});

imobRouter.get("/command-center/blocked-runs", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const workspaceId = String(req.query.workspaceId ?? authContext.workspaceId);
  const statusFilter = typeof req.query.status === "string" ? req.query.status : "blocked";
  const reasonCode = typeof req.query.reasonCode === "string" ? req.query.reasonCode : null;
  const minAgeHours = Number(req.query.minAgeHours ?? "0");
  const limit = Math.max(1, Math.min(100, Number(req.query.limit ?? "50")));

  const runs = await prisma.run.findMany({
    where: {
      tenantId: authContext.tenantId,
      workspaceId,
      status: statusFilter as any,
    },
    orderBy: { updatedAt: "desc" },
    take: 300,
  });
  const scopedRuns = runs.filter(isImobRun);
  const runIds = scopedRuns.map((run) => run.id);
  const events = runIds.length
    ? await prisma.runEvent.findMany({
        where: {
          tenantId: authContext.tenantId,
          workspaceId,
          runId: { in: runIds },
        },
        orderBy: { createdAt: "desc" },
        take: 3000,
      })
    : [];

  const items = scopedRuns
    .map((run) => {
      const reasons = events
        .filter((event) => event.runId === run.id)
        .flatMap((event) => extractReasonCodes(event.payload));
      return {
        runId: run.id,
        status: run.status,
        reasonCodes: Array.from(new Set(reasons)).slice(0, 6),
        ageHours: Number(ageHours(run.updatedAt ?? run.createdAt).toFixed(1)),
        bundleHash: run.criticalHash ?? null,
        txId: run.txId ?? null,
        updatedAt: (run.updatedAt ?? run.createdAt).toISOString(),
      };
    })
    .filter((item) => item.ageHours >= (Number.isFinite(minAgeHours) ? minAgeHours : 0))
    .filter((item) => (reasonCode ? item.reasonCodes.includes(reasonCode) : true))
    .slice(0, limit);

  return res.json({
    ok: true,
    data: {
      items,
      page: { nextCursor: null, hasMore: false },
      meta: {
        generatedAt: new Date().toISOString(),
        snapshotVersion: "commandcenter@v1",
      },
    },
  });
});

imobRouter.get("/chat/conversations", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const limitRaw = Number(req.query.limit ?? "30");
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, limitRaw)) : 30;

  const createdRows = await prisma.memoryEvent.findMany({
    where: {
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      agentId: IMOB_CHAT_AGENT_ID,
      key: CHAT_KEY_CONVERSATION_CREATED,
    },
    orderBy: { createdAt: "desc" },
    take: 300,
  });

  const messageRows = await prisma.memoryEvent.findMany({
    where: {
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      agentId: IMOB_CHAT_AGENT_ID,
      key: CHAT_KEY_MESSAGE,
    },
    orderBy: { createdAt: "desc" },
    take: 1200,
  });

  const conversationMap = new Map<
    string,
    {
      conversationId: string;
      title: string;
      status: "active" | "archived";
      createdAt: string;
      updatedAt: string;
      lastMessagePreview: string | null;
      lastMessageAt: string | null;
      lastMessageRole: "user" | "assistant" | "system" | null;
      lastRunId: string | null;
      lastTxId: string | null;
    }
  >();

  for (const row of createdRows) {
    const metadata = asObject(row.metadata);
    const conversationId = getConversationIdFromMetadata(metadata);
    if (!conversationId) continue;
    if (conversationMap.has(conversationId)) continue;

    conversationMap.set(conversationId, {
      conversationId,
      title: asString(metadata?.title) ?? "Nova conversa IMOB",
      status: asString(metadata?.status) === "archived" ? "archived" : "active",
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.createdAt),
      lastMessagePreview: null,
      lastMessageAt: null,
      lastMessageRole: null,
      lastRunId: null,
      lastTxId: null,
    });
  }

  for (const row of messageRows) {
    const metadata = asObject(row.metadata);
    const conversationId = getConversationIdFromMetadata(metadata);
    if (!conversationId) continue;
    if (!conversationMap.has(conversationId)) {
      conversationMap.set(conversationId, {
        conversationId,
        title: "Conversa IMOB",
        status: "active",
        createdAt: toIso(row.createdAt),
        updatedAt: toIso(row.createdAt),
        lastMessagePreview: null,
        lastMessageAt: null,
        lastMessageRole: null,
        lastRunId: null,
        lastTxId: null,
      });
    }
    const convo = conversationMap.get(conversationId)!;
    const role = getRoleFromMetadata(metadata);
    const runId = row.runId ?? asString(metadata?.runId);
    const txId = asString(metadata?.txId);
    const rowTime = new Date(row.createdAt).getTime();
    const updatedTime = new Date(convo.updatedAt).getTime();
    if (rowTime >= updatedTime) {
      convo.updatedAt = toIso(row.createdAt);
      convo.lastMessageAt = toIso(row.createdAt);
      convo.lastMessagePreview = row.content.slice(0, 180);
      convo.lastMessageRole = role;
      convo.lastRunId = runId;
      convo.lastTxId = txId;
    }
  }

  const items = Array.from(conversationMap.values())
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, limit);

  return res.json({ ok: true, items });
});

imobRouter.post("/chat/conversations", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const body = asObject(req.body) ?? {};
  const title = asString(body.title) ?? "Nova conversa IMOB";
  const conversationId = `conv_${crypto.randomBytes(8).toString("hex")}`;
  const metadata = asObject(body.metadata) ?? {};

  const created = await prisma.memoryEvent.create({
    data: {
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      agentId: IMOB_CHAT_AGENT_ID,
      runId: null,
      key: CHAT_KEY_CONVERSATION_CREATED,
      content: title,
      metadata: {
        ...metadata,
        conversationId,
        title,
        status: "active",
      },
    },
  });

  return res.status(201).json({
    ok: true,
    conversation: {
      conversationId,
      title,
      status: "active",
      createdAt: toIso(created.createdAt),
      updatedAt: toIso(created.createdAt),
      lastMessagePreview: null,
      lastMessageAt: null,
      lastMessageRole: null,
      lastRunId: null,
      lastTxId: null,
    },
  });
});

imobRouter.get("/chat/conversations/:conversationId/messages", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const conversationId = asString(req.params.conversationId);
  if (!conversationId) {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_CONVERSATION_ID", message: "conversationId is required" },
    });
  }

  const limitRaw = Number(req.query.limit ?? "200");
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, limitRaw)) : 200;

  const rows = await prisma.memoryEvent.findMany({
    where: {
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      agentId: IMOB_CHAT_AGENT_ID,
      key: CHAT_KEY_MESSAGE,
    },
    orderBy: { createdAt: "asc" },
    take: 3000,
  });

  const items = rows
    .filter((row) => getConversationIdFromMetadata(row.metadata) === conversationId)
    .slice(-limit)
    .map((row) => {
      const metadata = asObject(row.metadata);
      return {
        id: row.id,
        conversationId,
        role: getRoleFromMetadata(metadata),
        content: row.content,
        intent: asString(metadata?.intent),
        action: asString(metadata?.action),
        threadId: getThreadIdFromMetadata(metadata),
        threadLabel: getThreadLabelFromMetadata(metadata),
        threadStatus: getThreadStatusFromMetadata(metadata),
        runId: row.runId ?? asString(metadata?.runId),
        txId: asString(metadata?.txId),
        receiptPath: asString(metadata?.receiptPath),
        bundlePath: asString(metadata?.bundlePath),
        metadata,
        createdAt: toIso(row.createdAt),
      };
    });

  return res.json({ ok: true, items });
});

imobRouter.get("/chat/conversations/:conversationId/threads", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const conversationId = asString(req.params.conversationId);
  if (!conversationId) {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_CONVERSATION_ID", message: "conversationId is required" },
    });
  }

  const rows = await prisma.memoryEvent.findMany({
    where: {
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      agentId: IMOB_CHAT_AGENT_ID,
      key: CHAT_KEY_MESSAGE,
    },
    orderBy: { createdAt: "asc" },
    take: 6000,
  });

  const threadMap = new Map<
    string,
    {
      threadId: string;
      label: string;
      status: "active" | "done" | "blocked";
      firstMessageAt: string;
      lastMessageAt: string;
      messageCount: number;
    }
  >();

  for (const row of rows) {
    const metadata = asObject(row.metadata);
    if (getConversationIdFromMetadata(metadata) !== conversationId) continue;
    const threadId = getThreadIdFromMetadata(metadata);
    if (!threadId) continue;
    const label = getThreadLabelFromMetadata(metadata) ?? "Operação";
    const status = getThreadStatusFromMetadata(metadata) ?? "active";
    const createdAt = toIso(row.createdAt);
    if (!threadMap.has(threadId)) {
      threadMap.set(threadId, {
        threadId,
        label,
        status,
        firstMessageAt: createdAt,
        lastMessageAt: createdAt,
        messageCount: 1,
      });
      continue;
    }
    const existing = threadMap.get(threadId)!;
    existing.lastMessageAt = createdAt;
    existing.label = label;
    existing.status = status;
    existing.messageCount += 1;
  }

  const items = Array.from(threadMap.values()).sort(
    (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
  );

  return res.json({ ok: true, items });
});

imobRouter.post("/chat/conversations/:conversationId/messages", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const conversationId = asString(req.params.conversationId);
  if (!conversationId) {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_CONVERSATION_ID", message: "conversationId is required" },
    });
  }

  const body = asObject(req.body) ?? {};
  const role = asString(body.role);
  const content = asString(body.content);
  if (!content) {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_PAYLOAD", message: "content is required" },
    });
  }
  if (role !== "assistant" && role !== "user" && role !== "system") {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_PAYLOAD", message: "role must be user|assistant|system" },
    });
  }

  const metadata = asObject(body.metadata) ?? {};
  const threadId = asString(body.threadId) ?? asString(metadata.threadId);
  const threadLabel = asString(body.threadLabel) ?? asString(metadata.threadLabel);
  const threadStatusRaw = asString(body.threadStatus) ?? asString(metadata.threadStatus);
  const threadStatus =
    threadStatusRaw === "active" || threadStatusRaw === "done" || threadStatusRaw === "blocked"
      ? threadStatusRaw
      : null;
  const requestedRunId = asString(body.runId);
  let runId: string | null = null;
  if (requestedRunId) {
    const linkedRun = await prisma.run.findFirst({
      where: {
        id: requestedRunId,
        tenantId: authContext.tenantId,
        workspaceId: authContext.workspaceId,
      },
      select: { id: true },
    });
    if (linkedRun?.id) runId = linkedRun.id;
  }
  const message = await prisma.memoryEvent.create({
    data: {
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      agentId: IMOB_CHAT_AGENT_ID,
      runId,
      key: CHAT_KEY_MESSAGE,
      content,
      metadata: {
        ...metadata,
        conversationId,
        role,
        intent: asString(body.intent),
        action: asString(body.action),
        threadId,
        threadLabel,
        threadStatus,
        runId: requestedRunId ?? undefined,
        txId: asString(body.txId),
        receiptPath: asString(body.receiptPath),
        bundlePath: asString(body.bundlePath),
      },
    },
  });

  const messageMetadata = asObject(message.metadata);
  return res.status(201).json({
    ok: true,
    message: {
      id: message.id,
      conversationId,
      role,
      content: message.content,
      intent: asString(messageMetadata?.intent),
      action: asString(messageMetadata?.action),
      threadId: getThreadIdFromMetadata(messageMetadata),
      threadLabel: getThreadLabelFromMetadata(messageMetadata),
      threadStatus: getThreadStatusFromMetadata(messageMetadata),
      runId: message.runId ?? asString(messageMetadata?.runId),
      txId: asString(messageMetadata?.txId),
      receiptPath: asString(messageMetadata?.receiptPath),
      bundlePath: asString(messageMetadata?.bundlePath),
      metadata: messageMetadata,
      createdAt: toIso(message.createdAt),
    },
  });
});

imobRouter.post("/chat/telemetry", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const body = asObject(req.body) ?? {};
  const conversationId = asString(body.conversationId);
  const event = asString(body.event);
  const valueRaw = Number(body.value);
  const metadata = asObject(body.metadata) ?? {};
  const allowedEvents = new Set([
    "message_to_plan_ms",
    "plan_to_execute_ms",
    "chat_to_run_link_coverage",
    "message_persist_success_rate",
    "ux_interaction",
  ]);

  if (!conversationId || !event || !Number.isFinite(valueRaw) || !allowedEvents.has(event)) {
    return res.status(400).json({
      ok: false,
      error: {
        code: "INVALID_PAYLOAD",
        message: "conversationId, event and numeric value are required",
      },
    });
  }

  const telemetry = await prisma.memoryEvent.create({
    data: {
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      agentId: IMOB_CHAT_AGENT_ID,
      runId: null,
      key: CHAT_KEY_TELEMETRY,
      content: `${event}:${valueRaw}`,
      metadata: {
        conversationId,
        event,
        value: valueRaw,
        ...metadata,
      },
    },
  });

  return res.status(201).json({
    ok: true,
    telemetry: {
      id: telemetry.id,
      createdAt: toIso(telemetry.createdAt),
    },
  });
});

imobRouter.get("/chat/telemetry/summary", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const windowRaw = Number(req.query.windowHours ?? "24");
  const windowHours = Number.isFinite(windowRaw) ? Math.max(1, Math.min(24 * 30, windowRaw)) : 24;
  const conversationId = asString(req.query.conversationId);
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

  const rows = await prisma.memoryEvent.findMany({
    where: {
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      agentId: IMOB_CHAT_AGENT_ID,
      key: CHAT_KEY_TELEMETRY,
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "desc" },
    take: 4000,
  });

  const scopedRows = rows.filter((row) => {
    if (!conversationId) return true;
    const metadata = asObject(row.metadata);
    return getConversationIdFromMetadata(metadata) === conversationId;
  });

  const grouped = new Map<string, number[]>();
  for (const row of scopedRows) {
    const metadata = asObject(row.metadata);
    const event = asString(metadata?.event) ?? "unknown";
    const value =
      Number.isFinite(Number(metadata?.value))
        ? Number(metadata?.value)
        : parseNumericTelemetryValue(row.content);
    if (value === null || !Number.isFinite(value)) continue;
    const bucket = grouped.get(event) ?? [];
    bucket.push(value);
    grouped.set(event, bucket);
  }

  const aggregates = Array.from(grouped.entries()).map(([event, values]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((acc, item) => acc + item, 0);
    const avg = values.length > 0 ? sum / values.length : 0;
    const p95 = sorted.length > 0 ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] : 0;
    return {
      event,
      count: values.length,
      avg,
      p95,
      min: sorted[0] ?? 0,
      max: sorted[sorted.length - 1] ?? 0,
    };
  });

  const metricsByEvent = Object.fromEntries(aggregates.map((item) => [item.event, item])) as Record<
    string,
    { event: string; count: number; avg: number; p95: number; min: number; max: number }
  >;

  const coverage = metricsByEvent.chat_to_run_link_coverage?.avg ?? 0;
  const persistRate = metricsByEvent.message_persist_success_rate?.avg ?? 0;

  return res.json({
    ok: true,
    data: {
      conversationId: conversationId ?? null,
      windowHours,
      generatedAt: new Date().toISOString(),
      totals: {
        events: scopedRows.length,
        messageToPlanAvgMs: metricsByEvent.message_to_plan_ms?.avg ?? null,
        planToExecuteAvgMs: metricsByEvent.plan_to_execute_ms?.avg ?? null,
        chatToRunCoveragePct: Number((coverage * 100).toFixed(2)),
        persistSuccessRatePct: Number((persistRate * 100).toFixed(2)),
      },
      metrics: aggregates,
    },
  });
});

imobRouter.get("/chat/conversations/:conversationId/export", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const conversationId = asString(req.params.conversationId);
  if (!conversationId) {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_CONVERSATION_ID", message: "conversationId is required" },
    });
  }

  const conversationRows = await prisma.memoryEvent.findMany({
    where: {
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      agentId: IMOB_CHAT_AGENT_ID,
      key: CHAT_KEY_CONVERSATION_CREATED,
    },
    orderBy: { createdAt: "desc" },
    take: 400,
  });

  const conversationRecord = conversationRows
    .map((row) => ({ row, metadata: asObject(row.metadata) }))
    .find((entry) => getConversationIdFromMetadata(entry.metadata) === conversationId);

  const messageRows = await prisma.memoryEvent.findMany({
    where: {
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      agentId: IMOB_CHAT_AGENT_ID,
      key: CHAT_KEY_MESSAGE,
    },
    orderBy: { createdAt: "asc" },
    take: 6000,
  });

  const messages = messageRows
    .filter((row) => getConversationIdFromMetadata(row.metadata) === conversationId)
    .map((row) => {
      const metadata = asObject(row.metadata);
      const runId = row.runId ?? asString(metadata?.runId);
      const txId = asString(metadata?.txId);
      const receiptPath = asString(metadata?.receiptPath);
      const bundlePath = asString(metadata?.bundlePath);
      return {
        id: row.id,
        role: getRoleFromMetadata(metadata),
        content: row.content,
        intent: asString(metadata?.intent),
        action: asString(metadata?.action),
        threadId: getThreadIdFromMetadata(metadata),
        threadLabel: getThreadLabelFromMetadata(metadata),
        threadStatus: getThreadStatusFromMetadata(metadata),
        runId,
        txId,
        receiptPath,
        bundlePath,
        createdAt: toIso(row.createdAt),
      };
    });

  const threadMap = new Map<
    string,
    {
      threadId: string;
      label: string;
      status: "active" | "done" | "blocked";
      firstMessageAt: string;
      lastMessageAt: string;
      messageCount: number;
    }
  >();
  for (const message of messages) {
    if (!message.threadId) continue;
    const label = message.threadLabel ?? "Operação";
    const status =
      message.threadStatus === "done" || message.threadStatus === "blocked" ? message.threadStatus : "active";
    if (!threadMap.has(message.threadId)) {
      threadMap.set(message.threadId, {
        threadId: message.threadId,
        label,
        status,
        firstMessageAt: message.createdAt,
        lastMessageAt: message.createdAt,
        messageCount: 1,
      });
      continue;
    }
    const existing = threadMap.get(message.threadId)!;
    existing.lastMessageAt = message.createdAt;
    existing.label = label;
    existing.status = status;
    existing.messageCount += 1;
  }
  const threads = Array.from(threadMap.values()).sort(
    (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
  );

  const telemetryRows = await prisma.memoryEvent.findMany({
    where: {
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      agentId: IMOB_CHAT_AGENT_ID,
      key: CHAT_KEY_TELEMETRY,
    },
    orderBy: { createdAt: "desc" },
    take: 4000,
  });

  const scopedTelemetry = telemetryRows.filter((row) => {
    const metadata = asObject(row.metadata);
    return getConversationIdFromMetadata(metadata) === conversationId;
  });

  const grouped = new Map<string, number[]>();
  for (const row of scopedTelemetry) {
    const metadata = asObject(row.metadata);
    const event = asString(metadata?.event) ?? "unknown";
    const value =
      Number.isFinite(Number(metadata?.value))
        ? Number(metadata?.value)
        : parseNumericTelemetryValue(row.content);
    if (value === null || !Number.isFinite(value)) continue;
    const bucket = grouped.get(event) ?? [];
    bucket.push(value);
    grouped.set(event, bucket);
  }
  const telemetryMetrics = Array.from(grouped.entries()).map(([event, values]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((acc, item) => acc + item, 0);
    return {
      event,
      count: values.length,
      avg: values.length ? sum / values.length : 0,
      p95: sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] : 0,
      min: sorted[0] ?? 0,
      max: sorted[sorted.length - 1] ?? 0,
    };
  });

  const coverageMetric = telemetryMetrics.find((item) => item.event === "chat_to_run_link_coverage");
  const persistMetric = telemetryMetrics.find((item) => item.event === "message_persist_success_rate");
  const msgPlanMetric = telemetryMetrics.find((item) => item.event === "message_to_plan_ms");
  const planExecMetric = telemetryMetrics.find((item) => item.event === "plan_to_execute_ms");

  const exported = {
    generatedAt: new Date().toISOString(),
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    conversation: {
      conversationId,
      title: asString(conversationRecord?.metadata?.title) ?? "Conversa IMOB",
      status: asString(conversationRecord?.metadata?.status) ?? "active",
      createdAt: toIso(conversationRecord?.row.createdAt),
      messageCount: messages.length,
    },
    links: {
      runsBase: "/app/runs?domain=imob",
      ledgerBase: "/api/ledger/:txId",
    },
    threads,
    messages,
    telemetry: {
      totals: {
        messageToPlanAvgMs: msgPlanMetric?.avg ?? null,
        planToExecuteAvgMs: planExecMetric?.avg ?? null,
        chatToRunCoveragePct: Number(((coverageMetric?.avg ?? 0) * 100).toFixed(2)),
        persistSuccessRatePct: Number(((persistMetric?.avg ?? 0) * 100).toFixed(2)),
      },
      metrics: telemetryMetrics,
    },
  };

  const digest = crypto.createHash("sha256").update(JSON.stringify(exported)).digest("hex");
  return res.json({
    ok: true,
    export: {
      ...exported,
      audit: {
        hash: digest,
        hashAlgo: "sha256",
      },
    },
  });
});
