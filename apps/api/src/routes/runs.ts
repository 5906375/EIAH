import { Buffer } from "node:buffer";
import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { enforceTenant, TenantAwareRequest } from "../middlewares/enforceTenant";
import { getAgentProfile, resolveAgentId } from "../services/agents";
import {
  canonicalizeResult,
  computeResultHash,
  incrCriticalCounter,
  normalizeReason,
  publishRun,
  recordGuardrailLedger,
  requiresApprovalFromRequest,
  SignerManager,
  type ReasonCode,
} from "@eiah/core";
import { evaluateTrustScore, trustScoreAllowsExecution } from "../services/trustScore";
import { evaluateIntent } from "../services/intentValidator";
import { createGuardrailLedgerStore } from "../services/guardrailLedgerStore";
import { estimateCostCents } from "../services/billing";
import { createRunRecord, getRun, listRuns } from "../services/runs";
import { prismaGlobal, Prisma, type RunMode } from "@repo/db";
import { getAgentRecommendationState, saveAgentRecommendationState } from "../services/recommendations";
import { listRunEvents } from "../services/runEvents";
import { requirePermission } from "../middlewares/requirePermission";
import { emitRunEvent } from "../services/runEventEmitter";
import { subscribeToRunEventStream } from "../services/runEventStream";
import { requireTenantRole } from "../middlewares/requireTenantRole";
import { appendSclRecord } from "../services/sclLedger";
import { resolveMembershipReason } from "../services/membershipStatus";
import { loadCustomRoleWithPermissions } from "../services/customRoles";
import { evaluatePolicyEngine } from "../services/policyEngineAdapter";
import { hasPermission, resolveRole } from "../security/authz";

export const runsRouter = Router();
runsRouter.use(enforceTenant);

function respondRunError(
  res: any,
  params: { status: number; code: string; message?: string; reason?: ReasonCode | null }
) {
  const normalizedReason = params.reason ? normalizeReason(params.reason) : undefined;
  return res.status(params.status).json({
    ok: false,
    error: {
      code: params.code,
      reason: normalizedReason,
      message: params.message,
    },
  });
}

const serializeRun = (run: any) => ({
  ...run,
  projectId: run?.workspaceId,
});

const serializeRunEvent = (event: any) => ({
  id: event.id,
  runId: event.runId,
  type: event.type,
  payload: event.payload ?? null,
  criticalHash: event.criticalHash ?? null,
  sclTxId: event.sclTxId ?? null,
  createdAt: event.createdAt,
  userId: event.userId ?? undefined,
});

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseBoolEnv(value: string | undefined, fallback = false) {
  if (value == null) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "on", "yes"].includes(normalized)) return true;
  if (["false", "0", "off", "no"].includes(normalized)) return false;
  return fallback;
}

function sha256Hex(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

type ApprovalCriticality = "low" | "medium" | "high" | "critical" | "unknown";
type ApprovalRejectPolicy = "pause" | "abort" | "retry";

function resolveApprovalCriticality(run: any): ApprovalCriticality {
  const metadata =
    run && typeof run === "object" && "request" in run
      ? (run.request as { metadata?: Record<string, unknown> } | null)?.metadata
      : null;
  const raw =
    typeof metadata?.criticality === "string"
      ? metadata?.criticality
      : typeof (metadata as any)?.intent?.sensitivity === "string"
      ? ((metadata as any).intent as { sensitivity?: string }).sensitivity
      : null;
  const normalized = raw ? raw.trim().toLowerCase() : "unknown";
  if (normalized === "low" || normalized === "medium" || normalized === "high" || normalized === "critical") {
    return normalized;
  }
  return "unknown";
}

function resolveCriticalityFromMetadata(metadata: unknown): ApprovalCriticality {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "unknown";
  const raw =
    typeof (metadata as { criticality?: unknown }).criticality === "string"
      ? (metadata as { criticality?: string }).criticality
      : typeof (metadata as any)?.intent?.sensitivity === "string"
      ? ((metadata as any).intent as { sensitivity?: string }).sensitivity
      : null;
  const normalized = raw ? raw.trim().toLowerCase() : "unknown";
  if (normalized === "low" || normalized === "medium" || normalized === "high" || normalized === "critical") {
    return normalized;
  }
  return "unknown";
}

function resolveApprovalRejectPolicy(): ApprovalRejectPolicy {
  const raw = (process.env.APPROVAL_REJECT_POLICY ?? "abort").trim().toLowerCase();
  if (raw === "pause" || raw === "retry" || raw === "abort") return raw;
  return "abort";
}

function resolveApprovalRejectedRunStatus(policy: ApprovalRejectPolicy) {
  if (policy === "pause") return "awaiting_approval" as const;
  if (policy === "retry") return "pending" as const;
  return "blocked" as const;
}

function extractRunRequestPayload(request: unknown) {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    return { prompt: null as string | null, metadata: {} as Record<string, unknown> };
  }
  const source = request as Record<string, unknown>;
  const prompt = typeof source.prompt === "string" ? source.prompt : null;
  const metadata =
    source.metadata && typeof source.metadata === "object" && !Array.isArray(source.metadata)
      ? (source.metadata as Record<string, unknown>)
      : ({} as Record<string, unknown>);
  return { prompt, metadata };
}

async function checkPermissionForApproval(
  authContext: TenantAwareRequest["authContext"],
  permission: string,
  prisma: TenantAwareRequest["prisma"]
) {
  if (!authContext) {
    return { ok: false, code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } as const;
  }

  if (!authContext.isGlobalAdmin) {
    if (!authContext.tenantRole || !authContext.membershipStatus) {
      return {
        ok: false,
        code: "TENANT_MEMBERSHIP_REQUIRED",
        message: "Tenant membership required",
        reason: normalizeReason("membership_inactive"),
      } as const;
    }
    if (authContext.membershipStatus !== "ACTIVE") {
      return {
        ok: false,
        code: "TENANT_MEMBERSHIP_INACTIVE",
        message: "Tenant membership inactive",
        reason: normalizeReason(resolveMembershipReason(authContext.membershipStatus)),
      } as const;
    }
  }

  if (authContext.customRoleId && prisma) {
    const custom = await loadCustomRoleWithPermissions({
      prisma,
      tenantId: authContext.tenantId,
      roleId: authContext.customRoleId,
    });
    const allowed = custom?.permissions.has(permission) ?? false;
    if (!allowed) {
      return { ok: false, code: "RBAC_DENIED", message: "Permission denied" } as const;
    }
    return { ok: true } as const;
  }

  const role = resolveRole(
    authContext.tokenId,
    authContext.isGlobalAdmin,
    authContext.tenantRole
  );
  const allowed = hasPermission({
    role,
    permission,
    tenantId: authContext.tenantId,
  });
  if (!allowed) {
    return { ok: false, code: "RBAC_DENIED", message: "Permission denied" } as const;
  }

  return { ok: true } as const;
}

async function resolveApproverWalletId(params: {
  prisma: TenantAwareRequest["prisma"];
  tenantId: string;
  workspaceId: string;
  userId?: string | null;
  identityType?: TenantAwareRequest["authContext"]["identityType"];
}) {
  if (!params.prisma) return null;
  if (params.identityType !== "wallet") return null;
  if (!params.userId) return null;
  const identity = await params.prisma.walletIdentity.findFirst({
    where: {
      userId: params.userId,
      tenantId: params.tenantId,
      OR: [{ workspaceId: params.workspaceId }, { workspaceId: null }],
    },
    orderBy: { updatedAt: "desc" },
    select: { address: true },
  });
  return identity?.address ?? null;
}

function resolveApproverRoleLabel(authContext: NonNullable<TenantAwareRequest["authContext"]>) {
  if (authContext.isGlobalAdmin) return "global_admin";
  if (authContext.customRoleId) return `custom:${authContext.customRoleId}`;
  return authContext.tenantRole ?? "tenant_unknown";
}

