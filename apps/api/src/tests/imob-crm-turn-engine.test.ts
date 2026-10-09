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

function makePendingAction(overrides?: Partial<any>) {
  return {
    actionId: "owner.register",
    sourceActionId: "owner.register",
    caseId: "case-1",
    threadId: "thread-1",
    reasonCode: "PENDING_ITEMS_PRESENT",
    status: "awaiting_confirmation",
    createdAt: "2026-06-25T10:00:00.000Z",
    expiresAt: null,
    entityType: "owner",
    journey: "property_capture",
    source: "command-center",
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

test("IMOB_CRM turn engine confirma ação pendente canônica de proprietário com 'confirmo'", async () => {
  let upsertCalls = 0;
  const params = createEngineParams({
    body: {
      message: "confirmo",
      caseId: "case-1",
      threadId: "thread-1",
      canonicalPendingAction: makePendingAction(),
      threadState: {
        mode: "execute",
        pendingSlot: "none",
        resultOffset: 0,
        slots: {},
        operational: {
          flow: "owner.create",
          status: "ready_for_review",
          pendingFields: [],
          pendingAction: makePendingAction(),
        },
      },
    },
  });
  params.helpers.upsertImobCaseFromResolvedTurn = async () => {
    upsertCalls += 1;
    return { caseId: "case-1", threadId: "thread-1" };
  };

  const resolved = await resolveImobCrmTurnEngine(params);
  assert.equal(upsertCalls, 1);
  assert.equal(resolved.mode, "execute");
  assert.equal(resolved.action, "realestate.register_property");
  assert.equal((resolved as any).executionRequest?.operation, "owner.create");
  assert.equal((resolved as any).executionRequest?.input?.actionId, "owner.register");
  assert.equal((resolved as any).executionRequest?.input?.threadId, "thread-1");
  assert.equal((resolved as any).conversationState?.operational?.pendingAction?.status, "confirmed");
});

test("IMOB_CRM turn engine confirma ação pendente canônica de imóvel com 'confirmo'", async () => {
  const params = createEngineParams({
    body: {
      message: "confirmo",
      caseId: "case-2",
      threadId: "thread-2",
      canonicalPendingAction: makePendingAction({
        actionId: "property.create",
        sourceActionId: "property.create",
        caseId: "case-2",
        threadId: "thread-2",
        entityType: "property",
      }),
      threadState: {
        mode: "execute",
        pendingSlot: "none",
        resultOffset: 0,
        slots: {},
        operational: {
          flow: "property.create",
          status: "ready_for_review",
          pendingFields: [],
          pendingAction: makePendingAction({
            actionId: "property.create",
            sourceActionId: "property.create",
            caseId: "case-2",
            threadId: "thread-2",
            entityType: "property",
          }),
        },
      },
    },
  });

  const resolved = await resolveImobCrmTurnEngine(params);
  assert.equal(resolved.mode, "execute");
  assert.equal(resolved.action, "realestate.register_property");
  assert.equal((resolved as any).executionRequest?.operation, "property.create");
  assert.equal((resolved as any).executionRequest?.input?.actionId, "property.create");
});

test("IMOB_CRM turn engine confirma ação pendente canônica de visita com 'confirmo'", async () => {
  const params = createEngineParams({
    body: {
      message: "confirmo",
      caseId: "case-3",
      threadId: "thread-3",
      canonicalPendingAction: makePendingAction({
        actionId: "visit.schedule",
        sourceActionId: "visit.schedule",
        caseId: "case-3",
        threadId: "thread-3",
        entityType: "visit",
        journey: "visit_follow_up",
      }),
      threadState: {
        mode: "execute",
        pendingSlot: "none",
        resultOffset: 0,
        slots: {},
        operational: {
          flow: "visit.schedule",
          status: "ready_for_review",
          pendingFields: [],
          pendingAction: makePendingAction({
            actionId: "visit.schedule",
            sourceActionId: "visit.schedule",
            caseId: "case-3",
            threadId: "thread-3",
            entityType: "visit",
            journey: "visit_follow_up",
          }),
        },
      },
    },
  });

  const resolved = await resolveImobCrmTurnEngine(params);
  assert.equal(resolved.mode, "execute");
  assert.equal(resolved.action, "realestate.schedule_visit");
  assert.equal((resolved as any).executionRequest?.operation, "visit.schedule");
  assert.equal((resolved as any).executionRequest?.input?.actionId, "visit.schedule");
});

test("IMOB_CRM turn engine falha fechado quando 'confirmo' chega sem pendingAction", async () => {
  const params = createEngineParams({
    body: {
      message: "confirmo",
      caseId: "case-4",
      threadId: "thread-4",
      threadState: {
        mode: "consult",
        pendingSlot: "none",
        resultOffset: 0,
        slots: {},
        operational: null,
      },
    },
  });

  const resolved = await resolveImobCrmTurnEngine(params);
  assert.equal(resolved.mode, "blocked");
  assert.equal((resolved as any).presentation?.metadata?.workflowReasonCode, "PENDING_ACTION_MISSING");
});

test("IMOB_CRM turn engine falha fechado quando cliente injeta pendingAction sem binding canônico persistido", async () => {
  const params = createEngineParams({
    body: {
      message: "confirmo",
      caseId: "case-4b",
      threadId: "thread-4b",
      threadState: {
        mode: "execute",
        pendingSlot: "none",
        resultOffset: 0,
        slots: {},
        operational: {
          flow: "owner.create",
          status: "ready_for_review",
          pendingFields: [],
          pendingAction: makePendingAction({
            caseId: "case-4b",
            threadId: "thread-4b",
          }),
        },
      },
    },
  });

  const resolved = await resolveImobCrmTurnEngine(params);
  assert.equal(resolved.mode, "blocked");
  assert.equal((resolved as any).presentation?.metadata?.workflowReasonCode, "PENDING_ACTION_MISSING");
});

test("IMOB_CRM turn engine falha fechado quando pendingAction diverge do threadId atual", async () => {
  const params = createEngineParams({
    body: {
      message: "confirmo",
      caseId: "case-5",
      threadId: "thread-5",
      canonicalPendingAction: makePendingAction({
        caseId: "case-5",
        threadId: "thread-original",
      }),
      threadState: {
        mode: "execute",
        pendingSlot: "none",
        resultOffset: 0,
        slots: {},
        operational: {
          flow: "owner.create",
          status: "ready_for_review",
          pendingFields: [],
        },
      },
    },
  });

  const resolved = await resolveImobCrmTurnEngine(params);
  assert.equal(resolved.mode, "blocked");
  assert.equal((resolved as any).presentation?.metadata?.workflowReasonCode, "DIRECTED_ACTION_CONTEXT_LOST");
});

test("IMOB_CRM turn engine falha fechado quando client pendingAction diverge da ação canônica persistida", async () => {
  const params = createEngineParams({
    body: {
      message: "confirmo",
      caseId: "case-6",
      threadId: "thread-6",
      canonicalPendingAction: makePendingAction({
        caseId: "case-6",
        threadId: "thread-6",
        actionId: "owner.register",
        sourceActionId: "owner.register",
      }),
      threadState: {
        mode: "execute",
        pendingSlot: "none",
        resultOffset: 0,
        slots: {},
        operational: {
          flow: "owner.create",
          status: "ready_for_review",
          pendingFields: [],
          pendingAction: makePendingAction({
            caseId: "case-6",
            threadId: "thread-6",
            actionId: "property.create",
            sourceActionId: "property.create",
            entityType: "property",
          }),
        },
      },
    },
  });

  const resolved = await resolveImobCrmTurnEngine(params);
  assert.equal(resolved.mode, "blocked");
  assert.equal((resolved as any).presentation?.metadata?.workflowReasonCode, "CONFIRMATION_TARGET_AMBIGUOUS");
});

test("IMOB_CRM turn engine falha fechado quando fluxo ativo diverge da jornada da pendingAction", async () => {
  const params = createEngineParams({
    body: {
      message: "confirmo",
      caseId: "case-7",
      threadId: "thread-7",
      canonicalPendingAction: makePendingAction({
        caseId: "case-7",
        threadId: "thread-7",
      }),
      threadState: {
        mode: "execute",
        pendingSlot: "none",
        resultOffset: 0,
        slots: {},
        operational: {
          flow: "visit.schedule",
          status: "ready_for_review",
          pendingFields: [],
          pendingAction: makePendingAction({
            caseId: "case-7",
            threadId: "thread-7",
          }),
        },
      },
    },
  });

  const resolved = await resolveImobCrmTurnEngine(params);
  assert.equal(resolved.mode, "blocked");
  assert.equal((resolved as any).presentation?.metadata?.workflowReasonCode, "DIRECTED_ACTION_JOURNEY_MISMATCH");
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

test("IMOB_CRM turn engine keeps consultar caso read-only and valid during active workflow", async () => {
  let consultCalls = 0;
  const params = createEngineParams({
    body: {
      message: "consultar caso",
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
            propertyType: "kitnet",
            goal: "aluguel_por_temporada",
            city: "Balneário Camboriú",
            address: "Rua Alvin Bauer, 783 apto 101",
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
      presentation: { text: "Resumo canônico do caso." },
    };
  };

  const resolved = await resolveImobCrmTurnEngine(params);

  assert.equal(consultCalls, 1);
  assert.equal(resolved.action, "case.status");
  assert.doesNotMatch((resolved as any).presentation?.text ?? "", /acao nao e valida/i);
});

test("IMOB_CRM turn engine prioriza recovery consultivo para 'o que falta' mesmo com property.create ativo", async () => {
  let consultCalls = 0;
  const params = createEngineParams({
    body: {
      message: "o que falta aqui?",
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
            city: "Itapema",
            address: "Rua Batch 101",
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
      presentation: { text: "pendências canônicas do caso" },
    };
  };

  const resolved = await resolveImobCrmTurnEngine(params);

  assert.equal(consultCalls, 1);
  assert.equal(resolved.action, "case.status");
  assert.match((resolved as any).presentation?.text ?? "", /pendências canônicas/i);
});

test("IMOB_CRM turn engine propagates canonical proof surface from consultive case context", async () => {
  const params = createEngineParams({
    body: { message: "qual status desse caso?", threadState: { mode: "consult", pendingSlot: "none", resultOffset: 0, slots: {}, operational: null } },
  });
  params.helpers.resolveImobOperationalConsult = async () => ({
    mode: "consult",
    action: "crm.case.pipeline_status",
    threadLabel: "Caso",
    conversationState: params.body.threadState,
    caseContext: {
      caseId: "case-proof-1",
      flow: "commission.settle",
      stage: "settled",
      status: "success",
      canonical: { recommendedActions: [] },
      proof: {
        required: true,
        ready: true,
        state: "ready",
        runId: "run-proof-1",
        txId: "tx-proof-1",
        receiptPath: "/api/ledger/tx-proof-1",
        bundlePath: "/api/runs/run-proof-1/bundle",
        verifyUrl: "/api/ledger/tx-proof-1",
      },
    },
    presentation: { text: "leitura consultiva com prova" },
  });

  const resolved = await resolveImobCrmTurnEngine(params);
  assert.equal(resolved.action, "crm.case.pipeline_status");
  assert.equal((resolved as any).presentation?.proof?.required, true);
  assert.equal((resolved as any).presentation?.proof?.ready, true);
  assert.equal((resolved as any).presentation?.proof?.state, "ready");
  assert.equal((resolved as any).presentation?.proof?.txId, "tx-proof-1");
  assert.equal((resolved as any).presentation?.card?.proof, undefined);
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

test("IMOB_CRM turn engine injeta market scan read-only com provider interno quando o scan é explicitamente solicitado", async () => {
  const events: any[] = [];
  const runRows = new Map<string, any>();
  const runCalls: string[] = [];
  const params = createEngineParams({
    prisma: {
      imobProperty: {
        findMany: async () => {
          runCalls.push("property.findMany");
          return [
            {
              id: "prop-1",
              tenantId: "tenant-1",
              workspaceId: "workspace-1",
              propertyType: "apartamento",
              goal: "locacao",
              city: "Itajaí",
              neighborhood: "Centro",
              address: "Rua 1500",
              bedrooms: 2,
              askingPriceCents: 320000,
              status: "ready_for_review",
              owner: { id: "owner-1", name: "Carlos" },
            },
          ];
        },
      },
      imobMarketScanRun: {
        create: async (args: any) => {
          runCalls.push("run.create");
          const row = { ...args.data };
          runRows.set(row.id, row);
          return row;
        },
        update: async (args: any) => {
          runCalls.push(`run.update:${args.data.status}`);
          const row = { ...runRows.get(args.where.id), ...args.data };
          runRows.set(args.where.id, row);
          return row;
        },
      },
      imobCaseEvent: {
        create: async (args: any) => {
          events.push(args.data);
          return { id: "event-1" };
        },
      },
    },
    body: {
      message: "continuar com a varredura de mercado",
      caseId: "case-1",
      threadState: {
        mode: "consult",
        pendingSlot: "none",
        resultOffset: 0,
        slots: {},
        operational: {
          flow: "property.market_scan",
          status: "collecting",
          pendingFields: ["city", "goal"],
          propertyDraft: {
            propertyId: null,
            propertyType: null,
            goal: null,
            cep: null,
            city: null,
            neighborhood: null,
            bedrooms: null,
            bathrooms: null,
            address: null,
          },
          marketScanContext: {
            cities: ["Itajaí"],
            cityCandidates: ["Itajaí"],
            uf: "SC",
            goals: ["locacao"],
            goalCandidates: ["locacao"],
            propertyTypes: ["apartamento"],
            bedrooms: [2],
            priceRange: {
              min: null,
              max: 3500,
              currency: "BRL",
              period: "monthly",
              confidence: "high",
            },
            readOnly: true,
            limitPerGroup: 10,
          },
        },
      },
    },
    helpers: {
      ...createEngineParams().helpers,
      applyExistingRegistrationResolution: async ({ resolved }: any) => resolved,
    },
  });

  const resolved = await resolveImobCrmTurnEngine(params);
  assert.equal((resolved as any).action, "realestate.market_scan");
  assert.equal((resolved as any).executionRequest, undefined);
  assert.equal((resolved as any).presentation?.marketScanResult?.sourceStatus, "completed");
  assert.equal((resolved as any).presentation?.marketScanResult?.groups?.[0]?.items?.length, 1);
  assert.equal((resolved as any).conversationState?.operational?.marketScanSnapshot?.readOnly, true);
  assert.equal((resolved as any).conversationState?.operational?.marketScanRun?.status, "completed");
  assert.deepEqual((resolved as any).conversationState?.operational?.marketScanRun?.sourceIds, ["tenant_inventory_import", "internal_crm", "public_web_assisted"]);
  assert.equal((resolved as any).conversationState?.operational?.marketScanResult?.intelligence?.pricingRisk, "high");
  assert.equal((resolved as any).conversationState?.operational?.marketScanOpportunity?.requiresHumanApproval, true);
  assert.equal(runCalls[0], "run.create");
  assert.ok(runCalls.indexOf("run.update:fetch") < runCalls.indexOf("property.findMany"));
  assert.deepEqual(
    (resolved as any).presentation?.agentActivities?.map((item: any) => item.agentLabel),
    ["IMOB", "Market Scan", "Guardian"],
  );
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "market_scan.snapshot");
  assert.match((resolved as any).presentation?.text ?? "", /Varredura de mercado concluída/i);
  assert.doesNotMatch((resolved as any).presentation?.text ?? "", /Ação recomendada/i);
  assert.equal((resolved as any).conversationState?.operational?.marketScanOpportunity?.recommendedAction, "pedir_autorizacao");
});

test("IMOB_CRM turn engine does not promote ambiguous market scan capture to batch only from semantic composed intents", async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  globalThis.fetch = (async () => ({
    ok: true,
    json: async () => ({
      output_text: JSON.stringify({
        entity: null,
        action: null,
        confidence: 0.99,
        needsClarification: false,
        composedIntents: [
          { entity: "comprador", action: "create" },
          { entity: "vendedor", action: "create" },
          { entity: "locatario", action: "create" },
        ],
      }),
    }),
  })) as typeof fetch;

  try {
    const params = createEngineParams({
      body: {
        message: "Quero captar um imóvel para comprar, vender, locação em Itajaí e Camboriú em Santa Catarina",
      },
      helpers: {
        ...createEngineParams().helpers,
        applyExistingRegistrationResolution: async ({ resolved }: any) => ({
          ...resolved,
          presentation: {
            ...(resolved.presentation ?? {}),
            card: undefined,
          },
        }),
      },
    });

    const resolved = await resolveImobCrmTurnEngine(params);
    assert.equal((resolved as any).action, "crm.market_scan.offer");
    assert.equal((resolved as any).conversationState?.operational?.flow, "property.market_scan");
    assert.notEqual((resolved as any).action, "crm.batch.intake");
    assert.equal((resolved as any).presentation?.card?.ctas?.[0]?.label, "Fazer varredura de mercado");
    assert.equal((resolved as any).presentation?.card?.ctas?.[0]?.nextMessage, "fazer varredura de mercado");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey) process.env.OPENAI_API_KEY = originalApiKey;
    else delete process.env.OPENAI_API_KEY;
  }
});

test("IMOB_CRM turn engine retoma market scan snapshot persistido por caseId quando o threadState não carrega o snapshot", async () => {
  const params = createEngineParams({
    prisma: {
      imobCaseEvent: {
        findFirst: async () => ({
          payload: {
            scanId: "market-scan-persisted",
            providerId: "internal_crm",
            sourceStatus: "completed",
            totalItems: 1,
            groups: [
              {
                city: "Itajaí",
                goal: "locacao",
                propertyType: "apartamento",
                bedrooms: 2,
                items: [
                  {
                    source: "internal_crm",
                    sourceId: "prop-9",
                    providerId: "internal_crm",
                    retrievedAt: "2026-05-09T12:00:00.000Z",
                    city: "Itajaí",
                    uf: "SC",
                    goal: "locacao",
                    propertyType: "apartamento",
                    bedrooms: 2,
                    price: 3200,
                    currency: "BRL",
                    neighborhood: "Centro",
                    address: "Rua 1500",
                    title: "Apartamento 2 quartos",
                    url: null,
                  },
                ],
              },
            ],
            readOnly: true,
            generatedAt: "2026-05-09T12:00:00.000Z",
          },
        }),
      },
    },
    body: {
      message: "me mostre a varredura de mercado",
      caseId: "case-2",
      threadState: {
        mode: "consult",
        pendingSlot: "none",
        resultOffset: 0,
        slots: {},
        operational: {
          flow: "property.market_scan",
          status: "collecting",
          pendingFields: ["city", "goal"],
          propertyDraft: {
            propertyId: null,
            propertyType: null,
            goal: null,
            cep: null,
            city: null,
            neighborhood: null,
            bedrooms: null,
            bathrooms: null,
            address: null,
          },
          marketScanContext: {
            cities: ["Itajaí"],
            cityCandidates: ["Itajaí"],
            uf: "SC",
            goals: ["locacao"],
            goalCandidates: ["locacao"],
            propertyTypes: ["apartamento"],
            bedrooms: [2],
            priceRange: {
              min: null,
              max: 3500,
              currency: "BRL",
              period: "monthly",
              confidence: "high",
              ambiguityReason: null,
            },
            readOnly: true,
            limitPerGroup: 10,
          },
        },
      },
    },
    helpers: {
      ...createEngineParams().helpers,
      applyExistingRegistrationResolution: async ({ resolved }: any) => resolved,
    },
  });

  const resolved = await resolveImobCrmTurnEngine(params);
  assert.equal((resolved as any).conversationState?.operational?.marketScanSnapshot?.scanId, "market-scan-persisted");
});

test("IMOB_CRM turn engine uses tenant inventory provider when imported inventory exists for the workspace", async () => {
  const params = createEngineParams({
    prisma: {
      imobProperty: {
        findMany: async () => ([
          {
            id: "property-import-1",
            tenantId: "tenant-1",
            workspaceId: "workspace-1",
            propertyType: "apartamento",
            goal: "locacao",
            city: "Itajaí",
            neighborhood: "Centro",
            address: "Rua Importada 10",
            bedrooms: 2,
            askingPriceCents: 325000,
            status: "active",
            metadata: {
              importedFrom: "drive-manifest",
              sourceId: "drive-prop-10",
              sourceUrl: "https://drive.example/property-10",
              sourceLabel: "tenant_inventory_import",
              title: "Apartamento importado 2 quartos",
              importedAt: "2026-05-11T10:00:00.000Z",
            },
          },
        ]),
      },
      imobCaseEvent: {
        create: async () => null,
      },
    },
    body: {
      message: "fazer varredura de mercado",
      caseId: "case-market-scan-imported",
      threadState: {
        mode: "execute",
        pendingSlot: "none",
        resultOffset: 0,
        slots: {},
        operational: {
          flow: "property.market_scan",
          status: "ready_for_review",
          pendingFields: [],
          propertyDraft: {
            propertyId: null,
            propertyType: null,
            goal: null,
            cep: null,
            city: null,
            neighborhood: null,
            bedrooms: null,
            bathrooms: null,
            address: null,
          },
          marketScanContext: {
            cities: ["Itajaí"],
            cityCandidates: ["Itajaí"],
            uf: "SC",
            goals: ["locacao"],
            goalCandidates: ["locacao"],
            propertyTypes: ["apartamento"],
            bedrooms: [2],
            priceRange: null,
            readOnly: true,
            limitPerGroup: 10,
          },
        },
      },
    },
    helpers: {
      ...createEngineParams().helpers,
      applyExistingRegistrationResolution: async ({ resolved }: any) => resolved,
    },
  });

  const resolved = await resolveImobCrmTurnEngine(params);
  assert.equal((resolved as any).presentation?.marketScanResult?.providerId, "tenant_inventory_import");
  assert.equal(
    (resolved as any).presentation?.marketScanResult?.groups?.[0]?.items?.[0]?.sourceId,
    "drive-prop-10",
  );
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

test("IMOB_CRM turn engine prioritizes explicit visit transition over lead ready guard", async () => {
  const params = createEngineParams({
    body: {
      message: "vamos avançar para visita",
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
  params.helpers.applyExistingRegistrationResolution = async ({ resolved }: any) => resolved;

  const resolved = await resolveImobCrmTurnEngine(params);
  assert.notEqual((resolved as any).presentation?.metadata?.workflowReasonCode, "lead_already_qualified");
  assert.equal((resolved as any).conversationState?.operational?.flow, "visit.schedule");
  assert.equal((resolved as any).executionRequest?.operation, "visit.schedule");
});

test("IMOB_CRM turn engine prioritizes explicit documents transition over active case review fallback", async () => {
  const params = createEngineParams({
    body: {
      message: "quero revisar a documentação necessária deste caso",
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
            goal: "locacao",
            city: "Itajaí",
            address: "Rua 7 de Setembro",
          },
        },
      },
    },
  });
  params.helpers.hydrateThreadStateWithPersistedLead = async ({ threadState }: any) => ({
    ...threadState,
    operational: {
      ...(threadState?.operational ?? {}),
      flow: "documents.collect",
      status: "ready_for_review",
      pendingFields: [],
      documentDraft: {},
    },
  });
  params.helpers.applyExistingRegistrationResolution = async ({ resolved }: any) => resolved;

  const resolved = await resolveImobCrmTurnEngine(params);
  assert.equal((resolved as any).conversationState?.operational?.flow, "documents.collect");
  assert.notEqual(resolved.action, "crm.case.recent_registration");
});

test("IMOB_CRM turn engine canonicalizes lead-to-property linking into property capture", async () => {
  const params = createEngineParams({
    body: {
      message: "vincular o lead a um imóvel",
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
  params.helpers.applyExistingRegistrationResolution = async ({ resolved }: any) => resolved;

  const resolved = await resolveImobCrmTurnEngine(params);
  assert.equal((resolved as any).conversationState?.operational?.flow, "property.create");
  assert.notEqual((resolved as any).conversationState?.operational?.leadDraft?.leadName, "A Um Imovel");
});

test("IMOB_CRM turn engine does not parse case-reference lead CTA as literal lead entity", async () => {
  const params = createEngineParams({
    body: {
      message: "qualificar lead deste caso",
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
            goal: "locacao",
            city: "Itajaí",
            address: "Rua 7 de Setembro",
          },
        },
      },
    },
  });
  params.helpers.applyExistingRegistrationResolution = async ({ resolved }: any) => resolved;

  const resolved = await resolveImobCrmTurnEngine(params);
  assert.equal((resolved as any).conversationState?.operational?.flow, "lead.qualify");
  assert.notEqual((resolved as any).conversationState?.operational?.leadDraft?.leadName, "Deste Caso");
  assert.notEqual((resolved as any).conversationState?.operational?.leadDraft?.desiredCity, "Do Lead Do");
});

test("IMOB_CRM turn engine offers owner registration instead of stale owner linking after property success when owner is missing", async () => {
  const params = createEngineParams({
    body: {
      message: "salvar cadastro",
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
            goal: "locacao",
            city: "Camboriú",
            address: "Areias",
          },
        },
      },
    },
  });
  params.helpers.resolveImobOperationalUpdate = async () => ({
    mode: "execute",
    action: "crm.property.update",
    threadLabel: "Imóvel",
    conversationState: params.body.threadState,
    caseContext: {
      caseId: "case-1",
      flow: "property.create",
      lead: {
        id: "lead-1",
        name: "João",
      },
    },
    presentation: {
      text: "Cadastro do imóvel processado com sucesso.",
    },
  });

  const resolved = await resolveImobCrmTurnEngine(params);
  const actions = ((resolved as any).presentation?.blocks ?? [])
    .flatMap((block: any) => block?.ctas ?? []);
  assert.ok(actions.some((item: any) => item.label === "Avançar para visita"));
  assert.ok(!actions.some((item: any) => item.label === "Qualificar lead"));
  assert.ok(actions.some((item: any) => item.label === "Cadastrar proprietário"));
  assert.ok(!actions.some((item: any) => item.label === "Vincular proprietário"));
  assert.equal(actions.filter((item: any) => item.label === "Consultar caso").length, 1);
});

test("IMOB_CRM turn engine keeps property-success actions fully case-aware when case already has lead and owner", async () => {
  const params = createEngineParams({
    body: {
      message: "salvar cadastro",
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
            goal: "locacao",
            city: "Itajaí",
            address: "Rua 7 de Setembro",
          },
        },
      },
    },
  });
  params.helpers.resolveImobOperationalUpdate = async () => ({
    mode: "execute",
    action: "crm.property.update",
    threadLabel: "Imóvel",
    conversationState: params.body.threadState,
    caseContext: {
      caseId: "case-1",
      flow: "property.create",
      lead: {
        id: "lead-1",
        name: "João",
      },
      owner: {
        id: "owner-1",
        name: "Carlos",
      },
      property: {
        id: "property-1",
        city: "Itajaí",
      },
    },
    presentation: {
      text: "Cadastro do imóvel processado com sucesso.",
    },
  });

  const resolved = await resolveImobCrmTurnEngine(params);
  const actions = ((resolved as any).presentation?.blocks ?? [])
    .flatMap((block: any) => block?.ctas ?? []);
  assert.ok(actions.some((item: any) => item.label === "Avançar para visita"));
  assert.ok(!actions.some((item: any) => item.label === "Qualificar lead"));
  assert.ok(!actions.some((item: any) => item.label === "Cadastrar proprietário"));
});

test("IMOB_CRM turn engine hides owner CTA after property success when linked owner comes from property context", async () => {
  const params = createEngineParams({
    body: {
      message: "salvar cadastro",
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
            goal: "locacao",
            city: "Itapema",
            address: "Rua 260",
          },
        },
      },
    },
  });
  params.helpers.resolveImobOperationalUpdate = async () => ({
    mode: "execute",
    action: "crm.property.update",
    threadLabel: "Imóvel",
    conversationState: params.body.threadState,
    caseContext: {
      caseId: "case-1",
      flow: "property.create",
      lead: {
        id: "lead-1",
        name: "João",
      },
      property: {
        id: "property-1",
        city: "Itapema",
        owner: {
          id: "owner-1",
          name: "Nilsen Majolo",
        },
      },
    },
    presentation: {
      text: "Cadastro do imóvel processado com sucesso.",
    },
  });

  const resolved = await resolveImobCrmTurnEngine(params);
  const actions = ((resolved as any).presentation?.blocks ?? [])
    .flatMap((block: any) => block?.ctas ?? []);
  assert.ok(actions.some((item: any) => item.label === "Avançar para visita"));
  assert.ok(!actions.some((item: any) => item.label === "Cadastrar proprietário"));
});

