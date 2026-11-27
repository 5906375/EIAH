import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ChatVerticalHandoffResult } from "@/lib/api";
import { ChatVerticalHandoffCard } from "@/components/chat/ChatVerticalHandoffCard";
import {
  activeVerticalInConversation,
  attachVerticalHandoffToSnapshot,
  canonicalVerticalId,
  describeVerticalHandoffResult,
  enrichLauncherDecisionWithVerticalHandoff,
  isImobActiveInConversation,
  requestVerticalHandoff,
  resolveExplicitVerticalHandoffRequest,
  resolveLogisticaEntryRequest,
  type VerticalHandoffRequest,
} from "./verticalHandoffEngine";
import { resolveLauncherNavigationDecision, resolveLauncherTurnDecision } from "./chatLauncherEngine";

// EIAH-FD-ADR010-M3: o handoff existente (vertical.registry.v1 / chat.vertical_handoff.v2) também serve à Logística & Comex,
// sem converter a conversa em IMOB e sem conceder nada: reconhecer ≠ instalar ≠ liberar ≠ autorizar.

const allowedLog = (): Extract<ChatVerticalHandoffResult, { ok: true }> => ({
  ok: true,
  handoff: {
    version: "chat.vertical_handoff.v2", handoffId: "h1", vertical: { id: "log", label: "Logística & Comex", registryVersion: "vr1-x" },
    capability: { id: "oraculo.context", mode: "read_only" }, presentation: { source: "operational", variant: "chat_card" }, outcome: "allowed", reasonCode: "VERTICAL_HANDOFF_ALLOWED",
  },
} as never);
const allowedImob = () => ({ ...allowedLog(), handoff: { ...allowedLog().handoff, vertical: { id: "imob", label: "IMOB", registryVersion: "vr1-x" }, capability: { id: "crm.forms", mode: "requires_write" } } }) as never as ChatVerticalHandoffResult;
const noImob = (text: string) => assert.equal(/imob/i.test(text), false, `não pode citar IMOB: ${text.slice(0, 140)}`);
const turnBase = { proposalMode: false, isUnifiedEiah: true, eiahMode: "help" as const, agentProfile: null, catalogAgents: [], intentUnknown: false, confidence: 0.9, routeIntent: "help" as const };
const turn = (input: string) => resolveLauncherTurnDecision({ ...turnBase, input, trimmedInput: input });

test("identidade canônica: o nome que o usuário usa vira `log`; os demais nomes ficam como estão", () => {
  assert.equal(canonicalVerticalId("logistica"), "log");
  assert.equal(canonicalVerticalId("log"), "log");
  assert.equal(canonicalVerticalId("imob"), "imob");
  assert.equal(canonicalVerticalId("legal"), "legal");
  assert.deepEqual(resolveExplicitVerticalHandoffRequest("mudar para logística"), { verticalId: "log", mode: "read_only" });
  assert.deepEqual(resolveExplicitVerticalHandoffRequest("Quero ir para a Logistica."), { verticalId: "log", mode: "read_only" });
  assert.deepEqual(resolveExplicitVerticalHandoffRequest("mudar para imob"), { verticalId: "imob", mode: "read_only" });
  assert.equal(resolveExplicitVerticalHandoffRequest("mudar para core"), null);
});

test("J01: pedidos claros de trabalhar com a Logística são reconhecidos; menção solta, pergunta e ambiguidade, não", () => {
  const positives = [
    "Quero trabalhar com logística.", "Preciso acessar Logística & Comex.", "quero usar a logística", "Gostaria de abrir o módulo de logística",
    "vamos entrar em Logística e Comex", "Quero consultar a devolução de um contêiner.", "preciso preparar a devolução do contêiner vazio", "quero acompanhar a devolução de container",
  ];
  for (const input of positives) assert.deepEqual(resolveLogisticaEntryRequest(input), { verticalId: "log", mode: "read_only" }, input);
  const negatives = [
    "logística", "como funciona a logística?", "Quero trabalhar com logística?", "preciso de logística para minha loja", "quero trabalhar com logística de entregas",
    "quero trabalhar com logística e IMOB", "devolução de contêiner", "quero conferir a importação do contêiner", "preciso extrair os dados do documento de logística",
    "ativar logística", "quero cadastrar um imóvel", "oi", "",
  ];
  for (const input of negatives) assert.equal(resolveLogisticaEntryRequest(input), null, input);
});

