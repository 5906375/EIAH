import test from "node:test";
import assert from "node:assert/strict";
import { attachLogisticaPendingToSnapshot, fetchLogisticaPendingNotice, hasLogisticaPendingMessage } from "./logisticaPendingNoticeEngine";

// FD-CHAT-ONLY-001: a mensagem proativa de pendências só existe quando há algo a dizer a este usuário; fail-closed.
const deps = (over: Partial<Parameters<typeof fetchLogisticaPendingNotice>[0]> = {}, calls = { inbox: 0 }) => ({
  logisticaEnabled: async () => true,
  inboxCounts: async () => { calls.inbox += 1; return { awaitingYou: 1, yours: 2 }; },
  ...over,
});

test("sem Logística habilitada no registry: nenhuma mensagem e a caixa nem é consultada", async () => {
  const calls = { inbox: 0 };
  assert.equal(await fetchLogisticaPendingNotice(deps({ logisticaEnabled: async () => false }, calls)), null);
  assert.equal(calls.inbox, 0);
});

test("sem pendência e sem pedido próprio: nenhuma mensagem (nada artificial)", async () => {
  assert.equal(await fetchLogisticaPendingNotice(deps({ inboxCounts: async () => ({ awaitingYou: 0, yours: 0 }) })), null);
});

test("com pendência e/ou pedidos: mensagem que orienta abrir o caso na conversa, sem prometer autorização", async () => {
  const both = await fetchLogisticaPendingNotice(deps());
  assert.ok(both); assert.equal(both.awaitingYou, 1); assert.equal(both.yours, 2);
  assert.match(both.content, /1 pendência\(s\) de decisão humana aguardando você e 2 pedido\(s\) seu\(s\)/);
  assert.match(both.content, /Abra o caso aqui na conversa/); assert.match(both.content, /não autoriza execução/); assert.doesNotMatch(both.content, /cockpit/i);
  const only = await fetchLogisticaPendingNotice(deps({ inboxCounts: async () => ({ awaitingYou: 0, yours: 1 }) }));
  assert.doesNotMatch(only!.content, /aguardando você/); assert.match(only!.content, /1 pedido\(s\) seu\(s\)/);
});

test("falha do registry ou da caixa (403/erro): nenhuma mensagem", async () => {
  assert.equal(await fetchLogisticaPendingNotice(deps({ logisticaEnabled: async () => { throw new Error("x"); } })), null);
  assert.equal(await fetchLogisticaPendingNotice(deps({ inboxCounts: async () => { throw Object.assign(new Error("x"), { status: 403 }); } })), null);
});

test("snapshot: marca só a mensagem das pendências e detecta duplicidade na conversa", () => {
  const snapshot = attachLogisticaPendingToSnapshot({ a: 1 } as { a: number; logisticaPendingDecisions?: boolean | null });
  assert.equal(snapshot.logisticaPendingDecisions, true);
  assert.equal(hasLogisticaPendingMessage([null, {}, snapshot]), true);
  assert.equal(hasLogisticaPendingMessage([null, {}, { logisticaPendingDecisions: false }]), false);
});
