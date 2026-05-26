import test from "node:test";
import assert from "node:assert/strict";

import { resolveImobOperationalUpdateImpl } from "../services/imob/crm/imobCrmOperationalResolvers";
import type { ResolverHelpers } from "../services/imob/crm/imobCrmOperationalResolverShared";

function createThreadState() {
  return {
    mode: "consult",
    pendingSlot: "none",
    resultOffset: 0,
    slots: {},
    operational: null,
  };
}

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function createMockPrisma(params?: { linked?: boolean }) {
  const owner = {
    id: "owner-1",
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    name: "João",
    phone: "47 111111111",
    email: "joao@example.com",
    document: "11122233344",
    status: "ready_for_review",
    pendingItems: [],
  };
  const property = {
    id: "property-1",
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    ownerId: params?.linked ? "owner-1" : null,
    propertyType: "apartamento",
    goal: "locacao",
    address: "Rua 1000, 123",
    city: "Itajaí",
    neighborhood: "Centro",
    status: "ready_for_review",
    pendingItems: [],
    owner: params?.linked ? { id: "owner-1", name: "João" } : null,
  };
  const lead = {
    id: "lead-1",
    name: "Merlo",
    phone: "47 999674434",
    email: "mmerlon.adv@gmail.com",
  };
  const imobCase = {
    id: "case-1",
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    flow: "owner.create",
    stage: "ready_for_review",
    status: "ready_for_review",
    ownerResponsible: "Corretor",
    nextStep: "concluir vínculo proprietário-imóvel",
    blockers: [],
    pendingItems: [],
    ownerId: "owner-1",
    propertyId: "property-1",
    leadId: "lead-1",
    owner,
    property,
    lead,
    _count: { events: 2 },
  };

  return {
    imobOwner: {
      findFirst: async ({ where }: any) =>
        where.id === owner.id && where.tenantId === owner.tenantId && where.workspaceId === owner.workspaceId ? owner : null,
      findMany: async () => [owner],
      update: async () => owner,
      count: async () => 1,
    },
    imobLead: {
      findFirst: async () => lead,
      findMany: async () => [lead],
      update: async () => lead,
    },
    imobProperty: {
      findFirst: async ({ where }: any) =>
        where.id === property.id && where.tenantId === property.tenantId && where.workspaceId === property.workspaceId ? property : null,
      findMany: async () => [property],
      update: async ({ where, data }: any) => {
        assert.equal(where.id, property.id);
        Object.assign(property, data);
        property.owner = property.ownerId ? { id: owner.id, name: owner.name } : null;
        return property;
      },
      count: async () => 1,
    },
    imobCase: {
      findFirst: async ({ where }: any) =>
        where.id === imobCase.id && where.tenantId === imobCase.tenantId && where.workspaceId === imobCase.workspaceId ? imobCase : null,
      findMany: async () => [imobCase],
      count: async () => 1,
    },
  };
}

