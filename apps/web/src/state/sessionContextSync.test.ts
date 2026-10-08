import { readFileSync } from "node:fs";
import ts from "typescript";
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { SessionContextResponse } from "@/lib/api";
import { getSession, updateSession } from "./sessionStore";
import { syncSessionContext } from "./sessionContextSync";
import * as sessionContextSync from "./sessionContextSync";
import { isImobSurfaceAvailable } from "@/lib/entitlements";

const context: NonNullable<SessionContextResponse["data"]> = {
  tenantId: "tenant-test",
  workspaceId: "workspace-test",
  userId: null,
  activeDomain: "imob",
  availableDomains: ["core", "imob"],
  entitlements: { REAL_ESTATE_CORE: true, IMOB_INSTALLED: true, EXPORTS_ADDON: true, BILLING_INSIGHTS_ADDON: true },
  productInstallations: [{ product: "IMOB", status: "active" }],
  verticals: [{ verticalId: "IMOB", label: "IMOB", activeDomain: "imob", installedProduct: "IMOB", enabled: true,
    rolloutStage: "operationalized", frontDoorSurface: "imob_chat", operationalHubSurface: "imob_dashboard",
    governanceHubSurface: "marketplace", investigationSurfaces: ["runs"], contextSpecRef: "vertical-context-imob.md" }],
  roles: ["admin"],
  experience: { resolverVersion: "test", roleProfile: "workspace_admin", landingSurface: "chat", landingPath: "/app/chat",
    primaryNavigation: [], recommendedActions: [], allowedSurfaceClasses: ["front_door"], fallbackMode: "fail_closed",
    cachePolicy: { strategy: "session_context_only", sourceOfTruth: "runtime", mode: "fail_safe_accelerator" } },
  branding: { brandName: "Test", logoUrl: null, primaryColor: "#123456", workspaceLabel: "Workspace test" },
};

beforeEach(() => updateSession({
  tenantId: "tenant-test", workspaceId: "workspace-test", userId: "old-user", token: "synthetic-token",
  activeDomain: "core", installedProducts: [], entitlements: { REAL_ESTATE_CORE: false },
  preDuimpAccess: { status: "idle" }, accessGate: { code: "ENTITLEMENT_MISSING" },
}));

test("sincroniza contexto server-authoritative em uma atualização e preserva token/capability independente", async () => {
  const before = getSession();
  const result = await syncSessionContext("imob", async (domain) => {
    assert.equal(domain, "imob");
    // Campos fora da projeção não podem substituir credenciais/capabilities.
    return { ok: true, data: { ...context, token: "ignored", capabilities: {} } };
  });
  assert.equal(result.activeDomain, "imob");
  assert.equal(isImobSurfaceAvailable(getSession()), true);
  assert.deepEqual(getSession(), {
    ...before,
    tenantId: context.tenantId, workspaceId: context.workspaceId, userId: undefined,
    activeDomain: context.activeDomain, availableDomains: context.availableDomains,
    entitlements: context.entitlements, installedProducts: ["IMOB"], verticals: context.verticals,
    roles: context.roles, experience: context.experience, branding: context.branding, accessGate: null,
  });
});

test("contexto core e instalação ausente substituem estado anterior sem inferir produto/entitlement", async () => {
  updateSession({ installedProducts: ["IMOB"] });
  await syncSessionContext("core", async (domain) => {
    assert.equal(domain, "core");
    return { ok: true, data: { ...context, activeDomain: "core", productInstallations: undefined,
      entitlements: { ...context.entitlements, REAL_ESTATE_CORE: false, IMOB_INSTALLED: false } } };
  });
  assert.equal(getSession().activeDomain, "core");
  assert.deepEqual(getSession().installedProducts, []);
  assert.equal(getSession().entitlements?.IMOB_INSTALLED, false);
  assert.equal(isImobSurfaceAvailable(getSession()), false);
});

test("reload sem snapshots espera hidratação canônica; revogação/downgrade remove a superfície", async () => {
  updateSession({ activeDomain: "imob", installedProducts: ["IMOB"], availableDomains: undefined, entitlements: undefined, verticals: undefined, accessGate: null });
  assert.equal(isImobSurfaceAvailable(getSession()), false, "localStorage não comprova acesso atual");
  await syncSessionContext("imob", async () => ({ ok: true, data: context }));
  assert.equal(isImobSurfaceAvailable(getSession()), true, "nenhum snapshot necessário");
  await syncSessionContext("imob", async () => ({ ok: true, data: { ...context,
    entitlements: { ...context.entitlements, IMOB_INSTALLED: false },
    productInstallations: [{ product: "IMOB", status: "inactive" }],
    verticals: context.verticals?.map((vertical) => ({ ...vertical, enabled: false })),
  } }));
  assert.equal(getSession().activeDomain, "imob");
  assert.deepEqual(getSession().installedProducts, ["IMOB"], "lista pode conter instalação inativa");
  assert.equal(isImobSurfaceAvailable(getSession()), false);
});

test("erro HTTP, resposta não-ok ou sem data não alteram a sessão nem limpam o gate", async () => {
  const before = getSession();
  for (const response of [{ ok: false, data: context }, { ok: true }]) {
    await assert.rejects(syncSessionContext("imob", async () => response));
    assert.equal(getSession(), before);
  }
  await assert.rejects(syncSessionContext("imob", async () => { throw new Error("synthetic failure"); }));
  assert.equal(getSession(), before);
});

