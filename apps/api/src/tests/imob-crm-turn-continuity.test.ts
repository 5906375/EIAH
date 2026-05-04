import test from "node:test";
import assert from "node:assert/strict";
import { hydrateThreadStateWithPersistedLead } from "../services/imob/crm/imobCrmTurnContinuity";

function createHelpers() {
  return {
    asObject: (value: unknown) => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null),
    asString: (value: unknown) => (typeof value === "string" && value.trim().length > 0 ? value.trim() : null),
    asStringList: (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : []),
    createEmptyThreadState: () => ({ mode: "consult", pendingSlot: "none", resultOffset: 0, slots: {}, operational: null }),
    cloneImobResolvedTurn: <T>(value: T) => JSON.parse(JSON.stringify(value)) as T,
    detectOperationalHydrationFlow: (_message: string, threadLabel?: string | null, operationalFlow?: string | null) => {
      if (operationalFlow === "proposal.create" || operationalFlow === "visit.schedule" || operationalFlow === "lead.qualify") return operationalFlow;
      const normalizedThread = String(threadLabel ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      if (normalizedThread.includes("proposta")) return "proposal.create";
      if (normalizedThread.includes("visita")) return "visit.schedule";
      if (normalizedThread.includes("lead")) return "lead.qualify";
      return null;
    },
    extractLeadNameFromMessage: () => null,
    extractLeadEmailFromMessage: () => null,
    extractLeadPhoneFromMessage: () => null,
    buildOwnerPendingSuggestion: () => null,
    buildPropertyPendingSuggestion: () => null,
    buildLeadPendingSuggestion: () => null,
  };
}

test("IMOB_CRM continuity promotes qualified lead case into visit.schedule on explicit visit intent", async () => {
  const threadState = {
    mode: "execute",
    pendingSlot: "none",
    resultOffset: 0,
    slots: {},
    operational: {
      flow: "lead.qualify",
      status: "ready_for_review",
      pendingFields: [],
      leadDraft: {
        leadName: "Lead 01",
        leadPhone: "11 99999-9999",
        desiredGoal: "locacao",
        desiredCity: "Itapema",
        budgetMax: 10000,
      },
    },
  };

  const hydrated = await hydrateThreadStateWithPersistedLead({
    prisma: {
      imobCase: {
        findFirst: async () => ({ leadId: "lead-1", propertyId: "property-1" }),
      },
      imobLead: {
        findFirst: async () => ({
          name: "Lead 01",
          email: "lead01@gmail.com",
          phone: "11 99999-9999",
          goal: "locacao",
          targetCity: "Itapema",
          budgetMaxCents: 1000000,
        }),
      },
    },
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    caseId: "case-1",
    message: "Quero agendar uma visita para este caso",
    threadLabel: "Lead",
    threadState,
    helpers: createHelpers(),
  });

  assert.equal((hydrated as any).operational?.flow, "visit.schedule");
  assert.equal((hydrated as any).operational?.visitDraft?.propertyId, "property-1");
  assert.equal((hydrated as any).operational?.visitDraft?.visitorName, "Lead 01");
  assert.equal((hydrated as any).operational?.visitDraft?.visitorPhone, "11 99999-9999");
  assert.deepEqual((hydrated as any).operational?.pendingFields, ["preferredDate"]);
});

test("IMOB_CRM continuity keeps lead.qualify when there are real pending lead fields", async () => {
  const threadState = {
    mode: "execute",
    pendingSlot: "none",
    resultOffset: 0,
    slots: {},
    operational: {
      flow: "lead.qualify",
      status: "collecting",
      pendingFields: ["leadPhone"],
      leadDraft: {
        leadName: "Lead 01",
        leadPhone: null,
        desiredGoal: "locacao",
        desiredCity: "Itapema",
        budgetMax: 10000,
      },
    },
  };

  const hydrated = await hydrateThreadStateWithPersistedLead({
    prisma: {
      imobCase: {
        findFirst: async () => ({ leadId: "lead-1", propertyId: "property-1" }),
      },
      imobLead: {
        findFirst: async () => ({
          name: "Lead 01",
          email: "lead01@gmail.com",
          phone: null,
          goal: "locacao",
          targetCity: "Itapema",
          budgetMaxCents: 1000000,
        }),
      },
    },
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    caseId: "case-1",
    message: "Quero agendar uma visita para este caso",
    threadLabel: "Lead",
    threadState,
    helpers: createHelpers(),
  });

  assert.equal((hydrated as any).operational?.flow, "lead.qualify");
  assert.ok(Array.isArray((hydrated as any).operational?.pendingFields));
});

test("IMOB_CRM continuity opens visit.schedule without linked property but keeps clear visit pending fields", async () => {
  const threadState = {
    mode: "execute",
    pendingSlot: "none",
    resultOffset: 0,
    slots: {},
    operational: {
      flow: "lead.qualify",
      status: "ready_for_review",
      pendingFields: [],
      leadDraft: {
        leadName: "Lead 01",
        leadPhone: "11 99999-9999",
        desiredGoal: "locacao",
        desiredCity: "Itapema",
        budgetMax: 10000,
      },
    },
  };

  const hydrated = await hydrateThreadStateWithPersistedLead({
    prisma: {
      imobCase: {
        findFirst: async () => ({ leadId: "lead-1", propertyId: null }),
      },
      imobLead: {
        findFirst: async () => ({
          name: "Lead 01",
          email: "lead01@gmail.com",
          phone: "11 99999-9999",
          goal: "locacao",
          targetCity: "Itapema",
          budgetMaxCents: 1000000,
        }),
      },
    },
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    caseId: "case-1",
    message: "Quero agendar uma visita para este caso",
    threadLabel: "Lead",
    threadState,
    helpers: createHelpers(),
  });

  assert.equal((hydrated as any).operational?.flow, "visit.schedule");
  assert.deepEqual((hydrated as any).operational?.pendingFields, ["propertyId", "preferredDate"]);
});
