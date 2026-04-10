import { Prisma, PrismaClient, RunStatus, prismaGlobal } from "@repo/db";
import { randomUUID } from "node:crypto";
import { assertWorkspaceAgentEnabled } from "./workspaceAgentAssignments";

function resolveClient(tenantId: string, workspaceId: string, client?: PrismaClient) {
  return client ?? prismaGlobal;
}

async function assertRunScope(
  client: PrismaClient,
  params: { runId: string; tenantId: string; workspaceId: string }
) {
  const run = await client.run.findFirst({
    where: {
      id: params.runId,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
    },
    select: { id: true },
  });
  return run?.id ?? null;
}

function toJsonData(input: unknown) {
  if (input === undefined) return Prisma.DbNull;
  if (input === null) return Prisma.JsonNull;
  return input as Prisma.InputJsonValue;
}

function asRecord(input: unknown): Record<string, unknown> | null {
  return input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : null;
}

function asNonEmptyString(input: unknown): string | null {
  return typeof input === "string" && input.trim().length > 0 ? input.trim() : null;
}

function extractRunContextFromRequest(request: unknown) {
  const root = asRecord(request);
  const metadata = asRecord(root?.metadata);
  const executionInput = asRecord(metadata?.executionInput);
  const nestedInput = asRecord(root?.input);
  return {
    caseId:
      asNonEmptyString(root?.caseId) ??
      asNonEmptyString(nestedInput?.caseId) ??
      asNonEmptyString(metadata?.caseId) ??
      asNonEmptyString(executionInput?.caseId) ??
      null,
    threadId:
      asNonEmptyString(root?.threadId) ??
      asNonEmptyString(nestedInput?.threadId) ??
      asNonEmptyString(metadata?.threadId) ??
      asNonEmptyString(executionInput?.threadId) ??
      null,
  };
}

function ensureTraceId(traceId?: string | null) {
  const normalized = traceId?.trim();
  return normalized ? normalized : randomUUID();
}

export async function deriveRunCostFromBreakdown(params: {
  prisma?: PrismaClient;
  runId: string;
  tenantId: string;
  workspaceId: string;
}) {
  const client = resolveClient(params.tenantId, params.workspaceId, params.prisma);
  const aggregate = await client.runUsageBreakdown.aggregate({
    where: {
      runId: params.runId,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
    },
    _sum: {
      amountCents: true,
    },
  });
  return aggregate._sum.amountCents ?? 0;
}

export async function listRuns(opts: {
  prisma?: PrismaClient;
  tenantId: string;
  workspaceId: string;
  agent?: string;
  status?: RunStatus;
  from?: Date;
  to?: Date;
  page: number;
  size: number;
}) {
  const client = resolveClient(opts.tenantId, opts.workspaceId, opts.prisma);
  const where: Prisma.RunWhereInput = {
    tenantId: opts.tenantId,
    workspaceId: opts.workspaceId,
  };

  if (opts.agent) where.agent = opts.agent;
  if (opts.status) where.status = opts.status;
  if (opts.from || opts.to) {
    where.createdAt = {
      ...(opts.from ? { gte: opts.from } : {}),
      ...(opts.to ? { lte: opts.to } : {}),
    };
  }

  const [items, total] = await Promise.all([
    client.run.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (opts.page - 1) * opts.size,
      take: opts.size,
    }),
    client.run.count({ where }),
  ]);

  return { items, total };
}

export async function getRun(params: {
  prisma?: PrismaClient;
  id: string;
  tenantId: string;
  workspaceId: string;
}) {
  const client = resolveClient(params.tenantId, params.workspaceId, params.prisma);
  return client.run.findFirst({
    where: {
      id: params.id,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
    },
  });
}

