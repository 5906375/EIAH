import { PrismaClient } from "./generated/client/index.js";
import { tenantGuard } from "./middleware/tenantGuard.js";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const { Pool } = pg;
const globalRef = globalThis as unknown as { __globalPrisma?: PrismaClient };

let sharedPgPool: pg.Pool | undefined;
let sharedPgAdapter: PrismaPg | undefined;
const activeTenantClients = new Set<PrismaClient>();

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
  return () => {
    if (!sharedPgPool) {
      sharedPgPool = new Pool({ connectionString: getDatabaseUrl() });
      sharedPgPool.setMaxListeners(0);
    }
    return sharedPgPool;
  };
})();

const sharedAdapter = (() => {
  return () => {
    if (!sharedPgAdapter) {
      sharedPgAdapter = new PrismaPg(sharedPool());
    }
    return sharedPgAdapter;
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
  if (!globalRef.__globalPrisma) {
    globalRef.__globalPrisma = new PrismaClient({
      log: ["warn", "error"],
      adapter: sharedAdapter(),
    });
  }

  return globalRef.__globalPrisma;
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
  activeTenantClients.add(prisma);

  // ✅ Prisma 7+: Client Extensions substituem middlewares $use
  // `tenantGuard` deve exportar um objeto compatível com $extends()
  return prisma.$extends(tenantGuard(tenantId, workspaceId));
}

export async function closePrismaResources() {
  if (activeTenantClients.size > 0) {
    const clients = Array.from(activeTenantClients);
    activeTenantClients.clear();
    await Promise.allSettled(clients.map((client) => client.$disconnect()));
  }

  if (globalRef.__globalPrisma) {
    await globalRef.__globalPrisma.$disconnect();
    delete globalRef.__globalPrisma;
  }

  if (sharedPgPool) {
    await sharedPgPool.end();
    sharedPgPool = undefined;
  }

  sharedPgAdapter = undefined;
}

// Reexporta a classe original, caso seja necessária externamente
export { PrismaClient };
