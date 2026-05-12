import test from "node:test";
import assert from "node:assert/strict";

import { ImobCrmMutationService } from "../services/imob/crm/imobCrmMutationService";
import { resolveImobCrmTurnEngine } from "../services/imob/crm/imobCrmTurnEngine";
import { createNextImobOperationalState } from "../services/imob/imobConversationState";
import { resolveImobTurn } from "../services/imob/imobTurnResolver";

function createMockPrisma() {
  const owners: any[] = [];
  const leads: any[] = [
    {
      id: "lead-1",
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      name: "Lead 01",
      phone: "11 99999-9999",
      email: "lead01@example.com",
      goal: "locacao",
      targetCity: "Itapema",
      budgetMaxCents: 350000,
      updatedAt: new Date("2026-01-01"),
    },
  ];
  const properties: any[] = [];
  const cases: any[] = [];
  const caseEvents: any[] = [];
  const memoryEvents: any[] = [];
  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

  return {
    owners,
    leads,
    properties,
    cases,
    caseEvents,
    memoryEvents,
    imobOwner: {
      create: async ({ data }: any) => {
        const created = { id: `owner-${owners.length + 1}`, ...data, updatedAt: new Date("2026-01-02") };
        owners.push(created);
        return created;
      },
      findFirst: async ({ where }: any) => {
        const found = owners.find((item) => (
          (!where.id || item.id === where.id) &&
          (!where.tenantId || item.tenantId === where.tenantId) &&
          (!where.workspaceId || item.workspaceId === where.workspaceId) &&
          item.status !== "archived"
        ));
        return found ? clone(found) : null;
      },
      update: async ({ where, data }: any) => {
        const owner = owners.find((item) => item.id === where.id);
        if (!owner) throw new Error("owner not found");
        Object.assign(owner, data);
        return clone(owner);
      },
    },
    imobLead: {
      findFirst: async ({ where }: any) => {
        const found = leads.find((item) => (
          (!where.id || item.id === where.id) &&
          (!where.tenantId || item.tenantId === where.tenantId) &&
          (!where.workspaceId || item.workspaceId === where.workspaceId) &&
          (
            !where.OR
            || where.OR.some((condition: any) => (
              (condition.phone && condition.phone === item.phone) ||
              (condition.email && condition.email === item.email) ||
              (condition.name && condition.name === item.name)
            ))
          )
        ));
        return found ? clone(found) : null;
      },
      create: async ({ data }: any) => {
        const created = { id: `lead-${leads.length + 1}`, ...data, updatedAt: new Date("2026-01-03") };
        leads.push(created);
        return clone(created);
      },
      update: async ({ where, data }: any) => {
        const lead = leads.find((item) => item.id === where.id);
        if (!lead) throw new Error("lead not found");
        Object.assign(lead, data);
        return clone(lead);
      },
    },
    imobProperty: {
      count: async ({ where }: any = {}) => properties.filter((item) => (
        (!where?.tenantId || item.tenantId === where.tenantId) &&
        (!where?.workspaceId || item.workspaceId === where.workspaceId) &&
        (!where?.ownerId || item.ownerId === where.ownerId) &&
        item.status !== "archived"
      )).length,
      findMany: async ({ where }: any = {}) => properties.filter((item) => (
        (!where?.tenantId || item.tenantId === where.tenantId) &&
        (!where?.workspaceId || item.workspaceId === where.workspaceId) &&
        (!where?.address || item.address === where.address) &&
        item.status !== "archived"
      )).map(clone),
      findFirst: async ({ where }: any) => {
        const found = properties.find((item) => (
          (!where.id || item.id === where.id) &&
          (!where.tenantId || item.tenantId === where.tenantId) &&
          (!where.workspaceId || item.workspaceId === where.workspaceId) &&
          (!where.address || item.address === where.address.equals) &&
          item.status !== "archived"
        ));
        return found ? clone(found) : null;
      },
      create: async ({ data }: any) => {
        const owner = data.ownerId ? owners.find((item) => item.id === data.ownerId) ?? null : null;
        const created = {
          id: `property-${properties.length + 1}`,
          ...data,
          updatedAt: new Date("2026-01-03"),
          owner: owner ? { id: owner.id, name: owner.name } : null,
        };
        properties.push(created);
        return clone(created);
      },
      update: async ({ where, data }: any) => {
        const property = properties.find((item) => item.id === where.id);
        if (!property) throw new Error("property not found");
        Object.assign(property, data);
        if (data.owner && "connect" in data.owner) {
          const owner = owners.find((candidate) => candidate.id === data.owner.connect.id) ?? null;
          property.owner = owner ? { id: owner.id, name: owner.name } : null;
        }
        return clone(property);
      },
    },
    imobCase: {
      count: async () => 0,
      findFirst: async ({ where }: any) => {
        const found = cases
          .filter((item) => (
            (!where.id || item.id === where.id) &&
            (!where.threadId || item.threadId === where.threadId) &&
            item.tenantId === where.tenantId &&
            item.workspaceId === where.workspaceId
          ))
          .sort((a, b) => new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime())[0];
        return found ? clone(found) : null;
      },
      create: async ({ data }: any) => {
        const owner = data.ownerId ? owners.find((item) => item.id === data.ownerId) ?? null : null;
        const property = data.propertyId ? properties.find((item) => item.id === data.propertyId) ?? null : null;
        const lead = data.leadId ? leads.find((item) => item.id === data.leadId) ?? null : null;
        const created = {
          id: `case-${cases.length + 1}`,
          ...data,
          updatedAt: new Date("2026-01-04"),
          owner: owner ? { id: owner.id, name: owner.name } : null,
          property: property ? { id: property.id, propertyType: property.propertyType, city: property.city, neighborhood: property.neighborhood } : null,
          lead: lead ? { id: lead.id, name: lead.name } : null,
        };
        cases.push(created);
        return clone(created);
      },
      update: async ({ where, data }: any) => {
        const item = cases.find((caseItem) => caseItem.id === where.id);
        if (!item) throw new Error("case not found");
        Object.assign(item, data);
        item.updatedAt = new Date("2026-01-05");
        if (data.owner && "connect" in data.owner) {
          const owner = owners.find((candidate) => candidate.id === data.owner.connect.id) ?? null;
          item.owner = owner ? { id: owner.id, name: owner.name } : null;
        }
        if (data.property && "connect" in data.property) {
          const property = properties.find((candidate) => candidate.id === data.property.connect.id) ?? null;
          item.property = property ? { id: property.id, propertyType: property.propertyType, city: property.city, neighborhood: property.neighborhood } : null;
        }
        if (data.lead && "connect" in data.lead) {
          const lead = leads.find((candidate) => candidate.id === data.lead.connect.id) ?? null;
          item.lead = lead ? { id: lead.id, name: lead.name } : null;
        }
        return clone(item);
      },
    },
    imobCaseEvent: {
      create: async ({ data }: any) => {
        caseEvents.push(data);
        return { id: `case-event-${caseEvents.length}`, ...data };
      },
    },
    memoryEvent: {
      findMany: async ({ where }: any = {}) => memoryEvents.filter((item) => (
        (!where?.tenantId || item.tenantId === where.tenantId) &&
        (!where?.workspaceId || item.workspaceId === where.workspaceId) &&
        (!where?.key || item.key === where.key)
      )),
      create: async ({ data }: any) => {
        memoryEvents.push(data);
        return { id: `event-${memoryEvents.length}`, ...data };
      },
    },
    $transaction: async (callback: any) => callback({
      imobCase: {
        create: async ({ data }: any) => {
          const owner = data.ownerId ? owners.find((item) => item.id === data.ownerId) ?? null : null;
          const property = data.propertyId ? properties.find((item) => item.id === data.propertyId) ?? null : null;
          const lead = data.leadId ? leads.find((item) => item.id === data.leadId) ?? null : null;
          const created = {
            id: `case-${cases.length + 1}`,
            ...data,
            updatedAt: new Date("2026-01-04"),
            owner: owner ? { id: owner.id, name: owner.name } : null,
            property: property ? { id: property.id, propertyType: property.propertyType, city: property.city, neighborhood: property.neighborhood } : null,
            lead: lead ? { id: lead.id, name: lead.name } : null,
          };
          cases.push(created);
          return clone(created);
        },
        update: async ({ where, data }: any) => {
          const item = cases.find((caseItem) => caseItem.id === where.id);
          if (!item) throw new Error("case not found");
          Object.assign(item, data);
          item.updatedAt = new Date("2026-01-05");
          if (data.owner && "connect" in data.owner) {
            const owner = owners.find((candidate) => candidate.id === data.owner.connect.id) ?? null;
            item.owner = owner ? { id: owner.id, name: owner.name } : null;
          }
          if (data.property && "connect" in data.property) {
            const property = properties.find((candidate) => candidate.id === data.property.connect.id) ?? null;
            item.property = property ? { id: property.id, propertyType: property.propertyType, city: property.city, neighborhood: property.neighborhood } : null;
          }
          if (data.lead && "connect" in data.lead) {
            const lead = leads.find((candidate) => candidate.id === data.lead.connect.id) ?? null;
            item.lead = lead ? { id: lead.id, name: lead.name } : null;
          }
          return clone(item);
        },
      },
      imobCaseEvent: {
        create: async ({ data }: any) => {
          caseEvents.push(data);
          return { id: `case-event-${caseEvents.length}`, ...data };
        },
      },
    }),
  };
}

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
        ownerName: "Owner 01",
        ownerPhone: "4744444444",
        ownerEmail: "owner01@example.com",
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

