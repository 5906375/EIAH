import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  applyBackingSpecialistAvailability,
  filterAvailableBackingSpecialists,
  IMOB_BACKING_SPECIALIST_AGENT_IDS,
  listImobBackingSpecialists,
  readImobBackingSpecialistAvailability,
  resolveImobBackingSpecialists,
} from "../services/imob/imobSpecialistBridge";
import { buildImobCrmBusinessReadHelpers } from "../services/imob/crm/imobCrmBusinessRead";
import { IMOB_TRANSVERSAL_NEEDS, resolveImobTransversalNeeds } from "../services/imob/imobTransversalNeeds";
import { buildImobCrmLegacyCanonicalCase } from "../services/imob/crm/imobCrmLegacyCanonical";
import { resolveImobCaseOperationalConsult } from "../services/imob/crm/imobCrmOperationalCase";
import { resolveImobCrmOperationalConsult } from "../services/imob/crm/imobCrmResolver";
import type { ImobCaseContext } from "../services/imob/imobConversationContract";

function buildCaseContext(overrides: Partial<ImobCaseContext> = {}): ImobCaseContext {
  return {
    caseId: "case-1",
    flow: null,
    stage: "active",
    status: "open",
    nextStep: "seguir atendimento",
    blocker: null,
    pendingItems: [],
    updatedAt: new Date().toISOString(),
    canonical: {
      journeyType: "lead_qualification",
      recommendedActions: [],
      blockedActions: [],
      missingContext: [],
      reasonCodes: [],
    },
    humanWorkflow: {
      currentObjective: "seguir atendimento",
      waitingOn: "broker",
      urgency: "medium",
      agingHours: 12,
      followUpRisk: "medium",
      nextActionOwner: "Corretor",
      lastMeaningfulContactAt: null,
      doneDefinition: "prosseguir",
      likelyFailureMode: null,
    },
    ...overrides,
  };
}

test("IMOB backing specialists enrich proposal flow with commercial guidance", () => {
  const specialists = resolveImobBackingSpecialists(
    buildCaseContext({
      flow: "proposal.create",
      canonical: {
        journeyType: "proposal",
        recommendedActions: [],
        blockedActions: [],
        missingContext: [],
        reasonCodes: [],
      },
    }),
  );

  assert.equal(specialists[0]?.primaryAgentId, "I_BC");
  assert.equal(specialists[0]?.outputType, "advice");
  assert.match(specialists[0]?.suggestedAction ?? "", /proposta/i);
  assert.deepEqual(specialists[0]?.requiredContext, ["case.nextStep", "case.stage", "lead.context"]);
  assert.match(specialists[0]?.ownershipBoundary ?? "", /não assume ownership do caso/i);
});

test("IMOB backing specialists use daily ops as contextual fallback for actionable cases", () => {
  const specialists = resolveImobBackingSpecialists(
    buildCaseContext({
      canonical: {
        journeyType: "service",
        recommendedActions: [{ id: "1", label: "Retomar atendimento", actionType: "operational" }],
        blockedActions: [],
        missingContext: [],
        reasonCodes: [],
      },
      humanWorkflow: {
        currentObjective: "retomar caso",
        waitingOn: "broker",
        urgency: "medium",
        agingHours: 36,
        followUpRisk: "high",
        nextActionOwner: "Corretor",
        lastMeaningfulContactAt: null,
        doneDefinition: "retomado",
        likelyFailureMode: "caso pode esfriar",
      },
    }),
  );

  assert.equal(specialists[0]?.primaryAgentId, "Diarias");
  assert.equal(specialists[0]?.outputType, "operational_support");
  assert.equal(specialists[0]?.urgency, "high");
  assert.match(specialists[0]?.ownershipBoundary ?? "", /não assume ownership do caso/i);
});

test("IMOB backing specialists classify legal, financial and audit support by blocker", () => {
  const legal = resolveImobBackingSpecialists(
    buildCaseContext({
      flow: "documents.collect",
      pendingItems: ["matricula do imóvel"],
      canonical: {
        journeyType: "documentation",
        recommendedActions: [],
        blockedActions: [],
        missingContext: [],
        reasonCodes: [],
      },
    }),
  );
  assert.equal(legal[0]?.primaryAgentId, "J_360");
  assert.equal(legal[0]?.outputType, "validation");

  const financial = resolveImobBackingSpecialists(
    buildCaseContext({
      blocker: "repasse e comissão pendentes",
      canonical: {
        journeyType: "commission",
        recommendedActions: [],
        blockedActions: [],
        missingContext: [],
        reasonCodes: [],
      },
    }),
  );
  assert.equal(financial[0]?.primaryAgentId, "fin-nexus");
  assert.equal(financial[0]?.outputType, "financial_check");

  const audit = resolveImobBackingSpecialists(
    buildCaseContext({
      blocker: "receipt e verify pendentes",
      canonical: {
        journeyType: "contract",
        recommendedActions: [],
        blockedActions: [],
        missingContext: [],
        reasonCodes: [],
      },
    }),
  );
  const auditSpecialist = audit.find((item) => item.primaryAgentId === "guardian");
  assert.ok(auditSpecialist);
  assert.equal(auditSpecialist.outputType, "evidence");
  assert.match(auditSpecialist.suggestedAction ?? "", /bundle|receipt|evidências/i);
  assert.match(auditSpecialist.ownershipBoundary ?? "", /não assume ownership do caso/i);
});

// ---------------------------------------------------------------------------------------------
// Disponibilidade real dos especialistas candidatos (fail-closed)
// ---------------------------------------------------------------------------------------------

const AVAILABILITY_TENANT = "tenant-specialist-availability";
const AVAILABILITY_WORKSPACE = "workspace-specialist-availability";

function buildProposalContext() {
  return buildCaseContext({
    flow: "proposal.create",
    canonical: { journeyType: "proposal", recommendedActions: [], blockedActions: [], missingContext: [], reasonCodes: [] },
  });
}

