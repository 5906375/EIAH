import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import FrontDoorSessionHeader from "./FrontDoorSessionHeader";
import { conversationDomainLabel } from "./conversationDomainLabel";
import { isImobSurfaceAvailable } from "@/lib/entitlements";
import { getSession, updateSession, type AppSessionState } from "@/state/sessionStore";
import { ImobActionMenuBar } from "@/features/imob/ImobActionMenuBar";
import { IMOB_ACTION_MENUS } from "@/features/imob/imobActionMenus";
import { createLauncherPresentationSnapshot, resolveLauncherNavigationDecision } from "./chatLauncherEngine";
import { attachVerticalHandoffToSnapshot, enrichLauncherDecisionWithVerticalHandoff } from "./verticalHandoffEngine";

// Renderiza o bloco real do launcher isoladamente, sem inicializar hooks/rede.
const launcherSource = ts.createSourceFile(
  "ChatAgentLauncher.tsx",
  readFileSync(new URL("./ChatAgentLauncher.tsx", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
let conversationLabel: ts.JsxElement | undefined;
function findConversationLabel(node: ts.Node) {
  if (ts.isJsxElement(node) && node.children.some((child) => ts.isJsxText(child) && child.text.includes("Conversa ativa"))) {
    assert.equal(conversationLabel, undefined, "identificação interna única");
    conversationLabel = node;
  }
  ts.forEachChild(node, findConversationLabel);
}
findConversationLabel(launcherSource);
assert.ok(conversationLabel, "bloco interno da conversa encontrado");
const renderInternalLabel = new Function(
  "React", "session", "activeAgentTitle", "conversationDomainLabel",
  ts.transpileModule(`return (${conversationLabel.getText(launcherSource)});`, {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText,
);

for (const activeDomain of ["imob", "core", undefined] as const) {
  for (const selectedAgent of ["EIAH", "Especialista", undefined]) {
    test(`ambos os rótulos seguem ${activeDomain ?? "domínio inicial"}, com agente ${selectedAgent ?? "ausente"}`, () => {
      const expectedLabel = activeDomain === "imob" ? "IMOB" : "EIAH";
      const external = renderToStaticMarkup(
        <FrontDoorSessionHeader activeDomain={activeDomain}>
          <span>{selectedAgent ?? "Selecione um agente"}</span>
        </FrontDoorSessionHeader>,
      );
      const internal = renderToStaticMarkup(renderInternalLabel(React, { activeDomain }, selectedAgent, conversationDomainLabel));
      assert.ok(external.includes(`Conversa ativa · ${expectedLabel}`));
      assert.ok(internal.includes(`Conversa ativa · ${expectedLabel}`));
      assert.ok(external.includes(`>${expectedLabel}</p>`));
    });
  }
}

for (const [activeDomain, label] of [["imob", "IMOB"], ["core", "EIAH"], [undefined, "EIAH"]] as const) {
  test(`cabeçalho projeta ${activeDomain ?? "core inicial"} e preserva o controle de agente`, () => {
    const html = renderToStaticMarkup(
      <FrontDoorSessionHeader activeDomain={activeDomain}>
        <label>Agente<select aria-label="Agente"><option>EIAH</option><option>Especialista</option></select></label>
      </FrontDoorSessionHeader>,
    );
    assert.match(html, /Vertical ativa/);
    assert.ok(html.includes(`>${label}</p>`));
    assert.ok(html.includes(`Conversa ativa · ${label}`));
    assert.match(html, /Especialista/);
    assert.equal((html.match(/<select/g) ?? []).length, 1, "não inventa seletor de vertical");
  });
}

// Executa a derivação e o JSX reais, sem montar o launcher com rede/SSE.
let surfaceInitializer: ts.Expression | undefined;
let surfaceConditional: ts.ConditionalExpression | undefined;
let newConversationInitializer: ts.Expression | undefined;
function findSurface(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(launcherSource) === "showImobSurface") surfaceInitializer = node.initializer;
  if (ts.isVariableDeclaration(node) && node.name.getText(launcherSource) === "handleNewConversation") newConversationInitializer = node.initializer;
  if (ts.isConditionalExpression(node) && node.condition.getText(launcherSource) === "showImobSurface") surfaceConditional = node;
  ts.forEachChild(node, findSurface);
}
findSurface(launcherSource);
assert.ok(surfaceInitializer);
assert.ok(surfaceConditional);
assert.ok(newConversationInitializer);
const transpileReturn = (expression: ts.Expression) => ts.transpileModule(`return (${expression.getText(launcherSource)});`, {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;

let navigationEffect: ts.Expression | undefined;
function findNavigationEffect(node: ts.Node) {
  if (ts.isCallExpression(node) && node.expression.getText(launcherSource) === "useEffect"
      && node.arguments[0]?.getText(launcherSource).includes("resolveLauncherNavigationDecision")) navigationEffect = node.arguments[0];
  ts.forEachChild(node, findNavigationEffect);
}
findNavigationEffect(launcherSource);
assert.ok(navigationEffect, "transport de navegação executa o engine, sem enviar turno fictício");

for (const change of ["none", "conversation", "user", "workspace", "agent", "new_turn"] as const) {
  test(`entrada Marketplace renderiza somente resposta atual: ${change}`, async () => {
    updateSession({ token: "synthetic-navigation", tenantId: "tenant-test", workspaceId: "workspace-test", userId: "user-test", activeDomain: "core" });
    const conversationGenerationRef = { current: 0 };
    const navigationRequestGenerationRef = { current: 0 };
    const messages: Array<{ role: string; content: string }> = [];
    let timer: (() => void) | undefined;
    let finish: ((value: any) => void) | undefined;
    let syncs = 0;
    const dependencies = {
      window: { setTimeout: (callback: () => void) => { timer = callback; return 1; }, clearTimeout: () => undefined },
      conversationGenerationRef, navigationRequestGenerationRef, getSession,
      launcherContext: { domainHint: "imob" }, isUnifiedEiahMode: true,
      imobFrontDoor: { getConversationState: () => null, consumeOperationalTurn: async () => undefined },
      resolveLauncherNavigationDecision,
      enrichLauncherDecisionWithVerticalHandoff: (decision: any, refs: any, _request: any, _sync: any, current: () => boolean) =>
        enrichLauncherDecisionWithVerticalHandoff(decision, refs, () => new Promise((resolve) => { finish = resolve; }),
          async () => { syncs += 1; }, current),
      selectedCatalogAgent: null, createLauncherPresentationSnapshot, attachVerticalHandoffToSnapshot,
      proposalMode: false, attachmentIntake: { enabled: false }, pushMessage: (message: any) => messages.push(message),
    };
    const effect = new Function(...Object.keys(dependencies), transpileReturn(navigationEffect!))(...Object.values(dependencies));
    const cleanup = effect();
    timer!();
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(finish);
    if (change === "conversation") conversationGenerationRef.current += 1;
    if (change === "user") updateSession({ userId: "user-other" });
    if (change === "workspace") updateSession({ workspaceId: "workspace-other" });
    if (change === "agent") cleanup();
    if (change === "new_turn") navigationRequestGenerationRef.current += 1;
    finish!({ ok: true, handoff: { version: "chat.vertical_handoff.v2", handoffId: "navigation-test",
      vertical: { id: "imob", label: "IMOB", registryVersion: "test" }, capability: { id: "knowledge.search", mode: "read_only" },
      outcome: "allowed", reasonCode: "VERTICAL_HANDOFF_ALLOWED", presentation: { source: "operational", variant: "chat_card" } } });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(syncs, change === "none" ? 1 : 0);
    assert.equal(messages.length, change === "none" ? 1 : 0);
    assert.ok(messages.every((message) => message.role === "assistant"));
    cleanup();
  });
}
const resolveSurface = new Function("session", "isImobSurfaceAvailable", "messages", "activeAgentId", transpileReturn(surfaceInitializer));
const renderSurface = new Function("React", "showImobSurface", "ImobActionMenuBar", "IMOB_ACTION_MENUS", "imobFrontDoor", transpileReturn(surfaceConditional));
const availableSession: AppSessionState = {
  tenantId: "tenant-test", workspaceId: "workspace-test", preDuimpAccess: { status: "idle" },
  activeDomain: "imob", availableDomains: ["core", "imob"], installedProducts: ["IMOB"],
  entitlements: { IMOB_INSTALLED: true }, accessGate: null,
  verticals: [{ verticalId: "IMOB", label: "IMOB", activeDomain: "imob", installedProduct: "IMOB", enabled: true,
    rolloutStage: "operationalized", frontDoorSurface: "imob_chat", operationalHubSurface: "imob_dashboard",
    governanceHubSurface: "marketplace", investigationSurfaces: ["runs"], contextSpecRef: "vertical-context-imob.md" }],
};
function surfaceHtml(session: AppSessionState, messages: unknown[] = [], activeAgentId?: string) {
  return renderToStaticMarkup(renderSurface(React, resolveSurface(session, isImobSurfaceAvailable, messages, activeAgentId),
    ImobActionMenuBar, IMOB_ACTION_MENUS, { structuredForms: { handleActionMenuSelect: () => undefined } }));
}

for (const agent of [undefined, "EIAH", "J_360"]) {
  test(`barra real aparece em conversa vazia IMOB, independente do agente ${agent ?? "não selecionado"}`, () => {
    const html = surfaceHtml(availableSession, [], agent);
    for (const label of ["Proprietários", "Imóveis", "Locações", "Negócios"]) assert.ok(html.includes(label));
    assert.equal(surfaceHtml({ ...availableSession, activeDomain: "core" }, [], agent), "");
  });
}

test("snapshot IMOB antigo não sobrepõe sessão core, desabilitação ou revogação", () => {
  const history = [{ presentationSnapshot: { verticalActivation: { status: "activated", verticalId: "imob" } } }];
  assert.equal(surfaceHtml({ ...availableSession, activeDomain: "core" }, history), "");
  assert.equal(surfaceHtml({ ...availableSession, entitlements: { IMOB_INSTALLED: false } }, history), "");
  assert.equal(surfaceHtml({ ...availableSession, verticals: availableSession.verticals!.map((vertical) => ({ ...vertical, enabled: false })) }, history), "");
  assert.equal(surfaceHtml({ ...availableSession, accessGate: { reasonCode: "IMOB_ENTITLEMENT_MISSING" } }, history), "");
});

test("handler real de Nova conversa limpa histórico e preserva domínio/superfície canônica sem fabricar snapshot", () => {
  updateSession(availableSession);
  const before = getSession();
  let messages: unknown[] = [{ presentationSnapshot: { verticalContext: "IMOB" } }];
  const removedKeys: string[] = [];
  const environment: Record<string, unknown> = {
    session: before, updateSession, conversationGenerationRef: { current: 0 }, threadKey: "thread-test", baseLedger: () => [],
    setMessages: (next: unknown[]) => { messages = next; },
    window: { sessionStorage: { removeItem: (key: string) => removedKeys.push(key) } },
  };
  for (const name of ["stopStreaming", "setRunId", "onRunIdChange", "setLedger", "onLedgerChange", "setEvidenceEvent", "setCopyToast", "setLastRouteIntent", "clearAttachmentComposer", "setAttachmentDocumentType", "setAttachmentAnalysisMode"]) environment[name] = () => undefined;
  for (const name of ["seenEventsRef", "lastEventIdRef", "runSummaryLoadedRef", "runPromptRef", "runIntentRef", "runPresentationRef", "runGuardrailRef"]) environment[name] = { current: null };
  new Function("environment", `with (environment) { ${transpileReturn(newConversationInitializer!)} }`)(environment)();
  assert.deepEqual(messages, []);
  assert.deepEqual(removedKeys, ["thread-test"]);
  assert.equal(getSession(), before);
  assert.equal(getSession().activeDomain, "imob");
  assert.ok(surfaceHtml(getSession(), messages).includes("Negócios"));
});
