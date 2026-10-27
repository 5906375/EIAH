import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import process from "node:process";
import ts from "typescript";
import express from "express";
import supertest from "supertest";

// Só membership ativa concede autoridade; o papel gravado de um vínculo revogado/inativo segue consultável como HISTÓRICO. Fontes .ts reais (workspaceResponsibility, productActivation,
// router IMOB), carregadas uma vez sobre um Prisma em memória reiniciado a cada caso: sem banco, sem Redis.
//
// Adaptação à integração (EIAH-GIT-INTEGRATION): o router IMOB passa pelos portões de instalação, vínculo e permissão
// (AUTHZ-IMOB-INSTALLATION-001 / AUTHZ-IMOB-CRM-001 / P12). Aqui a INSTALAÇÃO do IMOB é fixada como ativa (os portões são cobertos por
// authz-imob-installation.integration.test.ts); o que este arquivo prova é que vínculo NÃO ativo mantém o papel só como histórico e não expõe
// permissões efetivas de gestão (`workspaceResponsibility.readCurrentMembership`). Contratos da integração: vínculo revogado => 403
// IMOB_WORKSPACE_MEMBERSHIP_INACTIVE e ausência de vínculo => 403 IMOB_WORKSPACE_MEMBERSHIP_REQUIRED, sem criar/reativar/promover vínculo.

process.env.DATABASE_URL ??= "postgresql://user:pass@127.0.0.1:1/test";
process.env.REDIS_URL ??= "redis://127.0.0.1:1";

const T = "synthetic-tenant-a", W = "synthetic-ws-a", T2 = "synthetic-tenant-b", W2 = "synthetic-ws-b";
const USER = "synthetic-user";
const ADMIN_PERMISSIONS = [
  "workspace.manage_members",
  "workspace.manage_roles",
  "imob.chat.use",
  "imob.case.review",
  "imob.stage.*",
  "products.activate",
];

type Row = Record<string, any>;
type Membership = { role_key: string; permissions: string[]; status: string } | null;
type Fixture = { membership: Membership; activeMembers: number; owners?: Row[] };
type State = { fixture: Fixture; writes: string[]; membershipLookups: unknown[][]; tables: Record<string, Row[]>; sequence: number };

function matches(row: Row, where: Row = {}) {
  return Object.entries(where).every(([key, condition]) => {
    if (condition === undefined) return true;
    if (condition && typeof condition === "object" && !(condition instanceof Date) && !Array.isArray(condition)) {
      if ("not" in condition) return row[key] !== condition.not;
      if ("in" in condition) return condition.in.includes(row[key]);
      return true;
    }
    return row[key] === condition;
  });
}