test("availability: leitura é fail-closed para mapa ausente, malformado, agente ausente e valor desconhecido", () => {
  for (const bad of [undefined, null, [], "available", 1, true]) {
    assert.equal(readImobBackingSpecialistAvailability(bad as any, "J_360"), "unverified", String(bad));
  }
  assert.equal(readImobBackingSpecialistAvailability({}, "J_360"), "unverified");
  assert.equal(readImobBackingSpecialistAvailability({ I_BC: "available" }, "J_360"), "unverified");
  for (const value of ["AVAILABLE", "ok", true, 1, null, undefined, "", "enabled"]) {
    assert.equal(readImobBackingSpecialistAvailability({ J_360: value }, "J_360"), "unverified", String(value));
  }
  assert.equal(readImobBackingSpecialistAvailability({ J_360: "available" }, "J_360"), "available");
  assert.equal(readImobBackingSpecialistAvailability({ J_360: "unavailable" }, "J_360"), "unavailable");
  // chaves herdadas do protótipo nunca contam
  assert.equal(readImobBackingSpecialistAvailability(Object.create({ J_360: "available" }), "J_360"), "unverified");
});

test("availability: disponível preserva o candidato integralmente; os demais perdem ação e contexto, mantendo a necessidade", () => {
  const candidates = resolveImobBackingSpecialists(buildProposalContext());
  assert.ok(candidates.length >= 1);
  const frozen = JSON.parse(JSON.stringify(candidates));

  const available = applyBackingSpecialistAvailability(candidates, { I_BC: "available" });
  assert.deepEqual(available[0], { ...candidates[0], availability: "available" }, "conteúdo e ações idênticos ao candidato");

  for (const state of ["unavailable", "unverified"] as const) {
    const [item] = applyBackingSpecialistAvailability(candidates, { I_BC: state });
    assert.equal(item.availability, state);
    assert.equal(item.suggestedAction, null, state);
    assert.deepEqual(item.requiredContext, [], state);
    assert.equal(item.rationale, candidates[0].rationale, "a necessidade permanece descrita");
    assert.equal(item.primaryAgentId, "I_BC");
  }

  assert.deepEqual(candidates, frozen, "a entrada não é alterada");
  assert.deepEqual(applyBackingSpecialistAvailability(candidates, undefined).map((item) => item.availability), candidates.map(() => "unverified"));
  assert.deepEqual(applyBackingSpecialistAvailability(null as any, {}), []);
  assert.deepEqual(applyBackingSpecialistAvailability(undefined, { I_BC: "available" }), []);
});

test("availability: filtro devolve somente os comprovadamente disponíveis, na ordem original", () => {
  const items = [
    { primaryAgentId: "a", availability: "available" as const },
    { primaryAgentId: "b", availability: "unavailable" as const },
    { primaryAgentId: "c", availability: "unverified" as const },
    { primaryAgentId: "d" },
    { primaryAgentId: "e", availability: "available" as const },
  ];
  assert.deepEqual(filterAvailableBackingSpecialists(items).map((item) => item.primaryAgentId), ["a", "e"]);
  assert.deepEqual(filterAvailableBackingSpecialists(null), []);
});

test("availability: a lista de ids consultados é exatamente a dos candidatos do contrato", () => {
  assert.deepEqual([...IMOB_BACKING_SPECIALIST_AGENT_IDS], listImobBackingSpecialists().map((item) => item.primaryAgentId));
  assert.deepEqual([...IMOB_BACKING_SPECIALIST_AGENT_IDS], ["I_BC", "Diarias", "J_360", "fin-nexus", "guardian"]);
});

function buildDocumentationCaseRecord() {
  return {
    id: "case-availability-docs",
    tenantId: AVAILABILITY_TENANT,
    workspaceId: AVAILABILITY_WORKSPACE,
    threadId: "thread-availability-docs",
    flow: "documents.collect",
    stage: "documentation",
    status: "blocked",
    ownerResponsible: "Corretor teste",
    nextStep: "revisar documentos",
    blockers: ["documentação pendente"],
    pendingItems: ["ownerDocument", "matrícula do imóvel"],
    updatedAt: new Date("2026-01-04T10:00:00Z"),
    lead: { id: "lead-1", name: "Lead teste", phone: "47999990000", email: "lead@example.com", goal: "locacao", targetCity: "Itajaí", budgetMaxCents: 300000 },
    owner: { id: "owner-1", name: "Dono teste", phone: "47999990001", email: "dono@example.com", document: null },
    property: {
      id: "property-1", propertyType: "apartamento", city: "Itajaí", neighborhood: "Centro", address: "Rua A, 1", goal: "locacao",
      askingPriceCents: null, owner: { id: "owner-1", name: "Dono teste" },
    },
    canonical: {
      journeyType: "documentation",
      recommendedActions: [{ id: "review_documents", label: "Revisar documentos", actionType: "consultive", inputHint: "revisar documentos" }],
      blockedActions: ["documentação pendente"],
      missingContext: ["matrícula do imóvel"],
      reasonCodes: ["BLOCKERS_PRESENT"],
    },
  };
}

type Reader = (params: { prisma: unknown; tenantId: string; workspaceId: string }) => Promise<Record<string, unknown> | null | undefined>;

async function consultDocumentationCase(message: string, reader?: Reader, itemOverride?: ReturnType<typeof buildDocumentationCaseRecord>) {
  const item = itemOverride ?? buildDocumentationCaseRecord();
  const calls: Array<{ tenantId: string; workspaceId: string }> = [];
  const resolved: any = await resolveImobCrmOperationalConsult({
    prisma: { imobCase: { findFirst: async ({ where }: any) => (where.id === item.id ? item : null) } } as any,
    tenantId: AVAILABILITY_TENANT,
    workspaceId: AVAILABILITY_WORKSPACE,
    caseId: item.id,
    message,
    threadState: { mode: "consult", pendingSlot: "none", resultOffset: 0, slots: {}, operational: null } as any,
    ...(reader
      ? { readBackingSpecialistAvailability: async (params: any) => { calls.push({ tenantId: params.tenantId, workspaceId: params.workspaceId }); return reader(params); } }
      : {}),
  } as any);
  return { resolved, calls };
}

