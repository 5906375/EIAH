import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import ts from "typescript";
import express from "express";
import supertest from "supertest";
import { IMOB_BACKING_SPECIALIST_AGENT_IDS } from "../services/imob/imobSpecialistBridge";

// P0: GET /api/agents e GET /api/agents/:name não serializam instruções internas.
// Fontes .ts canônicas com dependências externas controladas: Prisma em memória, sem banco,
// sem Redis. Asserções só por presença/ausência; nenhum prompt é impresso.

const T = "synthetic-tenant-a", W = "synthetic-ws-a", T2 = "synthetic-tenant-b", W2 = "synthetic-ws-b";
const SENTINEL_PROMPT = "SENTINEL_SYSTEM_PROMPT_7f3a";
const SENTINEL_TOOL = "SENTINEL_TOOL_URL_7f3a";
const CORE_FILES = [
  "aadvAction", "onchainMonitorAction", "diariasAction", "iBCAction", "pitchAction", "nftPyAction", "guardianAction",
  "j360Action", "imageNftDiariasAction", "eiahAction", "riskAnalyzerAction", "defiOneAction", "finNexusAction",
  "mktAction", "flowOrchestratorAction",
];

type Row = Record<string, any>;
type Fixture = {
  marketplaceItems?: Row[];
  delegations?: Row[];
  policies?: Row[];
  agentProfiles?: Row[];
  pricing?: Row[];
  /** tenant_recipes (consulta bruta). Linhas já no formato do banco: tenantId, status, workspaceScopeMode, workspaceScopeIds... */
  recipes?: Row[];
  /** Tabelas cuja leitura falha (simula indisponibilidade). `tenant_recipes` e `eiah_workspace_memberships` falham a consulta bruta. */
  failTables?: string[];
  /** eiah_workspace_memberships (consulta bruta): userId, tenantId, workspaceId, status. */
  memberships?: Row[];
  /** eiah_commercial_authority_designations (consulta bruta): userId (beneficiário), tenantId, workspaceId, role, limits, validUntil, revokedAt. */
  designations?: Row[];
  /** eiah_agent_commercial_enablements (consulta bruta): habilitação comercial verificável de agentes governados. */
  enablements?: Row[];
  /** Simula indisponibilidade do registro de auditoria (GuardrailAuditLedger). */
  failAudit?: boolean;
};

const future = () => new Date(Date.now() + 86_400_000);
const item = (id: string, name: string) => ({ id, type: "agent", name, isPublic: true, publisherId: "synthetic-publisher" });
const delegation = (tenant: string, marketplaceId: string) => ({
  id: `d-${tenant}-${marketplaceId}`, delegateeId: tenant, marketplaceId, scope: "execute", trustMin: 50, validUntil: future(), createdAt: new Date(),
});
const policy = (tenant: string, workspace: string, actionName: string) => ({ id: `p-${tenant}-${workspace}-${actionName}`, tenantId: tenant, workspaceId: workspace, actionName, allowed: true });

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === "OR" && Array.isArray(condition)) return condition.some((entry) => matches(row, entry));
    if (condition && typeof condition === "object" && !(condition instanceof Date)) {
      if ("in" in condition) return condition.in.includes(row[key]);
      if ("gt" in condition) return row[key] > condition.gt;
      if ("not" in condition) return row[key] !== condition.not;
      if ("equals" in condition) {
        return condition.mode === "insensitive"
          ? String(row[key]).toLowerCase() === String(condition.equals).toLowerCase()
          : row[key] === condition.equals;
      }
      return true;
    }
    return row[key] === condition;
  });
}

/**
 * `writable: false` (padrão): qualquer escrita é registrada e LANÇA, como na descoberta somente leitura.
 * `writable: true` (rotas de contratação): escritas são registradas e aplicadas em memória, para provar
 * tanto a ausência de efeitos nos cenários negativos quanto os efeitos e a ordem no cenário autorizado.
 */
function makeDb(fixture: Fixture, options: { writable?: boolean } = {}) {
  const writes: string[] = [];
  const events: string[] = [];
  const audits: Row[] = [];
  const sql: Array<{ text: string; values: unknown[] }> = [];
  const table = (rows: Row[], name: string) => {
    const guarded = (method: string, apply: (args: Row) => unknown) => async (args: Row = {}) => {
      writes.push(`${name}.${method}`);
      events.push(`write:${name}.${method}`);
      if (!options.writable) throw new Error(`WRITE_ATTEMPT ${name}.${method}`);
      return apply(args);
    };
    return {
      findMany: async (query: Row = {}) => {
        if (fixture.failTables?.includes(name)) throw new Error(`read failure ${name}`);
        const found = rows.filter((row) => matches(row, query.where)).map((row) =>
          query.include?.marketplace
            ? { ...row, marketplace: (fixture.marketplaceItems ?? []).find((entry) => entry.id === row.marketplaceId) ?? null }
            : row);
        return typeof query.take === "number" ? found.slice(0, query.take) : found;
      },
      findUnique: async (query: Row = {}) => rows.find((row) => matches(row, query.where)) ?? null,
      findFirst: async (query: Row = {}) => rows.find((row) => matches(row, query.where)) ?? null,
      create: guarded("create", ({ data }) => { const row = { id: `new-${name}-${rows.length + 1}`, publisher: { name: "Synthetic Publisher" }, ...data }; rows.push(row); return row; }),
      update: guarded("update", ({ where, data }) => { const row = rows.find((entry) => entry.id === where?.id); if (row) Object.assign(row, data); return { publisher: { name: "Synthetic Publisher" }, ...row }; }),
      createMany: guarded("createMany", () => ({ count: 0 })), updateMany: guarded("updateMany", () => ({ count: 0 })),
      upsert: guarded("upsert", () => ({})), delete: guarded("delete", () => ({})), deleteMany: guarded("deleteMany", () => ({ count: 0 })),
    };
  };
  return {
    pricing: table(fixture.pricing ?? [], "pricing"),
    agentProfile: table(fixture.agentProfiles ?? [], "agentProfile"),
    delegationPolicy: table(fixture.delegations ?? [], "delegationPolicy"),
    tenantActionPolicy: table(fixture.policies ?? [], "tenantActionPolicy"),
    marketplaceItem: table(fixture.marketplaceItems ?? [], "marketplaceItem"),
    // Consulta bruta de receitas: reproduz o filtro SQL a partir dos VALORES recebidos (tenantId, workspaceId).
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join("?");
      sql.push({ text, values });
      if (/FROM eiah_workspace_memberships/.test(text)) {
        if (fixture.failTables?.includes("eiah_workspace_memberships")) throw new Error("relation eiah_workspace_memberships does not exist");
        const [userId, tenantId, workspaceId] = values;
        const select = /SELECT([\s\S]*?)FROM eiah_workspace_memberships/.exec(text)?.[1] ?? "";
        const columns = select.split(",").map((column) => column.trim()).filter(Boolean);
        return (fixture.memberships ?? [])
          .filter((row) => row.userId === userId && row.tenantId === tenantId && row.workspaceId === workspaceId)
          .slice(0, 1)
          .map((row) => Object.fromEntries(columns.map((column) => [column, row[column]])));
      }
      if (/FROM eiah_agent_commercial_enablements/.test(text)) {
        if (fixture.failTables?.includes("eiah_agent_commercial_enablements")) throw new Error("relation eiah_agent_commercial_enablements does not exist");
        const [tenantId, workspaceId, now] = values as [string, string, Date];
        const select = /SELECT([\s\S]*?)FROM eiah_agent_commercial_enablements/.exec(text)?.[1] ?? "";
        const keys = select.split(",").map((column) => /AS "(\w+)"/.exec(column)?.[1] ?? column.trim()).filter(Boolean);
        return (fixture.enablements ?? [])
          .filter((row) => row.tenantId === tenantId && row.workspaceId === workspaceId && !row.revokedAt && row.validUntil > now)
          .map((row) => Object.fromEntries(keys.map((key) => [key, row[key]])));
      }
      if (/FROM eiah_commercial_authority_designations/.test(text)) {
        if (fixture.failTables?.includes("eiah_commercial_authority_designations")) throw new Error("relation eiah_commercial_authority_designations does not exist");
        const [tenantId, workspaceId, userId, scope, role, now] = values as [string, string, string, string, string, Date];
        const select = /SELECT([\s\S]*?)FROM eiah_commercial_authority_designations/.exec(text)?.[1] ?? "";
        const keys = select.split(",").map((column) => /AS "(\w+)"/.exec(column)?.[1] ?? column.trim()).filter(Boolean);
        return (fixture.designations ?? [])
          .filter((row) => row.tenantId === tenantId && row.workspaceId === workspaceId && row.userId === userId
            && (row.scope ?? "marketplace.subscribe") === scope && (row.role ?? "holder") === role
            && !row.revokedAt && row.validUntil > now)
          .slice(0, 1)
          .map((row) => Object.fromEntries(keys.map((key) => [key, key === "beneficiaryUserId" ? row.userId : row[key]])));
      }
      if (fixture.failTables?.includes("tenant_recipes")) throw new Error("relation tenant_recipes does not exist");
      if (!/FROM tenant_recipes/.test(text) || values.length !== 2) throw new Error("unexpected raw query");
      const [tenantId, workspaceId] = values;
      return (fixture.recipes ?? [])
        .filter((row) => row.tenantId === tenantId && row.status === "homologated"
          && (row.workspaceScopeMode === "all_workspaces" || (Array.isArray(row.workspaceScopeIds) && row.workspaceScopeIds.includes(workspaceId))))
        // Devolve somente as colunas que o SQL realmente seleciona (alias "x" ou nome da coluna): uma coluna a mais vazaria.
        .map((row) => {
          const select = /SELECT([\s\S]*?)FROM tenant_recipes/.exec(text)?.[1] ?? "";
          const keys = select.split(",").map((column) => /AS "(\w+)"/.exec(column)?.[1] ?? column.trim()).filter(Boolean);
          return Object.fromEntries(keys.map((key) => [key, row[key]]));
        });
    },
    $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      writes.push("$executeRaw"); events.push("write:$executeRaw"); sql.push({ text: strings.join("?"), values });
      if (!options.writable) throw new Error("WRITE_ATTEMPT $executeRaw");
      return 1;
    },
    // DDL idempotente (CREATE ... IF NOT EXISTS) do registro de habilitações, só no caminho de escrita da contratação.
    $executeRawUnsafe: async (text: string) => {
      writes.push("$executeRawUnsafe"); events.push("write:$executeRawUnsafe"); sql.push({ text, values: [] });
      if (!options.writable) throw new Error("WRITE_ATTEMPT $executeRawUnsafe");
      return 0;
    },
    guardrailAuditLedger: {
      create: async ({ data }: { data: Row }) => {
        events.push(`audit:${data.eventType}`);
        if (fixture.failAudit) throw new Error("audit ledger unavailable");
        audits.push(data);
        return data;
      },
    },
    $disconnect: async () => {},
    __writes: writes,
    __events: events,
    __audits: audits,
    __sql: sql,
  };
}

function harness(fixture: Fixture, auth: Row | null, options: { writable?: boolean } = {}) {
  const db = makeDb(fixture, options);
  const coreProfiles: Record<string, unknown> = {};
  const overrides: Record<string, unknown> = {
    "@repo/db": { prismaGlobal: db, getPrismaForTenant: () => db, Prisma: { JsonNull: null }, PrismaClient: class {} },
    "@eiah/core/logging/logger": { bindLogger: (logger: unknown) => logger, createLogger: () => ({ info() {}, warn() {}, error() {} }) },
    "@eiah/core/services/guardrailLedgerStore": {
      recordGuardrailLedger: async () => {},
      recordGuardrailAudit: async (params: Row) => {
        db.__events.push(`audit:${params.eventType}`);
        if (fixture.failAudit) throw new Error("audit ledger unavailable");
        db.__audits.push(params);
      },
    },
  };
  const cache = new Map<string, { exports: any }>();
  function load(path: string): any {
    if (cache.has(path)) return cache.get(path)!.exports;
    const module = { exports: {} as any };
    cache.set(path, module);
    const nativeRequire = createRequire(path);
    const tryLoad = (base: string) => {
      for (const ext of [".ts", "/index.ts"]) if (existsSync(base + ext)) return load(base + ext);
      return undefined;
    };
    const localRequire = (specifier: string) => {
      if (specifier === "@eiah/core") {
        // Somente os perfis core reais; filas e conexões do pacote raiz não são carregadas.
        if (Object.keys(coreProfiles).length === 0) {
          for (const file of CORE_FILES) Object.assign(coreProfiles, load(resolve("packages/core/src/actions/agents", `${file}.ts`)));
          // Catálogo real de escopos canônicos (AUTHZ-SCOPE-0/1): consumido pela guarda de contratação.
          Object.assign(coreProfiles, load(resolve("packages/core/src/security/adminScopes.ts")));
          coreProfiles.listRegisteredActions = () => [];
          coreProfiles.publishRun = async () => { throw new Error("publishRun is not available in this harness"); };
        }
        return coreProfiles;
      }
      if (specifier in overrides) return overrides[specifier];
      if (specifier.endsWith("/auth/apiTokenRepository")) return { findApiToken: async () => auth };
      const workspacePackage = /^@eiah\/(core|contracts|utils|providers)(?:\/(.*))?$/.exec(specifier);
      if (workspacePackage) {
        const loaded = tryLoad(resolve("packages", workspacePackage[1], "src", workspacePackage[2] ?? "index"));
        if (loaded) return loaded;
      }
      if (specifier.startsWith(".")) {
        const loaded = tryLoad(resolve(dirname(path), specifier.endsWith(".js") ? specifier.slice(0, -3) : specifier));
        if (loaded) return loaded;
      }
      return nativeRequire(specifier);
    };
    const output = ts.transpileModule(readFileSync(path, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    new Function("require", "module", "exports", output)(localRequire, module, module.exports);
    return module.exports;
  }
  const router = load(resolve("apps/api/src/routes/agents.ts")).agentsRouter;
  const app = express();
  app.use("/api", router);
  const corePrompts = () => {
    load(resolve("apps/api/src/services/agents.ts"));
    return Object.values(coreProfiles)
      .filter((value): value is { agent: string; systemPrompt: string } =>
        Boolean(value && typeof value === "object" && typeof (value as Row).systemPrompt === "string" && (value as Row).agent))
      .map((profile) => ({ agent: profile.agent, systemPrompt: profile.systemPrompt }));
  };
  return { app, db, load, corePrompts };
}

const authA = { tokenId: "synthetic-token", tenantId: T, workspaceId: W, userId: "synthetic-member", revoked: false, expiresAt: null };

function pathsWithKey(value: unknown, key: string, path = "$"): string[] {
  if (Array.isArray(value)) return value.flatMap((entry, index) => pathsWithKey(entry, key, `${path}[${index}]`));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([entryKey, entry]) =>
      (entryKey === key ? [`${path}.${entryKey}`] : []).concat(pathsWithKey(entry, key, `${path}.${entryKey}`)));
  }
  return [];
}

