import test from "node:test";
import assert from "node:assert/strict";

import { buildImobCaseContextV1 } from "../services/imob/crm/imobCaseContextBuilder";
import { buildImobCrmCaseContextFromRecord } from "../services/imob/crm/imobCrmCaseContext";
import { buildImobCrmLegacyCanonicalCase } from "../services/imob/crm/imobCrmLegacyCanonical";
import { resolveImobCrmOperationalConsult } from "../services/imob/crm/imobCrmResolver";
import { resolveImobCrmTurnEngine } from "../services/imob/crm/imobCrmTurnEngine";
import { resolveImobNextAction } from "../services/imob/orchestrator/imobNextActionResolver";
import { resolveImobRecoveryResponse } from "../services/imob/orchestrator/imobRecoveryResolver";
import { resolveImobBackingSpecialists } from "../services/imob/imobSpecialistBridge";
import { resolveImobTurn } from "../services/imob/imobTurnResolver";

const tenantId = "tenant-continuity-regression";
const workspaceId = "workspace-continuity-regression";

function createThreadState() {
  return {
    mode: "consult",
    pendingSlot: "none",
    resultOffset: 0,
    slots: {},
    operational: null,
  };
}

function createEngineParams(overrides?: Partial<any>) {
  const baseState = {
    mode: "execute",
    pendingSlot: "none",
    resultOffset: 0,
    slots: {},
    operational: null,
  };

  const helpers: any = {
    asString: (value: unknown) => (typeof value === "string" && value.trim().length > 0 ? value.trim() : null),
    hydrateThreadStateWithPersistedLead: async ({ threadState }: any) => threadState,
    resolveImobOperationalUpdate: async () => null,
    resolveImobOperationalConsult: async () => null,
    applyCanonicalJourneyToResolvedData: (data: any) => data,
    applyExistingRegistrationResolution: async ({ resolved }: any) => resolved,
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

function buildOwnerBlockerCase() {
  return {
    id: "case-owner-gap-regression",
    tenantId,
    workspaceId,
    threadId: "thread-owner-gap-regression",
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
      id: "lead-owner-gap-regression",
      name: "Locatário teste",
      phone: "47999994444",
      email: "lead@example.com",
      goal: "locacao",
      targetCity: "Itajaí",
      budgetMaxCents: 350000,
    },
    owner: {
      id: "owner-gap-regression",
      name: "Criativa Barboza",
      phone: "47999995555",
      email: "criativa@example.com",
      document: null,
    },
    property: {
      id: "property-owner-gap-regression",
      propertyType: "apartamento",
      city: "Itajaí",
      neighborhood: "Centro",
      address: "Rua Tuiuiú, 45",
      goal: "locacao",
      askingPriceCents: null,
      owner: { id: "owner-gap-regression", name: "Criativa Barboza" },
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

function buildDocumentationBlockerCase() {
  return {
    id: "case-docs-gap-regression",
    tenantId,
    workspaceId,
    threadId: "thread-docs-gap-regression",
    flow: "documents.collect",
    stage: "documentacao",
    status: "running",
    ownerResponsible: "Jurídico",
    nextStep: "mostrar bloqueios do caso",
    blockers: ["matrícula inconsistente e pendência documental do imóvel"],
    pendingItems: ["matricula do imóvel"],
    updatedAt: new Date("2026-01-04T10:00:00Z"),
    lead: {
      id: "lead-docs-gap-regression",
      name: "Compradora teste",
      phone: "47999994444",
      email: "lead@example.com",
      goal: "venda",
      targetCity: "Itajaí",
      budgetMaxCents: 70000000,
    },
    owner: {
      id: "owner-docs-gap-regression",
      name: "Renata",
      phone: "47999995555",
      email: "renata@example.com",
      document: "12345678901",
    },
    property: {
      id: "property-docs-gap-regression",
      propertyType: "apartamento",
      city: "Itajaí",
      neighborhood: "Centro",
      address: "Rua X, 45",
      goal: "venda",
      askingPriceCents: 90000000,
      owner: { id: "owner-docs-gap-regression", name: "Renata" },
    },
    canonical: {
      journeyType: "documentation",
      recommendedActions: [
        {
          id: "review_documents",
          label: "Revisar documentos",
          actionType: "consultive",
          inputHint: "revisar documentos",
        },
      ],
      blockedActions: ["matrícula inconsistente e pendência documental do imóvel"],
      missingContext: [],
      reasonCodes: ["DOCUMENT_BLOCKER"],
    },
    _count: { events: 1 },
  };
}

function buildProposalRegressionContext() {
  return buildImobCaseContextV1({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    caseId: "case-proposal-approval-regression",
    caseContext: {
      caseId: "case-proposal-approval-regression",
      flow: "proposal.create",
      lead: {
        id: "lead-1",
        name: "Maria",
        goal: "locacao",
        targetCity: "Itapema",
        budgetMaxCents: 350000,
      },
      property: {
        id: "property-1",
        propertyType: "apartamento",
        goal: "locacao",
        city: "Itapema",
        address: "Rua 700, 10",
      },
    },
    operational: {
      flow: "proposal.create",
      proposalDraft: {
        propertyId: "property-1",
        buyerName: "Maria",
        buyerPhone: "47999998888",
        offerAmount: 420000,
        contractType: "sale",
        approvalRequired: true,
        approvalStatus: "pending",
      },
    },
  });
}

function createMockPrisma(item: any) {
  return {
    imobCase: {
      findFirst: async ({ where }: any) => (where.id === item.id ? item : null),
    },
  };
}

test("IMOB continuity regression keeps market scan confirmation surface specific and accepts controlled return to scan", async () => {
  const canonical = buildImobCrmLegacyCanonicalCase({
    id: "case-market-scan-regression",
    flow: "property.market_scan.selection",
    nextStep: "confirmar seleção do scan",
    canonical: {
      recommendedActions: [],
      blockedActions: [],
      missingContext: [],
      reasonCodes: [],
    },
  } as any);

  assert.deepEqual(
    canonical.recommendedActions.map((action) => action.id),
    ["confirm_market_scan_capture"],
  );
  assert.equal(canonical.recommendedActions[0]?.inputHint, "confirmar captação do scan");

  const params = createEngineParams({
    body: {
      message: "fazer varredura de mercado",
      threadState: {
        mode: "execute",
        pendingSlot: "none",
        resultOffset: 0,
        slots: {},
        operational: {
          flow: "property.market_scan",
          status: "ready_for_review",
          pendingFields: [],
          marketScanSelection: {
            scanId: "scan-1",
            source: "internal_crm",
            sourceId: "property-1",
            providerId: null,
            retrievedAt: "2026-05-26T20:45:07.997Z",
          },
          marketScanSnapshot: {
            scanId: "scan-1",
            generatedAt: "2026-05-26T20:45:07.997Z",
            readOnly: true,
            provider: "internal_crm",
            groups: [],
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
          propertyDraft: {
            propertyId: null,
            propertyType: null,
            goal: null,
            cep: null,
            city: null,
            neighborhood: null,
            bedrooms: null,
            bathrooms: null,
            address: null,
          },
        },
      },
    },
  });

  const resolved = await resolveImobCrmTurnEngine(params);
  assert.notEqual(resolved.action, "crm.case.transition_not_allowed");
  assert.doesNotMatch((resolved as any).presentation?.text ?? "", /acao nao e valida/i);
});

test("IMOB continuity regression keeps owner document blocker dominant after owner update and document review", async () => {
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
  assert.match(resolved?.presentation?.text ?? "", /cadastrar proprietário/i);
  assert.equal(
    (resolved?.presentation?.consultiveRead?.specialists ?? []).some((entry: any) => entry.agentId === "J_360"),
    false,
  );

  const specialists = resolveImobBackingSpecialists(
    buildImobCrmCaseContextFromRecord(item as any, (record: any) => record.canonical) as any,
  );
  assert.equal(specialists.some((specialist) => specialist.primaryAgentId === "J_360"), false);
});

test("IMOB continuity regression keeps legal handoff explicit once the document package is ready", () => {
  const context = buildImobCaseContextV1({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    caseId: "case-contract-legal-regression",
    caseContext: {
      caseId: "case-contract-legal-regression",
      flow: "contract.prepare",
    },
    operational: {
      flow: "contract.prepare",
      contractDraft: {
        propertyId: "property-1",
        counterpartyName: "Maria",
        contractType: "sale",
        documentPacketStatus: "ready",
        handoffTarget: "LEGAL",
        approvalRequired: true,
      },
    },
  });

  const response = resolveImobRecoveryResponse({
    context,
    intent: "next_step",
  });

  assert.equal(context.documentSufficiency?.legalHandoffStatus, "pending");
  assert.equal(context.canonicalCaseState?.nextAction.reasonCode, "LEGAL_HANDOFF_REQUIRED");
  assert.equal(response.primaryAction?.operation, "contract.prepare");
  assert.match(response.summary, /jurídico/i);
});

test("IMOB continuity regression keeps proposal approval blocker aligned between context, next action and recovery", () => {
  const context = buildProposalRegressionContext();

  const nextAction = resolveImobNextAction({
    mission: "schedule_and_follow_visit",
    context,
    operation: "visit",
    flow: "proposal.create",
    pendingFields: [],
  });

  const response = resolveImobRecoveryResponse({
    intent: "next_step",
    context,
  });

  assert.equal(context.proposalNegotiation?.status, "approval_pending");
  assert.equal(nextAction.reasonCode, "PROPOSAL_APPROVAL_REQUIRED");
  assert.equal(nextAction.label, "Solicitar aprovação da proposta");
  assert.equal(response.primaryAction?.operation, "proposal.create");
  assert.equal(response.primaryAction?.reasonCode, "PROPOSAL_APPROVAL_REQUIRED");
});

test("IMOB continuity regression keeps follow-up awaiting response explicit before reopening the funnel", () => {
  const turn = resolveImobTurn({
    message: "Lead sem resposta no whatsapp",
    access: {
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      entitlements: { REAL_ESTATE_CORE: true },
    },
  });

  const context = buildImobCaseContextV1({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    caseId: "case-follow-up-regression",
    stage: "schedule_visit",
    flow: "visit.schedule",
    operational: turn.conversationState.operational as any,
    canonicalCaseState: null,
  });

  const nextAction = resolveImobNextAction({
    mission: "schedule_and_follow_visit",
    context,
    operation: "visit",
    flow: "visit.schedule",
    pendingFields: [],
  });

  const response = resolveImobRecoveryResponse({
    context,
    intent: "next_step",
  });

  assert.equal(context.commercialFollowUp?.status, "awaiting_response");
  assert.equal(nextAction.reasonCode, "FOLLOW_UP_RESPONSE_PENDING");
  assert.match(response.summary, /aguarda resposta|acompanhar a resposta/i);
});