test("IMOB_CRM turn engine adds post-success property summary after property capture", async () => {
  const params = createEngineParams({
    body: {
      message: "salvar cadastro",
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
            goal: "locacao",
            city: "Itajaí",
            address: "Rua 7 de Setembro",
          },
        },
      },
    },
  });
  params.helpers.resolveImobOperationalUpdate = async () => ({
    mode: "execute",
    action: "crm.property.update",
    threadLabel: "Imóvel",
    conversationState: params.body.threadState,
    caseContext: {
      caseId: "case-1",
      flow: "property.create",
      property: {
        id: "property-1",
        propertyType: "apartamento",
        goal: "locacao",
        city: "Itajaí",
        address: "Rua 7 de Setembro",
        owner: {
          id: "owner-1",
          name: "Nilsen Majolo",
        },
      },
    },
    presentation: {
      text: "Cadastro do imóvel processado com sucesso.",
    },
  });

  const resolved = await resolveImobCrmTurnEngine(params);
  const blocks = (resolved as any).presentation?.blocks ?? [];
  const summaryBlock = blocks.find((block: any) => block?.title === "Resumo do imóvel cadastrado");
  assert.ok(summaryBlock);
  assert.deepEqual(summaryBlock.lines, [
    "Tipo: Apartamento",
    "Finalidade: Locação",
    "Cidade: Itajaí",
    "Endereço: Rua 7 de Setembro",
    "Proprietário vinculado: Nilsen Majolo",
  ]);
});

