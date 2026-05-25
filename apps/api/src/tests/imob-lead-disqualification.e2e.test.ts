import test from "node:test";
import assert from "node:assert/strict";

import { buildImobCaseContextV1 } from "../services/imob/crm/imobCaseContextBuilder";

test("IMOB E2E preserves lead disqualification reason in the active case", () => {
  const context = buildImobCaseContextV1({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    caseId: "case-1",
    caseContext: {
      caseId: "case-1",
      flow: "lead.qualify",
      lead: {
        id: "lead-1",
        name: "Maria",
        status: "disqualified",
        disqualificationReason: "orcamento fora da faixa",
        goal: "locacao",
        targetCity: "Itapema",
        budgetMaxCents: 350000,
      },
    },
    operational: {
      flow: "lead.qualify",
      leadDraft: {
        leadName: "Maria",
        leadPhone: "47999998888",
        desiredGoal: "locacao",
        desiredCity: "Itapema",
        budgetMax: 3500,
      },
    },
  });

  assert.equal(context.leadLifecycle?.status, "disqualified");
  assert.equal(context.canonicalCaseState?.nextAction.reasonCode, "LEAD_DISQUALIFIED");
  assert.match(context.recoverySnapshot?.primaryAction?.label ?? "", /desqualifica/i);
});