test("J01 no engine do Front Door: vira pedido de handoff de leitura, sem run, sem rota IMOB, sem conceder nada", async () => {
  for (const input of ["Quero trabalhar com logística.", "Preciso acessar Logística & Comex.", "Quero consultar a devolução de um contêiner."]) {
    const decision = await turn(input);
    assert.equal(decision?.kind, "vertical_handoff", input);
    assert.deepEqual(decision?.verticalHandoffRequest, { verticalId: "log", mode: "read_only" });
    assert.equal(decision?.shouldCreateRun, false);
    assert.equal(decision?.launcherRouteIntent, "help");
    assert.equal(decision?.verticalHandoffForwardInput, undefined, "nada é encaminhado ao resolvedor do IMOB");
    noImob(decision?.content ?? "");
  }
  const explicit = await turn("mudar para logística");
  assert.deepEqual(explicit?.verticalHandoffRequest, { verticalId: "log", mode: "read_only" });
  // ambiguidade: segue o fluxo habitual (estado seguro), sem handoff para a Logística
  for (const input of ["logística", "como funciona a logística?", "quero trabalhar com logística e IMOB"]) {
    const decision = await turn(input);
    assert.notDeepEqual(decision?.verticalHandoffRequest, { verticalId: "log", mode: "read_only" }, input);
  }
  // a ativação continua no seu fluxo próprio, e o IMOB segue como antes
  assert.equal((await turn("ativar logística"))?.kind, "vertical_activation_preview");
  const imob = await turn("quero cadastrar um imóvel");
  assert.equal(imob?.kind, "vertical_handoff");
  assert.deepEqual(imob?.verticalHandoffRequest, { verticalId: "imob", capabilityId: "crm.forms", mode: "requires_write" });
  assert.equal(imob?.verticalHandoffForwardInput, "quero cadastrar um imóvel");
});

test("entrada por navegação: `?domain=logistica` abre o handoff da Logística; IMOB igual; demais valores não", async () => {
  const log = await resolveLauncherNavigationDecision({ domainHint: "logistica", isUnifiedEiah: true });
  assert.deepEqual(log?.verticalHandoffRequest, { verticalId: "log", mode: "read_only" });
  noImob(log?.content ?? "");
  assert.deepEqual((await resolveLauncherNavigationDecision({ domainHint: "LOG", isUnifiedEiah: true }))?.verticalHandoffRequest, { verticalId: "log", mode: "read_only" });
  const imob = await resolveLauncherNavigationDecision({ domainHint: "imob", isUnifiedEiah: true });
  assert.deepEqual(imob?.verticalHandoffRequest, { verticalId: "imob", mode: "read_only" });
  assert.equal(imob?.content, "Verificando o atendimento IMOB neste workspace.");
  for (const domainHint of ["core", "legal", "xyz", "", null, undefined]) assert.equal(await resolveLauncherNavigationDecision({ domainHint, isUnifiedEiah: true }), null, String(domainHint));
  assert.equal(await resolveLauncherNavigationDecision({ domainHint: "logistica", isUnifiedEiah: false }), null);
  let released = 0;
  await resolveLauncherNavigationDecision({ domainHint: "logistica", isUnifiedEiah: true, continuation: { threadState: { operational: {} } as never, consume: async (action) => { if (action === "release") released += 1; } } });
  assert.equal(released, 1, "sair do IMOB para a Logística encerra a coleta pendente do IMOB");
});

