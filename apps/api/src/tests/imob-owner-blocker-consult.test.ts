import test from "node:test";
import assert from "node:assert/strict";

import { resolveImobCrmOperationalConsult } from "../services/imob/crm/imobCrmResolver";
import { buildImobCrmCaseContextFromRecord } from "../services/imob/crm/imobCrmCaseContext";
import { resolveImobBackingSpecialists } from "../services/imob/imobSpecialistBridge";

const tenantId = "tenant-owner-blocker";
const workspaceId = "workspace-owner-blocker";

function createThreadState() {
  return {
    mode: "consult",
    pendingSlot: "none",
    resultOffset: 0,
    slots: {},
    operational: null,
  };
}

function buildOwnerBlockerCase() {
  return {
    id: "case-owner-gap-1",
    tenantId,
    workspaceId,
    threadId: "thread-owner-gap-1",
    flow: "owner.create",
    stage: "captacao",
    status: "running",
    ownerResponsible: "Carlos Alberto Merlo (Founder)",
    nextStep: "mostrar bloqueios do caso",
    blockers: ["Dados do proprietário ainda estão incompletos para seguir."],
    pendingItems: [
      "nome do proprietário",
      "telefone do proprietário",
      "e-mail do proprietário",
      "documento do proprietário",
    ],
    updatedAt: new Date("2026-01-04T10:00:00Z"),
    lead: {
      id: "lead-owner-gap-1",
      name: "Locatário teste",
      phone: "47999994444",
      email: "lead@example.com",
      goal: "locacao",
      targetCity: "Itajaí",
      budgetMaxCents: 350000,
    },
    owner: {
      id: "owner-gap-1",
      name: "Criativa Barboza",
      phone: "47999995555",
      email: "criativa@example.com",
      document: null,
    },
    property: {
      id: "property-owner-gap-1",
      propertyType: "apartamento",
      city: "Itajaí",
      neighborhood: "Centro",
      address: "Rua Tuiuiú, 45",
      goal: "locacao",
      askingPriceCents: null,
      owner: { id: "owner-gap-1", name: "Criativa Barboza" },
    },
    canonical: {
      journeyType: "property_capture",
      recommendedActions: [
        {
          id: "complete_owner_data",
          label: "Cadastrar proprietário",
          actionType: "consultive",
          inputHint: "cadastrar proprietário",
        },
      ],
      blockedActions: ["Dados do proprietário ainda estão incompletos para seguir."],
      missingContext: [
        "nome do proprietário",
        "telefone do proprietário",
        "e-mail do proprietário",
        "documento do proprietário",
      ],
      reasonCodes: ["OWNER_DATA_REQUIRED"],
    },
    _count: { events: 1 },
  };
}

function createMockPrisma(item: ReturnType<typeof buildOwnerBlockerCase>) {
  return {
    imobCase: {
      findFirst: async ({ where }: any) => (where.id === item.id ? item : null),
    },
  };
}

test("IMOB case context normalizes stale owner pending items before rebuilding waitingOn", () => {
  const item = buildOwnerBlockerCase();
  const caseContext = buildImobCrmCaseContextFromRecord(item as any, (record: any) => record.canonical);

  assert.deepEqual(caseContext.pendingItems, ["documento do proprietário"]);
  assert.equal(caseContext.humanWorkflow?.waitingOn, "owner");
});

test("IMOB consultive blocked read keeps owner document as dominant pending item and suppresses legal support", async () => {
  const item = buildOwnerBlockerCase();
  const resolved = await resolveImobCrmOperationalConsult({
    prisma: createMockPrisma(item) as any,
    tenantId,
    workspaceId,
    caseId: item.id,
    message: "mostrar bloqueios do caso",
    threadState: createThreadState(),
  });

  assert.equal(resolved?.action, "crm.case.blocked_run_resolution");
  assert.deepEqual(resolved?.presentation?.pendingFieldLabels, ["documento do proprietário"]);
  assert.equal(resolved?.presentation?.consultiveRead?.waitingOn, "owner");
  assert.doesNotMatch(resolved?.presentation?.text ?? "", /jur[ií]dico\/documenta[cç][aã]o/i);
  assert.equal(
    (resolved?.presentation?.consultiveRead?.specialists ?? []).some((item: any) => item.agentId === "J_360"),
    false,
  );

  const caseContext = buildImobCrmCaseContextFromRecord(item as any, (record: any) => record.canonical);
  const specialists = resolveImobBackingSpecialists(caseContext as any);
  assert.equal(specialists.some((specialist) => specialist.primaryAgentId === "J_360"), false);
});
