import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

import { ImobPriorityQueue } from "./ImobPriorityQueue";
import type { ImobPriorityQueueItem } from "@/lib/api";

test("IMOB priority queue renders cards and Agir Agora CTA", () => {
  const items: ImobPriorityQueueItem[] = [
    {
      caseId: "case-1",
      threadId: "thread-1",
      title: "Retomar proposta",
      priorityScore: 12,
      urgency: "high",
      followUpRisk: "high",
      waitingOn: "lead",
      agingHours: 54,
      currentObjective: "Fechar proposta",
      nextStep: "Ligar para o lead",
      autoprompt: "objetivo atual: Fechar proposta",
    },
  ];

  const html = renderToStaticMarkup(
    <MemoryRouter>
      <ImobPriorityQueue items={items} buildHref={(item) => `/app/imob/chat?caseId=${item.caseId}`} />
    </MemoryRouter>,
  );

  assert.match(html, /Fila priorizada/);
  assert.match(html, /Retomar proposta/);
  assert.match(html, /Agir Agora/);
});
