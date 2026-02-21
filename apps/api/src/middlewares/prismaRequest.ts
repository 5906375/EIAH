import type { PrismaClient } from "@repo/db/client";
import type { TenantAwareRequest } from "./enforceTenant";

export function getPrismaFromReq(req: TenantAwareRequest): PrismaClient {
  if (!req.prisma) {
    throw new Error("PRISMA_CONTEXT_MISSING");
  }
  return req.prisma as PrismaClient;
}

export function requirePrisma(prisma?: PrismaClient): PrismaClient {
  if (!prisma) {
    throw new Error("PRISMA_CONTEXT_MISSING");
  }
  return prisma;
}