function extractConnectorDependencies(config: unknown): string[] {
  if (!config || typeof config !== "object" || Array.isArray(config)) return [];
  const record = config as Record<string, unknown>;
  const ids: string[] = [];
  const single = record.connectorInstanceId;
  if (typeof single === "string" && single.trim()) ids.push(single.trim());
  const list = record.connectorIds;
  if (Array.isArray(list)) {
    list.forEach((value) => {
      if (typeof value === "string" && value.trim()) ids.push(value.trim());
    });
  }
  return Array.from(new Set(ids));
}

async function computePlanHashForRun(prisma: any, runId: string) {
  const steps = await prisma.planStepRecord.findMany({
    where: { runId, stepType: "plan" },
    orderBy: { stepIndex: "asc" },
    select: { stepIndex: true, output: true },
  });

  const payload = steps.map((step: { stepIndex: number; output: unknown }) => ({
    stepIndex: step.stepIndex,
    output: step.output ?? null,
  }));

  return computeResultHash(canonicalizeResult(payload));
}

function isUniqueConstraintError(error: unknown, target?: string[]) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== "P2002") return false;
  if (!target || target.length === 0) return true;
  const actual = (error.meta?.target as string[] | undefined) ?? [];
  return target.some((field) => actual.includes(field));
}

runsRouter.get("/runs", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const agent = req.query.agent as string | undefined;
  const status = req.query.status as string | undefined;
  const from = req.query.from ? new Date(String(req.query.from)) : undefined;
  const to = req.query.to ? new Date(String(req.query.to)) : undefined;
  const page = Number(req.query.page ?? 1);
  const size = Number(req.query.size ?? 50);

  const output = await listRuns({
    prisma,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    agent,
    status: status as any,
    from,
    to,
    page,
    size,
  });

  return res.json({
    items: output.items.map(serializeRun),
    total: output.total,
  });
});

runsRouter.get("/runs/global", async (req, res) => {
  const { authContext } = req as TenantAwareRequest;
  if (!authContext) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  if (!authContext.isGlobalAdmin) {
    return res.status(403).json({
      ok: false,
      error: { code: "FORBIDDEN", message: "Global admin required" },
    });
  }

  const agent = req.query.agent as string | undefined;
  const status = req.query.status as string | undefined;
  const from = req.query.from ? new Date(String(req.query.from)) : undefined;
  const to = req.query.to ? new Date(String(req.query.to)) : undefined;
  const tenantId = req.query.tenantId as string | undefined;
  const workspaceId = req.query.workspaceId as string | undefined;
  const page = Number(req.query.page ?? 1);
  const size = Number(req.query.size ?? 50);

  const where: Record<string, unknown> = {};
  if (agent) where.agent = agent;
  if (status) where.status = status;
  if (tenantId) where.tenantId = tenantId;
  if (workspaceId) where.workspaceId = workspaceId;
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
    };
  }

  const [items, total] = await Promise.all([
    prismaGlobal.run.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * size,
      take: size,
    }),
    prismaGlobal.run.count({ where }),
  ]);

  return res.json({
    items: items.map(serializeRun),
    total,
  });
});

runsRouter.get("/runs/:id", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const run = await getRun({
    prisma,
    id: req.params.id,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
  });
  if (!run) {
    return res.status(404).json({
      ok: false,
      error: { code: "NOT_FOUND", message: "run" },
    });
  }

  return res.json(serializeRun(run));
});

runsRouter.get("/runs/:id/events", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const events = await listRunEvents({
    prisma,
    runId: req.params.id,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    cursor: typeof req.query.cursor === "string" ? req.query.cursor : null,
  });

  return res.json({
    items: events.map(serializeRunEvent),
  });
});

runsRouter.get("/runs/:id/critical-log", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const entries = await prisma.sclLedger.findMany({
    where: { runId: req.params.id, tenantId: authContext.tenantId },
    orderBy: { createdAt: "asc" },
  });

  return res.json({ ok: true, items: entries });
});

runsRouter.get("/runs/:id/stream", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  let initialEvents: unknown[] = [];
  try {
    initialEvents = await listRunEvents({
      prisma,
      runId: req.params.id,
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      cursor: typeof req.query.cursor === "string" ? req.query.cursor : null,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: {
        code: "RUN_EVENT_STREAM_INIT_FAILED",
        message: "Unable to init event stream",
        details: error instanceof Error ? error.message : String(error),
      },
    });
  }

  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders?.();

  const sendEvent = (event: any) => {
    res.write(`event: run-event\n`);
    res.write(`data: ${JSON.stringify(serializeRunEvent(event))}\n\n`);
  };

  const sendHeartbeat = () => {
    res.write(`event: heartbeat\n`);
    res.write(`data: {}\n\n`);
  };

  const heartbeatTimer = setInterval(sendHeartbeat, 15000);

  initialEvents.forEach(sendEvent);

  const unsubscribe = subscribeToRunEventStream(
    {
      runId: req.params.id,
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
    },
    (event) => {
      sendEvent(event);
    }
  );

  const closeConnection = () => {
    clearInterval(heartbeatTimer);
    unsubscribe();
    res.end();
  };

  req.on("close", closeConnection);
  req.on("error", closeConnection);
});

const RunExecutionSchema = z.object({
  agent: z.string().min(1),
  prompt: z.string().min(1),
  runMode: z.enum(["LIVE", "DRY_RUN"]).optional(),
  metadata: z.record(z.any()).optional(),
});

export function resolveRunModeFromRequest(payload: {
  runMode?: "LIVE" | "DRY_RUN";
  metadata?: Record<string, unknown>;
}): RunMode {
  if (payload.runMode) return payload.runMode;
  const metadataMode = payload.metadata?.mode;
  if (typeof metadataMode === "string" && metadataMode.trim().toLowerCase() === "simulate") {
    return "DRY_RUN";
  }
  const metadataRunMode = payload.metadata?.runMode;
  if (metadataRunMode === "LIVE" || metadataRunMode === "DRY_RUN") {
    return metadataRunMode;
  }
  return "LIVE";
}

const RecommendationAdoptSchema = z
  .object({
    key: z.string().min(1).optional(),
    tatica: z.string().min(1).optional(),
    adopted: z.boolean().optional(),
  })
  .refine((data) => data.key || data.tatica, {
    message: "key_or_tatica_required",
  });

const RecommendationRejectSchema = z
  .object({
    key: z.string().min(1).optional(),
    tatica: z.string().min(1).optional(),
    reason: z.string().min(1).optional(),
  })
  .refine((data) => data.key || data.tatica, {
    message: "key_or_tatica_required",
  });

const RunFeedbackSchema = z.object({
  rating: z.number().int().min(1).max(5),
  tags: z.array(z.string()).optional(),
});

const ConversationFinalizeSchema = z.object({
  document: z.string().min(1),
  runIds: z.array(z.string()).optional(),
  policySnapshot: z.record(z.any()).optional(),
});

const ReplayRunSchema = z
  .object({
    txPolicy: z.enum(["idempotent", "new_tx"]).optional(),
    reason: z.string().max(300).optional(),
  })
  .optional();

type ReplayTxPolicy = "idempotent" | "new_tx";

export function resolveReplayTxPolicy(params: {
  requestedPolicy?: ReplayTxPolicy;
  existingTxId?: string | null;
  allowNewTxReplay?: boolean;
}) {
  const txPolicy = params.requestedPolicy ?? "idempotent";
  const existingTxId = params.existingTxId ?? null;
  const allowNewTxReplay = params.allowNewTxReplay ?? false;
  if (!existingTxId) {
    return { action: "enqueue" as const, txPolicy, existingTxId: null };
  }
  if (txPolicy === "idempotent") {
    return { action: "noop" as const, txPolicy, existingTxId };
  }
  if (allowNewTxReplay) {
    return { action: "enqueue" as const, txPolicy, existingTxId };
  }
  return { action: "deny" as const, txPolicy, existingTxId };
}

function createGovernanceLedgerHash(params: {
  tenantId: string;
  actionType: string;
  idempotencyKey: string;
  usageCount?: number;
  receiptHash?: string | null;
}) {
  const usageCount = params.usageCount ?? 1;
  const criticalHash = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        event: "guardrail.ledger.insert",
        tenantId: params.tenantId,
        actionType: params.actionType,
        idempotencyKey: params.idempotencyKey,
        usageCount,
        receiptHash: params.receiptHash ?? null,
      })
    )
    .digest("hex");
  const payloadHash = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        idempotencyKey: params.idempotencyKey,
        usageCount,
        receiptHash: params.receiptHash ?? null,
      })
    )
    .digest("hex");
  return { criticalHash, payloadHash };
}

