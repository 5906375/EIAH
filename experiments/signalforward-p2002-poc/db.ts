// Fábrica de PrismaClient do harness — reproduz o padrão real de
// packages/db/src/client.ts (new Pool -> new PrismaPg(pool) -> new PrismaClient({adapter})),
// mas apontando exclusivamente para o Postgres descartável do experimento.
import { PrismaClient } from "./prisma/generated/client/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const { Pool } = pg;

function getPocDatabaseUrl() {
  const url = process.env.POC_DATABASE_URL;
  if (!url) throw new Error("POC_DATABASE_URL não definido (harness experimental)");
  return url;
}

let pool: pg.Pool | undefined;
let client: PrismaClient | undefined;

export function getPocPrismaClient(): PrismaClient {
  if (!client) {
    pool = new Pool({ connectionString: getPocDatabaseUrl() });
    const adapter = new PrismaPg(pool);
    client = new PrismaClient({ adapter });
  }
  return client;
}

export async function closePocPrismaClient() {
  if (client) {
    await client.$disconnect();
    client = undefined;
  }
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
