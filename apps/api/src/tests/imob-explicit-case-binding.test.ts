import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { IMOB_CASE_BINDING_POLICY } from "../services/imob/crm/imobCrmAgentContract";
import { resolveImobCaseOperationalConsult, resolveMissingImobCaseBinding } from "../services/imob/crm/imobCrmOperationalCase";
import { buildImobCrmBusinessReadHelpers } from "../services/imob/crm/imobCrmBusinessRead";
import { matchImobConversationalIntents } from "../services/imob/imobIntentCatalog";
import { isImobVerticalEnabled } from "../services/chat/verticalRegistryComposition";

// Execute canonical .ts sources in memory. No generated JS, sockets, database or Redis.
// The route handler and access middleware are real; persistence, engine dispatch and
// audit transport are test doubles. Engine forwarding is not an end-to-end chat test.
const routeSource = readFileSync(new URL("../routes/imob.ts", import.meta.url), "utf8");
const routeAst = ts.createSourceFile("imob.ts", routeSource, ts.ScriptTarget.Latest, true);
function evaluate(source: string, deps: Record<string, unknown> = {}) {
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} as any };
  new Function("module", "exports", ...Object.keys(deps), output)(module, module.exports, ...Object.values(deps));
  return module.exports;
}
function loadSource(relative: string, imports: Record<string, unknown>) {
  return evaluate(readFileSync(new URL(relative, import.meta.url), "utf8"), {
    require: (name: string) => {
      assert.ok(name in imports, `unmocked dependency: ${name}`);
      return imports[name];
    },
  });
}
function routeFunction(name: string, deps: Record<string, unknown> = {}) {
  const node = routeAst.statements.find((item) => ts.isFunctionDeclaration(item) && item.name?.text === name);
  assert.ok(node, name);
  return evaluate(`${node.getText(routeAst)}\nmodule.exports = ${name};`, deps);
}
const asObject = routeFunction("asObject");
const asString = routeFunction("asString");
const normalizeImobRouteText = routeFunction("normalizeImobRouteText");
let intentMethod: ts.MethodDeclaration | undefined;
let handler: ts.ArrowFunction | undefined;
function visit(node: ts.Node) {
  if (ts.isMethodDeclaration(node) && node.name.getText(routeAst) === "resolveBusinessReadIntent") intentMethod = node;
  if (ts.isCallExpression(node) && node.expression.getText(routeAst) === "imobRouter.post"
    && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === "/chat/resolve-turn") {
    assert.ok(ts.isArrowFunction(node.arguments[1]));
    handler = node.arguments[1];
  }
  ts.forEachChild(node, visit);
}
visit(routeAst);
assert.ok(intentMethod);
assert.ok(handler);
const resolveBusinessReadIntent = evaluate(`module.exports = {${intentMethod.getText(routeAst)}}.resolveBusinessReadIntent;`, {
  matchImobConversationalIntents, normalizeImobRouteText,
});
const business = buildImobCrmBusinessReadHelpers({ resolveBusinessReadIntent } as any);
const classifiers = {
  normalizeImobRouteText,
  resolveImobBusinessReadIntent: resolveBusinessReadIntent,
  isBulkPropertyOnboardingQuestion: business.isBulkPropertyOnboardingQuestion,
  isImobRecentRegistrationReadRequest: business.isImobRecentRegistrationReadRequest,
};
const scope = { tenantId: "T", workspaceId: "W", userId: "U" };
const caseA = { ...scope, id: "CASE_A", threadId: "THREAD", stage: "qualified", flow: "case.review",
  status: "open", pendingItems: [], blockers: [], metadata: {}, updatedAt: 1 };
const caseB = { ...caseA, id: "CASE_B", updatedAt: 2 };

