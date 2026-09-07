import { PrismaClient } from "../prisma/generated/client/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const { Pool } = pg;

function baseUrl() {
  const url = process.env.POC_DATABASE_URL;
  if (!url) throw new Error("POC_DATABASE_URL não definido (harness experimental)");
  return url;
}

// Cria uma conexão/PrismaClient DEDICADA com application_name distinto, para
// permitir observar cada conexão isoladamente via pg_stat_activity/pg_locks.
export function createNamedClient(applicationName: string) {
  const url = new URL(baseUrl());
  url.searchParams.set("application_name", applicationName);
  const pool = new Pool({ connectionString: url.toString() });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  return {
    prisma,
    pool,
    async close() {
      await prisma.$disconnect();
      await pool.end();
    },
  };
}

export async function waitFor(
  check: () => Promise<boolean>,
  opts: { timeoutMs: number; intervalMs: number; label: string }
): Promise<void> {
  const deadline = Date.now() + opts.timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, opts.intervalMs));
  }
  throw new Error(`waitFor timeout: ${opts.label}`);
}

// Observa, via uma conexão de terceiros, o estado real de uma conexão nomeada.
export async function observeConnectionState(
  observerPool: pg.Pool,
  applicationName: string
): Promise<{ state: string | null; waitEventType: string | null; count: number }> {
  const res = await observerPool.query(
    `select state, wait_event_type from pg_stat_activity where application_name = $1`,
    [applicationName]
  );
  if (res.rows.length === 0) return { state: null, waitEventType: null, count: 0 };
  const row = res.rows[0];
  return { state: row.state, waitEventType: row.wait_event_type, count: res.rows.length };
}

// Escopado por tenantId deliberadamente: os arquivos de teste rodam como
// processos/módulos distintos e o test runner do Node pode executá-los em
// paralelo. Um deleteMany({}) global (sem filtro) apagaria linhas de OUTRO
// teste em andamento (achado real desta prova, não hipotético — a primeira
// execução da suíte completa falhou exatamente por isso). Cada teste usa um
// tenantId próprio, então o escopo por tenantId garante isolamento real
// independente da ordem/concorrência de execução dos arquivos.
export async function resetFixturesForTenant(prisma: PrismaClient, tenantId: string) {
  await prisma.signalForwardRequest.deleteMany({ where: { tenantId } });
  await prisma.runFixture.deleteMany({ where: { tenantId } });
  await prisma.otherUniqueFixture.deleteMany({ where: { tenantId } });
}
