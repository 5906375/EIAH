import { PrismaClient } from "./generated/client";
import { getPrismaForTenant, prismaGlobal } from "./client";

/**
 * Ponto de entrada oficial do pacote @repo/db.
 *
 * Reexporta:
 * - PrismaClient (instância global segura)
 * - Prisma namespace e enums
 * - tenantGuard (middleware multi-tenant)
 * - Helpers multi-tenant (getPrismaForTenant) e alias prisma
 */

// Alias para manter compatibilidade com consumidores que importam `prisma`
export const prisma = prismaGlobal;

// 🔹 Exports principais
export { Prisma, RunStatus, RunMode } from "./generated/client";
export * from "./middleware/tenantGuard";
export { PrismaClient };
export { prismaGlobal, getPrismaForTenant };
