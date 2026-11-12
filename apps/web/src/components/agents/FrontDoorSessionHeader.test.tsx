import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import FrontDoorSessionHeader from "./FrontDoorSessionHeader";
import FrontDoorSidebar from "./FrontDoorSidebar";
import FrontDoorConversationSequence from "./FrontDoorConversationSequence";
import { appendedAssistantReplyId, replyScrollTop } from "./conversationScroll";
import FrontDoorWaitingIndicator, { FRONT_DOOR_WAITING_LABEL } from "./FrontDoorWaitingIndicator";
import { createPendingWorkTracker } from "@/lib/frontDoorPendingWork";
import { ContextualCostPanel } from "@/components/billing/ContextualCostPanel";
import { isImobSurfaceAvailable } from "@/lib/entitlements";
import { getSession, updateSession, type AppSessionState } from "@/state/sessionStore";
import { ImobActionMenuBar } from "@/features/imob/ImobActionMenuBar";
import { IMOB_ACTION_MENUS } from "@/features/imob/imobActionMenus";
import { createLauncherPresentationSnapshot, resolveLauncherNavigationDecision } from "./chatLauncherEngine";
import { attachVerticalHandoffToSnapshot, enrichLauncherDecisionWithVerticalHandoff } from "./verticalHandoffEngine";
import { attachPreDuimpCardToSnapshot } from "./preDuimpConversationEngine";