test("IMOB_CRM turn engine uses seasonal case planner action after property success", async () => {
  const params = createEngineParams({
    body: {
      message: "salvar cadastro",
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
            propertyType: "kitnet",
            goal: "aluguel_por_temporada",
            city: "Balneário Camboriú",
            address: "Rua Alvin Bauer, 783 apto 101",
          },
        },
      },
    },
  });
  params.helpers.resolveImobOperationalUpdate = async () => ({
    mode: "execute",
    action: "crm.property.update",
    threadLabel: "Imóvel",
    conversationState: params.body.threadState,
    caseContext: {
      caseId: "case-seasonal-1",
      flow: "property.create",
      owner: {
        id: "owner-1",
        name: "Carlos Alberto",
        document: "12345678900",
      },
      property: {
        id: "property-1",
        propertyType: "kitnet",
        goal: "aluguel_por_temporada",
        city: "Balneário Camboriú",
        address: "Rua Alvin Bauer, 783 apto 101",
      },
    },
    presentation: {
      text: "Cadastro do imóvel processado com sucesso.",
    },
  });

  const resolved = await resolveImobCrmTurnEngine(params);
  const actions = ((resolved as any).presentation?.blocks ?? [])
    .flatMap((block: any) => block?.ctas ?? []);

  assert.equal((resolved as any).imobCasePlan?.mission, "capture_seasonal_property");
  assert.equal((resolved as any).imobCasePlan?.primaryAction?.operation, "property.link_owner");
  assert.ok(actions.some((item: any) => item.label === "Concluir vínculo"));
  assert.ok(!actions.some((item: any) => item.label === "Cadastrar proprietário"));
});