const J360_ACTION = /Validar pendências documentais e contratuais/i;

test("availability: especialista disponível mantém card, apoio, supportingAgents e pendingHandoffs como antes", async () => {
  const reader: Reader = async () => ({ J_360: "available", I_BC: "available", Diarias: "available", "fin-nexus": "available", guardian: "available" });

  const status = await consultDocumentationCase("qual status desse caso?", reader);
  assert.equal(status.resolved.action, "crm.case.pipeline_status");
  assert.deepEqual(status.calls, [{ tenantId: AVAILABILITY_TENANT, workspaceId: AVAILABILITY_WORKSPACE }], "consulta no escopo do turno, uma vez");
  assert.match(status.resolved.presentation.text, /Specialist de apoio: J_360/);
  assert.equal(status.resolved.presentation.consultiveRead.specialists[0].agentId, "J_360");
  assert.match(status.resolved.presentation.consultiveRead.specialists[0].suggestedAction, J360_ACTION);
  const card = status.resolved.presentation.widget.specialists[0];
  assert.equal(card.primaryAgentId, "J_360");
  assert.equal(card.availability, "available");
  assert.match(card.suggestedAction, J360_ACTION);
  assert.deepEqual(card, { ...resolveImobBackingSpecialists(buildCaseContextForDocs())[0], availability: "available" }, "card = candidato do bridge + availability");
  assert.ok(status.resolved.presentation.missionOrchestration.supportingAgents.includes("J_360"));
  assert.ok(status.resolved.presentation.missionOrchestration.pendingHandoffs.some((line: string) => line.startsWith("J_360:")));
  assert.equal(status.resolved.presentation.workflow.specialistSupportAgentId, "J_360");

  const blocked = await consultDocumentationCase("mostrar bloqueios do caso", reader);
  assert.ok(blocked.resolved.presentation.missionOrchestration.supportingAgents.includes("J_360"));
  assert.ok(blocked.resolved.presentation.missionOrchestration.pendingHandoffs.some((line: string) => line.startsWith("J_360:")));
});

function buildCaseContextForDocs() {
  return {
    caseId: "case-availability-docs",
    flow: "documents.collect",
    stage: "documentation",
    status: "blocked",
    nextStep: "revisar documentos",
    blocker: "documentação pendente",
    pendingItems: ["ownerDocument", "matrícula do imóvel"],
    updatedAt: new Date().toISOString(),
    canonical: { journeyType: "documentation", recommendedActions: [], blockedActions: [], missingContext: [], reasonCodes: [] },
    humanWorkflow: { currentObjective: "revisar documentos", waitingOn: "legal", urgency: "high", agingHours: 0, followUpRisk: "low", nextActionOwner: "Corretor", lastMeaningfulContactAt: null, doneDefinition: "x", likelyFailureMode: null },
  } as unknown as ImobCaseContext;
}

test("availability: indisponível, não verificado, falha e mapa malformado aplicam o MESMO resultado em todas as superfícies", async () => {
  const scenarios: Array<[string, Reader | undefined, "unavailable" | "unverified"]> = [
    ["indisponível", async () => ({ J_360: "unavailable", I_BC: "available" }), "unavailable"],
    ["ausente do mapa", async () => ({ I_BC: "available" }), "unverified"],
    ["sem leitor de disponibilidade", undefined, "unverified"],
    ["leitor lança erro", async () => { throw new Error("falha de consulta"); }, "unverified"],
    ["leitor devolve null", async () => null, "unverified"],
    ["valor desconhecido", async () => ({ J_360: "AVAILABLE" }), "unverified"],
  ];
  for (const [label, reader, expected] of scenarios) {
    const status = await consultDocumentationCase("qual status desse caso?", reader);
    const p = status.resolved.presentation;
    assert.equal(p.widget.specialists[0].primaryAgentId, "J_360", label);
    assert.equal(p.widget.specialists[0].availability, expected, label);
    assert.equal(p.widget.specialists[0].suggestedAction, null, `${label}: sem ação no card`);
    assert.doesNotMatch(p.text, /Specialist de apoio/, `${label}: sem apoio por especialista`);
    assert.deepEqual(p.consultiveRead.specialists, [], label);
    assert.equal(p.missionOrchestration.supportingAgents.includes("J_360"), false, `${label}: supportingAgents`);
    assert.equal(JSON.stringify(p.missionOrchestration.pendingHandoffs).includes("J_360"), false, `${label}: pendingHandoffs`);
    assert.equal(p.workflow.specialistSupportAgentId ?? null, null, `${label}: workflow`);
    assert.equal(p.missionOrchestration.missionStatus, "blocked", `${label}: o bloqueio documental continua visível`);
    assert.ok(p.missionOrchestration.blockingIssues.length >= 1, `${label}: bloqueios preservados`);

    const blocked = await consultDocumentationCase("mostrar bloqueios do caso", reader);
    assert.equal(blocked.resolved.presentation.missionOrchestration.supportingAgents.includes("J_360"), false, label);
    assert.equal(JSON.stringify(blocked.resolved.presentation.missionOrchestration.pendingHandoffs).includes("J_360"), false, label);
    assert.ok(blocked.resolved.presentation.missionOrchestration.blockingIssues.length >= 1, label);
  }
});

test("availability: o resultado de um agente não vaza para outro (somente J_360 indisponível)", async () => {
  const mixed = await consultDocumentationCase("qual status desse caso?", async () => ({ J_360: "unavailable", "fin-nexus": "available" }));
  assert.equal(mixed.resolved.presentation.widget.specialists[0].availability, "unavailable");
  assert.equal(mixed.resolved.presentation.missionOrchestration.supportingAgents.includes("fin-nexus"), false, "fin-nexus só entra se o caso o pedir");
});