async function recordGovernanceLedger(params: {
  prisma: TenantAwareRequest["prisma"];
  tenantId: string;
  runId: string;
  actionType: string;
  idempotencyKey: string;
  receiptHash?: string | null;
}) {
  if (!params.prisma) return null;
  const { criticalHash, payloadHash } = createGovernanceLedgerHash({
    tenantId: params.tenantId,
    actionType: params.actionType,
    idempotencyKey: params.idempotencyKey,
    receiptHash: params.receiptHash ?? null,
  });
  await params.prisma.guardrailLedger.create({
    data: {
      tenantId: params.tenantId,
      runId: params.runId,
      actionType: params.actionType,
      criticalHash,
      payloadHash,
    },
  });
  return criticalHash;
}

async function recordApprovalDeny(params: {
  prisma: TenantAwareRequest["prisma"];
  tenantId: string;
  workspaceId: string;
  runId: string;
  criticality: ApprovalCriticality;
  approverId: string | null | undefined;
  idempotencyKey: string | null;
  reason: "rbac_denied" | "trust_denied" | "identity_required_wallet";
  decision: string;
}) {
  if (!params.prisma) return null;
  const actionType = `run.approve.denied.${params.reason}`;
  const idempotencyKey = params.idempotencyKey ?? `run.${params.runId}:${params.reason}`;
  const hashes = createGovernanceLedgerHash({
    tenantId: params.tenantId,
    actionType,
    idempotencyKey,
  });

  await params.prisma.guardrailLedger.create({
    data: {
      tenantId: params.tenantId,
      runId: params.runId,
      actionType,
      criticalHash: hashes.criticalHash,
      payloadHash: hashes.payloadHash,
    },
  });

  if (params.criticality === "critical") {
    await appendSclRecord({
      prisma: params.prisma,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      runId: params.runId,
      riskLevel: "critical",
      payload: {
        event: "run.approve.denied",
        reason: params.reason,
        decision: params.decision,
        approverId: params.approverId ?? null,
        criticality: params.criticality,
        idempotencyKey,
        guardrailHash: hashes.criticalHash,
        payloadHash: hashes.payloadHash,
      },
    });
  }

  return hashes.criticalHash;
}

function normalizeRecommendationKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function matchRecommendation(
  record: Record<string, unknown>,
  key?: string | null,
  tatica?: string | null
) {
  const recordKey = typeof record.key === "string" ? record.key : null;
  const recordTatica = typeof record.tatica === "string" ? record.tatica : null;
  if (key && recordKey && recordKey.toLowerCase() === key.toLowerCase()) return true;
  if (tatica && recordTatica && recordTatica.toLowerCase() === tatica.toLowerCase()) return true;
  return false;
}

function updateRecommendationInResponse(params: {
  response: unknown;
  key?: string | null;
  tatica?: string | null;
  adopted?: boolean;
  status?: string | null;
  feedback?: Record<string, unknown> | null;
}): {
  updated: boolean;
  response: unknown;
  matched: { key?: string; tatica?: string; score?: number } | null;
} {
  const { response, key, tatica, adopted, status, feedback } = params;
  if (!response) return { updated: false, response, matched: null };

  let root: unknown = response;
  let parsedFromString = false;

  if (typeof response === "string") {
    try {
      root = JSON.parse(response);
      parsedFromString = true;
    } catch {
      return { updated: false, response, matched: null };
    }
  }

  const visited = new WeakSet<object>();
  let updated = false;
  let matched: { key?: string; tatica?: string; score?: number } | null = null;

  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    if (visited.has(node as object)) return;
    visited.add(node as object);

    if (Array.isArray(node)) {
      node.forEach((item) => walk(item));
      return;
    }

    const record = node as Record<string, unknown>;
    const list =
      (Array.isArray(record.recomendacoes) && record.recomendacoes) ||
      (Array.isArray(record.recommendations) && record.recommendations);

    if (Array.isArray(list)) {
      list.forEach((item) => {
        if (!item || typeof item !== "object") return;
        const entry = item as Record<string, unknown>;
        if (!matchRecommendation(entry, key, tatica)) return;
        if (adopted !== undefined) {
          entry.adopted = adopted;
        }
        if (status) {
          entry.status = status;
        }
        if (feedback) {
          entry.feedback = {
            ...(isPlainObject(entry.feedback) ? entry.feedback : {}),
            ...feedback,
          };
        }
        updated = true;
        matched = {
          key: typeof entry.key === "string" ? entry.key : matched?.key,
          tatica: typeof entry.tatica === "string" ? entry.tatica : matched?.tatica,
          score: typeof entry.score === "number" ? entry.score : matched?.score,
        };
      });
    }

    Object.values(record).forEach((value) => walk(value));
  };

  walk(root);

  if (!updated) {
    return { updated: false, response, matched: null };
  }

  const updatedResponse = parsedFromString ? JSON.stringify(root) : root;
  return { updated: true, response: updatedResponse, matched };
}

