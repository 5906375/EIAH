import type { ImobCapabilityRolloutStage } from "./imobCapabilityRegistry";
import type { ImobEvidenceRef } from "./imobConversationContract";
import {
  createImobPilotApprovalState,
  getLatestImobPilotApprovalDecision,
  recordImobPilotApprovalDecision,
  type ImobPilotApprovalState,
} from "./imobPilotApprovalRuntime";
import {
  createImobPilotFlowState,
  runImobAssistedCalendarFlow,
  type ImobPilotFlowResult,
  type ImobPilotFlowState,
} from "./imobPilotFlowRuntime";
import {
  createImobPilotRolloutState,
  resolveImobPilotRolloutStage,
  upsertImobPilotRolloutState,
  type ImobPilotRolloutState,
} from "./imobPilotRolloutState";

export type ImobFirstPilotState = {
  approvals: ImobPilotApprovalState;
  rollout: ImobPilotRolloutState;
  flows: ImobPilotFlowState;
};

export type ImobFirstPilotCalendarResult = {
  flowType: "assisted_calendar_flow";
  visibleAgentId: "IMOB";
  status: "blocked" | "pilot_active" | "shadow";
  currentStage: ImobCapabilityRolloutStage;
  approvalId?: string | null;
  flowRunId?: string | null;
  trackingId?: string | null;
  jobId?: string | null;
  evidenceRefs: ImobEvidenceRef[];
  nextHumanAction: string;
  generatedAt: string;
};

export function createImobFirstPilotState() {
  return {
    approvals: createImobPilotApprovalState(),
    rollout: createImobPilotRolloutState(),
    flows: createImobPilotFlowState(),
  } satisfies ImobFirstPilotState;
}

function buildBlockedPilotResult(params: {
  state: ImobFirstPilotState;
  generatedAt: string;
  nextHumanAction: string;
  evidenceRefs: ImobEvidenceRef[];
  approvalId?: string | null;
}) {
  return {
    flowType: "assisted_calendar_flow",
    visibleAgentId: "IMOB",
    status: "blocked",
    currentStage: resolveImobPilotRolloutStage({
      state: params.state.rollout,
      flowType: "assisted_calendar_flow",
    }),
    approvalId: params.approvalId ?? null,
    flowRunId: null,
    trackingId: null,
    jobId: null,
    evidenceRefs: [...params.evidenceRefs],
    nextHumanAction: params.nextHumanAction,
    generatedAt: params.generatedAt,
  } satisfies ImobFirstPilotCalendarResult;
}

function buildShadowPilotResult(params: {
  state: ImobFirstPilotState;
  generatedAt: string;
  nextHumanAction: string;
  approvalId: string;
  evidenceRefs: ImobEvidenceRef[];
}) {
  return {
    flowType: "assisted_calendar_flow",
    visibleAgentId: "IMOB",
    status: "shadow",
    currentStage: resolveImobPilotRolloutStage({
      state: params.state.rollout,
      flowType: "assisted_calendar_flow",
    }),
    approvalId: params.approvalId,
    flowRunId: null,
    trackingId: null,
    jobId: null,
    evidenceRefs: [...params.evidenceRefs],
    nextHumanAction: params.nextHumanAction,
    generatedAt: params.generatedAt,
  } satisfies ImobFirstPilotCalendarResult;
}

function buildPilotEvidence(params: {
  approvalEvidence: ImobEvidenceRef[];
  flowResult?: ImobPilotFlowResult | null;
  stage: ImobCapabilityRolloutStage;
  generatedAt: string;
}) {
  const evidence = [
    ...params.approvalEvidence,
    {
      kind: "workflow_signal",
      ref: "pilot.runtime.stage",
      label: "Estágio operacional do piloto",
      value: params.stage,
    } satisfies ImobEvidenceRef,
    {
      kind: "workflow_signal",
      ref: "pilot.runtime.generated_at",
      label: "Pilot runtime gerado em",
      value: params.generatedAt,
    } satisfies ImobEvidenceRef,
  ];

  if (params.flowResult) {
    evidence.push(...params.flowResult.evidenceRefs);
  }

  return evidence;
}