test("availability: o caminho operacional (helpers do resolvedor) consulta no escopo e aplica o mesmo resultado", async () => {
  const item = buildDocumentationCaseRecord();
  const businessRead = buildImobCrmBusinessReadHelpers({
    asObject: (value: unknown) => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null),
    asString: (value: unknown) => (typeof value === "string" && value.trim().length > 0 ? value.trim() : null),
    asStringList: (value: unknown) => (Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : []),
    normalizeImobRouteText: (value: string) => value.toLowerCase(),
    formatBudgetCentsForImob: () => null,
    formatImobStatusLabel: (status: string | null | undefined) => status ?? "desconhecido",
    formatImobPendingList: (items: unknown) => (Array.isArray(items) ? items.join(", ") : ""),
    formatImobCaseFlowLabel: (flow: string) => flow,
    titleCaseRouteWords: (value: string) => value,
    createEmptyThreadState: (() => ({ mode: "consult", pendingSlot: "none", resultOffset: 0, slots: {}, operational: null })) as any,
    resolveImobBackingSpecialists,
    buildImobCanonicalCase: buildImobCrmLegacyCanonicalCase as any,
    resolveBusinessReadIntent: () => "pipeline_status",
  });
  const prisma = { imobCase: { findFirst: async ({ where }: any) => (where.id === item.id ? item : null) } };
  const run = async (reader?: Reader) => {
    const calls: Array<{ tenantId: string; workspaceId: string; sameClient: boolean }> = [];
    const helpers: any = {
      ...businessRead,
      asString: (value: unknown) => (typeof value === "string" && value.trim().length > 0 ? value.trim() : null),
      asObject: (value: unknown) => (value && typeof value === "object" && !Array.isArray(value) ? value : null),
      createEmptyThreadState: () => ({ mode: "consult", pendingSlot: "none", resultOffset: 0, slots: {}, operational: null }),
      formatImobCaseFlowLabel: (flow: string) => flow,
      isBulkPropertyOnboardingQuestion: () => false,
      isImobRecentRegistrationReadRequest: () => false,
      ...(reader
        ? { readBackingSpecialistAvailability: async (params: any) => { calls.push({ tenantId: params.tenantId, workspaceId: params.workspaceId, sameClient: params.prisma === prisma }); return reader(params); } }
        : {}),
    };
    const resolved: any = await resolveImobCaseOperationalConsult(
      { prisma: prisma as any, tenantId: AVAILABILITY_TENANT, workspaceId: AVAILABILITY_WORKSPACE, userId: "user-person-2", caseId: item.id, message: "qual status desse caso?", threadState: null as any },
      helpers,
      { normalized: "qual status desse caso?", businessReadIntent: "pipeline_status" } as any,
    );
    return { resolved, calls };
  };

  const available = await run(async () => ({ J_360: "available" }));
  assert.deepEqual(available.calls, [{ tenantId: AVAILABILITY_TENANT, workspaceId: AVAILABILITY_WORKSPACE, sameClient: true }]);
  assert.equal(available.resolved.presentation.widget.specialists[0].availability, "available");
  assert.ok(available.resolved.presentation.missionOrchestration.supportingAgents.includes("J_360"));

  for (const reader of [async () => ({ J_360: "unavailable" }), async () => { throw new Error("falha"); }, undefined]) {
    const closed = await run(reader as Reader | undefined);
    assert.notEqual(closed.resolved.presentation.widget.specialists[0].availability, "available");
    assert.equal(closed.resolved.presentation.widget.specialists[0].suggestedAction, null);
    assert.equal(closed.resolved.presentation.missionOrchestration.supportingAgents.includes("J_360"), false);
    assert.equal(JSON.stringify(closed.resolved.presentation.missionOrchestration.pendingHandoffs).includes("J_360"), false);
  }
});

