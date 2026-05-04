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

test("IMOB_CRM turn engine treats generic cadastro as active capture guidance instead of lead fallback", async () => {
  const params = createEngineParams({
    body: {
      message: "cadastro",
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
            ownerName: "Proprietario",
            ownerPhone: "4744444444",
            ownerEmail: "ca@gmail.com",
            ownerDocument: null,
          },
        },
      },
    },
    helpers: {
      ...createEngineParams().helpers,
      applyExistingRegistrationResolution: async ({ resolved }: any) => ({
        ...resolved,
        action: resolved.action,
      }),
    },
  });

  const resolved = await resolveImobCrmTurnEngine(params);
  assert.equal(resolved.action, "crm.capture.flow_guidance");
  assert.match((resolved as any).presentation?.text ?? "", /cadastro do propriet[aá]rio/i);
  const ctas = Array.isArray((resolved as any).presentation?.card?.ctas) ? (resolved as any).presentation.card.ctas : [];
  assert.equal(ctas[0]?.label, "Continuar proprietário");
  assert.equal(ctas.some((item: any) => item.label === "Cadastrar lead"), false);
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

test("IMOB_CRM turn engine rewrites generic duplicate-owner update choice into explicit owner update", async () => {
  let receivedMessage: string | null = null;
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
          status: "collecting",
          pendingFields: ["ownerDocument"],
          ownerDraft: {
            ownerName: "Proprietario",
            ownerPhone: "4744444444",
            ownerEmail: "ca@gmail.com",
            ownerDocument: "41741741785",
          },
        },
      },
    },
  });
  params.helpers.resolveImobOperationalUpdate = async ({ message }: any) => {
    receivedMessage = message;
    if (message === "atualizar proprietário 41741741785") {
      return {
        mode: "consult",
        action: "crm.owner.update",
        threadLabel: "Proprietário",
        conversationState: params.body.threadState,
        presentation: { text: "Cadastro atualizado. Como podemos seguir?" },
      };
    }
    return null;
  };
  params.helpers.resolveImobOperationalConsult = async () => ({
    mode: "consult",
    action: "crm.fallback",
    threadLabel: "Caso",
    conversationState: params.body.threadState,
    presentation: { text: "fallback indevido" },
  });

  const resolved = await resolveImobCrmTurnEngine(params);
  assert.equal(receivedMessage, "atualizar proprietário 41741741785");
  assert.equal(resolved.action, "crm.owner.update");
  assert.doesNotMatch((resolved as any).presentation?.text ?? "", /fallback indevido/i);
});

for (const [rawMessage, expectedMessage] of [
  ["criar novo", "criar novo proprietário Proprietario"],
  ["criar um novo", "criar novo proprietário Proprietario"],
  ["novo", "criar novo proprietário Proprietario"],
  ["novo cadastro", "criar novo proprietário Proprietario"],
  ["cadastros", "listar proprietários Proprietario"],
  ["ver cadastros", "listar proprietários Proprietario"],
  ["listar cadastros", "listar proprietários Proprietario"],
] as const) {
  test(`IMOB_CRM turn engine rewrites duplicate-owner choice '${rawMessage}' into explicit command`, async () => {
    let receivedMessage: string | null = null;
    const params = createEngineParams({
      body: {
        message: rawMessage,
        threadState: {
          mode: "consult",
          pendingSlot: "none",
          resultOffset: 0,
          slots: {},
          operational: {
            flow: "owner.create",
            status: "collecting",
            pendingFields: ["ownerDocument"],
            ownerDraft: {
              ownerName: "Proprietario",
              ownerPhone: "4744444444",
              ownerEmail: "ca@gmail.com",
              ownerDocument: "41741741785",
            },
          },
        },
      },
    });
    params.helpers.resolveImobOperationalUpdate = async ({ message }: any) => {
      receivedMessage = message;
      return null;
    };
    params.helpers.resolveImobOperationalConsult = async ({ message }: any) => {
      receivedMessage = message;
      return {
        mode: "consult",
        action: expectedMessage.startsWith("listar ") ? "crm.owner.list" : "crm.fallback",
        threadLabel: "Proprietário",
        conversationState: params.body.threadState,
        presentation: { text: expectedMessage },
      };
    };

    await resolveImobCrmTurnEngine(params);
    assert.equal(receivedMessage, expectedMessage);
  });
}

test("IMOB_CRM turn engine keeps lead dedupe rewrite working after owner choice normalization", async () => {
  let receivedMessage: string | null = null;
  const params = createEngineParams({
    body: {
      message: "novo cadastro",
      threadState: {
        mode: "consult",
        pendingSlot: "none",
        resultOffset: 0,
        slots: {},
        operational: {
          flow: "lead.qualify",
          status: "collecting",
          pendingFields: ["desiredGoal"],
          leadDraft: {
            leadName: "Lead Duplicado",
            leadPhone: "47999999999",
            leadEmail: "lead@example.com",
            desiredGoal: null,
          },
        },
      },
    },
  });
  params.helpers.resolveImobOperationalUpdate = async ({ message }: any) => {
    receivedMessage = message;
    return null;
  };
  params.helpers.resolveImobOperationalConsult = async ({ message }: any) => {
    receivedMessage = message;
    return {
      mode: "consult",
      action: "crm.lead.list",
      threadLabel: "Lead",
      conversationState: params.body.threadState,
      presentation: { text: message },
    };
  };

  await resolveImobCrmTurnEngine(params);
  assert.equal(receivedMessage, "criar novo lead Lead Duplicado");
});
