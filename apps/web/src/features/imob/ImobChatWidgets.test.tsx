import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ImobChatWidgets } from "./ImobChatWidgets";
import type { ImobPresentationWidget } from "@/lib/api";

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