test("availability: a rota liga a verificação canônica aos dois resolvedores do turno, no escopo do tenant e do workspace, sem regra própria", () => {
  const source = readFileSync(new URL("../routes/imob.ts", import.meta.url), "utf8");
  assert.equal((source.match(/readBackingSpecialistAvailability: readImobBackingSpecialistAvailabilityForTurn/g) ?? []).length, 2, "resolvedor operacional e fallback legado");
  assert.match(source, /readAgentAvailability\(\{\s*tenantId: params\.tenantId,\s*workspaceId: params\.workspaceId,\s*agentIds: IMOB_BACKING_SPECIALIST_AGENT_IDS,/);
  assert.match(source, /import \{ readAgentAvailability \} from "\.\.\/services\/agents";/);
  assert.doesNotMatch(source, /canBeSuggested|canReceiveHandoff/, "a rota não cria predicado de participação");
});

test("availability: fin-nexus inferido por bloqueio financeiro só entra quando comprovadamente disponível", async () => {
  // lead.qualify já traz 2 candidatos (I_BC e Diarias): o limite do bridge corta o financeiro, e a missão o infere pelo bloqueio.
  const financeCase = {
    ...buildDocumentationCaseRecord(),
    id: "case-availability-finance",
    flow: "lead.qualify",
    stage: "pending_data",
    status: "running",
    nextStep: "retomar contato",
    blockers: ["pagamento do sinal pendente"],
    pendingItems: [],
    canonical: { journeyType: "lead_qualification", recommendedActions: [], blockedActions: ["pagamento do sinal pendente"], missingContext: [], reasonCodes: ["BLOCKERS_PRESENT"] },
  };
  // J_360 também é inferido (pacote documental bloqueado) e a missão limita supportingAgents a 3: mantê-lo indisponível
  // deixa a vaga para o fin-nexus, cuja entrada depende só da própria disponibilidade.
  const others = { I_BC: "available", Diarias: "available", J_360: "unavailable", guardian: "available" };
  const withFinance = await consultDocumentationCase("qual status desse caso?", async () => ({ ...others, "fin-nexus": "available" }), financeCase);
  assert.deepEqual(withFinance.resolved.presentation.missionOrchestration.supportingAgents, ["I_BC", "Diarias", "fin-nexus"], "disponível: preserva o comportamento");
  for (const state of ["unavailable", "unverified"] as const) {
    const closed = await consultDocumentationCase("qual status desse caso?", async () => (state === "unavailable" ? { ...others, "fin-nexus": state } : others), financeCase);
    assert.deepEqual(closed.resolved.presentation.missionOrchestration.supportingAgents, ["I_BC", "Diarias"], state);
  }
});

// ---------------------------------------------------------------------------------------------
// Necessidades transversais da vertical IMOB (descoberta somente leitura; gatilho estrutural)
// ---------------------------------------------------------------------------------------------

test("transversal: a necessidade é declarada por domínio e capacidade e disparada só por sinais estruturais", () => {
  assert.deepEqual(IMOB_TRANSVERSAL_NEEDS.map(({ needId, domain, capability }) => ({ needId, domain, capability })), [
    { needId: "imob.listing.promotion", domain: "marketing", capability: "campaign" },
  ]);
  const expected = [{ needId: "imob.listing.promotion", domain: "marketing", capability: "campaign", label: "Campanha de divulgação do imóvel" }];
  assert.deepEqual(resolveImobTransversalNeeds({ caseContext: { flow: "listing.activate" }, operational: null }), expected, "fluxo do caso");
  assert.deepEqual(resolveImobTransversalNeeds({ caseContext: { flow: "lead.qualify" }, operational: { flow: "listing.activate" } }), expected, "fluxo operacional");
  assert.deepEqual(resolveImobTransversalNeeds({ caseContext: { flow: "lead.qualify" }, operational: { campaignDraft: { objective: "promote_listing" } } }), expected, "rascunho de campanha");
  assert.deepEqual(resolveImobTransversalNeeds({ operational: { marketScanOpportunity: { recommendedAction: "campanha" } } }), expected, "oportunidade de market scan");
  // nada de texto: palavras de marketing em qualquer campo textual não disparam nada
  assert.deepEqual(resolveImobTransversalNeeds({
    caseContext: { flow: "lead.qualify", nextStep: "fazer campanha de marketing", blocker: "marketing campanha divulgação" } as never,
    operational: { flow: "lead.qualify", lastMessage: "quero uma campanha de marketing", marketScanOpportunity: { recommendedAction: "captar" } },
  }), []);
  for (const bad of [undefined, null, {}, { caseContext: null, operational: "listing.activate" }, { caseContext: { flow: 42 }, operational: [] }, { operational: { campaignDraft: "x" } }]) {
    assert.deepEqual(resolveImobTransversalNeeds(bad as never), [], JSON.stringify(bad));
  }
});

/** Compara respostas de execuções distintas ignorando apenas o que é gerado a cada chamada (carimbos de tempo e ids de execução). */
function stable(value: unknown) {
  return JSON.parse(
    JSON.stringify(value)
      .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g, "<ts>")
      .replace(/flowrun-[0-9a-f]{8,}/g, "flowrun-<id>"),
  );
}

function discoveredCapability(over: Record<string, unknown> = {}) {
  return {
    need: { needId: "imob.listing.promotion", domain: "marketing", capability: "campaign", label: "Campanha de divulgação do imóvel" },
    state: "habilitavel",
    authority: { status: "contratacao_autorizada", reasonCode: "AUTHORITY_GRANTED" },
    reasons: ["NOT_ENABLED_IN_WORKSPACE"],
    provider: { agentId: "MKT", name: "Marketing GPS", description: "Planeja campanhas.", declaredCapabilities: ["Planejamento de campanha de divulgação multicanal"], origin: "agent_registry" },
    recipes: { status: "ok", items: [{ id: "rec-1", title: "Campanha de lançamento", summary: "Plano", tags: [], homologatedAt: null }] },
    enablement: { marketplaceItemId: "mkt-MKT", visibility: "public", conditions: ["Confirmação humana explícita antes de habilitar."] },
    nextAction: { kind: "open_commercial_details", actionDomain: "agent_enablement", requiresHumanConfirmation: true, marketplaceItemId: "mkt-MKT", workspaceId: "ws-a", path: "/self-service?marketplaceItem=mkt-MKT&workspaceId=ws-a" },
    ...over,
  };
}

function buildListingCaseRecord() {
  return {
    ...buildDocumentationCaseRecord(),
    id: "case-availability-listing",
    flow: "listing.activate",
    stage: "listing",
    status: "running",
    nextStep: "ativar anúncio do imóvel",
    blockers: [],
    pendingItems: [],
    canonical: { journeyType: "property_capture", recommendedActions: [{ id: "activate_listing", label: "Ativar anúncio", actionType: "consultive", inputHint: "ativar anúncio" }], blockedActions: [], missingContext: [], reasonCodes: [] },
  };
}

async function consultListing(reader?: (params: any) => Promise<unknown>, message = "qual status desse caso?", userId: string | null = null) {
  const item = buildListingCaseRecord();
  const seen: any[] = [];
  const threadState = { mode: "consult", pendingSlot: "none", resultOffset: 0, slots: {}, operational: null } as any;
  const resolved: any = await resolveImobCrmOperationalConsult({
    prisma: { imobCase: { findFirst: async ({ where }: any) => (where.id === item.id ? item : null) } } as any,
    tenantId: AVAILABILITY_TENANT,
    workspaceId: AVAILABILITY_WORKSPACE,
    userId,
    caseId: item.id,
    message,
    threadState,
    ...(reader ? { readTransversalCapabilities: async (params: any) => { seen.push(params); return reader(params); } } : {}),
  } as any);
  return { resolved, seen };
}

test("transversal: o cartão aparece no caso IMOB por sinal estrutural e a conversa original é preservada", async () => {
  const baseline = await consultListing();
  assert.equal(baseline.resolved.presentation.widget.transversalCapabilities, undefined, "sem leitor, nenhum cartão");

  const withCard = await consultListing(async () => [discoveredCapability()], "qual status desse caso?", "user-person-1");
  const card = withCard.resolved.presentation.widget.transversalCapabilities;
  assert.equal(card.length, 1);
  assert.equal(card[0].state, "habilitavel");
  assert.equal(card[0].nextAction.actionDomain, "agent_enablement");
  assert.equal(withCard.seen.length, 1);
  assert.equal(withCard.seen[0].tenantId, AVAILABILITY_TENANT);
  assert.equal(withCard.seen[0].workspaceId, AVAILABILITY_WORKSPACE);
  assert.equal(withCard.seen[0].userId, "user-person-1", "a autoridade de contratação é avaliada para a PESSOA que conversa");
  assert.equal(withCard.seen[0].caseContext.flow, "listing.activate", "o leitor recebe o contexto do caso");
  assert.equal(withCard.seen[0].operational, null);

  // preservação: removendo apenas o cartão, a resposta é idêntica à de antes (ação, texto, estado da conversa, widget)
  const stripped = stable(withCard.resolved);
  delete stripped.presentation.widget.transversalCapabilities;
  assert.deepEqual(stripped, stable(baseline.resolved));
  assert.equal(withCard.resolved.action, baseline.resolved.action);
  assert.deepEqual(withCard.resolved.conversationState, baseline.resolved.conversationState);
});

test("transversal: falha, retorno malformado ou formato inesperado não geram cartão nem ação", async () => {
  const baseline = stable((await consultListing()).resolved);
  const bad: Array<[string, (p: any) => Promise<unknown>]> = [
    ["lança", async () => { throw new Error("falha de consulta"); }],
    ["null", async () => null],
    ["objeto", async () => ({ state: "habilitado" })],
    ["itens sem need", async () => [{ state: "habilitado" }, null, 3]],
    ["itens sem state", async () => [{ need: { needId: "x" } }]],
  ];
  for (const [label, reader] of bad) {
    const { resolved } = await consultListing(reader);
    assert.deepEqual(stable(resolved), baseline, label);
  }
});

test("transversal: o caminho operacional (helpers do resolvedor) apresenta o mesmo cartão, com tenant e workspace do turno", async () => {
  const item = buildListingCaseRecord();
  const businessRead = buildImobCrmBusinessReadHelpers({
    asObject: (value: unknown) => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null),
    asString: (value: unknown) => (typeof value === "string" && value.trim().length > 0 ? value.trim() : null),
    asStringList: (value: unknown) => (Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : []),
    normalizeImobRouteText: (value: string) => value.toLowerCase(),
    formatBudgetCentsForImob: () => null,
    formatImobStatusLabel: (status: string | null | undefined) => status ?? "desconhecido",
    formatImobPendingList: (items: unknown) => (Array.isArray(items) ? items.join(", ") : ""),
    formatImobCaseFlowLabel: (flow: string) => flow,
    titleCaseRouteWords: (value: string) => value,
    createEmptyThreadState: (() => ({ mode: "consult", pendingSlot: "none", resultOffset: 0, slots: {}, operational: null })) as any,
    resolveImobBackingSpecialists,
    buildImobCanonicalCase: buildImobCrmLegacyCanonicalCase as any,
    resolveBusinessReadIntent: () => "pipeline_status",
  });
  const prisma = { imobCase: { findFirst: async ({ where }: any) => (where.id === item.id ? item : null) } };
  const operational = { flow: "listing.activate", campaignDraft: { objective: "promote_listing" } };
  const run = async (reader?: (params: any) => Promise<unknown>, transversalTurn?: unknown) => {
    const seen: any[] = [];
    const helpers: any = {
      ...businessRead,
      asString: (value: unknown) => (typeof value === "string" && value.trim().length > 0 ? value.trim() : null),
      asObject: (value: unknown) => (value && typeof value === "object" && !Array.isArray(value) ? value : null),
      createEmptyThreadState: () => ({ mode: "consult", pendingSlot: "none", resultOffset: 0, slots: {}, operational: null }),
      formatImobCaseFlowLabel: (flow: string) => flow,
      isBulkPropertyOnboardingQuestion: () => false,
      isImobRecentRegistrationReadRequest: () => false,
      ...(reader ? { readTransversalCapabilities: async (params: any) => { seen.push(params); return reader(params); } } : {}),
    };
    const resolved: any = await resolveImobCaseOperationalConsult(
      { prisma: prisma as any, tenantId: AVAILABILITY_TENANT, workspaceId: AVAILABILITY_WORKSPACE, userId: "user-person-2", caseId: item.id, message: "qual status desse caso?", threadState: { mode: "consult", pendingSlot: "none", resultOffset: 0, slots: {}, operational } as any, ...(transversalTurn ? { transversalTurn: transversalTurn as any } : {}) },
      helpers,
      { normalized: "qual status desse caso?", businessReadIntent: "pipeline_status" } as any,
    );
    return { resolved, seen };
  };

  // P10: turno interpretado como necessidade/contratação transversal. O texto descreve só o estado apurado; o cartão
  // vem do resolvedor de capacidades (necessidade do turno), e a leitura comercial do caso não é repetida.
  const turnOf = (operation: string, engagement?: string) => ({ operation, ...(engagement ? { engagement } : {}), needs: [{ domain: "marketing", capability: "campaign", label: "Planejamento" }], agents: ["MKT"], explicitAgent: true, roles: [] });
  const noStructuralSignal = { mode: "consult", pendingSlot: "none", resultOffset: 0, slots: {}, operational: null } as any;
  void noStructuralSignal;
  const promoted = await run(async () => [discoveredCapability()], turnOf("request_capability"));
  assert.equal(promoted.resolved.action, "crm.case.transversal.request_capability");
  assert.deepEqual(promoted.seen[0].turnNeeds, [{ domain: "marketing", capability: "campaign", label: "Planejamento" }], "a necessidade declarada pelo turno chega ao resolvedor");
  assert.match(promoted.resolved.presentation.text, /ainda não foi contratado nem ativado/);
  assert.match(promoted.resolved.presentation.text, /Nenhum cadastro novo será aberto/);
  assert.equal(promoted.resolved.presentation.widget.transversalCapabilities[0].need.needId, "imob.listing.promotion");
  assert.equal(promoted.resolved.presentation.card, undefined, "sem a leitura comercial repetida");
  assert.deepEqual(promoted.resolved.presentation.blocks, []);
  assert.doesNotMatch(promoted.resolved.presentation.text, /contratei|foi contratado com sucesso|assinatura criada/i);
  const asked = await run(async () => [discoveredCapability({ state: "habilitado", nextAction: { kind: "request_work", actionDomain: "agent_work", enabled: false, reason: "OPERATIONAL_HANDOFF_NOT_IMPLEMENTED" }, enablement: null })], turnOf("agent_engagement", "status"));
  assert.match(asked.resolved.presentation.text, /^Sim, está habilitado\./);
  assert.match(asked.resolved.presentation.text, /nenhum trabalho foi iniciado/);
  const notYet = await run(async () => [discoveredCapability()], turnOf("agent_engagement", "status"));
  assert.match(notYet.resolved.presentation.text, /^Ainda não\./);
  const readFailed = await run(async () => { throw new Error("falha de consulta"); }, turnOf("agent_engagement", "status"));
  assert.match(readFailed.resolved.presentation.text, /Não consegui confirmar\./);
  assert.match(readFailed.resolved.presentation.text, /nada foi contratado/);
  assert.equal(readFailed.resolved.presentation.widget.transversalCapabilities, undefined, "falha de leitura: nenhum cartão acionável");
  const baseline = await run();
  assert.equal(baseline.resolved.presentation.widget.transversalCapabilities, undefined);
  const withCard = await run(async () => [discoveredCapability({ state: "habilitado", nextAction: { kind: "request_work", actionDomain: "agent_work", enabled: false, reason: "OPERATIONAL_HANDOFF_NOT_IMPLEMENTED" }, enablement: null })]);
  assert.equal(withCard.resolved.presentation.widget.transversalCapabilities[0].state, "habilitado");
  assert.deepEqual(withCard.seen.map(({ tenantId, workspaceId, userId, operational: op }) => ({ tenantId, workspaceId, userId, op })), [
    { tenantId: AVAILABILITY_TENANT, workspaceId: AVAILABILITY_WORKSPACE, userId: "user-person-2", op: operational },
  ], "o estado operacional do turno e a pessoa que conversa chegam ao leitor");
  const stripped = stable(withCard.resolved);
  delete stripped.presentation.widget.transversalCapabilities;
  assert.deepEqual(stripped, stable(baseline.resolved), "conversa preservada");
  const failed = await run(async () => { throw new Error("falha"); });
  assert.equal(failed.resolved.presentation.widget.transversalCapabilities, undefined);
});