function assertNoPromptLeak(body: unknown, prompts: string[]) {
  const serialized = JSON.stringify(body);
  assert.deepEqual(pathsWithKey(body, "systemPrompt"), [], "no systemPrompt key at any depth");
  assert.deepEqual(pathsWithKey(body, "tools"), [], "no tools key at any depth");
  assert.deepEqual(pathsWithKey(body, "models"), [], "no models key at any depth");
  for (const prompt of prompts) {
    if (!prompt.trim()) continue;
    assert.equal(serialized.includes(JSON.stringify(prompt).slice(1, -1)), false, "prompt content is not serialized");
    const prefix = JSON.stringify(prompt.slice(0, 60)).slice(1, -1);
    if (prompt.length >= 60) assert.equal(serialized.includes(prefix), false, "prompt prefix is not serialized");
  }
}

test("T1 subscribed catalog item keeps public metadata without systemPrompt", async () => {
  const h = harness({
    marketplaceItems: [item("mkt-eiah", "EIAH")],
    delegations: [delegation(T, "mkt-eiah")],
    policies: [policy(T, W, "EIAH")],
  }, authA);
  const response = await supertest(h.app).get("/api/agents").set("authorization", "Bearer synthetic");
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.items.map((entry: Row) => entry.id), ["EIAH"]);
  const listed = response.body.items[0];
  for (const field of ["id", "name", "description", "chatCopy", "chatRuntime", "participation", "modeContracts", "governance", "uxContract"]) {
    assert.ok(field in listed, `public field ${field} preserved`);
  }
  assert.equal(listed.chatRuntime.chatEnabled, true);
  assertNoPromptLeak(response.body, h.corePrompts().map((entry) => entry.systemPrompt));
});

test("T2/T3 profile of core agents without subscription exposes no internal instructions", async () => {
  const h = harness({}, authA);
  const prompts = h.corePrompts();
  assert.ok(prompts.length >= 15, "core profiles loaded");
  for (const name of ["EIAH", "J_360", "guardian", "riskAnalyzer", ...prompts.map((entry) => entry.agent)]) {
    const response = await supertest(h.app).get(`/api/agents/${encodeURIComponent(name)}`).set("authorization", "Bearer synthetic");
    assert.equal(response.status, 200, `${name} keeps current status`);
    assert.equal(response.body.item.participation.status, "restricted", `${name} stays restricted without subscription`);
    assertNoPromptLeak(response.body, prompts.map((entry) => entry.systemPrompt));
  }
});

test("T4/T5 nested sentinels and tools from a database profile are never serialized", async () => {
  const fixture: Fixture = {
    marketplaceItems: [item("mkt-db", "synthetic-db-agent")],
    delegations: [delegation(T, "mkt-db")],
    policies: [policy(T, W, "synthetic-db-agent")],
    agentProfiles: [{
      id: "ap-db", agent: "synthetic-db-agent", name: "Synthetic DB Agent", description: "synthetic", model: "synthetic-model",
      systemPrompt: SENTINEL_PROMPT,
      tools: [{ name: "synthetic.tool", method: "GET", url_by_env: { prod: SENTINEL_TOOL } }],
      createdAt: new Date(), updatedAt: new Date(),
    }],
    pricing: [{ agent: "synthetic-db-agent", active: true, perRunCents: 7, perMBcents: 1 }],
  };
  const h = harness(fixture, authA);
  const list = await supertest(h.app).get("/api/agents").set("authorization", "Bearer synthetic");
  const profile = await supertest(h.app).get("/api/agents/synthetic-db-agent").set("authorization", "Bearer synthetic");
  for (const response of [list, profile]) {
    assert.equal(response.status, 200);
    const serialized = JSON.stringify(response.body);
    assert.equal(serialized.includes(SENTINEL_PROMPT), false);
    assert.equal(serialized.includes(SENTINEL_TOOL), false);
    assert.equal(serialized.includes("url_by_env"), false);
    assertNoPromptLeak(response.body, [SENTINEL_PROMPT]);
  }
  assert.deepEqual(list.body.items[0].pricing, { perRunCents: 7, perMBcents: 1 });
  assert.deepEqual(list.body.items[0].profile, { model: "synthetic-model" });
  assert.equal(profile.body.item.model, "synthetic-model");

  const view = h.load(resolve("apps/api/src/routes/agentsPublicView.ts"));
  const nested = view.toPublicAgentListing({
    id: "synthetic", name: "Synthetic", description: null,
    profile: { model: "m", systemPrompt: SENTINEL_PROMPT, tools: [{ url: SENTINEL_TOOL }] },
    chatCopy: { whoIAm: "x", whatIDo: [], whenToUseMe: [], exampleRequests: [], systemPrompt: SENTINEL_PROMPT },
    modeContracts: [{ mode: "help", label: "help", description: "help", chatCopy: { systemPrompt: SENTINEL_PROMPT, tools: [SENTINEL_TOOL] }, models: { a: SENTINEL_TOOL } }],
  });
  const serializedNested = JSON.stringify(nested);
  assert.equal(serializedNested.includes(SENTINEL_PROMPT), false);
  assert.equal(serializedNested.includes(SENTINEL_TOOL), false);
  assert.equal(nested.modeContracts[0].label, "help");
});

test("T6 authentication and tenant/workspace isolation are unchanged", async () => {
  const unauthenticated = await supertest(harness({}, authA).app).get("/api/agents");
  assert.equal(unauthenticated.status, 401);
  const unauthenticatedProfile = await supertest(harness({}, authA).app).get("/api/agents/EIAH");
  assert.equal(unauthenticatedProfile.status, 401);
  const invalidToken = await supertest(harness({}, null).app).get("/api/agents").set("authorization", "Bearer synthetic");
  assert.equal(invalidToken.status, 401);

  const foreign = harness({
    marketplaceItems: [item("mkt-eiah", "EIAH")],
    delegations: [delegation(T2, "mkt-eiah")],
    policies: [policy(T2, W2, "EIAH"), policy(T, "synthetic-other-ws", "EIAH")],
  }, authA);
  const response = await supertest(foreign.app).get("/api/agents").set("authorization", "Bearer synthetic");
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.items, []);

  const noSubscription = await supertest(harness({}, authA).app).get("/api/agents").set("authorization", "Bearer synthetic");
  assert.deepEqual(noSubscription.body.items, []);
});

test("T7 public view keeps the fields read by the web catalog consumers", async () => {
  const h = harness({
    marketplaceItems: [item("mkt-eiah", "EIAH")],
    delegations: [delegation(T, "mkt-eiah")],
    policies: [policy(T, W, "EIAH")],
  }, authA);
  const services = h.load(resolve("apps/api/src/services/agents.ts"));
  const [internal] = await services.listAgents(T, W, h.db);
  const response = await supertest(h.app).get("/api/agents").set("authorization", "Bearer synthetic");
  const [listed] = response.body.items;
  const comparable = JSON.parse(JSON.stringify({ ...internal, profile: { model: internal.profile.model } }));
  // Comparação booleana: uma regressão não pode imprimir conteúdo interno no log.
  assert.deepEqual(Object.keys(listed).sort(), Object.keys(comparable).sort());
  assert.equal(JSON.stringify(listed) === JSON.stringify(comparable), true, "only internal profile fields differ from the service listing");
});

test("T8 internal service objects keep systemPrompt for the runtime", async () => {
  const h = harness({}, authA);
  const services = h.load(resolve("apps/api/src/services/agents.ts"));
  const view = h.load(resolve("apps/api/src/routes/agentsPublicView.ts"));
  const expected = h.corePrompts().find((entry) => entry.agent === "EIAH")!.systemPrompt;
  const internal = await services.getAgentProfile(T, W, "EIAH", h.db);
  const publicView = view.toPublicAgentProfile(internal);
  assert.equal("systemPrompt" in publicView, false);
  assert.equal(typeof internal.systemPrompt, "string");
  assert.equal(internal.systemPrompt === expected, true, "runtime profile keeps the core systemPrompt");
  assert.ok(Array.isArray(internal.tools), "runtime profile keeps tools");
  assert.equal(services.listCoreAgentCatalog().every((entry: Row) => typeof entry.profile.systemPrompt === "string"), true);
});

// ---------------------------------------------------------------------------------------------
// Disponibilidade real de agentes (consumida pelos especialistas de apoio do IMOB)
// ---------------------------------------------------------------------------------------------

const subscribed = (agents: string[], tenant = T, workspace = W): Fixture => ({
  marketplaceItems: agents.map((agent) => item(`mkt-${agent}`, agent)),
  delegations: agents.map((agent) => delegation(tenant, `mkt-${agent}`)),
  policies: agents.map((agent) => policy(tenant, workspace, agent)),
});
// Habilitação comercial verificável (agentes GOVERNADOS, p.ex. MKT): vincula decisão, designação, delegação e condições.
const enablementRow = (agent: string, tenant = T, workspace = W, over: Row = {}) => ({
  id: `cae-${tenant}-${workspace}-${agent}`, tenantId: tenant, workspaceId: workspace, agentKey: agent.toLowerCase().replace(/[^a-z0-9]/g, ""),
  marketplaceItemId: `mkt-${agent}`, delegationId: `d-${tenant}-mkt-${agent}`, scope: "execute", trustMin: 50, validUntil: future(),
  designationId: "cad_fixture_holder", decisionAuditEventId: "evt_fixture_decision", revokedAt: null, ...over,
});
const enabled = (agents: string[], tenant = T, workspace = W): Fixture => ({
  ...subscribed(agents, tenant, workspace),
  enablements: agents.map((agent) => enablementRow(agent, tenant, workspace)),
});

async function availabilityOf(fixture: Fixture, tenantId: string, workspaceId: string, agentIds: string[] = [...IMOB_BACKING_SPECIALIST_AGENT_IDS]) {
  const h = harness(fixture, authA);
  const services = h.load(resolve("apps/api/src/services/agents.ts"));
  return { h, services, result: await services.readAgentAvailability({ tenantId, workspaceId, agentIds, client: h.db }) };
}

const activeParticipation = { visibility: "visible", status: "active", canBeSuggested: true, canReceiveHandoff: true };

test("T9 predicado canônico: visível, ativo, sugerível e apto a handoff; qualquer desvio é indisponível; dados inválidos são não verificados", () => {
  const services = harness({}, authA).load(resolve("apps/api/src/services/agents.ts"));
  const decide = services.resolveAgentAvailabilityFromCatalog as (catalog: unknown, id: string) => string;
  const entry = (participation: Row | null | undefined) => [{ id: "guardian", participation }];
  assert.equal(decide(entry(activeParticipation), "guardian"), "available");
  assert.equal(decide(entry(activeParticipation), "Guardian"), "available", "alias/caixa resolvem para o mesmo agente");
  const deviations: Array<[string, Row]> = [
    ["hidden", { visibility: "hidden" }], ["internal_only", { visibility: "internal_only" }],
    ["restricted", { status: "restricted" }], ["experimental", { status: "experimental" }],
    ["future", { status: "future" }], ["deprecated", { status: "deprecated" }],
    ["sem sugestão", { canBeSuggested: false }], ["sem handoff", { canReceiveHandoff: false }],
    ["flag não booleana", { canBeSuggested: "true" }],
  ];
  for (const [label, change] of deviations) assert.equal(decide(entry({ ...activeParticipation, ...change }), "guardian"), "unavailable", label);
  assert.equal(decide([], "guardian"), "unavailable", "fora do catálogo do workspace");
  assert.equal(decide([{ id: "EIAH", participation: activeParticipation }], "guardian"), "unavailable");
  for (const bad of [null, undefined, {}, "x", 1]) assert.equal(decide(bad, "guardian"), "unverified", String(bad));
  assert.equal(decide(entry(null), "guardian"), "unverified", "participação ausente");
  assert.equal(decide(entry(undefined), "guardian"), "unverified");
  for (const id of ["", "   ", null as unknown as string, 7 as unknown as string]) assert.equal(decide(entry(activeParticipation), id), "unverified", String(id));
});