test("resposta atrasada não reidrata outro workspace nem uma sessão encerrada", async () => {
  for (const patch of [{ workspaceId: "other-workspace" }, { token: undefined }]) {
    const pending = syncSessionContext("imob", async () => {
      updateSession(patch);
      return { ok: true, data: context };
    });
    const changed = getSession();
    await assert.rejects(pending, /sessão mudou/);
    assert.equal(getSession(), changed);
  }
});

function deferredContext() {
  let resolve!: (value: SessionContextResponse) => void;
  const promise = new Promise<SessionContextResponse>((done) => { resolve = done; });
  return { promise, resolve };
}

test("latest-request-wins: resposta antiga não restaura instalação/vertical revogada", async () => {
  const a = deferredContext();
  const b = deferredContext();
  const older = syncSessionContext("imob", () => a.promise);
  const rejectedOlder = assert.rejects(older, /superada/);
  const newer = syncSessionContext("imob", () => b.promise);
  b.resolve({ ok: true, data: { ...context, entitlements: { ...context.entitlements, IMOB_INSTALLED: false },
    verticals: context.verticals?.map((v) => ({ ...v, enabled: false })) } });
  await newer;
  const latest = getSession();
  a.resolve({ ok: true, data: context });
  await rejectedOlder;
  assert.equal(getSession(), latest);
  assert.equal(isImobSurfaceAvailable(getSession()), false);
});

test("core e imob disputam a mesma projeção: a solicitação mais recente vence", async () => {
  const a = deferredContext();
  const older = syncSessionContext("imob", () => a.promise);
  const rejectedOlder = assert.rejects(older, /superada/);
  await syncSessionContext("core", async () => ({ ok: true, data: { ...context, activeDomain: "core" } }));
  a.resolve({ ok: true, data: context });
  await rejectedOlder;
  assert.equal(getSession().activeDomain, "core");
});

test("falha da solicitação mais recente não permite aplicar resposta anterior", async () => {
  const before = getSession();
  const a = deferredContext();
  const older = syncSessionContext("imob", () => a.promise);
  const rejectedOlder = assert.rejects(older, /superada/);
  await assert.rejects(syncSessionContext("imob", async () => { throw new Error("latest failed"); }), /latest failed/);
  a.resolve({ ok: true, data: context });
  await rejectedOlder;
  assert.equal(getSession(), before);
});

test("sincronizações de workspaces distintos não aplicam contexto no workspace atual errado", async () => {
  const a = deferredContext();
  const older = syncSessionContext("imob", () => a.promise);
  const rejectedOlder = assert.rejects(older, /sessão mudou/);
  updateSession({ workspaceId: "workspace-other" });
  await syncSessionContext("imob", async () => ({ ok: true, data: { ...context, workspaceId: "workspace-other" } }));
  const latest = getSession();
  a.resolve({ ok: true, data: context });
  await rejectedOlder;
  assert.equal(getSession(), latest);
});

test("bootstrap usa a mesma geração e escopos independentes não invalidam sua leitura", async () => {
  const original = getSession();
  const bootstrap = sessionContextSync.beginSessionContextRequest();
  updateSession({ workspaceId: "workspace-other" });
  const other = sessionContextSync.beginSessionContextRequest();
  assert.equal(bootstrap.isCurrent(), false);
  updateSession(original);
  assert.equal(bootstrap.isCurrent(), true, "outro escopo não supersede a geração deste workspace");
  bootstrap.finish();
  other.finish();
});

test("bootstrap atrasado não pode sobrescrever sincronização mais recente", async () => {
  const bootstrap = sessionContextSync.beginSessionContextRequest();
  await syncSessionContext("imob", async () => ({ ok: true, data: context }));
  assert.equal(bootstrap.isCurrent(), false);
  bootstrap.finish();
});


test("callback canônico de RequireAuth descarta bootstrap atrasado após sync mais recente", async () => {
  const source = ts.createSourceFile("App.tsx", readFileSync(new URL("../App.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const requireAuth = source.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === "RequireAuth");
  assert.ok(requireAuth);
  let effect: ts.Expression | undefined;
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && node.expression.getText(source) === "React.useEffect") effect = node.arguments[0];
    ts.forEachChild(node, visit);
  }
  visit(requireAuth); assert.ok(effect);
  let complete!: (value: { context: SessionContextResponse; access: { status: "error" } }) => void;
  let applied!: Promise<unknown>;
  const environment = {
    session: getSession(), location: { pathname: "/app/chat", search: "" }, updateSession,
    beginSessionContextRequest: sessionContextSync.beginSessionContextRequest,
    loadPreDuimpSessionContext: () => { applied = new Promise((resolve) => { complete = resolve; }); return applied; },
  };
  const cleanup = new Function("environment", `with (environment) { ${ts.transpileModule(`return (${effect.getText(source)});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText} }`)(environment)();
  await syncSessionContext("core", async () => ({ ok: true, data: { ...context, activeDomain: "core", entitlements: { ...context.entitlements, IMOB_INSTALLED: false } } }));
  const latest = getSession();
  complete({ context: { ok: true, data: context }, access: { status: "error" } });
  await applied;
  await Promise.resolve();
  assert.equal(getSession(), latest);
  assert.equal(isImobSurfaceAvailable(getSession()), false);
  cleanup();
});