runsRouter.post(
  "/runs",
  requireTenantRole(["TENANT_ADMIN", "TENANT_OPERATOR"]),
  async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const parse = RunExecutionSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid payload",
        details: parse.error.flatten(),
      },
    });
  }

  const { agent: rawAgent, prompt, metadata } = parse.data;
  const runMode = resolveRunModeFromRequest(parse.data);
  let resolvedMetadata =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? ({
          ...metadata,
          runMode,
        } as Record<string, unknown>)
      : ({ runMode } as Record<string, unknown>);
  const agent = resolveAgentId(rawAgent);
  const delegationPolicy = (req as TenantAwareRequest).delegationPolicy;

  const policyScope = runMode === "DRY_RUN" ? "read" : "execute";
  const policyAction = runMode === "DRY_RUN" ? "runs.simulate" : "runs.execute";
  const policyDecision = await evaluatePolicyEngine({
    prisma,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    userId: authContext.userId ?? null,
    scope: policyScope,
    action: policyAction,
  });
  if (policyDecision.decision === "deny") {
    if (policyDecision.mode === "shadow") {
      void incrCriticalCounter("policy_shadow_denies_total", {
        action: policyAction,
        reason: policyDecision.reason ?? "policy_denied",
      });
    } else {
      return res.status(403).json({
        ok: false,
        error: {
          code: runMode === "DRY_RUN" ? "POLICY_DENIED_DRY_RUN" : "POLICY_DENIED",
          reason: policyDecision.reason ?? "policy_denied",
          message: "Policy denied",
        },
      });
    }
  }

  if (delegationPolicy) {
    const delegationPayload = {
      id: delegationPolicy.id,
      delegatorId: delegationPolicy.delegatorId,
      marketplaceId: delegationPolicy.marketplaceId ?? null,
      scope: delegationPolicy.scope,
      trustMin: delegationPolicy.trustMin,
      validUntil: delegationPolicy.validUntil.toISOString(),
    };

    const hasDelegation =
      resolvedMetadata &&
      typeof resolvedMetadata === "object" &&
      !Array.isArray(resolvedMetadata) &&
      "delegation" in (resolvedMetadata as Record<string, unknown>);

    if (!hasDelegation) {
      resolvedMetadata = {
        ...(resolvedMetadata ?? {}),
        delegation: delegationPayload,
      };
    }
  }

  const profile = await getAgentProfile(authContext.tenantId, authContext.workspaceId, agent, prisma);
  if (!profile) {
    return res.status(404).json({
      ok: false,
      error: { code: "AGENT_NOT_FOUND", message: `Agent ${rawAgent} was not found` },
    });
  }

  const install = await prisma.agentInstall.findFirst({
    where: {
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      agentId: agent,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!install) {
    return res.status(403).json({
      ok: false,
      error: { code: "AGENT_NOT_INSTALLED", message: "Agent is not installed" },
    });
  }

  if (install.status !== "ACTIVE") {
    return res.status(403).json({
      ok: false,
      error: { code: "AGENT_INSTALL_INACTIVE", message: "Agent install is not active" },
    });
  }

  const criticality = resolveCriticalityFromMetadata(resolvedMetadata);
  const identityType = authContext.identityType ?? "password";
  if ((criticality === "high" || criticality === "critical") && identityType !== "wallet") {
    await recordGuardrailLedger({
      prisma,
      tenantId: authContext.tenantId,
      runId: null,
      actionType: "run.execute.denied.identity_required_wallet",
      payload: {
        reason: "identity_required_wallet",
        criticality,
        identityType,
        agent,
        userId: authContext.userId ?? null,
      },
    });
    return res.status(403).json({
      ok: false,
      error: { code: "IDENTITY_REQUIRED_WALLET", message: "Wallet identity required for high criticality" },
    });
  }

  const hasIdentityType =
    resolvedMetadata &&
    typeof resolvedMetadata === "object" &&
    !Array.isArray(resolvedMetadata) &&
    "identityType" in (resolvedMetadata as Record<string, unknown>);
  if (!hasIdentityType) {
    resolvedMetadata = {
      ...(resolvedMetadata ?? {}),
      identityType,
    };
  }

  const connectorIds = extractConnectorDependencies(install.config);
  if (connectorIds.length > 0) {
    const activeConnectors = await prisma.connectorInstance.findMany({
      where: { id: { in: connectorIds }, status: "ACTIVE" },
      select: { id: true },
    });
    if (activeConnectors.length !== connectorIds.length) {
      return res.status(403).json({
        ok: false,
        error: { code: "CONNECTOR_INACTIVE", message: "Required connector inactive" },
      });
    }
  }

  const requestPayload = { prompt, metadata: resolvedMetadata };

  const inputBytes = Buffer.byteLength(prompt, "utf8");
  const toolIdentifiers = Array.isArray(profile.tools)
    ? (profile.tools as Array<unknown>)
        .map((entry) => {
          if (typeof entry === "string") {
            return entry;
          }
          if (
            entry &&
            typeof entry === "object" &&
            "name" in entry &&
            typeof (entry as { name?: unknown }).name === "string"
          ) {
            return (entry as { name: string }).name;
          }
          return undefined;
        })
        .filter((value): value is string => Boolean(value))
    : undefined;

  const estimate = await estimateCostCents({
    agent,
    inputBytes,
    tools: toolIdentifiers,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    prisma,
  });

  if (estimate === null) {
    return res.status(404).json({
      ok: false,
      error: { code: "WORKSPACE_NOT_FOUND", message: "Workspace not found for tenant" },
    });
  }

  const trust = await evaluateTrustScore(prisma, authContext.tenantId, authContext.workspaceId);

  if (!trustScoreAllowsExecution(trust)) {
    const blockedRun = await createRunRecord({
      prisma,
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      userId: authContext.userId,
      agent,
      runMode,
      status: "blocked",
      request: requestPayload,
      estimatedCostCents: estimate,
      finalCostCents: 0,
      costCents: 0,
      charged: false,
      chargeReason: "TRUST_BLOCKED",
      traceId: null,
      finishedAt: new Date(),
    });

    await emitRunEvent({
      prisma,
      runId: blockedRun.id,
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      userId: authContext.userId,
      type: "run.trustscore.blocked",
      payload: trust,
    });

    const ledger = createGuardrailLedgerStore(authContext.tenantId, authContext.workspaceId, prisma);
    await ledger.register(
      JSON.stringify({
        tenantId: authContext.tenantId,
        actionType: "blocked.trustscore",
        runId: blockedRun.id,
        idempotencyKey: blockedRun.id,
      }),
      0
    );

    return res.status(403).json({
      ok: false,
      error: { code: "TRUST_BLOCKED", message: "Trust score too low" },
      data: serializeRun(blockedRun),
    });
  }

  const run = await createRunRecord({
    prisma,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    userId: authContext.userId,
    agent,
    runMode,
    status: "pending",
    request: requestPayload,
    estimatedCostCents: estimate,
    costCents: estimate,
    charged: null,
    chargeReason: null,
    traceId: null,
    finishedAt: null,
  });

  await emitRunEvent({
    prisma,
    runId: run.id,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    userId: authContext.userId,
    type: "run.requested",
      payload: {
        agent,
        runMode,
        promptPreview: prompt.slice(0, 200),
        metadata: resolvedMetadata,
      },
  });

  // Modo observação: avalia intenção, mas não bloqueia a execução
  try {
    const modeRaw = (process.env.INTENT_VALIDATOR_MODE ?? "enforce").trim().toLowerCase();
    const mode = modeRaw === "observe" ? "observe" : "enforce";
    const intent = await evaluateIntent({
      prompt,
      metadata,
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      runId: run.id,
      prisma,
      mode,
    });

    if (intent.signature) {
      resolvedMetadata = {
        ...(resolvedMetadata ?? {}),
        intentSignature: intent.signature,
      };

      await prisma.run.update({
        where: {
          id: run.id,
          tenantId: authContext.tenantId,
          workspaceId: authContext.workspaceId,
        },
        data: {
          request: {
            prompt,
            metadata: resolvedMetadata,
          } as Prisma.InputJsonValue,
        },
      });
    }

    await emitRunEvent({
      prisma,
      runId: run.id,
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      userId: authContext.userId,
      type: "run.intent.evaluated",
      payload: intent,
    });
  } catch (intentError) {
    if (req.logger) {
      req.logger.warn({ err: intentError, runId: run.id }, "run.intent_evaluation_failed");
    }
  }

  const currentRequestPayload = { prompt, metadata: resolvedMetadata };
  if (requiresApprovalFromRequest(currentRequestPayload)) {
    await prisma.run.update({
      where: {
        id: run.id,
        tenantId: authContext.tenantId,
        workspaceId: authContext.workspaceId,
      },
      data: {
        status: "awaiting_approval",
        request: currentRequestPayload as Prisma.InputJsonValue,
      },
    });

    await emitRunEvent({
      prisma,
      runId: run.id,
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      userId: authContext.userId,
      type: "run.awaiting_approval",
      payload: {
        reason: "approval_required",
        policy: "human_approval_required",
        criticality: resolveCriticalityFromMetadata(resolvedMetadata),
      },
    });

    return res.status(202).json({
      ok: true,
      data: serializeRun({ ...run, status: "awaiting_approval", request: currentRequestPayload }),
      queued: false,
      awaitingApproval: true,
    });
  }

  try {
    await emitRunEvent({
      prisma,
      runId: run.id,
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      userId: authContext.userId,
      type: "run.enqueued",
      payload: { agent, runMode, metadata: resolvedMetadata },
    });

    await publishRun({
      runId: run.id,
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      userId: authContext.userId,
      runMode,
      agent,
      prompt,
      metadata: resolvedMetadata,
    });

    if (req.logger) {
      req.logger.info(
        {
          runId: run.id,
          agent,
          metadataKeys:
            resolvedMetadata && typeof resolvedMetadata === "object"
              ? Object.keys(resolvedMetadata)
              : [],
        },
        "run.enqueued"
      );
    }

    return res.status(202).json({
      ok: true,
      data: serializeRun(run),
      queued: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Execution failed";
    if (req.logger) {
      req.logger.error({ err: error, runId: run.id }, "run.enqueue_failed");
    }

    return res.status(500).json({
      ok: false,
      error: { code: "ENQUEUE_FAILED", message },
      data: serializeRun(run),
    });
  }
});

runsRouter.post("/runs/:id/approve", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return respondRunError(res, {
      status: 500,
      code: "AUTH_CONTEXT_MISSING",
      message: "Authentication context missing",
      reason: "auth_context_missing",
    });
  }
  const approvalModel = (prisma as typeof prisma & { approvalRecord?: typeof prisma.run }).approvalRecord;
  if (!approvalModel) {
    return respondRunError(res, {
      status: 501,
      code: "APPROVALS_NOT_AVAILABLE",
      message: "Approval records are not enabled.",
      reason: "approvals_not_available",
    });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const parentRunId = typeof body.parentRunId === "string" ? body.parentRunId : null;
  const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : null;
  const decisionRaw = typeof body.decision === "string" ? body.decision.trim().toUpperCase() : "APPROVED";
  const decision = decisionRaw === "REJECTED" ? "REJECTED" : decisionRaw === "APPROVED" ? "APPROVED" : null;
  if (!decision) {
    return respondRunError(res, {
      status: 400,
      code: "INVALID_DECISION",
      message: "Invalid decision",
      reason: "invalid_decision",
    });
  }
  const idempotencyKey =
    typeof body.idempotency_key === "string" && body.idempotency_key.trim()
      ? body.idempotency_key.trim()
      : null;
  const statusConflictActionType = "run.approve.status_conflict";
  const statusConflictError = {
    code: "STATUS_CONFLICT",
    message: "run_not_awaiting_approval",
    reason: "status_conflict" as const,
  };

  const existing = await getRun({
    prisma,
    id: req.params.id,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
  });

  if (!existing) {
    return respondRunError(res, {
      status: 404,
      code: "NOT_FOUND",
      message: "run",
      reason: "not_found",
    });
  }

  if (idempotencyKey) {
    const prior = await approvalModel.findFirst({
      where: { runId: existing.id, idempotencyKey },
      orderBy: { createdAt: "desc" },
    });
    if (prior) {
      return res.status(200).json({ ok: true, approval: prior, idempotent: true });
    }
  }

  const conflictHashes = idempotencyKey
    ? createGovernanceLedgerHash({
        tenantId: authContext.tenantId,
        actionType: statusConflictActionType,
        idempotencyKey,
      })
    : null;

  if (idempotencyKey && conflictHashes) {
    const priorConflict = await prisma.guardrailLedger.findFirst({
      where: {
        tenantId: authContext.tenantId,
        actionType: statusConflictActionType,
        payloadHash: conflictHashes.payloadHash,
      },
    });
    if (priorConflict) {
      return res
        .status(409)
        .json({ ok: false, error: statusConflictError, idempotent: true });
    }
  }

  if (existing.status !== "awaiting_approval") {
    if (idempotencyKey && conflictHashes) {
      await prisma.guardrailLedger.create({
        data: {
          tenantId: authContext.tenantId,
          runId: existing.id,
          actionType: statusConflictActionType,
          criticalHash: conflictHashes.criticalHash,
          payloadHash: conflictHashes.payloadHash,
        },
      });
    }
    return res.status(409).json({ ok: false, error: statusConflictError });
  }

  const approvalPolicyDecision = await evaluatePolicyEngine({
    prisma,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    userId: authContext.userId ?? null,
    scope: "admin",
    action: "runs.approve",
  });
  if (approvalPolicyDecision.decision === "deny") {
    if (approvalPolicyDecision.mode === "shadow") {
      void incrCriticalCounter("policy_shadow_denies_total", {
        action: "runs.approve",
        reason: approvalPolicyDecision.reason ?? "policy_denied",
      });
    } else {
      return res.status(403).json({
        ok: false,
        error: {
          code: "POLICY_DENIED",
          reason: approvalPolicyDecision.reason ?? "policy_denied",
          message: "Policy denied",
        },
      });
    }
  }

  const criticality = resolveApprovalCriticality(existing);
  const identityType = authContext.identityType ?? "password";
  if ((criticality === "high" || criticality === "critical") && identityType !== "wallet") {
    const actionType = "run.approve.denied.identity_required_wallet";
    const denyError = {
      code: "IDENTITY_REQUIRED_WALLET",
      message: "Wallet identity required for high criticality approvals",
      reason: "identity_required_wallet" as const,
    };
    if (idempotencyKey) {
      const hashes = createGovernanceLedgerHash({
        tenantId: authContext.tenantId,
        actionType,
        idempotencyKey,
      });
      const prior = await prisma.guardrailLedger.findFirst({
        where: {
          tenantId: authContext.tenantId,
          actionType,
          payloadHash: hashes.payloadHash,
        },
      });
      if (prior) {
        return res.status(403).json({ ok: false, error: denyError, idempotent: true });
      }
    }

    await recordApprovalDeny({
      prisma,
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      runId: existing.id,
      criticality,
      approverId: authContext.userId,
      idempotencyKey,
      reason: "identity_required_wallet",
      decision,
    });

    return res.status(403).json({ ok: false, error: denyError });
  }
  const permission = `approve_${criticality}`;
  const permissionCheck = await checkPermissionForApproval(authContext, permission, prisma);
  if (!permissionCheck.ok) {
    const actionType = "run.approve.denied.rbac";
    const denyError = {
      code: "RBAC_DENIED",
      message: "Approval permission required",
      reason: "rbac_denied" as const,
    };
    if (idempotencyKey) {
      const hashes = createGovernanceLedgerHash({
        tenantId: authContext.tenantId,
        actionType,
        idempotencyKey,
      });
      const prior = await prisma.guardrailLedger.findFirst({
        where: {
          tenantId: authContext.tenantId,
          actionType,
          payloadHash: hashes.payloadHash,
        },
      });
      if (prior) {
        return res.status(403).json({ ok: false, error: denyError, idempotent: true });
      }
    }

    await recordApprovalDeny({
      prisma,
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      runId: existing.id,
      criticality,
      approverId: authContext.userId,
      idempotencyKey,
      reason: "rbac_denied",
      decision,
    });

    return res.status(403).json({ ok: false, error: denyError });
  }

  const intentHash = computeResultHash(canonicalizeResult(existing.request ?? null));
  const planHash = await computePlanHashForRun(prisma, existing.id);

  const trustReport = await evaluateTrustScore(prisma, authContext.tenantId, authContext.workspaceId);
  const approverTrust = trustReport.score;
  const requiredMinTrustRaw = Number(process.env.TRUST_SCORE_THRESHOLD ?? "40");
  const requiredMinTrust = Number.isFinite(requiredMinTrustRaw) ? requiredMinTrustRaw : null;
  const policyVersion = (process.env.APPROVAL_POLICY_VERSION ?? "v1").trim() || "v1";
  const policyId =
    typeof process.env.APPROVAL_POLICY_ID === "string" && process.env.APPROVAL_POLICY_ID.trim()
      ? process.env.APPROVAL_POLICY_ID.trim()
      : null;
  const now = new Date();
  const signatureRequired =
    parseBoolEnv(process.env.APPROVAL_SIGNATURE_REQUIRED, false) ||
    parseBoolEnv(process.env.SIGNER_REQUIRED, false);

  if (requiredMinTrust !== null && approverTrust < requiredMinTrust) {
    const actionType = "run.approve.denied.trust";
    const denyError = {
      code: "TRUST_DENIED",
      message: "Approver trust below required minimum",
      reason: "trust_denied" as const,
    };
    if (idempotencyKey) {
      const hashes = createGovernanceLedgerHash({
        tenantId: authContext.tenantId,
        actionType,
        idempotencyKey,
      });
      const prior = await prisma.guardrailLedger.findFirst({
        where: {
          tenantId: authContext.tenantId,
          actionType,
          payloadHash: hashes.payloadHash,
        },
      });
      if (prior) {
        return res.status(403).json({ ok: false, error: denyError, idempotent: true });
      }
    }

    await recordApprovalDeny({
      prisma,
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      runId: existing.id,
      criticality,
      approverId: authContext.userId,
      idempotencyKey,
      reason: "trust_denied",
      decision,
    });

    return res.status(403).json({ ok: false, error: denyError });
  }

  let approvalRecord: any | null = null;
  let attempt = 0;
  for (let tries = 0; tries < 3; tries += 1) {
    try {
      approvalRecord = await prisma.$transaction(async (tx: any) => {
        const aggregate = await tx.approvalRecord.aggregate({
          where: { runId: existing.id },
          _max: { attempt: true },
        });
        const nextAttempt = (aggregate._max.attempt ?? 0) + 1;

        const payloadHash = computeResultHash(
          canonicalizeResult({
            runId: existing.id,
            attempt: nextAttempt,
            tenantId: authContext.tenantId,
            approverId: authContext.userId ?? "unknown",
            decision,
            reason,
            policyId,
            policyVersion,
            requiredMinTrust,
            approverTrust,
            intentHash,
            planHash,
            idempotencyKey,
            createdAt: now.toISOString(),
          })
        );

        let sclSignature: string | null = null;
        if (signatureRequired) {
          const signer = SignerManager.fromEnv();
          try {
            const signed = await signer.signCriticalHash({
              hashHex: payloadHash,
              context: {
                tenantId: authContext.tenantId,
                workspaceId: authContext.workspaceId ?? null,
                runId: existing.id,
                actionHash: payloadHash,
                tenantHash: sha256Hex(authContext.tenantId),
                nonce: `approval:${existing.id}:${nextAttempt}`,
                timestamp: now.toISOString(),
                riskLevel: "critical",
              },
            });
            sclSignature = signed.signature;
          } catch (error) {
            await incrCriticalCounter("approval_signature_fail_total");
            throw error;
          }
        }

        return tx.approvalRecord.create({
          data: {
            runId: existing.id,
            attempt: nextAttempt,
            tenantId: authContext.tenantId,
            approverId: authContext.userId ?? "unknown",
            decision,
            reason,
            policyId,
            policyVersion,
            requiredMinTrust,
            approverTrust,
            intentHash,
            planHash,
            idempotencyKey,
            payloadHash,
            sclSignature,
            createdAt: now,
          },
        });
      });
      attempt = approvalRecord?.attempt ?? 0;
      break;
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        if (!idempotencyKey) {
          continue;
        }
        const prior = await approvalModel.findFirst({
          where: { runId: existing.id, idempotencyKey },
          orderBy: { createdAt: "desc" },
        });
        if (prior) {
          approvalRecord = prior;
          attempt = prior.attempt;
          break;
        }
        continue;
      }
      throw error;
    }
  }

  if (!approvalRecord) {
    return res.status(500).json({
      ok: false,
      error: { code: "APPROVAL_CREATE_FAILED", message: "Failed to create approval record" },
    });
  }

  if (decision === "APPROVED") {
    await incrCriticalCounter("approval_created_total");
  } else {
    await incrCriticalCounter("approval_rejected_total");
  }

  const decisionTimestamp = new Date().toISOString();
  const approverWalletId = await resolveApproverWalletId({
    prisma,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    userId: authContext.userId ?? null,
    identityType: authContext.identityType,
  });
  const rejectPolicy = resolveApprovalRejectPolicy();
  const rejectedTargetStatus = resolveApprovalRejectedRunStatus(rejectPolicy);
  const decisionRunState =
    decision === "APPROVED"
      ? { policy: "resume" as const, targetStatus: "pending" as const }
      : { policy: rejectPolicy, targetStatus: rejectedTargetStatus };
  const trustSnapshot = {
    score: approverTrust,
    level: trustReport.level,
    reasons: trustReport.reasons,
    requiredMinTrust,
  };
  const decisionReceipt = {
    receiptVersion: "v1",
    decisionTimestamp,
    decision,
    runId: existing.id,
    approvalRecordId: approvalRecord.id,
    attempt,
    criticality,
    approver: {
      userId: authContext.userId ?? null,
      role: resolveApproverRoleLabel(authContext),
      permission,
      identityType: authContext.identityType ?? "password",
      walletId: approverWalletId,
    },
    trustSnapshot,
    rbac: {
      permission,
      policyMode: approvalPolicyDecision.mode,
      policyDecision: approvalPolicyDecision.decision,
      policyReason: approvalPolicyDecision.reason ?? null,
    },
    hashes: {
      intentHash,
      planHash,
      payloadHash: approvalRecord.payloadHash,
    },
    reason,
    runState: decisionRunState,
  };
  const decisionReceiptHash = computeResultHash(canonicalizeResult(decisionReceipt));

  const approvalPayload = {
    approvedBy: authContext.userId ?? null,
    approvedAt: decisionTimestamp,
    agent: existing.agent,
    parentRunId,
    approvalRecordId: approvalRecord.id,
    attempt,
    intentHash,
    planHash,
    payloadHash: approvalRecord.payloadHash,
    reason,
    decision,
    decisionReceipt,
    decisionReceiptHash,
  };

  const approvalIdempotencyKey = `run.${decision.toLowerCase()}:${existing.id}:${approvalRecord.payloadHash}`;
  const approvalLedgerHash = await recordGovernanceLedger({
    prisma,
    tenantId: authContext.tenantId,
    runId: existing.id,
    actionType: decision === "APPROVED" ? "run.approved" : "run.rejected",
    idempotencyKey: approvalIdempotencyKey,
    receiptHash: decisionReceiptHash,
  });

  const event = await emitRunEvent({
    prisma,
    runId: existing.id,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    userId: authContext.userId,
    type: decision === "APPROVED" ? "run.approved" : "run.rejected",
    payload: approvalPayload,
    criticalHash: approvalLedgerHash ?? undefined,
  });

  const ledger = createGuardrailLedgerStore(authContext.tenantId, authContext.workspaceId, prisma);
  await ledger.register(
    JSON.stringify({
      tenantId: authContext.tenantId,
      actionType: decision === "APPROVED" ? "run.approved" : "run.rejected",
      runId: existing.id,
      parentRunId,
      idempotencyKey: `decision_receipt:${decisionReceiptHash}`,
      decisionReceipt,
      decisionReceiptHash,
    }),
    0
  );

  const requestPayload = extractRunRequestPayload(existing.request);
  const requestMetadata = {
    ...requestPayload.metadata,
    approval: {
      decision,
      decisionReceiptHash,
      approvalRecordId: approvalRecord.id,
      approvedAt: decisionTimestamp,
      approvedBy: authContext.userId ?? null,
    },
  };

  if (decision === "APPROVED") {
    await prisma.run.update({
      where: {
        id: existing.id,
        tenantId: authContext.tenantId,
        workspaceId: authContext.workspaceId,
      },
      data: {
        status: "pending",
        request: {
          prompt: requestPayload.prompt ?? "",
          metadata: requestMetadata,
        } as Prisma.InputJsonValue,
        finishedAt: null,
        errorCode: null,
      },
    });

    if (requestPayload.prompt && requestPayload.prompt.trim()) {
      await emitRunEvent({
        prisma,
        runId: existing.id,
        tenantId: authContext.tenantId,
        workspaceId: authContext.workspaceId,
        userId: authContext.userId,
        type: "run.enqueued",
        payload: {
          source: "approval",
          decisionReceiptHash,
        },
      });
      await publishRun({
        runId: existing.id,
        tenantId: authContext.tenantId,
        workspaceId: authContext.workspaceId,
        userId: existing.userId ?? authContext.userId,
        runMode: existing.runMode ?? "LIVE",
        agent: existing.agent,
        prompt: requestPayload.prompt,
        metadata: requestMetadata,
      });
    }
  } else {
    const responsePayload =
      decisionRunState.policy === "abort"
        ? {
            error: "run_rejected_by_human_approval",
            reason: reason ?? "approval_rejected",
            policy: decisionRunState.policy,
            receiptHash: decisionReceiptHash,
          }
        : existing.response;

    await prisma.run.update({
      where: {
        id: existing.id,
        tenantId: authContext.tenantId,
        workspaceId: authContext.workspaceId,
      },
      data: {
        status: decisionRunState.targetStatus,
        request: {
          prompt: requestPayload.prompt ?? "",
          metadata: requestMetadata,
        } as Prisma.InputJsonValue,
        response:
          responsePayload == null
            ? Prisma.JsonNull
            : (responsePayload as Prisma.InputJsonValue),
        finishedAt: decisionRunState.targetStatus === "blocked" ? new Date() : null,
        errorCode: decisionRunState.targetStatus === "blocked" ? "APPROVAL_REJECTED" : null,
      },
    });

    if (
      decisionRunState.policy === "retry" &&
      requestPayload.prompt &&
      requestPayload.prompt.trim()
    ) {
      await emitRunEvent({
        prisma,
        runId: existing.id,
        tenantId: authContext.tenantId,
        workspaceId: authContext.workspaceId,
        userId: authContext.userId,
        type: "run.enqueued",
        payload: {
          source: "approval_reject_retry",
          decisionReceiptHash,
          policy: decisionRunState.policy,
        },
      });
      await publishRun({
        runId: existing.id,
        tenantId: authContext.tenantId,
        workspaceId: authContext.workspaceId,
        userId: existing.userId ?? authContext.userId,
        runMode: existing.runMode ?? "LIVE",
        agent: existing.agent,
        prompt: requestPayload.prompt,
        metadata: requestMetadata,
      });
    }
  }

  return res.status(200).json({
    ok: true,
    event: serializeRunEvent(event),
    decisionReceiptHash,
    runState: decisionRunState,
  });
});

