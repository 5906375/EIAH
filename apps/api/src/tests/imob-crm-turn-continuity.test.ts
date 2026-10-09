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
      if (
        operationalFlow === "proposal.create"
        || operationalFlow === "visit.schedule"
        || operationalFlow === "lead.qualify"
        || operationalFlow === "documents.collect"
      ) return operationalFlow;
      const normalizedThread = String(threadLabel ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      if (normalizedThread.includes("proposta")) return "proposal.create";
      if (normalizedThread.includes("visita")) return "visit.schedule";
      if (normalizedThread.includes("document")) return "documents.collect";
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

test("IMOB_CRM continuity preserves visit cancellation request while hydrating the active case", async () => {
  const threadState = {
    mode: "execute",
    pendingSlot: "none",
    resultOffset: 0,
    slots: {},
    operational: {
      flow: "visit.schedule",
      status: "collecting",
      pendingFields: [],
      visitDraft: {
        propertyId: "property-1",
        visitorName: "Lead 01",
        visitorPhone: "11 99999-9999",
        preferredDate: "2026-06-05",
        status: "cancel_requested",
      },
    },
  };

  const hydrated = await hydrateThreadStateWithPersistedLead({
    prisma: {
      imobCase: {
        findFirst: async () => ({
          leadId: "lead-1",
          propertyId: "property-1",
        }),
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
    message: "Cancelar visita deste caso",
    threadLabel: "Visita",
    threadState,
    helpers: createHelpers(),
  });

  assert.equal((hydrated as any).operational?.flow, "visit.schedule");
  assert.equal((hydrated as any).operational?.visitDraft?.status, "cancel_requested");
  assert.equal((hydrated as any).operational?.visitDraft?.propertyId, "property-1");
});

test("IMOB_CRM continuity preserves post-visit outcome while hydrating the active case", async () => {
  const threadState = {
    mode: "execute",
    pendingSlot: "none",
    resultOffset: 0,
    slots: {},
    operational: {
      flow: "visit.schedule",
      status: "ready_for_review",
      pendingFields: [],
      visitDraft: {
        propertyId: "property-1",
        visitorName: "Lead 01",
        visitorPhone: "11 99999-9999",
        preferredDate: "2026-06-05",
        status: "scheduled",
        outcome: "proposal_ready",
      },
    },
  };

  const hydrated = await hydrateThreadStateWithPersistedLead({
    prisma: {
      imobCase: {
        findFirst: async () => ({
          leadId: "lead-1",
          propertyId: "property-1",
        }),
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
    message: "Visita realizada e cliente quer proposta",
    threadLabel: "Visita",
    threadState,
    helpers: createHelpers(),
  });

  assert.equal((hydrated as any).operational?.flow, "visit.schedule");
  assert.equal((hydrated as any).operational?.visitDraft?.outcome, "proposal_ready");
});

test("IMOB_CRM continuity preserves proposal approval state while hydrating the active case", async () => {
  const threadState = {
    mode: "execute",
    pendingSlot: "none",
    resultOffset: 0,
    slots: {},
    operational: {
      flow: "proposal.create",
      status: "ready_for_review",
      pendingFields: [],
      proposalDraft: {
        propertyId: "property-1",
        buyerName: "Lead 01",
        buyerPhone: "11 99999-9999",
        offerAmount: 820000,
        contractType: "sale",
        approvalRequired: true,
        approvalStatus: "pending",
        negotiationStatus: "accepted",
      },
    },
  };

  const hydrated = await hydrateThreadStateWithPersistedLead({
    prisma: {
      imobCase: {
        findFirst: async () => ({
          leadId: "lead-1",
          propertyId: "property-1",
        }),
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
    message: "A proposta segue com aprovação pendente",
    threadLabel: "Proposta",
    threadState,
    helpers: createHelpers(),
  });

  assert.equal((hydrated as any).operational?.flow, "proposal.create");
  assert.equal((hydrated as any).operational?.proposalDraft?.approvalRequired, true);
  assert.equal((hydrated as any).operational?.proposalDraft?.approvalStatus, "pending");
  assert.equal((hydrated as any).operational?.proposalDraft?.negotiationStatus, "accepted");
});

test("IMOB_CRM continuity opens lead follow-up from a visit thread and preserves cadence state", async () => {
  const threadState = {
    mode: "execute",
    pendingSlot: "none",
    resultOffset: 0,
    slots: {},
    operational: {
      flow: "visit.schedule",
      status: "ready_for_review",
      pendingFields: [],
      visitDraft: {
        propertyId: "property-1",
        visitorName: "Lead 01",
        visitorPhone: "11 99999-9999",
        preferredDate: "2026-06-05",
        status: "scheduled",
        outcome: "follow_up_required",
      },
      followUpDraft: {
        status: "awaiting_response",
        trigger: "no_response",
        suggestedChannel: "whatsapp",
      },
    },
  };

  const hydrated = await hydrateThreadStateWithPersistedLead({
    prisma: {
      imobCase: {
        findFirst: async () => ({
          leadId: "lead-1",
          propertyId: "property-1",
        }),
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
    message: "Lead sem resposta no whatsapp, preciso acompanhar follow-up",
    threadLabel: "Visita",
    threadState,
    helpers: createHelpers(),
  });

  assert.equal((hydrated as any).operational?.flow, "lead.qualify");
  assert.equal((hydrated as any).operational?.leadDraft?.leadName, "Lead 01");
  assert.equal((hydrated as any).operational?.followUpDraft?.status, "awaiting_response");
  assert.equal((hydrated as any).operational?.followUpDraft?.trigger, "no_response");
  assert.equal((hydrated as any).operational?.followUpDraft?.suggestedChannel, "whatsapp");
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
  assert.equal((hydrated as any).operational?.leadStatus, "incomplete");
  assert.equal((hydrated as any).operational?.nextAction, "ask_missing_lead_field");
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

test("IMOB_CRM continuity marks persisted complete lead as qualified without reopening leadName", async () => {
  const threadState = {
    mode: "execute",
    pendingSlot: "none",
    resultOffset: 0,
    slots: {},
    operational: {
      flow: "lead.qualify",
      status: "collecting",
      pendingFields: ["leadName"],
      leadDraft: {
        leadName: null,
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
    message: "consultar caso",
    threadLabel: "Lead",
    threadState,
    helpers: createHelpers(),
  });

  assert.deepEqual((hydrated as any).operational?.pendingFields, []);
  assert.equal((hydrated as any).operational?.leadStatus, "qualified");
  assert.equal((hydrated as any).operational?.nextAction, "link_lead_to_property");
});

test("IMOB_CRM continuity promotes ready case into documents.collect on explicit document intent", async () => {
  const threadState = {
    mode: "execute",
    pendingSlot: "none",
    resultOffset: 0,
    slots: {},
    operational: {
      flow: "property.create",
      status: "ready_for_review",
      pendingFields: [],
      propertyDraft: {
        propertyType: "apartamento",
        goal: "locacao",
        city: "Itajaí",
        address: "Rua 7 de Setembro",
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
    message: "Quero revisar a documentação necessária deste caso",
    threadLabel: "Imóvel",
    threadState,
    helpers: createHelpers(),
  });

  assert.equal((hydrated as any).operational?.flow, "documents.collect");
  assert.equal((hydrated as any).operational?.status, "ready_for_review");
});


import { buildProposalReviewQuestion } from "../services/imob/crm/imobProposalReviewContinuity";
import { parseImobCrmThreadState } from "../services/imob/crm/imobCrmTurnState";
import { createNextImobOperationalState, createNextImobThreadState } from "../services/imob/imobConversationState";
import { createEmptyImobSlots } from "../services/imob/imobConversationContract";

function reviewState() {
  const operational: any = { flow: "proposal.create", status: "ready_for_review", pendingFields: [],
    proposalDraft: { buyerName: "Maria", buyerPhone: "47999998888", buyerEmail: null,
      propertyId: "property-1", offerAmount: 100000, contractType: "sale", counterofferAmount: 0,
      negotiationStatus: "accepted", approvalRequired: true, approvalStatus: "pending" } };
  operational.continuity = buildProposalReviewQuestion({ operational, caseId: "case-1", threadId: "thread-1", contextRef: "v1:interaction-test",
    tenantId: "tenant-1", workspaceId: "workspace-1" });
  return { mode: "execute", pendingSlot: "none", resultOffset: 0, slots: createEmptyImobSlots(), operational } as any;
}

for (const phase of ["review", "clarification"] as const) {
  test(`FDC-03A round-trip JSON → parsing → hidratação → evolução preserva ${phase}`, async () => {
    const input = reviewState();
    input.operational.continuity = buildProposalReviewQuestion({ operational: input.operational, caseId: "case-1", threadId: "thread-1", contextRef: "v1:interaction-test",
      tenantId: "tenant-1", workspaceId: "workspace-1", phase });
    const parsed = parseImobCrmThreadState({ threadState: JSON.parse(JSON.stringify(input)) })!;
    const hydrated = await hydrateThreadStateWithPersistedLead({
      prisma: { imobCase: { findFirst: async () => ({ leadId: "lead-1" }) },
        imobLead: { findFirst: async () => ({ name: "Maria", phone: "47999998888" }) } },
      tenantId: "tenant-1", workspaceId: "workspace-1", caseId: "case-1", threadLabel: "Proposta",
      message: "continuar proposta", threadState: parsed, helpers: createHelpers(),
    }) as any;
    assert.deepEqual(hydrated.operational.continuity, input.operational.continuity);
    const evolved = createNextImobOperationalState(hydrated.operational, "proposal", "continuar proposta", createEmptyImobSlots());
    assert.deepEqual(evolved!.continuity, input.operational.continuity);
    assert.deepEqual(evolved!.proposalDraft, input.operational.proposalDraft);
    assert.deepEqual(createNextImobThreadState(hydrated, "continuar proposta").operational?.continuity, input.operational.continuity);
  });
}

for (const scenario of ["unknown_version", "expired", "changed_draft", "new_flow", "answered"] as const) {
  test(`FDC-03A parsing/hidratação invalidam ${scenario} explicitamente, preservando draft`, async () => {
    const input = reviewState();
    const draft = structuredClone(input.operational.proposalDraft);
    if (scenario === "unknown_version") input.operational.continuity.version = "v2";
    if (scenario === "expired") input.operational.continuity.pending.expiresAt = "2000-01-01T00:00:00.000Z";
    if (scenario === "changed_draft") input.operational.proposalDraft.offerAmount = 99999;
    if (scenario === "new_flow") input.operational.flow = "documents.collect";
    if (scenario === "answered") input.operational.continuity.pending = null;
    const parsed = parseImobCrmThreadState({ threadState: input })!;
    const hydrated = await hydrateThreadStateWithPersistedLead({ prisma: {}, tenantId: "tenant-1", workspaceId: "workspace-1",
      message: "sim", threadState: input, helpers: { ...createHelpers(), detectOperationalHydrationFlow: () => null } }) as any;
    if (scenario === "answered") {
      assert.equal(parsed.operational.continuity.pending, null);
      assert.equal(hydrated.operational.continuity.pending, null);
    } else {
      assert.equal(parsed.operational.continuity, null);
      assert.equal(hydrated.operational.continuity, null);
    }
    assert.deepEqual(hydrated.operational.proposalDraft, scenario === "changed_draft" ? { ...draft, offerAmount: 99999 } : draft);
  });
}

test("FDC-03A evolução troca draft/flow e invalida a pergunta anterior", () => {
  const input = reviewState();
  const revised = createNextImobOperationalState(input.operational, "proposal", "valor da oferta 90000", createEmptyImobSlots());
  assert.equal(revised!.proposalDraft!.offerAmount, 90000);
  assert.equal(revised!.continuity, null);
  const other = createNextImobOperationalState(input.operational, "documents", "coletar documentos", createEmptyImobSlots());
  assert.equal(other?.continuity, undefined);
});
