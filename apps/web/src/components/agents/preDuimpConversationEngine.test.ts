import test from "node:test";
import assert from "node:assert/strict";
import { attachPreDuimpCardToSnapshot, isPreDuimpEntryRequest, PRE_DUIMP_AVAILABILITY, PRE_DUIMP_DENIAL_REASON_CODES, resolvePreDuimpCardView } from "./preDuimpConversationEngine";
import { resolveLauncherTurnDecision } from "./chatLauncherEngine";

// FD-PREDUIMP-001: o Pré-DUIMP abre na conversa por vocabulário controlado; nunca por operações aduaneiras reais; acesso fail-closed.
test("pedidos claros de preparar o Pré-DUIMP abrem o cartão; variações controladas", () => {
  for (const input of ["Quero preparar o Pré-DUIMP", "Quero criar um contexto Pré-DUIMP.", "Preciso abrir o pre-duimp", "Quero iniciar o contexto de DUIMP", "abrir Pré-DUIMP", "Gostaria de consultar o Pré-DUIMP shadow", "Vamos preparar um novo contexto DUIMP"]) {
    assert.equal(isPreDuimpEntryRequest(input), true, input);
  }
});
test("operações aduaneiras reais, perguntas, IMOB e frases soltas NÃO abrem o cartão", () => {
  for (const input of ["Quero registrar a DUIMP", "Quero transmitir o Pré-DUIMP", "Quero enviar a DUIMP ao Siscomex", "Preciso do desembaraço da importação", "Como funciona o Pré-DUIMP?", "Quero preparar o Pré-DUIMP do imóvel IMOB", "pré-duimp", "", "Quero preparar a devolução de um contêiner vazio.", "Quero abrir a DUIMP real"]) {
    assert.equal(isPreDuimpEntryRequest(input), false, input);
  }
});
test("no engine do launcher: o pedido vira decisão com o cartão (sem run, sem handoff, sem IMOB); a devolução continua sendo handoff da Logística", async () => {
  const base = { proposalMode: false, isUnifiedEiah: true, eiahMode: "help" as const, agentProfile: null, catalogAgents: [], intentUnknown: false, confidence: 0.9, routeIntent: "help" as const };
  const turn = (input: string) => resolveLauncherTurnDecision({ ...base, input, trimmedInput: input });
  const decision = await turn("Quero preparar o Pré-DUIMP");
  assert.equal(decision?.kind, "pre_duimp_entry"); assert.equal(decision?.preDuimpCard, true);
  assert.equal(decision?.shouldCreateRun, false); assert.equal(decision?.verticalHandoffRequest, undefined);
  assert.doesNotMatch(decision!.content, /imob/i); assert.match(decision!.content, /modo shadow/); assert.match(decision!.content, /nada é transmitido/);
  assert.equal((await turn("Quero registrar a DUIMP"))?.kind === "pre_duimp_entry", false);
  assert.equal((await turn("Quero preparar a devolução de um contêiner vazio."))?.kind, "vertical_handoff");
});
test("acesso: sem a chave do front-end, sem leitura válida do servidor ou com allowed:false nada é oferecido; só allowed:true libera", () => {
  const ok = { version: "v1", allowed: true, mode: "shadow", externalTransmissionAllowed: false, reasonCode: null } as const;
  assert.equal(resolvePreDuimpCardView(true, { status: "ready", capability: ok }).status, "available");
  const off = resolvePreDuimpCardView(false, { status: "ready", capability: ok });
  assert.equal(off.status, "blocked"); assert.equal(off.status === "blocked" && off.reasonCode, "PRE_DUIMP_FRONTEND_DISABLED");
  assert.equal(resolvePreDuimpCardView(true, { status: "loading" }).status, "checking");
  for (const access of [{ status: "error" as const }, { status: "ready" as const }, { status: "ready" as const, capability: { ...ok, externalTransmissionAllowed: true } as never }, { status: "ready" as const, capability: { ...ok, mode: "live" } as never }]) {
    const view = resolvePreDuimpCardView(true, access);
    assert.equal(view.status, "blocked"); assert.equal(view.status === "blocked" && view.reasonCode, "PRE_DUIMP_ACCESS_UNVERIFIED");
  }
  for (const reasonCode of PRE_DUIMP_DENIAL_REASON_CODES) {
    const view = resolvePreDuimpCardView(true, { status: "ready", capability: { version: "v1", allowed: false, mode: "shadow", externalTransmissionAllowed: false, reasonCode } });
    assert.equal(view.status, "blocked"); assert.equal(view.status === "blocked" && view.reasonCode, reasonCode);
    assert.ok(view.status === "blocked" && view.message.length > 15);
  }
});
test("disponibilidade: só a criação de contexto em shadow está habilitada; revisão HITL e replay seguem bloqueados", () => {
  assert.deepEqual(PRE_DUIMP_AVAILABILITY.map((item) => [item.key, item.enabled]), [["create", true], ["review", false], ["replay", false]]);
});
test("snapshot: marca só quando a decisão pede o cartão", () => {
  assert.equal(attachPreDuimpCardToSnapshot({ a: 1 } as { a: number; preDuimpCard?: boolean | null }, { preDuimpCard: true }).preDuimpCard, true);
  assert.equal("preDuimpCard" in attachPreDuimpCardToSnapshot({ a: 1 }, {}), false);
});

import { resolveLauncherNavigationDecision } from "./chatLauncherEngine";
test("FD-LEGACY-CLOSURE-001 entrada por navegação: só `entry=pre_duimp` (allowlist) abre o cartão; valores livres, modo não unificado e outras verticais não mudam", async () => {
  const open = await resolveLauncherNavigationDecision({ entryHint: "pre_duimp", isUnifiedEiah: true });
  assert.equal(open?.kind, "pre_duimp_entry"); assert.equal(open?.preDuimpCard, true); assert.equal(open?.shouldCreateRun, false); assert.equal(open?.verticalHandoffRequest, undefined);
  assert.match(open!.content, /modo shadow/); assert.match(open!.content, /nada é transmitido/);
  for (const hint of ["PRE_DUIMP", "pre_duimp;drop", "cockpit", "log.admin", "", null, undefined]) {
    const decision = await resolveLauncherNavigationDecision({ entryHint: hint as never, isUnifiedEiah: true });
    assert.equal(decision, null, String(hint));
  }
  assert.equal(await resolveLauncherNavigationDecision({ entryHint: "pre_duimp", isUnifiedEiah: false }), null);
  assert.equal((await resolveLauncherNavigationDecision({ domainHint: "logistica", isUnifiedEiah: true }))?.kind, "vertical_handoff");
  assert.equal((await resolveLauncherNavigationDecision({ domainHint: "imob", isUnifiedEiah: true }))?.verticalHandoffRequest?.verticalId, "imob");
});
