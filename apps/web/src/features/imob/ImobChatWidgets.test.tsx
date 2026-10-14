import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ImobChatWidgets, isSelfServiceDetailsPath, withImobReturnTo } from "./ImobChatWidgets";
import { canShowSubscribeControl, parseCommercialDetailsRequest, resolveCommercialAuthorityView, safeImobReturnTo } from "../../pages/self-service/commercialContext";
import type { ImobPresentationWidget, ImobTransversalCapability } from "@/lib/api";

test("IMOB widgets render contextual specialists without changing widget structure", () => {
  const widget: ImobPresentationWidget = {
    kind: "case_summary",
    title: "Resumo do negócio",
    journeyLabel: "Proposta",
    stageLabel: "Aguardando retorno",
    nextStep: "Retomar proposta com o lead",
    blocker: "documentação pendente",
    recommendedActions: [
      {
        id: "action-1",
        label: "Retomar proposta",
        autoprompt: "retomar proposta deste caso",
      },
    ],
    specialists: [
      {
        key: "commercial_intelligence",
        primaryAgentId: "I_BC",
        responsibility: "priorização comercial e próxima melhor abordagem",
        visibleToUserByDefault: false,
        escalationTriggers: ["lead quente"],
        availability: "available",
        rationale: "A proposta precisa de leitura comercial antes de avançar.",
        reasonCode: "COMMERCIAL_PRIORITY",
        suggestedAction: "Revisar proposta e definir a próxima abordagem comercial.",
        urgency: "high",
        outputType: "advice",
        requiredContext: ["case.nextStep"],
      },
    ],
  };

  const html = renderToStaticMarkup(
    <ImobChatWidgets
      widget={widget}
      onAction={() => {
        // no-op
      }}
    />,
  );

  assert.match(html, /Resumo do negócio/);
  assert.match(html, /Apoios contextuais/);
  assert.match(html, /I_BC/);
  assert.match(html, /Ação sugerida: Revisar proposta e definir a próxima abordagem comercial\./);
  assert.match(html, /high/);
});

function renderSpecialistWidget(specialists: NonNullable<Extract<ImobPresentationWidget, { kind: "case_summary" }>["specialists"]>) {
  const widget: ImobPresentationWidget = {
    kind: "case_summary",
    title: "Resumo do negócio",
    journeyLabel: "Documentação",
    stageLabel: "Aguardando documentos",
    nextStep: "Revisar documentos",
    blocker: "documentação pendente",
    recommendedActions: [],
    specialists,
  };
  return renderToStaticMarkup(<ImobChatWidgets widget={widget} onAction={() => {}} />);
}

const legalSpecialist = {
  key: "legal" as const,
  primaryAgentId: "J_360",
  responsibility: "contrato, cláusulas, matrícula e risco documental imobiliário",
  visibleToUserByDefault: false as const,
  escalationTriggers: ["contrato"],
  rationale: "A etapa atual pede apoio documental antes de seguir.",
  reasonCode: "DOCUMENT_BLOCKER" as const,
  suggestedAction: "Validar pendências documentais e contratuais antes de avançar o caso.",
  urgency: "high" as const,
  outputType: "validation" as const,
};

test("IMOB widgets show the suggested action only for specialists proven available", () => {
  const html = renderSpecialistWidget([{ ...legalSpecialist, availability: "available" }]);
  assert.match(html, /data-availability="available"/);
  assert.match(html, /Ação sugerida: Validar pendências documentais e contratuais/);
  assert.doesNotMatch(html, /não será acionado/);
});

test("IMOB widgets mark unavailable specialists and never present them as actionable", () => {
  const html = renderSpecialistWidget([{ ...legalSpecialist, availability: "unavailable", suggestedAction: null }]);
  assert.match(html, /data-availability="unavailable"/);
  assert.match(html, /J_360/);
  assert.match(html, /A etapa atual pede apoio documental/);
  assert.match(html, /Indisponível neste workspace\. Este apoio não será acionado\./);
  assert.doesNotMatch(html, /Ação sugerida/);
});