function freshState(fixture: Fixture): State {
  return {
    fixture,
    writes: [],
    membershipLookups: [],
    sequence: 0,
    tables: {
      imobOwner: [...(fixture.owners ?? [])],
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
        Object.assign(row, query.data);
        return row;
      },
    };
  };
  const base: Row = {
    $disconnect: async () => {},
    $executeRawUnsafe: async () => 0,
    $queryRawUnsafe: async () => [],
    $executeRaw: async (strings: TemplateStringsArray) => {
      state.writes.push(`raw.execute:${strings.join("?").trim().split(/\s+/).slice(0, 3).join(" ")}`);
      return 1;
    },
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join("?");
      if (sql.includes("FROM eiah_workspace_memberships") && sql.includes("WHERE user_id")) {
        state.membershipLookups.push(values);
        return state.fixture.membership ? [state.fixture.membership] : [];
      }
      if (sql.includes("UPDATE eiah_workspace_memberships") && sql.includes("RETURNING")) {
        // Promoção do membro único (AUTHZ-4b): uma instrução condicional que só atinge o vínculo ATIVO do ator quando ele é o único ativo.
        const current = state.fixture.membership;
        if (current && current.status === "active" && state.fixture.activeMembers === 1) {
          state.writes.push("raw.execute:UPDATE eiah_workspace_memberships");
          return [{ role_key: "founder", permissions: [...ADMIN_PERMISSIONS], status: "active" }];
        }
        return [];
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
      if (specifier.endsWith("/chat/workspaceVerticalRegistry")) {
        const real = tryLoad(resolve(dirname(path), specifier));
        return { ...real, readImobInstallationFacts: async () => ({ installationStatus: "active", entitled: true, agentsReady: true, usage: "full" }) };
      }
      if (specifier.endsWith("/queues/imobRunCompletedQueue")) {
        return {
          IMOB_RUN_COMPLETED_QUEUE_NAME: "imob-run-completed",
          imobRunCompletedQueue: {},
          enqueueImobRunCompleted: async () => { throw new Error("enqueue is not available in this harness"); },
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
  const responsibility = load(resolve("apps/api/src/services/workspaceResponsibility.ts"));
  const activation = load(resolve("apps/api/src/services/products/productActivation.ts"));
  const { imobRouter } = load(resolve("apps/api/src/routes/imob.ts"));
  const app = express();
  app.use(express.json());
  app.use("/api/imob", imobRouter);
  const request = supertest(app);
  const scope = { prisma: db, tenantId: T, workspaceId: W, userId: USER };
  return {
    request,
    responsibility,
    activation,
    scope,
    reset(fixture: Fixture) {
      state = freshState(fixture);
    },
    get writes() {
      return state.writes;
    },
    get membershipLookups() {
      return state.membershipLookups;
    },
  };
}

let shared: ReturnType<typeof createHarness> | null = null;
function harness(fixture: Fixture) {
  shared ??= createHarness();
  shared.reset(fixture);
  return shared;
}

const membershipWrites = (writes: string[]) => writes.filter((entry) => entry.includes("eiah_workspace_memberships"));
const crmWrites = (writes: string[]) => writes.filter((entry) => /^(imobOwner|memoryEvent)\./.test(entry));
const revoked = (roleKey: string): Membership => ({ role_key: roleKey, permissions: [...ADMIN_PERMISSIONS], status: "revoked" });
const createOwner = (request: ReturnType<typeof supertest>) =>
  request.post("/api/imob/owners").set("authorization", "Bearer synthetic").send({ name: "Proprietário sintético" });

test("revoked membership with stored admin permissions does not authorize IMOB writes", async () => {
  for (const roleKey of ["gestor", "founder", "corretor"]) {
    const h = harness({ membership: revoked(roleKey), activeMembers: 2 });
    const response = await createOwner(h.request);
    assert.equal(response.status, 403, roleKey);
    assert.equal(response.body.error.code, "IMOB_WORKSPACE_MEMBERSHIP_INACTIVE");
    assert.deepEqual(crmWrites(h.writes), []);
    assert.deepEqual(membershipWrites(h.writes), [], `${roleKey}: no bootstrap, reactivation or promotion`);
  }
});

test("revoked membership grants no manage_roles, manage_members or products.activate", async () => {
  const h = harness({ membership: revoked("founder"), activeMembers: 2 });
  const profile = await h.responsibility.readWorkspaceResponsibleProfile(h.scope);
  assert.deepEqual(profile.permissions, []);
  assert.equal(profile.selectedRoleKey, "founder", "o papel gravado segue consultável como histórico");
  assert.equal(profile.membershipStatus, "revoked");
  assert.equal(profile.membershipActive, false);
  assert.equal(profile.canManageMembers, false);
  assert.equal(h.responsibility.hasWorkspacePermission(profile.permissions, "workspace.manage_roles"), false);
  assert.equal(h.responsibility.hasWorkspacePermission(profile.permissions, "workspace.manage_members"), false);
  assert.equal(h.responsibility.canActivateProducts(profile), false, "founder role_key alone must not activate products");
  assert.equal(
    h.responsibility.canActivateProducts({ selectedRoleKey: "founder", permissions: ["products.activate"], membershipStatus: "revoked" }),
    false,
    "nem o papel Founder nem a permissão gravada valem com vínculo revogado",
  );
  assert.equal(
    h.responsibility.canActivateProducts({ selectedRoleKey: "founder", permissions: [], membershipStatus: "active" }),
    true,
    "vínculo ativo preserva o comportamento legítimo",
  );
  assert.equal(await h.activation.canUserActivateProducts(h.scope), false);
  await assert.rejects(
    h.responsibility.upsertWorkspaceRoleConfig({ ...h.scope, roleLabels: ["Auditor"] }),
    (error: Row) => error.code === "WORKSPACE_ROLES_FORBIDDEN" && error.status === 403,
  );
  await assert.rejects(
    h.responsibility.upsertWorkspaceRoleConfig({ ...h.scope, selectedRoleKey: "gestor" }),
    (error: Row) => error.code === "WORKSPACE_ROLES_FORBIDDEN",
  );
  await assert.rejects(
    h.responsibility.createWorkspaceInvitation({ ...h.scope, invitedByUserId: USER, email: "novo@example.test", roleKey: "corretor" }),
    (error: Row) => error.code === "WORKSPACE_MEMBERS_FORBIDDEN" && error.status === 403,
  );
  assert.deepEqual(membershipWrites(h.writes), []);
});

test("revoked membership keeps the stored role as history, with no implicit recovery of authority", async () => {
  for (const roleKey of ["founder", "gestor", "corretor"]) {
    const h = harness({ membership: revoked(roleKey), activeMembers: 2 });
    const summary = await h.responsibility.readWorkspaceManagementSummary(h.scope);
    assert.equal(summary.selectedRoleKey, roleKey, `${roleKey}: papel histórico disponível`);
    assert.deepEqual(summary.permissions, [], `${roleKey}: sem permissão efetiva`);
    assert.equal(summary.canManageMembers, false, `${roleKey}: sem gestão de membros`);
    assert.equal(summary.membershipActive, false);
    // Leituras repetidas não recuperam autoridade nem alteram o vínculo.
    const again = await h.responsibility.readWorkspaceResponsibleProfile(h.scope);
    assert.deepEqual(again.permissions, []);
    assert.equal(again.canManageMembers, false);
    assert.equal(h.responsibility.canActivateProducts(again), false);
    assert.deepEqual(membershipWrites(h.writes), [], `${roleKey}: sem escrita no vínculo`);
  }
  for (const status of ["inactive", "suspended"]) {
    const h = harness({ membership: { role_key: "founder", permissions: [...ADMIN_PERMISSIONS], status }, activeMembers: 2 });
    const profile = await h.responsibility.readWorkspaceResponsibleProfile(h.scope);
    assert.equal(profile.selectedRoleKey, "founder");
    assert.deepEqual(profile.permissions, [], `${status}: sem permissão efetiva`);
    assert.equal(h.responsibility.canActivateProducts(profile), false, `${status}: não ativa produtos`);
  }
});

test("revoked membership is not bootstrapped, reactivated or promoted, and the stored row is untouched", async () => {
  const membership = revoked("auditor-externo");
  const before = JSON.stringify(membership);
  const h = harness({ membership, activeMembers: 2 });
  await h.responsibility.readWorkspaceResponsibleProfile(h.scope);
  await h.responsibility.readWorkspaceManagementSummary(h.scope);
  assert.deepEqual(membershipWrites(h.writes), []);
  assert.equal(JSON.stringify(membership), before, "stored role, permissions and status are preserved");
});

test("revoked membership with exactly one other active member stays revoked and without authority", async () => {
  const membership = revoked("corretor");
  const before = JSON.stringify(membership);
  const h = harness({ membership, activeMembers: 1 });
  const profile = await h.responsibility.readWorkspaceResponsibleProfile(h.scope);
  assert.deepEqual(profile.permissions, []);
  assert.equal(profile.selectedRoleKey, "corretor", "AUTHZ-4b: o papel gravado não é promovido, só consultado");
  assert.deepEqual(membershipWrites(h.writes), [], "no promotion to founder");
  assert.equal(JSON.stringify(membership), before);
  const response = await createOwner(h.request);
  assert.equal(response.status, 403);
});

test("active membership keeps its legitimate permissions", async () => {
  const corretor = harness({ membership: { role_key: "corretor", permissions: ["imob.chat.use", "imob.stage.*"], status: "active" }, activeMembers: 2 });
  const response = await createOwner(corretor.request);
  assert.equal(response.status, 201, "A: corretor ativo cria proprietário");
  const profile = await corretor.responsibility.readWorkspaceResponsibleProfile(corretor.scope);
  assert.ok(profile.permissions.includes("imob.chat.use"), "B: permissões do corretor ativo");
  assert.equal(corretor.responsibility.canActivateProducts(profile), false, "C: corretor não ativa produtos");

  const founder = harness({ membership: { role_key: "founder", permissions: [...ADMIN_PERMISSIONS], status: "active" }, activeMembers: 2 });
  const founderProfile = await founder.responsibility.readWorkspaceResponsibleProfile(founder.scope);
  assert.equal(founderProfile.membershipActive, true);
  assert.equal(founderProfile.canManageMembers, true);
  assert.equal(founder.responsibility.canActivateProducts(founderProfile), true, "D: founder ativo ativa produtos (perfil)");
  assert.equal(await founder.activation.canUserActivateProducts(founder.scope), true, "E: founder ativo ativa produtos (serviço)");
  assert.deepEqual(membershipWrites(founder.writes), [], "F: sem escrita de vínculo");
});

test("user without membership: the IMOB door never bootstraps; the workspace profile keeps the existing bootstrap behavior", async () => {
  const denied = harness({ membership: null, activeMembers: 3 });
  const response = await createOwner(denied.request);
  assert.equal(response.status, 403);
  assert.equal(response.body.error.code, "IMOB_WORKSPACE_MEMBERSHIP_REQUIRED");
  assert.deepEqual(membershipWrites(denied.writes), [], "the IMOB router creates no membership");
  assert.deepEqual(crmWrites(denied.writes), []);

  const profile = harness({ membership: null, activeMembers: 3 });
  await profile.responsibility.readWorkspaceResponsibleProfile(profile.scope);
  assert.ok(
    membershipWrites(profile.writes).some((entry) => entry === "raw.execute:INSERT INTO eiah_workspace_memberships"),
    "the pre-existing workspace profile bootstrap for a user with NO membership is unchanged",
  );
});

test("membership lookup stays scoped to the token tenant and workspace", async () => {
  const h = harness({
    membership: { role_key: "corretor", permissions: ["imob.chat.use"], status: "active" },
    activeMembers: 2,
    owners: [{ id: "owner-foreign", tenantId: T2, workspaceId: W2, name: "Outro tenant", status: "ativo", pendingItems: [] }],
  });
  const response = await h.request.patch("/api/imob/owners/owner-foreign").set("authorization", "Bearer synthetic").send({ phone: "0000" });
  assert.equal(response.status, 404);
  assert.deepEqual(crmWrites(h.writes), []);
  assert.ok(h.membershipLookups.length > 0);
  for (const values of h.membershipLookups) assert.deepEqual(values, [USER, T, W]);
});
