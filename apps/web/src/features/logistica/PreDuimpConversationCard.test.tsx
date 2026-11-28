import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PreDuimpConversationCardView } from "./PreDuimpConversationCard";

const render = (props: Partial<React.ComponentProps<typeof PreDuimpConversationCardView>> = {}) =>
  renderToStaticMarkup(<PreDuimpConversationCardView view={{ status: "available" }} recordId="" submission="idle" error={null} {...props} />);

test("disponível: formulário do contexto shadow, campos fixos, aviso de não transmissão e itens bloqueados", () => {
  const html = render();
  assert.match(html, /data-testid="pre-duimp-card"/); assert.match(html, /Pré-DUIMP — modo shadow/); assert.match(html, /Nenhuma transmissão ao Siscomex\/Portal Único/);
  assert.match(html, /Identificador do contexto/); assert.match(html, /Criar contexto shadow/); assert.match(html, /Contexto DUIMP/); assert.match(html, /Desativada/);
  assert.match(html, /data-enabled="true"/); assert.equal((html.match(/data-enabled="false"/g) ?? []).length, 2);
  assert.match(html, /Aprovação HITL persistida ainda não está habilitada/); assert.match(html, /Replay e idempotência persistidos ainda estão em preparação/);
  assert.doesNotMatch(html, /cockpit|\/app\/logistica/i);
});
test("verificando e bloqueado: nenhum formulário; mostra motivo e código; nada executado", () => {
  assert.match(render({ view: { status: "checking" } }), /Verificando o acesso ao Pré-DUIMP/);
  const blocked = render({ view: { status: "blocked", reasonCode: "PRE_DUIMP_PILOT_GRANT_MISSING", message: "Este workspace não integra o piloto do Pré-DUIMP." } });
  assert.match(blocked, /data-testid="pre-duimp-blocked"/); assert.match(blocked, /Este workspace não integra o piloto/); assert.match(blocked, /PRE_DUIMP_PILOT_GRANT_MISSING/); assert.match(blocked, /Nada foi executado/);
  assert.doesNotMatch(blocked, /Criar contexto shadow/); assert.doesNotMatch(blocked, /Identificador do contexto/);
});
test("resultado: sucesso só declara a decisão de autorização em shadow; erro mostra a mensagem canônica e o código", () => {
  const ok = render({ submission: "success" });
  assert.match(ok, /Contexto autorizado em modo shadow/); assert.match(ok, /persistência de contextos e o replay ainda não existem/);
  const bad = render({ submission: "error", error: { reasonCode: "PRE_DUIMP_SCOPE_DENIED", message: "Sua identidade não possui permissão para criar este contexto." } });
  assert.match(bad, /role="alert"/); assert.match(bad, /Sua identidade não possui permissão/); assert.match(bad, /PRE_DUIMP_SCOPE_DENIED/);
  assert.match(render({ submission: "submitting" }), /Criando contexto\.\.\./);
});
