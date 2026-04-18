import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveImobCrmOperationalConsult,
  resolveImobCrmOperationalUpdate,
} from "../services/imob/crm/imobCrmResolver";

function createThreadState() {
  return {
    mode: "consult",
    pendingSlot: "none",
    resultOffset: 0,
    slots: {},
    operational: null,
  };
}

function createMockPrisma(overrides?: { caseNextStep?: string }) {
  const leads = [
    {
      id: "lead-1",
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      name: "Merlo",
      phone: "47 999674434",
      email: "mmerlon.adv@gmail.com",
      goal: "locacao",
      targetCity: "Balneário Camboriú",
      budgetMaxCents: 200000,
      stage: "pending_data",
      temperature: "incomplete",
      pendingItems: ["faixa de orçamento", "cidade de interesse"],
      updatedAt: new Date("2026-01-01"),
    },
    {
      id: "lead-2",
      tenantId: "tenant-1",
      workspaceId: "workspace-2",
      name: "Outro Workspace",
      phone: "47 000000000",
      email: "outro@example.com",
      goal: "locacao",
      targetCity: "Itajaí",
      budgetMaxCents: null,
      stage: "pending_data",
      temperature: "incomplete",
      pendingItems: ["faixa de orçamento"],
      updatedAt: new Date("2026-01-02"),
    },
  ];

  const owners = [
    {
      id: "owner-1",
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      name: "João",
      phone: "47 111111111",
      email: "joao@example.com",
      document: null as string | null,
      status: "pending_data",
      pendingItems: ["ownerDocument"],
      metadata: null,
      _count: { properties: 1, cases: 1 },
      updatedAt: new Date("2026-01-01"),
    },
  ];

  const properties = [
    {
      id: "property-1",
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      ownerId: "owner-1",
      propertyType: "apartamento",
      goal: "locacao",
      address: "Rua 1000, 123",
      city: "Balneário Camboriú",
      neighborhood: "Centro",
      askingPriceCents: null as number | null,
      status: "pending_data",
      pendingItems: ["preço do imóvel"],
      metadata: null,
      owner: { name: "João" },
      _count: { cases: 1 },
      updatedAt: new Date("2026-01-01"),
    },
  ];
  const cases = [
    {
      id: "case-1",
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      threadId: "thread-1",
      flow: "lead.qualify",
      stage: "ready_for_review",
      status: "ready_for_review",
      ownerResponsible: "Corretor",
      nextStep: overrides?.caseNextStep ?? "qualificar lead deste caso",
      blockers: [],
      pendingItems: [],
      ownerId: "owner-1",
      propertyId: "property-1",
      leadId: "lead-1",
      updatedAt: new Date("2026-01-05"),
      lead: leads[0],
      owner: owners[0],
      property: properties[0],
      _count: { events: 2 },
    },
  ];

  return {
    imobLead: {
      findMany: async ({ where }: any) => leads.filter((item) => item.tenantId === where.tenantId && item.workspaceId === where.workspaceId),
      findFirst: async ({ where }: any) => leads.find((item) => (
        item.tenantId === where.tenantId &&
        item.workspaceId === where.workspaceId &&
        (!where.OR || where.OR.some((condition: any) => (
          (condition.phone && condition.phone === item.phone) ||
          (condition.email && condition.email === item.email) ||
          (condition.name && condition.name === item.name)
        )))
      )) ?? null,
      update: async ({ where, data }: any) => {
        const lead = leads.find((item) => item.id === where.id);
        if (!lead) throw new Error("lead not found");
        Object.assign(lead, data);
        return lead;
      },
    },
    imobOwner: {
      findMany: async ({ where }: any) => owners.filter((item) => item.tenantId === where.tenantId && item.workspaceId === where.workspaceId && item.status !== "archived"),
      findFirst: async ({ where }: any) => owners.find((item) => (
        item.tenantId === where.tenantId &&
        item.workspaceId === where.workspaceId &&
        item.status !== "archived" &&
        (!where.name || where.name === item.name) &&
        (!where.id || where.id === item.id)
      )) ?? null,
      update: async ({ where, data }: any) => {
        const owner = owners.find((item) => item.id === where.id);
        if (!owner) throw new Error("owner not found");
        Object.assign(owner, data);
        return owner;
      },
    },
    imobProperty: {
      findMany: async ({ where }: any) => properties.filter((item) => item.tenantId === where.tenantId && item.workspaceId === where.workspaceId && item.status !== "archived"),
      findFirst: async ({ where }: any) => properties.find((item) => (
        item.tenantId === where.tenantId &&
        item.workspaceId === where.workspaceId &&
        (!where.status || item.status !== "archived") &&
        (!where.id || where.id === item.id) &&
        (!where.address?.contains || item.address.includes(where.address.contains))
      )) ?? null,
      update: async ({ where, data }: any) => {
        const property = properties.find((item) => item.id === where.id);
        if (!property) throw new Error("property not found");
        Object.assign(property, data);
        return property;
      },
    },
    imobCase: {
      findFirst: async ({ where }: any) => cases.find((item) => (
        item.tenantId === where.tenantId &&
        item.workspaceId === where.workspaceId &&
        (!where.id || item.id === where.id)
      )) ?? null,
      findMany: async ({ where }: any) => cases.filter((item) => (
        item.tenantId === where.tenantId &&
        item.workspaceId === where.workspaceId &&
        (!where.leadId || item.leadId === where.leadId) &&
        (!where.ownerId || item.ownerId === where.ownerId) &&
        (!where.propertyId || item.propertyId === where.propertyId)
      )),
    },
  };
}