function caseFixture(records = [caseA, caseB]) {
  const queries: any[] = [];
  const writes: string[] = [];
  const forbidden = (name: string) => () => { writes.push(name); assert.fail(`unexpected mutation: ${name}`); };
  const prisma: any = new Proxy({ imobCase: {
    findFirst: async (args: any) => {
      queries.push(args);
      const found = records.filter((item: any) => Object.entries(args.where).every(([key, value]) => item[key] === value));
      if (args.orderBy) found.sort((a, b) => b.updatedAt - a.updatedAt);
      return found[0] ?? null;
    },
    findMany: async (args: any) => { queries.push(args); return records; },
    create: forbidden("case.create"), update: forbidden("case.update"), upsert: forbidden("case.upsert"),
  } }, {
    get(target: any, name: string) {
      if (name in target) return target[name];
      return new Proxy({}, { get: (_target, method: string) => forbidden(`${name}.${method}`) });
    },
  });
  const helpers: any = {
    ...classifiers, asObject, asString, createEmptyThreadState: () => ({}),
    formatImobCaseFlowLabel: (value: string) => value, formatImobStatusLabel: (value: string) => value,
    formatImobPendingList: (value: string[]) => value.join(", "),
    buildCaseContextFromRecord: (item: any) => ({ caseId: item.id }),
    buildImobBusinessReadPresentation: () => ({ text: "Caso explícito" }),
    buildBulkPropertyOnboardingConsult: () => ({ mode: "consult", action: IMOB_CASE_BINDING_POLICY.independentGuidance }),
    buildImobRecentRegistrationConsult: async (params: any) => {
      assert.ok(params.caseId);
      const item = await prisma.imobCase.findFirst({ where: { id: params.caseId, tenantId: params.tenantId, workspaceId: params.workspaceId } });
      return { mode: "consult", caseContext: item ? { caseId: item.id } : null };
    },
  };
  async function consult(caseId: string | null, kind = "pipeline_status", extra: Record<string, unknown> = {}) {
    return resolveImobCaseOperationalConsult({ prisma, ...scope, caseId,
      message: kind === "lookup" ? "consultar caso CASE_A" : "qual status desse caso?",
      canOperateStage: (stage) => stage === "qualified", ...extra }, helpers,
    { normalized: kind === "recent_registration" ? "o que cadastrei" : "consultar caso",
      businessReadIntent: ["lookup", "recent_registration"].includes(kind) ? null : kind,
      wantsCase: true, asksShow: true, asksLeadCases: false } as any);
  }
  return { prisma, helpers, queries, writes, consult };
}
function assertMissing(data: any) {
  assert.equal(data.mode, "blocked");
  assert.equal(data.presentation.metadata.reasonCode, "IMOB_CASE_CONTEXT_MISSING");
  assert.equal(data.caseContext, null);
  assert.doesNotMatch(JSON.stringify(data), /CASE_A|CASE_B/);
}

