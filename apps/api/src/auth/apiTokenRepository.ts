import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export type AuthTokenContext = {
  tenantId: string;
  workspaceId: string;
  userId?: string;
  tokenId: string;
  expiresAt?: Date | null;
  revoked: boolean;
};

export async function findApiToken(token: string): Promise<AuthTokenContext | null> {
  const record = await prisma.apiToken.findUnique({
    where: { token },
    select: {
      id: true,
      token: true,
      tenantId: true,
      workspaceId: true,
      userId: true,
      expiresAt: true,
      revoked: true,
    },
  });

  if (!record) {
    return null;
  }

  return {
    tokenId: record.id,
    tenantId: record.tenantId,
    workspaceId: record.workspaceId,
    userId: record.userId ?? undefined,
    expiresAt: record.expiresAt,
    revoked: record.revoked,
  };
}