test("T10 todos os candidatos do bridge existem no registro canônico de agentes", () => {
  const services = harness({}, authA).load(resolve("apps/api/src/services/agents.ts"));
  for (const id of IMOB_BACKING_SPECIALIST_AGENT_IDS) assert.equal(services.hasCoreAgentProfile(id), true, `${id} precisa existir no registro`);
  const canonical = IMOB_BACKING_SPECIALIST_AGENT_IDS.map((id) => services.resolveAgentId(id));
  assert.equal(new Set(canonical).size, canonical.length, "ids canônicos distintos");
});

test("T11 inscrito no workspace (política + delegação) fica disponível; os demais, indisponíveis", async () => {
  const { result } = await availabilityOf(subscribed(["guardian", "Diarias", "I_BC", "fin-nexus"]), T, W);
  assert.deepEqual(result, { I_BC: "available", Diarias: "available", J_360: "unavailable", "fin-nexus": "available", guardian: "available" });
});

test("T12 isolamento: inscrição de outro workspace ou de outro tenant nunca torna o agente disponível", async () => {
  const fixture = subscribed(["guardian", "I_BC"], T, W);
  const same = (await availabilityOf(fixture, T, W)).result;
  assert.equal(same.guardian, "available");
  for (const [tenant, workspace] of [[T, W2], [T2, W], [T2, W2]] as const) {
    const other = (await availabilityOf(fixture, tenant, workspace)).result;
    assert.deepEqual(Object.values(other).filter((value) => value !== "unavailable"), [], `${tenant}/${workspace}`);
  }
  // política do workspace sem delegação ativa, e delegação sem política do workspace, não bastam
  const onlyPolicy = (await availabilityOf({ policies: [policy(T, W, "guardian")], marketplaceItems: [item("mkt-guardian", "guardian")] }, T, W)).result;
  const onlyDelegation = (await availabilityOf({ delegations: [delegation(T, "mkt-guardian")], marketplaceItems: [item("mkt-guardian", "guardian")] }, T, W)).result;
  assert.equal(onlyPolicy.guardian, "unavailable");
  assert.equal(onlyDelegation.guardian, "unavailable");
  // delegação expirada não conta
  const expired = { ...subscribed(["guardian"]), delegations: [{ ...delegation(T, "mkt-guardian"), validUntil: new Date(Date.now() - 1000) }] };
  assert.equal((await availabilityOf(expired, T, W)).result.guardian, "unavailable");
});

test("T13 estado operacional: perfil que não permite sugestão, handoff ou visibilidade torna o agente indisponível", async () => {
  const profile = (participation: Row) => ({
    id: "ap-guardian", agent: "guardian", name: "Guardian", description: "synthetic", model: "synthetic-model", systemPrompt: SENTINEL_PROMPT, tools: [],
    participation: { agentId: "guardian", requiresEntitlement: false, requiredModules: [], requiredWorkspaceCapabilities: [], ...activeParticipation, ...participation },
    createdAt: new Date(), updatedAt: new Date(),
  });
  const base = subscribed(["guardian"]);
  assert.equal((await availabilityOf({ ...base, agentProfiles: [profile({})] }, T, W)).result.guardian, "available");
  for (const change of [{ canBeSuggested: false }, { canReceiveHandoff: false }, { visibility: "hidden" }, { visibility: "internal_only" }]) {
    assert.equal((await availabilityOf({ ...base, agentProfiles: [profile(change)] }, T, W)).result.guardian, "unavailable", JSON.stringify(change));
  }
});

test("T14 falha de consulta, escopo inválido e lista vazia: não verificado, sem lançar, sem presumir disponibilidade", async () => {
  const h = harness(subscribed(["guardian"]), authA);
  const services = h.load(resolve("apps/api/src/services/agents.ts"));
  const ids = ["guardian", "I_BC"];
  for (const table of ["pricing", "agentProfile", "delegationPolicy", "tenantActionPolicy"] as const) {
    const broken = { ...h.db, [table]: { findMany: async () => { throw new Error("falha sintética de consulta"); } } };
    assert.deepEqual(await services.readAgentAvailability({ tenantId: T, workspaceId: W, agentIds: ids, client: broken }), { guardian: "unverified", I_BC: "unverified" }, table);
  }
  for (const [tenantId, workspaceId] of [["", W], [T, ""], ["  ", W], [undefined, W], [T, undefined]] as const) {
    assert.deepEqual(await services.readAgentAvailability({ tenantId, workspaceId, agentIds: ids, client: h.db }), { guardian: "unverified", I_BC: "unverified" }, `${tenantId}/${workspaceId}`);
  }
  assert.deepEqual(await services.readAgentAvailability({ tenantId: T, workspaceId: W, agentIds: [], client: h.db }), {});
  assert.deepEqual(await services.readAgentAvailability({ tenantId: T, workspaceId: W, agentIds: ["guardian", "guardian", "", "  "], client: h.db }), { guardian: "available" }, "ids duplicados ou vazios são ignorados");
});

test("T15 a disponibilidade é derivada do mesmo catálogo que o Front Door consome (listAgents), sem regra paralela", async () => {
  const { h, services } = await availabilityOf(subscribed(["guardian", "Diarias"]), T, W);
  const catalog = await services.listAgents(T, W, h.db);
  const listed = new Map<string, Row>(catalog.map((agent: Row) => [services.resolveAgentId(agent.id), agent]));
  const result = await services.readAgentAvailability({ tenantId: T, workspaceId: W, agentIds: [...IMOB_BACKING_SPECIALIST_AGENT_IDS], client: h.db });
  for (const id of IMOB_BACKING_SPECIALIST_AGENT_IDS) {
    const entry = listed.get(services.resolveAgentId(id));
    const p = entry?.participation;
    const web = Boolean(p && p.visibility === "visible" && p.status === "active" && p.canBeSuggested && p.canReceiveHandoff);
    assert.equal(result[id] === "available", web, `${id}: regra equivalente a canSuggestAgent && canHandoffToAgent do Front Door`);
  }
});

// ---------------------------------------------------------------------------------------------
// Descoberta transversal de capacidades (somente leitura): necessidade estruturada -> estado + modelos + ação legítima
// ---------------------------------------------------------------------------------------------

const NEED = { needId: "imob.listing.promotion", domain: "marketing", capability: "campaign", label: "Campanha de divulgação do imóvel" };
const marketplaceMkt = (over: Row = {}) => ({ ...item("mkt-MKT", "MKT"), trustScore: 0.9, ...over });
const recipe = (over: Row = {}): Row => ({
  id: "rec-1", tenantId: T, agentId: "MKT", title: "Campanha de lançamento", summary: "Plano multicanal para divulgação", tags: ["imob"],
  status: "homologated", workspaceScopeMode: "all_workspaces", workspaceScopeIds: [], homologatedAt: new Date("2026-10-01T00:00:00Z"), deprecatedAt: null,
  instructions: "SENTINEL_INSTRUCTIONS_9c1", content: { steps: ["SENTINEL_CONTENT_9c1"] }, ...over,
});

// Autoridade de contratação (AUTHZ-SCOPE-1): exige membership ATIVA + designação `holder` ativa (registro próprio).
// Permissões de membership, papéis, política `marketplace.subscribe` e escopos administrativos NÃO a produzem.
const SUBSCRIBE = "marketplace.subscribe";
const membership = (over: Row = {}) => ({ tenantId: T, workspaceId: W, userId: "synthetic-member", status: "active", ...over });
const designation = (over: Row = {}) => ({
  id: "cad_fixture_holder", tenantId: T, workspaceId: W, userId: "synthetic-member", scope: SUBSCRIBE, role: "holder",
  limits: { allowedScopes: ["read", "execute"], maxValidityDays: 90 }, validUntil: new Date(Date.now() + 30 * 86_400_000), revokedAt: null,
  grantedByUserId: "synthetic-grantor", grantorDesignationId: "cad_fixture_grantor", evidenceRef: "FIXTURE-EVIDENCE-1", ...over,
});
const withAuthority = (fixture: Fixture, over: Row = {}, membershipOver: Row = {}): Fixture => ({
  ...fixture,
  memberships: [...(fixture.memberships ?? []), membership(membershipOver)],
  designations: [...(fixture.designations ?? []), designation(over)],
});

async function discover(fixture: Fixture, tenantId = T, workspaceId = W, need: Row = NEED, actor: Row | null = { userId: authA.userId }) {
  const h = harness(fixture, authA);
  const module = h.load(resolve("apps/api/src/services/capabilityDiscovery.ts"));
  const result = await module.discoverCapabilityNeed({ need, tenantId, workspaceId, client: h.db, ...(actor ? { actor } : {}) });
  return { h, module, result };
}

test("T16 descoberta estrutural: domínio + capacidade resolvem o provedor declarado, sem texto do usuário", async () => {
  const { result } = await discover({ ...enabled(["MKT"]), recipes: [recipe()] });
  assert.deepEqual(result.need, NEED);
  assert.equal(result.provider.agentId, "MKT");
  assert.equal(result.provider.origin, "agent_registry");
  assert.ok(result.provider.declaredCapabilities.length >= 1, "capacidades declaradas pelo registro");
  assert.match(result.provider.declaredCapabilities[0], /campanha/i);

  const unknown = await discover({}, T, W, { needId: "x.y", domain: "juridico", capability: "parecer" });
  assert.equal(unknown.result.state, "indisponivel");
  assert.deepEqual(unknown.result.reasons, ["NO_DECLARED_PROVIDER"]);
  assert.equal(unknown.result.provider, null);
  assert.deepEqual(unknown.result.nextAction, { kind: "none", actionDomain: null });

  for (const bad of [{ needId: "b", domain: "", capability: "campaign" }, { needId: "b", domain: "marketing", capability: "a b" }, { needId: "b", domain: "../x", capability: "campaign" }]) {
    const invalid = (await discover({}, T, W, bad)).result;
    assert.equal(invalid.state, "nao_verificado", JSON.stringify(bad));
    assert.deepEqual(invalid.nextAction, { kind: "none", actionDomain: null });
  }

  const source = readFileSync(resolve("apps/api/src/services/capabilityDiscovery.ts"), "utf8");
  assert.doesNotMatch(source, /specialistExplainCatalog|userText|utterance|\bmessage\b/i, "o resolvedor não recebe nem interpreta texto do usuário");
});

test("T17 estados: habilitado, habilitavel, indisponivel e participação fechada são distintos", async () => {
  // existe no Marketplace, mas não está habilitado => habilitavel (nunca habilitado)
  const listed = (await discover({ marketplaceItems: [marketplaceMkt()], recipes: [recipe()] })).result;
  assert.equal(listed.state, "habilitavel");
  assert.deepEqual(listed.reasons, ["NOT_ENABLED_IN_WORKSPACE"]);
  assert.equal(listed.provider.agentId, "MKT");
  assert.equal(listed.enablement.marketplaceItemId, "mkt-MKT");
  assert.equal(listed.enablement.visibility, "public");
  assert.ok(listed.enablement.conditions.some((line: string) => /confirmação humana explícita/i.test(line)));
  // AUTHZ-SCOPE-1: habilitável NÃO implica contratação autorizada. Sem autoridade a ação de contratação nem é emitida.
  assert.equal(listed.authority.status, "somente_consulta");
  assert.deepEqual(listed.nextAction, { kind: "request_approval", actionDomain: "agent_enablement", enabled: false, reason: "APPROVAL_REQUEST_NOT_IMPLEMENTED", requiredAuthority: "marketplace.subscribe" });
  const authorizedListed = (await discover(withAuthority({ marketplaceItems: [marketplaceMkt()], recipes: [recipe()] }))).result;
  assert.equal(authorizedListed.state, "habilitavel");
  assert.equal(authorizedListed.authority.status, "contratacao_autorizada");
  assert.deepEqual(authorizedListed.nextAction, { kind: "review_commercial_terms", actionDomain: "agent_enablement", requiresHumanConfirmation: true, marketplaceItemId: "mkt-MKT", path: "/app/marketplace" });

  // inscrito (política do workspace + delegação ativa) => habilitado; o encaminhamento operacional ainda não existe
  const active = (await discover({ ...enabled(["MKT"]), recipes: [recipe()] })).result;
  assert.equal(active.state, "habilitado");
  assert.deepEqual(active.reasons, []);
  assert.equal(active.enablement, null);
  assert.deepEqual(active.nextAction, { kind: "request_work", actionDomain: "agent_work", enabled: false, reason: "OPERATIONAL_HANDOFF_NOT_IMPLEMENTED" });

  // fora do Marketplace e não habilitado => indisponivel
  const absent = (await discover({})).result;
  assert.equal(absent.state, "indisponivel");
  assert.deepEqual(absent.reasons, ["NOT_IN_MARKETPLACE"]);
  assert.deepEqual(absent.nextAction, { kind: "none", actionDomain: null });

  // item privado de outro tenant não é elegível; item privado do próprio tenant é
  const foreignPrivate = (await discover({ marketplaceItems: [marketplaceMkt({ isPublic: false, publisherId: T2 })] })).result;
  assert.equal(foreignPrivate.state, "indisponivel");
  const ownPrivate = (await discover({ marketplaceItems: [marketplaceMkt({ isPublic: false, publisherId: T })] })).result;
  assert.equal(ownPrivate.state, "habilitavel");
  assert.equal(ownPrivate.enablement.visibility, "own_tenant");

  // item de outro tipo com o mesmo nome não conta
  const wrongType = (await discover({ marketplaceItems: [marketplaceMkt({ type: "tool" })] })).result;
  assert.equal(wrongType.state, "indisponivel");

  // habilitado no catálogo, mas com participação fechada => indisponivel (e sem ação)
  const closedProfile = {
    id: "ap-mkt", agent: "MKT", name: "Marketing GPS", description: "synthetic", model: "synthetic-model", systemPrompt: SENTINEL_PROMPT, tools: [],
    participation: { agentId: "MKT", requiresEntitlement: false, requiredModules: [], requiredWorkspaceCapabilities: [], ...activeParticipation, canBeSuggested: false },
    createdAt: new Date(), updatedAt: new Date(),
  };
  const closed = (await discover({ ...enabled(["MKT"]), agentProfiles: [closedProfile], recipes: [recipe()] })).result;
  assert.equal(closed.state, "indisponivel");
  assert.deepEqual(closed.reasons, ["PARTICIPATION_NOT_ACTIVE"]);
  assert.deepEqual(closed.nextAction, { kind: "none", actionDomain: null });
  assert.deepEqual(closed.recipes, { status: "nao_aplicavel", items: [] }, "sem disponibilidade, nenhum modelo é oferecido");
});

