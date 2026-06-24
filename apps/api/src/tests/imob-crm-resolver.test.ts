import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveImobCrmOperationalConsult,
  resolveImobCrmOperationalUpdate,
} from "../services/imob/crm/imobCrmResolver";
import { buildImobCrmBusinessReadHelpers } from "../services/imob/crm/imobCrmBusinessRead";

function createThreadState() {
  return {
    mode: "consult",
    pendingSlot: "none",
    resultOffset: 0,
    slots: {},
    operational: null,
  };
}

function normalizeTestText(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function createMockPrisma(overrides?: {
  caseNextStep?: string;
  leadOverrides?: Record<string, unknown>;
  ownerOverrides?: Record<string, unknown>;
  propertyOverrides?: Record<string, unknown>;
  caseOverrides?: Record<string, unknown>;
}) {
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
      discoverySignals: {
        urgency: "high",
        painPoint: "precisa de espaço para home office",
        motivation: "mudança por trabalho",
        budgetFlexibility: "moderate",
        decisionMaker: "shared",
        timeline: "resolver ainda este mês",
        pendingSignals: [],
      },
      stage: "pending_data",
      temperature: "incomplete",
      pendingItems: ["faixa de orçamento", "cidade de interesse"],
      updatedAt: new Date("2026-01-01"),
      ...(overrides?.leadOverrides ?? {}),
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
      ...(overrides?.ownerOverrides ?? {}),
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
      ...(overrides?.propertyOverrides ?? {}),
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
      ...(overrides?.caseOverrides ?? {}),
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
        (!where.name || normalizeTestText(where.name) === normalizeTestText(item.name)) &&
        (!where.id || where.id === item.id) &&
        (!where.document || where.document === item.document) &&
        (!where.phone || where.phone === item.phone) &&
        (!where.email || where.email === item.email) &&
        (!where.OR || where.OR.some((condition: any) => (
          (condition.id && condition.id === item.id) ||
          (condition.document && condition.document === item.document) ||
          (condition.phone && condition.phone === item.phone) ||
          (condition.email && condition.email === item.email) ||
          (condition.name && normalizeTestText(condition.name) === normalizeTestText(item.name))
        )))
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
        if ("ownerId" in data) {
          property.owner = data.ownerId ? owners.find((item) => item.id === data.ownerId) ? { id: data.ownerId, name: owners.find((item) => item.id === data.ownerId)?.name ?? null } : null : null;
        }
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
    __data: {
      leads,
      owners,
      properties,
      cases,
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

test("IMOB_CRM update maps objetivo do lead into desiredGoal and clears the pending field", async () => {
  const prisma = createMockPrisma({
    leadOverrides: {
      goal: null,
      pendingItems: ["desiredGoal", "faixa de orçamento"],
    },
  });
  const resolved = await resolveImobCrmOperationalUpdate({
    prisma: prisma as any,
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    message: "objetivo do lead locação",
    caseId: "case-1",
    threadState: createThreadState(),
  });

  assert.equal(resolved?.action, "crm.lead.update");
  const updated = await (prisma as any).imobLead.findFirst({ where: { tenantId: "tenant-1", workspaceId: "workspace-1", OR: [{ name: "Merlo" }] } });
  assert.equal(updated.goal, "locacao");
  assert.deepEqual(updated.pendingItems, ["faixa de orçamento"]);
  assert.doesNotMatch(resolved?.presentation?.text ?? "", /desiredGoal/);
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
  assert.equal((resolved as any)?.presentation?.workflow?.primaryState, "case.review");
  assert.ok(Array.isArray((resolved as any)?.presentation?.workflow?.allowedTransitions));
  assert.equal(resolved?.presentation?.consultiveRead?.specialists?.[0]?.agentId, "I_BC");
  assert.match(resolved?.presentation?.consultiveRead?.specialists?.[0]?.ownershipBoundary ?? "", /não assume ownership do caso/i);
  assert.match(resolved?.presentation?.caseBrief?.summary ?? "", /principal risco agora/i);
  assert.equal(resolved?.presentation?.caseBrief?.nextActionOwner, "Corretor");
  assert.equal(resolved?.presentation?.preparedFollowUp?.recipientRole, "internal");
  assert.equal(resolved?.presentation?.preparedFollowUp?.variants?.length, 2);
  assert.match(resolved?.presentation?.decisionRationale?.summary ?? "", /blocker ativo|próxima ação/i);
  assert.ok(["medium", "high"].includes(resolved?.presentation?.decisionRationale?.confidence ?? ""));
  assert.ok((resolved?.presentation?.decisionRationale?.sourceRefs?.length ?? 0) >= 3);
  assert.ok((resolved?.presentation?.decisionRationale?.reasonCodes?.length ?? 0) >= 1);
  assert.equal(resolved?.presentation?.leadDiscovery?.coverage, "complete");
  assert.equal(resolved?.presentation?.leadDiscovery?.discoveryVersion, "imob.lead_discovery.v1");
  assert.equal(resolved?.presentation?.leadDiscovery?.shadowMode, true);
  assert.ok((resolved?.presentation?.leadDiscovery?.capturedSignals?.length ?? 0) >= 5);
  assert.equal(resolved?.presentation?.leadDiscovery?.recommendedNextMove, "validar aderência comercial e vincular imóvel com base no discovery já coletado");
  assert.equal(resolved?.presentation?.leadProfileReport?.profileVersion, "imob.lead_profile_report.v1");
  assert.equal(resolved?.presentation?.leadProfileReport?.profileStatus, "ready");
  assert.equal(resolved?.presentation?.leadProfileReport?.commercialReadiness, "high");
  assert.equal(resolved?.presentation?.leadProfileReport?.financialReadiness, "high");
  assert.equal(resolved?.presentation?.leadProfileReport?.consentScope, "internal_only");
  assert.ok((resolved?.presentation?.leadProfileReport?.strengths?.length ?? 0) >= 3);
  assert.equal(resolved?.presentation?.viabilityMarketAnalysis?.analysisVersion, "imob.viability_market_analysis.v1");
  assert.equal(resolved?.presentation?.viabilityMarketAnalysis?.marketStatus, "viable");
  assert.ok((resolved?.presentation?.viabilityMarketAnalysis?.viabilityScore ?? 0) >= 70);
  assert.equal(resolved?.presentation?.viabilityMarketAnalysis?.liquiditySignal, "high");
  assert.equal(resolved?.presentation?.viabilityMarketAnalysis?.priceConfidence, "high");
  assert.ok((resolved?.presentation?.viabilityMarketAnalysis?.anchorSignals?.length ?? 0) >= 4);
  assert.equal(resolved?.presentation?.closingDocuments?.documentStateVersion, "imob.closing_documents_real.v1");
  assert.equal(resolved?.presentation?.closingDocuments?.readinessStatus, "ready");
  assert.equal(resolved?.presentation?.closingDocuments?.packetReadiness, "ready");
  assert.equal(resolved?.presentation?.closingDocuments?.legalHandoffRecommended, false);
  assert.equal(resolved?.presentation?.missionOrchestration?.missionVersion, "imob.mission_orchestration.v1");
  assert.match(resolved?.presentation?.missionOrchestration?.missionId ?? "", /^mission-imob-/i);
  assert.equal(resolved?.presentation?.missionOrchestration?.missionStatus, "ready");
  assert.equal(resolved?.presentation?.missionOrchestration?.ownerAgentId, "IMOB");
  assert.equal(resolved?.presentation?.missionOrchestration?.ownerCapability, "inventory.active_watch");
  assert.ok((resolved?.presentation?.missionOrchestration?.supportingAgents?.includes("I_BC") ?? false), true);
  assert.ok((resolved?.presentation?.missionOrchestration?.missionReasonCodes?.length ?? 0) >= 2);
  assert.ok((resolved?.presentation?.missionOrchestration?.pendingHandoffs?.length ?? 0) >= 1);
  assert.ok((resolved?.presentation?.missionOrchestration?.evidenceRefs?.length ?? 0) >= 3);
  assert.equal(resolved?.presentation?.missionOrchestration?.createdAt, resolved?.presentation?.missionOrchestration?.closedAt);
  assert.equal(resolved?.presentation?.missionOrchestration?.shadowMode, true);
  assert.equal(resolved?.presentation?.leadScore?.scoreBand, "HOT");
  assert.equal(resolved?.presentation?.leadScore?.shadowMode, true);
  assert.equal(resolved?.presentation?.leadScore?.scoreVersion, "imob.lead_scoring.v1.1");
  assert.equal(resolved?.presentation?.leadScore?.confidence, "high");
  assert.ok((resolved?.presentation?.leadScore?.reasonCodes?.length ?? 0) >= 3);
  assert.equal(resolved?.presentation?.commercialMemory?.memoryVersion, "imob.commercial_memory.v1.1");
  assert.equal(resolved?.presentation?.commercialMemory?.confidence, "high");
  assert.ok((resolved?.presentation?.commercialMemory?.reasonCodes?.length ?? 0) >= 4);
  assert.ok((resolved?.presentation?.commercialMemory?.preferences?.length ?? 0) >= 4);
  assert.equal(resolved?.presentation?.commercialMemory?.nextTrigger?.kind, "decision_window");
  assert.match(resolved?.presentation?.commercialMemory?.lastUsefulAction ?? "", /Qualificar lead/i);
  assert.equal(resolved?.presentation?.reengagementSuggestion?.reason, "decision_window");
  assert.equal(resolved?.presentation?.reengagementSuggestion?.recommendedTiming, "today");
  assert.equal(resolved?.presentation?.reengagementSuggestion?.suggestedChannel, "internal");
  assert.equal(resolved?.presentation?.reengagementSuggestion?.shadowMode, true);
  assert.ok((resolved?.presentation?.reengagementSuggestion?.anchorSignals?.length ?? 0) >= 2);
  assert.equal(resolved?.presentation?.inventoryWatch?.watchStatus, "matching");
  assert.equal(resolved?.presentation?.inventoryWatch?.matchStrength, "high");
  assert.equal(resolved?.presentation?.inventoryWatch?.watchVersion, "imob.inventory_watch.v1");
  assert.equal(resolved?.presentation?.inventoryWatch?.shadowMode, true);
  assert.ok((resolved?.presentation?.inventoryWatch?.anchorSignals?.length ?? 0) >= 3);
  assert.equal(resolved?.presentation?.inventoryWatch?.recommendedNextMove, "retomar lead com imóveis aderentes");
  assert.equal(resolved?.presentation?.pilotFlow?.flowType, "assisted_reengagement_flow");
  assert.ok(["completed", "blocked"].includes(resolved?.presentation?.pilotFlow?.status ?? ""));
  assert.equal(resolved?.presentation?.pilotFlow?.visibleAgentId, "IMOB");
  assert.equal(resolved?.presentation?.pilotFlow?.capabilityId, "reengagement.continuous");
  assert.match(resolved?.presentation?.pilotFlow?.flowRunId ?? "", /^flowrun-/);
  assert.match(resolved?.presentation?.pilotFlow?.missionId ?? "", /^mission-imob-case-1-reengagement-continuous$/);
  if (resolved?.presentation?.pilotFlow?.status === "completed") {
    assert.match(resolved?.presentation?.pilotFlow?.jobId ?? "", /^imob-job-/);
    assert.match(resolved?.presentation?.pilotFlow?.trackingId ?? "", /^tracking-imob-job-/);
  } else {
    assert.equal(resolved?.presentation?.pilotFlow?.jobId ?? null, null);
    assert.equal(resolved?.presentation?.pilotFlow?.trackingId ?? null, null);
  }
  assert.ok((resolved?.presentation?.pilotFlow?.evidenceRefs?.length ?? 0) >= 5);
  const ctas = Array.isArray(resolved?.presentation?.card?.ctas) ? resolved?.presentation?.card?.ctas : [];
  assert.equal(
    ctas.some((item: any) => String(item?.nextMessage ?? "").toLowerCase().includes("qualificar lead deste caso")),
    true,
  );
});

test("IMOB_CRM business read connects assisted calendar pilot flow from case runtime", async () => {
  const resolved = await resolveImobCrmOperationalConsult({
    prisma: createMockPrisma({
      caseOverrides: {
        flow: "visit.schedule",
        nextStep: "confirmar agenda da visita",
      },
    }) as any,
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    message: "qual status desse caso?",
    threadState: createThreadState(),
  });

  assert.equal(resolved?.presentation?.pilotFlow?.flowType, "assisted_calendar_flow");
  assert.equal(resolved?.presentation?.pilotFlow?.status, "completed");
  assert.equal(resolved?.presentation?.pilotFlow?.capabilityId, "schedule.real_calendar");
  assert.equal(resolved?.presentation?.pilotFlow?.visibleAgentId, "IMOB");
  assert.match(resolved?.presentation?.pilotFlow?.trackingId ?? "", /^tracking-imob-job-/);
  assert.equal(resolved?.presentation?.pilotOperationalState?.activePilotFlow, "assisted_calendar_flow");
  assert.equal(resolved?.presentation?.pilotOperationalState?.status, "approval_required");
  assert.equal(resolved?.presentation?.pilotOperationalState?.rolloutStage, "shadow");
  assert.equal(resolved?.presentation?.pilotOperationalState?.approvalRef, null);
  assert.equal(resolved?.presentation?.pilotOperationalState?.approvalDecision, null);
  assert.equal(resolved?.presentation?.pilotOperationalState?.canRegressToShadow, false);
  assert.equal(resolved?.presentation?.pilotOperationalState?.visibleAgentId, "IMOB");
  assert.equal(resolved?.presentation?.pilotOperationalState?.trackingId, null);
  assert.equal(resolved?.presentation?.pilotOperationalState?.evidenceRefs?.length ?? 0, 0);
  assert.match(resolved?.presentation?.pilotOperationalState?.nextHumanAction ?? "", /registrar approval operacional/i);
  assert.equal(resolved?.presentation?.pilotControlState?.flowType, "assisted_calendar_flow");
  assert.equal(resolved?.presentation?.pilotControlState?.status, "approval_required");
  assert.equal(resolved?.presentation?.pilotControlState?.rolloutStage, "shadow");
  assert.equal(resolved?.presentation?.pilotControlState?.trackingId, null);
  assert.equal(resolved?.presentation?.pilotControlState?.visibleAgentId, "IMOB");
  assert.ok((resolved?.presentation?.pilotControlState?.availableActions?.length ?? 0) >= 2);
  assert.match(resolved?.presentation?.pilotControlState?.summary ?? "", /approval operacional auditável/i);
  assert.match(JSON.stringify(resolved?.presentation?.card?.lines ?? []), /Piloto operacional:/i);
  assert.match(JSON.stringify(resolved?.presentation?.card?.lines ?? []), /Próxima ação governada:/i);
});

test("IMOB_CRM business read hardens prepared follow-up from canonical commercial cadence", async () => {
  const resolved = await resolveImobCrmOperationalConsult({
    prisma: createMockPrisma({
      caseOverrides: {
        flow: "visit.schedule",
        stage: "post_visit",
        status: "in_progress",
        nextStep: "consultar caso",
        pendingItems: [],
        commercialFollowUp: {
          source: "follow_up_runtime",
          status: "awaiting_response",
          trigger: "no_response",
          suggestedChannel: "whatsapp",
          reasonCodes: ["FOLLOW_UP_RESPONSE_PENDING"],
          summary: "O caso já está em cadência comercial e aguarda resposta antes de qualquer novo handoff.",
          recommendedNextMove: "acompanhar a resposta do lead antes de retomar proposta ou visita",
        },
      },
    }) as any,
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    message: "qual status desse caso?",
    threadState: createThreadState(),
  });

  assert.equal(resolved?.action, "crm.case.pipeline_status");
  assert.match(resolved?.presentation?.text ?? "", /aguarda resposta|cadência comercial/i);
  assert.equal(resolved?.presentation?.preparedFollowUp?.recipientRole, "lead");
  assert.equal(resolved?.presentation?.preparedFollowUp?.trigger, "no_response");
  assert.match(resolved?.presentation?.preparedFollowUp?.objective ?? "", /aguarda resposta/i);
  assert.match(resolved?.presentation?.suggestedNextAction ?? "", /proof mínima|evid[aê]ncia/i);
  assert.ok((resolved?.presentation?.pendingFieldLabels ?? []).some((item) => /resposta comercial pendente/i.test(String(item))));
  assert.equal(resolved?.presentation?.reengagementSuggestion, undefined);
});

test("IMOB_CRM pilot status consult stays read-only for governed questions", async () => {
  const prisma = createMockPrisma({
    caseOverrides: {
      flow: "visit.schedule",
      nextStep: "confirmar agenda da visita",
    },
  }) as any;
  const beforeSnapshot = JSON.stringify(prisma.__data);

  const resolved = await resolveImobCrmOperationalConsult({
    prisma,
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    caseId: "case-1",
    message: "qual status desse caso?",
    threadState: createThreadState(),
  });

  const afterSnapshot = JSON.stringify(prisma.__data);
  assert.equal(resolved?.action, "crm.case.pipeline_status");
  assert.equal(resolved?.presentation?.pilotOperationalState?.status, "approval_required");
  assert.equal(resolved?.presentation?.pilotOperationalState?.rolloutStage, "shadow");
  assert.equal(resolved?.presentation?.pilotControlState?.trackingId, null);
  assert.equal((resolved as any)?.presentation?.workflow?.pilotState, "pilot.status");
  assert.equal((resolved as any)?.presentation?.workflow?.pilotReadOnly, true);
  assert.ok((resolved as any)?.presentation?.workflow?.reasonCodes?.includes("pilot_read_only"));
  const pilotCtas = Array.isArray((resolved as any)?.presentation?.card?.ctas) ? (resolved as any).presentation.card.ctas : [];
  assert.equal(
    pilotCtas.every((item: any) => typeof item?.nextMessage === "string" && String(item.nextMessage).trim().length > 0),
    true,
  );
  assert.equal(beforeSnapshot, afterSnapshot);
});

test("IMOB_CRM pilot status consult routes governed pilot questions to pipeline status instead of generic status choices", async () => {
  const resolved = await resolveImobCrmOperationalConsult({
    prisma: createMockPrisma({
      caseOverrides: {
        flow: "visit.schedule",
        nextStep: "confirmar agenda da visita",
      },
    }) as any,
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    caseId: "case-1",
    message: "qual o status do piloto?",
    threadState: createThreadState(),
  });

  assert.equal(resolved?.action, "crm.case.pipeline_status");
  assert.equal((resolved as any)?.presentation?.workflow?.pilotState, "pilot.status");
  assert.equal((resolved as any)?.presentation?.workflow?.pilotReadOnly, true);
  assert.ok((resolved as any)?.presentation?.workflow?.reasonCodes?.includes("pilot_read_only"));
  assert.match(JSON.stringify(resolved?.presentation?.card?.lines ?? []), /Piloto operacional:/i);
  assert.match(JSON.stringify(resolved?.presentation?.card?.lines ?? []), /Próxima ação governada:/i);
});

test("IMOB_CRM business read connects shadow capture enrichment pilot flow from case runtime", async () => {
  const resolved = await resolveImobCrmOperationalConsult({
    prisma: createMockPrisma({
      caseOverrides: {
        flow: "property.create",
        nextStep: "avançar captação deste caso",
      },
    }) as any,
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    message: "qual status desse caso?",
    threadState: createThreadState(),
  });

  assert.equal(resolved?.presentation?.pilotFlow?.flowType, "shadow_capture_enrichment_flow");
  assert.equal(resolved?.presentation?.pilotFlow?.status, "shadow_recorded");
  assert.equal(resolved?.presentation?.pilotFlow?.capabilityId, "active_capture.scouting");
  assert.equal(resolved?.presentation?.pilotFlow?.visibleAgentId, "IMOB");
  assert.ok((resolved?.presentation?.pilotFlow?.evidenceRefs?.some((item: any) => item?.ref === "pilot.source.ref") ?? false), true);
  assert.equal(resolved?.presentation?.pilotOperationalState, undefined);
  assert.equal(resolved?.presentation?.pilotControlState, undefined);
});

test("IMOB_CRM business read returns WARM lead score for mixed signals", async () => {
  const resolved = await resolveImobCrmOperationalConsult({
    prisma: createMockPrisma({
      leadOverrides: {
        discoverySignals: {
          urgency: "medium",
          painPoint: null,
          motivation: "quer sair do aluguel",
          budgetFlexibility: "strict",
          decisionMaker: "shared",
          timeline: null,
          pendingSignals: ["painPoint", "timeline"],
        },
      },
      caseOverrides: {
        blockers: [],
        pendingItems: ["cidade de interesse", "telefone do lead"],
      },
    }) as any,
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    message: "qual status desse caso?",
    threadState: createThreadState(),
  });

  assert.equal(resolved?.presentation?.leadScore?.scoreBand, "WARM");
  assert.equal(resolved?.presentation?.leadScore?.confidence, "medium");
  assert.ok((resolved?.presentation?.leadScore?.reasonCodes?.length ?? 0) >= 2);
  assert.equal(resolved?.presentation?.commercialMemory?.confidence, "medium");
  assert.ok((resolved?.presentation?.commercialMemory?.missingEvidence?.length ?? 0) >= 1);
  assert.equal(resolved?.presentation?.leadDiscovery?.coverage, "partial");
  assert.equal(resolved?.presentation?.leadProfileReport?.profileStatus, "partial");
  assert.equal(resolved?.presentation?.leadProfileReport?.commercialReadiness, "medium");
  assert.ok((resolved?.presentation?.leadProfileReport?.missingEvidence?.length ?? 0) >= 2);
  assert.equal(resolved?.presentation?.viabilityMarketAnalysis?.marketStatus, "watch");
  assert.ok((resolved?.presentation?.viabilityMarketAnalysis?.viabilityScore ?? 0) >= 45);
  assert.ok((resolved?.presentation?.viabilityMarketAnalysis?.viabilityScore ?? 100) < 70);
  assert.ok((resolved?.presentation?.viabilityMarketAnalysis?.missingEvidence?.length ?? 0) >= 1);
  assert.equal(resolved?.presentation?.closingDocuments?.readinessStatus, "partial");
  assert.equal(resolved?.presentation?.closingDocuments?.packetReadiness, "partial");
  assert.ok((resolved?.presentation?.leadDiscovery?.missingSignals?.length ?? 0) >= 1);
  assert.ok((resolved?.presentation?.leadScore?.scoreValue ?? 0) >= 40);
  assert.ok((resolved?.presentation?.leadScore?.scoreValue ?? 0) < 70);
  assert.ok((resolved?.presentation?.leadScore?.factors?.length ?? 0) >= 2);
  assert.equal(resolved?.presentation?.inventoryWatch?.watchStatus, "weak_match");
  assert.equal(resolved?.presentation?.inventoryWatch?.matchStrength, "medium");
  assert.equal(resolved?.presentation?.inventoryWatch?.recommendedNextMove, "refinar cidade ou orçamento antes de retomar");
  assert.ok((resolved?.presentation?.inventoryWatch?.missingCriteria?.length ?? 0) >= 1);
});

test("IMOB_CRM business read returns COLD lead score for weak commercial readiness", async () => {
  const resolved = await resolveImobCrmOperationalConsult({
    prisma: createMockPrisma({
      leadOverrides: {
        discoverySignals: {
          urgency: "low",
          painPoint: null,
          motivation: null,
          budgetFlexibility: "strict",
          decisionMaker: "third_party",
          timeline: null,
          pendingSignals: ["painPoint", "motivation", "timeline"],
        },
      },
      caseOverrides: {
        blockers: ["documentação pendente"],
        pendingItems: ["cidade de interesse", "telefone do lead", "orçamento real"],
        updatedAt: new Date("2025-12-01"),
      },
    }) as any,
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    message: "qual status desse caso?",
    threadState: createThreadState(),
  });

  assert.equal(resolved?.presentation?.leadScore?.scoreBand, "COLD");
  assert.equal(resolved?.presentation?.leadScore?.confidence, "low");
  assert.ok((resolved?.presentation?.leadScore?.reasonCodes?.includes("lead_low_readiness") ?? false), true);
  assert.ok((resolved?.presentation?.leadScore?.scoreValue ?? 100) < 40);
  assert.equal(resolved?.presentation?.inventoryWatch?.watchStatus, "weak_match");
  assert.equal(resolved?.presentation?.inventoryWatch?.matchStrength, "low");
});

test("IMOB_CRM business read returns UNKNOWN lead score when evidence is insufficient", async () => {
  const resolved = await resolveImobCrmOperationalConsult({
    prisma: createMockPrisma({
      leadOverrides: {
        goal: null,
        targetCity: null,
        budgetMaxCents: null,
        discoverySignals: {
          urgency: null,
          painPoint: null,
          motivation: null,
          budgetFlexibility: null,
          decisionMaker: null,
          timeline: null,
          pendingSignals: ["urgency", "painPoint", "motivation", "budgetFlexibility", "decisionMaker", "timeline"],
        },
      },
      caseOverrides: {
        nextStep: null,
        pendingItems: [],
        blockers: [],
        property: {
          id: "property-1",
          ownerId: "owner-1",
          propertyType: null,
          goal: null,
          address: "Rua 1000, 123",
          city: null,
          neighborhood: null,
          askingPriceCents: null,
          status: "pending_data",
          pendingItems: [],
          owner: { name: "João" },
          _count: { cases: 1 },
          updatedAt: new Date("2026-01-01"),
        },
      },
    }) as any,
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    message: "qual status desse caso?",
    threadState: createThreadState(),
  });

  assert.equal(resolved?.presentation?.leadScore?.scoreBand, "UNKNOWN");
  assert.equal(resolved?.presentation?.leadDiscovery?.coverage, "insufficient");
  assert.ok((resolved?.presentation?.leadDiscovery?.missingSignals?.length ?? 0) >= 5);
  assert.equal(resolved?.presentation?.leadScore?.scoreValue, 0);
  assert.equal(resolved?.presentation?.leadScore?.shadowMode, true);
  assert.equal(resolved?.presentation?.leadScore?.confidence, "low");
  assert.ok((resolved?.presentation?.leadScore?.reasonCodes?.includes("lead_evidence_insufficient") ?? false), true);
  assert.ok((resolved?.presentation?.leadScore?.missingEvidence?.length ?? 0) >= 1);
  assert.equal(resolved?.presentation?.commercialMemory?.confidence, "low");
  assert.ok((resolved?.presentation?.commercialMemory?.reasonCodes?.includes("trigger_readiness_check") ?? false), true);
  assert.ok((resolved?.presentation?.commercialMemory?.missingEvidence?.length ?? 0) >= 4);
  assert.equal(resolved?.presentation?.leadProfileReport?.profileStatus, "insufficient");
  assert.equal(resolved?.presentation?.leadProfileReport?.commercialReadiness, "unknown");
  assert.equal(resolved?.presentation?.leadProfileReport?.financialReadiness, "unknown");
  assert.ok((resolved?.presentation?.leadProfileReport?.missingEvidence?.length ?? 0) >= 4);
  assert.equal(resolved?.presentation?.viabilityMarketAnalysis?.marketStatus, "insufficient_context");
  assert.equal(resolved?.presentation?.viabilityMarketAnalysis?.liquiditySignal, "unknown");
  assert.equal(resolved?.presentation?.viabilityMarketAnalysis?.priceConfidence, "unknown");
  assert.ok((resolved?.presentation?.viabilityMarketAnalysis?.missingEvidence?.length ?? 0) >= 4);
  assert.equal(resolved?.presentation?.closingDocuments?.readinessStatus, "insufficient_context");
  assert.equal(resolved?.presentation?.commercialMemory?.nextTrigger?.kind, "readiness_check");
  assert.equal(resolved?.presentation?.reengagementSuggestion?.reason, "readiness_check");
  assert.ok((resolved?.presentation?.reengagementSuggestion?.missingEvidence?.length ?? 0) >= 1);
  assert.equal(resolved?.presentation?.inventoryWatch?.watchStatus, "insufficient_context");
  assert.equal(resolved?.presentation?.inventoryWatch?.matchStrength, "unknown");
  assert.equal(resolved?.presentation?.inventoryWatch?.recommendedNextMove, "coletar preferências mínimas antes de sugerir estoque");
  assert.equal(resolved?.presentation?.missionOrchestration?.missionStatus, "watch");
  assert.equal(resolved?.presentation?.missionOrchestration?.ownerAgentId, "IMOB");
  assert.equal(resolved?.presentation?.missionOrchestration?.ownerCapability, "lead.qualify.discovery");
  assert.ok((resolved?.presentation?.missionOrchestration?.evidenceRefs?.length ?? 0) >= 2);
});

test("IMOB_CRM business read restores discovery signals from lead metadata", async () => {
  const resolved = await resolveImobCrmOperationalConsult({
    prisma: createMockPrisma({
      leadOverrides: {
        discoverySignals: undefined,
        metadata: {
          discoverySignals: {
            urgency: "high",
            painPoint: "precisa vender rápido para reorganizar caixa",
            motivation: "mudança de cidade",
            budgetFlexibility: "moderate",
            decisionMaker: "solo",
            timeline: "nesta quinzena",
            pendingSignals: [],
          },
        },
      },
    }) as any,
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    message: "qual status desse caso?",
    threadState: createThreadState(),
  });

  assert.equal(resolved?.presentation?.leadDiscovery?.coverage, "complete");
  assert.match(resolved?.presentation?.leadDiscovery?.capturedSignals?.[1] ?? "", /precisa vender rápido/i);
});

test("IMOB_CRM business read returns no_match inventory watch when case signals conflict", async () => {
  const resolved = await resolveImobCrmOperationalConsult({
    prisma: createMockPrisma({
      leadOverrides: {
        goal: "locacao",
        targetCity: "Balneário Camboriú",
        budgetMaxCents: 250000,
        discoverySignals: {
          urgency: "high",
          painPoint: "precisa mudar ainda este mês",
          motivation: "transferência de trabalho",
          budgetFlexibility: "moderate",
          decisionMaker: "self",
          timeline: "esta semana",
          pendingSignals: [],
        },
      },
      caseOverrides: {
        property: {
          id: "property-1",
          goal: "venda",
          city: "Itajaí",
          neighborhood: "Centro",
          propertyType: "apartamento",
          askingPriceCents: 98000000,
        },
      },
    }) as any,
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    message: "qual status desse caso?",
    threadState: createThreadState(),
  });

  assert.equal(resolved?.presentation?.inventoryWatch?.watchStatus, "no_match");
  assert.equal(resolved?.presentation?.inventoryWatch?.matchStrength, "low");
  assert.equal(resolved?.presentation?.inventoryWatch?.recommendedNextMove, "revalidar objetivo e flexibilidade comercial");
});

test("IMOB_CRM business read does not expose lead score for non-lead flow", async () => {
  const resolved = await resolveImobCrmOperationalConsult({
    prisma: createMockPrisma({
      caseOverrides: {
        flow: "property.create",
      },
    }) as any,
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    message: "qual status desse caso?",
    threadState: createThreadState(),
  });

  assert.equal(resolved?.presentation?.leadScore, undefined);
  assert.ok((resolved?.presentation?.commercialMemory?.objections?.length ?? 0) <= 2);
  assert.ok((resolved?.presentation?.commercialMemory?.preferences?.every((item: any) =>
    ["goal", "target_city", "budget"].includes(String(item?.key))) ?? false));
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

test("IMOB_CRM business read suggests document reengagement in shadow without changing next step", async () => {
  const resolved = await resolveImobCrmOperationalConsult({
    prisma: createMockPrisma({
      caseOverrides: {
        flow: "documents.collect",
        blockers: ["documentação pendente"],
        pendingItems: ["ownerDocument", "matrícula do imóvel"],
      },
    }) as any,
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    message: "mostrar bloqueios do caso",
    threadState: createThreadState(),
  });

  assert.equal(resolved?.action, "crm.case.blocked_run_resolution");
  assert.equal(resolved?.presentation?.reengagementSuggestion?.reason, "document_pending");
  assert.equal(resolved?.presentation?.reengagementSuggestion?.recommendedTiming, "this_week");
  assert.ok((resolved?.presentation?.reengagementSuggestion?.anchorSignals?.length ?? 0) >= 2);
  assert.ok((resolved?.presentation?.reengagementSuggestion?.messageBase?.length ?? 0) > 0);
  assert.equal(resolved?.presentation?.closingDocuments?.readinessStatus, "blocked");
  assert.equal(resolved?.presentation?.closingDocuments?.packetReadiness, "blocked");
  assert.equal(resolved?.presentation?.closingDocuments?.legalHandoffRecommended, true);
  assert.ok((resolved?.presentation?.closingDocuments?.blockingIssues?.length ?? 0) >= 1);
  assert.equal(resolved?.presentation?.missionOrchestration?.missionStatus, "blocked");
  assert.equal(resolved?.presentation?.missionOrchestration?.ownerCapability, "closing.documents_real");
  assert.ok((resolved?.presentation?.missionOrchestration?.supportingAgents?.includes("J_360") ?? false), true);
  assert.ok((resolved?.presentation?.missionOrchestration?.blockingIssues?.length ?? 0) >= 1);
  assert.ok((resolved?.presentation?.missionOrchestration?.closedAt?.length ?? 0) > 0);
  assert.equal((resolved as any)?.presentation?.workflow?.primaryState, "documents.review");
  assert.equal((resolved as any)?.presentation?.workflow?.ownershipAgentId, "IMOB");
  assert.equal((resolved as any)?.presentation?.workflow?.specialistSupportAgentId, "J_360");
  assert.match(resolved?.presentation?.nextStep ?? "", /revisar documentos|consultar caso/i);
  assert.match(JSON.stringify(resolved?.presentation?.card?.ctas ?? []), /Revisar documentos|Consultar caso/i);
  assert.equal(
    (Array.isArray(resolved?.presentation?.card?.ctas) ? resolved?.presentation?.card?.ctas : []).every((item: any) =>
      /revisar documentos|consultar caso/i.test(String(item?.nextMessage ?? ""))),
    true,
  );
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

test("IMOB_CRM domain guidance prepares documentary work without caseId", async () => {
  const resolved = await resolveImobCrmOperationalConsult({
    prisma: createMockPrisma() as any,
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    message: "como preparar a documentação desse caso?",
    threadState: createThreadState(),
  });

  assert.equal(resolved?.action, "crm.domain_guidance");
  assert.match(resolved?.presentation?.text ?? "", /trabalho documental|pacote mínimo|cobrança documental/i);
  assert.match(resolved?.presentation?.card?.title ?? "", /Preparação documental/i);
});

test("IMOB_CRM domain guidance prepares follow-up without caseId", async () => {
  const resolved = await resolveImobCrmOperationalConsult({
    prisma: createMockPrisma() as any,
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    message: "prepara mensagem de follow-up para esse caso",
    threadState: createThreadState(),
  });

  assert.equal(resolved?.action, "crm.domain_guidance");
  assert.match(resolved?.presentation?.text ?? "", /follow-up útil|ação única|próximo contato/i);
  assert.match(resolved?.presentation?.card?.title ?? "", /follow-up/i);
  assert.equal(resolved?.presentation?.preparedFollowUp?.recipientRole, "lead");
  assert.equal(resolved?.presentation?.preparedFollowUp?.variants?.length, 2);
  assert.match(resolved?.presentation?.preparedFollowUp?.variants?.[1]?.text ?? "", /não deixarmos o atendimento esfriar|objeção principal/i);
});

test("IMOB_CRM domain guidance prepares structured case resume without caseId", async () => {
  const resolved = await resolveImobCrmOperationalConsult({
    prisma: createMockPrisma() as any,
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    message: "quero retomar um caso antigo rapidamente com resumo do caso",
    threadState: createThreadState(),
  });

  assert.equal(resolved?.action, "crm.domain_guidance");
  assert.match(resolved?.presentation?.text ?? "", /fase, blocker, waitingOn, owner da ação/i);
  assert.match(resolved?.presentation?.card?.title ?? "", /Resumo estruturado do caso/i);
});

test("IMOB_CRM domain guidance prepares approval without executing it", async () => {
  const resolved = await resolveImobCrmOperationalConsult({
    prisma: createMockPrisma() as any,
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    message: "o que preciso para approval nesse fechamento?",
    threadState: createThreadState(),
  });

  assert.equal(resolved?.action, "crm.domain_guidance");
  assert.match(resolved?.presentation?.text ?? "", /approval forte|reasonCode|evidência mínima|policy/i);
  assert.match(resolved?.presentation?.card?.title ?? "", /approval/i);
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
  assert.equal(
    ctas.every((item: any) => typeof item?.nextMessage === "string" && String(item.nextMessage).trim().length > 0),
    true,
  );
  assert.match(resolved?.presentation?.decisionRationale?.summary ?? "", /destravar o blocker|pendência dominante/i);
  assert.ok((resolved?.presentation?.decisionRationale?.sourceRefs?.length ?? 0) >= 2);
  assert.ok((resolved?.presentation?.decisionRationale?.reasonCodes?.length ?? 0) >= 1);
  assert.doesNotMatch(resolved?.presentation?.text ?? "", /Specialist de apoio:/i);
  assert.equal((resolved?.presentation?.consultiveRead?.specialists?.length ?? 0), 0);
});

test("IMOB_CRM blocked consult remains read-only while exposing blocker context", async () => {
  const prisma = createMockPrisma({
    caseOverrides: {
      flow: "property.create",
      stage: "collecting",
      status: "blocked",
      nextStep: "mostrar bloqueios do caso",
      blockers: ["dados do imóvel ainda estão incompletos para seguir"],
      pendingItems: ["tipo", "endereço"],
    },
  }) as any;
  const beforeSnapshot = JSON.stringify(prisma.__data);

  const resolved = await resolveImobCrmOperationalConsult({
    prisma,
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    caseId: "case-1",
    message: "mostrar bloqueios do caso",
    threadState: createThreadState(),
  });

  const afterSnapshot = JSON.stringify(prisma.__data);
  assert.equal(resolved?.action, "crm.case.blocked_run_resolution");
  assert.match(resolved?.presentation?.text ?? "", /bloqueio ativo|pendência crítica|próximo passo/i);
  assert.equal(beforeSnapshot, afterSnapshot);
});

test("IMOB_CRM canonical enrichment does not inject consultive widget over active property.create form", () => {
  const helpers = buildImobCrmBusinessReadHelpers({
    asObject: (value: unknown) => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null),
    asString: (value: unknown) => (typeof value === "string" && value.trim().length > 0 ? value.trim() : null),
    asStringList: (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [],
    normalizeImobRouteText: (value: string) => value.toLowerCase(),
    formatBudgetCentsForImob: () => null,
    formatImobStatusLabel: (status: string | null | undefined) => status ?? "desconhecido",
    formatImobPendingList: (items: string[] | null | undefined) => (items ?? []).join(", "),
    formatImobCaseFlowLabel: (flow: string) => flow,
    titleCaseRouteWords: (value: string) => value,
    createEmptyThreadState: createThreadState as any,
    resolveImobBackingSpecialists: () => [],
    buildImobCanonicalCase: () => ({
      journeyType: "property_capture",
      partyRole: "owner",
      commercialGoal: "captacao",
      recommendedActions: [
        { id: "review_blockers", label: "Revisar bloqueios", actionType: "consultive", inputHint: "mostrar bloqueios do caso" },
      ],
      blockedActions: ["dados do imóvel ainda estão incompletos para seguir"],
      missingContext: ["tipo", "endereço"],
      reasonCodes: ["BLOCKERS_PRESENT", "PENDING_ITEMS_PRESENT"],
    }),
    resolveBusinessReadIntent: () => "pipeline_status",
  });

  const resolved = helpers.applyCanonicalJourneyToResolvedData({
    conversationState: {
      mode: "execute",
      pendingSlot: "none",
      resultOffset: 0,
      slots: {},
      operational: {
        flow: "property.create",
        status: "collecting",
        pendingFields: ["propertyType", "address"],
        propertyDraft: {
          goal: "locacao",
          city: "Balneário Camboriú",
        },
      },
    },
    presentation: {
      text: "O cadastro do imóvel ainda precisa de complementos para seguir.",
      nextStep: "Completar dados do imóvel antes de avançar a captação.",
      pendingFieldLabels: ["tipo", "endereço"],
      form: {
        entity: "imovel",
        label: "Cadastrar imóvel",
        fields: [],
      },
    },
  }, {
    caseId: "case-1",
    flow: "property.create",
    stage: "collecting",
    status: "blocked",
    nextStep: "mostrar bloqueios do caso",
    blocker: "Dados do imóvel ainda estão incompletos para seguir.",
    pendingItems: ["tipo", "endereço"],
    canonical: {
      journeyType: "property_capture",
      partyRole: "owner",
      commercialGoal: "captacao",
      recommendedActions: [
        { id: "review_blockers", label: "Revisar bloqueios", actionType: "consultive", inputHint: "mostrar bloqueios do caso" },
      ],
      blockedActions: ["dados do imóvel ainda estão incompletos para seguir"],
      missingContext: ["tipo", "endereço"],
      reasonCodes: ["BLOCKERS_PRESENT", "PENDING_ITEMS_PRESENT"],
    },
  } as any);

  assert.equal((resolved as any).presentation?.widget, undefined);
  assert.equal((resolved as any).presentation?.suggestedNextAction, "Completar dados do imóvel antes de avançar a captação.");
});

test("IMOB_CRM blocked consult adds visit workflow blocker when the property is not linked", async () => {
  const resolved = await resolveImobCrmOperationalConsult({
    prisma: createMockPrisma({
      caseOverrides: {
        flow: "visit.schedule",
        nextStep: "agendar visita",
        propertyId: null,
        property: null,
        blockers: [],
        pendingItems: ["imóvel da visita", "nome do visitante", "telefone do visitante", "data da visita"],
      },
    }) as any,
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    message: "mostrar bloqueios do caso",
    threadState: createThreadState(),
  });

  assert.equal(resolved?.action, "crm.case.blocked_run_resolution");
  assert.equal((resolved as any)?.presentation?.workflow?.primaryState, "case.review");
  assert.ok((resolved as any)?.presentation?.workflow?.reasonCodes?.includes("visit_missing_property"));
  assert.equal((resolved as any)?.presentation?.workflow?.reasonCodes?.includes("visit_missing_lead_qualification"), false);
  assert.match(JSON.stringify(resolved?.presentation?.card?.lines ?? []), /Pendência dominante: imóvel da visita/i);
  assert.doesNotMatch(JSON.stringify(resolved?.presentation?.card?.lines ?? []), /Piloto operacional:|Próxima ação governada:/i);
  assert.match(resolved?.presentation?.nextStep ?? "", /cadastrar imóvel|cadastrar imovel/i);
  assert.equal(resolved?.presentation?.suggestedNextAction, resolved?.presentation?.nextStep);
  assert.equal(resolved?.presentation?.card?.ctas?.[0]?.nextMessage, resolved?.presentation?.nextStep);
  assert.equal(resolved?.presentation?.card?.ctas?.[0]?.kind, "primary");
  assert.equal((resolved?.presentation?.blocks ?? []).length, 0);
  assert.doesNotMatch(resolved?.presentation?.text ?? "", /Specialist de apoio:/i);
  assert.equal((resolved?.presentation?.consultiveRead?.specialists?.length ?? 0), 0);
});

test("IMOB_CRM blocked_run_resolution: presentation has no chat-renderable detail sections (blocks, fallback fields, widget)", async () => {
  const resolved = await resolveImobCrmOperationalConsult({
    prisma: createMockPrisma({
      caseOverrides: {
        flow: "property.create",
        stage: "collecting",
        status: "blocked",
        nextStep: "consultar caso",
        blockers: ["dados do imóvel ainda estão incompletos para seguir"],
        pendingItems: ["tipo", "endereço"],
      },
    }) as any,
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    caseId: "case-1",
    message: "mostrar bloqueios do caso",
    threadState: createThreadState(),
  });

  assert.equal(resolved?.action, "crm.case.blocked_run_resolution");

  const presentation = resolved?.presentation as any;

  // API blocks must be empty (no forbidden kinds in chat body)
  const blocks: any[] = presentation?.blocks ?? [];
  const forbiddenKinds = ["case_summary", "follow_up", "checklist", "handoff_package", "business_pending_items", "unlock_steps"];
  assert.ok(
    !blocks.some((b: any) => forbiddenKinds.includes(b.kind)),
    `blocks must not contain forbidden kinds for blocked_run_resolution, found: ${blocks.map((b: any) => b.kind).join(", ")}`,
  );

  // Fallback-triggering fields must be absent so buildStructuredPresentationBlocks does not produce forbidden sections
  assert.ok(!presentation?.caseBrief, "caseBrief must be absent for blocked_run_resolution (would render 'Resumo do caso')");
  assert.ok(!presentation?.preparedFollowUp, "preparedFollowUp must be absent for blocked_run_resolution (would render 'Follow-up preparado')");
  assert.ok(!presentation?.actionableChecklist, "actionableChecklist must be absent for blocked_run_resolution (would render 'Checklist acionável do caso')");
  assert.ok(!presentation?.handoffPack, "handoffPack must be absent for blocked_run_resolution (would render 'Pacote de handoff')");

  // Widget must be suppressed to avoid 'Pendências do negócio' rendering
  assert.ok(!presentation?.widget, "widget must be null/absent for blocked_run_resolution (would render 'Pendências do negócio')");

  // Compact text must still be present
  assert.match(presentation?.text ?? "", /bloqueio ativo|pendência crítica|próximo passo/i);
});

test("IMOB_CRM business read emits canonical proof surface when the case already has proof signals", async () => {
  const resolved = await resolveImobCrmOperationalConsult({
    prisma: createMockPrisma({
      caseOverrides: {
        flow: "commission.settle",
        stage: "settled",
        status: "success",
        nextStep: "consultar recibo da comissão",
        runId: "run-proof-1",
        txId: "tx-proof-1",
        receiptPath: "/api/ledger/tx-proof-1",
        bundlePath: "/api/runs/run-proof-1/bundle",
      },
    }) as any,
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    message: "qual status desse caso?",
    threadState: createThreadState(),
  });

  assert.equal(resolved?.action, "crm.case.pipeline_status");
  assert.equal((resolved as any)?.presentation?.proof?.required, true);
  assert.equal((resolved as any)?.presentation?.proof?.ready, true);
  assert.equal((resolved as any)?.presentation?.proof?.state, "ready");
  assert.equal((resolved as any)?.presentation?.proof?.txId, "tx-proof-1");
  assert.equal((resolved as any)?.presentation?.card?.proof?.bundlePath, "/api/runs/run-proof-1/bundle");
  assert.match((resolved?.presentation?.text ?? ""), /Prova auditável pronta/i);
  assert.match(JSON.stringify(resolved?.presentation?.card?.lines ?? []), /receipt e bundle disponíveis|receipt disponível/i);
});

test("IMOB_CRM business read does not look green when mission proof is still pending", async () => {
  const resolved = await resolveImobCrmOperationalConsult({
    prisma: createMockPrisma({
      caseOverrides: {
        flow: "contract.prepare",
        stage: "drafting",
        status: "pending",
        nextStep: "encaminhar contrato para assinatura",
        proof: {
          required: true,
          ready: false,
          state: "pending",
          receiptPath: "/api/ledger/tx-proof-pending",
        },
      },
    }) as any,
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    message: "qual status desse caso?",
    threadState: createThreadState(),
  });

  assert.equal(resolved?.action, "crm.case.pipeline_status");
  assert.equal((resolved as any)?.caseContext?.evidence?.status, "missing");
  assert.ok(((resolved as any)?.presentation?.pendingFieldLabels ?? []).some((item: string) => /proof mínima pendente/i.test(item)));
  assert.match((resolved?.presentation?.nextStep ?? ""), /completar a proof mínima/i);
  assert.match((resolved?.presentation?.text ?? ""), /proof mínima ainda pendente/i);
  assert.doesNotMatch((resolved?.presentation?.text ?? ""), /pronta: receipt e bundle disponíveis/i);
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

test("IMOB_CRM case consult reuses the active operational case when owner flow is in progress", async () => {
  const resolved = await resolveImobCrmOperationalConsult({
    prisma: createMockPrisma() as any,
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    message: "consultar caso",
    threadState: {
      ...createThreadState(),
      operational: {
        flow: "owner.create",
        status: "ready_for_review",
        pendingFields: [],
      },
    },
  });

  assert.equal(resolved?.action, "crm.case.lookup");
  assert.doesNotMatch(resolved?.presentation?.text ?? "", /qual caso você quer consultar/i);
  assert.match(resolved?.presentation?.text ?? "", /caso|usei o caso imob mais recente/i);
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
  assert.doesNotMatch(resolved?.presentation?.text ?? "", /Pendências atuais|Próximo passo|Bloqueio atual/i);
  assert.match(resolved?.presentation?.card?.title ?? "", /Caso Lead/i);
});

test("IMOB_CRM case consult accepts use-the-most-recent-case fallback without concluding an empty stage", async () => {
  const resolved = await resolveImobCrmOperationalConsult({
    prisma: createMockPrisma() as any,
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    message: "Use o caso mais recente",
    threadState: createThreadState(),
  });

  assert.equal(resolved?.action, "crm.case.lookup");
  assert.match(resolved?.presentation?.text ?? "", /Usei o caso IMOB mais recente/i);
  assert.doesNotMatch(resolved?.presentation?.text ?? "", /Concluí essa etapa com sucesso/i);
});

test("IMOB_CRM opening a visit case without asking for action does not start the pilot", async () => {
  const resolved = await resolveImobCrmOperationalConsult({
    prisma: createMockPrisma({
      caseOverrides: {
        id: "case-visit-1",
        flow: "visit.schedule",
        nextStep: "confirmar agenda da visita",
      },
    }) as any,
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    message: "consultar caso case-visit-1",
    threadState: createThreadState(),
  });

  assert.equal(resolved?.action, "crm.case.lookup");
  assert.equal(resolved?.presentation?.pilotOperationalState, undefined);
  assert.doesNotMatch(resolved?.presentation?.text ?? "", /pilot_active/i);
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

test("IMOB_CRM owner dedupe selection updates the selected owner without asking identifier again", async () => {
  const prisma = createMockPrisma();
  const resolved = await resolveImobCrmOperationalUpdate({
    prisma: prisma as any,
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    message: "atualizar proprietário 41741741785 nome do proprietário Carlos Merllon",
    threadState: {
      ...createThreadState(),
      operational: {
        flow: "owner.create",
        status: "collecting",
        pendingFields: ["ownerDocument"],
        dedupeSelection: {
          entity: "owner",
          resolution: "update_existing",
          selectedId: "owner-1",
          selectedRef: "41741741785",
          selectedName: "João",
        },
      },
    },
  });

  assert.equal(resolved?.action, "crm.owner.update");
  assert.match(resolved?.presentation?.text ?? "", /Cadastro existente do proprietário Carlos Merllon atualizado com sucesso/i);
  assert.equal(resolved?.presentation?.form, undefined);
  assert.notEqual(resolved?.presentation?.dedupeKey, "crm.registration.dedupe_review");
  const updated = await (prisma as any).imobOwner.findFirst({
    where: { tenantId: "tenant-1", workspaceId: "workspace-1", id: "owner-1" },
  });
  assert.equal(updated?.name, "Carlos Merllon");
});

test("IMOB_CRM owner form update persists phone and email and clears resolved pending items", async () => {
  const prisma = createMockPrisma();
  (prisma as any).__data.owners[0].phone = null;
  (prisma as any).__data.owners[0].email = null;
  (prisma as any).__data.owners[0].document = "45455566655";
  (prisma as any).__data.owners[0].pendingItems = ["telefone do proprietário", "e-mail do proprietário"];

  const resolved = await resolveImobCrmOperationalUpdate({
    prisma: prisma as any,
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    caseId: "case-1",
    message: "nome do proprietário João telefone do proprietário 47 996635092 e-mail do proprietário nilsen@gmail.com documento do proprietário 45455566655",
    threadState: {
      ...createThreadState(),
      operational: {
        flow: "owner.create",
        status: "collecting",
        pendingFields: ["ownerPhone", "ownerEmail"],
      },
    },
  });

  assert.equal(resolved?.action, "crm.owner.update");
  assert.match(resolved?.presentation?.text ?? "", /Cadastro existente do proprietário João atualizado com sucesso/i);
  assert.match(resolved?.presentation?.text ?? "", /este imóvel|etapa documental do caso/i);
  assert.doesNotMatch(resolved?.presentation?.text ?? "", /telefone do proprietário/i);
  assert.doesNotMatch(resolved?.presentation?.text ?? "", /e-mail do proprietário/i);
  assert.deepEqual(resolved?.presentation?.pendingFieldLabels ?? [], []);

  const updated = await (prisma as any).imobOwner.findFirst({
    where: { tenantId: "tenant-1", workspaceId: "workspace-1", id: "owner-1" },
  });
  assert.equal(updated?.phone, "47 996635092");
  assert.equal(updated?.email, "nilsen@gmail.com");
  assert.deepEqual(updated?.pendingItems ?? [], []);
});

test("IMOB_CRM property link owner completes the active case link and advances the next step", async () => {
  const prisma = createMockPrisma({
    caseOverrides: {
      flow: "owner.create",
      nextStep: "concluir vínculo proprietário-imóvel",
    },
    propertyOverrides: {
      ownerId: null,
      owner: null,
    },
  });

  const resolved = await resolveImobCrmOperationalUpdate({
    prisma: prisma as any,
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    caseId: "case-1",
    message: "concluir vínculo proprietário-imóvel",
    threadState: createThreadState(),
  });

  assert.equal(resolved?.action, "crm.property.link_owner");
  assert.match(resolved?.presentation?.text ?? "", /Vínculo entre proprietário e imóvel concluído com sucesso/i);
  assert.match(resolved?.presentation?.text ?? "", /Próximo passo: /i);
  const updatedProperty = await (prisma as any).imobProperty.findFirst({
    where: { tenantId: "tenant-1", workspaceId: "workspace-1", id: "property-1" },
  });
  assert.equal(updatedProperty?.ownerId, "owner-1");
});

test("IMOB_CRM property link owner fails closed without active case scope", async () => {
  const resolved = await resolveImobCrmOperationalUpdate({
    prisma: createMockPrisma({
      propertyOverrides: {
        ownerId: null,
        owner: null,
      },
    }) as any,
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    message: "concluir vínculo proprietário-imóvel",
    threadState: createThreadState(),
  });

  assert.equal(resolved?.action, "crm.property.link_owner");
  assert.match(resolved?.presentation?.text ?? "", /não está preso a um caso ativo/i);
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
