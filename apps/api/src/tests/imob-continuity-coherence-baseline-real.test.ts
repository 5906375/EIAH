import test from "node:test";
import assert from "node:assert/strict";

import { buildImobCaseContextV1 } from "../services/imob/crm/imobCaseContextBuilder";
import { buildImobCrmLegacyCanonicalCase } from "../services/imob/crm/imobCrmLegacyCanonical";
import { resolveImobCrmOperationalConsult } from "../services/imob/crm/imobCrmResolver";
import { resolveImobCrmTurnEngine } from "../services/imob/crm/imobCrmTurnEngine";
import {
  buildImobContinuityCoherenceMetrics,
  type ImobContinuityScenarioEvaluation,
} from "../services/imob/orchestrator/imobCrmContinuityCoherenceMetrics";
import { resolveImobNextAction } from "../services/imob/orchestrator/imobNextActionResolver";
import { resolveImobRecoveryResponse } from "../services/imob/orchestrator/imobRecoveryResolver";
import { resolveImobTurn } from "../services/imob/imobTurnResolver";

const tenantId = "tenant-continuity-baseline";
const workspaceId = "workspace-continuity-baseline";

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

function createMockPrisma(item: any) {
  return {
    imobCase: {
      findFirst: async ({ where }: any) => (where.id === item.id ? item : null),
    },
  };
}