test("T18 modelos: somente homologados, do tenant, compatíveis com o workspace e com o agente; sem instruções ou conteúdo", async () => {
  const fixture: Fixture = {
    ...enabled(["MKT"]),
    recipes: [
      recipe({ id: "ok-all" }),
      recipe({ id: "ok-selected", title: "Modelo do workspace A", workspaceScopeMode: "selected_workspaces", workspaceScopeIds: [W] }),
      recipe({ id: "out-scope", workspaceScopeMode: "selected_workspaces", workspaceScopeIds: [W2] }),
      recipe({ id: "draft", status: "draft" }),
      recipe({ id: "deprecated", deprecatedAt: new Date() }),
      recipe({ id: "other-agent", agentId: "J_360" }),
      recipe({ id: "other-tenant", tenantId: T2 }),
      recipe({ id: "alias", agentId: "mkt", title: "Alias do agente" }),
    ],
  };
  const { result, h } = await discover(fixture);
  assert.equal(result.recipes.status, "ok");
  assert.deepEqual(result.recipes.items.map((entry: Row) => entry.id).sort(), ["alias", "ok-all", "ok-selected"]);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("SENTINEL_INSTRUCTIONS_9c1"), false, "instruções internas nunca saem");
  assert.equal(serialized.includes("SENTINEL_CONTENT_9c1"), false, "conteúdo interno nunca sai");
  for (const entry of result.recipes.items) assert.deepEqual(Object.keys(entry).sort(), ["homologatedAt", "id", "summary", "tags", "title"]);
  assert.deepEqual(
    h.db.__sql.filter((query: Row) => /FROM tenant_recipes/.test(query.text)).map((query: Row) => query.values),
    [[T, W]],
    "uma consulta de modelos, parametrizada por tenant e workspace",
  );

  // outro workspace do mesmo tenant só vê os modelos do seu escopo
  const other = (await discover({ ...fixture, ...enabled(["MKT"], T, W2) }, T, W2)).result;
  assert.deepEqual(other.recipes.items.map((entry: Row) => entry.id).sort(), ["alias", "ok-all", "out-scope"]);
  // habilitável: modelos homologados são informativos; indisponível/não verificado: nenhum
  const listed = (await discover({ marketplaceItems: [marketplaceMkt()], recipes: [recipe()] })).result;
  assert.equal(listed.recipes.items.length, 1);
  assert.deepEqual((await discover({ recipes: [recipe()] })).result.recipes, { status: "nao_aplicavel", items: [] });
  // sem nenhum modelo homologado: lista vazia, status ok
  assert.deepEqual((await discover({ ...enabled(["MKT"]), recipes: [] })).result.recipes, { status: "ok", items: [] });
});

test("T19 isolamento entre tenants e workspaces na descoberta", async () => {
  const fixture: Fixture = {
    ...enabled(["MKT"], T, W),
    recipes: [recipe(), recipe({ id: "only-workspace-a", workspaceScopeMode: "selected_workspaces", workspaceScopeIds: [W] })],
  };
  const home = (await discover(fixture, T, W)).result;
  assert.equal(home.state, "habilitado");
  assert.deepEqual(home.recipes.items.map((entry: Row) => entry.id).sort(), ["only-workspace-a", "rec-1"]);

  // mesmo tenant, outro workspace: a habilitação do workspace A não vale; modelo restrito ao A não aparece
  const sibling = (await discover(fixture, T, W2)).result;
  assert.notEqual(sibling.state, "habilitado");
  assert.notEqual(sibling.nextAction.kind, "request_work");
  assert.deepEqual(sibling.recipes.items.map((entry: Row) => entry.id), ["rec-1"], "apenas o modelo de escopo all_workspaces");

  // outro tenant: nada do tenant A (habilitação, modelos ou ação)
  for (const workspace of [W, W2]) {
    const { result } = await discover(fixture, T2, workspace);
    assert.notEqual(result.state, "habilitado", `${T2}/${workspace}`);
    assert.deepEqual(result.recipes.items, [], `${T2}/${workspace}: modelos de outro tenant nunca aparecem`);
    assert.notEqual(result.nextAction.kind, "request_work", `${T2}/${workspace}`);
  }
  // item privado publicado por outro tenant não vira habilitável para este
  const foreign = await discover({ ...fixture, marketplaceItems: [marketplaceMkt({ isPublic: false, publisherId: T2 })], delegations: [], policies: [] }, T, W);
  assert.equal(foreign.result.state, "indisponivel");
});

test("T20 falhas de consulta e escopo inválido: não verificado, sem ação, sem lançar", async () => {
  const none = { kind: "none", actionDomain: null };
  for (const table of ["pricing", "agentProfile", "delegationPolicy", "tenantActionPolicy"]) {
    const { result } = await discover({ ...enabled(["MKT"]), failTables: [table], recipes: [recipe()] });
    assert.equal(result.state, "nao_verificado", table);
    assert.deepEqual(result.reasons, ["CATALOG_QUERY_FAILED"], table);
    assert.deepEqual(result.nextAction, none, table);
    assert.deepEqual(result.recipes, { status: "nao_aplicavel", items: [] }, table);
  }
  const market = (await discover({ failTables: ["marketplaceItem"] })).result;
  assert.equal(market.state, "nao_verificado");
  assert.deepEqual(market.reasons, ["MARKETPLACE_QUERY_FAILED"]);
  assert.deepEqual(market.nextAction, none);
  // falha só nos modelos: o estado do agente é mantido e os modelos ficam "nao_verificado"
  const noRecipes = (await discover({ ...enabled(["MKT"]), failTables: ["tenant_recipes"] })).result;
  assert.equal(noRecipes.state, "habilitado");
  assert.deepEqual(noRecipes.recipes, { status: "nao_verificado", items: [] });
  const listedNoRecipes = (await discover({ marketplaceItems: [marketplaceMkt()], failTables: ["tenant_recipes"] })).result;
  assert.equal(listedNoRecipes.state, "habilitavel");
  assert.equal(listedNoRecipes.recipes.status, "nao_verificado");
  for (const [tenant, workspace] of [["", W], [T, ""], ["  ", W]] as const) {
    const { result } = await discover(enabled(["MKT"]), tenant, workspace);
    assert.equal(result.state, "nao_verificado");
    assert.deepEqual(result.reasons, ["SCOPE_INVALID"]);
    assert.deepEqual(result.nextAction, none);
  }
  const h = harness({}, authA);
  const module = h.load(resolve("apps/api/src/services/capabilityDiscovery.ts"));
  assert.deepEqual((await module.discoverCapabilityNeeds({ needs: [NEED], tenantId: T, workspaceId: W })).map((entry: Row) => entry.reasons), [["READERS_UNAVAILABLE"]], "sem cliente nem leitores");
  assert.deepEqual(await module.discoverCapabilityNeeds({ needs: null, tenantId: T, workspaceId: W, client: h.db }), []);
});

