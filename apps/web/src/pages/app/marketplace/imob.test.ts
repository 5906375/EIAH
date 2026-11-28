import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ApiError, apiErrorMessage } from "@/lib/api";

// Executa o callback canônico da página com APIs/setters controlados, sem browser ou staging.
const source = ts.createSourceFile("imob.tsx", readFileSync(new URL("./imob.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let activationCallback: ts.Expression | undefined;
let noticeProjection: ts.ConditionalExpression | undefined;
function visit(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === "handleActivate") activationCallback = node.initializer;
  if (ts.isConditionalExpression(node) && node.condition.getText(source) === "notice") noticeProjection = node;
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(activationCallback, "callback de ativação da página deve existir");
assert.ok(noticeProjection, "aviso da página deve existir");
const compiled = ts.transpileModule(`exports.execute = ${activationCallback.getText(source)};`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
}).outputText;
const compiledNotice = ts.transpileModule(`exports.render = () => (${noticeProjection.getText(source)});`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.React },
}).outputText;

function harness(failure?: "activation" | "sync") {
  const state = { isInstalled: false, activatedAt: null as string | null, error: null as string | null,
    notice: null as string | null, activating: false };
  const calls: string[] = [];
  const activatedAt = "2026-10-08T12:00:00.000Z";
  const dependencies = {
    ApiError, apiErrorMessage,
    setActivating: (value: boolean) => { state.activating = value; },
    setIsInstalled: (value: boolean) => { state.isInstalled = value; },
    setActivatedAt: (value: string | null) => { state.activatedAt = value; },
    setError: (value: string | null) => { state.error = value; },
    setNotice: (value: string | null) => { state.notice = value; },
    apiActivateMarketplaceInstallation: async (body: unknown) => {
      assert.deepEqual(body, { product: "IMOB" });
      calls.push("activate");
      if (failure === "activation") throw new ApiError(403, "Forbidden", { error: { message: "Ativação não permitida" } });
      return { installation: { activatedAt } };
    },
    syncSessionContext: async (domain: string) => {
      assert.equal(domain, "imob");
      calls.push("sync");
      if (failure === "sync") throw new Error("synthetic sync failure");
    },
    navigate: (path: string, options: unknown) => {
      assert.equal(path, "/app/chat");
      assert.deepEqual(options, { replace: true });
      calls.push("navigate");
    },
  };
  const exports = {} as { execute: () => Promise<void> };
  new Function(...Object.keys(dependencies), "exports", compiled)(...Object.values(dependencies), exports);
  const renderNotice = () => {
    const view = {} as { render: () => React.ReactElement };
    const Link = ({ to, children }: { to: string; children: React.ReactNode }) => React.createElement("a", { href: to }, children);
    new Function("React", "Link", "notice", "isInstalled", "accessBlocked", "exports", compiledNotice)(
      React, Link, state.notice, state.isInstalled, false, view,
    );
    return renderToStaticMarkup(view.render());
  };
  return { state, calls, activatedAt, execute: exports.execute, renderNotice };
}

test("sync falha após ativação: preserva instalação/data, exibe aviso e mantém a página para continuar a conversa", async () => {
  const h = harness("sync");
  await h.execute();
  assert.deepEqual(h.calls, ["activate", "sync"]);
  assert.equal(h.state.isInstalled, true);
  assert.equal(h.state.activatedAt, h.activatedAt);
  assert.equal(h.state.error, null);
  assert.equal(h.state.notice, "O IMOB foi ativado, mas não consegui atualizar o contexto local da sessão. Atualize a página para sincronizar a conversa.");
  assert.equal(h.state.activating, false);
  assert.match(h.renderNotice(), /href="\/app\/chat"/);
  assert.match(h.renderNotice(), /Continuar conversa/);
  assert.doesNotMatch(h.renderNotice(), /Falha ao ativar/);
});

test("falha real de ativação: exibe erro e não instala, sincroniza ou navega", async () => {
  const h = harness("activation");
  await h.execute();
  assert.deepEqual(h.calls, ["activate"]);
  assert.equal(h.state.isInstalled, false);
  assert.equal(h.state.activatedAt, null);
  assert.equal(h.state.notice, null);
  assert.equal(h.state.error, "Ativação não permitida");
  assert.equal(h.state.activating, false);
});

test("ativação e sync bem-sucedidos: preservam navegação automática para o Front Door", async () => {
  const h = harness();
  await h.execute();
  assert.deepEqual(h.calls, ["activate", "sync", "navigate"]);
  assert.equal(h.state.isInstalled, true);
  assert.equal(h.state.activatedAt, h.activatedAt);
  assert.equal(h.state.error, null);
  assert.equal(h.state.activating, false);
});

test("botões principais do Marketplace abrem Front Door com intenção IMOB, sem ativação", () => {
  for (const file of ["./index.tsx", "./imob.tsx"]) {
    const page = ts.createSourceFile(file, readFileSync(new URL(file, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let buttons = 0;
    const navigations: string[] = [];
    function inspect(node: ts.Node) {
      if (ts.isJsxElement(node) && node.openingElement.tagName.getText(page) === "button"
          && /Abrir chat|Abrir IMOB/.test(node.children.map((child) => child.getText(page)).join(" "))) {
        const attribute = node.openingElement.attributes.properties.find((item) => ts.isJsxAttribute(item) && item.name.getText(page) === "onClick") as ts.JsxAttribute;
        assert.ok(attribute && ts.isJsxExpression(attribute.initializer!) && attribute.initializer.expression);
        const code = ts.transpileModule(`return (${attribute.initializer.expression!.getText(page)});`, {
          compilerOptions: { target: ts.ScriptTarget.ES2022 },
        }).outputText;
        const click = new Function("navigate", code)((path: string) => navigations.push(path));
        click(); buttons += 1;
      }
      ts.forEachChild(node, inspect);
    }
    inspect(page);
    assert.equal(buttons, 1, file);
    assert.deepEqual(navigations, ["/app/chat?vertical=imob"], file);
    const target = new URL(navigations[0], "https://synthetic.invalid");
    assert.equal(target.searchParams.get("domain"), null, "a intenção não ativa o bootstrap legado de domínio");
    assert.equal(target.searchParams.get("vertical"), "imob");
  }
});

test("Front Door transporta a intenção de vertical e mantém domain legado compatível", () => {
  const page = ts.createSourceFile("agents/index.tsx", readFileSync(new URL("../agents/index.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let initializer: ts.Expression | undefined;
  function find(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(page) === "launcherDomainHint") initializer = node.initializer;
    ts.forEachChild(node, find);
  }
  find(page);
  assert.ok(initializer);
  const code = ts.transpileModule(`return (${initializer.getText(page)});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const read = (search: string) => new Function("useMemo", "location", code)((factory: () => unknown) => factory(), { search });
  assert.equal(read("?vertical=imob"), "imob");
  assert.equal(read("?domain=imob"), "imob");
  assert.equal(read("?vertical=imob&domain=core"), "imob");
  assert.equal(read(""), null);
});

test("links com autoprompt permanecem auxiliares; dashboard e rotas especializadas são preservados", () => {
  const page = readFileSync(new URL("./imob.tsx", import.meta.url), "utf8");
  assert.ok(page.includes('/app/imob/chat?domain=imob&autoprompt=${encodeURIComponent(item.autoprompt)}'));
  for (const path of ["/app/imob/properties", "/app/imob/processes", "/app/imob/partners"]) assert.ok(page.includes(path));
  assert.ok(readFileSync(new URL("./index.tsx", import.meta.url), "utf8").includes('navigate("/app/imob/dashboard?section=processos&cc=open#command-center")'));
});