// Renderiza o bloco real do launcher isoladamente, sem inicializar hooks/rede.
const launcherSource = ts.createSourceFile(
  "ChatAgentLauncher.tsx",
  readFileSync(new URL("./ChatAgentLauncher.tsx", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
let sessionHeader: ts.JsxElement | undefined;
function findSessionHeader(node: ts.Node) {
  if (ts.isJsxElement(node) && node.openingElement.tagName.getText(launcherSource) === "FrontDoorSessionHeader") {
    assert.equal(sessionHeader, undefined, "cabeçalho único");
    sessionHeader = node;
  }
  ts.forEachChild(node, findSessionHeader);
}
findSessionHeader(launcherSource);
assert.ok(sessionHeader, "cabeçalho real da conversa encontrado");
const renderSessionHeader = new Function(
  "React", "FrontDoorSessionHeader", "ContextualCostPanel", "session", "headerControls", "workspaceBillingContext",
  "copyToast", "runId", "activeRunFinance", "estimatedRunCostCents", "onPlaybookClick",
  ts.transpileModule(`return (${sessionHeader.getText(launcherSource)});`, {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText,
);

let sidebar: ts.JsxElement | undefined;
function findSidebar(node: ts.Node) {
  if (ts.isJsxElement(node) && node.openingElement.tagName.getText(launcherSource) === "FrontDoorSidebar") {
    assert.equal(sidebar, undefined, "painel lateral único");
    sidebar = node;
  }
  ts.forEachChild(node, findSidebar);
}
findSidebar(launcherSource);
assert.ok(sidebar);
const renderSidebar = new Function(
  "React", "FrontDoorSidebar", "ContextualCostPanel", "headerControls", "workspaceBillingContext",
  "copyToast", "runId", "activeRunFinance", "estimatedRunCostCents", "onPlaybookClick", "showImobSurface", "handleNewConversation", "FrontDoorConversationSequence", "messages", "FrontDoorSessionHeader", "session",
  ts.transpileModule(`return (${sidebar.getText(launcherSource)});`, {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText,
);

for (const [activeDomain, expectedLabel] of [["imob", "IMOB"], ["logistica", "Logística &amp; Comex"], ["core", "EIAH"], [undefined, "EIAH"]] as const) {
  for (const selectedAgent of ["EIAH", "Especialista", undefined]) {
    test(`título único segue ${activeDomain ?? "domínio inicial"}, com agente ${selectedAgent ?? "ausente"}`, () => {
      const html = renderToStaticMarkup(renderSessionHeader(
        React, FrontDoorSessionHeader, ContextualCostPanel, { activeDomain },
        <span>{selectedAgent ?? "Selecione um agente"}</span>,
        { monthUsageCents: 12345, workspaceRuns: 7, quotaPercent: 37, softLimitCents: 20000, hardLimitCents: 40000 },
        null, null, null, null, undefined,
      ));
      assert.equal((html.match(/Chat ativo · /g) ?? []).length, 1);
      assert.ok(html.includes(`Chat ativo · ${expectedLabel}`));
      const sidebarHtml = renderToStaticMarkup(renderSidebar(
        React, FrontDoorSidebar, ContextualCostPanel,
        <span>{selectedAgent ?? "Selecione um agente"}</span>,
        { monthUsageCents: 12345, workspaceRuns: 7, quotaPercent: 37, softLimitCents: 20000, hardLimitCents: 40000 },
        null, null, null, null, undefined, false, () => undefined, FrontDoorConversationSequence, [], FrontDoorSessionHeader, { activeDomain },
      ));
      assert.ok(sidebarHtml.includes(`Chat ativo · ${expectedLabel}`));
      assert.ok(sidebarHtml.includes(selectedAgent ?? "Selecione um agente"));
      assert.match(sidebarHtml, /Workspace no mês: R\$.*123,45/);
      assert.match(sidebarHtml, /Quota: 37%/);
      assert.doesNotMatch(html, /Workspace no mês|Quota:|Selecione um agente/);
      assert.doesNotMatch(html, /Launcher|Vertical ativa|Conversa ativa/);
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
    assert.ok(html.includes(`Chat ativo · ${label}`));
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
    // Mesmo estado compartilhado do launcher: a avaliação de entrada (inclui o handoff) é espera real da conversa.
    const tracker = createPendingWorkTracker(() => String(conversationGenerationRef.current));
    const dependencies = {
      window: { setTimeout: (callback: () => void) => { timer = callback; return 1; }, clearTimeout: () => undefined },
      pendingWork: { tracker },
      conversationGenerationRef, navigationRequestGenerationRef, getSession,
      launcherContext: { domainHint: "imob" }, isUnifiedEiahMode: true,
      imobFrontDoor: { getConversationState: () => null, consumeOperationalTurn: async () => undefined },
      resolveLauncherNavigationDecision,
      enrichLauncherDecisionWithVerticalHandoff: (decision: any, refs: any, _request: any, _sync: any, current: () => boolean) =>
        enrichLauncherDecisionWithVerticalHandoff(decision, refs, () => new Promise((resolve) => { finish = resolve; }),
          async () => { syncs += 1; }, current),
      selectedCatalogAgent: null, createLauncherPresentationSnapshot, attachVerticalHandoffToSnapshot, attachPreDuimpCardToSnapshot,
      proposalMode: false, attachmentIntake: { enabled: false }, pushMessage: (message: any) => messages.push(message),
    };
    const effect = new Function(...Object.keys(dependencies), transpileReturn(navigationEffect!))(...Object.values(dependencies));
    const cleanup = effect();
    timer!();
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(finish);
    if (change !== "conversation") assert.equal(tracker.pendingCount(), 1, "a avaliação inicial do handoff é espera pendente");
    if (change === "conversation") conversationGenerationRef.current += 1;
    if (change === "user") updateSession({ userId: "user-other" });
    if (change === "workspace") updateSession({ workspaceId: "workspace-other" });
    if (change === "agent") cleanup();
    if (change === "new_turn") navigationRequestGenerationRef.current += 1;
    finish!({ ok: true, handoff: { version: "chat.vertical_handoff.v2", handoffId: "navigation-test",
      vertical: { id: "imob", label: "IMOB", registryVersion: "test" }, capability: { id: "knowledge.search", mode: "read_only" },
      outcome: "allowed", reasonCode: "VERTICAL_HANDOFF_ALLOWED", presentation: { source: "operational", variant: "chat_card" } } });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(tracker.pendingCount(), 0, "terminada (ou descartada) a avaliação, não resta espera");
    assert.equal(syncs, change === "none" ? 1 : 0);
    assert.equal(messages.length, change === "none" ? 1 : 0);
    assert.ok(messages.every((message) => message.role === "assistant"));
    cleanup();
  });
}
const resolveSurface = new Function("session", "isImobSurfaceAvailable", "messages", "activeAgentId", "imobAuthorityAllowed", transpileReturn(surfaceInitializer));
const renderSurface = new Function("React", "showImobSurface", "ImobActionMenuBar", "IMOB_ACTION_MENUS", "imobFrontDoor", transpileReturn(surfaceConditional));
const availableSession: AppSessionState = {
  tenantId: "tenant-test", workspaceId: "workspace-test", preDuimpAccess: { status: "idle" },
  activeDomain: "imob", availableDomains: ["core", "imob"], installedProducts: ["IMOB"],
  entitlements: { IMOB_INSTALLED: true }, accessGate: null,
  verticals: [{ verticalId: "IMOB", label: "IMOB", activeDomain: "imob", installedProduct: "IMOB", enabled: true,
    rolloutStage: "operationalized", frontDoorSurface: "imob_chat", operationalHubSurface: "imob_dashboard",
    governanceHubSurface: "marketplace", investigationSurfaces: ["runs"], contextSpecRef: "vertical-context-imob.md" }],
};
function surfaceHtml(session: AppSessionState, messages: unknown[] = [], activeAgentId?: string, imobAuthorityAllowed = true) {
  return renderToStaticMarkup(renderSurface(React, resolveSurface(session, isImobSurfaceAvailable, messages, activeAgentId, imobAuthorityAllowed),
    ImobActionMenuBar, IMOB_ACTION_MENUS, { structuredForms: { handleActionMenuSelect: () => undefined } }));
}

for (const agent of [undefined, "EIAH", "J_360"]) {
  test(`barra real aparece em conversa vazia IMOB, independente do agente ${agent ?? "não selecionado"}`, () => {
    const html = surfaceHtml(availableSession, [], agent);
    for (const label of ["Proprietários", "Imóveis", "Locações", "Negócios"]) assert.ok(html.includes(label));
    assert.equal(surfaceHtml({ ...availableSession, activeDomain: "core" }, [], agent), "");
  });
}

test("AUTHZ-IMOB-HANDOFF-001: sem a autoridade confirmada pelo Core (bloqueado ou ainda não verificado) a barra do IMOB não existe, mesmo com o IMOB disponível na sessão", () => {
  assert.equal(surfaceHtml(availableSession, [], undefined, false), "");
  assert.ok(surfaceHtml(availableSession, [], undefined, true).includes("Negócios"));
});

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
    session: before, updateSession, conversationGenerationRef: { current: 0 }, imobPersistence: { startNew: () => undefined }, threadKey: "thread-test", baseLedger: () => [],
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

test("resposta digitada respeita a pausa de rolagem enquanto o usuário lê acima", async () => {
  let initializer: ts.Expression | undefined;
  function findTyping(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(launcherSource) === "pushAssistantMessageWithTyping") initializer = node.initializer;
    ts.forEachChild(node, findTyping);
  }
  findTyping(launcherSource);
  assert.ok(initializer);
  const factory = new Function("useCallback", "setMessages", "scrollRef", "followConversationEnd", "requestAnimationFrame", "window",
    ts.transpileModule(`return (${initializer.getText(launcherSource)});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText);
  for (const pause of [false, true]) {
    const follow = { current: true };
    let updates = 0;
    let scrolls = 0;
    const typeReply = factory((fn: unknown) => fn, () => { if (++updates === 3 && pause) follow.current = false; },
      { current: { scrollHeight: 2000, scrollTo: () => { scrolls++; } } }, follow,
      (fn: () => void) => fn(), { setTimeout: (fn: () => void) => fn() });
    await typeReply({ idPrefix: "synthetic", content: "Resposta sintética longa para conferir a leitura anterior" });
    assert.ok(updates > 5);
    if (pause) assert.equal(scrolls, 1, "novos trechos não puxam o leitor ao fim");
    else assert.ok(scrolls > 5, "acompanha resposta quando o usuário permanece no fim");
  }
});

test("digitação do aviso: contexto que muda durante ou ao fim da digitação interrompe, remove só a mensagem parcial e devolve false", async () => {
  let initializer: ts.Expression | undefined;
  function findTyping(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(launcherSource) === "pushAssistantMessageWithTyping") initializer = node.initializer;
    ts.forEachChild(node, findTyping);
  }
  findTyping(launcherSource);
  assert.ok(initializer);
  const factory = new Function("useCallback", "setMessages", "scrollRef", "followConversationEnd", "requestAnimationFrame", "window",
    ts.transpileModule(`return (${initializer.getText(launcherSource)});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText);
  type Row = { id: string; content?: string; status?: string };
  const CONTENT = "um dois"; // três trechos: "um", " ", "dois"
  // `staleOnCall`: a partir de qual consulta de isCurrent o contexto passa a ser outro (1 = antes do 1º trecho; 4 = só na checagem final, depois do último await).
  for (const staleOnCall of [1, 2, 3, 4, Infinity]) {
    let messages: Row[] = [{ id: "synthetic-existing", content: "mensagem de outra origem", status: "done" }, { id: "assistant-other", content: "outra", status: "done" }];
    const setMessages = (update: Row[] | ((previous: Row[]) => Row[])) => { messages = typeof update === "function" ? update(messages) : update; };
    let calls = 0;
    const typeReply = factory((fn: unknown) => fn, setMessages, { current: null }, { current: false }, (fn: () => void) => fn(), { setTimeout: (fn: () => void) => fn() });
    const typed = await typeReply({ idPrefix: "synthetic", content: CONTENT, isCurrent: () => ++calls < staleOnCall });
    if (staleOnCall === Infinity) {
      assert.equal(typed, true);
      assert.equal(messages.length, 3);
      assert.equal(messages.at(-1)?.content, CONTENT);
      assert.equal(messages.at(-1)?.status, "done");
    } else {
      assert.equal(typed, false, `contexto mudou na consulta ${staleOnCall}`);
      assert.deepEqual(messages.map((message) => message.id), ["synthetic-existing", "assistant-other"], "só a mensagem parcial desta invocação é removida");
    }
    assert.deepEqual(messages.slice(0, 2).map((message) => message.content), ["mensagem de outra origem", "outra"], "as outras mensagens ficam intactas");
  }
  // Sem isCurrent o comportamento de antes é o mesmo (devolve true e conclui).
  let plain: Row[] = [];
  const plainType = factory((fn: unknown) => fn, (update: (previous: Row[]) => Row[]) => { plain = update(plain); }, { current: null }, { current: false }, (fn: () => void) => fn(), { setTimeout: (fn: () => void) => fn() });
  assert.equal(await plainType({ idPrefix: "synthetic", content: CONTENT }), true);
  assert.equal(plain.length, 1);
});

test("resposta do assistente anexada: qualquer vertical e formato, só uma mensagem nova ao fim com a lista anterior intacta", () => {
  const previous = ["u1", "a1"];
  const base = [{ id: "u1", role: "user" }, { id: "a1", role: "assistant" }];
  // Formatos e verticais distintos entram igualmente: card estruturado do IMOB, texto comum, aviso, mensagem de run, Logística.
  for (const reply of [
    { id: "a2", role: "assistant", status: "done", imobStructured: { text: "Imóveis arquivados" } },
    { id: "a2", role: "assistant", status: "done" },
    { id: "a2", role: "assistant", status: "done", presentationSnapshot: { verticalContext: "LOGISTICA" } },
    { id: "a2", role: "assistant" },
  ]) assert.equal(appendedAssistantReplyId(previous, [...base, reply]), "a2");
  // Mensagem do usuário não é resposta (o envio do usuário já tem o próprio acompanhamento).
  assert.equal(appendedAssistantReplyId(previous, [...base, { id: "u2", role: "user" }]), null);
  // Digitação progressiva (nasce vazia, em streaming): acompanha o fim por conta própria, sem rolagem concorrente.
  assert.equal(appendedAssistantReplyId(previous, [...base, { id: "a2", role: "assistant", status: "streaming" }]), null);
  // Hidratação (lista anterior vazia), nova conversa, troca de conversa (ids diferentes) e várias mensagens de uma vez não rolam sozinhas.
  assert.equal(appendedAssistantReplyId([], [{ id: "h1", role: "assistant", status: "done" }]), null);
  assert.equal(appendedAssistantReplyId([], [{ id: "h1", role: "assistant" }, { id: "a2", role: "assistant" }]), null);
  assert.equal(appendedAssistantReplyId(previous, [{ id: "x1", role: "user" }, { id: "x2", role: "assistant" }, { id: "a2", role: "assistant" }]), null);
  assert.equal(appendedAssistantReplyId(previous, [...base, { id: "a2", role: "assistant" }, { id: "a3", role: "assistant" }]), null);
  assert.equal(appendedAssistantReplyId(["u1"], []), null);
  // Atualização de mensagens existentes (run, formulário, fim da digitação) mantém a quantidade e também não rola.
  assert.equal(appendedAssistantReplyId(["u1", "a1", "a2"], [...base, { id: "a2", role: "assistant", status: "done" }]), null);
});

test("destino da rolagem: fim se cabe; início se é mais alta; nada se a conversa acabou de hidratar (fim a mais de uma tela)", () => {
  // Leitor no fim antes da resposta: distância até o fim (já sem a resposta) = scrollHeight - scrollTop - altura - resposta ≈ 16.
  const atEnd = (reply: number) => ({ height: 400, scrollTop: 1800, scrollHeight: 1800 + 400 + 16 + reply });
  assert.equal(replyScrollTop({ top: 416, height: 200 }, atEnd(200)), 2416, "cabe: vai ao fim");
  assert.equal(replyScrollTop({ top: 416, height: 400 }, atEnd(400)), 2616, "exatamente do tamanho da área: fim");
  assert.equal(replyScrollTop({ top: 416, height: 1500 }, atEnd(1500)), 2216, "mais alta: alinha o início (scrollTop + top)");
  assert.equal(replyScrollTop({ top: -50, height: 1500 }, { ...atEnd(1500), scrollTop: 20 }), null, "fim a mais de uma tela: não mexe");
  assert.equal(replyScrollTop({ top: 2000, height: 200 }, { height: 400, scrollTop: 0, scrollHeight: 2600 }), null, "histórico recém-hidratado no topo: não mexe");
  // Bloco que cresce depois da última rolagem (ex.: card do handoff ao fim da digitação) não pode impedir o acompanhamento.
  assert.equal(replyScrollTop({ top: 500, height: 200 }, { height: 400, scrollTop: 1000, scrollHeight: 2000 }), 2000, "exatamente uma tela do fim: acompanha");
  assert.equal(replyScrollTop({ top: 500, height: 200 }, { height: 400, scrollTop: 1000, scrollHeight: 2001 }), null, "1 px além de uma tela: não mexe");
  assert.equal(replyScrollTop({ top: -5, height: 1500 }, { height: 400, scrollTop: 0, scrollHeight: 1900 }), 0, "início nunca negativo");
});

test("launcher só acompanha a resposta anexada quando o leitor está no fim, para qualquer vertical (rolagem manual preservada)", () => {
  const source = readFileSync(new URL("./ChatAgentLauncher.tsx", import.meta.url), "utf8");
  const start = source.indexOf("appendedAssistantReplyId(previousMessageIds.current, messages)");
  assert.ok(start > 0, "efeito de rolagem da resposta anexada presente");
  const effect = source.slice(start, source.indexOf("}, [messages]);", start));
  assert.match(effect, /readerLeftEnd\.current\) return;/, "leitor que subiu por gesto não é puxado");
  assert.match(effect, /replyScrollTop\(/);
  assert.match(effect, /destination !== null/, "sem destino, nada rola");
  assert.doesNotMatch(effect, /imobStructured|vertical/i, "regra genérica: nada específico de vertical");
  // A intenção do leitor só nasce de gesto deliberado (roda para cima, toque, teclas de subida) e é limpa ao voltar ao fim ou ao enviar.
  assert.equal((source.match(/readerLeftEnd\.current = true/g) ?? []).length, 3, "roda, toque e teclas");
  assert.match(source, /if \(followConversationEnd\.current\) readerLeftEnd\.current = false;/, "voltar ao fim retoma");
  assert.match(source, /message\.role === "user"\) \{ followConversationEnd\.current = true; readerLeftEnd\.current = false; \}/, "enviar retoma");
  // Os pontos de rolagem existentes (envio do usuário e digitação) continuam como estavam.
  assert.equal((source.match(/followConversationEnd\.current = true/g) ?? []).length, 1);
});

test("indicador de espera: texto exato, um único role=status e nada na marcação que mude a cada pulsação", () => {
  const html = renderToStaticMarkup(React.createElement(FrontDoorWaitingIndicator));
  assert.equal(FRONT_DOOR_WAITING_LABEL, "Buscando informação...");
  assert.equal((html.match(/role="status"/g) ?? []).length, 1, "um só elemento de status");
  assert.equal((html.match(/Buscando informação\.\.\./g) ?? []).length, 1, "o texto aparece uma vez");
  assert.match(html, /<span class="front-door-waiting-label">Buscando informação\.\.\.<\/span>/, "só o rótulo pulsa (opacidade via CSS); o texto é estático");
  assert.doesNotMatch(html, /aria-live|aria-busy/, "sem região que reanuncie a cada atualização");
});