for (const kind of IMOB_CASE_BINDING_POLICY.requiredReads) {
  for (const records of [[], [caseA], [caseA, caseB]]) {
    test(`resolver: ${kind}, ${records.length} cases, no binding => no reads or writes`, async () => {
      const fixture = caseFixture(records);
      assertMissing(await fixture.consult(null, kind));
      assert.deepEqual(fixture.queries, []);
      assert.deepEqual(fixture.writes, []);
    });
  }
  test(`resolver: ${kind} keeps explicit CASE_A`, async () => {
    const fixture = caseFixture();
    const result: any = await fixture.consult("CASE_A", kind);
    assert.equal(result.caseContext.caseId, "CASE_A");
    assert.ok(fixture.queries.every((query) => query.where.id === "CASE_A" && !query.orderBy));
    assert.deepEqual(fixture.writes, []);
  });
}
for (const kind of ["lookup", "pipeline_status"]) {
  for (const denied of [[], [{ ...caseA, tenantId: "FOREIGN" }], [{ ...caseA, workspaceId: "OTHER" }], [{ ...caseA, stage: "secret" }]]) {
    test(`resolver: ${kind} rejects unavailable CASE_A without substitution (${JSON.stringify(denied)})`, async () => {
      const fixture = caseFixture([...denied, caseB]);
      const result: any = await fixture.consult("CASE_A", kind);
      assert.equal(result.caseContext, undefined);
      assert.doesNotMatch(JSON.stringify(result), /CASE_B|secret|FOREIGN/);
      assert.ok(fixture.queries.every((query) => query.where.id === "CASE_A"));
      assert.deepEqual(fixture.writes, []);
    });
  }
}
test("resolver: whitespace, text ID and client operational state are not explicit binding", async () => {
  const fixture = caseFixture();
  assertMissing(await fixture.consult(" ", "lookup", { threadState: { activeCaseId: "CASE_A", operational: { flow: "case.review" } } }));
  assert.deepEqual(fixture.queries, []);
});
test("resolver: generic/listing context delegates; bulk onboarding guidance stays unbound", async () => {
  const fixture = caseFixture();
  const params = { prisma: fixture.prisma, ...scope, message: "olá" };
  assert.equal(await resolveImobCaseOperationalConsult(params, fixture.helpers, { normalized: "ola" } as any), null);
  const guidance: any = await resolveImobCaseOperationalConsult(params, fixture.helpers,
    { normalized: "como cadastrar varios imoveis" } as any);
  assert.equal(guidance.action, IMOB_CASE_BINDING_POLICY.independentGuidance);
  assert.equal(guidance.caseContext, undefined);
  assert.deepEqual(fixture.queries, []);
});

