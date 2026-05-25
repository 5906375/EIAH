import test from "node:test";
import assert from "node:assert/strict";
import { ImobCrmMutationService } from "../services/imob/crm/imobCrmMutationService";

function createMockPrisma() {
  const owners: any[] = [];
  const leads: any[] = [
    {
      id: "lead-1",
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      name: "Merlo",
      budgetMaxCents: null,
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
        const created = {
          id: `owner-${owners.length + 1}`,
          ...data,
          updatedAt: new Date("2026-01-02"),
        };
        owners.push(created);
        return created;
      },
      findFirst: async ({ where }: any) => {
        const found = owners.find((item) => (
          (!where.id || item.id === where.id) &&
          (!where.tenantId || item.tenantId === where.tenantId) &&
          (!where.workspaceId || item.workspaceId === where.workspaceId) &&
          (!where.OR || where.OR.some((condition: any) => (
            (condition.document && condition.document === item.document) ||
            (condition.phone && condition.phone === item.phone) ||
            (condition.email && condition.email === item.email) ||
            (condition.name && condition.name === item.name)
          ))) &&
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
          (!where.OR || where.OR.some((condition: any) => (
            (condition.phone && condition.phone === item.phone) ||
            (condition.email && condition.email === item.email) ||
            (condition.name && condition.name === item.name)
          )))
        ));
        return found ? clone(found) : null;
      },
      create: async ({ data }: any) => {
        const created = {
          id: `lead-${leads.length + 1}`,
          ...data,
          updatedAt: new Date("2026-01-03"),
        };
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
        const created = {
          id: `property-${properties.length + 1}`,
          ...data,
          updatedAt: new Date("2026-01-03"),
          owner: null,
        };
        properties.push(created);
        return clone(created);
      },
      update: async ({ where, data }: any) => {
        const property = properties.find((item) => item.id === where.id);
        if (!property) throw new Error("property not found");
        Object.assign(property, data);
        return clone(property);
      },
    },
    imobCase: {
      count: async () => 0,
      findFirst: async ({ where }: any) => cases.find((item) => (
        (!where.id || item.id === where.id) &&
        (!where.threadId || item.threadId === where.threadId) &&
        item.tenantId === where.tenantId &&
        item.workspaceId === where.workspaceId
      )) ?? null,
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

test("IMOB_CRM mutation service creates owners with workspace scope and audit event", async () => {
  const prisma = createMockPrisma();
  const service = new ImobCrmMutationService(prisma as any);

  const created = await service.createOwner({
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    userId: "user-1",
  }, {
    name: "João",
    email: "joao@example.com",
  });

  assert.equal(created.workspaceId, "workspace-1");
  const auditEvents = prisma.memoryEvents.filter((event) => event.key === "crm.audit");
  assert.equal(auditEvents.length, 1);
  assert.equal(auditEvents[0].metadata.subjectType, "owner");
  assert.equal(auditEvents[0].metadata.action, "created");
  assert.equal(auditEvents[0].metadata.userId, "user-1");
});

test("IMOB_CRM mutation service updates leads inside workspace and records audit", async () => {
  const prisma = createMockPrisma();
  const service = new ImobCrmMutationService(prisma as any);

  const updated = await service.updateLead({
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    userId: "user-1",
  }, "lead-1", {
    budgetMaxCents: 200000,
  });

  assert.equal(updated?.budgetMaxCents, 200000);
  const auditEvents = prisma.memoryEvents.filter((event) => event.key === "crm.audit");
  const shadowEvents = prisma.memoryEvents.filter((event) => event.key === "imob.shadow.execution");
  assert.equal(auditEvents.length, 1);
  assert.equal(auditEvents[0].metadata.subjectType, "lead");
  assert.equal(auditEvents[0].metadata.action, "updated");
  assert.equal((auditEvents[0].metadata.before as any).budgetMaxCents, null);
  assert.equal((auditEvents[0].metadata.after as any).budgetMaxCents, 200000);
  assert.equal(shadowEvents.length, 2);
  assert.equal(shadowEvents.some((event) => event.metadata.capabilityId === "lead.scoring"), true);
  assert.equal(shadowEvents.some((event) => event.metadata.capabilityId === "relationship.commercial_memory"), true);
});

test("IMOB_CRM mutation service persists conversational lead case with audit trail", async () => {
  const prisma = createMockPrisma();
  const service = new ImobCrmMutationService(prisma as any);

  const persisted = await service.upsertCaseFromResolvedTurn({
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    userId: "user-1",
  }, {
    threadId: "thread-1",
    threadLabel: "Lead",
    resolved: {
      mode: "execute",
      action: "realestate.apply_adjustment",
      threadLabel: "Lead",
      presentation: {
        text: "Cadastro do lead Merlo atualizado com sucesso.",
        owner: "Corretor",
        nextStep: "Qualificar interesse e vincular imóvel.",
        pendingFieldLabels: [],
      },
      executionRequest: null,
      conversationState: {
        operational: {
          flow: "lead.qualify",
          status: "ready_for_review",
          pendingFields: [],
          leadDraft: {
            leadName: "Merlo",
            leadEmail: "mmerlon.adv@gmail.com",
            leadPhone: "47 999674434",
            desiredGoal: "locacao",
            desiredCity: "Balneário Camboriú",
            budgetMax: 2000,
            discoverySignals: {
              urgency: "high",
              painPoint: "precisa de espaço para home office",
              motivation: "mudança por trabalho",
              budgetFlexibility: "moderate",
              decisionMaker: "shared",
              timeline: "resolver ainda este mês",
              pendingSignals: [],
            },
          },
        },
      },
    },
  });

  assert.equal(persisted?.flow, "lead.qualify");
  assert.equal(persisted?.status, "ready_for_review");
  assert.equal(persisted?.lead?.id, "lead-1");
  assert.equal(persisted?.lead?.name, "Merlo");
  assert.equal(prisma.cases.length, 1);
  assert.equal(prisma.cases[0].workspaceId, "workspace-1");
  assert.equal(prisma.cases[0].leadId, "lead-1");
  assert.equal(prisma.caseEvents.length, 1);
  assert.equal(prisma.caseEvents[0].type, "case.created_from_turn");
  assert.equal((prisma.leads[0].metadata?.discoverySignals as any)?.urgency, "high");
  assert.equal((prisma.leads[0].metadata?.discoverySignals as any)?.decisionMaker, "shared");
  assert.equal(prisma.memoryEvents.some((event) => event.metadata.subjectType === "lead" && event.metadata.action === "updated"), true);
  assert.equal(prisma.memoryEvents.some((event) => event.metadata.subjectType === "case" && event.metadata.action === "created"), true);
  const shadowEvents = prisma.memoryEvents.filter((event) => event.key === "imob.shadow.execution");
  assert.equal(shadowEvents.some((event) => event.metadata.capabilityId === "lead.scoring"), true);
  assert.equal(shadowEvents.some((event) => event.metadata.capabilityId === "reengagement.continuous"), true);
  assert.equal(shadowEvents.some((event) => event.metadata.capabilityId === "inventory.active_watch"), true);
});

test("IMOB_CRM mutation service skips duplicate shadow execution for identical lead state", async () => {
  const prisma = createMockPrisma();
  const service = new ImobCrmMutationService(prisma as any);

  await service.updateLead({
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    userId: "user-1",
  }, "lead-1", {
    budgetMaxCents: 200000,
  });

  await service.updateLead({
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    userId: "user-1",
  }, "lead-1", {
    budgetMaxCents: 200000,
  });

  const shadowEvents = prisma.memoryEvents.filter((event) => event.key === "imob.shadow.execution");
  assert.equal(shadowEvents.length, 2);
  assert.equal(shadowEvents.filter((event) => event.metadata.capabilityId === "lead.scoring").length, 1);
  assert.equal(shadowEvents.filter((event) => event.metadata.capabilityId === "relationship.commercial_memory").length, 1);
});

test("IMOB_CRM mutation service dedupes and preserves market scan origin before property creation", async () => {
  const prisma = createMockPrisma();
  prisma.properties.push({
    id: "property-existing-1",
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    propertyType: "apartamento",
    goal: "locacao",
    address: "Rua 1500",
    city: "Itajaí",
    neighborhood: "Centro",
    bedrooms: 2,
    bathrooms: null,
    status: "pending_data",
    metadata: {
      externalPropertyRef: "prop-1",
    },
    updatedAt: new Date("2026-01-02"),
  });

  const service = new ImobCrmMutationService(prisma as any);

  const persisted = await service.upsertCaseFromResolvedTurn({
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    userId: "user-1",
  }, {
    threadId: "thread-market-scan",
    threadLabel: "Captação",
    resolved: {
      mode: "execute",
      action: "realestate.register_property",
      threadLabel: "Captação",
      presentation: {
        text: "Confirmando a captação do imóvel selecionado no scan.",
        owner: "Corretor",
        nextStep: "Validar proprietário e seguir com a captação.",
        pendingFieldLabels: [],
      },
      executionRequest: null,
      conversationState: {
        operational: {
          flow: "property.create",
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
    },
  });

  assert.equal(persisted?.flow, "property.create");
  assert.equal(prisma.properties.length, 1);
  assert.equal(prisma.properties[0].id, "property-existing-1");
  assert.equal((prisma.properties[0].metadata as any)?.externalPropertyRef, "prop-1");
  assert.deepEqual((prisma.properties[0].metadata as any)?.marketScanOrigin, {
    source: "internal_crm",
    sourceId: "prop-1",
    providerId: "internal_crm",
    retrievedAt: "2026-05-09T12:00:00.000Z",
    scanId: "market-scan-1",
  });
  assert.equal(prisma.cases[0].propertyId, "property-existing-1");
  assert.equal((prisma.caseEvents[0].payload.marketScanSelection as any)?.sourceId, "prop-1");
});

test("IMOB_CRM mutation service dedupes property by market scan origin even without externalPropertyRef", async () => {
  const prisma = createMockPrisma();
  prisma.properties.push({
    id: "property-existing-origin-1",
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    propertyType: "apartamento",
    goal: "locacao",
    address: "Rua das Flores, 10",
    city: "Itajaí",
    neighborhood: "Centro",
    bedrooms: 2,
    bathrooms: null,
    status: "pending_data",
    metadata: {
      marketScanOrigin: {
        providerId: "internal_crm",
        sourceId: "origin-1",
        scanId: "scan-42",
      },
    },
    updatedAt: new Date("2026-01-03"),
  });

  const service = new ImobCrmMutationService(prisma as any);

  const persisted = await service.upsertCaseFromResolvedTurn({
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    userId: "user-1",
  }, {
    threadId: "thread-market-scan-origin",
    threadLabel: "Captação",
    resolved: {
      mode: "execute",
      action: "realestate.register_property",
      threadLabel: "Captação",
      presentation: {
        text: "Confirmando a captação do imóvel selecionado no scan.",
        owner: "Corretor",
        nextStep: "Validar proprietário e seguir com a captação.",
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
            city: "Itajaí",
            neighborhood: "Centro",
            bedrooms: 2,
            bathrooms: null,
            address: "Rua das Flores, 10",
            origin: {
              source: "internal_crm",
              sourceId: "origin-1",
              providerId: "internal_crm",
              retrievedAt: "2026-05-24T12:00:00.000Z",
              scanId: "scan-42",
            },
          },
          marketScanSelection: {
            status: "pending_confirmation",
            scanId: "scan-42",
            source: "internal_crm",
            sourceId: "origin-1",
            providerId: "internal_crm",
            retrievedAt: "2026-05-24T12:00:00.000Z",
            city: "Itajaí",
            goal: "locacao",
            propertyType: "apartamento",
            bedrooms: 2,
            neighborhood: "Centro",
            address: "Rua das Flores, 10",
            title: "Apartamento 2 quartos",
            url: null,
          },
        },
      },
    },
  });

  assert.equal(persisted?.property?.id, "property-existing-origin-1");
  assert.equal(prisma.properties.length, 1);
  assert.equal(prisma.memoryEvents.some((event) => (
    event.key === "crm.audit"
    && event.metadata.subjectType === "property"
    && event.metadata.mergeKind === "dedupe_merge"
    && event.metadata.subjectId === "property-existing-origin-1"
  )), true);
  assert.deepEqual((prisma.caseEvents[0].payload.dedupeMerges as any[])[0], {
    entity: "property",
    subjectId: "property-existing-origin-1",
    matchedBy: ["marketScanOrigin", "address", "city"],
    sourceFlow: "property.create",
    dedupeKey: null,
  });
});

test("IMOB_CRM mutation service records auditable owner merge when reusing existing owner by dedupe", async () => {
  const prisma = createMockPrisma();
  prisma.owners.push({
    id: "owner-existing-1",
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    name: "Carlos Alberto",
    document: "12345678900",
    email: "carlos@example.com",
    phone: "47999990000",
    status: "pending_data",
    updatedAt: new Date("2026-01-03"),
  });
  const service = new ImobCrmMutationService(prisma as any);

  const persisted = await service.upsertCaseFromResolvedTurn({
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    userId: "user-1",
  }, {
    threadId: "thread-owner-dedupe",
    threadLabel: "Proprietário",
    resolved: {
      mode: "execute",
      action: "realestate.register_owner",
      threadLabel: "Proprietário",
      presentation: {
        text: "Cadastro existente do proprietário Carlos Alberto atualizado com sucesso.",
        owner: "Corretor",
        nextStep: "Seguir com a revisão do caso.",
        pendingFieldLabels: [],
      },
      executionRequest: null,
      conversationState: {
        operational: {
          flow: "owner.create",
          status: "ready_for_review",
          pendingFields: [],
          ownerDraft: {
            ownerName: "Carlos Alberto",
            ownerDocument: "12345678900",
            ownerEmail: "carlos@example.com",
            ownerPhone: "47999990000",
          },
        },
      },
    },
  });

  assert.equal(persisted?.owner?.id, "owner-existing-1");
  assert.equal(prisma.owners.length, 1);
  assert.equal(prisma.memoryEvents.some((event) => (
    event.key === "crm.audit"
    && event.metadata.subjectType === "owner"
    && event.metadata.mergeKind === "dedupe_merge"
    && event.metadata.subjectId === "owner-existing-1"
  )), true);
  assert.deepEqual((prisma.caseEvents[0].payload.dedupeMerges as any[])[0], {
    entity: "owner",
    subjectId: "owner-existing-1",
    matchedBy: ["document", "phone", "email", "name"],
    sourceFlow: "owner.create",
    dedupeKey: null,
  });
});

test("IMOB_CRM mutation service keeps property conversion idempotent on scan reconfirmation in the same thread", async () => {
  const prisma = createMockPrisma();
  const service = new ImobCrmMutationService(prisma as any);

  const params = {
    threadId: "thread-scan-rerun",
    threadLabel: "Captação",
    resolved: {
      mode: "execute",
      action: "realestate.register_property",
      threadLabel: "Captação",
      presentation: {
        text: "Confirmando a captação do imóvel selecionado no scan.",
        owner: "Corretor",
        nextStep: "Validar proprietário e seguir com a captação.",
        pendingFieldLabels: [],
      },
      executionRequest: null,
      conversationState: {
        operational: {
          flow: "property.create",
          status: "ready_for_review",
          pendingFields: [],
          propertyDraft: {
            propertyId: "prop-rerun-1",
            propertyType: "apartamento",
            goal: "locacao",
            city: "Itajaí",
            neighborhood: "Centro",
            bedrooms: 2,
            bathrooms: null,
            address: "Rua Rerun, 101",
            origin: {
              source: "internal_crm",
              sourceId: "prop-rerun-1",
              providerId: "internal_crm",
              retrievedAt: "2026-05-24T12:10:00.000Z",
              scanId: "scan-rerun-1",
            },
          },
          marketScanSelection: {
            status: "pending_confirmation",
            scanId: "scan-rerun-1",
            source: "internal_crm",
            sourceId: "prop-rerun-1",
            providerId: "internal_crm",
            retrievedAt: "2026-05-24T12:10:00.000Z",
            city: "Itajaí",
            goal: "locacao",
            propertyType: "apartamento",
            bedrooms: 2,
            neighborhood: "Centro",
            address: "Rua Rerun, 101",
            title: "Apartamento 2 quartos",
            url: null,
          },
        },
      },
    },
  } as any;

  const first = await service.upsertCaseFromResolvedTurn({
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    userId: "user-1",
  }, params);

  const second = await service.upsertCaseFromResolvedTurn({
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    userId: "user-1",
  }, params);

  assert.equal(prisma.properties.length, 1);
  assert.equal(prisma.cases.length, 1);
  assert.equal(first?.property?.id, second?.property?.id);
  assert.equal(first?.caseId, second?.caseId);
});

test("IMOB_CRM mutation service keeps linked lead context after property capture success", async () => {
  const prisma = createMockPrisma();
  prisma.cases.push({
    id: "case-1",
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    flow: "lead.qualify",
    stage: "ready_for_review",
    status: "ready_for_review",
    ownerResponsible: "Corretor",
    nextStep: "Vincular o lead a um imóvel ou avançar para visita.",
    blockers: [],
    pendingItems: [],
    leadId: "lead-1",
    lead: { id: "lead-1", name: "Merlo" },
    metadata: {},
  });

  const service = new ImobCrmMutationService(prisma as any);
  const persisted = await service.upsertCaseFromResolvedTurn({
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    userId: "user-1",
  }, {
    caseId: "case-1",
    threadId: "thread-1",
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

  assert.equal(persisted?.lead?.id, "lead-1");
  assert.equal(persisted?.lead?.name, "Merlo");
  assert.equal(persisted?.property?.city, "Itajaí");
});

test("IMOB_CRM mutation service inherits lead context from latest thread case during property capture", async () => {
  const prisma = createMockPrisma();
  prisma.cases.push({
    id: "case-thread-1",
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
    lead: { id: "lead-1", name: "Merlo" },
    metadata: {},
    updatedAt: new Date("2026-01-05"),
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

  assert.equal(persisted?.caseId, "case-thread-1");
  assert.equal(persisted?.lead?.id, "lead-1");
  assert.equal(persisted?.property?.city, "Itajaí");
});

test("IMOB_CRM mutation service preserves owner context in returned caseContext after property save", async () => {
  const prisma = createMockPrisma();
  prisma.owners.push({
    id: "owner-1",
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    name: "Carlos",
    status: "qualified",
    updatedAt: new Date("2026-01-06"),
  });
  prisma.cases.push({
    id: "case-owner-1",
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    threadId: "thread-owner-1",
    flow: "owner.create",
    stage: "ready_for_review",
    status: "ready_for_review",
    ownerResponsible: "Corretor",
    nextStep: "Cadastrar imóvel",
    blockers: [],
    pendingItems: [],
    ownerId: "owner-1",
    owner: { id: "owner-1", name: "Carlos" },
    metadata: {},
    updatedAt: new Date("2026-01-06"),
  });

  const service = new ImobCrmMutationService(prisma as any);
  const persisted = await service.upsertCaseFromResolvedTurn({
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    userId: "user-1",
  }, {
    threadId: "thread-owner-1",
    threadLabel: "Captação",
    resolved: {
      mode: "execute",
      action: "realestate.register_property",
      threadLabel: "Captação",
      presentation: {
        text: "Cadastro do imóvel processado com sucesso.",
        owner: "Corretor",
        nextStep: "Cadastrar proprietário ou avançar para visita.",
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
            city: "Itajaí",
            address: "Rua 7 de Setembro",
          },
        },
      },
    } as any,
  });

  assert.equal(persisted?.caseId, "case-owner-1");
  assert.equal(persisted?.owner?.id, "owner-1");
  assert.equal(persisted?.owner?.name, "Carlos");
  assert.equal(persisted?.property?.city, "Itajaí");
});

test("IMOB_CRM mutation service keeps approval event actor/evidence when updating case", async () => {
  const prisma = createMockPrisma();
  prisma.cases.push({
    id: "case-approval-1",
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    flow: "contract.prepare",
    stage: "documentacao",
    status: "running",
    metadata: {},
  });

  const service = new ImobCrmMutationService(prisma as any);
  const updated = await service.updateCase({
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    userId: "user-1",
  }, "case-approval-1", {
    metadata: {
      approvalContext: {
        status: "approved",
        reasonCode: "AUDIT_BLOCKER",
      },
    },
    eventType: "case.approval.approve",
    eventSummary: "Aprovação registrada no caso",
    eventEvidenceRef: "ledger://proof-1",
    eventActorType: "user",
    eventActorRef: "user-1",
    eventPayload: { action: "approve", reasonCode: "AUDIT_BLOCKER" },
  });

  assert.equal(updated.status, "updated");
  assert.equal(prisma.caseEvents.length, 1);
  assert.equal(prisma.caseEvents[0].type, "case.approval.approve");
  assert.equal(prisma.caseEvents[0].actorType, "user");
  assert.equal(prisma.caseEvents[0].actorRef, "user-1");
  assert.equal(prisma.caseEvents[0].evidenceRef, "ledger://proof-1");
});