runsRouter.get("/runs/:id/approvals", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING" } });
  }

  const existing = await getRun({
    prisma,
    id: req.params.id,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
  });

  if (!existing) {
    return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "run" } });
  }

  const approvalModel = (prisma as typeof prisma & { approvalRecord?: typeof prisma.run }).approvalRecord;
  const [items, currentPlanHash] = await Promise.all([
    approvalModel
      ? approvalModel.findMany({
          where: { runId: existing.id },
          orderBy: { attempt: "desc" },
        })
      : Promise.resolve([]),
    computePlanHashForRun(prisma, existing.id),
  ]);

  return res.json({ ok: true, items, currentPlanHash });
});

runsRouter.post("/runs/:id/recommendations/adopt", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING" } });
  }

  const parse = RecommendationAdoptSchema.safeParse(req.body ?? {});
  if (!parse.success) {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_PAYLOAD", message: "key or tatica required" },
    });
  }

  const existing = await getRun({
    prisma,
    id: req.params.id,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
  });

  if (!existing) {
    return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "run" } });
  }

  const adopted = parse.data.adopted ?? true;
  const key = parse.data.key?.trim() ?? null;
  const tatica = parse.data.tatica?.trim() ?? null;
  const actionType = "run.recommendation.adopted";

  const responseUpdate = updateRecommendationInResponse({
    response: existing.response,
    key,
    tatica,
    adopted,
  });

  if (responseUpdate.updated) {
    await prisma.run.update({
      where: {
        id: existing.id,
        tenantId: authContext.tenantId,
        workspaceId: authContext.workspaceId,
      },
      data: { response: responseUpdate.response as Prisma.InputJsonValue },
    });
  }

  const nowIso = new Date().toISOString();
  const resolvedKeyRaw =
    key ??
    responseUpdate.matched?.key ??
    responseUpdate.matched?.tatica ??
    tatica ??
    "recomendacao";
  const resolvedKey = normalizeRecommendationKey(resolvedKeyRaw);

  const existingState = await getAgentRecommendationState({
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    agentId: existing.agent,
  });

  const state = existingState?.state ?? { recommendations: {}, version: 1 };
  const current = state.recommendations[resolvedKey] ?? {
    adopted: false,
    accepts: 0,
    rejects: 0,
    lastAcceptedAt: null,
    lastSuggestedAt: null,
    score: responseUpdate.matched?.score ?? 0,
    status: "PENDENTE",
  };

  const next = {
    ...current,
    adopted,
    accepts: adopted ? current.accepts + 1 : current.accepts,
    lastAcceptedAt: adopted ? nowIso : current.lastAcceptedAt,
    lastSuggestedAt: current.lastSuggestedAt ?? nowIso,
    score:
      typeof responseUpdate.matched?.score === "number"
        ? responseUpdate.matched.score
        : current.score,
    status: adopted ? "ADOTADO" : current.status,
  };

  state.recommendations[resolvedKey] = next;
  state.version = typeof state.version === "number" ? state.version : 1;

  await saveAgentRecommendationState({
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    agentId: existing.agent,
    state,
    lastRunId: existing.id,
  });

  const adoptIdempotencyKey = `${actionType}:${existing.id}:${Date.now()}`;
  const adoptLedgerHash = await recordGovernanceLedger({
    prisma,
    tenantId: authContext.tenantId,
    runId: existing.id,
    actionType,
    idempotencyKey: adoptIdempotencyKey,
  });

  const event = await emitRunEvent({
    prisma,
    runId: existing.id,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    userId: authContext.userId,
    type: actionType,
    payload: {
      key: resolvedKeyRaw,
      tatica,
      adopted,
    },
    criticalHash: adoptLedgerHash ?? undefined,
  });

  return res.status(200).json({
    ok: true,
    updatedResponse: responseUpdate.updated,
    recommendation: {
      key: resolvedKeyRaw,
      adopted,
      status: next.status,
    },
    event: serializeRunEvent(event),
  });
});

