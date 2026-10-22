import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Link, MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import ts from "typescript";

import { EiahBrandMark } from "@/components/brand/EiahBrandMark";
import { isImobInstalled } from "@/lib/entitlements";
import { isPreDuimpAccessAllowed } from "@/features/logistica/preDuimp";

// Exercise the real shell and route declarations without importing every operational page.
const shellSource = ts.createSourceFile("App.tsx",
  readFileSync(new URL("../../../App.tsx", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const shellFunctions = new Set(["NavigationLink", "getPreDuimpNavigationItems", "Layout", "RequireAuth", "RequireImobInstall"]);
const shellDeclarations = shellSource.statements.filter((node) =>
  (ts.isFunctionDeclaration(node) && node.name && shellFunctions.has(node.name.text))
  || (ts.isVariableStatement(node) && node.declarationList.declarations.some((declaration) =>
    declaration.name.getText(shellSource) === "SHELL_NAV_ITEMS")));
assert.equal(shellDeclarations.length, shellFunctions.size + 1);

function shellHarness(session: Record<string, unknown>, preDuimpEnabled = false) {
  const compiled = ts.transpileModule(shellDeclarations.map((node) => node.getText(shellSource))
    .join("\n").replace(/^export /gm, ""), {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return new Function("React", "Link", "Navigate", "useLocation", "useSession", "isImobInstalled",
    "isPreDuimpAccessAllowed", "EiahBrandMark", "PRE_DUIMP_FRONTEND_ENABLED",
    `${compiled}\nreturn { Layout, RequireAuth, RequireImobInstall };`)(
      React, Link, ({ to }: { to: string }) => <span data-redirect={to} />, useLocation, () => session,
      isImobInstalled, isPreDuimpAccessAllowed, EiahBrandMark, preDuimpEnabled);
}

const shellSession = {
  token: "synthetic-navigation-test", tenantId: "tenant-test", workspaceId: "workspace-test",
  activeDomain: "imob", installedProducts: ["IMOB"], entitlements: { IMOB_INSTALLED: true },
  preDuimpAccess: { status: "ready", capability: {
    version: "v1", allowed: true, mode: "shadow", externalTransmissionAllowed: false, reasonCode: null,
  } },
};

function renderShell(session: Record<string, unknown>, enabled = false) {
  const { Layout } = shellHarness(session, enabled);
  return renderToStaticMarkup(<MemoryRouter initialEntries={["/app/chat"]}>
    <Layout><span>Conversation surface</span></Layout>
  </MemoryRouter>);
}

function navigationLinks(html: string) {
  const nav = html.match(/<nav\b[^>]*>([\s\S]*?)<\/nav>/)?.[1];
  assert.ok(nav, "the real shell renders its navigation landmark");
  return [...nav.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>/g)].map((match) => match[1]);
}

test("global menu has one canonical chat across roles, installations and PRE_DUIMP flag", () => {
  for (const roleProfile of ["workspace_member", "workspace_admin", "tenant_admin", "founder_global", "service_operator"]) {
    for (const installed of [false, true]) {
      for (const enabled of [false, true]) {
        const html = renderShell({ ...shellSession,
          installedProducts: installed ? ["IMOB"] : [], entitlements: { IMOB_INSTALLED: installed },
          experience: { roleProfile,
            primaryNavigation: [{ surfaceId: "imob_chat", path: "/app/imob/chat", label: "IMOB" }] },
        }, enabled);
        const expected = ["/app/runs", "/app/chat",
          ...(roleProfile === "workspace_member" ? [] : ["/app/billing"]), "/app/marketplace", "/app/chat?domain=imob", "/app/chat?domain=logistica", // FD-SINGLE-ENTRY-001: IMOB também abre o Front Door; FD-UNIFICATION-001: o menu de Logística leva ao Front Door; o cockpit /app/logistica segue acessível, mas fora do menu
          ...(enabled ? ["/app/chat?entry=pre_duimp"] : []), "/self-service", "/profile"];
        assert.deepEqual(navigationLinks(html), expected);
        assert.equal((html.match(/aria-label="Chat"/g) ?? []).length, 1);
        assert.equal((html.match(/aria-label="IMOB"/g) ?? []).length, 1, "o IMOB tem um só item, que abre o Front Door");
        assert.doesNotMatch(html, /href="\/app\/imob/, "a navegação do servidor não restaura entrada para a página IMOB independente");
        assert.match(html, /aria-current="page" aria-label="Chat"/);
      }
    }
  }
});

test("legacy IMOB installation hints cannot restore the competing navigation entry", () => {
  for (const hints of [
    { installedProducts: ["IMOB"], entitlements: { IMOB_INSTALLED: false } },
    { installedProducts: [], entitlements: { IMOB_INSTALLED: true, REAL_ESTATE_CORE: true } },
    { activeDomain: "core", installedProducts: ["IMOB"], entitlements: { REAL_ESTATE_CORE: true } },
  ]) {
    assert.ok(!navigationLinks(renderShell({ ...shellSession, ...hints })).includes("/app/imob/chat"));
  }
});

test("shell retains accessible links and its shared desktop/mobile scroll navigation", () => {
  const html = renderShell(shellSession);
  assert.match(html, /<nav class="[^"]*overflow-x-auto[^"]*sm:max-w-none/);
  for (const label of ["Runs", "Chat", "Marketplace", "Self-service", "Perfil"]) {
    assert.match(html, new RegExp(`aria-label="${label}"`));
  }
  assert.doesNotMatch(html, /<nav[^>]*aria-hidden="true"/);
});

function renderDeclaredRoute(path: "/app/chat" | "/app/imob/chat", session: Record<string, unknown>) {
  let route: ts.JsxSelfClosingElement | undefined;
  function visit(node: ts.Node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(shellSource) === "Route"
      && node.attributes.properties.some((attr) => ts.isJsxAttribute(attr) && attr.name.getText(shellSource) === "path"
        && attr.initializer && ts.isStringLiteral(attr.initializer) && attr.initializer.text === path)) route = node;
    ts.forEachChild(node, visit);
  }
  visit(shellSource);
  assert.ok(route, `existing route ${path} remains declared`);
  const { Layout, RequireAuth, RequireImobInstall } = shellHarness(session);
  const jsx = ts.transpileModule(`return (${route.getText(shellSource)});`, {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const routeElement = new Function("React", "Route", "Layout", "RequireAuth", "RequireImobInstall", "AgentsPage", "ImobChatPage", jsx)(
    React, Route, Layout, RequireAuth, RequireImobInstall,
    () => <span>Canonical chat</span>, () => <span>Auxiliary IMOB chat</span>);
  return renderToStaticMarkup(<MemoryRouter initialEntries={[path]}><Routes>{routeElement}</Routes></MemoryRouter>);
}

test("canonical and auxiliary chat routes retain their pages without automatic redirection", () => {
  assert.match(renderDeclaredRoute("/app/chat", shellSession), /Canonical chat/);
  const auxiliary = renderDeclaredRoute("/app/imob/chat", shellSession);
  assert.match(auxiliary, /Auxiliary IMOB chat/);
  assert.doesNotMatch(auxiliary, /data-redirect/);
});

test("auxiliary IMOB chat keeps authentication and installation guards", () => {
  const missingInstall = renderDeclaredRoute("/app/imob/chat", {
    ...shellSession, installedProducts: [], entitlements: { IMOB_INSTALLED: false },
  });
  assert.match(missingInstall, /data-redirect="\/app\/marketplace\/imob"/);
  assert.doesNotMatch(missingInstall, /Auxiliary IMOB chat/);
  const anonymous = renderDeclaredRoute("/app/imob/chat", { ...shellSession, token: undefined });
  assert.match(anonymous, /data-redirect="\/access\?next=/);
  assert.doesNotMatch(anonymous, /Auxiliary IMOB chat/);
});

test("official EIAH symbol preserves proportions and accessible naming", () => {
  const isolated = renderToStaticMarkup(<EiahBrandMark />);
  const accompanied = renderToStaticMarkup(<EiahBrandMark visibleName />);

  assert.match(isolated, /eiah-symbol\.svg/);
  assert.match(isolated, /alt="EIAH"/);
  assert.match(isolated, /object-contain/);
  assert.match(isolated, /width="40" height="40"/);
  assert.match(accompanied, /alt=""/);
  assert.match(accompanied, /aria-hidden="true"/);
});

test("global shell uses the official brand component and no longer imports the divergent PNG", () => {
  const appSource = readFileSync(new URL("../../../App.tsx", import.meta.url), "utf8");

  assert.match(appSource, /<EiahBrandMark/);
  assert.match(appSource, /visibleName/);
  assert.doesNotMatch(appSource, /Eiah_logo\.png/);
});

test("PRE_DUIMP shell gate is server-authoritative and never hydrates capability from localStorage", () => {
  const appSource = readFileSync(new URL("../../../App.tsx", import.meta.url), "utf8");
  const storeSource = readFileSync(new URL("../../../state/sessionStore.ts", import.meta.url), "utf8");

  assert.match(appSource, /isPreDuimpAccessAllowed/);
  assert.match(appSource, /preDuimpAllowed/);
  assert.match(appSource, /preDuimpAccess: \{ status: "loading" \}/);
  assert.match(appSource, /if \(!active\) return/);
  assert.match(appSource, /active = false/);
  assert.doesNotMatch(storeSource, /getItem\(["']pre.?duimp/i);
  assert.doesNotMatch(storeSource, /setItem\(["']pre.?duimp/i);
});

test("FD-LEGACY-CLOSURE-001: as rotas legadas de Logística/Pré-DUIMP só redirecionam; nenhuma página operacional é importada ou montada", () => {
  const appSource = readFileSync(new URL("../../../App.tsx", import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(appSource, /pages\/app\/logistica\/(?:cockpit|pre-duimp)/);
  assert.doesNotMatch(appSource, /RequirePreDuimpAccess|LogisticaCockpitPage|PreDuimpPage/);
  for (const [path, entry] of [["/app/logistica", "cockpit"], ["/app/logistica/pre-duimp", "pre_duimp"], ["/app/logistica/*", "cockpit"]] as const) {
    assert.match(appSource, new RegExp(`path="${path.replace(/[*/]/g, "\\$&")}"\\s+element=\\{<LegacyLogisticaRoute entry="${entry}" />\\}`), path);
  }
});
