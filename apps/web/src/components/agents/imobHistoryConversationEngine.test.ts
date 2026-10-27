import test from "node:test";
import assert from "node:assert/strict";
import { attachImobHistoryCardToSnapshot, IMOB_HISTORY_ENTRY_PROMPT, isImobHistoryRequest } from "./imobHistoryConversationEngine";
import { resolveLauncherTurnDecision } from "./chatLauncherEngine";
import { IMOB_ACTION_MENUS } from "@/features/imob/imobActionMenus";

// FD-IMOB-PERSISTENCE-001: o histórico do IMOB abre NA conversa (cartão do launcher), por vocabulário controlado.
test("pedidos claros de ver o histórico do IMOB abrem o cartão", () => {
  for (const input of ["ver histórico do IMOB", "Quero ver o histórico do IMOB.", "Retomar conversas do IMOB", "abrir o histórico do chat IMOB", "Mostrar as conversas anteriores do IMOB", IMOB_HISTORY_ENTRY_PROMPT]) {
    assert.equal(isImobHistoryRequest(input), true, input);
  }
});
test("perguntas, frases soltas, outras verticais e operações NÃO abrem o cartão", () => {
  for (const input of ["Como funciona o histórico do IMOB?", "histórico", "ver histórico", "Quero ver o histórico da logística", "ver histórico do Pré-DUIMP", "Quero cadastrar um imóvel", "apagar histórico do IMOB", ""]) {
    assert.equal(isImobHistoryRequest(input), false, input);
  }
});
test("no engine do launcher: vira decisão com o cartão (sem run, sem handoff); gestão e cadastro seguem como antes", async () => {
  const base = { proposalMode: false, isUnifiedEiah: true, eiahMode: "help" as const, agentProfile: null, catalogAgents: [], intentUnknown: false, confidence: 0.9, routeIntent: "help" as const };
  const turn = (input: string) => resolveLauncherTurnDecision({ ...base, input, trimmedInput: input });
  const decision = await turn("ver histórico do IMOB");
  assert.equal(decision?.kind, "imob_history_entry");
  assert.equal(decision?.imobHistoryCard, true);
  assert.equal(decision?.shouldCreateRun, false);
  assert.equal(decision?.verticalHandoffRequest, undefined);
  assert.equal((await turn("ver painel de gestão do IMOB"))?.kind, "imob_management_entry");
  assert.equal((await turn("Quero cadastrar um imóvel."))?.kind, "vertical_handoff");
});
test("snapshot marca só quando a decisão pede; o menu 'Histórico de conversas' envia o pedido que o engine reconhece", () => {
  assert.equal(attachImobHistoryCardToSnapshot({ a: 1 } as { a: number; imobHistoryCard?: boolean | null }, { imobHistoryCard: true }).imobHistoryCard, true);
  assert.equal("imobHistoryCard" in attachImobHistoryCardToSnapshot({ a: 1 }, {}), false);
  const item = IMOB_ACTION_MENUS.flatMap((menu) => menu.items).find((entry) => entry.id === "management-history");
  assert.ok(item?.kind === "front_door" && isImobHistoryRequest(item.prompt));
});
