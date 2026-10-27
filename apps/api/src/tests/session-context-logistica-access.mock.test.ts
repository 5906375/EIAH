import assert from "node:assert/strict";
import process from "node:process";
import test, { after, before } from "node:test";

import express from "express";
import supertest from "supertest";

// Teste COM MOCKS na fronteira do Prisma: o código real de session.ts, logisticaContextAccess,
// verticalAccessApproval e TenantPolicyStore executa; apenas as leituras/escritas ao banco são simuladas.
// Ele comprova a lógica de decisão de GET /api/session/context?domain=logistica. NÃO substitui o teste HTTP
// integrado com PostgreSQL (session-context-cache-control / session-context-logistica-access.integration).
const previousDatabaseUrl = process.env.DATABASE_URL;
if (!process.env.DATABASE_URL) process.env.DATABASE_URL = "postgresql://user:pass@127.0.0.1:1/test"; // inalcançável; nunca conecta

const { prismaGlobal } = await import("@repo/db");
const { sessionRouter } = await import("../routes/session");
const { governedErrorHandler } = await import("../middlewares/governedErrorHandler");

const TENANT = "tenant-log-mock";
const WORKSPACE = "workspace-log-mock";
const USER = "user-log-mock";
const TOKEN = "tok-log-mock";
const SCOPE = "log.context.read";

type Fixture = {
  token?: { revoked?: boolean; expiresAt?: Date | null; userId?: string | null } | null;
  installation?: { tenantId?: string; workspaceId?: string; product?: string; status: string } | null;
  approval?: { status: string; revocationMode?: string | null; vertical?: string; tenantId?: string } | null;
  member?: boolean;
  policy?: { allowed: boolean; workspaceId: string | null; maxVersion?: number | null } | null;
  policies?: Array<{ allowed: boolean; workspaceId: string | null; maxVersion?: number | null }>;
  rawFails?: boolean;
  tenantLookupFails?: boolean;
  auditFails?: boolean;
  /** Permissões gravadas no vínculo ativo (S03). Padrão dos testes: a capacidade explícita de contexto. */
  memberPermissions?: string[];
};

const fullyAllowed = (): Fixture => ({
  installation: { status: "active" },
  approval: { status: "aprovado" },
  member: true,
  policy: { allowed: true, workspaceId: WORKSPACE, maxVersion: 1 },
});

let fx: Fixture = {};
const calls = { audit: [] as Array<Record<string, unknown>>, ddl: [] as string[], policyQueries: [] as unknown[], unexpectedWrites: [] as string[] };
const d = prismaGlobal as unknown as Record<string, any>;
const originals = new Map<string, unknown>();
function stub(path: string, owner: Record<string, any>, key: string, fn: unknown) {
  originals.set(path, owner[key]);
  owner[key] = fn;
}

function sqlText(strings: TemplateStringsArray | string) {
  return Array.isArray(strings) ? (strings as unknown as string[]).join("?") : String(strings);
}

let request: ReturnType<typeof supertest>;

