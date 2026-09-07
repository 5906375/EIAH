import { PrismaClient, RunStatus } from "@repo/db";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { randomUUID } from "node:crypto";

const { Pool } = pg;

function baseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definido (etapa de adaptação real — banco descartável)");
  return url;
}

// Conexão dedicada com application_name distinto, para observar cada conexão
// isoladamente via pg_stat_activity (mesma técnica usada na prova experimental).
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

export async function observeConnectionState(
  observerPool: pg.Pool,
  applicationName: string
): Promise<{ state: string | null; waitEventType: string | null }> {
  const res = await observerPool.query(
    `select state, wait_event_type from pg_stat_activity where application_name = $1`,
    [applicationName]
  );
  if (res.rows.length === 0) return { state: null, waitEventType: null };
  return { state: res.rows[0].state, waitEventType: res.rows[0].wait_event_type };
}

// Cria um cenário REAL mínimo: Tenant, Workspace, User, AgentMetadata("mkt"),
// WorkspaceAgentAssignment("mkt", enabled) e um Run de origem (simulando um
// run do Radar já concluído). Tudo via tabelas reais do produto, não fixtures.
export async function seedRealScenario(
  prisma: PrismaClient,
  opts: { tenantId: string; workspaceId: string; mktEnabled?: boolean }
) {
  const userId = `${opts.tenantId}-user`;
  await prisma.tenant.upsert({
    where: { id: opts.tenantId },
    create: { id: opts.tenantId, name: opts.tenantId },
    update: {},
  });
  await prisma.workspace.upsert({
    where: { id: opts.workspaceId },
    create: { id: opts.workspaceId, tenantId: opts.tenantId, name: opts.workspaceId },
    update: {},
  });
  await prisma.user.upsert({
    where: { id: userId },
    create: { id: userId, tenantId: opts.tenantId, email: `${userId}@example.test` },
    update: {},
  });
  await prisma.agentMetadata.upsert({
    where: { agent: "mkt" },
    create: { agent: "mkt", displayName: "MKT (teste real)", version: "1.0.0" },
    update: {},
  });
  if (opts.mktEnabled !== false) {
    await prisma.workspaceAgentAssignment.upsert({
      where: {
        workspace_agent_assignment_version_unique: {
          tenantId: opts.tenantId, workspaceId: opts.workspaceId, agentKey: "mkt", agentVersion: "1.0.0",
        },
      },
      create: {
        tenantId: opts.tenantId, workspaceId: opts.workspaceId,
        agentKey: "mkt", agentVersion: "1.0.0", enabled: true,
      },
      update: { enabled: true },
    });
  }

  const sourceRun = await prisma.run.create({
    data: {
      tenantId: opts.tenantId, workspaceId: opts.workspaceId,
      agent: "radar", status: RunStatus.success,
      request: { metadata: { simulatedOrigin: true } },
      response: { signalAnalysis: { summary: "sinal sintético de teste" } },
    },
  });

  return { userId, sourceRunId: sourceRun.id };
}

export async function grantScope(
  prisma: PrismaClient,
  opts: { tenantId: string; workspaceId: string; scope: string }
) {
  await prisma.tenantActionPolicy.create({
    data: { tenantId: opts.tenantId, workspaceId: opts.workspaceId, actionName: opts.scope, allowed: true },
  });
}

export function uniqueScope(tenantId: string) {
  return `runs.execute`; // escopo provisório único por processo — ver aviso em signalForwardingService.ts
}

export function newTenantWorkspace(prefix: string) {
  const suffix = `${prefix}-${randomUUID().slice(0, 8)}`;
  return { tenantId: `t-${suffix}`, workspaceId: `w-${suffix}` };
}
