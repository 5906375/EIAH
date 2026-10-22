import {
  classifyWorkspaceProvenance,
  summarizeProvenance,
  type ApprovalFact, type BootstrapEventFact, type CreatorEventFact, type InstallationFact, type InvitationFact,
  type LegacyAssignmentFact, type MembershipFact, type ProfileFact, type ProvenanceClassification, type ProvenanceClassifierOptions,
  type ProvenanceFacts, type ProvenanceSourceName, type ProvenanceSourceStatus, type ProvenanceSummary, type RoleCatalogFact,
  type TokenAccessFact, type UserFact, type WorkspaceFact,
} from "./workspaceProvenanceClassifier";

/**
 * EIAH-AUTHZ-WORKSPACE-G2.3-B — leitores de fatos do classificador de procedência. SOMENTE LEITURA.
 *
 * - Roda em transação `READ ONLY`, com fuso fixado em UTC (`SET LOCAL TIME ZONE 'UTC'`) e timeouts: nenhuma escrita é possível.
 * - NÃO chama `ensure*Store`/DDL: se a tabela não existe, a fonte é `unavailable` (limitação explícita), nunca criada nem
 *   interpretada como "nenhum registro" positivo.
 * - Cada fonte opcional lê dentro de um SAVEPOINT: erro de uma fonte vira `error` e não derruba as demais.
 * - Todos os instantes saem como texto UTC (`...Z`), independentemente do tipo da coluna (`timestamp` sem fuso do Prisma, que
 *   grava UTC, ou `timestamptz`). Nunca seleciona e-mail, nome, token ou texto livre.
 */
export interface ProvenanceSqlRunner {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
}
type TxLike = { $queryRawUnsafe<T = unknown>(sql: string, ...values: unknown[]): Promise<T>; $executeRawUnsafe(sql: string, ...values: unknown[]): Promise<unknown> };
export interface ProvenancePrismaLike { $transaction<T>(fn: (tx: TxLike) => Promise<T>, options?: { timeout?: number; maxWait?: number }): Promise<T> }

export class ProvenanceRequiredSourceError extends Error {
  constructor(public readonly source: ProvenanceSourceName, public readonly status: ProvenanceSourceStatus) {
    super(`Fonte obrigatória indisponível para o classificador de procedência: ${source} (${status})`);
    this.name = "ProvenanceRequiredSourceError";
  }
}