test("handoff permitido da Logística: sincroniza o domínio logistica, grava o contexto LOGISTICA e não encaminha ao IMOB", async () => {
  const synced: string[] = [];
  const request: VerticalHandoffRequest = { verticalId: "log", mode: "read_only" };
  const base = { content: "x", verticalHandoffRequest: request, verticalHandoffForwardInput: "texto" };
  const out = await enrichLauncherDecisionWithVerticalHandoff(base, undefined, async () => allowedLog(), async (domain) => { synced.push(domain); });
  assert.deepEqual(synced, ["logistica"]);
  noImob(out?.content ?? "");
  assert.match(out?.content ?? "", /Sigo com Logística & Comex nesta conversa/);
  assert.match(out?.content ?? "", /Nada foi executado/);
  assert.equal(out?.verticalHandoffSessionSync, "synced");
  const snapshot = attachVerticalHandoffToSnapshot({ verticalContext: null as "IMOB" | "LEGAL" | "LOGISTICA" | null }, out);
  assert.equal(snapshot.verticalContext, "LOGISTICA");
  assert.equal(JSON.stringify(snapshot.verticalHandoff).includes("tenant"), false);

  const failed = await enrichLauncherDecisionWithVerticalHandoff(base, undefined, async () => allowedLog(), async () => { throw new Error("sync"); });
  assert.match(failed?.content ?? "", /acesso a Logística & Comex foi confirmado, mas não consegui atualizar/);
  noImob(failed?.content ?? "");
  assert.equal(failed?.verticalHandoffForwardInput, undefined, "sem sincronização não há encaminhamento");
});

test("handoff bloqueado da Logística: cada motivo explica sem citar IMOB, nada é concedido e a vertical fica registrada", async () => {
  const cases: Array<[string, RegExp, string[]]> = [
    ["VERTICAL_NOT_REGISTERED", /ainda não está ativa neste workspace/, ["Ativar Logística & Comex neste workspace", "Ver opções no Marketplace"]],
    ["VERTICAL_DISABLED", /ainda não está disponível para uso/, []],
    ["VERTICAL_ENTITLEMENT_REQUIRED", /ainda não está disponível para uso/, []],
    ["VERTICAL_SCOPE_DENIED", /não está autorizado/, []],
    ["VERTICAL_POLICY_DENIED", /não está autorizado/, []],
    ["VERTICAL_HITL_REQUIRED", /aprovação humana/, []],
    ["VERTICAL_GOVERNANCE_NOT_EVALUATED", /Não consegui confirmar o acesso a Logística & Comex/, []],
    ["", /Não consegui confirmar o acesso a Logística & Comex/, []],
  ];
  for (const [reasonCode, pattern, quickReplies] of cases) {
    const out = await enrichLauncherDecisionWithVerticalHandoff(
      { content: "x", verticalHandoffRequest: { verticalId: "log", mode: "read_only" } as VerticalHandoffRequest },
      undefined, async () => ({ ok: false, reasonCode }), async () => { throw new Error("não deve sincronizar"); },
    );
    assert.match(out?.content ?? "", pattern, reasonCode);
    noImob(out?.content ?? "");
    assert.deepEqual(out?.resolvedQuickReplies, quickReplies, reasonCode);
    assert.equal(out?.verticalHandoff && !out.verticalHandoff.ok && out.verticalHandoff.verticalId, "log");
    assert.equal(out?.verticalHandoffSessionSync, undefined);
    assert.equal(attachVerticalHandoffToSnapshot({ verticalContext: null as "IMOB" | "LEGAL" | "LOGISTICA" | null }, out).verticalContext, null, "bloqueio não dá contexto de vertical");
  }
  // vertical sem tratamento próprio nunca cai na redação do IMOB
  noImob(describeVerticalHandoffResult({ ok: false, reasonCode: "VERTICAL_NOT_REGISTERED" }, "legal").content);
});

