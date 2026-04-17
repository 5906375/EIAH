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