test("IMOB golden path lead -> property -> visit keeps case-aware next step after property save", async () => {
  const prisma = createMockPrisma();
  prisma.cases.push({
    id: "case-lead-property-1",
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    threadId: "thread-lead-property-1",
    flow: "lead.qualify",
    stage: "ready_for_review",
    status: "ready_for_review",
    ownerResponsible: "Corretor",
    nextStep: "Vincular o lead a um imóvel ou avançar para visita.",
    blockers: [],
    pendingItems: [],
    leadId: "lead-1",
    lead: { id: "lead-1", name: "Lead 01" },
    metadata: {},
    updatedAt: new Date("2026-01-05"),
  });

  const service = new ImobCrmMutationService(prisma as any);
  const persisted = await service.upsertCaseFromResolvedTurn({
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    userId: "user-1",
  }, {
    caseId: "case-lead-property-1",
    threadId: "thread-lead-property-1",
    threadLabel: "Captação",
    resolved: {
      mode: "execute",
      action: "realestate.register_property",
      threadLabel: "Captação",
      presentation: {
        text: "Cadastro do imóvel processado com sucesso.",
        owner: "Corretor",
        nextStep: "Avançar para visita",
        pendingFieldLabels: [],
      },
      executionRequest: null,
      conversationState: {
        operational: {
          flow: "property.create",
          status: "ready_for_review",
          pendingFields: [],
          propertyDraft: {
            propertyType: "apartamento",
            goal: "locacao",
            city: "Itapema",
            address: "Rua 100",
          },
        },
      },
    } as any,
  });

  assert.equal(persisted?.lead?.id, "lead-1");
  assert.equal(persisted?.property?.city, "Itapema");

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
            address: "Rua 100",
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
    caseContext: persisted,
    presentation: {
      text: "Cadastro do imóvel processado com sucesso.",
    },
  });

  const resolved = await resolveImobCrmTurnEngine(params);
  const actions = ((resolved as any).presentation?.blocks ?? []).flatMap((block: any) => block?.ctas ?? []);
  assert.ok(actions.some((item: any) => item.label === "Avançar para visita"));
  assert.ok(!actions.some((item: any) => item.label === "Qualificar lead"));
});