// Real permission functions and gate modules; only their I/O dependencies are replaced.
const responsibility = loadSource("../services/workspaceResponsibility.ts", {
  "node:crypto": {}, "@repo/db": {}, "./idempotentDdl": {}, "./workspaceBootstrapShadow": {},
});
type RouteOptions = { records?: typeof caseA[]; installed?: boolean; membership?: string | null; permissions?: string[] };
async function callRoute(body: Record<string, unknown>, options: RouteOptions = {}) {
  const fixture = caseFixture(options.records);
  const permissions = options.permissions ?? ["imob.chat.use", "imob.stage.qualified"];
  const membership = options.membership === undefined ? "active" : options.membership;
  const engineInputs: any[] = [];
  const dispatches: any[] = [];
  const events: string[] = [];
  const req: any = { body, path: "/chat/resolve-turn", authContext: scope, prisma: fixture.prisma };
  const res: any = { statusCode: 200, req, status(code: number) { this.statusCode = code; return this; },
    json(value: unknown) { this.body = value; return this; } };
  const sendDenied = (_res: any, params: any) => res.status(403).json({ ok: false, error: { code: params.code, reasonCode: params.reasonCode } });
  const sendImobPermissionDenied = (_req: any, _res: any, params: any) => sendDenied(res, params);
  const permissionDeps = { ...responsibility, sendImobPermissionDenied };
  const actualHandler = evaluate(`module.exports = ${handler!.getText(routeAst)};`, {
    asString, asObject, resolveMissingImobCaseBinding, normalizeImobRouteText,
    imobCrmBusinessRead: classifiers,
    readImobWorkspaceAccessProfile: async () => ({ permissions, responsibleLabel: "Fixture" }),
    ensureImobWorkspacePermission: routeFunction("ensureImobWorkspacePermission", permissionDeps),
    ensureImobStagePermission: routeFunction("ensureImobStagePermission", permissionDeps),
    canWorkspaceOperateImobStage: responsibility.canWorkspaceOperateImobStage,
    resolveImobEntitlements: async () => ({}), resolveImobTenantRecipeForWorkspace: async () => null,
    resolveImobRecipeMissionContext: () => null, parseImobPendingAction: () => null,
    buildImobCanonicalCase: () => ({}),
    resolveImobCrmActionDispatch: (input: any) => { dispatches.push(input); return { mode: "consult" }; },
    resolveImobCrmTurnEngine: async (input: any) => {
      engineInputs.push(input.body);
      if (resolveBusinessReadIntent(input.body.message)) return fixture.consult(input.body.caseId);
      return { mode: "consult", action: "fixture.generic", caseContext: null };
    },
    hydrateThreadStateWithPersistedLead: () => assert.fail("unexpected hydration"),
    resolveImobOperationalUpdate: () => assert.fail("unexpected update"),
    resolveImobOperationalConsult: () => assert.fail("unexpected consult"),
    applyExistingRegistrationResolution: () => assert.fail("unexpected registration"),
    injectResolvedPendingSuggestion: () => assert.fail("unexpected pending suggestion"),
    upsertImobCaseFromResolvedTurn: () => assert.fail("unexpected upsert"),
    formatImobCaseFlowLabel: (value: string) => value,
    IMOB_CHAT_AGENT_ID: "fixture-agent", recordImobResolveTurnSemanticTelemetry: async () => { events.push("telemetry"); },
  });
  const shared = { "../../middlewares/asyncHandler": { asyncHandler: (fn: unknown) => fn },
    "./imobAccessGate": { sendImobAccessDenied: sendDenied } };
  const installation = loadSource("../services/imob/imobInstallationGate.ts", { ...shared,
    "../chat/verticalRegistryComposition": { isImobVerticalEnabled },
    "../chat/workspaceVerticalRegistry": { readImobInstallationFacts: async () => ({
      installationStatus: options.installed === false ? "missing" : "active", entitled: true, agentsReady: true, usage: "full",
    }) },
  }).imobInstallationGate;
  const gateResponsibility = { ...responsibility, ensureWorkspaceResponsibilityStore: async () => {},
    readActiveWorkspaceMembershipPermissions: async () => membership === "active" ? permissions : null };
  const membershipGate = loadSource("../services/imob/imobMembershipGate.ts", { ...shared,
    "../workspaceResponsibility": gateResponsibility }).imobMembershipGate;
  const accessGate = loadSource("../services/imob/imobWorkspaceAccessGate.ts", { ...shared,
    "../workspaceResponsibility": gateResponsibility }).imobWorkspaceAccessGate;
  fixture.prisma.$queryRaw = async () => membership ? [{ status: membership }] : [];
  for (const gate of [installation, membershipGate, accessGate]) {
    let next = false;
    await gate(req, res, () => { next = true; });
    if (!next) return { res, ...fixture, engineInputs, dispatches, events };
  }
  await actualHandler(req, res);
  return { res, ...fixture, engineInputs, dispatches, events };
}