export function startImobFirstCalendarPilot(params: {
  state: ImobFirstPilotState;
  caseId?: string | null;
  leadId?: string | null;
  payload?: Record<string, unknown> | null;
  policyAccepted?: boolean;
  idempotencyKey?: string | null;
  generatedAt?: string | null;
}) {
  const generatedAt = params.generatedAt ?? new Date().toISOString();
  const latestApproval = getLatestImobPilotApprovalDecision({
    state: params.state.approvals,
    flowType: "assisted_calendar_flow",
  });

  if (!latestApproval) {
    return buildBlockedPilotResult({
      state: params.state,
      generatedAt,
      nextHumanAction: "registrar approval explícito antes de iniciar o piloto de agenda",
      evidenceRefs: [
        {
          kind: "workflow_signal",
          ref: "pilot.approval.missing",
          label: "Approval ausente",
          value: true,
        },
      ],
    });
  }

  if (latestApproval.decision !== "approved") {
    upsertImobPilotRolloutState({
      state: params.state.rollout,
      flowType: "assisted_calendar_flow",
      currentStage: "shadow",
      approvalEntry: latestApproval,
    });
    return buildBlockedPilotResult({
      state: params.state,
      generatedAt,
      approvalId: latestApproval.approvalId,
      nextHumanAction: "revisar rejeição anterior e coletar nova evidência antes de reabrir o piloto",
      evidenceRefs: buildPilotEvidence({
        approvalEvidence: latestApproval.evidenceRefs,
        stage: "shadow",
        generatedAt,
      }),
    });
  }

  upsertImobPilotRolloutState({
    state: params.state.rollout,
    flowType: "assisted_calendar_flow",
    currentStage: "pilot",
    approvalEntry: latestApproval,
  });

  const flowResult = runImobAssistedCalendarFlow({
    state: params.state.flows,
    caseId: params.caseId ?? null,
    leadId: params.leadId ?? null,
    generatedAt,
    humanApprovalGranted: true,
    evidenceRefsCount: latestApproval.evidenceRefs.length,
    policyAccepted: params.policyAccepted ?? true,
    payload: params.payload ?? null,
    idempotencyKey: params.idempotencyKey ?? null,
  });

  if (flowResult.status === "blocked") {
    return buildBlockedPilotResult({
      state: params.state,
      generatedAt,
      approvalId: latestApproval.approvalId,
      nextHumanAction: "corrigir gate operacional do flow de agenda antes de manter o piloto",
      evidenceRefs: buildPilotEvidence({
        approvalEvidence: latestApproval.evidenceRefs,
        flowResult,
        stage: resolveImobPilotRolloutStage({
          state: params.state.rollout,
          flowType: "assisted_calendar_flow",
        }),
        generatedAt,
      }),
    });
  }

  return {
    flowType: "assisted_calendar_flow",
    visibleAgentId: "IMOB",
    status: "pilot_active",
    currentStage: resolveImobPilotRolloutStage({
      state: params.state.rollout,
      flowType: "assisted_calendar_flow",
    }),
    approvalId: latestApproval.approvalId,
    flowRunId: flowResult.flowRunId,
    trackingId: flowResult.trackingId ?? null,
    jobId: flowResult.jobId ?? null,
    evidenceRefs: buildPilotEvidence({
      approvalEvidence: latestApproval.evidenceRefs,
      flowResult,
      stage: "pilot",
      generatedAt,
    }),
    nextHumanAction: "acompanhar tracking sandbox e validar estabilidade do piloto controlado",
    generatedAt,
  } satisfies ImobFirstPilotCalendarResult;
}

export function regressImobFirstCalendarPilotToShadow(params: {
  state: ImobFirstPilotState;
  approvedBy: string;
  approvalReason: string;
  evidenceRefs?: ImobEvidenceRef[] | null;
  generatedAt?: string | null;
}) {
  const generatedAt = params.generatedAt ?? new Date().toISOString();
  const rejection = recordImobPilotApprovalDecision({
    state: params.state.approvals,
    flowType: "assisted_calendar_flow",
    decision: "rejected",
    approvedBy: params.approvedBy,
    approvedAt: generatedAt,
    approvalReason: params.approvalReason,
    evidenceRefs: params.evidenceRefs ?? [],
  });

  upsertImobPilotRolloutState({
    state: params.state.rollout,
    flowType: "assisted_calendar_flow",
    currentStage: "shadow",
    approvalEntry: rejection,
  });

  return buildShadowPilotResult({
    state: params.state,
    generatedAt,
    approvalId: rejection.approvalId,
    nextHumanAction: "manter agenda em shadow e revisar governança antes de novo piloto",
    evidenceRefs: buildPilotEvidence({
      approvalEvidence: rejection.evidenceRefs,
      stage: "shadow",
      generatedAt,
    }),
  });
}
