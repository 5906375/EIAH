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