before(() => {
  stub("apiToken.findUnique", d.apiToken, "findUnique", async () => {
    if (fx.token === null) return null;
    const t = fx.token ?? {};
    return {
      id: "tokid-mock", token: TOKEN, tenantId: TENANT, workspaceId: WORKSPACE,
      userId: t.userId === undefined ? USER : t.userId, expiresAt: t.expiresAt ?? null, revoked: t.revoked ?? false,
    };
  });
  stub("tenant.findUnique", d.tenant, "findUnique", async () => {
    if (fx.tenantLookupFails) throw new Error("synthetic tenant lookup failure");
    return { id: TENANT, name: "Tenant sintético" };
  });
  stub("workspace.findUnique", d.workspace, "findUnique", async () => ({ id: WORKSPACE, name: "Workspace sintético" }));
  stub("marketplaceItem.findMany", d.marketplaceItem, "findMany", async () => []);
  stub("tenantActionPolicy.findMany", d.tenantActionPolicy, "findMany", async (query: any) => {
    calls.policyQueries.push(query);
    const where = query?.where ?? {};
    if (where.actionName === SCOPE) {
      // espelha o filtro do banco: workspaceId exato, actionName exato
      const rows = fx.policies ?? (fx.policy ? [fx.policy] : []);
      return rows.filter((row) => row.workspaceId === where.workspaceId).map((row) => ({ workspaceId: row.workspaceId, allowed: row.allowed, maxVersion: row.maxVersion ?? null }));
    }
    return []; // políticas IMOB: nenhuma
  });
  stub("$queryRaw", d, "$queryRaw", async (strings: TemplateStringsArray) => {
    const text = sqlText(strings);
    if (fx.rawFails) throw new Error("synthetic raw failure");
    if (text.includes("eiah_workspace_memberships")) return fx.member ? [{ permissions: fx.memberPermissions ?? ["log.context.read"] }] : [];
    if (text.includes("tenant_product_installations")) {
      const row = fx.installation;
      if (!row) return [];
      if (text.includes("product='LOGISTICA'")) {
        return [{ tenantId: row.tenantId ?? TENANT, workspaceId: row.workspaceId ?? WORKSPACE, product: row.product ?? "LOGISTICA", status: row.status }];
      }
      return [{ product: row.product ?? "LOGISTICA", status: row.status }]; // leitura geral do snapshot
    }
    calls.unexpectedWrites.push(`queryRaw:${text.slice(0, 60)}`);
    return [];
  });
  stub("$queryRawUnsafe", d, "$queryRawUnsafe", async (sql: string) => {
    if (fx.rawFails) throw new Error("synthetic raw failure");
    if (/FROM vertical_access_approvals/.test(sql)) {
      const a = fx.approval;
      return a ? [{ tenant_id: a.tenantId ?? TENANT, tenantId: a.tenantId ?? TENANT, workspace_id: WORKSPACE, workspaceId: WORKSPACE, vertical: a.vertical ?? "LOGISTICA", status: a.status, revocation_mode: a.revocationMode ?? null, revocationMode: a.revocationMode ?? null }] : [];
    }
    calls.unexpectedWrites.push(`queryRawUnsafe:${String(sql).slice(0, 60)}`);
    return [];
  });
  stub("$executeRawUnsafe", d, "$executeRawUnsafe", async (sql: string) => {
    calls.ddl.push(String(sql));
    return 0;
  });
  stub("guardrailAuditLedger.create", d.guardrailAuditLedger, "create", async (args: any) => {
    if (fx.auditFails) throw new Error("synthetic audit failure");
    calls.audit.push(args.data);
    return {};
  });

  const app = express();
  app.use(express.json());
  app.use("/api", sessionRouter);
  app.use(governedErrorHandler);
  request = supertest(app);
});

after(() => {
  const restore: Array<[string, Record<string, any>, string]> = [
    ["apiToken.findUnique", d.apiToken, "findUnique"], ["tenant.findUnique", d.tenant, "findUnique"],
    ["workspace.findUnique", d.workspace, "findUnique"], ["marketplaceItem.findMany", d.marketplaceItem, "findMany"],
    ["tenantActionPolicy.findMany", d.tenantActionPolicy, "findMany"], ["$queryRaw", d, "$queryRaw"],
    ["$queryRawUnsafe", d, "$queryRawUnsafe"], ["$executeRawUnsafe", d, "$executeRawUnsafe"],
    ["guardrailAuditLedger.create", d.guardrailAuditLedger, "create"],
  ];
  for (const [path, owner, key] of restore) owner[key] = originals.get(path);
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previousDatabaseUrl;
});

function reset(next: Fixture) {
  fx = next;
  calls.audit.length = 0;
  calls.unexpectedWrites.length = 0;
}

