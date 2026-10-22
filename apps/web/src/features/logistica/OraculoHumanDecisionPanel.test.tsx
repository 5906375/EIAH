import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { OraculoDecisionViewV1, OraculoPreparationRecordV1 } from "@eiah/contracts";
import { OraculoHumanDecisionView } from "./OraculoHumanDecisionPanel";

// FD-E2E-004 (J17): a tela só renderiza a visão do servidor; cada estado mostra o que pode (e não pode) ser feito.
const record = { schemaVersion: "oraculo.empty-return-preparation.v1", tenantId: "t", workspaceId: "w", caseId: "cm0synthetic0case01", caseType: "ORACULO_EMPTY_RETURN_PREPARATION_V1", revision: 2, lifecycle: "DISCOVERY",
  context: { port: { status: "informed", value: "P" }, depot: { status: "informed", value: "D" }, flow: { status: "not_applicable", justification: "j" } },
  createdAt: "2026-10-19T10:00:00.000Z", updatedAt: "2026-10-19T11:00:00.000Z", executionAllowed: false, authorizationState: "NOT_REQUESTED", externalTransmissionAllowed: false } as unknown as OraculoPreparationRecordV1;
const view = (over: Partial<OraculoDecisionViewV1> = {}): OraculoDecisionViewV1 => ({
  caseId: record.caseId, revision: 2, coverage: "none", triggers: [{ key: "context:flow", kind: "context_field", field: "flow" }], requests: [],
  eligibility: { requestAllowed: true, requestBlockedReason: null, deciderAvailable: true, decideAllowed: true }, operationalAuthorization: "not_granted", ...over,
});
const pendingRequest = (byYou: boolean) => ({ id: "req-1", status: "pending" as const, basisCurrent: true, basedOnRevision: 2, requestedAt: "2026-10-21T10:00:00.000Z", requestedByYou: byYou, triggers: ["context:flow"], note: "Preciso de decisão" });
const render = (v: OraculoDecisionViewV1 | null, props: { canAct?: boolean; message?: string } = {}) =>
  renderToStaticMarkup(<OraculoHumanDecisionView record={record} view={v} canAct={props.canAct ?? true} busy={false} message={props.message ?? ""} onRequest={() => undefined} onDecide={() => undefined} />);

test("sem solicitação e com responsável elegível: oferece solicitar a decisão e declara que nada é autorizado", () => {
  const html = render(view());
  assert.match(html, /Solicitar decisão humana/); assert.match(html, /Fluxo pretendido: dispensado com justificativa/);
  assert.match(html, /não autoriza execução, aceite da devolução, responsabilidade, custos nem transmissão externa/);
  assert.doesNotMatch(html, /Registrar decisão/);
});

test("sem responsável elegível: bloqueio explícito e nenhum botão de solicitar", () => {
  const html = render(view({ eligibility: { requestAllowed: false, requestBlockedReason: "no_eligible_decider", deciderAvailable: false, decideAllowed: false } }));
  assert.match(html, /data-testid="decision-blocked"/); assert.match(html, /Sem responsável elegível/); assert.match(html, /Nenhuma solicitação foi criada/);
  assert.doesNotMatch(html, /Solicitar decisão humana/);
  // edição local pendente: nenhuma ação é oferecida mesmo que o servidor permita
  assert.doesNotMatch(render(view(), { canAct: false }), /Solicitar decisão humana/);
});

test("pendente: quem pediu não decide (sem formulário); outro responsável elegível vê o formulário completo", () => {
  const mine = render(view({ coverage: "pending", requests: [pendingRequest(true)], eligibility: { requestAllowed: false, requestBlockedReason: "already_requested", deciderAvailable: true, decideAllowed: true } }));
  assert.match(mine, /data-testid="decision-pending"/); assert.match(mine, /data-testid="decision-independence"/); assert.doesNotMatch(mine, /Registrar decisão/);
  const other = render(view({ coverage: "pending", requests: [pendingRequest(false)], eligibility: { requestAllowed: false, requestBlockedReason: "already_requested", deciderAvailable: true, decideAllowed: true } }));
  assert.match(other, /Registrar decisão/); assert.match(other, /Aprovar/); assert.match(other, /Rejeitar/); assert.match(other, /Pedir complementação/);
  assert.match(other, /Justificativa da decisão/); assert.match(other, /Li os itens acima/); assert.match(other, /solicitado por outro membro/);
  const noPolicy = render(view({ coverage: "pending", requests: [pendingRequest(false)], eligibility: { requestAllowed: false, requestBlockedReason: "already_requested", deciderAvailable: false, decideAllowed: false } }));
  assert.match(noPolicy, /data-testid="decision-awaiting"/); assert.match(noPolicy, /política de conferência humana/); assert.doesNotMatch(noPolicy, /Registrar decisão/);
});

test("decidida e obsoleta aparecem no histórico com a justificativa, sem prometer autorização", () => {
  const decided = render(view({ coverage: "approved", eligibility: { requestAllowed: false, requestBlockedReason: "already_requested", deciderAvailable: true, decideAllowed: true },
    requests: [{ ...pendingRequest(true), status: "approved", decision: { id: "d1", value: "approved", note: "Aceito como informado", decidedAt: "2026-10-21T11:00:00.000Z", decidedByYou: false, basedOnRevision: 3 } }] }));
  assert.match(decided, /Aprovada · Aprovada/); assert.match(decided, /Justificativa: Aceito como informado/); assert.match(decided, /Decidido por outro responsável/);
  assert.doesNotMatch(decided, /Registrar decisão/); assert.doesNotMatch(decided, /Solicitar decisão humana/);
  const obsolete = render(view({ coverage: "obsolete", requests: [{ ...pendingRequest(true), status: "obsolete", basisCurrent: false }] }));
  assert.match(obsolete, /Obsoleta — o caso mudou/); assert.match(obsolete, /o caso mudou depois deste pedido/); assert.match(obsolete, /Solicitar decisão humana/);
});

test("carregando e mensagens de resultado", () => {
  assert.match(render(null), /Consultando a situação da decisão/);
  assert.match(render(view(), { message: "Decisão solicitada e registrada no caso." }), /Decisão solicitada e registrada no caso\./);
});