test("IMOB_CRM consult lists leads inside the active workspace only", async () => {
  const resolved = await resolveImobCrmOperationalConsult({
    prisma: createMockPrisma() as any,
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    message: "listar leads",
    threadState: createThreadState(),
  });

  assert.equal(resolved?.action, "crm.lead.list");
  assert.match(resolved?.presentation?.text ?? "", /Encontrei 1 lead/);
  assert.doesNotMatch(JSON.stringify(resolved), /Outro Workspace/);
});

test("IMOB_CRM consult lists properties by workspace", async () => {
  const resolved = await resolveImobCrmOperationalConsult({
    prisma: createMockPrisma() as any,
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    message: "listar imóveis",
    threadState: createThreadState(),
  });

  assert.equal(resolved?.action, "crm.property.list");
  assert.match(resolved?.presentation?.text ?? "", /Encontrei 1 imóvel/);
  assert.match(JSON.stringify(resolved), /Rua 1000/);
});

test("IMOB_CRM update changes lead budget without falling back to IMOB route logic", async () => {
  const prisma = createMockPrisma();
  const resolved = await resolveImobCrmOperationalUpdate({
    prisma: prisma as any,
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    message: "lead mmerlon.adv@gmail.com orçamento 2000",
    threadState: createThreadState(),
  });

  assert.equal(resolved?.action, "crm.lead.update");
  assert.match(resolved?.presentation?.text ?? "", /Cadastro do lead Merlo atualizado/);
  const updated = await (prisma as any).imobLead.findFirst({ where: { tenantId: "tenant-1", workspaceId: "workspace-1", OR: [{ name: "Merlo" }] } });
  assert.equal(updated.budgetMaxCents, 200000);
  assert.equal(updated.stage, "pending_data");
});

test("IMOB_CRM business read returns commercial language from the latest case", async () => {
  const resolved = await resolveImobCrmOperationalConsult({
    prisma: createMockPrisma() as any,
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    message: "qual status desse caso?",
    threadState: createThreadState(),
  });

  assert.equal(resolved?.action, "crm.case.pipeline_status");
  assert.match(resolved?.presentation?.text ?? "", /Lead Merlo/);
  assert.match(resolved?.presentation?.text ?? "", /Fase:/);
  assert.match(resolved?.presentation?.text ?? "", /Waiting on:/);
  assert.match(resolved?.presentation?.text ?? "", /Owner da ação:/);
  assert.match(resolved?.presentation?.text ?? "", /Specialist de apoio:/);
  assert.match(resolved?.presentation?.text ?? "", /não assume ownership do caso/i);
  assert.match(resolved?.presentation?.text ?? "", /Próximo movimento/);
  assert.equal(resolved?.presentation?.consultiveRead?.phase, "Qualificação");
  assert.equal(resolved?.presentation?.consultiveRead?.waitingOn, "internal");
  assert.equal(resolved?.presentation?.consultiveRead?.nextActionOwner, "Corretor");
  assert.match(resolved?.presentation?.consultiveRead?.nextSafeStep ?? "", /qualificar o interesse do lead/i);
  assert.equal(resolved?.presentation?.consultiveRead?.specialists?.[0]?.agentId, "I_BC");
  assert.match(resolved?.presentation?.consultiveRead?.specialists?.[0]?.ownershipBoundary ?? "", /não assume ownership do caso/i);
});

test("IMOB_CRM domain guidance answers generic documentary question without caseId", async () => {
  const resolved = await resolveImobCrmOperationalConsult({
    prisma: createMockPrisma() as any,
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    message: "quais documentos normalmente faltam nessa fase?",
    threadState: createThreadState(),
  });

  assert.equal(resolved?.action, "crm.domain_guidance");
  assert.match(resolved?.presentation?.text ?? "", /waitingOn/i);
  assert.match(resolved?.presentation?.text ?? "", /Próximo passo seguro/i);
  assert.match(resolved?.presentation?.card?.title ?? "", /Checklist operacional/i);
});