runsRouter.post("/runs/:id/recommendations/reject", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING" } });
  }

  const parse = RecommendationRejectSchema.safeParse(req.body ?? {});
  if (!parse.success) {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_PAYLOAD", message: "key or tatica required" },
    });
  }

  const existing = await getRun({
    prisma,
    id: req.params.id,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
  });

  if (!existing) {
    return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "run" } });
  }

  const key = parse.data.key?.trim() ?? null;
  const tatica = parse.data.tatica?.trim() ?? null;
  const reason = parse.data.reason?.trim() ?? null;
  const actionType = "run.recommendation.rejected";

  const responseUpdate = updateRecommendationInResponse({
    response: existing.response,
    key,
    tatica,
    adopted: false,
    status: "REJEITADO",
    feedback: reason ? { explicit: reason, status: "rejeitado" } : { status: "rejeitado" },
  });

  if (responseUpdate.updated) {
    await prisma.run.update({
      where: {
        id: existing.id,
        tenantId: authContext.tenantId,
        workspaceId: authContext.workspaceId,
      },
      data: { response: responseUpdate.response as Prisma.InputJsonValue },
    });
  }

  const nowIso = new Date().toISOString();
  const resolvedKeyRaw =
    key ??
    responseUpdate.matched?.key ??
    responseUpdate.matched?.tatica ??
    tatica ??
    "recomendacao";
  const resolvedKey = normalizeRecommendationKey(resolvedKeyRaw);

  const existingState = await getAgentRecommendationState({
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    agentId: existing.agent,
  });

  const state = existingState?.state ?? { recommendations: {}, version: 1 };
  const current = state.recommendations[resolvedKey] ?? {
    adopted: false,
    accepts: 0,
    rejects: 0,
    lastAcceptedAt: null,
    lastRejectedAt: null,
    lastSuggestedAt: null,
    score: responseUpdate.matched?.score ?? 0,
    status: "PENDENTE",
  };

  const next = {
    ...current,
    adopted: false,
    rejects: current.rejects + 1,
    lastRejectedAt: nowIso,
    lastSuggestedAt: current.lastSuggestedAt ?? nowIso,
    score:
      typeof responseUpdate.matched?.score === "number"
        ? responseUpdate.matched.score
        : current.score,
    status: "REJEITADO" as const,
  };

  state.recommendations[resolvedKey] = next;
  state.version = typeof state.version === "number" ? state.version : 1;

  await saveAgentRecommendationState({
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    agentId: existing.agent,
    state,
    lastRunId: existing.id,
  });

  const rejectIdempotencyKey = `${actionType}:${existing.id}:${Date.now()}`;
  const rejectLedgerHash = await recordGovernanceLedger({
    prisma,
    tenantId: authContext.tenantId,
    runId: existing.id,
    actionType,
    idempotencyKey: rejectIdempotencyKey,
  });

  const event = await emitRunEvent({
    prisma,
    runId: existing.id,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    userId: authContext.userId,
    type: actionType,
    payload: {
      key: resolvedKeyRaw,
      tatica,
      reason,
    },
    criticalHash: rejectLedgerHash ?? undefined,
  });

  return res.status(200).json({
    ok: true,
    updatedResponse: responseUpdate.updated,
    recommendation: {
      key: resolvedKeyRaw,
      adopted: false,
      status: next.status,
    },
    event: serializeRunEvent(event),
  });
});