test("o IMOB permanece idêntico: sem marca de vertical no bloqueio e mesma redação", async () => {
  const out = await enrichLauncherDecisionWithVerticalHandoff(
    { content: "x", verticalHandoffRequest: { verticalId: "imob", capabilityId: "crm.forms", mode: "requires_write" } as VerticalHandoffRequest },
    undefined, async () => ({ ok: false, reasonCode: "VERTICAL_NOT_REGISTERED" }),
  );
  assert.deepEqual(out?.verticalHandoff, { ok: false, reasonCode: "VERTICAL_NOT_REGISTERED" });
  assert.match(out?.content ?? "", /^O IMOB ainda não está ativo/);
  const synced: string[] = [];
  const ok = await enrichLauncherDecisionWithVerticalHandoff({ content: "x", verticalHandoffRequest: { verticalId: "imob", capabilityId: "crm.forms", mode: "requires_write" } as VerticalHandoffRequest }, undefined, async () => allowedImob(), async (d) => { synced.push(d); });
  assert.deepEqual(synced, ["imob"]);
  assert.equal(attachVerticalHandoffToSnapshot({ verticalContext: null as "IMOB" | "LEGAL" | "LOGISTICA" | null }, ok).verticalContext, "IMOB");
});

test("ativar a Logística não dá contexto IMOB à conversa; a vertical ativa vem do último handoff permitido", () => {
  const activatedLog = { verticalActivation: { status: "activated" as const, verticalId: "log" as const } };
  assert.equal(attachVerticalHandoffToSnapshot({ verticalContext: null as "IMOB" | "LEGAL" | "LOGISTICA" | null }, activatedLog as never).verticalContext, null);
  const activatedImob = { verticalActivation: { status: "activated" as const, verticalId: "imob" as const } };
  assert.equal(attachVerticalHandoffToSnapshot({ verticalContext: null as "IMOB" | "LEGAL" | "LOGISTICA" | null }, activatedImob as never).verticalContext, "IMOB");

  const log = { verticalHandoff: allowedLog() };
  const imob = { verticalHandoff: allowedImob() };
  const blocked = { verticalHandoff: { ok: false, reasonCode: "VERTICAL_DISABLED", verticalId: "log" } as ChatVerticalHandoffResult };
  assert.equal(activeVerticalInConversation([]), null);
  assert.equal(activeVerticalInConversation([log]), "log");
  assert.equal(isImobActiveInConversation([log]), false);
  assert.equal(activeVerticalInConversation([imob]), "imob");
  assert.equal(activeVerticalInConversation([imob, log]), "log", "o último handoff permitido prevalece");
  assert.equal(activeVerticalInConversation([log, imob, blocked]), null);
  assert.equal(activeVerticalInConversation([imob, { verticalActivation: { status: "activated", verticalId: "log" } }]), "imob", "ativar a Logística não troca a vertical da conversa");
  assert.equal(isImobActiveInConversation([{ verticalActivation: { status: "activated", verticalId: "imob" } }]), true);
  assert.equal(isImobActiveInConversation([{ verticalActivation: { status: "cancelled", verticalId: "imob" } }, { verticalActivation: { status: "proposed", verticalId: "imob", registryVersion: "v" } }]), false);
});

test("cartão do handoff: nomeia a vertical certa nos estados permitido e bloqueado", () => {
  const render = (result: ChatVerticalHandoffResult) => renderToStaticMarkup(React.createElement(ChatVerticalHandoffCard, { result }));
  const allowed = render(allowedLog());
  assert.match(allowed, /Logística &amp; Comex/);
  assert.match(allowed, /Consulta de contexto de Logística &amp; Comex/);
  assert.doesNotMatch(allowed, /IMOB/);
  const blockedLog = render({ ok: false, reasonCode: "VERTICAL_DISABLED", verticalId: "log" });
  assert.match(blockedLog, /Logística &amp; Comex indisponível/);
  assert.doesNotMatch(blockedLog, /IMOB/);
  assert.match(render({ ok: false, reasonCode: "VERTICAL_DISABLED" }), /IMOB indisponível/, "sem marca = IMOB (comportamento anterior)");
});

