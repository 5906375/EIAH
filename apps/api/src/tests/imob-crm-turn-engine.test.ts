import test from "node:test";
import assert from "node:assert/strict";
import { resolveImobCrmTurnEngine } from "../services/imob/crm/imobCrmTurnEngine";

function createEngineParams(overrides?: Partial<any>) {
  const baseState = {
    mode: "execute",
    pendingSlot: "none",
    resultOffset: 0,
    slots: {},
    operational: {
      flow: "owner.create",
      status: "collecting",
      pendingFields: ["ownerDocument"],
      ownerDraft: {
        ownerName: "Ca",
        ownerPhone: "4744444444",
        ownerEmail: "ca@gmail.com",
        ownerDocument: null,
      },
    },
  };

  const helpers: any = {
    asString: (value: unknown) => (typeof value === "string" && value.trim().length > 0 ? value.trim() : null),
    hydrateThreadStateWithPersistedLead: async ({ threadState }: any) => threadState,
    resolveImobOperationalUpdate: async () => null,
    resolveImobOperationalConsult: async () => null,
    applyCanonicalJourneyToResolvedData: (data: any) => data,
    applyExistingRegistrationResolution: async () => ({
      mode: "execute",
      action: "crm.from-resolve-turn",
      threadLabel: "Proprietário",
      conversationState: baseState,
      presentation: { text: "continuidade do fluxo ativo" },
    }),
    injectResolvedPendingSuggestion: (resolved: any) => resolved,
    upsertImobCaseFromResolvedTurn: async () => null,
    normalizeImobRouteText: (value: string) => value.toLowerCase(),
    formatImobCaseFlowLabel: (flow: string) => flow,
  };

  return {
    prisma: {},
    authContext: { tenantId: "tenant-1", workspaceId: "workspace-1", userId: "user-1" },
    body: { message: "mostrar bloqueios do caso", threadState: baseState },
    workspaceResponsibleLabel: "Corretor",
    entitlements: { REAL_ESTATE_CORE: true },
    helpers,
    ...overrides,
  };
}

test("IMOB_CRM turn engine prioriza leitura consultiva forte antes da continuidade de intake", async () => {
  let consultCalls = 0;
  const params = createEngineParams();
  params.helpers.resolveImobOperationalConsult = async () => {
    consultCalls += 1;
    return {
      mode: "consult",
      action: "crm.case.blocked_run_resolution",
      threadLabel: "Caso",
      conversationState: params.body.threadState,
      presentation: { text: "leitura consultiva" },
    };
  };

  const resolved = await resolveImobCrmTurnEngine(params);
  assert.equal(consultCalls, 1);
  assert.equal(resolved.action, "crm.case.blocked_run_resolution");
  assert.match((resolved as any).presentation?.text ?? "", /leitura consultiva/i);
});

test("IMOB_CRM turn engine usa leitura consultiva quando não há fluxo ativo com pendências", async () => {
  let consultCalls = 0;
  const params = createEngineParams({
    body: { message: "mostrar bloqueios do caso", threadState: { mode: "consult", pendingSlot: "none", resultOffset: 0, slots: {}, operational: null } },
  });
  params.helpers.resolveImobOperationalConsult = async () => {
    consultCalls += 1;
    return {
      mode: "consult",
      action: "crm.case.blocked_run_resolution",
      threadLabel: "Caso",
      conversationState: params.body.threadState,
      presentation: { text: "leitura consultiva" },
    };
  };

  const resolved = await resolveImobCrmTurnEngine(params);
  assert.equal(consultCalls, 1);
  assert.equal(resolved.action, "crm.case.blocked_run_resolution");
});

test("IMOB_CRM turn engine prioriza comando operacional explícito antes da leitura consultiva", async () => {
  let consultCalls = 0;
  const params = createEngineParams({
    body: {
      message: "cadastrar proprietário deste caso",
      threadState: {
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
            goal: "venda",
            city: "Balneário Camboriú",
            address: "Rua Alvin Bauer, 1212",
          },
        },
      },
    },
  });
  params.helpers.resolveImobOperationalConsult = async () => {
    consultCalls += 1;
    return {
      mode: "consult",
      action: "case.status",
      threadLabel: "Caso",
      conversationState: params.body.threadState,
      presentation: { text: "leitura consultiva" },
    };
  };

  const resolved = await resolveImobCrmTurnEngine(params);
  assert.equal(consultCalls, 0);
  assert.equal(resolved.action, "crm.from-resolve-turn");
});

