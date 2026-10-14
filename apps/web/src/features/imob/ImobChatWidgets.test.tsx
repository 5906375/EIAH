import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ImobChatWidgets } from "./ImobChatWidgets";
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
    nextAction: { kind: "enable_agent", actionDomain: "agent_enablement", requiresHumanConfirmation: true, marketplaceItemId: "mkt-MKT", path: "/app/marketplace" },
    ...over,
  };
}

function renderTransversal(items: ImobTransversalCapability[], kind: "case_summary" | "document_checklist" = "case_summary") {
  const widget: ImobPresentationWidget = kind === "case_summary"
    ? { kind, title: "Resumo do negócio", journeyLabel: "Captação", stageLabel: "Anúncio", nextStep: "Ativar anúncio", blocker: null, recommendedActions: [], specialists: [], transversalCapabilities: items }
    : { kind, title: "Pendências do negócio", checklist: ["matrícula"], blocker: null, nextStep: null, specialists: [], transversalCapabilities: items };
  return renderToStaticMarkup(<ImobChatWidgets widget={widget} onAction={() => {}} />);
}

test("transversal card: habilitável mostra especialidade, agente, capacidades, modelos, condições e a ação de habilitar agente", () => {
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
  assert.match(html, /<a href="\/app\/marketplace"[^>]*>Revisar e habilitar o agente no Marketplace<\/a>/);
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
  const foreignTarget = renderTransversal([capability({ nextAction: { kind: "enable_agent", actionDomain: "agent_enablement", requiresHumanConfirmation: true, marketplaceItemId: "x", path: "https://example.invalid/enable" } })]);
  assert.doesNotMatch(foreignTarget, /<a |example\.invalid/);
  const noRecipes = renderTransversal([capability({ recipes: undefined as never, provider: null })]);
  assert.match(noRecipes, /data-capability-state="habilitavel"/);
});

test("transversal card: modelos - lista vazia e não verificados são distintos; lista longa é limitada", () => {
  const empty = renderTransversal([capability({ recipes: { status: "ok", items: [] } })]);
  assert.match(empty, /Nenhum modelo homologado disponível para este workspace/);
  const unverified = renderTransversal([capability({ recipes: { status: "nao_verificado", items: [] } })]);
  assert.match(unverified, /Modelos homologados: não verificados/);
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
