import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DIRECTED_ACTION_BADGE,
  shouldUseDirectedActionFlow,
  buildDirectedActionCard,
  buildAgentsExecuteMetadata,
} from "./imobChatDirectedAction.js";

const thread = { id: "thread-abc", label: "Qualificação" };

describe("Phase 3 — Directed Action Flow", () => {
  // Cenário 1: badge e fluxo dirigido são ativados quando requestedActionId + mode=execute
  it("shouldUseDirectedActionFlow retorna true quando requestedActionId presente e mode=execute", () => {
    assert.strictEqual(shouldUseDirectedActionFlow("lead.qualify", "execute"), true);
  });

  // Cenário 2: sem requestedActionId, modo execute segue fluxo normal (sem badge, sem bloqueio)
  it("shouldUseDirectedActionFlow retorna false quando requestedActionId é null", () => {
    assert.strictEqual(shouldUseDirectedActionFlow(null, "execute"), false);
  });

  // Cenário 2 (variante): actionId vazio não ativa fluxo dirigido
  it("shouldUseDirectedActionFlow retorna false quando requestedActionId é string vazia", () => {
    assert.strictEqual(shouldUseDirectedActionFlow("", "execute"), false);
  });

  // Cenário 9: mode=consult permanece como consulta — não ativa fluxo dirigido
  it("shouldUseDirectedActionFlow retorna false quando mode=consult mesmo com actionId", () => {
    assert.strictEqual(shouldUseDirectedActionFlow("visit.schedule", "consult"), false);
  });

  // Cenário 10: mode=blocked não ativa fluxo dirigido (sem CTA de confirmação)
  it("shouldUseDirectedActionFlow retorna false quando mode=blocked", () => {
    assert.strictEqual(shouldUseDirectedActionFlow("visit.schedule", "blocked"), false);
  });

  // Cenário 3: CTA "Confirmar execução" existe na card do fluxo dirigido
  it("buildDirectedActionCard inclui CTA confirm_execution", () => {
    const card = buildDirectedActionCard(thread);
    const confirmCta = card.ctas.find((c) => c.action === "confirm_execution");
    assert.ok(confirmCta, "CTA confirm_execution deve existir");
  });

  // Cenário 3 (variante): CTA "Cancelar" existe para rejeição explícita
  it("buildDirectedActionCard inclui CTA reject_execution", () => {
    const card = buildDirectedActionCard(thread);
    const rejectCta = card.ctas.find((c) => c.action === "reject_execution");
    assert.ok(rejectCta, "CTA reject_execution deve existir");
  });

  // Cenário 3: CTA de confirmação é primary (ação explícita de destaque)
  it("CTA de confirmação tem kind=primary", () => {
    const card = buildDirectedActionCard(thread);
    const confirmCta = card.ctas.find((c) => c.action === "confirm_execution");
    assert.strictEqual(confirmCta?.kind, "primary");
  });

  // Cenário 8: source="command-center" está no metadata de apiAgentsExecute após confirmação
  it("buildAgentsExecuteMetadata inclui source quando fornecido", () => {
    const meta = buildAgentsExecuteMetadata({
      chatFlow: "imob-operational-chat",
      intent: "lead",
      threadId: thread.id,
      threadLabel: thread.label,
      source: "command-center",
    });
    assert.strictEqual(meta.source, "command-center");
  });

  // Cenário 8 (isolamento): source ausente quando não fornecido (fluxo consult fica limpo)
  it("buildAgentsExecuteMetadata não inclui source quando não fornecido", () => {
    const meta = buildAgentsExecuteMetadata({
      chatFlow: "imob-operational-chat",
      intent: "lead",
      threadId: thread.id,
      threadLabel: thread.label,
    });
    assert.strictEqual(Object.prototype.hasOwnProperty.call(meta, "source"), false);
  });

  // Cenário 1 (badge): constante de badge tem texto esperado
  it("DIRECTED_ACTION_BADGE tem texto correto", () => {
    assert.strictEqual(DIRECTED_ACTION_BADGE, "ação direcionada — aguardando confirmação");
  });

  // Cenário 4 + 5: thread status é "waiting" — card não está em execução automática
  it("buildDirectedActionCard define thread.status como waiting (não executando)", () => {
    const card = buildDirectedActionCard(thread);
    assert.strictEqual(card.thread.status, "waiting");
  });
});
