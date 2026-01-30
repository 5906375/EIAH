import { PrismaClient } from "./generated/client";
import { tenantGuard } from "./middleware/tenantGuard";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const { Pool } = pg;

function getDatabaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL não definido (necessário para inicializar PrismaPg/pg Pool)."
    );
  }
  return url;
}

const sharedPool = (() => {
  let pool: pg.Pool | undefined;
  return () => {
    if (!pool) {
      pool = new Pool({ connectionString: getDatabaseUrl() });
    }
    return pool;
  };
})();

const sharedAdapter = (() => {
  let adapter: PrismaPg | undefined;
  return () => {
    if (!adapter) {
      adapter = new PrismaPg(sharedPool());
    }
    return adapter;
  };
})();

/**
 * Client global — somente para tabelas NÃO tenantizadas.
 *
 * Ex:
 * - ActionRegistry versionado
 * - Migrations
 * - SystemConfig
 * - FeatureFlags
 */
const globalSingleton = (() => {
  const g = globalThis as unknown as { __globalPrisma?: PrismaClient };

  if (!g.__globalPrisma) {
    g.__globalPrisma = new PrismaClient({
      log: ["warn", "error"],
      adapter: sharedAdapter(),
    });
  }

  return g.__globalPrisma;
})();

export const prismaGlobal = globalSingleton;

/**
 * Cria um PrismaClient isolado por tenant/workspace.
 *
 * Cada request/worker deve chamar esta função.
 * Nunca compartilhe este client.
 */
export function getPrismaForTenant(tenantId: string, workspaceId: string) {
  if (!tenantId || !workspaceId) {
    throw new Error(
      `getPrismaForTenant chamado sem tenantId/workspaceId válidos: tenantId=${tenantId}, workspaceId=${workspaceId}`
    );
  }

  const prisma = new PrismaClient({
    log: ["warn", "error"],
    adapter: sharedAdapter(),
  });

  // ✅ Prisma 7+: Client Extensions substituem middlewares $use
  // `tenantGuard` deve exportar um objeto compatível com $extends()
  return prisma.$extends(tenantGuard(tenantId, workspaceId));
}

// Reexporta a classe original, caso seja necessária externamente
export { PrismaClient };
