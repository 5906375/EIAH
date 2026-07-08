import test from "node:test";
import assert from "node:assert/strict";

import { buildImobCrmBusinessReadHelpers } from "../services/imob/crm/imobCrmBusinessRead";

function createThreadState() {
  return {
    mode: "consult",
    pendingSlot: "none",
    resultOffset: 0,
    slots: {},
    operational: null,
  };
}

test("IMOB_CRM business read helper builds governed workspace case list from existing case records", () => {
  const helpers = buildImobCrmBusinessReadHelpers({
    asObject: (value: unknown) => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null),
    asString: (value: unknown) => (typeof value === "string" && value.trim().length > 0 ? value.trim() : null),
    asStringList: (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [],
    normalizeImobRouteText: (value: string) => value.toLowerCase(),
    formatBudgetCentsForImob: () => null,
    formatImobStatusLabel: (status: string | null | undefined) => status ?? "desconhecido",
    formatImobPendingList: (items: string[] | null | undefined) => (items ?? []).join(", "),
    formatImobCaseFlowLabel: (flow: string) => flow,
    titleCaseRouteWords: (value: string) => value,
    createEmptyThreadState: createThreadState as any,
    resolveImobBackingSpecialists: () => [],
    buildImobCanonicalCase: () => ({
      journeyType: "lead_qualification",
      partyRole: "lead",
      commercialGoal: "locacao",
      recommendedActions: [],
      blockedActions: [],
      missingContext: [],
      reasonCodes: [],
    }),
    resolveBusinessReadIntent: () => "workspace_case_list",
  });

  const resolved = helpers.buildWorkspaceCaseListConsult({
    items: [
      {
        id: "case-1",
        flow: "lead.qualify",
        stage: "ready_for_review",
        status: "ready_for_review",
        ownerResponsible: "Corretor",
        nextStep: "qualificar lead deste caso",
        pendingItems: [],
        blockers: [],
        threadId: "thread-1",
        lead: { id: "lead-1", name: "Merlo" } as any,
      },
      {
        id: "case-2",
        flow: "contract.prepare",
        stage: "documentacao",
        status: "running",
        ownerResponsible: "Corretor",
        nextStep: "revisar documentos",
        pendingItems: ["matrícula"],
        blockers: [],
        threadId: "thread-2",
        owner: { id: "owner-1", name: "João" } as any,
      },
    ],
    threadState: createThreadState(),
  });

  assert.equal(resolved?.action, "crm.case.workspace_case_list");
  assert.match(resolved?.presentation?.text ?? "", /2 casos recentes no workspace atual/i);
  assert.match(resolved?.presentation?.card?.lines?.[0] ?? "", /case-1/i);
  assert.equal(resolved?.presentation?.card?.ctas?.[0]?.label, "Abrir caso mais recente");
});
