import { createRequire } from "node:module";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { prismaGlobal } from "@repo/db";
import type { PrismaClient } from "@repo/db";

import {
  EVALUATION_MANDATORY_DECISIONS,
  EVALUATION_OFFER_CONFIG_ENV,
  EVALUATION_OFFER_FLAG_ENV,
  evaluateEvaluationOffer,
  type EvaluationDeps,
} from "../../services/products/verticalEvaluationContract";

/**
 * Suporte dos testes de integração REAIS da avaliação gratuita (Prisma → PostgreSQL real; conexões independentes do `pg`).
 * Só roda contra banco DESCARTÁVEL: host local, nome `eiah_logistica_core_…` (convenção dos demais testes de integração) E
 * `EIAH_DISPOSABLE_INFRA=1` (definido pelo executor da infraestrutura descartável da tarefa). Nunca usa PGlite nem dublê do banco.
 */
export function assertDisposableDatabase() {
  let url: URL;
  try { url = new URL(process.env.DATABASE_URL ?? "postgresql://unused/unused"); }
  catch { throw new Error("Dedicated disposable database required"); }
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || !url.pathname.startsWith("/eiah_logistica_core_")) {
    throw new Error("Dedicated local eiah_logistica_core_ database required");
  }
  if (process.env.EIAH_DISPOSABLE_INFRA !== "1") {
    throw new Error("EIAH_DISPOSABLE_INFRA=1 required: este teste escreve e cria objetos de banco; use somente a infraestrutura descartável");
  }
}

const repoRoot = path.resolve(import.meta.dirname, "../../../../..");
type PgClient = {
  connect(): Promise<void>;
  end(): Promise<void>;
  query<T = Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: T[]; rowCount: number | null }>;
};
const pgModule = createRequire(path.join(repoRoot, "packages/db/package.json"))("pg") as { Client: new (config: { connectionString: string }) => PgClient };

/** Conexão INDEPENDENTE (fora do pool do Prisma). */
export async function openPgClient(): Promise<PgClient> {
  const client = new pgModule.Client({ connectionString: process.env.DATABASE_URL as string });
  await client.connect();
  return client;
}

// ─── Oferta habilitada SÓ na fixture de teste (a composição de produção continua desligada) ───────────────────────
export const IMOB_ACTIONS = ["realestate.register_property", "realestate.qualify_lead", "realestate.collect_documents"] as const;
export const FIXTURE_CONDITIONS = { version: "cond-it-v1", text: "Condições sintéticas do teste de integração (sem valor comercial)." } as const;
const FIXTURE_ENV = {
  [EVALUATION_OFFER_FLAG_ENV]: "true",
  [EVALUATION_OFFER_CONFIG_ENV]: JSON.stringify({
    vertical: "IMOB",
    maxDurationDays: 30,
    allowedActions: [...IMOB_ACTIONS],
    closureModes: ["somente_leitura", "bloqueio_total"],
    conditions: FIXTURE_CONDITIONS,
  }),
};
/** Decisões ratificadas APENAS aqui (fixture explícita de teste). Nunca é usada pela composição de produção. */
const FIXTURE_DECISIONS = EVALUATION_MANDATORY_DECISIONS.map((decision) => ({ ...decision, status: "ratified" as const }));
export const enabledOfferForTest = () => evaluateEvaluationOffer({ env: FIXTURE_ENV, decisions: FIXTURE_DECISIONS });

export const T0 = new Date("2026-03-10T12:00:00.000Z");
export const DAY = 86_400_000;
/** Relógio controlado: `set` move o tempo; `deps` é a composição de testes (oferta de fixture + relógio). */
export function controlledClock(start: Date = T0) {
  let current = start.getTime();
  const deps: EvaluationDeps = { offer: enabledOfferForTest, clock: () => new Date(current) };
  return { deps, set: (date: Date) => { current = date.getTime(); }, advance: (ms: number) => { current += ms; }, now: () => new Date(current) };
}

// ─── Semeadura ──────────────────────────────────────────────────────────────────────────────────────────────────
export const prisma = prismaGlobal as unknown as PrismaClient;
const run = randomUUID().slice(0, 8);
let sequence = 0;

export type Scope = { tenantId: string; workspaceId: string; requester: string; admin: string; other: string };

/** Tenant, workspace e usuários exclusivos de um cenário (isolamento por cenário; ids sintéticos). */
export async function seedScope(label: string): Promise<Scope> {
  sequence += 1;
  const key = `${label}-${run}-${sequence}`;
  const scope: Scope = { tenantId: `ev-t-${key}`, workspaceId: `ev-w-${key}`, requester: `ev-req-${key}`, admin: `ev-adm-${key}`, other: `ev-oth-${key}` };
  await prismaGlobal.tenant.create({ data: { id: scope.tenantId, name: `Synthetic ${label}` } });
  await prismaGlobal.workspace.create({ data: { id: scope.workspaceId, tenantId: scope.tenantId, name: label } });
  await prismaGlobal.user.createMany({
    data: [scope.requester, scope.admin, scope.other].map((id) => ({ id, tenantId: scope.tenantId, email: `${id}@example.com` })),
  });
  return scope;
}

