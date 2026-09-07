import { PrismaClient, Prisma } from "./generated/client/index.js";
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

// Cliente aceito por funções que podem participar de uma transação interativa
// (prisma.$transaction(async (tx) => ...)). `Prisma.TransactionClient` omite
// apenas $connect/$disconnect/$on/$transaction/$use/$extends — todos os
// delegates de modelo (.run, .workspaceAgentAssignment, etc.) permanecem
// estruturalmente idênticos a PrismaClient. Não introduz fallback: quem
// aceita este tipo deve continuar exigindo um client explícito ou o global,
// exatamente como antes.
export type TransactableClient = PrismaClient | Prisma.TransactionClient;
