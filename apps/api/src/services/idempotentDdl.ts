/**
 * DDL idempotente (`CREATE ... IF NOT EXISTS`) que pode rodar ao mesmo tempo em vários processos
 * (réplicas da API, workers, suítes de teste em paralelo num banco novo). O Postgres não serializa
 * `IF NOT EXISTS`: quando dois processos criam o mesmo objeto juntos, um deles recebe
 * 23505 (pg_class/pg_type), 42P07 (relação já existe) ou 42710 (objeto já existe). Nesse caso o outro
 * processo já criou o objeto; repetir o comando confirma (agora o `IF NOT EXISTS` passa).
 */
import { setTimeout as delay } from "node:timers/promises";

const CONCURRENT_DDL_CODES = new Set(["23505", "42P07", "42710"]);

export function isConcurrentDdlRace(error: unknown) {
  const maybe = error as { code?: string; meta?: { code?: string }; message?: string } | null;
  const code = maybe?.meta?.code ?? (typeof maybe?.code === "string" && /^[0-9A-Z]{5}$/.test(maybe.code) ? maybe.code : undefined);
  if (code && CONCURRENT_DDL_CODES.has(code)) return true;
  const match = /Code: `([0-9A-Z]{5})`/.exec(String(maybe?.message ?? ""));
  return Boolean(match && CONCURRENT_DDL_CODES.has(match[1]!));
}

// `any` como nos demais `ensure*Store`: recebe o Prisma global, o do tenant ou um client de transação.
export async function runIdempotentDdl(prisma: any, sql: string) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await prisma.$executeRawUnsafe(sql);
      return;
    } catch (error) {
      if (attempt >= 2 || !isConcurrentDdlRace(error)) throw error;
      await delay(50 * (attempt + 1));
    }
  }
}
