import { Prisma, RunMode, RunStatus, getPrismaForTenant } from "@repo/db";
import type { PrismaClient } from "@repo/db/client";

function resolveClient(tenantId: string, workspaceId: string, client?: PrismaClient) {
  return client ?? (getPrismaForTenant(tenantId, workspaceId) as PrismaClient);
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
  runMode?: RunMode;
  status: RunStatus;
  request: unknown;
  response?: unknown;
  estimatedCostCents?: number | null;
  finalCostCents?: number | null;
  costCents?: number;
  charged?: boolean | null;
  chargeReason?: string | null;
  chargeAttemptedAt?: Date | null;
  traceId?: string | null;
  tookMs?: number;
  errorCode?: string | null;
  startedAt?: Date;
  finishedAt?: Date | null;
}) {
  const client = resolveClient(params.tenantId, params.workspaceId, params.prisma);
  const now = new Date();

  const startedAt = params.startedAt ?? now;
  const finishedAt =
    params.finishedAt === undefined
      ? params.status === "success" || params.status === "error"
        ? now
        : null
      : params.finishedAt;

  const requestData = params.request as Prisma.InputJsonValue;
  const responseData =
    params.response === undefined
      ? Prisma.DbNull
      : params.response === null
      ? Prisma.JsonNull
      : (params.response as Prisma.InputJsonValue);

  return client.run.create({
    data: {
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      userId: params.userId ?? null,
      agent: params.agent,
      runMode: params.runMode ?? "LIVE",
      status: params.status,
      request: requestData,
      response: responseData,
      estimatedCostCents: params.estimatedCostCents ?? null,
      finalCostCents: params.finalCostCents ?? null,
      costCents: params.costCents ?? 0,
      charged: params.charged ?? null,
      chargeReason: params.chargeReason ?? null,
      chargeAttemptedAt: params.chargeAttemptedAt ?? null,
      traceId: params.traceId ?? null,
      startedAt,
      finishedAt,
      errorCode: params.errorCode ?? null,
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
  estimatedCostCents?: number | null;
  finalCostCents?: number | null;
  costCents?: number;
  charged?: boolean | null;
  chargeReason?: string | null;
  chargeAttemptedAt?: Date | null;
  traceId?: string | null;
  errorCode?: string | null;
}) {
  const client = resolveClient(params.tenantId, params.workspaceId, params.prisma);
  const responseData =
    params.response === undefined
      ? Prisma.DbNull
      : params.response === null
      ? Prisma.JsonNull
      : (params.response as Prisma.InputJsonValue);

  const scopedRunId = await assertRunScope(client, {
    runId: params.runId,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
  });
  if (!scopedRunId) {
    return null;
  }

  return client.run.update({
    where: {
      id: scopedRunId,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
    },
    data: {
      status: params.status,
      response: responseData,
      estimatedCostCents: params.estimatedCostCents ?? null,
      finalCostCents: params.finalCostCents ?? null,
      costCents: params.costCents ?? 0,
      charged: params.charged ?? null,
      chargeReason: params.chargeReason ?? null,
      chargeAttemptedAt: params.chargeAttemptedAt ?? null,
      traceId: params.traceId ?? null,
      finishedAt: new Date(),
      errorCode: params.errorCode ?? null,
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
    where: {
      id: scopedRunId,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
    },
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
