import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import process from "node:process";
import ts from "typescript";
import express from "express";
import supertest from "supertest";

// Autorização das oito rotas de escrita de owners, properties e leads do CRM IMOB.
// Carrega o router IMOB real (enforceTenant, imobRevocationGate, readImobWorkspaceAccessProfile e
// ensureImobWorkspacePermission reais) uma vez, sobre um Prisma em memória reiniciado a cada caso:
// sem banco, sem Redis.

process.env.DATABASE_URL ??= "postgresql://user:pass@127.0.0.1:1/test";
process.env.REDIS_URL ??= "redis://127.0.0.1:1";

const T = "synthetic-tenant-a", W = "synthetic-ws-a", T2 = "synthetic-tenant-b", W2 = "synthetic-ws-b";
const USER = "synthetic-user";

type Row = Record<string, any>;
type Membership = { role_key: string; permissions: string[]; status: string } | null;
type Fixture = {
  membership: Membership;
  activeMembers: number;
  verticalAccess?: Row | null;
  owners?: Row[];
  properties?: Row[];
  leads?: Row[];
};
type State = { fixture: Fixture; writes: string[]; tables: Record<string, Row[]>; sequence: number };

const CORRETOR: Membership = { role_key: "corretor", permissions: ["imob.chat.use", "imob.stage.*"], status: "active" };
const CUSTOM_WITHOUT_IMOB: Membership = { role_key: "auditor-externo", permissions: ["workspace.view"], status: "active" };

function matches(row: Row, where: Row = {}) {
  return Object.entries(where).every(([key, condition]) => {
    if (condition === undefined) return true;
    if (condition && typeof condition === "object" && !(condition instanceof Date) && !Array.isArray(condition)) {
      if ("not" in condition) return row[key] !== condition.not;
      if ("in" in condition) return condition.in.includes(row[key]);
      if ("notIn" in condition) return !condition.notIn.includes(row[key]);
      return true;
    }
    return row[key] === condition;
  });
}

function freshState(fixture: Fixture): State {
  return {
    fixture,
    writes: [],
    sequence: 0,
    tables: {
      imobOwner: [...(fixture.owners ?? [])],
      imobProperty: [...(fixture.properties ?? [])],
      imobLead: [...(fixture.leads ?? [])],
      user: [{ id: USER, email: "synthetic@example.test", displayName: "Synthetic" }],
    },
  };
}