test("IMOB golden path threadId fallback keeps the same active case during property capture", async () => {
  const prisma = createMockPrisma();
  prisma.cases.push({
    id: "case-thread-fallback-1",
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    threadId: "thread-shared-1",
    flow: "lead.qualify",
    stage: "ready_for_review",
    status: "ready_for_review",
    ownerResponsible: "Corretor",
    nextStep: "Vincular o lead a um imóvel ou avançar para visita.",
    blockers: [],
    pendingItems: [],
    leadId: "lead-1",
    lead: { id: "lead-1", name: "Lead 01" },
    metadata: {},
    updatedAt: new Date("2026-01-06"),
  });

  const service = new ImobCrmMutationService(prisma as any);
  const persisted = await service.upsertCaseFromResolvedTurn({
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    userId: "user-1",
  }, {
    threadId: "thread-shared-1",
    threadLabel: "Captação",
    resolved: {
      mode: "execute",
      action: "realestate.register_property",
      threadLabel: "Captação",
      presentation: {
        text: "Cadastro do imóvel processado com sucesso.",
        owner: "Corretor",
        nextStep: "Avançar para visita",
        pendingFieldLabels: [],
      },
      executionRequest: null,
      conversationState: {
        operational: {
          flow: "property.create",
          status: "ready_for_review",
          pendingFields: [],
          propertyDraft: {
            propertyType: "kitnet",
            goal: "locacao",
            city: "Itajaí",
            address: "Rua 7 de Setembro",
          },
        },
      },
    } as any,
  });

  assert.equal(persisted?.caseId, "case-thread-fallback-1");
  assert.equal(persisted?.lead?.id, "lead-1");
  assert.equal(persisted?.property?.city, "Itajaí");
});