test("IMOB_CRM turn engine rewrites stale owner-link quick reply into canonical owner flow after property success", async () => {
  const params = createEngineParams({
    body: {
      message: "vincular proprietário ao imóvel",
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
            city: "Itapema",
            address: "Rua 260",
          },
        },
      },
    },
  });

  params.helpers.applyExistingRegistrationResolution = async ({ resolved }: any) => resolved;

  const resolved = await resolveImobCrmTurnEngine(params);

  assert.equal((resolved as any).conversationState?.operational?.flow, "owner.create");
  assert.equal((resolved as any).executionRequest?.operation, "owner.create");
});

test("IMOB_CRM turn engine accepts validated recipe mission context as planner input", async () => {
  const params = createEngineParams({
    body: {
      message: "começar recipe",
      recipeMissionContext: {
        mission: "capture_seasonal_property",
        defaultGoal: "aluguel_por_temporada",
        recipeId: "recipe-temporada-1",
        startedFromMessage: null,
        lockedUntilExplicitChange: true,
      },
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
            propertyType: "kitnet",
            goal: "aluguel_por_temporada",
            city: "Balneário Camboriú",
            address: "Rua Alvin Bauer, 783 apto 101",
          },
        },
      },
    },
  });
  params.helpers.resolveImobOperationalUpdate = async () => ({
    mode: "execute",
    action: "crm.property.update",
    threadLabel: "Imóvel",
    conversationState: params.body.threadState,
    caseContext: {
      caseId: "case-recipe-1",
      flow: "property.create",
      owner: {
        id: "owner-1",
        name: "Carlos Alberto",
        document: "12345678900",
      },
      property: {
        id: "property-1",
        propertyType: "kitnet",
        goal: "aluguel_por_temporada",
        city: "Balneário Camboriú",
        address: "Rua Alvin Bauer, 783 apto 101",
      },
    },
    presentation: {
      text: "Cadastro do imóvel processado com sucesso.",
    },
  });

  const resolved = await resolveImobCrmTurnEngine(params);

  assert.equal((resolved as any).conversationState?.operational?.missionContext?.recipeId, "recipe-temporada-1");
  assert.equal((resolved as any).imobCaseContext?.missionContext?.recipeId, "recipe-temporada-1");
  assert.equal((resolved as any).imobCasePlan?.primaryAction?.operation, "property.link_owner");
});

test("IMOB_CRM turn engine derives quick replies from the final presentation payload", async () => {
  const params = createEngineParams({
    body: {
      message: "qual status desse caso",
      threadState: {
        mode: "consult",
        pendingSlot: "none",
        resultOffset: 0,
        slots: {},
        operational: null,
      },
    },
  });
  params.helpers.resolveImobOperationalConsult = async () => ({
    mode: "consult",
    action: "crm.case.lookup",
    threadLabel: "Caso",
    conversationState: params.body.threadState,
    caseContext: {
      caseId: "case-1",
      flow: "proposal.create",
      stage: "negociacao",
      status: "active",
      canonical: {
        recommendedActions: [
          { id: "review_pending_items", label: "Ver pendências", actionType: "consultive", inputHint: "mostrar pendências do caso" },
          { id: "follow_next_step", label: "Executar próximo passo", actionType: "consultive", inputHint: "executar próximo passo do caso" },
        ],
      },
    },
    presentation: {
      text: "Caso em andamento.",
      suggestedNextAction: "executar próximo passo do caso",
      card: {
        title: "Caso Lead",
        lines: ["Negociação ativa"],
        ctas: [
          { id: "case-pending", label: "Ver pendências", nextMessage: "mostrar pendências do caso" },
          { id: "case-next-step", label: "Executar próximo passo", nextMessage: "executar próximo passo do caso" },
        ],
      },
    },
  });

  const resolved = await resolveImobCrmTurnEngine(params);
  assert.deepEqual((resolved as any).presentation?.quickReplies, [
    "mostrar pendências do caso",
    "executar próximo passo do caso",
  ]);
});