function get(query = "", headers: Record<string, string> = {}) {
  let r = request.get(`/api/session/context${query}`).set("Authorization", `Bearer ${TOKEN}`);
  for (const [k, v] of Object.entries(headers)) r = r.set(k, v);
  return r;
}

// ---- controle positivo ------------------------------------------------------------------------------------------
test("controle: tudo satisfeito => 200, contexto somente leitura de contexto (sem execução nem transmissão externa)", async () => {
  reset(fullyAllowed());
  const res = await get("?domain=logistica");
  assert.equal(res.status, 200);
  assert.equal(res.headers["cache-control"], "no-store");
  const access = res.body.data.capabilities.logisticaContext;
  assert.deepEqual(
    { allowed: access.allowed, mode: access.mode, usage: access.usage, reason: access.reason, executionAllowed: access.executionAllowed, externalTransmissionAllowed: access.externalTransmissionAllowed },
    { allowed: true, mode: "context_only", usage: "full", reason: "available", executionAllowed: false, externalTransmissionAllowed: false },
  );
  assert.ok(res.body.data.availableDomains.includes("logistica"));
  assert.equal(calls.audit.length, 0, "acesso permitido não gera auditoria de negação");
});

// ---- 403 previstos pelo contrato (logistica negada) --------------------------------------------------------------
const denied403: Array<[string, Fixture, string]> = [
  ["produto não instalado", { ...fullyAllowed(), installation: null }, "installation_missing"],
  ["instalação inativa", { ...fullyAllowed(), installation: { status: "inactive" } }, "installation_inactive"],
  ["instalação de outro tenant/workspace (isolamento)", { ...fullyAllowed(), installation: { tenantId: "outro-tenant", status: "active" } }, "unavailable"],
  ["instalação de outro produto devolvida pela consulta", { ...fullyAllowed(), installation: { product: "IMOB", status: "active" } }, "unavailable"],
  ["workspace não autorizado: sem vínculo ativo do usuário", { ...fullyAllowed(), member: false }, "membership_required"],
  ["vínculo ativo SEM a capacidade explícita de contexto (S03: vínculo implícito não basta)", { ...fullyAllowed(), memberPermissions: ["imob.chat.use"] }, "membership_required"],
  ["vínculo ativo só com capacidade de escrita/revisão, sem a de contexto", { ...fullyAllowed(), memberPermissions: ["log.oraculo_preparation.write", "log.oraculo_preparation.content_review"] }, "membership_required"],
  ["curingas não valem como capacidade explícita", { ...fullyAllowed(), memberPermissions: ["*", "log.*", "log.context.*"] }, "membership_required"],
  ["verticalAccess: sem liberação EIAH", { ...fullyAllowed(), approval: null }, "approval_required"],
  ["verticalAccess: liberação pendente", { ...fullyAllowed(), approval: { status: "pendente" } }, "approval_required"],
  ["verticalAccess: em análise", { ...fullyAllowed(), approval: { status: "em_analise" } }, "approval_required"],
  ["verticalAccess: aguardando humano", { ...fullyAllowed(), approval: { status: "aguardando_humano" } }, "approval_required"],
  ["verticalAccess: recusada", { ...fullyAllowed(), approval: { status: "recusado" } }, "approval_required"],
  ["verticalAccess: liberação de outro tenant", { ...fullyAllowed(), approval: { status: "aprovado", tenantId: "outro-tenant" } }, "approval_required"],
  ["verticalAccess: liberação de outra vertical", { ...fullyAllowed(), approval: { status: "aprovado", vertical: "IMOB" } }, "approval_required"],
  ["verticalAccess: revogada com bloqueio total", { ...fullyAllowed(), approval: { status: "revogado", revocationMode: "bloqueio_total" } }, "revoked"],
  ["verticalAccess: revogada com modo desconhecido (fail-closed)", { ...fullyAllowed(), approval: { status: "revogado", revocationMode: "modo_inexistente" } }, "revoked"],
  ["ausência de política aplicável", { ...fullyAllowed(), policy: null }, "policy_denied"],
  ["política existente porém desabilitada", { ...fullyAllowed(), policy: { allowed: false, workspaceId: WORKSPACE } }, "policy_denied"],
  ["política somente tenant-wide (workspaceId nulo) não vale como autoridade", { ...fullyAllowed(), policy: { allowed: true, workspaceId: null } }, "policy_denied"],
  ["política duplicada para o mesmo escopo (ambígua)", { ...fullyAllowed(), policy: null, policies: [{ allowed: true, workspaceId: WORKSPACE }, { allowed: true, workspaceId: WORKSPACE }] }, "policy_denied"],
  ["falha de leitura no banco (fail-closed)", { ...fullyAllowed(), rawFails: true }, "unavailable"],
  ["token de serviço sem usuário", { ...fullyAllowed(), token: { userId: null } }, "membership_required"],
];
for (const [name, fixture, reason] of denied403) {
  test(`403 FORBIDDEN + auditoria: ${name} (reason=${reason})`, async () => {
    reset(fixture);
    const res = await get("?domain=logistica");
    assert.equal(res.status, 403);
    assert.equal(res.headers["cache-control"], "no-store");
    assert.equal(res.body.ok, false);
    assert.equal(res.body.error.code, "FORBIDDEN");
    const cap = res.body.error.capability;
    assert.equal(cap.allowed, false);
    assert.equal(cap.reason, reason);
    assert.equal(cap.usage, "blocked");
    assert.equal(cap.executionAllowed, false);
    assert.equal(cap.externalTransmissionAllowed, false);
    assert.equal(res.body.data, undefined, "nenhum dado de sessão/branding é devolvido na negação");
    assert.equal(calls.audit.length, 1);
    assert.equal(calls.audit[0].eventType, "logistica.context.denied");
    assert.equal(calls.audit[0].severity, "warn");
    assert.deepEqual(calls.audit[0].metadata, { reason, mode: "context_only" });
    assert.deepEqual(calls.unexpectedWrites, []);
  });
}

