import { PrismaClient } from "./generated/client/index.js";
import { closePrismaResources, getPrismaForTenant, prismaGlobal } from "./client.js";

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
export { Prisma, RunStatus } from "./generated/client/index.js";
export * from "./middleware/tenantGuard.js";
export { PrismaClient };
export { closePrismaResources, prismaGlobal, getPrismaForTenant };
