import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
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
  /** Tabelas cuja leitura falha (simula indisponibilidade). `tenant_recipes` falha a consulta bruta. */
  failTables?: string[];
};

const future = () => new Date(Date.now() + 86_400_000);
const item = (id: string, name: string) => ({ id, type: "agent", name, isPublic: true, publisherId: "synthetic-publisher" });
const delegation = (tenant: string, marketplaceId: string) => ({
  id: `d-${tenant}-${marketplaceId}`, delegateeId: tenant, marketplaceId, scope: "execute", validUntil: future(), createdAt: new Date(),
});
const policy = (tenant: string, workspace: string, actionName: string) => ({ id: `p-${tenant}-${workspace}-${actionName}`, tenantId: tenant, workspaceId: workspace, actionName, allowed: true });

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === "OR" && Array.isArray(condition)) return condition.some((entry) => matches(row, entry));
    if (condition && typeof condition === "object" && !(condition instanceof Date)) {
      if ("in" in condition) return condition.in.includes(row[key]);
      if ("gt" in condition) return row[key] > condition.gt;
      if ("not" in condition) return row[key] !== condition.not;
      return true;
    }
    return row[key] === condition;
  });
}

function makeDb(fixture: Fixture) {
  const writes: string[] = [];
  const sql: Array<{ text: string; values: unknown[] }> = [];
  const table = (rows: Row[], name: string) => {
    const forbidden = (method: string) => async () => { writes.push(`${name}.${method}`); throw new Error(`WRITE_ATTEMPT ${name}.${method}`); };
    return {
      findMany: async (query: Row = {}) => {
        if (fixture.failTables?.includes(name)) throw new Error(`read failure ${name}`);
        return rows.filter((row) => matches(row, query.where)).map((row) =>
          query.include?.marketplace
            ? { ...row, marketplace: (fixture.marketplaceItems ?? []).find((entry) => entry.id === row.marketplaceId) ?? null }
            : row);
      },
      findUnique: async (query: Row = {}) => rows.find((row) => matches(row, query.where)) ?? null,
      create: forbidden("create"), createMany: forbidden("createMany"), update: forbidden("update"), updateMany: forbidden("updateMany"),
      upsert: forbidden("upsert"), delete: forbidden("delete"), deleteMany: forbidden("deleteMany"),
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
    $executeRaw: async () => { writes.push("$executeRaw"); throw new Error("WRITE_ATTEMPT $executeRaw"); },
    $disconnect: async () => {},
    __writes: writes,
    __sql: sql,
  };
}

function harness(fixture: Fixture, auth: Row | null) {
  const db = makeDb(fixture);
  const coreProfiles: Record<string, unknown> = {};
  const overrides: Record<string, unknown> = {
    "@repo/db": { prismaGlobal: db, getPrismaForTenant: () => db, Prisma: { JsonNull: null }, PrismaClient: class {} },
    "@eiah/core/logging/logger": { bindLogger: (logger: unknown) => logger, createLogger: () => ({ info() {}, warn() {}, error() {} }) },
    "@eiah/core/services/guardrailLedgerStore": { recordGuardrailLedger: async () => {}, recordGuardrailAudit: async () => {} },
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

async function discover(fixture: Fixture, tenantId = T, workspaceId = W, need: Row = NEED) {
  const h = harness(fixture, authA);
  const module = h.load(resolve("apps/api/src/services/capabilityDiscovery.ts"));
  const result = await module.discoverCapabilityNeed({ need, tenantId, workspaceId, client: h.db });
  return { h, module, result };
}

test("T16 descoberta estrutural: domínio + capacidade resolvem o provedor declarado, sem texto do usuário", async () => {
  const { result } = await discover({ ...subscribed(["MKT"]), recipes: [recipe()] });
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
  assert.deepEqual(listed.nextAction, { kind: "enable_agent", actionDomain: "agent_enablement", requiresHumanConfirmation: true, marketplaceItemId: "mkt-MKT", path: "/app/marketplace" });

  // inscrito (política do workspace + delegação ativa) => habilitado; o encaminhamento operacional ainda não existe
  const enabled = (await discover({ ...subscribed(["MKT"]), recipes: [recipe()] })).result;
  assert.equal(enabled.state, "habilitado");
  assert.deepEqual(enabled.reasons, []);
  assert.equal(enabled.enablement, null);
  assert.deepEqual(enabled.nextAction, { kind: "request_work", actionDomain: "agent_work", enabled: false, reason: "OPERATIONAL_HANDOFF_NOT_IMPLEMENTED" });

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
  const closed = (await discover({ ...subscribed(["MKT"]), agentProfiles: [closedProfile], recipes: [recipe()] })).result;
  assert.equal(closed.state, "indisponivel");
  assert.deepEqual(closed.reasons, ["PARTICIPATION_NOT_ACTIVE"]);
  assert.deepEqual(closed.nextAction, { kind: "none", actionDomain: null });
  assert.deepEqual(closed.recipes, { status: "nao_aplicavel", items: [] }, "sem disponibilidade, nenhum modelo é oferecido");
});

test("T18 modelos: somente homologados, do tenant, compatíveis com o workspace e com o agente; sem instruções ou conteúdo", async () => {
  const fixture: Fixture = {
    ...subscribed(["MKT"]),
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
  assert.deepEqual(h.db.__sql.map((query: Row) => query.values), [[T, W]], "uma consulta, parametrizada por tenant e workspace");

  // outro workspace do mesmo tenant só vê os modelos do seu escopo
  const other = (await discover({ ...fixture, ...subscribed(["MKT"], T, W2) }, T, W2)).result;
  assert.deepEqual(other.recipes.items.map((entry: Row) => entry.id).sort(), ["alias", "ok-all", "out-scope"]);
  // habilitável: modelos homologados são informativos; indisponível/não verificado: nenhum
  const listed = (await discover({ marketplaceItems: [marketplaceMkt()], recipes: [recipe()] })).result;
  assert.equal(listed.recipes.items.length, 1);
  assert.deepEqual((await discover({ recipes: [recipe()] })).result.recipes, { status: "nao_aplicavel", items: [] });
  // sem nenhum modelo homologado: lista vazia, status ok
  assert.deepEqual((await discover({ ...subscribed(["MKT"]), recipes: [] })).result.recipes, { status: "ok", items: [] });
});

test("T19 isolamento entre tenants e workspaces na descoberta", async () => {
  const fixture: Fixture = {
    ...subscribed(["MKT"], T, W),
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
    const { result } = await discover({ ...subscribed(["MKT"]), failTables: [table], recipes: [recipe()] });
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
  const noRecipes = (await discover({ ...subscribed(["MKT"]), failTables: ["tenant_recipes"] })).result;
  assert.equal(noRecipes.state, "habilitado");
  assert.deepEqual(noRecipes.recipes, { status: "nao_verificado", items: [] });
  const listedNoRecipes = (await discover({ marketplaceItems: [marketplaceMkt()], failTables: ["tenant_recipes"] })).result;
  assert.equal(listedNoRecipes.state, "habilitavel");
  assert.equal(listedNoRecipes.recipes.status, "nao_verificado");
  for (const [tenant, workspace] of [["", W], [T, ""], ["  ", W]] as const) {
    const { result } = await discover(subscribed(["MKT"]), tenant, workspace);
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
    { ...subscribed(["MKT"]), recipes: [recipe()] },
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
  const h = harness({ ...subscribed(["MKT"]), recipes: [recipe()] }, authA);
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
  const foreign = harness({ ...subscribed(["MKT"]), recipes: [recipe()] }, { ...authA, tenantId: T2, workspaceId: W2 });
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