test("IMOB_CRM turn engine resolves a single lead nextAction and keeps payload coherent", async () => {
  const params = createEngineParams({
    body: {
      message: "consultar caso",
      caseId: "case-1",
      threadState: {
        mode: "consult",
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
      },
    },
  });
  params.helpers.resolveImobOperationalConsult = async () => ({
    mode: "consult",
    action: "crm.case.lookup",
    threadLabel: "Caso",
    conversationState: params.body.threadState,
    caseContext: {
      caseId: "case-1",
      flow: "lead.qualify",
      stage: "ready_for_review",
      status: "active",
      property: null,
      canonical: {
        recommendedActions: [
          { id: "qualify_lead", label: "Qualificar lead", actionType: "operational", inputHint: "qualificar lead deste caso" },
        ],
      },
    },
    presentation: {
      text: "Caso pronto para continuidade.",
    },
  });

  const resolved = await resolveImobCrmTurnEngine(params);
  assert.equal((resolved as any).conversationState?.operational?.leadStatus, "qualified");
  assert.equal((resolved as any).conversationState?.operational?.nextAction, "link_lead_to_property");
  assert.equal((resolved as any).presentation?.nextStep, "Vincular o lead a um imóvel antes de avançar a etapa comercial.");
  assert.equal((resolved as any).presentation?.suggestedNextAction, "vincular o lead a um imóvel");
  assert.equal((resolved as any).caseContext?.canonical?.recommendedActions?.[0]?.inputHint, "vincular o lead a um imóvel");
  assert.deepEqual((resolved as any).presentation?.quickReplies, ["vincular o lead a um imóvel"]);
});

test("IMOB_CRM turn engine stamps canonical outcome and clears legacy property success card", async () => {
  const params = createEngineParams({
    body: {
      message: "salvar cadastro",
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
            goal: "locacao",
            city: "Itajaí",
            address: "Rua 7 de Setembro",
          },
        },
      },
    },
  });
  params.helpers.resolveImobOperationalUpdate = async () => ({
    mode: "execute",
    action: "crm.property.update",
    threadLabel: "Imóvel",
    conversationState: params.body.threadState,
    caseContext: {
      caseId: "case-1",
      flow: "property.create",
      property: {
        id: "property-1",
        propertyType: "apartamento",
        goal: "locacao",
        city: "Itajaí",
        address: "Rua 7 de Setembro",
      },
    },
    presentation: {
      text: "Cadastro do imóvel processado com sucesso.",
      card: {
        title: "Resumo legado",
        lines: ["não deveria sobreviver ao snapshot canônico"],
      },
    },
  });

  const resolved = await resolveImobCrmTurnEngine(params);
  assert.equal((resolved as any).conversationState?.operational?.outcome, "updated");
  assert.equal((resolved as any).presentation?.metadata?.canonicalSnapshot?.authoritative, true);
  assert.equal((resolved as any).presentation?.metadata?.canonicalSnapshot?.variant, "success_updated");
  assert.equal((resolved as any).presentation?.card, undefined);
  assert.equal((resolved as any).presentation?.form, undefined);
  assert.equal((resolved as any).presentation?.quickReplies, undefined);
  assert.ok(Array.isArray((resolved as any).presentation?.blocks));
});

test("IMOB_CRM turn engine suppresses quick replies while canonical owner form is active", async () => {
  const params = createEngineParams({
    body: {
      message: "quero cadastrar um proprietário",
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
            ownerPersona: "proprietario",
            ownerName: "Nilsen Majolo",
            ownerPhone: "47999886868",
            ownerEmail: "nilsen@gmail.com",
            ownerDocument: null,
          },
        },
      },
    },
  });
  params.helpers.resolveImobOperationalUpdate = async () => null;

  const resolved = await resolveImobCrmTurnEngine(params);
  assert.equal((resolved as any).conversationState?.operational?.outcome, "waiting_input");
  assert.equal((resolved as any).presentation?.metadata?.canonicalSnapshot?.variant, "collecting_fields");
  assert.deepEqual((resolved as any).presentation?.quickReplies ?? [], []);
  assert.equal(Boolean((resolved as any).presentation?.form), true);
  assert.equal((resolved as any).presentation?.card, undefined);
});

test("IMOB_CRM turn engine aceita voltar ao scan durante confirmação de seleção sem invalidar o caso", async () => {
  const params = createEngineParams({
    body: {
      message: "fazer varredura de mercado",
      threadState: {
        mode: "execute",
        pendingSlot: "none",
        resultOffset: 0,
        slots: {},
        operational: {
          flow: "property.market_scan",
          status: "ready_for_review",
          pendingFields: [],
          marketScanSelection: {
            scanId: "scan-1",
            source: "internal_crm",
            sourceId: "property-1",
            providerId: null,
            retrievedAt: "2026-05-26T20:45:07.997Z",
          },
          marketScanSnapshot: {
            scanId: "scan-1",
            generatedAt: "2026-05-26T20:45:07.997Z",
            readOnly: true,
            provider: "internal_crm",
            groups: [],
          },
          marketScanContext: {
            cities: ["Itajaí"],
            cityCandidates: ["Itajaí"],
            uf: "SC",
            goals: ["locacao"],
            goalCandidates: ["locacao"],
            propertyTypes: ["apartamento"],
            bedrooms: [2],
            priceRange: null,
            readOnly: true,
            limitPerGroup: 10,
          },
          propertyDraft: {
            propertyId: null,
            propertyType: null,
            goal: null,
            cep: null,
            city: null,
            neighborhood: null,
            bedrooms: null,
            bathrooms: null,
            address: null,
          },
        },
      },
    },
  });
  params.helpers.resolveImobOperationalConsult = async () => null;

  const resolved = await resolveImobCrmTurnEngine(params);

  assert.notEqual(resolved.action, "crm.case.transition_not_allowed");
  assert.doesNotMatch((resolved as any).presentation?.text ?? "", /acao nao e valida/i);
});

// Bug 2 regression: canonicalPendingAction with status="confirmed" (stale post-execution) must not
// be executable. The route filters these out before passing to the engine, so the engine receives
// null. This test validates the engine behaves correctly when canonicalPendingAction=null.
test("Bug2: 'confirmo' com canonicalPendingAction=null (stale confirmado filtrado na rota) retorna PENDING_ACTION_MISSING", async () => {
  const params = createEngineParams({
    body: {
      message: "confirmo",
      caseId: "case-b2",
      threadId: "thread-b2",
      // canonicalPendingAction is absent: simulates the route filtering out a confirmed action
      threadState: {
        mode: "execute",
        pendingSlot: "none",
        resultOffset: 0,
        slots: {},
        operational: null,
      },
    },
  });

  const resolved = await resolveImobCrmTurnEngine(params);
  assert.equal(resolved.mode, "blocked");
  assert.equal((resolved as any).presentation?.metadata?.workflowReasonCode, "PENDING_ACTION_MISSING");
});

// Bug 2 regression: even if the client passes a confirmed pendingAction in thread state, the engine
// must block when canonicalPendingAction is null (no canonical backing).
test("Bug2: 'confirmo' com pendingAction confirmed no client state e canonicalPendingAction=null é bloqueado", async () => {
  const params = createEngineParams({
    body: {
      message: "confirmo",
      caseId: "case-b2b",
      threadId: "thread-b2b",
      // no canonicalPendingAction — route filtered it out because status="confirmed"
      threadState: {
        mode: "execute",
        pendingSlot: "none",
        resultOffset: 0,
        slots: {},
        operational: {
          flow: "owner.create",
          status: "ready_for_review",
          pendingFields: [],
          pendingAction: makePendingAction({
            caseId: "case-b2b",
            threadId: "thread-b2b",
            status: "confirmed",
          }),
        },
      },
    },
  });

  const resolved = await resolveImobCrmTurnEngine(params);
  assert.equal(resolved.mode, "blocked");
  assert.equal((resolved as any).presentation?.metadata?.workflowReasonCode, "PENDING_ACTION_MISSING");
});

// Bug 1 + Bug 2 guard at engine level: even if a confirmed canonicalPendingAction somehow reaches
// the engine (defence in depth), it must be blocked with PENDING_ACTION_MISMATCH, never executed.
test("Bug1+Bug2: canonicalPendingAction com status='confirmed' passado ao engine é bloqueado (defence-in-depth)", async () => {
  const params = createEngineParams({
    body: {
      message: "confirmo",
      caseId: "case-b2c",
      threadId: "thread-b2c",
      canonicalPendingAction: makePendingAction({
        caseId: "case-b2c",
        threadId: "thread-b2c",
        status: "confirmed",
      }),
      threadState: {
        mode: "execute",
        pendingSlot: "none",
        resultOffset: 0,
        slots: {},
        operational: {
          flow: "owner.create",
          status: "ready_for_review",
          pendingFields: [],
          pendingAction: makePendingAction({
            caseId: "case-b2c",
            threadId: "thread-b2c",
            status: "confirmed",
          }),
        },
      },
    },
  });

  const resolved = await resolveImobCrmTurnEngine(params);
  assert.equal(resolved.mode, "blocked");
  assert.notEqual(resolved.mode, "execute", "confirmed pendingAction must never execute");
});

// Directed action lifecycle: "confirmo" after rejection (status=cancelled) must be blocked.
// The route filters out any pendingAction with status !== "awaiting_confirmation",
// so the engine receives null — same path as Bug2 regression.
test("Lifecycle: 'confirmo' após cancelamento (status=cancelled filtrado na rota) retorna PENDING_ACTION_MISSING", async () => {
  const params = createEngineParams({
    body: {
      message: "confirmo",
      caseId: "case-lc1",
      threadId: "thread-lc1",
      // canonicalPendingAction absent: route filtered cancelled action (status="cancelled")
      threadState: {
        mode: "execute",
        pendingSlot: "none",
        resultOffset: 0,
        slots: {},
        operational: null,
      },
    },
  });

  const resolved = await resolveImobCrmTurnEngine(params);
  assert.equal(resolved.mode, "blocked");
  assert.equal((resolved as any).presentation?.metadata?.workflowReasonCode, "PENDING_ACTION_MISSING");
});

