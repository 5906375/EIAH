import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

export async function recordRunEvent(params: {
  runId: string;
  tenantId: string;
  workspaceId: string;
  userId?: string;
  type: string;
  payload?: unknown;
}) {
  const payloadValue =
    params.payload === undefined
      ? Prisma.DbNull
      : params.payload === null
      ? Prisma.JsonNull
      : (params.payload as Prisma.InputJsonValue);

  return prisma.runEvent.create({
    data: {
      runId: params.runId,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      userId: params.userId ?? null,
      type: params.type,
      payload: payloadValue,
    },
  });
}

export async function listRunEvents(params: {
  runId: string;
  tenantId: string;
  workspaceId: string;
}) {
  return prisma.runEvent.findMany({
    where: {
      runId: params.runId,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
    },
    orderBy: { createdAt: "asc" },
  });
}