runsRouter.post("/runs/:id/feedback", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING" } });
  }

  const parse = RunFeedbackSchema.safeParse(req.body ?? {});
  if (!parse.success) {
    return res.status(400).json({ ok: false, error: { code: "INVALID_PAYLOAD" } });
  }

  const existing = await getRun({
    prisma,
    id: req.params.id,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
  });

  if (!existing) {
    return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "run" } });
  }

  const rating = parse.data.rating;
  const tags = parse.data.tags ?? [];
  const actionType = "run.feedback.submitted";
  const nowIso = new Date().toISOString();

  const responseText = typeof existing.response === "string" ? existing.response : JSON.stringify(existing.response ?? "");
  let parsed: any = null;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    parsed = null;
  }

  const recommendations = Array.isArray(parsed?.recomendacoes) ? parsed.recomendacoes : [];

  const existingState = await getAgentRecommendationState({
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    agentId: existing.agent,
  });
  const state = existingState?.state ?? { recommendations: {}, version: 1 };

  recommendations.forEach((item: Record<string, unknown>) => {
    const recKey = normalizeRecommendationKey(String(item.key ?? item.tatica ?? "recomendacao"));
    const current = state.recommendations[recKey] ?? {
      adopted: false,
      accepts: 0,
      rejects: 0,
      lastAcceptedAt: null,
      lastRejectedAt: null,
      lastSuggestedAt: null,
      score: typeof item.score === "number" ? item.score : 0.5,
      status: "PENDENTE",
    };

    if (rating >= 4) {
      current.accepts += 1;
      current.lastAcceptedAt = nowIso;
    } else if (rating <= 2) {
      current.rejects += 1;
      current.lastRejectedAt = nowIso;
      current.status = "REJEITADO";
    }

    state.recommendations[recKey] = current;
  });

  state.version = typeof state.version === "number" ? state.version : 1;
  await saveAgentRecommendationState({
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    agentId: existing.agent,
    state,
    lastRunId: existing.id,
  });

  const feedbackIdempotencyKey = `${actionType}:${existing.id}:${Date.now()}`;
  const feedbackLedgerHash = await recordGovernanceLedger({
    prisma,
    tenantId: authContext.tenantId,
    runId: existing.id,
    actionType,
    idempotencyKey: feedbackIdempotencyKey,
  });

  const event = await emitRunEvent({
    prisma,
    runId: existing.id,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    userId: authContext.userId,
    type: actionType,
    payload: { rating, tags },
    criticalHash: feedbackLedgerHash ?? undefined,
  });

  return res.status(200).json({ ok: true, event: serializeRunEvent(event) });
});

