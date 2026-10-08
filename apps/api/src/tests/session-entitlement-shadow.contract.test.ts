import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import ts from "typescript";
import express from "express";
import supertest from "supertest";

const P5 = ["realestate.apply_adjustment", "action.realestate.apply_adjustment", "realestate.register_property", "realestate.create_contract", "realestate.release_commission"];
const EXTRA = ["realestate.configure_property_rules", "realestate.search_knowledge_base"];
const tenantId = "synthetic-tenant", workspaceId = "synthetic-workspace";
type Policy = { actionName: string; tenantId: string; workspaceId: string | null; allowed: boolean };
type Fixture = { installation?: string; marketplace?: boolean; policies?: Policy[]; logging?: "create" | "emit"; trace?: boolean; installationFailure?: boolean };
const policy = (actionName: string, workspace: string | null = workspaceId, allowed = true): Policy => ({ actionName, tenantId, workspaceId: workspace, allowed });

// Load canonical TS sources with controlled external dependencies. No real DB,
// environment files, generated src/*.js, or production dependency injection.
function harness(fixture: Fixture, sourceOverride?: string) {
  const logs: Record<string, unknown>[] = [], order: string[] = [], queries: unknown[] = [];
  const prisma = {
    tenantActionPolicy: { findMany: async (query: any) => {
      queries.push(query);
      const rows = (fixture.policies ?? []).filter((row) => row.tenantId === query.where.tenantId &&
        query.where.OR.some((scope: any) => scope.workspaceId === row.workspaceId) &&
        row.allowed === query.where.allowed && query.where.actionName.in.includes(row.actionName));
      return rows.slice(0, query.take ?? rows.length).map((row, index) => query.select.actionName ? { actionName: row.actionName } : { id: String(index) });
    } },
    marketplaceItem: { findMany: async () => fixture.marketplace ? [{ id: "synthetic-item" }] : [] },
    $queryRaw: async () => { if (fixture.installationFailure) throw new Error("synthetic read failure"); return fixture.installation ? [{ product: "IMOB", status: fixture.installation }] : []; },
    tenant: { findUnique: async () => ({ id: tenantId, name: "Synthetic tenant" }) },
    workspace: { findUnique: async () => ({ id: workspaceId, name: "Synthetic workspace" }) },
  };
  const overrides: Record<string, unknown> = {
    "@repo/db": { prismaGlobal: prisma },
    "@eiah/core/logging/logger": { createLogger: (context: Record<string, unknown>) => {
      if (fixture.logging === "create") throw new Error("synthetic logger creation failure");
      return { info: (fields: Record<string, unknown>) => {
        if (fixture.logging === "emit") throw new Error("synthetic log emission failure");
        order.push("shadow"); logs.push({ ...context, ...fields });
      } };
    } },
    "@eiah/core/services/guardrailLedgerStore": { recordGuardrailAudit: async () => { order.push("deny-audit"); } },
  };
  const cache = new Map<string, { exports: any }>();
  function load(path: string): any {
    if (cache.has(path)) return cache.get(path)!.exports;
    const module = { exports: {} as any }; cache.set(path, module);
    const nativeRequire = createRequire(path);
    const localRequire = (specifier: string) => {
      if (specifier in overrides) return overrides[specifier];
      if (specifier.endsWith("/auth/apiTokenRepository")) return { findApiToken: async () => ({ tokenId: "synthetic-token-id", tenantId, workspaceId, userId: null, revoked: false, expiresAt: null }) };
      if (specifier.endsWith("/logistica/control/preDuimpAccessResolver")) return { resolvePreDuimpAccessFromCanonicalSources: async () => ({ capability: { available: false } }) };
      if (specifier.startsWith(".")) {
        const target = resolve(dirname(path), specifier + ".ts");
        if (existsSync(target)) return load(target);
      }
      return nativeRequire(specifier);
    };
    const source = path.endsWith("/routes/session.ts") && sourceOverride ? sourceOverride : readFileSync(path, "utf8");
    const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    new Function("require", "module", "exports", output)(localRequire, module, module.exports);
    return module.exports;
  }
  const router = load(resolve("apps/api/src/routes/session.ts")).sessionRouter;
  const app = express();
  app.use((req, res, next) => {
    // Public req.logger deliberately absent, matching runtime Symbol storage.
    (req as typeof req & { traceId?: string }).traceId = "synthetic-gate-trace";
    if (fixture.trace !== false) res.setHeader("x-trace-id", "synthetic-response-trace");
    res.on("finish", () => order.push("response")); next();
  });
  app.use(router);
  return { app, logs, order, queries, prisma, load };
}

async function request(fixture: Fixture, sourceOverride?: string) {
  const h = harness(fixture, sourceOverride);
  const response = await supertest(h.app).get("/session/context?domain=imob").set("authorization", "Bearer synthetic-secret");
  return { ...h, response };
}