// Directed action lifecycle: "confirmo" with cancelled pendingAction present in client state
// but no canonical backing — must still block (no exception thrown, fail-closed).
test("Lifecycle: 'confirmo' com pendingAction cancelled no client state e canonicalPendingAction=null é bloqueado", async () => {
  const params = createEngineParams({
    body: {
      message: "confirmo",
      caseId: "case-lc2",
      threadId: "thread-lc2",
      threadState: {
        mode: "execute",
        pendingSlot: "none",
        resultOffset: 0,
        slots: {},
        operational: {
          flow: "owner.create",
          status: "ready_for_review",
          pendingFields: [],
          pendingAction: makePendingAction({
            caseId: "case-lc2",
            threadId: "thread-lc2",
            status: "cancelled",
          }),
        },
      },
    },
  });

  const resolved = await resolveImobCrmTurnEngine(params);
  assert.equal(resolved.mode, "blocked");
  assert.equal((resolved as any).presentation?.metadata?.workflowReasonCode, "PENDING_ACTION_MISSING");
});


// FDC-03A: these paths must remain purely conversational, even when an action awaits confirmation.
function reviewEngineParams(message = "Sim"): any {
  const params: any = createEngineParams();
  params.authContext.userId = "review-user";
  const operational = {
    flow: "proposal.create", status: "ready_for_review", pendingFields: [],
    proposalDraft: { propertyId: "property-1", offerAmount: 100000, buyerName: "Maria", buyerPhone: "47999998888",
      buyerEmail: null, contractType: "sale", counterofferAmount: 0, negotiationStatus: "accepted",
      approvalRequired: true, approvalStatus: "pending" },
  };
  const continuity = buildProposalReviewQuestion({ operational: operational as never, caseId: "case-proposal",
    threadId: "thread-proposal", contextRef: "v1:interaction-test", ...params.authContext });
  params.reviewDraftRef = proposalDraftRef(operational.proposalDraft);
  params.reviewCase = { caseId: "case-proposal", threadId: "thread-proposal", flow: "proposal.create",
    stage: "ready_for_review", status: "ready_for_review", blockers: ["Aprovação necessária"], pendingItems: ["Revisão humana"] };
  params.body = { message, caseId: "case-proposal", threadId: "thread-proposal",
    continuityContextRef: continuity.pending!.contextRef, continuityReplyRef: continuity.pending!.ref,
    threadState: { mode: "execute", pendingSlot: "none", resultOffset: 0, slots: {}, operational: { ...operational, continuity } } };
  // Any invocation of the mutation pipeline, hydration, consult queries or Prisma fails the test.
  params.helpers = { asString: params.helpers.asString, ...Object.fromEntries(Object.keys(params.helpers)
    .filter((key) => key !== "asString").map((key) => [key, () => { assert.fail(`Review invoked ${key}`); }])) };
  params.prisma = new Proxy({}, { get: (_target, name) => { assert.fail(`Review accessed Prisma ${String(name)}`); } });
  return params;
}

import { attachProposalReviewQuestion, buildProposalReviewQuestion, proposalDraftRef } from "../services/imob/crm/imobProposalReviewContinuity";
import { parseImobCrmThreadState } from "../services/imob/crm/imobCrmTurnState";
import { buildImobAgentContractV1 } from "../services/imob/imobAgentContract";

for (const answer of ["Sim", "Não", "Talvez", "confirmo", "pode executar"]) {
  test(`FDC-03A revisão ${answer}: sem provider, consultas, writes, run ou executionRequest`, async () => {
    const params = reviewEngineParams(answer);
    const draft = structuredClone(params.body.threadState.operational.proposalDraft);
    const blockers = structuredClone(params.reviewCase);
    const resolved = await resolveImobCrmTurnEngine(params) as any;
    assert.equal(resolved.mode, "consult");
    assert.equal(resolved.executionRequest, undefined);
    assert.equal(resolved.runId, undefined);
    assert.deepEqual(resolved.conversationState.operational.proposalDraft, draft);
    assert.deepEqual(resolved.caseContext, blockers);
    assert.equal(resolved.conversationState.operational.proposalDraft.approvalStatus, "pending");
    if (answer === "Não") {
      assert.match(resolved.presentation.text, /Qual dado ou condição/);
      assert.equal(resolved.conversationState.operational.continuity.phase, "clarification");
      assert.notEqual(resolved.conversationState.operational.continuity.pending.ref, params.body.continuityReplyRef);
    } else if (answer === "Sim") {
      assert.match(resolved.presentation.text, /confirmou os dados/);
      assert.equal(resolved.conversationState.operational.continuity.pending, null);
    } else {
      assert.equal(resolved.conversationState.operational.continuity.pending.ref, params.body.continuityReplyRef);
      assert.match(resolved.presentation.text, /apenas sobre os dados/);
    }
  });
}

for (const answer of ["Sim", "confirmo", "pode executar", "Não"]) {
  test(`FDC-03A colisão revisão/action: ${answer} nunca confirma action`, async () => {
    const params = reviewEngineParams(answer);
    const pendingAction = makePendingAction({ actionId: "proposal.create", sourceActionId: "proposal.create",
      entityType: "proposal", journey: "proposal_negotiation", caseId: params.body.caseId, threadId: params.body.threadId });
    params.body.canonicalPendingAction = pendingAction;
    params.body.threadState.operational.pendingAction = pendingAction;
    const resolved = await resolveImobCrmTurnEngine(params) as any;
    assert.equal(resolved.mode, "consult");
    assert.equal(resolved.executionRequest, undefined);
    assert.match(resolved.presentation.text, /ação explícita/);
    assert.deepEqual(resolved.conversationState.operational.pendingAction, pendingAction);
  });
}

for (const scenario of ["unknown_version", "purpose", "reference", "expired", "malformed_expiry", "answered", "draft_changed",
  "flow", "case", "thread", "no_scoped_case", "canonical_flow", "canonical_stage", "canonical_status", "canonical_draft_changed", "canonical_draft_missing", "workspace", "tenant", "absent_question"]) {
  test(`FDC-03A pergunta inválida (${scenario}) não cai na confirmação de action nem mutação`, async () => {
    const params = reviewEngineParams();
    const continuity = params.body.threadState.operational.continuity;
    switch (scenario) {
      case "unknown_version": continuity.version = "v9"; break;
      case "purpose": continuity.pending.purpose = "authorize"; break;
      case "reference": params.body.continuityReplyRef = "replaced-question"; break;
      case "expired": continuity.pending.expiresAt = "2000-01-01T00:00:00.000Z"; break;
      case "malformed_expiry": continuity.pending.expiresAt = "not-a-date"; break;
      case "answered": continuity.pending = null; break;
      case "draft_changed": params.body.threadState.operational.proposalDraft.offerAmount = 90000; break;
      case "flow": params.body.threadState.operational.flow = "owner.create"; break;
      case "case": params.body.caseId = "other-case"; break;
      case "thread": params.body.threadId = "other-thread"; break;
      case "no_scoped_case": params.reviewCase = null; params.body.reviewCase = { caseId: params.body.caseId }; break;
      case "canonical_flow": params.reviewCase.flow = "contract.prepare"; break;
      case "canonical_stage": params.reviewCase.stage = "collecting"; break;
      case "canonical_status": params.reviewCase.status = "cancelled"; break;
      case "canonical_draft_changed": params.reviewDraftRef = proposalDraftRef({ ...params.body.threadState.operational.proposalDraft, offerAmount: 90000 }); break;
      case "canonical_draft_missing": params.reviewDraftRef = null; break;
      case "workspace": params.authContext.workspaceId = "other-workspace"; break;
      case "tenant": params.authContext.tenantId = "other-tenant"; break;
      case "absent_question": delete params.body.threadState.operational.continuity; break;
    }
    params.body.canonicalPendingAction = makePendingAction();
    const resolved = await resolveImobCrmTurnEngine(params) as any;
    assert.equal(resolved.mode, "consult");
    assert.equal(resolved.executionRequest, undefined);
    assert.equal(resolved.conversationState.operational.continuity, null);
    assert.match(resolved.presentation.text, /Não há uma pergunta/);
  });
}

test("FDC-03A tombstone sem replyRef impede que confirmação curta seja reinterpretada como autorização", async () => {
  const params = reviewEngineParams();
  params.body.threadState.operational.continuity = null;
  delete params.body.continuityReplyRef;
  params.body.canonicalPendingAction = makePendingAction();
  const resolved = await resolveImobCrmTurnEngine(params) as any;
  assert.equal(resolved.mode, "consult");
  assert.equal(resolved.executionRequest, undefined);
});