/** Instante em texto UTC, qualquer que seja o tipo da coluna (o fuso da sessão é UTC). */
const ts = (column: string) => `to_char(((${column})::timestamptz) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const toDate = (value: unknown): Date | null => { if (typeof value !== "string" || !value) return null; const d = new Date(value); return Number.isFinite(d.getTime()) ? d : null; };
const str = (value: unknown): string | null => (typeof value === "string" && value.length > 0 ? value : null);
const strArray = (value: unknown): string[] | null => {
  let v = value;
  if (typeof v === "string") { try { v = JSON.parse(v); } catch { return null; } }
  return Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]) : null;
};

/** Executa `fn` em transação READ ONLY (UTC, com timeouts). Qualquer tentativa de escrita falha. */
export async function withReadOnlyProvenanceSession<T>(prisma: ProvenancePrismaLike, fn: (run: ProvenanceSqlRunner) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    await tx.$executeRawUnsafe("SET LOCAL TIME ZONE 'UTC'");
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '30s'");
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '2s'");
    const runner: ProvenanceSqlRunner = {
      query: <R,>(sql: string, params: unknown[] = []) => tx.$queryRawUnsafe<R[]>(sql, ...params),
      exec: async (sql: string) => { await tx.$executeRawUnsafe(sql); },
    };
    return fn(runner);
  }, { timeout: 120_000, maxWait: 10_000 });
}

type Row = Record<string, unknown>;
type SourceResult<T> = { status: ProvenanceSourceStatus; rows: T[] };

async function tableExists(run: ProvenanceSqlRunner, table: string): Promise<boolean> {
  const rows = await run.query<{ ok: boolean }>("SELECT to_regclass($1) IS NOT NULL AS ok", [`public.${table}`]);
  return rows[0]?.ok === true;
}

let savepointCounter = 0;
async function readSource<T>(run: ProvenanceSqlRunner, tables: string[], sql: string, params: unknown[], map: (row: Row) => T): Promise<SourceResult<T>> {
  for (const table of tables) if (!(await tableExists(run, table))) return { status: "unavailable", rows: [] };
  const sp = `prov_sp_${(savepointCounter += 1)}`;
  await run.exec(`SAVEPOINT ${sp}`);
  try {
    const rows = (await run.query<Row>(sql, params)).map(map);
    await run.exec(`RELEASE SAVEPOINT ${sp}`);
    return { status: "available", rows };
  } catch {
    await run.exec(`ROLLBACK TO SAVEPOINT ${sp}`);
    return { status: "error", rows: [] };
  }
}

/** Lê os fatos de UM lote de tenants. A fonte `memberships` é obrigatória; as demais degradam para limitação explícita. */
export async function readProvenanceFacts(run: ProvenanceSqlRunner, tenantIds: string[]): Promise<ProvenanceFacts> {
  // Os instantes dependem de a sessão estar em UTC (colunas `timestamp` sem fuso são lidas como UTC): recusa rodar fora disso.
  const tz = (await run.query<{ tz: string }>("SELECT current_setting('TimeZone') AS tz"))[0]?.tz;
  if (tz !== "UTC") throw new Error(`Sessão fora de UTC (${String(tz)}): o classificador de procedência exige fuso UTC (use withReadOnlyProvenanceSession)`);
  const T = [tenantIds];
  const memberships = await readSource<MembershipFact>(run, ["eiah_workspace_memberships"],
    `SELECT user_id, tenant_id, workspace_id, role_key, permissions, status, ${ts("created_at")} AS created_at, ${ts("updated_at")} AS updated_at
       FROM eiah_workspace_memberships WHERE tenant_id = ANY($1::text[])`, T,
    (r) => ({ tenantId: String(r.tenant_id), workspaceId: String(r.workspace_id), userId: String(r.user_id), roleKey: str(r.role_key), permissions: strArray(r.permissions), status: str(r.status), createdAt: toDate(r.created_at), updatedAt: toDate(r.updated_at) }));
  if (memberships.status !== "available") throw new ProvenanceRequiredSourceError("memberships", memberships.status);

  const tokens = await readSource<TokenAccessFact>(run, ["api_tokens"],
    `SELECT DISTINCT user_id, tenant_id, workspace_id FROM api_tokens
      WHERE revoked = false AND (expires_at IS NULL OR expires_at > NOW()) AND user_id IS NOT NULL AND tenant_id = ANY($1::text[])`, T,
    (r) => ({ tenantId: String(r.tenant_id), workspaceId: String(r.workspace_id), userId: String(r.user_id) }));
  const invitations = await readSource<InvitationFact>(run, ["eiah_workspace_invitations", "users"],
    `SELECT i.id, i.tenant_id, i.workspace_id, i.invited_by_user_id, i.accepted_by_user_id, i.role_key, i.permissions,
            ${ts("i.created_at")} AS created_at, ${ts("i.accepted_at")} AS accepted_at, ${ts("i.expires_at")} AS expires_at,
            (lower(btrim(u.email)) = lower(btrim(i.email))) AS email_matches
       FROM eiah_workspace_invitations i LEFT JOIN users u ON u.id = i.accepted_by_user_id
      WHERE i.status = 'accepted' AND i.tenant_id = ANY($1::text[])`, T,
    (r) => ({ id: String(r.id), tenantId: String(r.tenant_id), workspaceId: String(r.workspace_id), inviterUserId: str(r.invited_by_user_id), acceptedByUserId: str(r.accepted_by_user_id), roleKey: str(r.role_key), permissions: strArray(r.permissions), createdAt: toDate(r.created_at), acceptedAt: toDate(r.accepted_at), expiresAt: toDate(r.expires_at), emailMatchesCurrent: typeof r.email_matches === "boolean" ? r.email_matches : null }));
  // o ledger é lido em duas fontes lógicas (criação e bootstrap); ambas dependem da mesma tabela
  const creators = await readSource<CreatorEventFact>(run, ["guardrail_audit_ledger"],
    `SELECT id, tenant_id, workspace_id, metadata->>'userId' AS user_id, ${ts("created_at")} AS created_at
       FROM guardrail_audit_ledger WHERE event_type = 'tenant.onboarded' AND tenant_id = ANY($1::text[])`, T,
    (r) => ({ eventId: String(r.id), tenantId: String(r.tenant_id), workspaceId: str(r.workspace_id), userId: str(r.user_id), at: toDate(r.created_at) }));
  const bootstrap = await readSource<BootstrapEventFact>(run, ["guardrail_audit_ledger"],
    `SELECT id, tenant_id, workspace_id, metadata->>'actorUserId' AS actor, metadata->>'observation' AS observation,
            metadata->'legacy'->>'assignedRoleKey' AS assigned_role, metadata->'legacy'->>'roleSource' AS role_source, ${ts("created_at")} AS created_at
       FROM guardrail_audit_ledger WHERE event_type = 'workspace.bootstrap.shadow_observation' AND tenant_id = ANY($1::text[])`, T,
    (r) => ({ eventId: String(r.id), tenantId: String(r.tenant_id), workspaceId: str(r.workspace_id), actorUserId: str(r.actor), observation: str(r.observation), assignedRoleKey: str(r.assigned_role), roleSource: str(r.role_source), at: toDate(r.created_at) }));
  const legacy = await readSource<LegacyAssignmentFact>(run, ["eiah_workspace_role_assignments"],
    `SELECT tenant_id, workspace_id, user_id, role_key FROM eiah_workspace_role_assignments WHERE tenant_id = ANY($1::text[])`, T,
    (r) => ({ tenantId: String(r.tenant_id), workspaceId: String(r.workspace_id), userId: String(r.user_id), roleKey: str(r.role_key) }));
  const installations = await readSource<InstallationFact>(run, ["tenant_product_installations"],
    `SELECT tenant_id, workspace_id, activated_by_user_id FROM tenant_product_installations WHERE tenant_id = ANY($1::text[])`, T,
    (r) => ({ tenantId: String(r.tenant_id), workspaceId: String(r.workspace_id), activatedByUserId: str(r.activated_by_user_id) }));
  const approvals = await readSource<ApprovalFact>(run, ["vertical_access_approvals"],
    `SELECT tenant_id, workspace_id, requested_by_user_id, source, status FROM vertical_access_approvals WHERE tenant_id = ANY($1::text[])`, T,
    (r) => ({ tenantId: String(r.tenant_id), workspaceId: String(r.workspace_id), requestedByUserId: str(r.requested_by_user_id), source: str(r.source), status: str(r.status) }));
  const catalog = await readSource<RoleCatalogFact>(run, ["eiah_workspace_roles"],
    `SELECT tenant_id, workspace_id, role_key, default_permissions FROM eiah_workspace_roles WHERE tenant_id = ANY($1::text[])`, T,
    (r) => ({ tenantId: String(r.tenant_id), workspaceId: String(r.workspace_id), roleKey: String(r.role_key), defaultPermissions: strArray(r.default_permissions) ?? [] }));

  const userIds = new Set<string>(), workspaceIds = new Set<string>();
  for (const m of memberships.rows) { userIds.add(m.userId); workspaceIds.add(m.workspaceId); }
  for (const t of tokens.rows) { userIds.add(t.userId); workspaceIds.add(t.workspaceId); }
  for (const i of invitations.rows) { if (i.inviterUserId) userIds.add(i.inviterUserId); if (i.acceptedByUserId) userIds.add(i.acceptedByUserId); workspaceIds.add(i.workspaceId); }
  for (const c of creators.rows) { if (c.userId) userIds.add(c.userId); if (c.workspaceId) workspaceIds.add(c.workspaceId); }
  for (const b of bootstrap.rows) { if (b.actorUserId) userIds.add(b.actorUserId); if (b.workspaceId) workspaceIds.add(b.workspaceId); }
  const U = [[...userIds]], W = [[...workspaceIds]];
  const users = await readSource<UserFact>(run, ["users"], `SELECT id, tenant_id FROM users WHERE id = ANY($1::text[])`, U, (r) => ({ id: String(r.id), tenantId: String(r.tenant_id) }));
  const workspaces = await readSource<WorkspaceFact>(run, ["workspaces"], `SELECT id, tenant_id, name FROM workspaces WHERE id = ANY($1::text[])`, W, (r) => ({ id: String(r.id), tenantId: String(r.tenant_id), name: str(r.name) }));
  const profiles = await readSource<ProfileFact>(run, ["eiah_user_profiles"], `SELECT user_id, lower(btrim(role)) AS role FROM eiah_user_profiles WHERE user_id = ANY($1::text[])`, U, (r) => ({ userId: String(r.user_id), roleKey: str(r.role) }));

  return {
    sources: {
      memberships: memberships.status, users: users.status, workspaces: workspaces.status, tokens: tokens.status, invitations: invitations.status,
      ledger_creator: creators.status, ledger_bootstrap: bootstrap.status, legacy_assignments: legacy.status, installations: installations.status,
      approvals: approvals.status, profiles: profiles.status, role_catalog: catalog.status,
    },
    memberships: memberships.rows, users: users.rows, workspaces: workspaces.rows, tokens: tokens.rows, invitations: invitations.rows,
    creatorEvents: creators.rows, bootstrapEvents: bootstrap.rows, legacyAssignments: legacy.rows, installations: installations.rows,
    approvals: approvals.rows, profiles: profiles.rows, roleCatalog: catalog.rows,
  };
}

export type ClassifyFromDatabaseParams = {
  prisma: ProvenancePrismaLike;
  /** Tenants a classificar; omitido = todos (lidos de `tenants`). */
  tenantIds?: string[];
  chunkSize?: number;
  options?: ProvenanceClassifierOptions;
};
export type ClassifyFromDatabaseResult = { classification: ProvenanceClassification; summary: ProvenanceSummary; tenantCount: number };

/** Classifica a procedência a partir do banco, em lotes de tenants. Não grava nada. */
export async function classifyWorkspaceProvenanceFromDatabase(params: ClassifyFromDatabaseParams): Promise<ClassifyFromDatabaseResult> {
  return withReadOnlyProvenanceSession(params.prisma, (run) => classifyWithRunner(run, params));
}

/** Variante para quem já controla a sessão READ ONLY (por exemplo, o executor externo de consulta agregada). */
export async function classifyWithRunner(run: ProvenanceSqlRunner, params: Pick<ClassifyFromDatabaseParams, "tenantIds" | "chunkSize" | "options">): Promise<ClassifyFromDatabaseResult> {
  const tenantIds = params.tenantIds ?? (await run.query<{ id: string }>("SELECT id FROM tenants ORDER BY id")).map((r) => r.id);
  const size = Math.max(1, params.chunkSize ?? 25);
  const merged: ProvenanceFacts[] = [];
  const classifications: ProvenanceClassification[] = [];
  for (let i = 0; i < tenantIds.length; i += size) {
    const facts = await readProvenanceFacts(run, tenantIds.slice(i, i + size));
    merged.push(facts);
    classifications.push(classifyWorkspaceProvenance(facts, params.options));
  }
  const order: ProvenanceSourceStatus[] = ["available", "unavailable", "error"];
  const sources = {} as ProvenanceFacts["sources"];
  for (const facts of merged) for (const name of Object.keys(facts.sources) as ProvenanceSourceName[]) {
    const prev = sources[name]; const cur = facts.sources[name];
    sources[name] = !prev || order.indexOf(cur) > order.indexOf(prev) ? cur : prev;
  }
  const first = classifications[0];
  const classification: ProvenanceClassification = {
    classifierVersion: first?.classifierVersion ?? classifyWorkspaceProvenance({ ...emptyFacts(), sources: allAvailable() }).classifierVersion,
    classifiedAt: first?.classifiedAt ?? (params.options?.now ?? new Date()).toISOString(),
    sources: Object.keys(sources).length ? sources : allAvailable(),
    degraded: classifications.some((c) => c.degraded),
    records: classifications.flatMap((c) => c.records),
  };
  const summary = summarizeProvenance(classification, { memberships: merged.flatMap((f) => f.memberships) });
  return { classification, summary, tenantCount: tenantIds.length };
}

function allAvailable(): ProvenanceFacts["sources"] {
  return { memberships: "available", users: "available", workspaces: "available", tokens: "available", invitations: "available", ledger_creator: "available", ledger_bootstrap: "available", legacy_assignments: "available", installations: "available", approvals: "available", profiles: "available", role_catalog: "available" };
}
function emptyFacts(): ProvenanceFacts {
  return { sources: allAvailable(), memberships: [], users: [], workspaces: [], tokens: [], invitations: [], creatorEvents: [], bootstrapEvents: [], legacyAssignments: [], installations: [], approvals: [], profiles: [], roleCatalog: [] };
}