for (const records of [[caseA], [caseA, caseB]]) {
  for (const threadId of [undefined, "THREAD"]) {
    for (const message of ["qual status desse caso?", "consultar caso CASE_A", "o que cadastrei", "caso mais recente"]) {
      test(`route: ${records.length} cases / ${threadId ?? "no thread"} / ${message}: no implicit binding`, async () => {
        const result = await callRoute({ message, threadId }, { records });
        assertMissing(result.res.body.data);
        assert.deepEqual(result.queries, []);
        assert.deepEqual(result.writes, []);
        assert.deepEqual(result.engineInputs, []);
        assert.deepEqual(result.events, []);
      });
    }
  }
}
test("route: explicit CASE_A is preserved even when CASE_B is newer in the thread", async () => {
  const result = await callRoute({ message: "qual status desse caso?", caseId: "CASE_A", threadId: "THREAD" });
  assert.equal(result.res.body.data.caseContext.caseId, "CASE_A");
  assert.equal(result.engineInputs[0].caseId, "CASE_A");
  assert.ok(result.queries.every((query) => query.where.id === "CASE_A" && !query.orderBy));
  assert.deepEqual(result.writes, []);
});
for (const records of [[caseB], [{ ...caseA, tenantId: "FOREIGN" }, caseB], [{ ...caseA, workspaceId: "OTHER" }, caseB]]) {
  test(`route: unavailable explicit case never substitutes another (${JSON.stringify(records[0])})`, async () => {
    const result = await callRoute({ message: "qual status desse caso?", caseId: "CASE_A", threadId: "THREAD" }, { records });
    assert.equal(result.res.body.data.caseContext, undefined);
    assert.doesNotMatch(JSON.stringify(result.res.body), /CASE_B|FOREIGN|OTHER/);
    assert.ok(result.queries.every((query) => query.where.id === "CASE_A"));
    assert.deepEqual(result.writes, []);
  });
}
for (const message of ["olá", "listar casos", "listar proprietários", "listar imóveis", "listar leads", "quais casos do lead Carlos"]) {
  test(`route: unbound generic/listing input still delegates without case selection: ${message}`, async () => {
    const result = await callRoute({ message, threadId: "THREAD" });
    assert.equal(result.res.body.data.action, "fixture.generic");
    assert.equal(result.engineInputs[0].caseId, null);
    assert.deepEqual(result.queries, []);
    assert.deepEqual(result.writes, []);
  });
}
test("route: directed action without case stops before lookup, dispatch, engine and telemetry", async () => {
  const result = await callRoute({ message: "confirmar", actionId: "case.advance", threadId: "THREAD" });
  assertMissing(result.res.body.data);
  for (const values of [result.queries, result.dispatches, result.engineInputs, result.writes, result.events]) assert.deepEqual(values, []);
});
test("route: directed action with nonexistent explicit case never dispatches", async () => {
  const result = await callRoute({ message: "confirmar", actionId: "case.advance", caseId: "ABSENT", threadId: "THREAD" });
  assert.equal(result.res.body.data.mode, "blocked");
  assert.equal(result.res.body.data.presentation.metadata.workflowReasonCode, "ACTION_NOT_ALLOWED_FOR_CASE");
  assert.deepEqual(result.dispatches, []);
  assert.deepEqual(result.writes, []);
});
for (const [options, code] of [
  [{ installed: false }, "ENTITLEMENT_MISSING"],
  [{ membership: null }, "IMOB_WORKSPACE_MEMBERSHIP_REQUIRED"],
  [{ membership: "revoked" }, "IMOB_WORKSPACE_MEMBERSHIP_INACTIVE"],
  [{ permissions: [] }, "IMOB_WORKSPACE_PERMISSION_FORBIDDEN"],
] as Array<[RouteOptions, string]>) {
  test(`route gates: ${code} stays closed before case reads`, async () => {
    const result = await callRoute({ message: "qual status desse caso?", caseId: "CASE_A" }, options);
    assert.equal(result.res.statusCode, 403);
    assert.equal(result.res.body.error.code, code);
    for (const values of [result.queries, result.dispatches, result.engineInputs, result.writes]) assert.deepEqual(values, []);
  });
}
test("route: denied stage stops before dispatch and engine without revealing case data", async () => {
  const result = await callRoute({ message: "confirmar", actionId: "case.advance", caseId: "CASE_A" }, { permissions: ["imob.chat.use", "imob.stage.collecting"] });
  assert.equal(result.res.statusCode, 403);
  assert.equal(result.res.body.error.code, "IMOB_STAGE_FORBIDDEN");
  assert.doesNotMatch(JSON.stringify(result.res.body), /CASE_A|CASE_B/);
  for (const values of [result.dispatches, result.engineInputs, result.writes]) assert.deepEqual(values, []);
});
test("route registration keeps installation, membership and workspace access before the handler", () => {
  const handlerPosition = routeSource.indexOf('imobRouter.post("/chat/resolve-turn"');
  let previous = -1;
  for (const name of ["enforceTenant", "imobRevocationGate", "imobInstallationGate", "imobMembershipGate", "imobWorkspaceAccessGate"]) {
    const position = routeSource.indexOf(`imobRouter.use(${name})`);
    assert.ok(position > previous && position < handlerPosition, name);
    previous = position;
  }
});