test("IMOB_CRM turn engine mantém continuidade de intake para mensagens não consultivas", async () => {
  let consultCalls = 0;
  const params = createEngineParams({
    body: {
      message: "segue com esse cadastro",
      threadState: {
        mode: "execute",
        pendingSlot: "none",
        resultOffset: 0,
        slots: {},
        operational: {
          flow: "owner.create",
          status: "collecting",
          pendingFields: ["ownerDocument"],
          ownerDraft: {
            ownerName: "Ca",
            ownerPhone: "4744444444",
            ownerEmail: "ca@gmail.com",
            ownerDocument: null,
          },
        },
      },
    },
  });
  params.helpers.resolveImobOperationalConsult = async () => {
    consultCalls += 1;
    return {
      mode: "consult",
      action: "crm.case.blocked_run_resolution",
      threadLabel: "Caso",
      conversationState: params.body.threadState,
      presentation: { text: "leitura consultiva" },
    };
  };

  const resolved = await resolveImobCrmTurnEngine(params);
  assert.equal(consultCalls, 0);
  assert.equal(resolved.action, "crm.from-resolve-turn");
  assert.match((resolved as any).presentation?.text ?? "", /continuidade do fluxo ativo/i);
});

test("IMOB_CRM turn engine preserves lead discovery capture during active qualification", async () => {
  const params = createEngineParams({
    body: {
      message: "preciso mudar este mês, quero home office e vou decidir com minha esposa",
      threadState: {
        mode: "execute",
        pendingSlot: "none",
        resultOffset: 0,
        slots: {},
        operational: {
          flow: "lead.qualify",
          status: "collecting",
          pendingFields: ["leadPhone"],
          leadDraft: {
            leadPersona: "lead",
            leadName: "Maria",
            leadPhone: null,
            leadEmail: "maria@example.com",
            desiredGoal: "locacao",
            desiredCity: "Itapema",
            budgetMax: 3500,
          },
        },
      },
    },
    helpers: {
      ...createEngineParams().helpers,
      applyExistingRegistrationResolution: async ({ resolved }: any) => ({
        ...resolved,
        action: "crm.from-resolve-turn",
      }),
    },
  });

  const resolved = await resolveImobCrmTurnEngine(params);
  assert.equal((resolved as any).conversationState?.operational?.flow, "lead.qualify");
  assert.equal((resolved as any).conversationState?.operational?.leadDraft?.discoverySignals?.urgency, "high");
  assert.equal((resolved as any).conversationState?.operational?.leadDraft?.discoverySignals?.decisionMaker, "shared");
  assert.match((resolved as any).presentation?.caseBrief?.summary ?? "", /home office|urgência alta/i);
});

test("IMOB_CRM turn engine contextualizes 'cadastros' from pending owner dedupe into owner list consult", async () => {
  let consultMessage: string | null = null;
  const params = createEngineParams({
    body: {
      message: "cadastros",
      threadState: {
        mode: "consult",
        pendingSlot: "none",
        resultOffset: 0,
        slots: {},
        operational: {
          flow: "owner.create",
          status: "awaiting_dedupe_decision",
          pendingFields: ["ownerDocument"],
          ownerDraft: {
            ownerName: "Proprietario",
            ownerPhone: "4744444444",
            ownerEmail: "ca@gmail.com",
            ownerDocument: null,
          },
          dedupeDecision: {
            status: "pending",
            flow: "owner.create",
            entityType: "owner",
            entityId: "owner-1",
            entityLabel: "Proprietario",
          },
        },
      },
    },
  });
  params.helpers.resolveImobOperationalConsult = async ({ message }: any) => {
    consultMessage = message;
    return {
      mode: "consult",
      action: "crm.owner.list",
      threadLabel: "Proprietário",
      conversationState: params.body.threadState,
      presentation: { text: "lista contextualizada" },
    };
  };

  const resolved = await resolveImobCrmTurnEngine(params);
  assert.equal(consultMessage, "listar proprietários Proprietario");
  assert.equal(resolved.action, "crm.owner.list");
});

