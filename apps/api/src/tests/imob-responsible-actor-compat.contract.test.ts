import test from "node:test";
import assert from "node:assert/strict";

import { ImobCrmMutationService } from "../services/imob/crm/imobCrmMutationService";
import { buildResponsibleActorAssignmentContract } from "../types/verticalResponsibleActorContract";

function createCompatPrisma() {
  const cases: any[] = [];
  const caseEvents: any[] = [];
  const memoryEvents: any[] = [];

  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

  const pushCaseEvent = (data: any) => {
    const event = {
      ...data,
      caseId: data.caseId ?? data.imobCase?.connect?.id ?? null,
      tenantId: data.tenantId ?? data.tenant?.connect?.id ?? null,
      workspaceId: data.workspaceId ?? data.workspace?.connect?.id ?? null,
      createdAt: data.createdAt ?? new Date("2026-01-04"),
    };
    caseEvents.push(event);
    return { id: `case-event-${caseEvents.length}`, ...event };
  };

  return {
    cases,
    caseEvents,
    memoryEvents,
    imobCase: {
      findFirst: async ({ where }: any) =>
        clone(
          cases.find(
            (item) =>
              (!where.id || item.id === where.id) &&
              (!where.threadId || item.threadId === where.threadId) &&
              (!where.tenantId || item.tenantId === where.tenantId) &&
              (!where.workspaceId || item.workspaceId === where.workspaceId),
          ) ?? null,
        ),
      update: async ({ where, data }: any) => {
        const item = cases.find((caseItem) => caseItem.id === where.id);
        if (!item) throw new Error("case not found");
        Object.assign(item, data);
        return clone(item);
      },
    },
    imobCaseEvent: {
      findFirst: async ({ where }: any) => {
        const found = [...caseEvents].reverse().find(
          (item) =>
            (!where?.caseId || item.caseId === where.caseId) &&
            (!where?.tenantId || item.tenantId === where.tenantId) &&
            (!where?.workspaceId || item.workspaceId === where.workspaceId) &&
            (!where?.evidenceRef || item.evidenceRef === where.evidenceRef),
        );
        return found ? clone(found) : null;
      },
      create: async ({ data }: any) => pushCaseEvent(data),
    },
    memoryEvent: {
      findMany: async ({ where }: any = {}) =>
        memoryEvents.filter(
          (item) =>
            (!where?.tenantId || item.tenantId === where.tenantId) &&
            (!where?.workspaceId || item.workspaceId === where.workspaceId) &&
            (!where?.key || item.key === where.key),
        ),
      create: async ({ data }: any) => {
        memoryEvents.push(data);
        return { id: `memory-event-${memoryEvents.length}`, ...data };
      },
    },
    $transaction: async (callback: any) => {
      const casesSnapshot = clone(cases);
      const caseEventsSnapshot = clone(caseEvents);
      try {
        return await callback({
          imobCase: {
            update: async ({ where, data }: any) => {
              const item = cases.find((caseItem) => caseItem.id === where.id);
              if (!item) throw new Error("case not found");
              Object.assign(item, data);
              return clone(item);
            },
          },
          imobCaseEvent: {
            findFirst: async ({ where }: any) => {
              const found = [...caseEvents].reverse().find(
                (item) =>
                  (!where?.caseId || item.caseId === where.caseId) &&
                  (!where?.tenantId || item.tenantId === where.tenantId) &&
                  (!where?.workspaceId || item.workspaceId === where.workspaceId) &&
                  (!where?.evidenceRef || item.evidenceRef === where.evidenceRef),
              );
              return found ? clone(found) : null;
            },
            create: async ({ data }: any) => pushCaseEvent(data),
          },
        });
      } catch (error) {
        cases.splice(0, cases.length, ...casesSnapshot);
        caseEvents.splice(0, caseEvents.length, ...caseEventsSnapshot);
        throw error;
      }
    },
  };
}

test("IMOB responsible actor compat keeps ownerResponsible as operational alias after canonical contract validation", async () => {
  const prisma = createCompatPrisma();
  prisma.cases.push({
    id: "case-imob-compat-1",
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    threadId: "thread-imob-compat-1",
    flow: "contract.prepare",
    stage: "documentacao",
    status: "running",
    ownerResponsible: null,
    metadata: {},
    updatedAt: new Date("2026-01-04"),
  });

  const canonical = buildResponsibleActorAssignmentContract({
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    verticalKey: "IMOB",
    entityType: "imob.case",
    entityId: "case-imob-compat-1",
    responsibleUserId: "user-123",
    entitlementStatus: "active",
  });

  const service = new ImobCrmMutationService(prisma as any);

  const blocked = await service.updateCase(
    {
      tenantId: canonical.tenantId,
      workspaceId: canonical.workspaceId,
      userId: canonical.responsibleUserId,
    },
    canonical.entityId,
    {
      flow: "commission.settle",
      stage: "settled",
      status: "success",
    },
  );

  assert.equal(blocked.status, "responsible_required");
  assert.equal(blocked.reasonCode, "CASE_RESPONSIBLE_REQUIRED");

  const assigned = await service.assignResponsibleActor(
    {
      tenantId: canonical.tenantId,
      workspaceId: canonical.workspaceId,
      userId: canonical.responsibleUserId,
    },
    canonical.entityId,
    {
      ownerResponsible: "Mariana Souza",
      eventActorRef: canonical.responsibleUserId,
    },
  );

  assert.equal(assigned.status, "assigned");
  assert.equal(assigned.data.ownerResponsible, "Mariana Souza");
  assert.equal(prisma.cases[0].ownerResponsible, "Mariana Souza");

  const completed = await service.updateCase(
    {
      tenantId: canonical.tenantId,
      workspaceId: canonical.workspaceId,
      userId: canonical.responsibleUserId,
    },
    canonical.entityId,
    {
      flow: "commission.settle",
      stage: "settled",
      status: "success",
    },
  );

  assert.equal(completed.status, "updated");
  assert.equal(completed.data.ownerResponsible, "Mariana Souza");
  assert.equal(prisma.caseEvents.some((event) => event.type === "owner_assigned"), true);
  assert.equal(prisma.caseEvents.some((event) => event.type === "case.completed"), true);
});