export async function createRunRecord(params: {
  prisma?: PrismaClient;
  tenantId: string;
  workspaceId: string;
  userId?: string;
  agent: string;
  status: RunStatus;
  request: unknown;
  response?: unknown;
  traceId?: string | null;
  tookMs?: number;
  errorCode?: string | null;
  startedAt?: Date;
  finishedAt?: Date | null;
  approvalStatus?: "not_required" | "pending" | "approved" | "rejected";
  approvedBy?: string | null;
  approvedAt?: Date | null;
}) {
  const client = resolveClient(params.tenantId, params.workspaceId, params.prisma);
  const now = new Date();
  const assignment = await assertWorkspaceAgentEnabled({
    prisma: client,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    agentKey: params.agent,
    userId: params.userId,
  });

  const startedAt = params.startedAt ?? now;
  const finishedAt =
    params.finishedAt === undefined
      ? params.status === "success" || params.status === "error"
        ? now
        : null
      : params.finishedAt;

  const requestData = params.request as Prisma.InputJsonValue;
  const responseData = toJsonData(params.response);
  const runContext = extractRunContextFromRequest(params.request);

  return (client.run as any).create({
    data: {
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      userId: params.userId ?? null,
      caseId: runContext.caseId,
      threadId: runContext.threadId,
      agent: params.agent,
      agentVersion: assignment.agentVersion,
      assignmentId: assignment.id,
      status: params.status,
      request: requestData,
      response: responseData,
      costCents: 0,
      traceId: ensureTraceId(params.traceId),
      startedAt,
      finishedAt,
      errorCode: params.errorCode ?? null,
      approvalStatus: params.approvalStatus ?? "not_required",
      approvedBy: params.approvedBy ?? null,
      approvedAt: params.approvedAt ?? null,
    },
  });
}

export async function finalizeRunRecord(params: {
  prisma?: PrismaClient;
  runId: string;
  tenantId: string;
  workspaceId: string;
  status: RunStatus;
  response?: unknown;
  traceId?: string | null;
  errorCode?: string | null;
  txId?: string | null;
  criticalHash?: string | null;
  sclTxId?: string | null;
}) {
  const client = resolveClient(params.tenantId, params.workspaceId, params.prisma);
  const responseData = toJsonData(params.response);

  const scopedRunId = await assertRunScope(client, {
    runId: params.runId,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
  });
  if (!scopedRunId) {
    return null;
  }

  const derivedCostCents = await deriveRunCostFromBreakdown({
    prisma: client,
    runId: scopedRunId,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
  });

  return client.run.update({
    where: { id: scopedRunId },
    data: {
      status: params.status,
      response: responseData,
      costCents: derivedCostCents,
      traceId: ensureTraceId(params.traceId),
      finishedAt: new Date(),
      errorCode: params.errorCode ?? null,
      ...(params.txId !== undefined ? { txId: params.txId } : {}),
      ...(params.criticalHash !== undefined ? { criticalHash: params.criticalHash } : {}),
      ...(params.sclTxId !== undefined ? { sclTxId: params.sclTxId } : {}),
    },
  });
}

export async function updateRunStatus(params: {
  prisma?: PrismaClient;
  runId: string;
  tenantId: string;
  workspaceId: string;
  status: RunStatus;
  startedAt?: Date | null;
  traceId?: string | null;
}) {
  const client = resolveClient(params.tenantId, params.workspaceId, params.prisma);
  const data: Prisma.RunUpdateInput = {
    status: params.status,
  };

  if (params.startedAt instanceof Date) {
    data.startedAt = params.startedAt;
  }

  if (params.traceId !== undefined) {
    data.traceId = params.traceId;
  }

  if (params.status === "pending" || params.status === "running") {
    data.finishedAt = null;
    data.errorCode = null;
  }

  const scopedRunId = await assertRunScope(client, {
    runId: params.runId,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
  });
  if (!scopedRunId) {
    return null;
  }

  return client.run.update({
    where: { id: scopedRunId },
    data,
  });
}

export async function listRecentRunsForAgent(params: {
  prisma?: PrismaClient;
  tenantId: string;
  workspaceId: string;
  agent: string;
  limit: number;
}) {
  const client = resolveClient(params.tenantId, params.workspaceId, params.prisma);
  return client.run.findMany({
    where: {
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      agent: params.agent,
      status: "success",
    },
    orderBy: { createdAt: "desc" },
    take: params.limit,
    select: {
      id: true,
      createdAt: true,
      response: true,
    },
  });
}