test("IMOB_CRM turn engine contextualizes 'atualizar existente' from pending owner dedupe into direct owner edit", async () => {
  let updateMessage: string | null = null;
  const params = createEngineParams({
    body: {
      message: "atualizar existente",
      threadState: {
        mode: "consult",
        pendingSlot: "none",
        resultOffset: 0,
        slots: {},
        operational: {
          flow: "owner.create",
          status: "awaiting_dedupe_decision",
          pendingFields: ["ownerDocument"],
          ownerDraft: {
            ownerName: "Proprietario",
            ownerPhone: "4744444444",
            ownerEmail: "ca@gmail.com",
            ownerDocument: null,
          },
          dedupeDecision: {
            status: "pending",
            flow: "owner.create",
            entityType: "owner",
            entityId: "owner-1",
            entityLabel: "Proprietario",
          },
        },
      },
    },
  });
  params.helpers.resolveImobOperationalUpdate = async ({ message }: any) => {
    updateMessage = message;
    return {
      mode: "consult",
      action: "crm.owner.update",
      threadLabel: "Proprietário",
      conversationState: params.body.threadState,
      presentation: { text: "edição contextualizada" },
    };
  };

  const resolved = await resolveImobCrmTurnEngine(params);
  assert.equal(updateMessage, "editar proprietário owner-1");
  assert.equal(resolved.action, "crm.owner.update");
});

test("IMOB_CRM turn engine blocks owner dedupe update fail-closed when matched entity id is missing", async () => {
  const params = createEngineParams({
    body: {
      message: "atualizar existente",
      threadState: {
        mode: "consult",
        pendingSlot: "none",
        resultOffset: 0,
        slots: {},
        operational: {
          flow: "owner.create",
          status: "awaiting_dedupe_decision",
          pendingFields: ["ownerDocument"],
          ownerDraft: {
            ownerName: "Proprietario",
            ownerPhone: "4744444444",
            ownerEmail: "ca@gmail.com",
            ownerDocument: null,
          },
          dedupeDecision: {
            status: "pending",
            flow: "owner.create",
            entityType: "owner",
            entityId: null,
            entityLabel: "Proprietario",
          },
        },
      },
    },
  });

  const resolved = await resolveImobCrmTurnEngine(params);
  assert.equal(resolved.mode, "blocked");
  assert.equal(resolved.action, "crm.workflow.blocked");
  assert.equal((resolved as any).presentation?.metadata?.workflowReasonCode, "owner_dedupe_missing_match");
});

test("IMOB_CRM turn engine blocks visit scheduling when property is not linked", async () => {
  const params = createEngineParams({
    body: {
      message: "vamos avançar para visita",
      threadState: {
        mode: "execute",
        pendingSlot: "none",
        resultOffset: 0,
        slots: {},
        operational: {
          flow: "visit.schedule",
          status: "ready_for_review",
          pendingFields: [],
          visitDraft: {
            visitorName: "Maria",
            visitorPhone: "47999999999",
            preferredDate: "amanha",
            preferredWindow: "tarde",
            propertyId: null,
          },
        },
      },
    },
  });

  const resolved = await resolveImobCrmTurnEngine(params);
  assert.equal(resolved.mode, "blocked");
  assert.equal(resolved.action, "crm.workflow.blocked");
  assert.equal((resolved as any).presentation?.metadata?.workflowReasonCode, "visit_missing_property");
});

test("IMOB_CRM turn engine does not reopen lead qualification when there are no pending fields", async () => {
  const params = createEngineParams({
    body: {
      message: "continuar",
      threadState: {
        mode: "execute",
        pendingSlot: "none",
        resultOffset: 0,
        slots: {},
        operational: {
          flow: "lead.qualify",
          status: "ready_for_review",
          pendingFields: [],
          leadDraft: {
            leadName: "Maria",
            leadPhone: "47999999999",
            leadEmail: "maria@example.com",
            desiredGoal: "locacao",
            desiredCity: "Itapema",
            budgetMax: 3500,
          },
        },
      },
    },
  });

  const resolved = await resolveImobCrmTurnEngine(params);
  assert.equal(resolved.mode, "blocked");
  assert.equal(resolved.action, "crm.workflow.blocked");
  assert.equal((resolved as any).presentation?.metadata?.workflowReasonCode, "lead_already_qualified");
});