test("IMOB widgets fail closed for unverified, missing or unknown availability, even when an action text is present", () => {
  for (const availability of ["unverified", undefined, "AVAILABLE", "enabled"] as const) {
    const html = renderSpecialistWidget([{ ...legalSpecialist, availability: availability as any }]);
    assert.match(html, /data-availability="unverified"/, String(availability));
    assert.match(html, /Disponibilidade não verificada\. Este apoio não será acionado\./, String(availability));
    assert.doesNotMatch(html, /Ação sugerida/, `${String(availability)}: nenhuma ação, mesmo com suggestedAction no payload`);
  }
});

test("IMOB widgets keep each specialist independent when availability is mixed", () => {
  const html = renderSpecialistWidget([
    { ...legalSpecialist, availability: "unavailable", suggestedAction: null },
    {
      key: "commercial_intelligence",
      primaryAgentId: "I_BC",
      responsibility: "priorização comercial e próxima melhor abordagem",
      visibleToUserByDefault: false,
      escalationTriggers: ["lead quente"],
      availability: "available",
      rationale: "A proposta precisa de leitura comercial.",
      reasonCode: "COMMERCIAL_PRIORITY",
      suggestedAction: "Revisar proposta.",
      urgency: "medium",
      outputType: "advice",
    },
  ]);
  assert.equal((html.match(/Ação sugerida/g) ?? []).length, 1, "somente o especialista disponível mantém a ação");
  assert.match(html, /Ação sugerida: Revisar proposta\./);
  assert.equal((html.match(/não será acionado/g) ?? []).length, 1);
});

// ---------------------------------------------------------------------------------------------
// Especialistas transversais descobertos pelo backend (somente apresentação)
// ---------------------------------------------------------------------------------------------

function capability(over: Partial<ImobTransversalCapability> = {}): ImobTransversalCapability {
  return {
    need: { needId: "imob.listing.promotion", domain: "marketing", capability: "campaign", label: "Campanha de divulgação do imóvel" },
    state: "habilitavel",
    authority: { status: "contratacao_autorizada", reasonCode: "AUTHORITY_GRANTED" },
    reasons: ["NOT_ENABLED_IN_WORKSPACE"],
    provider: {
      agentId: "MKT", name: "Marketing GPS", description: "Planeja campanhas.", origin: "agent_registry",
      declaredCapabilities: ["Planejamento de campanha de divulgação multicanal"],
    },
    recipes: { status: "ok", items: [{ id: "rec-1", title: "Campanha de lançamento", summary: "Plano multicanal", tags: [], homologatedAt: null }] },
    enablement: {
      marketplaceItemId: "mkt-MKT", visibility: "public",
      conditions: ["Assinatura governada pelo Marketplace (delegação e política do workspace).", "Confirmação humana explícita antes de habilitar."],
    },
    nextAction: { kind: "open_commercial_details", actionDomain: "agent_enablement", requiresHumanConfirmation: true, marketplaceItemId: "mkt-MKT", workspaceId: "ws-1", path: "/self-service?marketplaceItem=mkt-MKT&workspaceId=ws-1" },
    ...over,
  };
}

function renderTransversal(items: ImobTransversalCapability[], kind: "case_summary" | "document_checklist" = "case_summary") {
  const widget: ImobPresentationWidget = kind === "case_summary"
    ? { kind, title: "Resumo do negócio", journeyLabel: "Captação", stageLabel: "Anúncio", nextStep: "Ativar anúncio", blocker: null, recommendedActions: [], specialists: [], transversalCapabilities: items }
    : { kind, title: "Pendências do negócio", checklist: ["matrícula"], blocker: null, nextStep: null, specialists: [], transversalCapabilities: items };
  return renderToStaticMarkup(<ImobChatWidgets widget={widget} onAction={() => {}} />);
}