test("FD-E2E-002: variações controladas da devolução de contêiner vazio são reconhecidas; outras operações e perguntas, não", () => {
  const positives = [
    "Quero preparar a devolução de um contêiner vazio.",
    "Preciso devolver um contêiner vazio.",
    "Quero organizar a devolução do contêiner.",
    "Preciso preparar o retorno de um contêiner vazio.",
    "Gostaria de devolver o contêiner vazio",
    "Quero organizar o retorno do contêiner",
  ];
  for (const input of positives) assert.deepEqual(resolveLogisticaEntryRequest(input), { verticalId: "log", mode: "read_only" }, input);
  const negatives = [
    "Preciso devolver o contêiner cheio",
    "Preciso preparar o retorno de um contêiner cheio",
    "Como faço para devolver um contêiner vazio?",
    "Preciso devolver um imóvel",
    "Preciso devolver um contêiner vazio no IMOB",
    "Quero preparar a DUIMP",
    "Preciso organizar o desembaraço do contêiner",
    "Quero preparar a importação de um contêiner",
    "Preciso devolver",
    "contêiner vazio",
    "Quero retornar o carro",
    "Quero organizar a devolução do contêiner cheio e do imóvel",
  ];
  for (const input of negatives) assert.equal(resolveLogisticaEntryRequest(input), null, input);
});

// EIAH-FD-E2E-003 — `refs.caseRef` no handoff da Logística: o cliente envia só uma referência opaca válida, só para `log`; o veredito do
// servidor (resolvida/recusada) vira apresentação; nada do caso trafega e nada é concedido.
const logRequest: VerticalHandoffRequest = { verticalId: "log", capabilityId: "oraculo.context", mode: "read_only" };
const CASE = "cmcase0000abcdef";
async function withHandoffServer<T>(t: { after: (fn: () => void) => void }, reply: (body: any) => Record<string, unknown>, run: (posted: any[]) => Promise<T>): Promise<T> {
  const previous = globalThis.fetch;
  t.after(() => { globalThis.fetch = previous; });
  const posted: any[] = [];
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    posted.push(body);
    return new Response(JSON.stringify({ ok: true, data: { ...allowedLog(), ...reply(body) } }), { status: 200 });
  }) as typeof fetch;
  return run(posted);
}

test("FD-E2E-003: o handoff da Logística envia `refs.caseRef` válida e só para a Logística", async (t) => {
  await withHandoffServer(t, () => ({}), async (posted) => {
    await requestVerticalHandoff(logRequest, { threadId: "thr-1", caseRef: CASE });
    await requestVerticalHandoff(logRequest, { caseRef: "../../etc/passwd" });
    await requestVerticalHandoff(logRequest, { caseRef: "curto" });
    await requestVerticalHandoff(logRequest, { caseRef: null });
    await requestVerticalHandoff(logRequest);
    await requestVerticalHandoff({ verticalId: "imob", capabilityId: "crm.forms", mode: "requires_write" }, { caseRef: CASE });
    assert.deepEqual(posted[0].refs, { threadId: "thr-1", caseRef: CASE });
    for (const index of [1, 2, 3, 4, 5]) assert.equal("refs" in posted[index] && "caseRef" in (posted[index].refs ?? {}), false, `chamada ${index}: sem caseRef`);
    assert.equal(posted[5].verticalId, "imob");
  });
});

test("FD-E2E-003: o veredito do servidor só vale se pedimos a referência e se `resolved` repete a mesma; ausente preserva o resultado", async (t) => {
  await withHandoffServer(t, () => ({ caseContext: { status: "resolved", caseRef: CASE } }), async () => {
    const resolved = await requestVerticalHandoff(logRequest, { caseRef: CASE });
    assert.ok(resolved.ok);
    assert.deepEqual(resolved.caseContext, { status: "resolved", caseRef: CASE });
    const unsolicited = await requestVerticalHandoff(logRequest, { caseRef: null });
    assert.ok(unsolicited.ok);
    assert.equal("caseContext" in unsolicited, false, "veredito que não pedimos é descartado");
  });
  await withHandoffServer(t, () => ({ caseContext: { status: "resolved", caseRef: "outrareferencia1" } }), async () => {
    const swapped = await requestVerticalHandoff(logRequest, { caseRef: CASE });
    assert.ok(swapped.ok);
    assert.deepEqual(swapped.caseContext, { status: "unavailable", caseRef: CASE }, "resolved com outra referência não é aceito");
  });
  await withHandoffServer(t, () => ({ caseContext: { status: "unavailable" } }), async () => {
    const refused = await requestVerticalHandoff(logRequest, { caseRef: CASE });
    assert.ok(refused.ok);
    assert.deepEqual(refused.caseContext, { status: "unavailable", caseRef: CASE });
  });
  await withHandoffServer(t, () => ({}), async () => {
    const plain = await requestVerticalHandoff(logRequest, { caseRef: CASE });
    assert.ok(plain.ok);
    assert.equal("caseContext" in plain, false, "servidor antigo (sem veredito): comportamento anterior");
  });
});

