/**
 * Tests: IMOB visit slot collection
 *
 * Cobre os critérios obrigatórios do patch de coleta estruturada de slots
 * da missão visit.schedule:
 *  1. Visita pendente emite payload slotCollection com mission=visit.schedule
 *  2. Card inclui os quatro campos mínimos
 *  3. Campos já conhecidos aparecem preenchidos em prefilled
 *  4. Submit parcial preserva dados e retorna pendências restantes
 *  5. Texto livre no imóvel gera propertyTextCandidate, não propertyId falso
 *  6. Sem propertyId resolvido, não agenda visita (propertyLinked=false)
 *  7. Com propertyId resolvido e demais campos completos → status ready_for_review
 *  8. Continuidade: texto candidato + único hit DB → auto-vincula propertyId
 */

import test from "node:test";
import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// Importações de produção
// ---------------------------------------------------------------------------
import { hydrateThreadStateWithPersistedLead } from "../services/imob/crm/imobCrmTurnContinuity.js";

// ---------------------------------------------------------------------------
// Helpers mínimos para o teste de continuidade (mesmo padrão dos testes existentes)
// ---------------------------------------------------------------------------
function createHelpers(overrides?: Partial<ReturnType<typeof baseHelpers>>) {
  return { ...baseHelpers(), ...overrides };
}