const scenarios: Array<{ name: string; fixture: Fixture; signals: boolean[]; session: string[]; shared: string[] }> = [
  { name: "A installation only", fixture: { installation: "active" }, signals: [true,false,false,false,true,true,true], session: [], shared: [] },
  ...P5.map((actionName) => ({ name: `B P5 only ${actionName}`, fixture: { policies: [policy(actionName)] }, signals: [false,true,true,false,true,true,true], session: [actionName], shared: [actionName] })),
  ...EXTRA.map((actionName) => ({ name: `C P7 exclusive ${actionName} remains denied`, fixture: { policies: [policy(actionName)] }, signals: [false,false,true,false,false,true,false], session: [], shared: [actionName] })),
  { name: "D marketplace only remains allowed", fixture: { marketplace: true }, signals: [false,false,false,true,true,false,false], session: [], shared: [] },
  { name: "E no source remains denied", fixture: {}, signals: [false,false,false,false,false,false,true], session: [], shared: [] },
  { name: "F mixed sources and duplicates", fixture: { installation: "active", marketplace: true, policies: [policy(P5[2]), policy(EXTRA[1]), policy(P5[0]), policy(P5[2], null)] }, signals: [true,true,true,true,true,true,true], session: [P5[0],P5[2]].sort(), shared: [P5[0],P5[2],EXTRA[1]].sort() },
  { name: "G tenant-wide grant survives workspace denial", fixture: { policies: [policy(P5[0], null), policy(P5[0], workspaceId, false)] }, signals: [false,true,true,false,true,true,true], session: [P5[0]], shared: [P5[0]] },
  { name: "H false, foreign tenant and foreign workspace excluded", fixture: { policies: [policy(P5[0], null, false), policy(EXTRA[0], workspaceId, false), policy(P5[1], "other-workspace"), { ...policy(P5[2]), tenantId: "other-tenant" }] }, signals: [false,false,false,false,false,false,true], session: [], shared: [] },
  { name: "I P5 and exclusive P7", fixture: { policies: [policy(EXTRA[0]),policy(P5[3])] }, signals: [false,true,true,false,true,true,true], session: [P5[3]], shared: [P5[3],EXTRA[0]].sort() },
  { name: "inactive installation remains denied", fixture: { installation: "suspended" }, signals: [false,false,false,false,false,false,true], session: [], shared: [] },
  { name: "installation read failure retains fallback", fixture: { installationFailure: true, marketplace: true }, signals: [false,false,false,true,true,false,false], session: [], shared: [] },
];
for (const scenario of scenarios) test(scenario.name, async () => {
  const h = await request(scenario.fixture);
  const [I,P5Present,P7Present,M,S,Shared,aligned] = scenario.signals;
  assert.equal(h.response.status, S ? 200 : 403);
  assert.equal(h.response.headers["cache-control"], "no-store");
  assert.deepEqual(h.logs, [{ tenantId,workspaceId,traceId: "synthetic-response-trace",event: "imob.entitlement_shadow",installationActive:I,sessionPolicyPresent:P5Present,sharedPolicyPresent:P7Present,marketplacePresent:M,sessionLegacyAllowed:S,sharedLegacyAllowed:Shared,aligned,sessionMatchedActions:scenario.session,sharedMatchedActions:scenario.shared }]);
  if (process.env.IMOB_SHADOW_PRINT_DIAGNOSTICS === "1") console.log(JSON.stringify({ scenario: scenario.name, diagnostic: h.logs[0] }));
  assert.equal(h.queries.length, 1);
  const query = h.queries[0] as any;
  assert.deepEqual(query, { where: { tenantId, OR: [{ workspaceId },{ workspaceId:null }], actionName:{ in:[...P5,...EXTRA] },allowed:true },select:{ actionName:true } });
  assert.equal(h.order[0], "shadow", "L/M diagnostic precedes deny audit and response");
  assert.equal(h.order.at(-1), "response");
  if (S) {
    assert.deepEqual(Object.keys(h.response.body.data).sort(), ["tenantId","workspaceId","userId","activeDomain","availableDomains","entitlements","capabilities","productInstallations","verticals","roles","experience","branding"].sort());
    assert.deepEqual(h.response.body.data.entitlements, { REAL_ESTATE_CORE:S,EXPORTS_ADDON:true,BILLING_INSIGHTS_ADDON:true,IMOB_INSTALLED:I });
  } else {
    assert.equal(h.response.body.error.code, "ENTITLEMENT_MISSING");
    assert.equal(h.response.body.error.reasonCode, scenario.fixture.installation ? "IMOB_INSTALLATION_INACTIVE" : "IMOB_ENTITLEMENT_MISSING");
  }
  assert.equal(JSON.stringify(h.response.body).includes("entitlementShadow"), false);
  assert.equal(JSON.stringify(h.logs).includes("synthetic-secret"), false);
  // Compare the observed shared alias with the unchanged canonical reader.
  const shared = h.load(resolve("apps/api/src/services/imob/imobEntitlements.ts"));
  const result = await shared.resolveImobEntitlements({ prisma:h.prisma,tenantId,workspaceId });
  assert.equal(result.REAL_ESTATE_CORE, Shared);
  assert.equal(result.IMOB_INSTALLED, I);
});

for (const logging of ["create", "emit"] as const) for (const fixture of [{ installation:"active" }, {}]) {
  test(`J ${logging} logging failure preserves complete HTTP ${fixture.installation ? "allow" : "deny"}`, async () => {
    const normal = await request(fixture);
    const failing = await request({ ...fixture, logging });
    assert.equal(failing.response.status, normal.response.status);
    assert.deepEqual(failing.response.body, normal.response.body);
    assert.equal(failing.logs.length, 0);
  });
}
test("existing response trace optional; no correlation generated", async () => {
  const h = await request({ installation:"active",trace:false });
  assert.equal("traceId" in h.logs[0], false);
  assert.equal(h.response.headers["x-trace-id"], undefined);
});

// Optional local evidence: compare full HTTP bodies with the pre-edit source.
// CI does not depend on git history or a temporary baseline.
if (process.env.IMOB_SESSION_BASELINE_SOURCE) {
  const baseline = readFileSync(process.env.IMOB_SESSION_BASELINE_SOURCE, "utf8");
  test("K local pre-edit baseline: identical status and complete HTTP body for all scenarios", async () => {
    for (const scenario of scenarios) {
      const before = await request(scenario.fixture, baseline);
      const after = await request(scenario.fixture);
      assert.equal(after.response.status, before.response.status, scenario.name);
      assert.deepEqual(after.response.body, before.response.body, scenario.name);
    }
  });
}
