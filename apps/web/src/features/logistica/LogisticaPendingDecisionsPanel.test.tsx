import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { renderToStaticMarkup } from "react-dom/server";
import type { OraculoDecisionInboxItemV1, OraculoDecisionInboxV1 } from "@eiah/contracts";
import { LogisticaPendingDecisionsView } from "./LogisticaPendingDecisionsPanel";

// FD-E2E-005: a caixa só renderiza o que o servidor resolveu; nada é apresentado como ação do usuário sem elegibilidade comprovada.
const CASE = "cm0synthetic0case0001";
const item = (over: Partial<OraculoDecisionInboxItemV1> = {}): OraculoDecisionInboxItemV1 => ({
  caseId: CASE, requestId: "req-1", status: "pending", basisCurrent: true, basedOnRevision: 1, currentRevision: 2,
  requestedAt: "2026-10-21T10:00:00.000Z", triggers: ["context:flow"], note: "Preciso de decisão", ...over,
});
const inbox = (over: Partial<OraculoDecisionInboxV1> = {}): OraculoDecisionInboxV1 => ({
  awaitingYou: [], yours: [], eligibility: { canDecide: true, reason: null }, limits: { casesScanned: 1, maxCases: 100 }, operationalAuthorization: "not_granted", ...over,
});
const render = (value: OraculoDecisionInboxV1 | null, props: { loading?: boolean; error?: boolean; hideWhenEmpty?: boolean } = {}) =>
  renderToStaticMarkup(<MemoryRouter><LogisticaPendingDecisionsView inbox={value} loading={props.loading ?? false} error={props.error ?? false} onRefresh={() => undefined} /></MemoryRouter>);

test("elegível: lista o que aguarda a decisão, com motivo e link para abrir o caso na conversa via caseRef", () => {
  const html = render(inbox({ awaitingYou: [item()] }));
  assert.match(html, /Aguardando sua decisão \(1\)/); assert.match(html, /data-testid="inbox-awaiting"/); assert.match(html, /Caso cm0synth/);
  assert.match(html, /Fluxo pretendido: dispensado com justificativa/); assert.match(html, /Motivo informado: Preciso de decisão/);
  assert.match(html, new RegExp(`href="/app/chat\\?domain=logistica&amp;case=${CASE}"`)); assert.match(html, /Abrir na conversa para decidir/);
  assert.match(html, /não autoriza execução, aceite da devolução, custos nem transmissão/); assert.match(html, /Não há aviso automático/);
});

test("sem elegibilidade (política ausente ou sem designação): nada é apresentado como ação do usuário", () => {
  for (const reason of ["policy_absent", "not_designated", "read_only"] as const) {
    const html = render(inbox({ eligibility: { canDecide: false, reason } }));
    assert.match(html, /data-testid="inbox-not-authorized"/); assert.doesNotMatch(html, /Aguardando sua decisão/); assert.doesNotMatch(html, /Abrir na conversa para decidir/);
  }
  assert.match(render(inbox({ eligibility: { canDecide: false, reason: "not_designated" } })), /Não há responsável designado/);
  assert.match(render(inbox({ eligibility: { canDecide: false, reason: "policy_absent" } })), /Sem a política de conferência humana/);
});

test("pedidos do próprio usuário: abertos antes dos respondidos, com resultado e justificativa; obsoleto sinalizado", () => {
  const html = render(inbox({ eligibility: { canDecide: false, reason: "policy_absent" }, yours: [
    item({ requestId: "a", caseId: "cm0synthetic0case0002", status: "approved", decision: { value: "approved", note: "Aceito como informado", decidedAt: "2026-10-21T11:00:00.000Z" } }),
    item({ requestId: "b", caseId: "cm0synthetic0case0003", status: "obsolete", basisCurrent: false }),
    item({ requestId: "c" }),
  ] }));
  assert.match(html, /Seus pedidos \(3\)/); assert.match(html, /Aprovada · aprovada/); assert.match(html, /Justificativa da decisão: Aceito como informado/);
  assert.match(html, /o caso mudou depois do pedido/); assert.match(html, /Abrir o caso na conversa/);
  assert.ok(html.indexOf('data-status="pending"') < html.indexOf('data-status="approved"'), "pendentes antes dos respondidos");
});

test("estados: carregando, erro (nada é alterado) e vazio", () => {
  assert.match(render(null, { loading: true }), /Consultando pendências/);
  assert.match(render(null, { error: true }), /data-testid="inbox-error"/);
  assert.match(render(inbox()), /Sem pendências neste workspace/);
  assert.match(render(inbox({ awaitingYou: [] })), /data-testid="inbox-empty-awaiting"/);
});