export type RawRow = {
  id: string; status: string; grant_kind: string | null; grant_terms_hash: string | null; grant_accepted_hash: string | null;
  grant_started_at: string | null; grant_valid_until: string | null; evaluation_used_at: string | null; revocation_mode: string | null;
  grant_closed_reason: string | null; updated_at: string; requested_by_user_id: string | null;
};
/** Linha CRUA (sem leitura efetiva), com os timestamps como texto para comparar o valor armazenado. */
export async function rawApproval(scope: Pick<Scope, "tenantId" | "workspaceId">): Promise<RawRow | null> {
  const rows = await prismaGlobal.$queryRaw<RawRow[]>`
    SELECT id, status, grant_kind, grant_terms_hash, grant_accepted_hash, grant_started_at::text AS grant_started_at,
           grant_valid_until::text AS grant_valid_until, evaluation_used_at::text AS evaluation_used_at, revocation_mode,
           grant_closed_reason, updated_at::text AS updated_at, requested_by_user_id
    FROM vertical_access_approvals WHERE tenant_id = ${scope.tenantId} AND workspace_id = ${scope.workspaceId} AND vertical = 'IMOB'`;
  return rows[0] ?? null;
}

/** `timestamp` sem fuso em texto ("2026-03-17 15:00:00.5") → ISO UTC. */
export const pgTsToIso = (text: string | null) => (text ? new Date(`${text.replace(" ", "T")}Z`).toISOString() : null);

export async function eventsOf(approvalId: string) {
  return prismaGlobal.$queryRaw<Array<{ from_status: string | null; to_status: string; actor: string; detail: Record<string, unknown> | null }>>`
    SELECT from_status, to_status, actor, detail FROM vertical_access_approval_events WHERE approval_id = ${approvalId} ORDER BY created_at`;
}
export async function noticeCount(approvalId: string, kind: string) {
  const rows = await prismaGlobal.$queryRaw<Array<{ n: number }>>`SELECT count(*)::int AS n FROM vertical_access_notices WHERE approval_id = ${approvalId} AND kind = ${kind}`;
  return rows[0]?.n ?? 0;
}
export async function installationOf(scope: Pick<Scope, "tenantId" | "workspaceId">) {
  return prismaGlobal.$queryRaw<Array<{ status: string; activated_at: string }>>`
    SELECT status, activated_at::text AS activated_at FROM tenant_product_installations
    WHERE tenant_id = ${scope.tenantId} AND workspace_id = ${scope.workspaceId} AND product = 'IMOB'`;
}
export async function policyActionsOf(scope: Pick<Scope, "tenantId" | "workspaceId">) {
  const rows = await prismaGlobal.tenantActionPolicy.findMany({ where: { tenantId: scope.tenantId, workspaceId: scope.workspaceId }, select: { actionName: true, allowed: true }, orderBy: { actionName: "asc" } });
  return rows;
}

// ─── Sincronização determinística (sem sleeps como prova) ────────────────────────────────────────────────────────
/**
 * Segura o `FOR UPDATE` da linha numa transação de uma conexão INDEPENDENTE. Quem tentar travar a linha espera até
 * `release()`. `mutate` roda DENTRO da transação do segurador (antes do commit), para simular outra transação concorrente.
 */
export async function holdRowLock(approvalId: string) {
  const client = await openPgClient();
  await client.query("BEGIN");
  await client.query("SELECT id FROM vertical_access_approvals WHERE id = $1 FOR UPDATE", [approvalId]);
  return {
    client,
    async release(how: "commit" | "rollback" = "rollback") {
      await client.query(how === "commit" ? "COMMIT" : "ROLLBACK");
      await client.end();
    },
  };
}

/** Espera (poll em condição do servidor, com limite) até haver `count` sessões bloqueadas em lock na tabela de aprovações. */
export async function waitUntilBlocked(count: number, timeoutMs = 20_000) {
  const monitor = await openPgClient();
  const deadline = Date.now() + timeoutMs;
  try {
    for (;;) {
      const { rows } = await monitor.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM pg_stat_activity
         WHERE datname = current_database() AND pid <> pg_backend_pid() AND wait_event_type = 'Lock' AND state = 'active'
           AND query ILIKE '%vertical_access_approvals%'`,
      );
      if ((rows[0]?.n ?? 0) >= count) return rows[0]!.n;
      if (Date.now() > deadline) throw new Error(`timeout esperando ${count} sessões bloqueadas (vistas: ${rows[0]?.n ?? 0})`);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  } finally {
    await monitor.end();
  }
}