function createHelpers(auditCalls?: Array<Record<string, unknown>>): ResolverHelpers {
  const asObject = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  const asString = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
  const asStringList = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

  return {
    auditAgentId: "IMOB_Orchestrator",
    resolveImobCrmOperationalUpdate: async () => null,
    resolveImobCrmOperationalConsult: async () => null,
    normalizeImobRouteText: normalize,
    extractOwnerNameFromMessage: () => null,
    extractOwnerExplicitNameFromMessage: () => null,
    extractOwnerExplicitPhoneFromMessage: () => null,
    extractOwnerExplicitEmailFromMessage: () => null,
    extractOwnerExplicitDocumentFromMessage: () => null,
    extractLeadNameFromMessage: () => null,
    extractDocumentFromMessage: () => null,
    extractAddressFromMessage: () => null,
    extractExplicitAddressFieldFromMessage: () => null,
    extractPropertyRefFromMessage: () => null,
    extractLeadPhoneFromMessage: () => null,
    extractLeadEmailFromMessage: () => null,
    extractLeadGoalFromMessage: () => null,
    extractAmountAfterKeywords: () => null,
    extractFreeformCityAfterKeywords: () => null,
    extractOwnerCrudIdFromMessage: () => null,
    extractPropertyCrudIdFromMessage: () => null,
    extractPropertyTypeFromMessage: () => null,
    extractPropertyGoalFromMessage: () => null,
    extractPropertyCityFromMessage: () => null,
    resolveOwnerDisplayName: async ({ owner }: any) => owner?.name ?? "João",
    recordImobCrmAuditEvent: async (params: Record<string, unknown>) => {
      auditCalls?.push(params);
    },
    resolveOwnerDocumentForDisplay: (owner: any) => owner?.document ?? null,
    formatImobStatusLabel: (status: string | null | undefined) => status ?? "n/a",
    formatImobPendingList: (items: string[] | null | undefined) => (items?.length ? items.join(", ") : "sem pendências"),
    createEmptyThreadState: createThreadState,
    formatBudgetCentsForImob: () => null,
    formatPropertyLookupLabel: (item: any) => item?.address ?? item?.id ?? "imóvel",
    isOwnerDeleteConfirmationMessage: () => false,
    isPropertyDeleteConfirmationMessage: () => false,
    asObject,
    asString,
    asStringList,
    buildOwnerPendingSuggestion: () => null,
    buildLeadPendingSuggestion: () => null,
    buildPropertyPendingSuggestion: () => null,
    extractListCityFilter: () => null,
    resolveImobBusinessReadIntent: () => null,
    buildCaseContextFromRecord: (item: any) => ({
      caseId: item.id,
      flow: item.flow,
      stage: item.stage,
      status: item.status,
      ownerResponsible: item.ownerResponsible,
      nextStep: item.nextStep,
      blocker: Array.isArray(item.blockers) && item.blockers.length > 0 ? item.blockers[0] : null,
      pendingItems: item.pendingItems ?? [],
      threadId: item.threadId ?? null,
      updatedAt: null,
      lead: item.lead ?? null,
      property: item.property ?? null,
      owner: item.owner ?? null,
      canonical: { journeyType: "property_capture" },
    }),
    formatImobCaseFlowLabel: (flow: string) => flow,
    buildImobBusinessReadPresentation: () => ({}),
    isBulkPropertyOnboardingQuestion: () => false,
    buildBulkPropertyOnboardingConsult: () => ({}),
    isImobRecentRegistrationReadRequest: () => false,
    buildImobRecentRegistrationConsult: async () => ({}),
    titleCaseRouteWords: (value: string) => value,
    findOwnerIdByAuditName: async () => null,
    buildOwnerUpdateForm: () => ({}),
    buildPropertyUpdateForm: () => ({}),
  };
}

test("IMOB governed operational update completes property.link_owner on the active case", async () => {
  const resolved = await resolveImobOperationalUpdateImpl(
    {
      prisma: createMockPrisma() as any,
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      caseId: "case-1",
      message: "concluir vínculo proprietário-imóvel",
      threadState: createThreadState(),
    },
    createHelpers(),
  );

  assert.equal(resolved?.action, "crm.property.link_owner");
  assert.match(resolved?.presentation?.text ?? "", /Vínculo entre proprietário e imóvel concluído com sucesso/i);
  assert.match(resolved?.presentation?.text ?? "", /Próximo passo: /i);
});

test("IMOB governed operational update keeps property.link_owner idempotent when the owner is already linked", async () => {
  const auditCalls: Array<Record<string, unknown>> = [];
  const resolved = await resolveImobOperationalUpdateImpl(
    {
      prisma: createMockPrisma({ linked: true }) as any,
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      caseId: "case-1",
      message: "concluir vínculo proprietário-imóvel",
      threadState: createThreadState(),
    },
    createHelpers(auditCalls),
  );

  assert.equal(resolved?.action, "crm.property.link_owner");
  assert.match(resolved?.presentation?.text ?? "", /já estava vinculado/i);
  assert.equal(auditCalls.length, 0);
});

test("IMOB governed operational update fail-closes property.link_owner without active case scope", async () => {
  const resolved = await resolveImobOperationalUpdateImpl(
    {
      prisma: createMockPrisma() as any,
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      message: "concluir vínculo proprietário-imóvel",
      threadState: createThreadState(),
    },
    createHelpers(),
  );

  assert.equal(resolved?.action, "crm.property.link_owner");
  assert.match(resolved?.presentation?.text ?? "", /não está preso a um caso ativo/i);
});