function createHarness() {
  let state = freshState({ membership: null, activeMembers: 0 });
  const model = (name: string) => {
    const rows = () => (state.tables[name] ??= []);
    return {
      findFirst: async (query: Row = {}) => rows().find((row) => matches(row, query.where)) ?? null,
      findUnique: async (query: Row = {}) => rows().find((row) => matches(row, query.where)) ?? null,
      findMany: async (query: Row = {}) => rows().filter((row) => matches(row, query.where)),
      count: async (query: Row = {}) => rows().filter((row) => matches(row, query.where)).length,
      create: async (query: Row) => {
        state.writes.push(`${name}.create`);
        const row = { id: `${name}-${++state.sequence}`, createdAt: new Date(), updatedAt: new Date(), ...query.data };
        rows().push(row);
        return row;
      },
      update: async (query: Row) => {
        state.writes.push(`${name}.update`);
        const row = rows().find((entry) => matches(entry, query.where));
        if (!row) throw new Error(`${name} not found`);
        Object.assign(row, query.data, { updatedAt: new Date() });
        return row;
      },
      updateMany: async (query: Row) => {
        state.writes.push(`${name}.updateMany`);
        const targets = rows().filter((row) => matches(row, query.where));
        for (const row of targets) Object.assign(row, query.data);
        return { count: targets.length };
      },
    };
  };
  const base: Row = {
    $disconnect: async () => {},
    $executeRawUnsafe: async () => 0,
    $queryRawUnsafe: async () => (state.fixture.verticalAccess ? [state.fixture.verticalAccess] : []),
    $executeRaw: async (strings: TemplateStringsArray) => {
      state.writes.push(`raw.execute:${strings.join("?").trim().split(/\s+/).slice(0, 3).join(" ")}`);
      return 1;
    },
    $queryRaw: async (strings: TemplateStringsArray) => {
      const sql = strings.join("?");
      if (sql.includes("FROM eiah_workspace_memberships") && sql.includes("WHERE user_id")) {
        return state.fixture.membership ? [state.fixture.membership] : [];
      }
      if (sql.includes("COUNT(*)") && sql.includes("eiah_workspace_memberships")) {
        return [{ total: state.fixture.activeMembers }];
      }
      return [];
    },
    $transaction: async (input: unknown) =>
      typeof input === "function" ? Reflect.apply(input, undefined, [db]) : Promise.all(input as unknown[]),
  };
  const db: Row = new Proxy(base, {
    get(target, property) {
      if (property in target) return target[property as string];
      if (typeof property === "string" && !property.startsWith("$") && property !== "then") return model(property);
      return undefined;
    },
  });
  const auth = { tokenId: "synthetic-token", tenantId: T, workspaceId: W, userId: USER, revoked: false, expiresAt: null };
  const overrides: Record<string, unknown> = {
    "@repo/db": {
      prismaGlobal: db,
      getPrismaForTenant: () => db,
      Prisma: { JsonNull: null, DbNull: null, sql: () => ({}), join: () => ({}), raw: () => ({}), empty: {} },
      PrismaClient: class {},
    },
  };
  const cache = new Map<string, { exports: any }>();
  function load(path: string): any {
    if (cache.has(path)) return cache.get(path)!.exports;
    const module = { exports: {} as any };
    cache.set(path, module);
    const nativeRequire = createRequire(path);
    const tryLoad = (basePath: string) => {
      for (const ext of [".ts", "/index.ts"]) if (existsSync(basePath + ext)) return load(basePath + ext);
      return undefined;
    };
    const localRequire = (specifier: string) => {
      if (specifier in overrides) return overrides[specifier];
      if (specifier.endsWith("/auth/apiTokenRepository")) return { findApiToken: async () => auth };
      if (specifier.endsWith("/queues/imobRunCompletedQueue")) {
        return {
          IMOB_RUN_COMPLETED_QUEUE_NAME: "imob-run-completed",
          imobRunCompletedQueue: {},
          enqueueImobRunCompleted: async () => { throw new Error("enqueue is not available in this harness"); },
        };
      }
      if (specifier.endsWith("/chat/workspaceVerticalRegistry")) {
        // Porta de instalação do IMOB (AUTHZ-IMOB-INSTALLATION-001): este contrato exercita a autorização das escritas, não a
        // instalação. O harness declara o IMOB instalado e habilitado; a fonte real dos fatos exige banco e é coberta nos testes de instalação.
        return {
          readImobInstallationFacts: async () => ({ installationStatus: "active", entitled: true, agentsReady: true, usage: "full" }),
          readVerticalRegistryFacts: async () => { throw new Error("readVerticalRegistryFacts is not available in this harness"); },
        };
      }
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
  const { imobRouter } = load(resolve("apps/api/src/routes/imob.ts"));
  const app = express();
  app.use(express.json());
  app.use("/api/imob", imobRouter);
  const request = supertest(app);
  return {
    request,
    reset(fixture: Fixture) {
      state = freshState(fixture);
    },
    get writes() {
      return state.writes;
    },
  };
}

let shared: ReturnType<typeof createHarness> | null = null;
function harness(fixture: Fixture) {
  shared ??= createHarness();
  shared.reset(fixture);
  return shared;
}

const crmWrites = (writes: string[]) => writes.filter((entry) => /^(imobOwner|imobProperty|imobLead|memoryEvent)\./.test(entry));

const owner = (id: string, tenantId = T, workspaceId = W) => ({ id, tenantId, workspaceId, name: "Proprietário sintético", status: "ativo", pendingItems: [] });
const property = (id: string, tenantId = T, workspaceId = W) => ({ id, tenantId, workspaceId, ownerId: null, city: "Cidade sintética", status: "ativo", pendingItems: [] });
const lead = (id: string, tenantId = T, workspaceId = W) => ({ id, tenantId, workspaceId, name: "Lead sintético", status: "novo", pendingItems: [] });

const ROUTES = [
  { method: "post", path: "/api/imob/owners", body: { name: "Proprietário sintético" } },
  { method: "patch", path: "/api/imob/owners/owner-a", body: { phone: "0000" } },
  { method: "delete", path: "/api/imob/owners/owner-a", body: undefined },
  { method: "post", path: "/api/imob/properties", body: { city: "Cidade sintética" } },
  { method: "patch", path: "/api/imob/properties/property-a", body: { city: "Outra cidade" } },
  { method: "delete", path: "/api/imob/properties/property-a", body: undefined },
  { method: "post", path: "/api/imob/leads", body: { name: "Lead sintético" } },
  { method: "patch", path: "/api/imob/leads/lead-a", body: { phone: "0000" } },
] as const;

const scopedRecords = () => ({ owners: [owner("owner-a")], properties: [property("property-a")], leads: [lead("lead-a")] });

function send(request: ReturnType<typeof supertest>, route: (typeof ROUTES)[number], body: unknown = route.body) {
  const call = (request as any)[route.method](route.path).set("authorization", "Bearer synthetic");
  return body === undefined ? call : call.send(body as object);
}

test("custom role without imob.chat.use is denied with 403 on all eight write routes, without CRM writes", async () => {
  for (const route of ROUTES) {
    const h = harness({ membership: CUSTOM_WITHOUT_IMOB, activeMembers: 2, ...scopedRecords() });
    const response = await send(h.request, route);
    assert.equal(response.status, 403, `${route.method.toUpperCase()} ${route.path}`);
    assert.equal(response.body.error.code, "IMOB_WORKSPACE_PERMISSION_FORBIDDEN", `${route.method.toUpperCase()} ${route.path}`);
    assert.deepEqual(crmWrites(h.writes), [], `${route.method.toUpperCase()} ${route.path} must not write`);
  }
});

test("authorization runs before payload validation: invalid payload without permission returns 403", async () => {
  const invalid = [
    { route: ROUTES[0], body: {} },
    { route: ROUTES[1], body: {} },
    { route: ROUTES[3], body: {} },
    { route: ROUTES[6], body: {} },
    { route: ROUTES[7], body: {} },
  ];
  for (const { route, body } of invalid) {
    const h = harness({ membership: CUSTOM_WITHOUT_IMOB, activeMembers: 2, ...scopedRecords() });
    const response = await send(h.request, route, body);
    assert.equal(response.status, 403, `${route.method.toUpperCase()} ${route.path}`);
    assert.deepEqual(crmWrites(h.writes), []);
  }
});

test("authorized role keeps previous behavior on all eight write routes", async () => {
  const expected = [201, 200, 200, 201, 200, 200, 201, 200];
  for (const [index, route] of ROUTES.entries()) {
    const h = harness({ membership: CORRETOR, activeMembers: 2, ...scopedRecords() });
    const response = await send(h.request, route);
    assert.equal(response.status, expected[index], `${route.method.toUpperCase()} ${route.path}`);
    assert.equal(response.body.ok, true);
    assert.ok(crmWrites(h.writes).length > 0, `${route.method.toUpperCase()} ${route.path} must write`);
  }
});

test("authorized role cannot touch records of another tenant or workspace", async () => {
  const foreign = () => ({
    owners: [owner("owner-a", T2, W2), owner("owner-ws", T, "synthetic-other-ws")],
    properties: [property("property-a", T2, W2)],
    leads: [lead("lead-a", T2, W2)],
  });
  for (const route of ROUTES.filter((entry) => entry.method !== "post")) {
    const h = harness({ membership: CORRETOR, activeMembers: 2, ...foreign() });
    const response = await send(h.request, route);
    assert.equal(response.status, 404, `${route.method.toUpperCase()} ${route.path}`);
    assert.deepEqual(crmWrites(h.writes), [], `${route.method.toUpperCase()} ${route.path} must not write`);
  }
  const h = harness({ membership: CORRETOR, activeMembers: 2, ...foreign() });
  const response = await send(h.request, ROUTES[3], { ownerId: "owner-a", city: "Cidade sintética" });
  assert.equal(response.status, 404, "property cannot link an owner from another tenant");
  assert.deepEqual(crmWrites(h.writes), []);
});

test("vertical revoked as read-only still blocks writes before the handler", async () => {
  for (const route of ROUTES) {
    const h = harness({
      membership: CORRETOR,
      activeMembers: 2,
      verticalAccess: { status: "revogado", revocationMode: "somente_leitura" },
      ...scopedRecords(),
    });
    const response = await send(h.request, route);
    assert.equal(response.status, 403, `${route.method.toUpperCase()} ${route.path}`);
    assert.equal(response.body.error.code, "IMOB_VERTICAL_READ_ONLY");
    assert.deepEqual(crmWrites(h.writes), []);
  }
});

test("a user without an active workspace membership is denied with 403 IMOB_WORKSPACE_MEMBERSHIP_REQUIRED and no membership is created", async () => {
  // O acesso ao IMOB exige vínculo ATIVO ao workspace, lido em modo somente leitura: ausência de vínculo
  // nega, sem bootstrap, sem criação de membership e sem escrita no CRM.
  for (const route of ROUTES) {
    const h = harness({ membership: null, activeMembers: 3, ...scopedRecords() });
    const response = await send(h.request, route);
    assert.equal(response.status, 403, `${route.method.toUpperCase()} ${route.path}`);
    assert.equal(response.body.error.code, "IMOB_WORKSPACE_MEMBERSHIP_REQUIRED", `${route.method.toUpperCase()} ${route.path}`);
    assert.deepEqual(crmWrites(h.writes), [], `${route.method.toUpperCase()} ${route.path} must not write`);
    assert.ok(
      !h.writes.some((entry) => entry.includes("eiah_workspace_memberships")),
      `${route.method.toUpperCase()} ${route.path} must not create or change a membership`,
    );
  }
});