test("FDC-03A negativa seguida de detalhes só esclarece, mantendo draft e bloqueios", async () => {
  const params = reviewEngineParams("Não");
  const first = await resolveImobCrmTurnEngine(params) as any;
  params.body.threadState = first.conversationState;
  params.body.continuityReplyRef = first.conversationState.operational.continuity.pending.ref;
  params.body.message = "O valor precisa ser 90000";
  const second = await resolveImobCrmTurnEngine(params) as any;
  assert.equal(second.mode, "consult");
  assert.deepEqual(second.conversationState.operational.proposalDraft, first.conversationState.operational.proposalDraft);
  assert.deepEqual(second.caseContext.blockers, ["Aprovação necessária"]);
  assert.equal(second.executionRequest, undefined);
});

test("FDC-03A extensão é opcional e contrato do agente não concede execução", () => {
  const params = reviewEngineParams();
  delete params.body.threadState.operational.continuity;
  const parsed = parseImobCrmThreadState(params.body);
  assert.equal(Object.hasOwn(parsed!.operational, "continuity"), false);
  assert.equal(buildImobAgentContractV1().runtimePolicies.proposalReview.createsExecution, false);
});

test("FDC-03A emissão adiciona pergunta a uma proposta pronta sem alterar contrato de execução existente", () => {
  const params = reviewEngineParams();
  delete params.body.threadState.operational.continuity;
  const executionRequest = { operation: "proposal.create", action: "realestate.create_contract", input: { propertyId: "property-1" } };
  const data = { mode: "execute", conversationState: params.body.threadState, caseContext: params.reviewCase,
    presentation: { text: "Proposta pronta", metadata: { canonicalSnapshot: { authoritative: true } } }, executionRequest };
  const result = attachProposalReviewQuestion(data, params.authContext, params.body.continuityContextRef);
  assert.equal(result.executionRequest, executionRequest);
  assert.match(result.presentation.text, /dados apresentados.*corretos/);
  assert.equal(result.presentation.metadata, data.presentation.metadata);
  assert.ok(result.conversationState.operational.continuity.pending.ref);
  assert.equal(attachProposalReviewQuestion({ ...data, mode: "blocked" }, params.authContext, params.body.continuityContextRef).conversationState.operational.continuity, undefined);
});

test("FDC-03A contexto autenticado ausente invalida a pergunta sem alterar gates de entitlement", async () => {
  const params = reviewEngineParams();
  params.authContext.workspaceId = "";
  const resolved = await resolveImobCrmTurnEngine(params) as any;
  assert.equal(resolved.mode, "consult");
  assert.match(resolved.presentation.text, /Não há uma pergunta/);
  assert.equal(resolved.executionRequest, undefined);
});


import { readFileSync } from "node:fs";
import ts from "typescript";
import { parseImobPendingAction } from "../services/imob/crm/imobPendingActionRuntime";
import { recordImobResolveTurnSemanticTelemetry } from "../services/imob/imobTelemetry";