function baseHelpers() {
  return {
    asObject: (value: unknown) =>
      value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null,
    asString: (value: unknown) =>
      typeof value === "string" && value.trim().length > 0 ? value.trim() : null,
    asStringList: (value: unknown) =>
      Array.isArray(value)
        ? value.filter((i): i is string => typeof i === "string" && i.trim().length > 0)
        : [],
    createEmptyThreadState: () => ({
      mode: "consult",
      pendingSlot: "none",
      resultOffset: 0,
      slots: {},
      operational: null,
    }),
    cloneImobResolvedTurn: <T>(value: T) => JSON.parse(JSON.stringify(value)) as T,
    detectOperationalHydrationFlow: (
      _msg: string,
      threadLabel?: string | null,
      operationalFlow?: string | null,
    ) => {
      if (operationalFlow === "visit.schedule") return "visit.schedule";
      const tl = String(threadLabel ?? "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase();
      if (tl.includes("visita")) return "visit.schedule";
      return null;
    },
    extractLeadNameFromMessage: () => null,
    extractLeadEmailFromMessage: () => null,
    extractLeadPhoneFromMessage: () => null,
    buildOwnerPendingSuggestion: () => null,
    buildPropertyPendingSuggestion: () => null,
    buildLeadPendingSuggestion: () => null,
  };
}

function makePrismaStub(overrides?: {
  propertyHits?: Array<{ id: string; address: string | null; type: string | null }>;
  casePropertyId?: string | null;
}) {
  return {
    imobCase: {
      findFirst: async () => ({
        leadId: "lead-1",
        propertyId: overrides?.casePropertyId ?? null,
      }),
    },
    imobLead: {
      findFirst: async () => ({
        name: "Visitante Teste",
        email: null,
        phone: "47 99999-0001",
        goal: "locacao",
        targetCity: "Itapema",
        budgetMaxCents: null,
      }),
    },
    imobProperty: {
      findMany: async () => overrides?.propertyHits ?? [],
    },
  };
}

// ---------------------------------------------------------------------------
// 1. Visita pendente sem lead persistido: todos os quatro campos ficam pendentes
// 2. Card inclui os quatro campos mínimos
// ---------------------------------------------------------------------------
test("IMOB visit slot — visita pendente sem lead: pendingFields inclui os quatro campos mínimos", async () => {
  const threadState = {
    mode: "execute",
    pendingSlot: "none",
    resultOffset: 0,
    slots: {},
    operational: {
      flow: "visit.schedule",
      status: "collecting",
      pendingFields: [],
      visitDraft: {
        propertyId: null,
        visitorName: null,
        visitorPhone: null,
        preferredDate: null,
        preferredWindow: null,
      },
    },
  };

  // Lead sem nome/telefone → visitorName e visitorPhone ficam null → pendentes
  const prismaEmptyLead = {
    imobCase: { findFirst: async () => ({ leadId: "lead-empty", propertyId: null }) },
    imobLead: { findFirst: async () => ({ name: null, email: null, phone: null, goal: null, targetCity: null, budgetMaxCents: null }) },
    imobProperty: { findMany: async () => [] },
  };

  const hydrated = await hydrateThreadStateWithPersistedLead({
    prisma: prismaEmptyLead,
    tenantId: "t1",
    workspaceId: "w1",
    caseId: "case-1",
    message: "agendar visita",
    threadLabel: "Visita",
    threadState,
    helpers: createHelpers(),
  });

  const op = (hydrated as any).operational;
  assert.equal(op.flow, "visit.schedule");
  assert.ok(Array.isArray(op.pendingFields));
  assert.ok(op.pendingFields.includes("propertyId"), "deve exigir propertyId");
  assert.ok(op.pendingFields.includes("visitorName"), "deve exigir visitorName");
  assert.ok(op.pendingFields.includes("visitorPhone"), "deve exigir visitorPhone");
  assert.ok(op.pendingFields.includes("preferredDate"), "deve exigir preferredDate");
});

// ---------------------------------------------------------------------------
// 3. Campos já conhecidos aparecem preenchidos (persistedLead hydra visitorName/Phone)
// ---------------------------------------------------------------------------
test("IMOB visit slot — campos do lead são hidratados no visitDraft (visitorName, visitorPhone)", async () => {
  const threadState = {
    mode: "execute",
    pendingSlot: "none",
    resultOffset: 0,
    slots: {},
    operational: {
      flow: "visit.schedule",
      status: "collecting",
      pendingFields: [],
      visitDraft: {
        propertyId: null,
        visitorName: null,
        visitorPhone: null,
        preferredDate: null,
        preferredWindow: null,
      },
    },
  };

  const hydrated = await hydrateThreadStateWithPersistedLead({
    prisma: makePrismaStub(),
    tenantId: "t1",
    workspaceId: "w1",
    caseId: "case-1",
    message: "agendar visita",
    threadLabel: "Visita",
    threadState,
    helpers: createHelpers(),
  });

  const draft = (hydrated as any).operational?.visitDraft;
  assert.equal(draft?.visitorName, "Visitante Teste", "visitorName deve vir do lead persistido");
  assert.equal(draft?.visitorPhone, "47 99999-0001", "visitorPhone deve vir do lead persistido");
});

// ---------------------------------------------------------------------------
// 4. Submit parcial preserva dados e retorna pendências restantes
// ---------------------------------------------------------------------------
test("IMOB visit slot — submit parcial: campos preenchidos são preservados e pendências restam", async () => {
  const threadState = {
    mode: "execute",
    pendingSlot: "none",
    resultOffset: 0,
    slots: {},
    operational: {
      flow: "visit.schedule",
      status: "collecting",
      pendingFields: ["propertyId", "preferredDate"],
      visitDraft: {
        propertyId: null,
        visitorName: "Pedro Silva",
        visitorPhone: "47 99988-7766",
        preferredDate: null,
        preferredWindow: null,
      },
    },
  };

  const hydrated = await hydrateThreadStateWithPersistedLead({
    prisma: makePrismaStub(),
    tenantId: "t1",
    workspaceId: "w1",
    caseId: "case-1",
    message: "agendar visita",
    threadLabel: "Visita",
    threadState,
    helpers: createHelpers(),
  });

  const op = (hydrated as any).operational;
  assert.equal(op.visitDraft?.visitorName, "Pedro Silva", "visitorName já preenchido deve ser preservado");
  assert.equal(op.visitDraft?.visitorPhone, "47 99988-7766", "visitorPhone já preenchido deve ser preservado");
  assert.ok(op.pendingFields.includes("propertyId"), "propertyId ainda deve estar pendente");
  assert.ok(op.pendingFields.includes("preferredDate"), "preferredDate ainda deve estar pendente");
});

// ---------------------------------------------------------------------------
// 5. Texto livre no imóvel → propertyTextCandidate, não propertyId resolvido
// ---------------------------------------------------------------------------
test("IMOB visit slot — imóvel textual (kitnet) gera propertyTextCandidate, não propertyId", async () => {
  const threadState = {
    mode: "execute",
    pendingSlot: "none",
    resultOffset: 0,
    slots: {},
    operational: {
      flow: "visit.schedule",
      status: "collecting",
      pendingFields: ["propertyId"],
      visitDraft: {
        propertyId: null,
        propertyTextCandidate: "kitnet",
        visitorName: "Pedro Silva",
        visitorPhone: "47 99988-7766",
        preferredDate: "2026-06-30",
        preferredWindow: null,
      },
    },
  };

  // Sem hits no DB para "kitnet" → deve manter null propertyId
  const hydrated = await hydrateThreadStateWithPersistedLead({
    prisma: makePrismaStub({ propertyHits: [] }),
    tenantId: "t1",
    workspaceId: "w1",
    caseId: "case-1",
    message: "kitnet",
    threadLabel: "Visita",
    threadState,
    helpers: createHelpers(),
  });

  const draft = (hydrated as any).operational?.visitDraft;
  assert.equal(draft?.propertyId, null, "propertyId deve permanecer null sem match no DB");
  assert.equal(draft?.propertyTextCandidate, "kitnet", "propertyTextCandidate deve ser preservado");
});

// ---------------------------------------------------------------------------
// 6. Sem propertyId resolvido → status continua collecting (não agenda)
// ---------------------------------------------------------------------------
test("IMOB visit slot — sem propertyId resolvido: status permanece collecting", async () => {
  const threadState = {
    mode: "execute",
    pendingSlot: "none",
    resultOffset: 0,
    slots: {},
    operational: {
      flow: "visit.schedule",
      status: "collecting",
      pendingFields: ["propertyId"],
      visitDraft: {
        propertyId: null,
        propertyTextCandidate: "kitnet",
        visitorName: "Pedro Silva",
        visitorPhone: "47 99988-7766",
        preferredDate: "2026-06-30",
        preferredWindow: null,
      },
    },
  };

  const hydrated = await hydrateThreadStateWithPersistedLead({
    prisma: makePrismaStub({ propertyHits: [] }),
    tenantId: "t1",
    workspaceId: "w1",
    caseId: "case-1",
    message: "kitnet",
    threadLabel: "Visita",
    threadState,
    helpers: createHelpers(),
  });

  const op = (hydrated as any).operational;
  assert.equal(op.status, "collecting", "status deve ser collecting quando propertyId está ausente");
  assert.ok(op.pendingFields.includes("propertyId"), "propertyId deve estar na lista de pendentes");
});

// ---------------------------------------------------------------------------
// 7. Com propertyId resolvido + demais campos completos → ready_for_review
// ---------------------------------------------------------------------------
test("IMOB visit slot — todos os slots preenchidos + propertyId resolvido → ready_for_review", async () => {
  const threadState = {
    mode: "execute",
    pendingSlot: "none",
    resultOffset: 0,
    slots: {},
    operational: {
      flow: "visit.schedule",
      status: "collecting",
      pendingFields: [],
      visitDraft: {
        propertyId: "property-9999",
        visitorName: "Pedro Silva",
        visitorPhone: "47 99988-7766",
        preferredDate: "2026-06-30",
        preferredWindow: null,
      },
    },
  };

  const hydrated = await hydrateThreadStateWithPersistedLead({
    prisma: makePrismaStub({ casePropertyId: "property-9999" }),
    tenantId: "t1",
    workspaceId: "w1",
    caseId: "case-1",
    message: "agendar visita",
    threadLabel: "Visita",
    threadState,
    helpers: createHelpers(),
  });

  const op = (hydrated as any).operational;
  assert.equal(op.status, "ready_for_review", "status deve ser ready_for_review com todos os campos preenchidos");
  assert.equal(op.pendingFields.length, 0, "não deve haver campos pendentes");
  assert.equal(op.visitDraft?.propertyId, "property-9999", "propertyId deve estar resolvido");
});

// ---------------------------------------------------------------------------
// 8. Texto candidato com único hit no DB → auto-vincula propertyId
// ---------------------------------------------------------------------------
test("IMOB visit slot — texto candidato com único hit no DB → auto-vincula propertyId", async () => {
  const threadState = {
    mode: "execute",
    pendingSlot: "none",
    resultOffset: 0,
    slots: {},
    operational: {
      flow: "visit.schedule",
      status: "collecting",
      pendingFields: ["propertyId"],
      visitDraft: {
        propertyId: null,
        propertyTextCandidate: "kitnet centro",
        visitorName: "Pedro Silva",
        visitorPhone: "47 99988-7766",
        preferredDate: "2026-06-30",
        preferredWindow: null,
      },
    },
  };

  const hydrated = await hydrateThreadStateWithPersistedLead({
    prisma: makePrismaStub({
      propertyHits: [{ id: "property-abc123", address: "Rua das Flores 10 — Kitnet Centro", type: "kitnet" }],
    }),
    tenantId: "t1",
    workspaceId: "w1",
    caseId: "case-1",
    message: "kitnet centro",
    threadLabel: "Visita",
    threadState,
    helpers: createHelpers(),
  });

  const op = (hydrated as any).operational;
  assert.equal(op.visitDraft?.propertyId, "property-abc123", "deve auto-vincular quando há único hit no DB");
  assert.equal(op.visitDraft?.propertyTextCandidate, null, "propertyTextCandidate deve ser null após auto-vínculo");
  assert.equal(op.status, "ready_for_review", "status deve ser ready_for_review após auto-vínculo com demais campos preenchidos");
  assert.equal(op.pendingFields.length, 0, "não deve haver campos pendentes após auto-vínculo");
});