test("a falha ao gravar a auditoria da negação não abre o acesso: continua 403", async () => {
  reset({ ...fullyAllowed(), installation: null, auditFails: true });
  const res = await get("?domain=logistica");
  assert.equal(res.status, 403);
  assert.equal(res.body.error.capability.reason, "installation_missing");
});

// ---- liberação parcial por verticalAccess: o contrato NÃO prevê 403 ---------------------------------------------
test("verticalAccess revogada em somente leitura => 200 com usage=read_only (não é 403)", async () => {
  reset({ ...fullyAllowed(), approval: { status: "revogado", revocationMode: "somente_leitura" } });
  const res = await get("?domain=logistica");
  assert.equal(res.status, 200);
  assert.equal(res.body.data.capabilities.logisticaContext.usage, "read_only");
  assert.equal(res.body.data.capabilities.logisticaContext.executionAllowed, false);
});

test("verticalAccess revogada sem nova ativação mantém o uso => 200 usage=full", async () => {
  reset({ ...fullyAllowed(), approval: { status: "revogado", revocationMode: "sem_nova_ativacao" } });
  const res = await get("?domain=logistica");
  assert.equal(res.status, 200);
  assert.equal(res.body.data.capabilities.logisticaContext.usage, "full");
});

// ---- "contexto inválido": o contrato NÃO devolve 403 para domínio desconhecido -----------------------------------
test("domínio desconhecido cai em core (200), nunca concede logistica e nunca devolve 403", async () => {
  reset({ ...fullyAllowed(), installation: null });
  for (const q of ["?domain=foo", "?domain=", "?domain=logistica-x", "?domain[]=logistica", "?domain=log"]) {
    const res = await get(q);
    assert.equal(res.status, 200, q);
    assert.equal(res.body.data.activeDomain, "core", q);
    assert.equal(res.body.data.availableDomains.includes("logistica"), false, q);
    assert.equal(res.body.data.capabilities.logisticaContext.allowed, false, q);
  }
  assert.equal(calls.audit.length, 0, "domínio inválido não é negação de logistica");
});