test("T21 somente leitura; habilitar agente é estruturalmente distinto de convidar uma pessoa", async () => {
  for (const fixture of [
    { marketplaceItems: [marketplaceMkt()], recipes: [recipe()] },
    { ...enabled(["MKT"]), recipes: [recipe()] },
    {},
  ] as Fixture[]) {
    const before = JSON.stringify(fixture);
    const { result, h } = await discover(fixture);
    assert.equal(JSON.stringify(fixture), before, "o fixture não mudou");
    assert.deepEqual(h.db.__writes, [], "nenhuma escrita (assinatura, política, delegação, DDL) foi tentada");
    assert.equal(["agent_enablement", "agent_work", null].includes(result.nextAction.actionDomain), true);
    assert.equal(/invit|convid|member|membro|usu[aá]rio/i.test(JSON.stringify(result.nextAction)), false, "nenhuma ação de convite de pessoa");
  }
  const source = readFileSync(resolve("apps/api/src/services/capabilityDiscovery.ts"), "utf8").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(source, /\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b|ensureTenantRecipesTable|\.create\(|\.update\(|\.upsert\(|\.delete\(|\$executeRaw/i);
});

test("T22 rota GET /api/agents/capabilities/discover: autenticada, validada, somente leitura e no escopo do token", async () => {
  const h = harness({ ...enabled(["MKT"]), recipes: [recipe()] }, authA);
  const url = "/api/agents/capabilities/discover?domain=marketing&capability=campaign";
  assert.equal((await supertest(h.app).get(url)).status, 401);
  const ok = await supertest(h.app).get(url).set("authorization", "Bearer synthetic");
  assert.equal(ok.status, 200);
  assert.equal(ok.body.ok, true);
  assert.equal(ok.body.item.state, "habilitado");
  assert.equal(ok.body.item.provider.agentId, "MKT");
  assert.equal(ok.body.item.recipes.items.length, 1);
  assert.match(String(ok.headers["cache-control"]), /no-store/);
  const upper = await supertest(h.app).get("/api/agents/capabilities/discover?domain=Marketing&capability=CAMPAIGN").set("authorization", "Bearer synthetic");
  assert.equal(upper.body.item.state, "habilitado");
  for (const bad of ["", "?domain=marketing", "?capability=campaign", "?domain=a%20b&capability=campaign", "?domain=marketing&capability=../x"]) {
    const response = await supertest(h.app).get(`/api/agents/capabilities/discover${bad}`).set("authorization", "Bearer synthetic");
    assert.equal(response.status, 400, bad);
    assert.equal(response.body.error.code, "INVALID_QUERY");
  }
  const unknown = await supertest(h.app).get("/api/agents/capabilities/discover?domain=juridico&capability=parecer").set("authorization", "Bearer synthetic");
  assert.equal(unknown.status, 200);
  assert.equal(unknown.body.item.state, "indisponivel");
  // outro token (outro tenant) não enxerga a habilitação deste
  const foreign = harness({ ...enabled(["MKT"]), recipes: [recipe()] }, { ...authA, tenantId: T2, workspaceId: W2 });
  const response = await supertest(foreign.app).get(url).set("authorization", "Bearer synthetic");
  assert.notEqual(response.body.item.state, "habilitado");
  assert.deepEqual(response.body.item.recipes.items, []);
  assert.deepEqual(h.db.__writes, []);
  // /agents/:name continua resolvendo (a rota nova não o captura)
  assert.equal((await supertest(h.app).get("/api/agents/EIAH").set("authorization", "Bearer synthetic")).status, 200);
});

test("T23 o SQL de modelos reproduz o filtro de /tenant-recipes e não seleciona instruções nem conteúdo", () => {
  const source = readFileSync(resolve("apps/api/src/services/capabilityDiscovery.ts"), "utf8");
  const sql = /client\.\$queryRaw<RecipeEntry\[\]>`([\s\S]*?)`/.exec(source)?.[1] ?? "";
  assert.ok(sql.length > 0, "consulta bruta localizada");
  assert.match(sql, /FROM tenant_recipes/);
  assert.match(sql, /WHERE tenant_id = \$\{tenantId\}/);
  assert.match(sql, /AND status = 'homologated'/);
  assert.match(sql, /workspace_scope_mode = 'all_workspaces'\s+OR workspace_scope_ids \? \$\{workspaceId\}/);
  assert.doesNotMatch(sql, /\binstructions\b|\bcontent\b|created_by_user_id|updated_by_user_id/);
  const route = readFileSync(resolve("apps/api/src/routes/tenant-recipes.ts"), "utf8");
  assert.match(route, /AND status = 'homologated'/);
  assert.match(route, /workspace_scope_mode = 'all_workspaces'\s+OR workspace_scope_ids \? \$\{effectiveWorkspaceId\}/);
});

// ---------------------------------------------------------------------------------------------
// AUTHZ-SCOPE-1: autoridade de contratação (marketplace.subscribe) no servidor
// ---------------------------------------------------------------------------------------------

const LISTED: Fixture = { marketplaceItems: [marketplaceMkt()], recipes: [recipe()] };

test("T24 eixo de autoridade: habilitável nunca implica contratação autorizada; descoberta e modelos seguem visíveis", async () => {
  // Nada disto produz autoridade: nem a string "marketplace.subscribe" nem papéis privilegiados na membership.
  const roleLikePermissions = ["marketplace.subscribe", "products.activate", "actions.admin", "tools.admin", "workspace.manage_roles", "workspace.manage_members", "imob.stage.*"];
  const cases: Array<[string, Fixture, string]> = [
    ["sem membership e sem designação", LISTED, "MEMBERSHIP_NOT_FOUND"],
    ["membership ativa, sem designação", { ...LISTED, memberships: [membership()] }, "DESIGNATION_NOT_FOUND"],
    ["membership com permissões privilegiadas e até marketplace.subscribe no papel, sem designação", { ...LISTED, memberships: [membership({ permissions: roleLikePermissions, roleKey: "founder" })] }, "DESIGNATION_NOT_FOUND"],
    ["política tenant/workspace marketplace.subscribe não substitui a designação", { ...LISTED, policies: [policy(T, W, SUBSCRIBE)], memberships: [membership()] }, "DESIGNATION_NOT_FOUND"],
    ["designação sem membership", { ...LISTED, designations: [designation()] }, "MEMBERSHIP_NOT_FOUND"],
    ["membership não ativa (invited)", withAuthority(LISTED, {}, { status: "invited" }), "MEMBERSHIP_NOT_ACTIVE"],
    ["membership suspensa", withAuthority(LISTED, {}, { status: "suspended" }), "MEMBERSHIP_NOT_ACTIVE"],
    ["designação revogada", withAuthority(LISTED, { revokedAt: new Date() }), "DESIGNATION_NOT_FOUND"],
    ["designação expirada", withAuthority(LISTED, { validUntil: new Date(Date.now() - 1000) }), "DESIGNATION_NOT_FOUND"],
    ["autoridade de CONCEDER não é autoridade de contratar", withAuthority(LISTED, { role: "grantor" }), "DESIGNATION_NOT_FOUND"],
    ["designação de outra pessoa", withAuthority(LISTED, { userId: "someone-else" }), "DESIGNATION_NOT_FOUND"],
    ["designação de outro workspace", { ...LISTED, memberships: [membership()], designations: [designation({ workspaceId: W2 })] }, "DESIGNATION_NOT_FOUND"],
    ["designação de outro tenant", { ...LISTED, memberships: [membership()], designations: [designation({ tenantId: T2 })] }, "DESIGNATION_NOT_FOUND"],
    ["membership de outro workspace", withAuthority(LISTED, {}, { workspaceId: W2 }), "MEMBERSHIP_NOT_FOUND"],
    ["leitura da membership indisponível", { ...withAuthority(LISTED), failTables: ["eiah_workspace_memberships"] }, "MEMBERSHIP_UNAVAILABLE"],
    ["leitura da designação indisponível", { ...withAuthority(LISTED), failTables: ["eiah_commercial_authority_designations"] }, "DESIGNATION_UNAVAILABLE"],
  ];
  for (const [label, fixture, reason] of cases) {
    const { result, h } = await discover(fixture);
    assert.equal(result.state, "habilitavel", `${label}: a descoberta continua`);
    assert.equal(result.authority.status, "somente_consulta", label);
    assert.equal(result.authority.reasonCode, reason, label);
    assert.equal(result.provider.agentId, "MKT", `${label}: recomendação visível`);
    assert.equal(result.recipes.items.length, 1, `${label}: modelos homologados visíveis`);
    assert.equal(result.nextAction.kind, "request_approval", label);
    assert.equal(result.nextAction.enabled, false, label);
    assert.equal(JSON.stringify(result.nextAction).includes("/app/marketplace"), false, `${label}: nenhum caminho de contratação`);
    assert.deepEqual(h.db.__writes, [], `${label}: nenhuma escrita`);
  }

  const granted = (await discover(withAuthority(LISTED))).result;
  assert.equal(granted.state, "habilitavel");
  assert.equal(granted.authority.status, "contratacao_autorizada");
  assert.equal(granted.authority.reasonCode, "AUTHORITY_GRANTED");
  assert.equal(granted.nextAction.kind, "review_commercial_terms");
  assert.equal(granted.nextAction.requiresHumanConfirmation, true);

  // os dois eixos são independentes: autorizada + já habilitado => estado habilitado, sem ação de contratação
  const hired = (await discover(withAuthority({ ...enabled(["MKT"]), recipes: [recipe()] }))).result;
  assert.equal(hired.state, "habilitado");
  assert.equal(hired.authority.status, "contratacao_autorizada");
  assert.equal(hired.nextAction.kind, "request_work");
  assert.equal(hired.nextAction.enabled, false);
});

test("T24b identidade, escopo e ausência de leitura da autoridade: sempre somente_consulta (fail-closed)", async () => {
  const full = withAuthority(LISTED);
  for (const actor of [null, {}, { userId: null }, { userId: "" }, { userId: "   " }, { userId: 42 }]) {
    const { result } = await discover(full, T, W, NEED, actor as Row | null);
    assert.equal(result.authority.status, "somente_consulta", JSON.stringify(actor));
    assert.equal(result.authority.reasonCode, "IDENTITY_REQUIRED", JSON.stringify(actor));
    assert.equal(result.nextAction.kind, "request_approval");
  }
  for (const [tenant, workspace] of [[T, W2], [T2, W], [T2, W2]] as const) {
    const { result } = await discover(full, tenant, workspace);
    assert.equal(result.authority.status, "somente_consulta", `${tenant}/${workspace}`);
    assert.notEqual(result.nextAction.kind, "review_commercial_terms");
  }
  const h = harness(full, authA);
  const module = h.load(resolve("apps/api/src/services/capabilityDiscovery.ts"));
  const readers = module.createDefaultCapabilityReaders(h.db);
  const noAuthorityReader = (await module.discoverCapabilityNeeds({ needs: [NEED], tenantId: T, workspaceId: W, readers, actor: { userId: authA.userId } }))[0];
  assert.equal(noAuthorityReader.state, "habilitavel");
  assert.equal(noAuthorityReader.authority.status, "somente_consulta");
  assert.equal(noAuthorityReader.authority.reasonCode, "AUTHORITY_UNAVAILABLE");

  const service = h.load(resolve("apps/api/src/services/marketplaceSubscriptionAuthority.ts"));
  const okMembership = async () => ({ status: "active" });
  const okDesignation = async () => ({ id: "cad_x", limits: { allowedScopes: ["read"], maxValidityDays: 30 } });
  const actor = { tenantId: T, workspaceId: W, userId: "u" };
  const decide = (deps: Row, who: Row = actor) => service.evaluateSubscriptionAuthority(who, deps);
  assert.equal((await decide({ readMembership: async () => { throw new Error("down"); }, readDesignation: okDesignation })).reasonCode, "MEMBERSHIP_UNAVAILABLE");
  assert.equal((await decide({ readMembership: okMembership, readDesignation: async () => { throw new Error("down"); } })).reasonCode, "DESIGNATION_UNAVAILABLE");
  assert.equal((await decide({ readMembership: async () => ({ status: "ACTIVE " }), readDesignation: okDesignation })).allowed, true, "status normalizado");
  const granted = await decide({ readMembership: okMembership, readDesignation: okDesignation });
  assert.deepEqual([granted.allowed, granted.designationId, granted.limits], [true, "cad_x", { allowedScopes: ["read"], maxValidityDays: 30 }]);
  for (const who of [{ tenantId: "", workspaceId: W, userId: "u" }, { tenantId: T, workspaceId: " ", userId: "u" }, { tenantId: T, workspaceId: W, userId: undefined }]) {
    const never = { readMembership: async () => { throw new Error("não deveria consultar"); }, readDesignation: async () => { throw new Error("não deveria consultar"); } };
    assert.equal((await decide(never, who as Row)).allowed, false);
  }
  // limites: a contratação concreta precisa caber na designação
  const within = (scope: string, days: number) => service.subscriptionLimitViolation(granted, { scope, validUntil: new Date(Date.now() + days * 86_400_000) });
  assert.equal(within("read", 10), null);
  assert.equal(within("execute", 10), "SCOPE_NOT_ALLOWED");
  assert.equal(within("admin", 10), "SCOPE_NOT_ALLOWED");
  assert.equal(within("read", 31), "VALIDITY_EXCEEDS_LIMIT");
  assert.equal(service.subscriptionLimitViolation({ allowed: true, reasonCode: "AUTHORITY_GRANTED" }, { scope: "read", validUntil: new Date(Date.now() + 1000) }), "LIMITS_UNKNOWN");
  assert.equal(service.subscriptionLimitViolation({ allowed: false, reasonCode: "DESIGNATION_NOT_FOUND" }, { scope: "read", validUntil: new Date(Date.now() + 1000) }), "LIMITS_UNKNOWN");
  assert.equal(within("read", -1), "VALIDITY_INVALID");
});

// Rotas reais de mutação montadas no Express com identidade controlada. A cadeia `enforceTenant` (autenticação por
// token/banco) é substituída pelo contexto abaixo; o handler executado é o código real da rota.
function mutationApp(h: ReturnType<typeof harness>, file: string, exportName: string, method: "post" | "patch", path: string, auth: Row | null) {
  const router = h.load(resolve(file))[exportName];
  const layer = router.stack.find((entry: Row) => entry.route?.path === path && entry.route.methods[method]);
  assert.ok(layer, `${method.toUpperCase()} ${path} existe em ${file}`);
  const app = express();
  app.use(express.json());
  app.use((req: Row, _res, next) => { if (auth) { req.authContext = auth; req.prisma = h.db; } next(); });
  (app as any)[method](`/api${path}`, ...layer.route.stack.map((entry: Row) => entry.handle));
  return app;
}

const publisherItem = (over: Row = {}) => ({ ...item("mkt-MKT", "MKT"), version: "1", trustScore: 70, createdAt: new Date(), ...over });
const subscribeFixture = (over: Fixture = {}): Fixture => ({ marketplaceItems: [publisherItem()], ...over });
// Token bruto sentinela enviado em toda chamada: nenhum registro de auditoria nem resposta pode carregá-lo.
const RAW_BEARER = "SENTINEL_RAW_BEARER_5521.payload.signature";
const subscribeAs = (h: ReturnType<typeof harness>, auth: Row | null, id = "mkt-MKT", body: Row = {}) =>
  supertest(mutationApp(h, "apps/api/src/routes/marketplace.ts", "marketplaceRouter", "post", "/marketplace/:id/subscribe", auth))
    .post(`/api/marketplace/${id}/subscribe`).set("authorization", `Bearer ${RAW_BEARER}`).send(body);
const assertNoRawToken = (h: ReturnType<typeof harness>, ...bodies: unknown[]) => {
  for (const value of [h.db.__audits.map(({ prisma: _client, ...record }: Row) => record), ...bodies]) {
    const serialized = JSON.stringify(value);
    assert.equal(serialized.includes("SENTINEL_RAW_BEARER_5521"), false, "token bruto nunca é armazenado nem devolvido");
    assert.equal(/bearer\s/i.test(serialized), false);
  }
};

test("T25 POST /marketplace/:id/subscribe: sem autoridade expressa nada é contratado, mesmo chamando a API diretamente", async () => {
  const forged = { userId: "attacker", tenantId: T2, workspaceId: W2, authority: "contratacao_autorizada", scope: "admin", delegatorId: T2 };
  const denials: Array<[string, Fixture, Row | null, string, Row?]> = [
    ["token de serviço sem pessoa", withAuthority(subscribeFixture()), { ...authA, userId: undefined }, "IDENTITY_REQUIRED"],
    ["membership ativa sem designação", subscribeFixture({ memberships: [membership()] }), authA, "DESIGNATION_NOT_FOUND"],
    ["Founder/admin típico com permissões privilegiadas e marketplace.subscribe no papel, sem designação", subscribeFixture({ memberships: [membership({ roleKey: "founder", permissions: ["marketplace.subscribe", "products.activate", "workspace.manage_roles", "imob.stage.*"] })], policies: [policy(T, W, SUBSCRIBE), policy(T, W, "actions.admin")] }), authA, "DESIGNATION_NOT_FOUND"],
    ["designação de CONCEDER não contrata", withAuthority(subscribeFixture(), { role: "grantor" }), authA, "DESIGNATION_NOT_FOUND"],
    ["designação revogada", withAuthority(subscribeFixture(), { revokedAt: new Date() }), authA, "DESIGNATION_NOT_FOUND"],
    ["designação expirada", withAuthority(subscribeFixture(), { validUntil: new Date(Date.now() - 1) }), authA, "DESIGNATION_NOT_FOUND"],
    ["membership não ativa", withAuthority(subscribeFixture(), {}, { status: "revoked" }), authA, "MEMBERSHIP_NOT_ACTIVE"],
    ["outro workspace do mesmo tenant", withAuthority(subscribeFixture()), { ...authA, workspaceId: W2 }, "MEMBERSHIP_NOT_FOUND"],
    ["outro tenant", withAuthority(subscribeFixture()), { ...authA, tenantId: T2 }, "MEMBERSHIP_NOT_FOUND"],
    ["leitura da membership indisponível", { ...withAuthority(subscribeFixture()), failTables: ["eiah_workspace_memberships"] }, authA, "MEMBERSHIP_UNAVAILABLE"],
    ["leitura da designação indisponível", { ...withAuthority(subscribeFixture()), failTables: ["eiah_commercial_authority_designations"] }, authA, "DESIGNATION_UNAVAILABLE"],
    ["corpo forjado tentando declarar autoridade, tenant e escopo", subscribeFixture({ memberships: [membership()] }), authA, "DESIGNATION_NOT_FOUND", forged],
  ];
  for (const [label, fixture, auth, reason, body] of denials) {
    const h = harness(fixture, auth, { writable: true });
    const response = await subscribeAs(h, auth, "mkt-MKT", body ?? {});
    assert.equal(response.status, 403, label);
    assert.equal(response.body.error.code, "MARKETPLACE_SUBSCRIBE_FORBIDDEN", label);
    assert.equal(response.body.error.reasonCode, reason, label);
    assert.deepEqual(h.db.__writes, [], `${label}: nenhuma assinatura, cobrança, política ou delegação criada`);
    assert.deepEqual(h.db.__events.filter((event: string) => event.startsWith("write:")), [], label);
    assert.deepEqual(h.db.__audits.map((entry: Row) => entry.eventType), ["marketplace.subscribe.denied"], `${label}: a negação é registrada`);
    assert.equal(h.db.__audits[0].metadata.outcome, "denied");
    assert.equal(h.db.__audits[0].metadata.tokenId, auth?.tokenId ?? null, "somente o id do token, nunca o token");
    assertNoRawToken(h, response.body);
  }
  // a autoridade é verificada ANTES de validar o corpo ou consultar o item: sem oráculo de existência
  for (const [label, id, body] of [["corpo inválido", "mkt-MKT", { scope: "root", trustMin: -1 }], ["item inexistente", "nao-existe", {}]] as Array<[string, string, Row]>) {
    const h = harness(subscribeFixture({ memberships: [membership()] }), authA, { writable: true });
    const response = await subscribeAs(h, authA, id, body);
    assert.equal(response.status, 403, label);
    assert.deepEqual(h.db.__writes, [], label);
  }
  const anonymous = harness(subscribeFixture(), null, { writable: true });
  assert.equal((await subscribeAs(anonymous, null)).status, 500);
  assert.deepEqual(anonymous.db.__writes, []);
});

test("T26 contratação autorizada: a decisão é registrada ANTES dos efeitos, com identidade, designação, tenant, workspace, agente e condições", async () => {
  const fixture = withAuthority(subscribeFixture({ policies: [] }));
  const h = harness(fixture, authA, { writable: true });
  const response = await subscribeAs(h, authA, "mkt-MKT", { scope: "execute", trustMin: 55, validUntil: new Date(Date.now() + 30 * 86_400_000).toISOString(), tenantId: T2, workspaceId: W2 });
  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.ok(response.body.delegationId);

  // a criação idempotente do registro de habilitações (DDL) precede a decisão por desenho; não é efeito comercial
  const firstWrite = h.db.__events.findIndex((event: string) => event.startsWith("write:") && event !== "write:$executeRawUnsafe");
  const auditIndex = h.db.__events.indexOf("audit:marketplace.subscribe.authorized");
  assert.ok(auditIndex >= 0 && auditIndex < firstWrite, "registro da decisão precede qualquer efeito");
  assert.deepEqual(h.db.__audits.map((entry: Row) => entry.eventType), ["marketplace.subscribe.authorized"]);
  const audit = h.db.__audits[0];
  assert.equal(audit.tenantId, T);
  assert.equal(audit.workspaceId, W);
  assert.equal(audit.metadata.decidedBy, authA.userId);
  assert.equal(audit.metadata.tokenId, authA.tokenId);
  assert.equal(audit.metadata.authorityScope, "marketplace.subscribe");
  assert.equal(audit.metadata.decisionRef, "AUTHZ-SCOPE-1/2026-10-12");
  assert.equal(audit.metadata.outcome, "authorized");
  assert.equal(audit.metadata.target.designationId, "cad_fixture_holder", "a decisão aponta a designação que a fundamentou");
  assert.equal(audit.metadata.target.marketplaceItemId, "mkt-MKT");
  assert.equal(audit.metadata.target.agentName, "MKT");
  assert.equal(audit.metadata.target.publisherId, "synthetic-publisher");
  assert.equal(audit.metadata.target.scope, "execute");
  assert.equal(audit.metadata.target.trustMin, 55);
  assert.ok(!Number.isNaN(Date.parse(audit.metadata.target.validUntil)));
  assert.ok(!Number.isNaN(Date.parse(audit.metadata.decidedAt)));
  assertNoRawToken(h, response.body);

  assert.equal(h.db.__writes.filter((entry: string) => entry === "delegationPolicy.create").length, 1);
  const createdPolicy = (fixture.policies ?? []).find((row: Row) => row.actionName === "MKT");
  assert.ok(createdPolicy, "política do agente criada");
  assert.equal(createdPolicy.tenantId, T);
  assert.equal(createdPolicy.workspaceId, W);
  const raw = h.db.__sql.filter((query: Row) => !/FROM /.test(query.text) || /INSERT|UPDATE|CREATE/.test(query.text));
  assert.ok(h.db.__writes.every((entry: string) => /^(delegationPolicy|tenantActionPolicy|\$executeRaw|\$executeRawUnsafe)/.test(entry)), "somente os efeitos de contratação esperados");
  assert.ok(raw.length >= 3 && raw.every((query: Row) => /eiah_agent_commercial_enablements/.test(query.text)), "toda escrita bruta é do registro de habilitações: nada de membership, convite ou designação");
  // MKT é agente governado: a habilitação vincula decisão, designação, delegação e condições aceitas
  const insert = raw.find((query: Row) => /INSERT INTO eiah_agent_commercial_enablements/.test(query.text));
  assert.ok(insert, "habilitação registrada");
  assert.ok(insert.values.includes("mkt"), "chave do agente");
  assert.ok(insert.values.includes("cad_fixture_holder"), "designação que fundamentou");
  assert.ok(insert.values.includes(audit.id), "evento de auditoria da decisão");
  assert.ok(insert.values.includes(authA.userId), "pessoa que decidiu");
  assert.ok(insert.values.includes("execute") && insert.values.includes(55), "condições aceitas");
  assert.ok(insert.values.includes(response.body.delegationId), "delegação que sustenta a habilitação");
  assert.ok(response.body.enablementId?.startsWith("cae_"));
  assert.ok(h.db.__events.indexOf("audit:marketplace.subscribe.authorized") < h.db.__events.indexOf("write:$executeRaw"), "habilitação só depois da decisão registrada");
});

test("T26b limites da designação valem na contratação: escopo de delegação e prazo", async () => {
  const cases: Array<[string, Row, string]> = [
    ["escopo admin fora dos limites padrão", { scope: "admin" }, "SCOPE_NOT_ALLOWED"],
    ["prazo acima do máximo da designação", { scope: "execute", validUntil: new Date(Date.now() + 200 * 86_400_000).toISOString() }, "VALIDITY_EXCEEDS_LIMIT"],
  ];
  for (const [label, body, reason] of cases) {
    const h = harness(withAuthority(subscribeFixture()), authA, { writable: true });
    const response = await subscribeAs(h, authA, "mkt-MKT", body);
    assert.equal(response.status, 403, label);
    assert.equal(response.body.error.code, "COMMERCIAL_LIMIT_EXCEEDED", label);
    assert.equal(response.body.error.reasonCode, reason, label);
    assert.deepEqual(h.db.__writes, [], label);
    assert.deepEqual(h.db.__audits.map((entry: Row) => entry.eventType), ["marketplace.subscribe.denied"], label);
  }
  // limites mais amplos concedidos explicitamente permitem o escopo admin
  const wide = harness(withAuthority(subscribeFixture(), { limits: { allowedScopes: ["read", "execute", "admin"], maxValidityDays: 365 } }), authA, { writable: true });
  assert.equal((await subscribeAs(wide, authA, "mkt-MKT", { scope: "admin" })).status, 200);
});

test("T27 falha no registro da decisão bloqueia a contratação; nomes reservados e agentes ambíguos são recusados sem efeito", async () => {
  const noAudit = harness({ ...withAuthority(subscribeFixture()), failAudit: true }, authA, { writable: true });
  const blocked = await subscribeAs(noAudit, authA);
  assert.equal(blocked.status, 503);
  assert.equal(blocked.body.error.code, "SUBSCRIBE_DECISION_RECORD_UNAVAILABLE");
  assert.deepEqual(noAudit.db.__writes.filter((entry: string) => entry !== "$executeRawUnsafe"), [], "sem registro da decisão não há contratação (a criação idempotente do registro não é efeito comercial)");
  assert.equal(noAudit.db.__sql.some((query: Row) => /INSERT/.test(query.text)), false, "nenhuma habilitação sem a decisão registrada");
  const deniedNoAudit = harness({ ...subscribeFixture({ memberships: [membership()] }), failAudit: true }, authA, { writable: true });
  assert.equal((await subscribeAs(deniedNoAudit, authA)).status, 403);
  assert.deepEqual(deniedNoAudit.db.__writes, []);

  for (const name of ["marketplace.subscribe", "Actions.Admin", "  tools.admin  "]) {
    const reserved = harness(withAuthority(subscribeFixture({ marketplaceItems: [publisherItem({ id: "mkt-reserved", name })] })), authA, { writable: true });
    const response = await subscribeAs(reserved, authA, "mkt-reserved");
    assert.equal(response.status, 422, name);
    assert.equal(response.body.error.code, "MARKETPLACE_ITEM_NAME_RESERVED", name);
    assert.deepEqual(reserved.db.__writes, [], name);
  }

  const ambiguous = harness(withAuthority(subscribeFixture({ marketplaceItems: [publisherItem(), publisherItem({ id: "mkt-other", publisherId: "other-publisher", name: "mkt" })] })), authA, { writable: true });
  const conflict = await subscribeAs(ambiguous, authA);
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.error.code, "AGENT_IDENTITY_AMBIGUOUS");
  assert.deepEqual(ambiguous.db.__writes, []);
  const versions = harness(withAuthority(subscribeFixture({ marketplaceItems: [publisherItem(), publisherItem({ id: "mkt-v2", version: "2" })] })), authA, { writable: true });
  assert.equal((await subscribeAs(versions, authA)).status, 200);
  const hidden = harness(withAuthority(subscribeFixture({ marketplaceItems: [publisherItem({ isPublic: false, publisherId: T2 })] })), authA, { writable: true });
  const forbidden = await subscribeAs(hidden, authA);
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.body.error.code, "MARKETPLACE_FORBIDDEN");
  assert.deepEqual(hidden.db.__writes, []);
});

test("T28 publicar ou renomear item do Marketplace com nome de escopo canônico é recusado", async () => {
  const create = async (name: string) => {
    const h = harness({ marketplaceItems: [] }, authA, { writable: true });
    const response = await supertest(mutationApp(h, "apps/api/src/routes/marketplace.ts", "marketplaceRouter", "post", "/marketplace", authA))
      .post("/api/marketplace").send({ type: "agent", name, version: "1", isPublic: true });
    return { response, h };
  };
  for (const name of ["marketplace.subscribe", "ACTIONS.ADMIN", "tools.admin"]) {
    const { response, h } = await create(name);
    assert.equal(response.status, 422, name);
    assert.equal(response.body.error.code, "MARKETPLACE_ITEM_NAME_RESERVED");
    assert.deepEqual(h.db.__writes, [], name);
  }
  assert.equal((await create("MKT")).response.status, 200, "nome comum continua publicável");

  const own = publisherItem({ id: "own-1", publisherId: T });
  const rename = async (name: string) => {
    const h = harness({ marketplaceItems: [own] }, authA, { writable: true });
    const response = await supertest(mutationApp(h, "apps/api/src/routes/marketplace.ts", "marketplaceRouter", "patch", "/marketplace/:id", authA))
      .patch("/api/marketplace/own-1").send({ name });
    return { response, h };
  };
  const renamed = await rename("Marketplace.Subscribe");
  assert.equal(renamed.response.status, 422);
  assert.deepEqual(renamed.h.db.__writes, []);
  assert.equal((await rename("MKT 2")).response.status, 200);
});

const delegationBody = (over: Row = {}) => ({ delegateeId: T, marketplaceId: "mkt-MKT", scope: "execute", trustMin: 50, validUntil: new Date(Date.now() + 30 * 86_400_000).toISOString(), ...over });

test("T29 /delegations não contorna a autoridade: auto-delegação de item do Marketplace e alteração de termos pela delegatária exigem a designação", async () => {
  const post = (h: ReturnType<typeof harness>, auth: Row, body: Row) =>
    supertest(mutationApp(h, "apps/api/src/routes/delegations.ts", "delegationsRouter", "post", "/delegations", auth)).post("/api/delegations").send(body);
  const denied = harness(subscribeFixture({ memberships: [membership()] }), authA, { writable: true });
  const blocked = await post(denied, authA, delegationBody());
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.error.code, "MARKETPLACE_SUBSCRIBE_FORBIDDEN");
  assert.deepEqual(denied.db.__writes, [], "nenhuma delegação criada");
  assert.deepEqual(denied.db.__audits.map((entry: Row) => entry.eventType), ["delegations.self_delegation.denied"]);

  const allowed = harness(withAuthority(subscribeFixture()), authA, { writable: true });
  assert.equal((await post(allowed, authA, delegationBody())).status, 200);
  const order = allowed.db.__events;
  assert.ok(order.indexOf("audit:delegations.self_delegation.authorized") < order.indexOf("write:delegationPolicy.create"), "decisão registrada antes do efeito");
  assert.equal(allowed.db.__audits[0].metadata.target.designationId, "cad_fixture_holder");

  // limites da designação valem também aqui
  const tooWide = harness(withAuthority(subscribeFixture()), authA, { writable: true });
  const limited = await post(tooWide, authA, delegationBody({ scope: "admin" }));
  assert.equal(limited.status, 403);
  assert.equal(limited.body.error.code, "COMMERCIAL_LIMIT_EXCEEDED");
  assert.deepEqual(tooWide.db.__writes, []);
  const tooLong = harness(withAuthority(subscribeFixture()), authA, { writable: true });
  assert.equal((await post(tooLong, authA, delegationBody({ validUntil: "2031-01-01T00:00:00.000Z" }))).status, 403);
  assert.deepEqual(tooLong.db.__writes, []);

  const noAudit = harness({ ...withAuthority(subscribeFixture()), failAudit: true }, authA, { writable: true });
  assert.equal((await post(noAudit, authA, delegationBody())).status, 503);
  assert.deepEqual(noAudit.db.__writes, []);

  const toOther = harness(subscribeFixture(), authA, { writable: true });
  assert.equal((await post(toOther, authA, delegationBody({ delegateeId: T2 }))).status, 200);
  assert.deepEqual(toOther.db.__audits, []);
  const noItem = harness(subscribeFixture(), authA, { writable: true });
  assert.equal((await post(noItem, authA, delegationBody({ marketplaceId: undefined }))).status, 200);

  const existing = { id: "d-1", delegatorId: "synthetic-publisher", delegateeId: T, marketplaceId: "mkt-MKT", scope: "read", trustMin: 50, validUntil: new Date("2030-01-01T00:00:00.000Z"), policyHash: "h", signatureHash: "s", createdAt: new Date() };
  const patch = (h: ReturnType<typeof harness>, auth: Row, body: Row, id = "d-1") =>
    supertest(mutationApp(h, "apps/api/src/routes/delegations.ts", "delegationsRouter", "patch", "/delegations/:id", auth)).patch(`/api/delegations/${id}`).send(body);
  for (const body of [{ scope: "admin" }, { validUntil: "2040-01-01T00:00:00.000Z" }, { marketplaceId: "mkt-other" }, { trustMin: 1 }]) {
    const h = harness(subscribeFixture({ delegations: [{ ...existing }], memberships: [membership()] }), authA, { writable: true });
    const response = await patch(h, authA, body);
    assert.equal(response.status, 403, JSON.stringify(body));
    assert.deepEqual(h.db.__writes, [], JSON.stringify(body));
  }
  const authorizedPatch = harness(withAuthority(subscribeFixture({ delegations: [{ ...existing }] })), authA, { writable: true });
  assert.equal((await patch(authorizedPatch, authA, { scope: "execute", validUntil: new Date(Date.now() + 10 * 86_400_000).toISOString() })).status, 200);
  assert.ok(authorizedPatch.db.__events.indexOf("audit:delegations.retarget.authorized") < authorizedPatch.db.__events.indexOf("write:delegationPolicy.update"));
  const noop = harness(subscribeFixture({ delegations: [{ ...existing }] }), authA, { writable: true });
  assert.equal((await patch(noop, authA, { scope: "read", trustMin: 50 })).status, 200);
  const publisherAuth = { ...authA, tenantId: "synthetic-publisher" };
  const byPublisher = harness(subscribeFixture({ delegations: [{ ...existing }] }), publisherAuth, { writable: true });
  assert.equal((await patch(byPublisher, publisherAuth, { scope: "admin" })).status, 200);
  assert.deepEqual(byPublisher.db.__audits, []);
});

test("T30 deriva de código: nenhum gravador de assinatura/delegação/política escapa da autoridade; escalada por papéis, convites e override fechada", () => {
  const files = (dir: string) => readdirSync(resolve(dir)).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts")).map((name) => `${dir}/${name}`);
  const writes = /(delegationPolicy|tenantActionPolicy)\.(create|createMany|upsert|update|updateMany)\(|INSERT INTO (delegation_policies|tenant_action_policy)/;
  const found = [...files("apps/api/src/routes"), ...files("apps/api/src/services")]
    .filter((file) => writes.test(readFileSync(resolve(file), "utf8").replace(/\/\/.*$/gm, "")))
    .sort();
  const guarded = ["apps/api/src/routes/delegations.ts", "apps/api/src/routes/marketplace.ts"];
  const otherAuthority: Record<string, string> = {
    "apps/api/src/routes/actions.ts": "actions.admin + commercialPolicyViolation (não concede política de agente nem do escopo comercial)",
    "apps/api/src/routes/onboarding.ts": "criação da conta inicial pela própria pessoa que cria o tenant (somente a metade 'delegação')",
    "apps/api/src/services/workspaceActionPolicyProvisioning.ts": "ativação de produto: liberação da EIAH + products.activate; nomes vêm do catálogo de produto",
  };
  assert.deepEqual(found, [...guarded, ...Object.keys(otherAuthority)].sort(), "conjunto de gravadores de delegação/política mudou: decidir a autoridade antes de aceitar");
  for (const file of guarded) {
    const source = readFileSync(resolve(file), "utf8");
    assert.match(source, /evaluateSubscriptionAuthority/, file);
    assert.match(source, /recordSubscriptionDecision/, file);
  }
  const actions = readFileSync(resolve("apps/api/src/routes/actions.ts"), "utf8");
  assert.match(actions, /commercialPolicyViolation\(/);
  assert.ok(actions.indexOf("commercialPolicyViolation(") < actions.indexOf("tenantActionPolicy.create"), "o guarda vem antes de qualquer escrita de política");
  const profile = readFileSync(resolve("apps/api/src/routes/profile.ts"), "utf8");
  assert.equal((profile.match(/containsReservedCommercialPermission\(/g) ?? []).length, 2, "papéis personalizados e convites");
  const marketplace = readFileSync(resolve("apps/api/src/routes/marketplace.ts"), "utf8");
  const subscribe = marketplace.slice(marketplace.indexOf('"/marketplace/:id/subscribe"'), marketplace.indexOf('"/marketplace/installations/activate"'));
  assert.ok(subscribe.indexOf("evaluateSubscriptionAuthority") > 0);
  for (const effect of ["delegationPolicy.create", "tenantActionPolicy.create", "tenantActionPolicy.update", "tenantActionPolicy.deleteMany", "MarketplaceSubscribeSchema.safeParse", "subscriptionLimitViolation("]) {
    assert.ok(subscribe.indexOf("evaluateSubscriptionAuthority") < subscribe.indexOf(effect), `a autoridade vem antes de ${effect}`);
  }
  assert.ok(subscribe.indexOf('recordSubscriptionDecision({\n    prisma: request.prisma,\n    actor,\n    outcome: "authorized"') < subscribe.indexOf("delegationPolicy.create"), "registro da decisão antes do primeiro efeito");
});

test("T31 marketplace.subscribe não é concedido por padrão a nenhum papel, convite ou escopo administrativo", () => {
  for (const file of ["apps/api/src/services/workspaceResponsibility.ts", "apps/api/src/services/frontDoorAccess.ts", "apps/api/src/services/products/productActivation.ts", "apps/api/src/services/products/verticalAccessApproval.ts", "apps/api/src/routes/onboarding.ts"]) {
    assert.equal(readFileSync(resolve(file), "utf8").includes("marketplace.subscribe"), false, `${file} não concede nem referencia a permissão`);
  }
  const h = harness({}, authA);
  const scopes = h.load(resolve("packages/core/src/security/adminScopes.ts"));
  assert.deepEqual(Object.values(scopes.ADMIN_SCOPES), ["actions.admin", "tools.admin"], "nenhum escopo administrativo foi ampliado");
  assert.equal(scopes.isAdminScope("marketplace.subscribe"), false);
  assert.ok(scopes.COMMERCIAL_AUTHORITY_SCOPE_CATALOG.every((entry: Row) => entry.defaultGrant === "none"));
  // o serviço de decisão só lê; o de designação não cria a primeira autoridade (bootstrap bloqueado) nem escreve fora do registro próprio
  const decision = readFileSync(resolve("apps/api/src/services/marketplaceSubscriptionAuthority.ts"), "utf8").replace(/\/\/.*$/gm, "");
  // única escrita permitida: o registro da decisão no GuardrailAuditLedger
  assert.equal((decision.match(/\.create\(/g) ?? []).length, 1);
  assert.match(decision, /guardrailAuditLedger\.create\(/);
  assert.doesNotMatch(decision.replace(/guardrailAuditLedger\.create\(/, ""), /\.(create|update|upsert|delete|deleteMany)\(|\$executeRaw|\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bCREATE\b|ensureCommercialAuthorityStore|ensureWorkspaceResponsibilityStore/);
  const authority = readFileSync(resolve("apps/api/src/services/commercialAuthority.ts"), "utf8").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(authority, /tenantActionPolicy|delegationPolicy|eiah_workspace_memberships\s+SET|UPDATE eiah_workspace_memberships|INSERT INTO eiah_workspace_memberships/, "não toca políticas, delegações nem memberships");
  assert.match(authority, /FIRST_AUTHORITY_SOURCE_NOT_RATIFIED/);
});

test("T32 rota de descoberta: a autoridade vem do servidor e não pode ser informada pelo cliente", async () => {
  const url = "/api/agents/capabilities/discover?domain=marketing&capability=campaign";
  const plain = harness(LISTED, authA);
  const noAuthority = await supertest(plain.app).get(`${url}&authority=contratacao_autorizada&userId=attacker`).set("authorization", "Bearer synthetic").set("x-user-id", "synthetic-member").set("x-authority", "contratacao_autorizada");
  assert.equal(noAuthority.status, 200);
  assert.equal(noAuthority.body.item.state, "habilitavel");
  assert.equal(noAuthority.body.item.authority.status, "somente_consulta");
  assert.equal(noAuthority.body.item.nextAction.kind, "request_approval");
  assert.deepEqual(plain.db.__writes, []);
  const granted = harness(withAuthority(LISTED), authA);
  const ok = await supertest(granted.app).get(url).set("authorization", "Bearer synthetic");
  assert.equal(ok.body.item.authority.status, "contratacao_autorizada");
  assert.equal(ok.body.item.nextAction.kind, "review_commercial_terms");
  assert.deepEqual(granted.db.__writes, [], "consultar a autoridade nunca escreve (nem registro de decisão)");
  assert.deepEqual(granted.db.__audits, []);
  const service = harness(withAuthority(LISTED), { ...authA, userId: undefined });
  const response = await supertest(service.app).get(url).set("authorization", "Bearer synthetic");
  assert.equal(response.body.item.authority.status, "somente_consulta");
  assert.equal(response.body.item.authority.reasonCode, "IDENTITY_REQUIRED");
});

test("T33 política com efeito comercial: /actions/override exige autoridade individual para agentes e nunca concede o escopo; negar continua permitido", async () => {
  const h = harness({}, authA);
  const guard = h.load(resolve("apps/api/src/services/commercialPolicyGuard.ts"));
  const reader = (names: string[]) => ({ marketplaceItem: { findMany: async () => names.map((name) => ({ name })) } });
  const violation = (name: string, allowed: boolean, db: unknown = reader(["Partner Bot", "fin-nexus"])) => guard.commercialPolicyViolation(db, name, allowed);
  // conceder o ESCOPO comercial como política: nunca por aqui
  for (const name of ["marketplace.subscribe", "  Marketplace.Subscribe "]) {
    const result = await violation(name, true);
    assert.deepEqual([result?.kind, result?.status, result?.code], ["scope", 409, "COMMERCIAL_AUTHORITY_REQUIRED"], name);
  }
  // conceder política de AGENTE (canônico em qualquer grafia/alias ou publicado no Marketplace): exige autoridade individual
  for (const name of ["MKT", "mkt", "Fin-Nexus", "finnexus", "partner bot", "PARTNER-BOT"]) {
    const result = await violation(name, true);
    assert.deepEqual([result?.kind, result?.status, result?.code], ["agent", 403, "COMMERCIAL_AUTHORITY_REQUIRED"], name);
  }
  // negar (revogar) e ações comuns permanecem permitidos
  for (const name of ["marketplace.subscribe", "MKT", "partner bot", "realestate.qualify_lead", "ping"]) {
    assert.equal(await violation(name, false), null, `negar ${name}`);
  }
  for (const name of ["realestate.qualify_lead", "ping", "realestate.register_property"]) assert.equal(await violation(name, true), null, `conceder ${name}`);
  // fail-closed: sem leitura do Marketplace, nenhuma concessão passa
  for (const db of [null, { marketplaceItem: { findMany: async () => { throw new Error("down"); } } }]) {
    const result = await violation("ping", true, db);
    assert.equal(result?.code, "COMMERCIAL_POLICY_CHECK_UNAVAILABLE");
    assert.equal(result?.status, 503);
  }
  assert.equal(await violation("ping", false, null), null, "negar não depende da leitura");
});

test("T34 papéis personalizados e convites não podem nomear a autoridade comercial", () => {
  const h = harness({}, authA);
  const authority = h.load(resolve("apps/api/src/services/commercialAuthority.ts"));
  const has = authority.containsReservedCommercialPermission;
  assert.equal(has(["imob.chat.use", "marketplace.subscribe"]), true);
  assert.equal(has([{ label: "Comercial", permissions: ["  Marketplace.Subscribe "] }]), true);
  assert.equal(has({ nested: [["MARKETPLACE.SUBSCRIBE"]] }), true);
  for (const value of [undefined, null, [], ["imob.chat.use", "products.activate"], [{ label: "marketplace.subscribe.extra" }], "x", 7]) assert.equal(has(value), false, JSON.stringify(value));
  // limites: valores inválidos do banco caem no padrão mais restritivo
  assert.deepEqual(authority.normalizeLimits({ allowedScopes: ["admin", "root"], maxValidityDays: 5000 }), { allowedScopes: ["admin"], maxValidityDays: 90 });
  assert.deepEqual(authority.normalizeLimits("{not-json"), { allowedScopes: ["read", "execute"], maxValidityDays: 90 });
  assert.deepEqual(authority.normalizeLimits(null), { allowedScopes: ["read", "execute"], maxValidityDays: 90 });
  assert.equal(authority.limitsWithin({ allowedScopes: ["read"], maxValidityDays: 30 }, { allowedScopes: ["read", "execute"], maxValidityDays: 90 }), true);
  assert.equal(authority.limitsWithin({ allowedScopes: ["admin"], maxValidityDays: 30 }, { allowedScopes: ["read", "execute"], maxValidityDays: 90 }), false);
  assert.equal(authority.limitsWithin({ allowedScopes: ["read"], maxValidityDays: 120 }, { allowedScopes: ["read", "execute"], maxValidityDays: 90 }), false);
});

// ---------------------------------------------------------------------------------------------
// Habilitação comercial verificável de agentes governados: política + delegação não bastam (reativação, onboarding)
// ---------------------------------------------------------------------------------------------

async function governedState(fixture: Fixture, agent = "MKT", tenant = T, workspace = W) {
  const h = harness(fixture, authA);
  const services = h.load(resolve("apps/api/src/services/agents.ts"));
  const listed = (await services.listAgents(tenant, workspace, h.db)).map((entry: Row) => String(entry.id).toLowerCase());
  const available = await services.isAgentAvailableInWorkspace(tenant, workspace, agent, h.db);
  return { listed: listed.includes(agent.toLowerCase()), available, h, services };
}

test("T35 agente governado: política + delegação sozinhas (antiga, do publicador ou do onboarding) NÃO habilitam; com habilitação verificável habilita", async () => {
  // política remanescente + delegação nova/unilateral/de onboarding, sem decisão registrada
  const bare = await governedState(subscribed(["MKT"]));
  assert.deepEqual([bare.listed, bare.available], [false, false]);
  // com a habilitação vinculada à delegação, às condições e à decisão
  const ok = await governedState(enabled(["MKT"]));
  assert.deepEqual([ok.listed, ok.available], [true, true]);
  assert.deepEqual(ok.h.db.__writes, [], "a leitura não escreve nada");

  const base = enabled(["MKT"]);
  const variants: Array<[string, Fixture]> = [
    ["habilitação revogada", { ...base, enablements: [enablementRow("MKT", T, W, { revokedAt: new Date() })] }],
    ["habilitação expirada", { ...base, enablements: [enablementRow("MKT", T, W, { validUntil: new Date(Date.now() - 1000) })] }],
    ["delegação NOVA (id diferente) não herda a habilitação anterior", { ...base, delegations: [{ ...delegation(T, "mkt-MKT"), id: "d-nova-do-publicador" }] }],
    ["publicador alterou o escopo da delegação", { ...base, delegations: [{ ...delegation(T, "mkt-MKT"), scope: "admin" }] }],
    ["publicador alterou o trustMin da delegação", { ...base, delegations: [{ ...delegation(T, "mkt-MKT"), trustMin: 5 }] }],
    ["delegação aponta outro item do Marketplace", { ...base, enablements: [enablementRow("MKT", T, W, { marketplaceItemId: "mkt-outro" })] }],
    ["delegação expirada", { ...base, delegations: [{ ...delegation(T, "mkt-MKT"), validUntil: new Date(Date.now() - 1000) }] }],
    ["sem a designação registrada", { ...base, enablements: [enablementRow("MKT", T, W, { designationId: null })] }],
    ["sem o evento de decisão", { ...base, enablements: [enablementRow("MKT", T, W, { decisionAuditEventId: null })] }],
    ["habilitação de outro workspace", { ...base, enablements: [enablementRow("MKT", T, W2)] }],
    ["habilitação de outro tenant", { ...base, enablements: [enablementRow("MKT", T2, W)] }],
    ["política removida", { ...base, policies: [] }],
    ["política negada", { ...base, policies: [{ ...policy(T, W, "MKT"), allowed: false }] }],
    ["leitura da habilitação indisponível (fail-closed)", { ...base, failTables: ["eiah_agent_commercial_enablements"] }],
  ];
  for (const [label, fixture] of variants) {
    const state = await governedState(fixture);
    assert.deepEqual([state.listed, state.available], [false, false], label);
  }
  // reativação: habilitação revogada + política antiga + delegação nova do publicador continua inerte, e a descoberta
  // volta a oferecer apenas a recomendação (habilitável), nunca "habilitado"
  const reactivated = await discover({
    ...subscribed(["MKT"]), marketplaceItems: [marketplaceMkt()], delegations: [{ ...delegation(T, "mkt-MKT"), id: "d-nova" }],
    enablements: [enablementRow("MKT", T, W, { revokedAt: new Date() })], recipes: [recipe()],
  });
  assert.notEqual(reactivated.result.state, "habilitado");

  // agentes NÃO governados seguem exatamente como antes (sem exigir o registro novo)
  const guardian = await governedState(subscribed(["guardian"]), "guardian");
  assert.deepEqual([guardian.listed, guardian.available], [true, true]);
});

test("T36 a habilitação comercial só nasce da contratação governada: nenhum outro gravador a cria", () => {
  const files = (dir: string) => readdirSync(resolve(dir)).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts")).map((name) => `${dir}/${name}`);
  const writers = [...files("apps/api/src/routes"), ...files("apps/api/src/services")]
    .filter((file) => /INSERT INTO eiah_agent_commercial_enablements/.test(readFileSync(resolve(file), "utf8").replace(/\/\/.*$/gm, "")))
    .sort();
  assert.deepEqual(writers, ["apps/api/src/services/agentEnablement.ts"]);
  const callers = [...files("apps/api/src/routes"), ...files("apps/api/src/services")]
    .filter((file) => /recordAgentEnablement\(/.test(readFileSync(resolve(file), "utf8").replace(/\/\/.*$/gm, "")))
    .sort();
  assert.deepEqual(callers, ["apps/api/src/routes/marketplace.ts", "apps/api/src/services/agentEnablement.ts"], "somente a rota de contratação registra");
  const marketplace = readFileSync(resolve("apps/api/src/routes/marketplace.ts"), "utf8");
  const subscribe = marketplace.slice(marketplace.indexOf('"/marketplace/:id/subscribe"'), marketplace.indexOf('"/marketplace/installations/activate"'));
  assert.ok(subscribe.indexOf("evaluateSubscriptionAuthority") < subscribe.indexOf("recordAgentEnablement("), "autoridade antes da habilitação");
  assert.ok(subscribe.indexOf("recordSubscriptionDecision({") < subscribe.indexOf("recordAgentEnablement("), "decisão registrada antes da habilitação");
  // os pontos canônicos de disponibilidade usam a verificação; onboarding e delegações não criam habilitação nem política
  const agents = readFileSync(resolve("apps/api/src/services/agents.ts"), "utf8");
  assert.equal((agents.match(/withoutUnverifiedGovernedAgents\(/g) ?? []).length, 3, "definição + listAgents + isAgentAvailableInWorkspace");
  for (const file of ["apps/api/src/routes/onboarding.ts", "apps/api/src/routes/delegations.ts"]) {
    const source = readFileSync(resolve(file), "utf8").replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(source, /agent_commercial_enablements|recordAgentEnablement|tenantActionPolicy\.(create|update|upsert)/, `${file} não cria habilitação nem política de agente`);
  }
});

test("T37 delegação reaproveitada acima dos limites da autoridade não fundamenta a habilitação: cria-se delegação nos termos decididos", async () => {
  const wide = { ...delegation(T, "mkt-MKT"), id: "d-publicador-amplo", scope: "admin", validUntil: new Date(Date.now() + 300 * 86_400_000) };
  const fixture = withAuthority(subscribeFixture({ delegations: [wide], policies: [] }));
  const h = harness(fixture, authA, { writable: true });
  const response = await subscribeAs(h, authA, "mkt-MKT", { scope: "read" });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.notEqual(response.body.delegationId, "d-publicador-amplo", "os termos do publicador excediam a autoridade que decidiu");
  assert.equal(h.db.__writes.filter((entry: string) => entry === "delegationPolicy.create").length, 1);
  const insert = h.db.__sql.find((query: Row) => /INSERT INTO eiah_agent_commercial_enablements/.test(query.text))!;
  assert.ok(insert.values.includes(response.body.delegationId));
  assert.ok(insert.values.includes("read"), "condições efetivas decididas");
  assert.equal(insert.values.includes("admin"), false);

  // dentro dos limites: a delegação existente é reaproveitada e a habilitação se liga a ela
  const fine = { ...delegation(T, "mkt-MKT"), id: "d-publicador-ok", scope: "execute", validUntil: new Date(Date.now() + 30 * 86_400_000) };
  const reused = harness(withAuthority(subscribeFixture({ delegations: [fine], policies: [] })), authA, { writable: true });
  const ok = await subscribeAs(reused, authA, "mkt-MKT", { scope: "read" });
  assert.equal(ok.body.delegationId, "d-publicador-ok");
  assert.equal(reused.db.__writes.includes("delegationPolicy.create"), false);
  assert.ok(reused.db.__sql.find((query: Row) => /INSERT INTO eiah_agent_commercial_enablements/.test(query.text))!.values.includes("d-publicador-ok"));

  // o registro de habilitações é garantido ANTES da decisão e de qualquer efeito; sem ele nada é contratado
  const events = reused.db.__events;
  assert.ok(events.indexOf("write:$executeRawUnsafe") >= 0 && events.indexOf("write:$executeRawUnsafe") < events.indexOf("audit:marketplace.subscribe.authorized"), "criação idempotente do registro antes da decisão");
  const noStore = harness(withAuthority(subscribeFixture({ policies: [] })), authA, { writable: true });
  noStore.db.$executeRawUnsafe = async () => { throw new Error("ddl denied"); };
  const unavailable = await subscribeAs(noStore, authA, "mkt-MKT", { scope: "read" });
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.body.error.code, "ENABLEMENT_STORE_UNAVAILABLE");
  assert.deepEqual(noStore.db.__audits, [], "sem decisão registrada");
  assert.equal(noStore.db.__writes.includes("delegationPolicy.create"), false);
  assert.equal(noStore.db.__writes.includes("tenantActionPolicy.create"), false);

  // falha ao registrar a habilitação: o agente governado não é habilitado
  const broken = harness(withAuthority(subscribeFixture({ policies: [] })), authA, { writable: true });
  const original = broken.db.$executeRaw;
  broken.db.$executeRaw = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    if (/INSERT INTO eiah_agent_commercial_enablements/.test(strings.join("?"))) throw new Error("enablement store down");
    return original(strings, ...values);
  };
  const failed = await subscribeAs(broken, authA, "mkt-MKT", { scope: "read" });
  assert.equal(failed.status, 503);
  assert.equal(failed.body.error.code, "ENABLEMENT_RECORD_UNAVAILABLE");
  assert.equal(failed.body.enablementId, undefined);
});