runsRouter.get("/governance/report", requirePermission("reports.view"), async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING" } });
  }

  const limit = Math.min(Number(req.query.limit ?? 200), 500);
  const types = ["run.approved", "run.recommendation.adopted", "conversation.finalized"];

  const events = await prisma.runEvent.findMany({
    where: {
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      type: { in: types },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      run: { select: { agent: true } },
    },
  });

  const items = events.map((event) => {
    const payload = (event.payload ?? {}) as Record<string, unknown>;
    return {
      id: event.id,
      runId: event.runId,
      agent: event.run?.agent ?? null,
      type: event.type,
      createdAt: event.createdAt,
      ledgerHash: event.criticalHash ?? null,
      payload: {
        key: typeof payload.key === "string" ? payload.key : null,
        tatica: typeof payload.tatica === "string" ? payload.tatica : null,
        adopted: typeof payload.adopted === "boolean" ? payload.adopted : null,
        approvedBy: typeof payload.approvedBy === "string" ? payload.approvedBy : null,
        approvedAt: typeof payload.approvedAt === "string" ? payload.approvedAt : null,
        document: typeof payload.document === "string" ? payload.document : null,
        runIds: Array.isArray(payload.runIds) ? payload.runIds : null,
      },
    };
  });

  return res.json({ ok: true, items });
});

runsRouter.post("/runs/:id/conversation/finalize", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING" } });
  }

  const parse = ConversationFinalizeSchema.safeParse(req.body ?? {});
  if (!parse.success) {
    return res.status(400).json({ ok: false, error: { code: "INVALID_PAYLOAD" } });
  }

  const existing = await getRun({
    prisma,
    id: req.params.id,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
  });

  if (!existing) {
    return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "run" } });
  }

  const actionType = "conversation.finalized";
  const idempotencyKey = `${actionType}:${existing.id}:${Date.now()}`;
  const ledgerHash = await recordGovernanceLedger({
    prisma,
    tenantId: authContext.tenantId,
    runId: existing.id,
    actionType,
    idempotencyKey,
  });

  const event = await emitRunEvent({
    prisma,
    runId: existing.id,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    userId: authContext.userId,
    type: actionType,
    payload: {
      document: parse.data.document,
      runIds: parse.data.runIds ?? [existing.id],
      policySnapshot: parse.data.policySnapshot ?? null,
    },
    criticalHash: ledgerHash ?? undefined,
  });

  return res.status(200).json({ ok: true, event: serializeRunEvent(event) });
});


runsRouter.post("/runs/:id/replay", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING" } });
  }
  const replayParse = ReplayRunSchema.safeParse(req.body ?? {});
  if (!replayParse.success) {
    return res.status(400).json({ ok: false, error: { code: "INVALID_PAYLOAD", message: "replay" } });
  }
  const replayInput = replayParse.data ?? {};

  const existing = await getRun({
    prisma,
    id: req.params.id,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
  });

  if (!existing) {
    return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "run" } });
  }
  const existingTxId = existing.txId ?? existing.sclTxId ?? null;
  const replayDecision = resolveReplayTxPolicy({
    requestedPolicy: replayInput.txPolicy,
    existingTxId,
    allowNewTxReplay: parseBoolEnv(process.env.REPLAY_ALLOW_NEW_TX, false),
  });

  if (replayDecision.action === "noop") {
    return res.status(200).json({
      ok: true,
      replayed: false,
      idempotent: true,
      reason: "tx_already_bound",
      txPolicy: replayDecision.txPolicy,
      txId: replayDecision.existingTxId,
      data: serializeRun(existing),
    });
  }
  if (replayDecision.action === "deny") {
    return res.status(409).json({
      ok: false,
      error: {
        code: "REPLAY_NEW_TX_DISABLED",
        message: "Replay with new tx is disabled. Set REPLAY_ALLOW_NEW_TX=true to enable.",
      },
      txPolicy: replayDecision.txPolicy,
      txId: replayDecision.existingTxId,
    });
  }

  await emitRunEvent({
    prisma,
    runId: existing.id,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    userId: authContext.userId,
    type: "run.replay.requested",
    payload: {
      agent: existing.agent,
      txPolicy: replayDecision.txPolicy,
      txId: replayDecision.existingTxId,
      reason: replayInput.reason ?? null,
    },
  });

  const requestMetadata =
    typeof existing.request === "object" && existing.request !== null
      ? ((existing.request as Record<string, unknown>).metadata as Record<string, unknown> | undefined)
      : undefined;
  const replayMetadata = {
    ...(requestMetadata ?? {}),
    runMode: existing.runMode ?? "LIVE",
    replay: {
      sourceRunId: existing.id,
      requestedAt: new Date().toISOString(),
      txPolicy: replayDecision.txPolicy,
      reason: replayInput.reason ?? null,
    },
  };

  await publishRun({
    runId: existing.id,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    userId: authContext.userId,
    runMode: existing.runMode ?? "LIVE",
    agent: existing.agent,
    prompt: typeof existing.request === "object" && existing.request !== null && "prompt" in (existing.request as Record<string, unknown>)
      ? String((existing.request as Record<string, unknown>).prompt ?? "")
      : "",
    metadata: replayMetadata,
  });

  await prisma.run.update({
    where: {
      id: existing.id,
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
    },
    data: { status: "pending", updatedAt: new Date() },
  });

  await emitRunEvent({
    prisma,
    runId: existing.id,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    userId: authContext.userId,
    type: "run.replay.enqueued",
    payload: {
      txPolicy: replayDecision.txPolicy,
      txId: replayDecision.existingTxId,
    },
  });

  return res.json({
    ok: true,
    data: serializeRun({ ...existing, status: "pending" }),
    replayed: true,
    txPolicy: replayDecision.txPolicy,
  });
});