function buildOwnerBlockerCase() {
  return {
    id: "case-owner-gap-baseline",
    tenantId,
    workspaceId,
    threadId: "thread-owner-gap-baseline",
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
      id: "lead-owner-gap-baseline",
      name: "Locatário teste",
      phone: "47999994444",
      email: "lead@example.com",
      goal: "locacao",
      targetCity: "Itajaí",
      budgetMaxCents: 350000,
    },
    owner: {
      id: "owner-gap-baseline",
      name: "Criativa Barboza",
      phone: "47999995555",
      email: "criativa@example.com",
      document: null,
    },
    property: {
      id: "property-owner-gap-baseline",
      propertyType: "apartamento",
      city: "Itajaí",
      neighborhood: "Centro",
      address: "Rua Tuiuiú, 45",
      goal: "locacao",
      askingPriceCents: null,
      owner: { id: "owner-gap-baseline", name: "Criativa Barboza" },
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

async function buildMarketScanScenario(): Promise<ImobContinuityScenarioEvaluation> {
  const canonical = buildImobCrmLegacyCanonicalCase({
    id: "case-market-scan-baseline",
    flow: "property.market_scan.selection",
    nextStep: "confirmar seleção do scan",
    canonical: {
      recommendedActions: [],
      blockedActions: [],
      missingContext: [],
      reasonCodes: [],
    },
  } as any);

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
  return {
    scenarioId: "market-scan-confirmation",
    sourceReliability: "governed",
    proofStatus: "not_required",
    dominantBlocker: null,
    suggestedActionValid: resolved.action !== "crm.case.transition_not_allowed",
    staleSurfaceDetected: canonical.recommendedActions.some((action) => action.id === "register_property"),
    blockerAligned: true,
    consultiveConsistent: !/acao nao e valida/i.test((resolved as any).presentation?.text ?? ""),
    dominantNextStepClear: canonical.recommendedActions.length === 1,
    businessContinuationSucceeded: resolved.action !== "crm.case.transition_not_allowed",
    strongActionWhileSourceUncertain: false,
  };
}

async function buildOwnerScenario(): Promise<ImobContinuityScenarioEvaluation> {
  const item = buildOwnerBlockerCase();
  const resolved = await resolveImobCrmOperationalConsult({
    prisma: createMockPrisma(item) as any,
    tenantId,
    workspaceId,
    caseId: item.id,
    message: "mostrar bloqueios do caso",
    threadState: createThreadState(),
  });

  const specialists = resolved?.presentation?.consultiveRead?.specialists ?? [];
  return {
    scenarioId: "owner-document-blocker",
    sourceReliability: "governed",
    proofStatus: "not_required",
    dominantBlocker: "owner_document",
    suggestedActionValid: resolved?.action === "crm.case.blocked_run_resolution",
    staleSurfaceDetected: (resolved?.presentation?.pendingFieldLabels ?? []).some((label: string) => /nome|telefone|e-mail/i.test(label)),
    blockerAligned: resolved?.presentation?.consultiveRead?.waitingOn === "owner",
    consultiveConsistent: /cadastrar proprietário/i.test(resolved?.presentation?.text ?? ""),
    dominantNextStepClear: (resolved?.presentation?.pendingFieldLabels ?? []).length === 1,
    businessContinuationSucceeded: resolved?.action === "crm.case.blocked_run_resolution",
    strongActionWhileSourceUncertain: specialists.some((item: any) => item.agentId === "J_360"),
  };
}

function buildLegalScenario(): ImobContinuityScenarioEvaluation {
  const context = buildImobCaseContextV1({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    caseId: "case-contract-legal-baseline",
    caseContext: {
      caseId: "case-contract-legal-baseline",
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

  return {
    scenarioId: "legal-handoff",
    sourceReliability: "governed",
    proofStatus: "satisfied",
    dominantBlocker: "legal_handoff",
    suggestedActionValid: response.primaryAction?.operation === "contract.prepare",
    staleSurfaceDetected: false,
    blockerAligned: context.canonicalCaseState?.nextAction.reasonCode === "LEGAL_HANDOFF_REQUIRED",
    consultiveConsistent: /jurídico/i.test(response.summary),
    dominantNextStepClear: Boolean(response.primaryAction?.label),
    businessContinuationSucceeded: response.primaryAction?.operation === "contract.prepare",
    strongActionWhileSourceUncertain: false,
  };
}

function buildProposalScenario(): ImobContinuityScenarioEvaluation {
  const context = buildImobCaseContextV1({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    caseId: "case-proposal-approval-baseline",
    caseContext: {
      caseId: "case-proposal-approval-baseline",
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

  return {
    scenarioId: "proposal-approval",
    sourceReliability: "governed",
    proofStatus: "not_required",
    dominantBlocker: "proposal_approval",
    suggestedActionValid: response.primaryAction?.operation === "proposal.create",
    staleSurfaceDetected: false,
    blockerAligned: nextAction.reasonCode === "PROPOSAL_APPROVAL_REQUIRED"
      && response.primaryAction?.reasonCode === "PROPOSAL_APPROVAL_REQUIRED",
    consultiveConsistent: response.primaryAction?.label === "Solicitar aprovação da proposta",
    dominantNextStepClear: Boolean(response.primaryAction?.label),
    businessContinuationSucceeded: response.primaryAction?.operation === "proposal.create",
    strongActionWhileSourceUncertain: false,
  };
}

function buildFollowUpScenario(): ImobContinuityScenarioEvaluation {
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
    caseId: "case-follow-up-baseline",
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

  return {
    scenarioId: "follow-up-awaiting-response",
    sourceReliability: "governed",
    proofStatus: "not_required",
    dominantBlocker: "follow_up_response",
    suggestedActionValid: nextAction.reasonCode === "FOLLOW_UP_RESPONSE_PENDING",
    staleSurfaceDetected: false,
    blockerAligned: nextAction.reasonCode === "FOLLOW_UP_RESPONSE_PENDING",
    consultiveConsistent: /aguarda resposta|acompanhar a resposta/i.test(response.summary),
    dominantNextStepClear: Boolean(response.primaryAction?.label),
    businessContinuationSucceeded: response.primaryAction?.reasonCode === "FOLLOW_UP_RESPONSE_PENDING",
    strongActionWhileSourceUncertain: false,
  };
}

test("IMOB continuity coherence baseline uses real critical journeys and passes the 70+ acceptance gate", async () => {
  const scenarios = await Promise.all([
    buildMarketScanScenario(),
    buildOwnerScenario(),
    Promise.resolve(buildLegalScenario()),
    Promise.resolve(buildProposalScenario()),
    Promise.resolve(buildFollowUpScenario()),
  ]);

  const metrics = buildImobContinuityCoherenceMetrics(scenarios);

  assert.equal(metrics.totalScenarios, 5);
  assert.equal(metrics.gates.invalidSuggestedActionRate, true);
  assert.equal(metrics.gates.staleSurfaceRate, true);
  assert.equal(metrics.gates.blockerAlignmentRate, true);
  assert.equal(metrics.gates.consultiveConsistencyRate, true);
  assert.equal(metrics.gates.nextStepDominanceRate, true);
  assert.equal(metrics.gates.businessContinuationSuccessRate, true);
  assert.equal(metrics.score70Gate, true);
});