test("transversal: a rota liga a descoberta aos dois resolvedores e só consulta quando a necessidade se aplica", () => {
  const source = readFileSync(new URL("../routes/imob.ts", import.meta.url), "utf8");
  assert.equal((source.match(/readTransversalCapabilities: discoverImobTransversalCapabilitiesForTurn/g) ?? []).length, 2);
  assert.match(source, /const needs = resolveImobTransversalNeeds\([\s\S]*?\);\s*if \(needs\.length === 0\) return \[\];/);
  assert.match(source, /discoverCapabilityNeeds\(\{\s*needs,\s*tenantId: params\.tenantId,\s*workspaceId: params\.workspaceId,/);
  assert.match(source, /actor: \{ userId: params\.userId \?\? null \}/, "a autoridade de contratação é avaliada para a pessoa do turno");
  assert.doesNotMatch(source, /marketplace\.subscribe|\/subscribe|installations\/activate/, "a descoberta não chama habilitação");
});

// ---------------------------------------------------------------------------------------------
// P10: interpretação estruturada do turno (papéis + contexto), sem LLM. Limite explícito: o léxico é fechado e sem acento;
// frases fora dele NÃO são interceptadas e seguem o roteamento existente. Não é compreensão semântica geral.
// ---------------------------------------------------------------------------------------------

import { interpretTransversalTurn } from "../services/imob/imobTransversalTurn";
import { matchImobConversationalIntents } from "../services/imob/imobIntentCatalog";
import { buildInviteClarificationResolution, buildInviteGuidanceResolution, buildTransversalTurnText } from "../services/imob/imobTransversalTurnCopy";

test("P10 interpretação: divulgar, campanha e ajuda do Marketing viram necessidade transversal (variações equivalentes, não frase literal)", () => {
  const variants = [
    "Quero divulgar este apartamento do Batel.",
    "Precisamos preparar uma campanha para esse imóvel.",
    "Gostaria de anunciar essa unidade nas redes.",
    "Dá para promover esse imóvel? Quero impulsionar.",
    "O Marketing pode ajudar a anunciar essa unidade?",
    "preciso de publicidade pra esse apartamento",
  ];
  for (const message of variants) {
    const turn = interpretTransversalTurn({ message, caseBound: true });
    assert.equal(turn?.operation, "request_capability", message);
    assert.deepEqual(turn?.needs.map((need) => `${need.domain}/${need.capability}`), ["marketing/campaign"], message);
    assert.deepEqual(turn?.agents, ["MKT"], message);
  }
  assert.equal(interpretTransversalTurn({ message: "O Marketing pode ajudar a anunciar essa unidade?", caseBound: false })?.explicitAgent, true);
  // sem imóvel, sem caso e sem citar o agente, "divulgar" sozinho não é interceptado (falta referente)
  assert.equal(interpretTransversalTurn({ message: "Quero divulgar", caseBound: false }), null);
});

test("P10 interpretação: contratar o Marketing é contratação de AGENTE (estado ou pedido), nunca contrato imobiliário", () => {
  const status = ["Isso já contratou o Marketing?", "O marketing já está ativo para esse imóvel?", "Qual o status da contratação do Marketing?", "O Marketing foi habilitado?"];
  for (const message of status) {
    const turn = interpretTransversalTurn({ message, caseBound: true });
    assert.deepEqual([turn?.operation, turn?.engagement], ["agent_engagement", "status"], message);
  }
  const request = ["Quero contratar o especialista de Marketing", "Pode habilitar o Marketing?", "Preciso contratar a divulgação desse imóvel"];
  for (const message of request) {
    const turn = interpretTransversalTurn({ message, caseBound: true });
    assert.deepEqual([turn?.operation, turn?.engagement], ["agent_engagement", "request"], message);
  }
});

test("P10 interpretação: 'convidar' sem referente claro pede esclarecimento; convite explícito ao workspace é orientação; com agente não é convite", () => {
  for (const caseBound of [true, false]) {
    assert.equal(interpretTransversalTurn({ message: "Preciso convidar alguém?", caseBound })?.operation, "clarify_invite_referent");
    assert.equal(interpretTransversalTurn({ message: "Quero convidar um corretor.", caseBound })?.operation, "clarify_invite_referent");
  }
  for (const message of ["Convidar uma pessoa para o workspace", "Quero convidar um usuário para o workspace", "Como adiciono um membro? Quero convidar"]) {
    assert.equal(interpretTransversalTurn({ message, caseBound: true })?.operation, "invite_person", message);
  }
  assert.equal(interpretTransversalTurn({ message: "Preciso convidar o Marketing?", caseBound: true })?.operation, "agent_engagement");
  // a resposta de esclarecimento oferece as duas leituras e nada executa
  const asked = buildInviteClarificationResolution({ threadState: null, caseBound: true }) as any;
  assert.equal(asked.action, "crm.turn.clarify_invite_referent");
  assert.deepEqual(asked.presentation.card.ctas.map((cta: any) => cta.label), ["Convidar uma pessoa para o workspace", "Contratar o especialista de Marketing"]);
  for (const cta of asked.presentation.card.ctas) assert.equal(cta.action, "send_suggested_message");
  // e as próprias opções, reenviadas, são interpretadas sem novo esclarecimento
  assert.equal(interpretTransversalTurn({ message: asked.presentation.card.ctas[0].nextMessage, caseBound: true })?.operation, "invite_person");
  assert.equal(interpretTransversalTurn({ message: asked.presentation.card.ctas[1].nextMessage, caseBound: true })?.operation, "agent_engagement");
  assert.equal((buildInviteClarificationResolution({ threadState: null, caseBound: false }) as any).presentation.card.ctas.length, 1);
  assert.match((buildInviteGuidanceResolution({ threadState: null }) as any).presentation.text, /não envia convites/);
});

test("P10 interpretação: cadastro, contratos e demais fluxos legítimos seguem o roteamento existente (não são interceptados)", () => {
  const legitimate = [
    "cadastrar imóvel", "Quero cadastrar um novo imóvel em Curitiba", "cadastre o apartamento da Marta",
    "gerar contrato de locação", "Quero elaborar o contrato de compra e venda do imóvel", "preciso da minuta do contrato",
    "contrato de divulgação do imóvel", "cadastrar imóvel para divulgar", "ativar anúncio do imóvel", "qualificar lead",
    "qual status desse caso", "Qual o status desse caso?", "o que falta nesse caso", "agendar visita no imóvel",
  ];
  for (const message of legitimate) assert.equal(interpretTransversalTurn({ message, caseBound: true }), null, message);
  assert.equal(interpretTransversalTurn({ message: "", caseBound: true }), null);
  assert.equal(interpretTransversalTurn({ message: undefined as never, caseBound: true }), null);
});

test("P10 interpretação: o vocabulário vem do REGISTRO de capacidades (outro agente passa a ser reconhecido sem tocar o interpretador)", () => {
  const vocabulary = [{ agentId: "JUR", domain: "juridico", capability: "parecer", label: "Parecer jurídico", agentTerms: ["juridico"], needTerms: ["parecer", "revisar contrato"] }];
  const turn = interpretTransversalTurn({ message: "Preciso de um parecer sobre esse imóvel", caseBound: true }, vocabulary);
  assert.deepEqual([turn?.operation, turn?.needs[0]?.domain, turn?.agents], ["request_capability", "juridico", ["JUR"]]);
  assert.equal(interpretTransversalTurn({ message: "Quero divulgar este apartamento", caseBound: true }, vocabulary), null, "só o que está declarado");
  assert.equal(interpretTransversalTurn({ message: "Quero divulgar este apartamento", caseBound: true }, [])?.operation ?? null, null, "sem registro, nada é reconhecido");
});

test("P10 'qual status desse caso' com ou sem artigo é o MESMO pedido de pipeline (o catálogo ignora artigos)", () => {
  for (const message of ["Qual status desse caso?", "Qual o status desse caso?", "qual é o status desse caso", "Qual a situação... qual o status do caso?", "em que etapa está o caso"]) {
    assert.equal(matchImobConversationalIntents(message).some((intent) => intent.intentId === "pipeline_status"), true, message);
  }
  assert.equal(matchImobConversationalIntents("quero cadastrar um imóvel").some((intent) => intent.intentId === "pipeline_status"), false);
});

test("P10 texto das respostas: só descreve o estado apurado, nunca afirma contratação, habilitação ou trabalho que não houve", () => {
  const turns = [
    { operation: "request_capability", needs: [], agents: [], explicitAgent: false, roles: [] },
    { operation: "agent_engagement", engagement: "status", needs: [], agents: [], explicitAgent: true, roles: [] },
    { operation: "agent_engagement", engagement: "request", needs: [], agents: [], explicitAgent: true, roles: [] },
  ] as const;
  const states = ["habilitado", "habilitavel", "indisponivel", "nao_verificado", "estado-desconhecido", undefined];
  for (const turn of turns) {
    for (const state of states) {
      const text = buildTransversalTurnText(turn as never, state === undefined ? null : { state, provider: { name: "Marketing GPS", agentId: "MKT" } });
      assert.doesNotMatch(text, /contratei|contratado com sucesso|assinatura criada|campanha (foi )?(criada|publicada|iniciada)/i, `${turn.operation}/${state}`);
      if (state !== "habilitado") assert.doesNotMatch(text, /(já|esta) (está )?habilitado/i, `${turn.operation}/${state}: só afirma habilitado quando o servidor apurou`);
      if (state === "habilitado") assert.match(text, /nenhum trabalho foi iniciado|não está disponível nesta versão/i);
    }
  }
  assert.match(buildTransversalTurnText(turns[2] as never, { state: "habilitavel", provider: { name: "Marketing GPS", agentId: "MKT" } }), /^Esta conversa não contrata agentes\./);
});
