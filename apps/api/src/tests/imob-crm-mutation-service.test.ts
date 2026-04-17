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
  const cases: any[] = [];
  const caseEvents: any[] = [];
  const memoryEvents: any[] = [];
  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

  return {
    owners,
    leads,
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
          item.id === where.id &&
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
      count: async () => 0,
      findMany: async () => [],
    },
    imobCase: {
      count: async () => 0,
      findFirst: async ({ where }: any) => cases.find((item) => (
        item.id === where.id &&
        item.tenantId === where.tenantId &&
        item.workspaceId === where.workspaceId
      )) ?? null,
      create: async ({ data }: any) => {
        const created = {
          id: `case-${cases.length + 1}`,
          ...data,
          updatedAt: new Date("2026-01-04"),
        };
        cases.push(created);
        return clone(created);
      },
      update: async ({ where, data }: any) => {
        const item = cases.find((caseItem) => caseItem.id === where.id);
        if (!item) throw new Error("case not found");
        Object.assign(item, data);
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
      create: async ({ data }: any) => {
        memoryEvents.push(data);
        return { id: `event-${memoryEvents.length}`, ...data };
      },
    },
    $transaction: async (callback: any) => callback({
      imobCase: {
        create: async ({ data }: any) => {
          const created = {
            id: `case-${cases.length + 1}`,
            ...data,
            updatedAt: new Date("2026-01-04"),
          };
          cases.push(created);
          return clone(created);
        },
        update: async ({ where, data }: any) => {
          const item = cases.find((caseItem) => caseItem.id === where.id);
          if (!item) throw new Error("case not found");
          Object.assign(item, data);
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
  assert.equal(prisma.memoryEvents.length, 1);
  assert.equal(prisma.memoryEvents[0].key, "crm.audit");
  assert.equal(prisma.memoryEvents[0].metadata.subjectType, "owner");
  assert.equal(prisma.memoryEvents[0].metadata.action, "created");
  assert.equal(prisma.memoryEvents[0].metadata.userId, "user-1");
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
  assert.equal(prisma.memoryEvents.length, 1);
  assert.equal(prisma.memoryEvents[0].metadata.subjectType, "lead");
  assert.equal(prisma.memoryEvents[0].metadata.action, "updated");
  assert.equal((prisma.memoryEvents[0].metadata.before as any).budgetMaxCents, null);
  assert.equal((prisma.memoryEvents[0].metadata.after as any).budgetMaxCents, 200000);
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
          },
        },
      },
    },
  });

  assert.equal(persisted?.flow, "lead.qualify");
  assert.equal(persisted?.status, "ready_for_review");
  assert.equal(prisma.cases.length, 1);
  assert.equal(prisma.cases[0].workspaceId, "workspace-1");
  assert.equal(prisma.cases[0].leadId, "lead-1");
  assert.equal(prisma.caseEvents.length, 1);
  assert.equal(prisma.caseEvents[0].type, "case.created_from_turn");
  assert.equal(prisma.memoryEvents.some((event) => event.metadata.subjectType === "lead" && event.metadata.action === "updated"), true);
  assert.equal(prisma.memoryEvents.some((event) => event.metadata.subjectType === "case" && event.metadata.action === "created"), true);
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
