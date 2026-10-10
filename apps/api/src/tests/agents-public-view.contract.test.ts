import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import ts from "typescript";
import express from "express";
import supertest from "supertest";

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
};

const future = () => new Date(Date.now() + 86_400_000);
const item = (id: string, name: string) => ({ id, type: "agent", name, isPublic: true, publisherId: "synthetic-publisher" });
const delegation = (tenant: string, marketplaceId: string) => ({
  id: `d-${tenant}-${marketplaceId}`, delegateeId: tenant, marketplaceId, scope: "execute", validUntil: future(), createdAt: new Date(),
});
const policy = (tenant: string, workspace: string, actionName: string) => ({ id: `p-${tenant}-${workspace}-${actionName}`, tenantId: tenant, workspaceId: workspace, actionName, allowed: true });

function matches(row: Row, where: Row = {}) {
  return Object.entries(where).every(([key, condition]) => {
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
  const table = (rows: Row[]) => ({
    findMany: async (query: Row = {}) => rows.filter((row) => matches(row, query.where)).map((row) =>
      query.include?.marketplace
        ? { ...row, marketplace: (fixture.marketplaceItems ?? []).find((entry) => entry.id === row.marketplaceId) ?? null }
        : row),
    findUnique: async (query: Row = {}) => rows.find((row) => matches(row, query.where)) ?? null,
  });
  return {
    pricing: table(fixture.pricing ?? []),
    agentProfile: table(fixture.agentProfiles ?? []),
    delegationPolicy: table(fixture.delegations ?? []),
    tenantActionPolicy: table(fixture.policies ?? []),
    $disconnect: async () => {},
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