test("IMOB golden path scan -> selection -> property.create.from_scan preserves canonical locked city on save", () => {
  const confirmed = resolveImobTurn({
    message: "confirmar seleção do scan prop-1",
    threadState: {
      slots: {
        goal: null,
        city: null,
        region: null,
        neighborhood: null,
        budgetMax: null,
        bedrooms: null,
        bathrooms: null,
        propertyType: null,
      },
      mode: "consult",
      pendingSlot: "none",
      resultOffset: 0,
      operational: {
        flow: "property.market_scan",
        status: "ready_for_review",
        pendingFields: [],
        propertyDraft: {
          propertyId: "prop-1",
          propertyType: "apartamento",
          goal: "locacao",
          cep: null,
          city: "Itajaí",
          neighborhood: "Centro",
          bedrooms: 2,
          bathrooms: null,
          address: "Rua 1500",
          origin: {
            source: "internal_crm",
            sourceId: "prop-1",
            providerId: "internal_crm",
            retrievedAt: "2026-05-09T12:00:00.000Z",
            scanId: "market-scan-1",
          },
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
        marketScanSelection: {
          status: "pending_confirmation",
          scanId: "market-scan-1",
          source: "internal_crm",
          sourceId: "prop-1",
          providerId: "internal_crm",
          retrievedAt: "2026-05-09T12:00:00.000Z",
          city: "Itajaí",
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
      },
    },
    access: { tenantId: "tenant-A", workspaceId: "workspace-A", entitlements: { REAL_ESTATE_CORE: true } },
  });

  assert.equal(confirmed.conversationState.operational?.flow, "property.create");
  assert.equal((confirmed as any).conversationState?.operational?.propertyDraft?.cityCanonical?.locked, true);

  const saved = createNextImobOperationalState(
    {
      ...(confirmed.conversationState.operational as any),
      status: "collecting",
      pendingFields: ["address"],
    },
    "capture",
    "salvar cadastro",
    {
      goal: "locacao",
      city: "Itajái",
      region: null,
      neighborhood: null,
      budgetMax: null,
      bedrooms: 2,
      bathrooms: null,
      propertyType: "apartamento",
    },
  );

  assert.equal((saved as any)?.propertyDraft?.city, "Itajaí");
  assert.equal((saved as any)?.propertyDraft?.cityCanonical?.canonicalName, "Itajaí");
  assert.equal((saved as any)?.propertyDraft?.cityCanonical?.locked, true);
});

test("IMOB golden path owner dedupe routes explicit update-existing choice to direct owner edit", async () => {
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

test("IMOB golden path explicit visit transition wins over lead-ready guard", async () => {
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

test("IMOB golden path case review preserves blockers and next step in consult mode", async () => {
  const params = createEngineParams({
    body: {
      message: "mostrar bloqueios do caso",
      threadState: {
        mode: "execute",
        pendingSlot: "none",
        resultOffset: 0,
        slots: {},
        operational: {
          flow: "owner.create",
          status: "collecting",
          pendingFields: ["ownerDocument"],
          nextStep: "Completar dados do proprietário antes de avançar a captação.",
          blocker: "Dados do proprietário ainda estão incompletos para seguir.",
          ownerDraft: {
            ownerName: "Carlos",
            ownerPhone: "47999999999",
            ownerEmail: "carlos@example.com",
            ownerDocument: null,
          },
        },
      },
    },
  });
  params.helpers.resolveImobOperationalConsult = async () => ({
    mode: "consult",
    action: "crm.case.pipeline_status",
    threadLabel: "Caso",
    conversationState: params.body.threadState,
    presentation: {
      text: "Caso Proprietário localizado.",
      card: {
        title: "Caso Proprietário",
        lines: [
          "Pendências: documento do proprietário",
          "Próximo passo: Completar dados do proprietário antes de avançar a captação.",
        ],
      },
    },
  });

  const resolved = await resolveImobCrmTurnEngine(params);
  assert.equal(resolved.mode, "consult");
  assert.equal(resolved.action, "crm.case.pipeline_status");
  assert.match((resolved as any).presentation?.text ?? "", /Caso Proprietário localizado/i);
});
