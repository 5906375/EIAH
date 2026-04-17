import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

import { ImobApprovalContextCard } from "./ImobApprovalContextCard";
import type { ImobApprovalContextItem } from "@/lib/api";

test("IMOB approval context card renders governance tags and CTA", () => {
  const items: ImobApprovalContextItem[] = [
    {
      caseId: "case-1",
      threadId: "thread-1",
      specialistId: "guardian",
      reasonCode: "AUDIT_BLOCKER",
      reasonLabel: "Bloqueio de auditoria/evidência",
      category: "audit",
      requiresApproval: true,
      requiresEvidence: true,
      evidenceCount: 0,
      humanJourneyPhase: "fechamento",
      waitingOn: "legal",
      urgency: "high",
      agingHours: 26,
      currentObjective: "Fechar o caso com trilha auditável",
      nextStep: "Revisar evidências",
      suggestedAction: "Garantir evidências antes do fechamento",
      priorityScore: 14,
      autoprompt: "objetivo atual: Fechar o caso com trilha auditável",
    },
  ];

  const html = renderToStaticMarkup(
    <MemoryRouter>
      <ImobApprovalContextCard items={items} buildHref={(item) => `/app/imob/chat?caseId=${item.caseId}`} />
    </MemoryRouter>,
  );

  assert.match(html, /Approvals contextuais/);
  assert.match(html, /approval/);
  assert.match(html, /evidence/);
  assert.match(html, /Aprovar/);
  assert.match(html, /Delegar/);
  assert.match(html, /Escalar/);
  assert.match(html, /Abrir aprovação/);
});