test("FD-E2E-003: o snapshot guarda só o veredito (sem dados do caso) e só para handoff de Logística permitido", () => {
  const withVerdict = { ...allowedLog(), caseContext: { status: "resolved" as const, caseRef: CASE } };
  const snapshot = attachVerticalHandoffToSnapshot({} as never, { verticalHandoff: withVerdict } as never) as Record<string, unknown>;
  assert.deepEqual(snapshot.logisticaCase, { status: "resolved", caseRef: CASE });
  assert.equal(snapshot.logisticaJourney, true);
  const none = attachVerticalHandoffToSnapshot({} as never, { verticalHandoff: allowedLog() } as never) as Record<string, unknown>;
  assert.equal("logisticaCase" in none, false);
  const imob = attachVerticalHandoffToSnapshot({} as never, { verticalHandoff: { ...allowedImob(), caseContext: { status: "resolved", caseRef: CASE } } } as never) as Record<string, unknown>;
  assert.equal("logisticaCase" in imob, false, "IMOB nunca recebe veredito de caso da Logística");
  const blocked = attachVerticalHandoffToSnapshot({} as never, { verticalHandoff: { ok: false, reasonCode: "VERTICAL_DISABLED", verticalId: "log" } } as never) as Record<string, unknown>;
  assert.equal("logisticaCase" in blocked, false);
  assert.equal("logisticaJourney" in blocked, false);
});

// FD-CHAT-ONLY-001: o motivo específico do bloqueio é explicado na conversa (antes só aparecia no painel externo de contexto).
test("handoff bloqueado da Logística: o motivo informado pelo servidor entra no texto da conversa; sem consulta/permitido não muda", async () => {
  const entry = { verticalHandoffRequest: { verticalId: "log", capabilityId: "", mode: "read_only" } } as never;
  const blocked = async () => ({ ok: false, reasonCode: "VERTICAL_DISABLED" }) as ChatVerticalHandoffResult;
  const sync = async () => undefined;
  const withReason = await enrichLauncherDecisionWithVerticalHandoff(entry, undefined, blocked, sync, () => true, async () => ({ allowed: false, reason: "policy_denied", usage: "blocked", mode: "context_only", executionAllowed: false, externalTransmissionAllowed: false }));
  assert.match(withReason!.content!, /Motivo informado pelo servidor: A permissão de consulta de Logística ainda não foi concedida\./);
  assert.doesNotMatch(withReason!.content!, /cockpit/i);
  const failing = await enrichLauncherDecisionWithVerticalHandoff(entry, undefined, blocked, sync, () => true, async () => { throw new Error("x"); });
  assert.doesNotMatch(failing!.content!, /Motivo informado/);
  const noReason = await enrichLauncherDecisionWithVerticalHandoff(entry, undefined, blocked, sync, () => true, async () => null);
  assert.doesNotMatch(noReason!.content!, /Motivo informado/);
  const imob = await enrichLauncherDecisionWithVerticalHandoff({ verticalHandoffRequest: { verticalId: "imob", capabilityId: "crm.forms", mode: "requires_write" } } as never, undefined, blocked, sync, () => true, async () => { throw new Error("IMOB não consulta o acesso da Logística"); });
  assert.doesNotMatch(imob!.content!, /Motivo informado/);
});