test("domínio logistica é normalizado (caixa/espaços) e negado como logistica", async () => {
  reset({ ...fullyAllowed(), installation: null });
  const res = await get("?domain=%20LogIstica%20");
  assert.equal(res.status, 403);
});

test("cabeçalho x-eiah-domain/x-domain: usado só sem query; a query tem precedência", async () => {
  reset({ ...fullyAllowed(), installation: null });
  assert.equal((await get("", { "x-eiah-domain": "logistica" })).status, 403);
  assert.equal((await get("", { "x-domain": "logistica" })).status, 403);
  const withQuery = await get("?domain=core", { "x-eiah-domain": "logistica" });
  assert.equal(withQuery.status, 200);
  assert.equal(withQuery.body.data.activeDomain, "core");
});

test("sem domínio (core) com logistica negada => 200 core, sem log de negação", async () => {
  reset({ ...fullyAllowed(), policy: null });
  const res = await get();
  assert.equal(res.status, 200);
  assert.equal(res.body.data.activeDomain, "core");
  assert.equal(res.body.data.capabilities.logisticaContext.reason, "policy_denied");
  assert.equal(calls.audit.length, 0);
});

// ---- autenticação: 401, não 403 ----------------------------------------------------------------------------------
test("autenticação ausente/ inválida/ revogada/ expirada => 401 (não 403) e nada de logistica é avaliado", async () => {
  reset(fullyAllowed());
  const missing = await request.get("/api/session/context?domain=logistica");
  assert.equal(missing.status, 401);
  assert.equal(missing.body.error.code, "UNAUTHORIZED");

  reset({ ...fullyAllowed(), token: null });
  assert.equal((await get("?domain=logistica")).status, 401);

  reset({ ...fullyAllowed(), token: { revoked: true } });
  assert.equal((await get("?domain=logistica")).status, 401);

  reset({ ...fullyAllowed(), token: { expiresAt: new Date(Date.now() - 1000) } });
  const expired = await get("?domain=logistica");
  assert.equal(expired.status, 401);
  assert.equal(expired.body.error.code, "TOKEN_EXPIRED");
  assert.equal(calls.audit.length, 0);
});

// ---- falha de dependência: 500 governado, sem dados ----------------------------------------------------------------
test("falha na leitura do tenant => 500 governado (não 403) e sem dados de logistica", async () => {
  reset({ ...fullyAllowed(), tenantLookupFails: true });
  const res = await get("?domain=logistica");
  assert.equal(res.status, 500);
  assert.equal(res.headers["cache-control"], "no-store");
  assert.equal(res.body.data, undefined);
});

// ---- preservação do IMOB ---------------------------------------------------------------------------------------------
test("IMOB preservado: ?domain=imob sem direito segue 403 ENTITLEMENT_MISSING e sem auditoria de logistica", async () => {
  reset({ ...fullyAllowed(), installation: null });
  const res = await get("?domain=imob");
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, "ENTITLEMENT_MISSING");
  assert.notEqual(res.body.error.code, "FORBIDDEN");
  assert.equal(calls.audit.every((row) => row.eventType !== "logistica.context.denied"), true);
});

test("a avaliação só emite DDL idempotente e nenhuma escrita de dados de negócio", async () => {
  reset(fullyAllowed());
  calls.ddl.length = 0;
  await get("?domain=logistica");
  assert.ok(calls.ddl.every((sql) => /^\s*(CREATE (UNIQUE )?(TABLE|INDEX) IF NOT EXISTS|ALTER TABLE .* ADD COLUMN IF NOT EXISTS)/is.test(sql)), "somente DDL idempotente");
  assert.deepEqual(calls.unexpectedWrites, []);
});
