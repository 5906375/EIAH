import { PrismaClient, RunStatus, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

export async function listRuns(opts: {
  tenantId: string;
  workspaceId: string;
  agent?: string;
  status?: RunStatus;
  from?: Date;
  to?: Date;
  page: number;
  size: number;
}) {
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
    prisma.run.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (opts.page - 1) * opts.size,
      take: opts.size,
    }),
    prisma.run.count({ where }),
  ]);

  return { items, total };
}

export async function getRun(params: { id: string; tenantId: string; workspaceId: string }) {
  return prisma.run.findFirst({
    where: {
      id: params.id,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
    },
  });
}

export async function createRunRecord(params: {
  tenantId: string;
  workspaceId: string;
  userId?: string;
  agent: string;
  status: RunStatus;
  request: unknown;
  response?: unknown;
  costCents?: number;
  traceId?: string | null;
  tookMs?: number;
  errorCode?: string | null;
  startedAt?: Date;
  finishedAt?: Date | null;
}) {
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

  return prisma.run.create({
    data: {
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      userId: params.userId ?? null,
      agent: params.agent,
      status: params.status,
      request: requestData,
      response: responseData,
      costCents: params.costCents ?? 0,
      traceId: params.traceId ?? null,
      startedAt,
      finishedAt,
      errorCode: params.errorCode ?? null,
    },
  });
}

export async function finalizeRunRecord(params: {
  runId: string;
  tenantId: string;
  workspaceId: string;
  status: RunStatus;
  response?: unknown;
  costCents?: number;
  traceId?: string | null;
  errorCode?: string | null;
}) {
  const responseData =
    params.response === undefined
      ? Prisma.DbNull
      : params.response === null
      ? Prisma.JsonNull
      : (params.response as Prisma.InputJsonValue);

  return prisma.run.update({
    where: { id: params.runId },
    data: {
      status: params.status,
      response: responseData,
      costCents: params.costCents ?? 0,
      traceId: params.traceId ?? null,
      finishedAt: new Date(),
      errorCode: params.errorCode ?? null,
    },
  });
}

export async function updateRunStatus(params: {
  runId: string;
  tenantId: string;
  workspaceId: string;
  status: RunStatus;
  startedAt?: Date | null;
  traceId?: string | null;
}) {
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

  return prisma.run.update({
    where: { id: params.runId },
    data,
  });
}

export async function listRecentRunsForAgent(params: {
  tenantId: string;
  workspaceId: string;
  agent: string;
  limit: number;
}) {
  return prisma.run.findMany({
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