test("IMOB_CRM domain guidance answers when to involve legal without caseId", async () => {
  const resolved = await resolveImobCrmOperationalConsult({
    prisma: createMockPrisma() as any,
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    message: "quando envolver jurídico?",
    threadState: createThreadState(),
  });

  assert.equal(resolved?.action, "crm.domain_guidance");
  assert.match(resolved?.presentation?.text ?? "", /jurídico\/documentação|juridico/i);
  assert.match(resolved?.presentation?.text ?? "", /waitingOn/i);
});

test("IMOB_CRM domain guidance explains specialist handoff without transferring case ownership", async () => {
  const resolved = await resolveImobCrmOperationalConsult({
    prisma: createMockPrisma() as any,
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    message: "qual specialist entra nesse caso, jurídico ou financeiro?",
    threadState: createThreadState(),
  });

  assert.equal(resolved?.action, "crm.domain_guidance");
  assert.match(resolved?.presentation?.text ?? "", /IMOB_CRM continua dono do caso/i);
  assert.match(resolved?.presentation?.text ?? "", /J_360|fin-nexus|guardian/i);
});

test("IMOB_CRM blocked resolution avoids recursive next step and recursive CTA", async () => {
  const resolved = await resolveImobCrmOperationalConsult({
    prisma: createMockPrisma({ caseNextStep: "mostrar bloqueios do caso" }) as any,
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    message: "mostrar bloqueios do caso",
    threadState: createThreadState(),
  });

  assert.equal(resolved?.action, "crm.case.blocked_run_resolution");
  assert.doesNotMatch(resolved?.presentation?.text ?? "", /para destravar:\s*mostrar bloqueios do caso/i);
  assert.ok(resolved?.presentation?.consultiveRead);
  const ctas = Array.isArray(resolved?.presentation?.card?.ctas) ? resolved?.presentation?.card?.ctas : [];
  assert.equal(
    ctas.some((item: any) => String(item?.nextMessage ?? "").toLowerCase().includes("mostrar bloqueios do caso")),
    false
  );
});

test("IMOB_CRM case consult asks which case when no explicit reference is provided", async () => {
  const resolved = await resolveImobCrmOperationalConsult({
    prisma: createMockPrisma() as any,
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    message: "consultar caso",
    threadState: createThreadState(),
  });

  assert.equal(resolved?.action, "crm.case.lookup");
  assert.match(resolved?.presentation?.text ?? "", /qual caso você quer consultar/i);
  assert.match(resolved?.presentation?.suggestedNextAction ?? "", /consultar caso <código do caso>/i);
});

test("IMOB_CRM case consult opens when explicit case id is provided in the message", async () => {
  const resolved = await resolveImobCrmOperationalConsult({
    prisma: createMockPrisma() as any,
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    message: "consultar caso case-1",
    threadState: createThreadState(),
  });

  assert.equal(resolved?.action, "crm.case.lookup");
  assert.match(resolved?.presentation?.text ?? "", /caso lead localizado/i);
  assert.match(resolved?.presentation?.card?.title ?? "", /Caso Lead/i);
});

test("IMOB_CRM detailed owner lookup returns owner card", async () => {
  const resolved = await resolveImobCrmOperationalConsult({
    prisma: createMockPrisma() as any,
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    message: "consultar proprietário João",
    threadState: createThreadState(),
  });

  assert.equal(resolved?.action, "crm.owner.lookup");
  assert.match(resolved?.presentation?.card?.title ?? "", /João/);
});

test("IMOB_CRM detailed property lookup returns property card", async () => {
  const resolved = await resolveImobCrmOperationalConsult({
    prisma: createMockPrisma() as any,
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    message: "consultar imóvel property-1",
    threadState: createThreadState(),
  });

  assert.equal(resolved?.action, "crm.property.lookup");
  assert.match(resolved?.presentation?.card?.title ?? "", /Rua 1000/);
});

test("IMOB_CRM owner edit returns an edit form", async () => {
  const resolved = await resolveImobCrmOperationalConsult({
    prisma: createMockPrisma() as any,
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    message: "editar proprietário João",
    threadState: createThreadState(),
  });

  assert.equal(resolved?.action, "crm.owner.update");
  assert.equal(resolved?.presentation?.form?.title, "Editar proprietário");
});

test("IMOB_CRM property delete returns confirmation prompt", async () => {
  const resolved = await resolveImobCrmOperationalConsult({
    prisma: createMockPrisma() as any,
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    message: "excluir imóvel property-1",
    threadState: createThreadState(),
  });

  assert.equal(resolved?.action, "crm.property.delete");
  assert.match(resolved?.presentation?.text ?? "", /Confirme a exclusão/);
});
