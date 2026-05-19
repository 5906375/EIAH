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
  assert.deepEqual((resolved as any).conversationState?.operational?.marketScanRun?.sourceIds, ["tenant_inventory_import", "internal_crm"]);
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
  assert.match((resolved as any).presentation?.text ?? "", /Inteligência de mercado concluída/i);
  assert.match((resolved as any).presentation?.text ?? "", /Ação recomendada/i);
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

test("IMOB_CRM turn engine offers visit instead of requalifying lead after property success when case already has lead", async () => {
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
  assert.ok(actions.some((item: any) => item.label === "Vincular proprietário"));
  assert.ok(!actions.some((item: any) => item.label === "Cadastrar proprietário"));
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