// Exercise the actual route callback with authenticated fixtures and the real engine.
// This does not claim to exercise Express middleware or a real database.
function reviewRouteCallback() {
  const source = ts.createSourceFile("imob.ts", readFileSync(new URL("../routes/imob.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
  let callback: ts.Expression | undefined;
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && node.expression.getText(source) === "imobRouter.post"
      && node.arguments[0]?.getText(source) === '\"/chat/resolve-turn\"') callback = node.arguments[1];
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(callback);
  const compiled = ts.transpileModule(`return (${callback.getText(source)});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function("environment", `with (environment) { ${compiled} }`);
}

for (const scenario of ["allow_yes", "allow_no", "stale_draft", "missing_event", "cross_workspace", "permission_deny", "stage_deny"]) {
  test(`FDC-03A route callback + real engine: ${scenario}, leitura escopada e zero mutações`, async () => {
    const params = reviewEngineParams(scenario === "allow_no" ? "Não" : "Sim");
    const queries: any[] = [];
    const scopedCase = { id: params.body.caseId, threadId: params.body.threadId, flow: "proposal.create",
      status: "ready_for_review", stage: "ready_for_review", metadata: {}, ownerResponsible: "Corretor", nextStep: "Revisão humana",
      blockers: ["Aprovação necessária"], pendingItems: ["Revisão humana"], events: [{ payload: {
        flow: "proposal.create", operationalStatus: "ready_for_review", proposalDraft: params.body.threadState.operational.proposalDraft } }] };
    if (scenario === "stale_draft") scopedCase.events[0].payload.proposalDraft = { ...scopedCase.events[0].payload.proposalDraft, offerAmount: 99000 };
    if (scenario === "missing_event") scopedCase.events = [];
    const prisma = { imobCase: { findFirst: async (query: any) => {
      queries.push(query);
      assert.deepEqual(query.where, { id: params.body.caseId, tenantId: params.authContext.tenantId, workspaceId: params.authContext.workspaceId });
      assert.deepEqual(query.select.events.where, { tenantId: params.authContext.tenantId, workspaceId: params.authContext.workspaceId });
      assert.equal(query.select.events.take, 1);
      return scenario === "cross_workspace" ? null : scopedCase;
    } } };
    const object = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
    let engineCalls = 0;
    let payload: any = null;
    let status = 200;
    const res: any = { json: (body: any) => { payload = body; return res; }, status: (code: number) => { status = code; return res; } };
    const environment = {
      ...params.helpers, asObject: object, asString: params.helpers.asString, parseImobPendingAction, proposalDraftRef,
      readImobWorkspaceAccessProfile: async () => ({ permissions: ["imob.chat.use", "imob.stage.*"], responsibleLabel: "Corretor" }),
      ensureImobWorkspacePermission: () => { if (scenario === "permission_deny") { res.status(403).json({ ok: false }); return false; } return true; },
      ensureImobStagePermission: () => { if (scenario === "stage_deny") { res.status(403).json({ ok: false }); return false; } return true; },
      resolveImobEntitlements: async () => params.entitlements,
      resolveImobTenantRecipeForWorkspace: async () => null,
      resolveImobRecipeMissionContext: () => null,
      imobCrmBusinessRead: { applyCanonicalJourneyToResolvedData: params.helpers.applyCanonicalJourneyToResolvedData },
      resolveImobCrmTurnEngine: async (input: any) => { engineCalls++; return resolveImobCrmTurnEngine(input); },
      recordImobResolveTurnSemanticTelemetry,
      IMOB_CHAT_AGENT_ID: "IMOB_CRM",
    };
    await reviewRouteCallback()(environment)({ authContext: params.authContext, prisma,
      body: { ...params.body, reviewCase: params.reviewCase, reviewDraftRef: params.reviewDraftRef } }, res);
    if (scenario.endsWith("deny")) {
      assert.equal(status, 403);
      assert.equal(engineCalls, 0);
      assert.equal(queries.length, scenario === "permission_deny" ? 0 : 1);
    } else {
      assert.equal(status, 200);
      assert.equal(queries.length, 1);
      assert.equal(engineCalls, 1);
      assert.equal(payload.ok, true);
      assert.equal(payload.data.mode, "consult");
      assert.equal(payload.data.executionRequest, undefined);
      assert.equal(payload.data.runId, undefined);
      if (scenario === "allow_yes") assert.equal(payload.data.conversationState.operational.continuity.pending, null);
      else if (scenario === "allow_no") assert.equal(payload.data.conversationState.operational.continuity.phase, "clarification");
      else assert.match(payload.data.presentation.text, /Não há uma pergunta/);
    }
  });
}


test("FDC-03A aliases normalizados do decoder legado não escapam do tombstone conversacional", async () => {
  const params = reviewEngineParams("confírmo");
  params.body.threadState.operational.continuity = null;
  delete params.body.continuityReplyRef;
  params.body.canonicalPendingAction = makePendingAction();
  const result = await resolveImobCrmTurnEngine(params) as any;
  assert.equal(result.mode, "consult");
  assert.equal(result.executionRequest, undefined);
});

for (const status of ["cancelled", "expired", "confirmed"]) {
  test(`FDC-03A pendingAction histórica ${status} permanece preservada e não impede revisão de dados`, async () => {
    const params = reviewEngineParams();
    params.body.threadState.operational.pendingAction = makePendingAction({ status });
    const result = await resolveImobCrmTurnEngine(params) as any;
    assert.equal(result.conversationState.operational.continuity.pending, null);
    assert.deepEqual(result.conversationState.operational.pendingAction, params.body.threadState.operational.pendingAction);
    assert.equal(result.executionRequest, undefined);
  });
}

for (const scenario of ["other_user", "missing_user", "other_interaction", "missing_capability", "invalid_capability", "descriptor_origin_changed"]) {
  test(`FDC-03A-R1 correlation rejects ${scenario} without helpers or operational effects`, async () => {
    const params = reviewEngineParams("O valor precisa ser 90000");
    if (scenario === "other_user") params.authContext.userId = "another-user";
    if (scenario === "missing_user") delete params.authContext.userId;
    if (scenario === "other_interaction") params.body.continuityContextRef = "v1:another-conversation-agent";
    if (scenario === "missing_capability") delete params.body.continuityContextRef;
    if (scenario === "invalid_capability") params.body.continuityContextRef = "v2:interaction";
    if (scenario === "descriptor_origin_changed") params.body.threadState.operational.continuity.pending.contextRef = "v1:replacement";
    const draft = structuredClone(params.body.threadState.operational.proposalDraft);
    const result = await resolveImobCrmTurnEngine(params) as any;
    assert.match(result.presentation.text, /Não há uma pergunta/);
    assert.equal(result.conversationState.operational.continuity, null);
    assert.deepEqual(result.conversationState.operational.proposalDraft, draft);
    assert.deepEqual(result.caseContext.blockers, ["Aprovação necessária"]);
    assert.equal(result.executionRequest, undefined);
    assert.equal(result.runId, undefined);
  });
}

test("FDC-03A-R1 legacy or unsupported consumers are never given a review question", () => {
  const params = reviewEngineParams();
  delete params.body.threadState.operational.continuity;
  const data = { mode: "execute", conversationState: params.body.threadState, caseContext: params.reviewCase,
    presentation: { text: "legado" }, executionRequest: { input: {} } };
  for (const ref of [undefined, null, "", "v2:foo", "v1:", 1, {}]) {
    assert.equal(attachProposalReviewQuestion(data, params.authContext, ref), data);
  }
  assert.equal(attachProposalReviewQuestion(data, { ...params.authContext, userId: null }, "v1:live"), data);
  const capable: any = attachProposalReviewQuestion(data, params.authContext, "v1:live");
  assert.equal(capable.conversationState.operational.continuity.pending.contextRef, "v1:live");
  assert.equal(capable.executionRequest, data.executionRequest);
});

test("FDC-03A-R1 review summary describes draft amount and type without exposing identity/contact/internal IDs", () => {
  const params = reviewEngineParams();
  delete params.body.threadState.operational.continuity;
  const data = { mode: "execute", conversationState: params.body.threadState, caseContext: params.reviewCase, presentation: { text: "old" } };
  const result: any = attachProposalReviewQuestion(data, params.authContext, "v1:live");
  assert.match(result.presentation.card.lines.join("\n"), /Valor proposto: R\$\s100\.000,00/);
  assert.match(result.presentation.card.lines.join("\n"), /Tipo: venda/);
  assert.doesNotMatch(JSON.stringify(result.presentation), /Maria|47999998888|property-1|Posso preparar/);
  params.body.threadState.operational.proposalDraft.offerAmount = 90000;
  params.body.threadState.operational.proposalDraft.contractType = "rent";
  const changed: any = attachProposalReviewQuestion(data, params.authContext, "v1:live");
  assert.match(changed.presentation.card.lines.join("\n"), /90\.000,00/);
  assert.match(changed.presentation.card.lines.join("\n"), /Tipo: locação/);
  assert.notEqual(changed.conversationState.operational.continuity.pending.draftRef, result.conversationState.operational.continuity.pending.draftRef);
});

test("FDC-03A No → free-text details preserves clarification without presuming ownership or editing", async () => {
  const params = reviewEngineParams("Não");
  const original = structuredClone(params.body.threadState.operational.proposalDraft);
  const first: any = await resolveImobCrmTurnEngine(params);
  params.body.threadState = first.conversationState;
  params.body.continuityReplyRef = first.conversationState.operational.continuity.pending.ref;
  params.body.message = "O valor precisa ser 90000";
  const second: any = await resolveImobCrmTurnEngine(params);
  assert.deepEqual(second.conversationState.operational.continuity.pending, first.conversationState.operational.continuity.pending);
  assert.match(second.presentation.text, /Nenhum dado foi alterado.*Gerar proposta/);
  assert.match(second.presentation.text, /Continuar revisão da proposta.*Mudar de assunto/);
  assert.deepEqual(second.conversationState.operational.proposalDraft, original);
  assert.equal(second.executionRequest, undefined);
});

for (const phase of ["review", "clarification"] as const) {
  test(`FDC-03A-R1 cancellation in ${phase} closes only the conversation question`, async () => {
    const params = reviewEngineParams("Cancelar proposta");
    const op = params.body.threadState.operational;
    op.pendingAction = makePendingAction();
    op.continuity = buildProposalReviewQuestion({ operational: op, ...params.authContext,
      caseId: params.body.caseId, threadId: params.body.threadId, contextRef: params.body.continuityContextRef, phase });
    params.body.continuityReplyRef = op.continuity.pending.ref;
    const original = structuredClone(op);
    const result: any = await resolveImobCrmTurnEngine(params);
    assert.equal(result.conversationState.operational.continuity.pending, null);
    assert.deepEqual(result.conversationState.operational.pendingAction, original.pendingAction);
    assert.deepEqual(result.conversationState.operational.proposalDraft, original.proposalDraft);
    assert.deepEqual(result.caseContext, params.reviewCase);
    assert.match(result.presentation.text, /nenhuma ação, negócio ou registro foi cancelado/);
    assert.equal(result.executionRequest, undefined);
  });
}

test("FDC-03A-R1 full replay within unchanged live scope is consultive, not durable single-use", async () => {
  const params = reviewEngineParams();
  const body = structuredClone(params.body);
  const first: any = await resolveImobCrmTurnEngine(params);
  params.body = structuredClone(body);
  const replay: any = await resolveImobCrmTurnEngine(params);
  for (const result of [first, replay]) {
    assert.equal(result.mode, "consult");
    assert.equal(result.conversationState.operational.continuity.pending, null);
    assert.equal(result.conversationState.operational.proposalDraft.approvalStatus, "pending");
    assert.equal(result.executionRequest, undefined);
    assert.equal(result.runId, undefined);
  }
  params.body = structuredClone(body);
  params.authContext.userId = "other-user";
  assert.match((await resolveImobCrmTurnEngine(params) as any).presentation.text, /Não há uma pergunta/);
});

for (const phase of ["review", "clarification"] as const) {
  for (const message of ["Gostaria de tratar outra coisa", "Mude para COMEX", "Quero mudar para a vertical LEGAL", "Quero revisar o prazo de pagamento da proposta"]) {
    test(`FDC mínimo: intenção não resolvida em ${phase} (${message}) preserva pergunta, draft e autoridade`, async () => {
      const params = reviewEngineParams(message);
      const op = params.body.threadState.operational;
      op.continuity = buildProposalReviewQuestion({ operational: op, ...params.authContext,
        caseId: params.body.caseId, threadId: params.body.threadId, contextRef: params.body.continuityContextRef, phase });
      params.body.continuityReplyRef = op.continuity.pending.ref;
      const before = structuredClone(params.body.threadState);
      const result: any = await resolveImobCrmTurnEngine(params);
      assert.equal(result.mode, "consult");
      assert.match(result.presentation.text, /Continuar revisão da proposta.*Mudar de assunto/);
      assert.deepEqual(result.conversationState.operational, before.operational);
      assert.deepEqual(result.caseContext, params.reviewCase);
      assert.equal(result.executionRequest, undefined);
      assert.equal(result.runId, undefined);
    });
  }
}

for (const choice of ["Continuar revisão da proposta", "Mudar de assunto"]) {
  test(`FDC mínimo: escolha contextual ${choice} preserva pendingAction e approval`, async () => {
    const params = reviewEngineParams(choice);
    params.body.canonicalPendingAction = makePendingAction();
    params.body.threadState.operational.pendingAction = params.body.canonicalPendingAction;
    const before = structuredClone(params.body.threadState.operational);
    const result: any = await resolveImobCrmTurnEngine(params);
    assert.equal(result.mode, "consult");
    assert.deepEqual(result.conversationState.operational.proposalDraft, before.proposalDraft);
    assert.deepEqual(result.conversationState.operational.pendingAction, before.pendingAction);
    assert.deepEqual(result.caseContext, params.reviewCase);
    assert.equal(result.executionRequest, undefined);
    assert.equal(result.runId, undefined);
    if (choice === "Mudar de assunto") {
      assert.equal(result.conversationState.operational.continuity.pending, null);
      assert.match(result.presentation.text, /disponibilidade.*verificada/);
    } else {
      assert.notEqual(result.conversationState.operational.continuity.pending.ref, before.continuity.pending.ref);
      params.body.threadState = result.conversationState;
      params.body.continuityReplyRef = result.conversationState.operational.continuity.pending.ref;
      params.body.message = "Sim";
      const collision: any = await resolveImobCrmTurnEngine(params);
      assert.equal(collision.mode, "consult");
      assert.deepEqual(collision.conversationState.operational.pendingAction, before.pendingAction);
      assert.equal(collision.executionRequest, undefined);
    }
  });
}

test("FDC mínimo: descritor respondido não promove confirmação longa ou intenção desconhecida a operação", async () => {
  for (const message of ["Sim estão corretos", "pode executar", "Quero confirmar a proposta", "Gostaria de tratar outra coisa"]) {
    const params = reviewEngineParams(message);
    params.body.threadState.operational.continuity.pending = null;
    params.body.continuityReplyRef = null;
    params.body.canonicalPendingAction = makePendingAction();
    const draft = structuredClone(params.body.threadState.operational.proposalDraft);
    const result: any = await resolveImobCrmTurnEngine(params);
    assert.equal(result.mode, "consult");
    assert.equal(result.executionRequest, undefined);
    assert.equal(result.runId, undefined);
    assert.deepEqual(result.conversationState.operational.proposalDraft, draft);
    assert.equal(result.conversationState.operational.proposalDraft.approvalStatus, "pending");
  }
});