test("transversal card: habilitável com autoridade mostra especialidade, agente, capacidades, modelos, condições e o caminho de revisão", () => {
  const html = renderTransversal([capability()]);
  assert.match(html, /Especialistas transversais/);
  assert.match(html, /data-capability-state="habilitavel"/);
  assert.match(html, /data-capability-domain="marketing"/);
  assert.match(html, /Campanha de divulgação do imóvel/);
  assert.match(html, /Marketing GPS \(MKT\)/);
  assert.match(html, /Planejamento de campanha de divulgação multicanal/);
  assert.match(html, /Modelos homologados neste workspace/);
  assert.match(html, /Campanha de lançamento/);
  assert.match(html, /Confirmação humana explícita antes de habilitar/);
  assert.match(html, /data-capability-authority="contratacao_autorizada"/);
  // o destino é o Self-service (assinatura de agente), identificando item e workspace; NÃO o catálogo de verticais
  assert.match(html, /<a href="\/self-service\?marketplaceItem=mkt-MKT&(amp;)?workspaceId=ws-1"[^>]*>Ver os detalhes comerciais de MKT no Self-service<\/a>/);
  assert.doesNotMatch(html, /href="\/app\/marketplace/);
  assert.match(html, /Nada foi contratado/);
  assert.match(html, /só acontece com a sua confirmação no Self-service/i);
  assert.match(html, /habilitar um agente não é convidar uma pessoa para o workspace/i);
  assert.doesNotMatch(html, />\s*Convidar/, "nenhuma ação de convite de pessoa");
  assert.doesNotMatch(html, /<button/, "apresentação apenas: nada é executado pelo cartão");
});

test("transversal card: habilitado não oferece habilitação e informa que o encaminhamento operacional ainda não existe", () => {
  const html = renderTransversal([capability({ state: "habilitado", reasons: [], enablement: null, nextAction: { kind: "request_work", actionDomain: "agent_work", enabled: false, reason: "OPERATIONAL_HANDOFF_NOT_IMPLEMENTED" } })]);
  assert.match(html, /data-capability-state="habilitado"/);
  assert.match(html, /Habilitado neste workspace/);
  assert.match(html, /Campanha de lançamento/);
  assert.match(html, /encaminhamento operacional ainda não está disponível/i);
  assert.doesNotMatch(html, /<a /);
});

test("transversal card: indisponível e não verificado nunca oferecem ação", () => {
  const unavailable = renderTransversal([capability({ state: "indisponivel", reasons: ["NOT_IN_MARKETPLACE"], provider: null, enablement: null, recipes: { status: "nao_aplicavel", items: [] }, nextAction: { kind: "none", actionDomain: null } })]);
  assert.match(unavailable, /data-capability-state="indisponivel"/);
  assert.match(unavailable, /não pode ser acionada neste workspace/i);
  assert.doesNotMatch(unavailable, /<a |Modelos homologados/);
  const unverified = renderTransversal([capability({ state: "nao_verificado", reasons: ["CATALOG_QUERY_FAILED"], provider: null, enablement: null, recipes: { status: "nao_aplicavel", items: [] }, nextAction: { kind: "none", actionDomain: null } })]);
  assert.match(unverified, /data-capability-state="nao_verificado"/);
  assert.match(unverified, /Nenhuma ação é oferecida/);
  assert.doesNotMatch(unverified, /<a /);
});

test("transversal card: payload incoerente falha fechado (estado desconhecido, ação sem estado habilitável, destino fora do Marketplace)", () => {
  const forgedState = renderTransversal([capability({ state: "habilitado-quase" as never })]);
  assert.match(forgedState, /data-capability-state="nao_verificado"/);
  assert.doesNotMatch(forgedState, /<a /);
  const actionWithoutState = renderTransversal([capability({ state: "indisponivel" })]);
  assert.doesNotMatch(actionWithoutState, /<a /, "a ação só aparece para habilitável");
  for (const path of ["https://example.invalid/enable", "/app/marketplace", "//example.invalid/self-service?marketplaceItem=x", "/self-service?marketplaceItem=x<script>"]) {
    const foreignTarget = renderTransversal([capability({ nextAction: { kind: "open_commercial_details", actionDomain: "agent_enablement", requiresHumanConfirmation: true, marketplaceItemId: "x", workspaceId: "ws-1", path } })]);
    assert.doesNotMatch(foreignTarget, /<a |example\.invalid|<script>/, path);
  }
  const noRecipes = renderTransversal([capability({ recipes: undefined as never, provider: null })]);
  assert.match(noRecipes, /data-capability-state="habilitavel"/);
});

test("transversal card: modelos - lista vazia e não verificados são distintos; lista longa é limitada", () => {
  const empty = renderTransversal([capability({ recipes: { status: "ok", items: [] } })]);
  assert.match(empty, /Nenhum modelo homologado disponível para este workspace/);
  const unverified = renderTransversal([capability({ recipes: { status: "nao_verificado", items: [] } })]);
  assert.match(unverified, /Não foi possível consultar os modelos homologados agora\. Nenhum modelo está sendo tratado como homologado/);
  assert.doesNotMatch(unverified, /Nenhum modelo homologado disponível/, "não verificado nunca se confunde com lista vazia");
  const many = renderTransversal([capability({ recipes: { status: "ok", items: Array.from({ length: 6 }, (_, i) => ({ id: `r${i}`, title: `Modelo ${i}`, summary: "s", tags: [], homologatedAt: null })) } })]);
  assert.equal((many.match(/Modelo \d/g) ?? []).length, 3);
});

test("transversal card: coexiste com os apoios internos e aparece também no checklist, sem alterar a estrutura existente", () => {
  const checklist = renderTransversal([capability()], "document_checklist");
  assert.match(checklist, /Pendências do negócio/);
  assert.match(checklist, /matrícula/);
  assert.match(checklist, /data-capability-state="habilitavel"/);
  const html = renderSpecialistWidget([{ ...legalSpecialist, availability: "available" }]);
  assert.doesNotMatch(html, /Especialistas transversais/, "sem descoberta, nenhum cartão transversal");
  assert.match(html, /Apoios contextuais/);
  assert.equal(renderTransversal([]).includes("Especialistas transversais"), false);
});

test("transversal card: sem autoridade de contratação só há recomendação, sem link, botão ou pedido inexistente", () => {
  const noAuthority = capability({
    authority: { status: "somente_consulta", reasonCode: "MEMBERSHIP_PERMISSION_MISSING" },
    nextAction: { kind: "request_approval", actionDomain: "agent_enablement", enabled: false, reason: "APPROVAL_REQUEST_NOT_IMPLEMENTED", requiredAuthority: "marketplace.subscribe", marketplaceItemId: "mkt-MKT", workspaceId: "ws-1", detailsPath: "/self-service?marketplaceItem=mkt-MKT&workspaceId=ws-1" },
  });
  const html = renderTransversal([noAuthority]);
  assert.match(html, /data-capability-state="habilitavel"/);
  assert.match(html, /data-capability-authority="somente_consulta"/);
  assert.match(html, /Marketing GPS \(MKT\)/, "a recomendação continua visível");
  assert.match(html, /Campanha de lançamento/, "modelos homologados continuam visíveis");
  assert.match(html, /cabe a um responsável comercial autorizado deste workspace/i);
  assert.match(html, /Você pode consultar os detalhes, mas não contratar/i);
  assert.match(html, /não contrata nem habilita agentes/i);
  // único link: consulta dos detalhes (Self-service), explicitamente "somente consulta"; nenhum botão, nenhum pedido inexistente
  assert.equal((html.match(/<a /g) ?? []).length, 1);
  assert.match(html, /Ver os detalhes de MKT \(somente consulta\)/);
  assert.doesNotMatch(html, /<button/);
  assert.doesNotMatch(html, /Revisar as condições|Solicitar|Contratar o|Assinar|Habilitar o agente/i);
  // sem rota de detalhes confiável (ausente ou fora do Self-service) o cartão fica só com a recomendação
  for (const detailsPath of [undefined, "/app/marketplace", "https://example.invalid/x", "/self-service?marketplaceItem=a b"]) {
    const bare = renderTransversal([{ ...noAuthority, nextAction: { ...(noAuthority.nextAction as object), detailsPath } as never }]);
    assert.doesNotMatch(bare, /<a |example\.invalid/, String(detailsPath));
  }
});

test("transversal card: autoridade é soberana do servidor - ausente, desconhecida ou incoerente com a ação falha fechado", () => {
  const withoutAuthority = renderTransversal([capability({ authority: undefined })]);
  assert.match(withoutAuthority, /data-capability-authority="somente_consulta"/);
  assert.doesNotMatch(withoutAuthority, /<a /, "habilitável sem autoridade informada não oferece caminho");
  const unknown = renderTransversal([capability({ authority: { status: "autorizado-quase" as never, reasonCode: "X" } })]);
  assert.doesNotMatch(unknown, /<a /);
  // ação de revisão sem autoridade (payload forjado ou inconsistente): continua sem link
  const forged = renderTransversal([capability({ authority: { status: "somente_consulta", reasonCode: "POLICY_NOT_GRANTED" } })]);
  assert.doesNotMatch(forged, /Ver os detalhes comerciais/, "payload de contratação com autoridade negada não vira link de contratação");
  // autoridade sem estado habilitável também não cria link
  const wrongState = renderTransversal([capability({ state: "indisponivel" })]);
  assert.doesNotMatch(wrongState, /<a /);
  const unverifiedWithAuthority = renderTransversal([capability({ state: "nao_verificado", nextAction: { kind: "none", actionDomain: null } })]);
  assert.doesNotMatch(unverifiedWithAuthority, /<a /);
});

// ---------------------------------------------------------------------------------------------
// P10-D/E: destino comercial (Self-service) e visão de autoridade; a URL nunca vale como permissão
// ---------------------------------------------------------------------------------------------

test("P10 destino comercial: só o Self-service identificando item é aceito; retorno só ao chat IMOB", () => {
  assert.equal(isSelfServiceDetailsPath("/self-service?marketplaceItem=mkt-MKT&workspaceId=ws-1"), true);
  for (const bad of ["/app/marketplace", "/self-service", "https://example.invalid/self-service?marketplaceItem=x", "//x/self-service?marketplaceItem=x", "/self-service?marketplaceItem=a b", undefined, 42]) {
    assert.equal(isSelfServiceDetailsPath(bad), false, String(bad));
  }
  // fora do navegador não há retorno a acrescentar (nunca inventa caseId)
  assert.equal(withImobReturnTo("/self-service?marketplaceItem=x"), "/self-service?marketplaceItem=x");
  assert.equal(safeImobReturnTo("/app/imob/chat?caseId=case-1"), "/app/imob/chat?caseId=case-1");
  for (const bad of ["https://example.invalid/app/imob/chat", "//example.invalid", "/app/imob/chat//x", "/app/marketplace", "/app/imob/chat?x=<a>", null, undefined]) {
    assert.equal(safeImobReturnTo(bad as never), null, String(bad));
  }
});

test("P10 Self-service: o controle de contratar só existe para quem o SERVIDOR apurou como titular (fail-closed)", () => {
  const holder = resolveCommercialAuthorityView({ ok: true, holder: { validUntil: null, limits: { allowedScopes: ["marketplace.subscribe"], maxValidityDays: 30 } }, grantor: null });
  assert.equal(holder.status, "holder");
  assert.equal(canShowSubscribeControl(holder), true);
  const consult = resolveCommercialAuthorityView({ ok: true, holder: null, grantor: null });
  assert.equal(consult.status, "consult_only");
  for (const view of [consult, resolveCommercialAuthorityView(undefined), resolveCommercialAuthorityView({ ok: false }), resolveCommercialAuthorityView({ ok: true }), resolveCommercialAuthorityView({ ok: true, holder: "yes" }), { status: "loading" } as const]) {
    assert.equal(canShowSubscribeControl(view), false);
  }
  assert.equal(resolveCommercialAuthorityView({ ok: true, holder: {} }).status, "holder", "a decisão é do servidor; limites ausentes não criam autoridade extra");
});

test("P10 Self-service: parâmetros da URL só destacam o item e o retorno; item inválido ou de outro workspace não destaca", () => {
  assert.deepEqual(parseCommercialDetailsRequest("?marketplaceItem=mkt-MKT&workspaceId=ws-1&returnTo=%2Fapp%2Fimob%2Fchat%3FcaseId%3Dc1", "ws-1"), { itemId: "mkt-MKT", workspaceMismatch: false, returnTo: "/app/imob/chat?caseId=c1" });
  assert.equal(parseCommercialDetailsRequest("?marketplaceItem=mkt-MKT&workspaceId=ws-OUTRO", "ws-1").workspaceMismatch, true);
  assert.equal(parseCommercialDetailsRequest("?marketplaceItem=../../etc&workspaceId=ws-1", "ws-1").itemId, null);
  assert.equal(parseCommercialDetailsRequest("?marketplaceItem=x&returnTo=https%3A%2F%2Fexample.invalid", "ws-1").returnTo, null);
  // nenhum parâmetro de autoridade é lido: a view vem só da resposta do servidor
  const forged = parseCommercialDetailsRequest("?marketplaceItem=x&authority=holder&canSubscribe=true", "ws-1");
  assert.deepEqual(Object.keys(forged).sort(), ["itemId", "returnTo", "workspaceMismatch"]);
});
