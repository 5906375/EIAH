import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

import { ImobWaitingOnBoard } from "./ImobWaitingOnBoard";
import type { ImobWaitingOnBucket } from "@/lib/api";

test("IMOB waiting on board renders grouped buckets and action CTA", () => {
  const items: ImobWaitingOnBucket[] = [
    {
      waitingOn: "legal",
      total: 2,
      items: [
        {
          caseId: "case-legal",
          threadId: "thread-legal",
          title: "Resolver documentação",
          priorityScore: 10,
          urgency: "high",
          followUpRisk: "medium",
          waitingOn: "legal",
          agingHours: 32,
          currentObjective: "Liberar contrato",
          nextStep: "Cobrar documento",
          autoprompt: "objetivo atual: Liberar contrato",
        },
      ],
    },
  ];

  const html = renderToStaticMarkup(
    <MemoryRouter>
      <ImobWaitingOnBoard items={items} buildHref={(item) => `/app/imob/chat?caseId=${item.caseId}`} />
    </MemoryRouter>,
  );

  assert.match(html, /Waiting On/);
  assert.match(html, /Legal/);
  assert.match(html, /Agir Agora/);
});
