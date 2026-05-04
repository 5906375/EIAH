import type { ImobCapabilityRolloutStage } from "./imobCapabilityRegistry";
import type { ImobCrmCaseContext } from "./crm/imobCrmAgentContract";
import type { ImobEvidenceRef } from "./imobConversationContract";
import {
  createImobFirstPilotState,
  regressImobFirstCalendarPilotToShadow,
  startImobFirstCalendarPilot,
} from "./imobFirstPilotRuntime";
import {
  createImobPilotApprovalState,
  getLatestImobPilotApprovalDecision,
  recordImobPilotApprovalDecision,
  type ImobPilotApprovalState,
} from "./imobPilotApprovalRuntime";
import { buildImobPilotOperationalSurface, type ImobPilotOperationalLatestFlow } from "./imobPilotOperationalSurface";
import {
  createImobPilotRolloutState,
  getImobPilotRolloutStateEntry,
  type ImobPilotRolloutState,
} from "./imobPilotRolloutState";
import type { ImobPilotFlowType } from "./imobPilotFlowRuntime";

export type ImobPilotControlAction =
  | "approve"
  | "start_pilot"
  | "hold_pilot"
  | "regress_to_shadow"
  | "read_status";

export type ImobPilotControlState = {
  approvals: ImobPilotApprovalState;
  rollout: ImobPilotRolloutState;
  latestCalendarPilotFlow: ImobPilotOperationalLatestFlow | null;
};

export type ImobPilotControlResultStatus =
  | "approval_recorded"
  | "approval_required"
  | "pilot_active"
  | "shadow"
  | "inactive"
  | "blocked";

export type ImobPilotControlResult = {
  action: ImobPilotControlAction;
  flowType: "assisted_calendar_flow";
  status: ImobPilotControlResultStatus;
  rolloutStage: ImobCapabilityRolloutStage;
  approvalRef: string | null;
  trackingId: string | null;
  jobId: string | null;
  evidenceRefs: ImobEvidenceRef[];
  nextHumanAction: string;
  visibleAgentId: "IMOB";
  generatedAt: string;
};

type BasePilotControlInput = {
  state: ImobPilotControlState;
  flowType: ImobPilotFlowType;
  caseContext: ImobCrmCaseContext;
  caseId?: string | null;
  leadId?: string | null;
  generatedAt?: string | null;
};

type ApproveInput = BasePilotControlInput & {
  action: "approve";
  approvedBy: string;
  approvalReason: string;
  evidenceRefs: ImobEvidenceRef[];
};

type StartPilotInput = BasePilotControlInput & {
  action: "start_pilot";
  payload?: Record<string, unknown> | null;
  idempotencyKey?: string | null;
  policyAccepted?: boolean;
};

type HoldPilotInput = BasePilotControlInput & {
  action: "hold_pilot";
  approvedBy: string;
  approvalReason: string;
  evidenceRefs?: ImobEvidenceRef[] | null;
};

type RegressInput = BasePilotControlInput & {
  action: "regress_to_shadow";
  approvedBy: string;
  approvalReason: string;
  evidenceRefs?: ImobEvidenceRef[] | null;
};

type ReadStatusInput = BasePilotControlInput & {
  action: "read_status";
};

export type ImobPilotControlInput =
  | ApproveInput
  | StartPilotInput
  | HoldPilotInput
  | RegressInput
  | ReadStatusInput;

export function createImobPilotControlState() {
  return {
    approvals: createImobPilotApprovalState(),
    rollout: createImobPilotRolloutState(),
    latestCalendarPilotFlow: null,
  } satisfies ImobPilotControlState;
}

function ensureCalendarFlow(flowType: ImobPilotFlowType) {
  if (flowType !== "assisted_calendar_flow") {
    throw new Error(`Patch V only supports assisted_calendar_flow, received ${flowType}`);
  }
}

function resolveCaseId(input: BasePilotControlInput) {
  return input.caseId ?? input.caseContext?.caseId ?? null;
}

function resolveLeadId(input: BasePilotControlInput) {
  return input.leadId ?? input.caseContext?.lead?.id ?? null;
}

function buildReadOnlyResult(params: {
  action: ImobPilotControlAction;
  state: ImobPilotControlState;
  caseContext: ImobCrmCaseContext;
  generatedAt: string;
}) {
  const surface = buildImobPilotOperationalSurface({
    caseContext: params.caseContext,
    approvalEntry: getLatestImobPilotApprovalDecision({
      state: params.state.approvals,
      flowType: "assisted_calendar_flow",
    }),
    rolloutEntry: getImobPilotRolloutStateEntry({
      state: params.state.rollout,
      flowType: "assisted_calendar_flow",
    }),
    latestPilotFlow: params.state.latestCalendarPilotFlow,
    generatedAt: params.generatedAt,
  });

  return {
    action: params.action,
    flowType: "assisted_calendar_flow",
    status: surface?.status ?? "inactive",
    rolloutStage: surface?.rolloutStage ?? "shadow",
    approvalRef: surface?.approvalRef ?? null,
    trackingId: surface?.trackingId ?? null,
    jobId: null,
    evidenceRefs: [...(surface?.evidenceRefs ?? [])],
    nextHumanAction: surface?.nextHumanAction ?? "nenhum piloto operacional ativo para este caso",
    visibleAgentId: "IMOB",
    generatedAt: surface?.generatedAt ?? params.generatedAt,
  } satisfies ImobPilotControlResult;
}

function syncFirstPilotState(controlState: ImobPilotControlState) {
  const runtimeState = createImobFirstPilotState();
  runtimeState.approvals.entries.push(...controlState.approvals.entries.map((item) => ({
    ...item,
    evidenceRefs: [...item.evidenceRefs],
  })));
  runtimeState.rollout.entries.push(...controlState.rollout.entries.map((item) => ({
    ...item,
    lastEvidenceRefs: [...item.lastEvidenceRefs],
  })));
  return runtimeState;
}

function updateLatestCalendarPilotFlow(params: {
  state: ImobPilotControlState;
  flowRunId?: string | null;
  trackingId?: string | null;
  evidenceRefs?: ImobEvidenceRef[] | null;
  nextHumanAction?: string | null;
}) {
  params.state.latestCalendarPilotFlow = {
    flowRunId: params.flowRunId ?? null,
    trackingId: params.trackingId ?? null,
    evidenceRefs: [...(params.evidenceRefs ?? [])],
    nextHumanAction: params.nextHumanAction ?? null,
  };
}

export function runImobPilotControl(input: ImobPilotControlInput) {
  ensureCalendarFlow(input.flowType);
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const caseId = resolveCaseId(input);
  const leadId = resolveLeadId(input);

  if (input.action === "approve") {
    const approval = recordImobPilotApprovalDecision({
      state: input.state.approvals,
      flowType: "assisted_calendar_flow",
      decision: "approved",
      approvedBy: input.approvedBy,
      approvedAt: generatedAt,
      approvalReason: input.approvalReason,
      evidenceRefs: input.evidenceRefs,
    });

    return {
      action: input.action,
      flowType: "assisted_calendar_flow",
      status: "approval_recorded",
      rolloutStage: getImobPilotRolloutStateEntry({
        state: input.state.rollout,
        flowType: "assisted_calendar_flow",
      })?.currentStage ?? "shadow",
      approvalRef: approval.approvalId,
      trackingId: null,
      jobId: null,
      evidenceRefs: [...approval.evidenceRefs],
      nextHumanAction: "iniciar o piloto controlado quando houver decisão operacional explícita",
      visibleAgentId: approval.visibleAgentId,
      generatedAt,
    } satisfies ImobPilotControlResult;
  }

  if (input.action === "start_pilot") {
    const latestApproval = getLatestImobPilotApprovalDecision({
      state: input.state.approvals,
      flowType: "assisted_calendar_flow",
    });
    if (!latestApproval || latestApproval.decision !== "approved") {
      return {
        action: input.action,
        flowType: "assisted_calendar_flow",
        status: "approval_required",
        rolloutStage: getImobPilotRolloutStateEntry({
          state: input.state.rollout,
          flowType: "assisted_calendar_flow",
        })?.currentStage ?? "shadow",
        approvalRef: latestApproval?.approvalId ?? null,
        trackingId: null,
        jobId: null,
        evidenceRefs: [...(latestApproval?.evidenceRefs ?? [])],
        nextHumanAction: "registrar approval operacional auditável antes de iniciar o piloto",
        visibleAgentId: "IMOB",
        generatedAt,
      } satisfies ImobPilotControlResult;
    }

    const runtimeState = syncFirstPilotState(input.state);
    const started = startImobFirstCalendarPilot({
      state: runtimeState,
      caseId,
      leadId,
      payload: input.payload ?? {
        caseId,
        leadId,
        nextStep: input.caseContext?.nextStep ?? null,
      },
      idempotencyKey: input.idempotencyKey ?? null,
      policyAccepted: input.policyAccepted ?? true,
      generatedAt,
    });

    input.state.rollout.entries = runtimeState.rollout.entries.map((item) => ({
      ...item,
      lastEvidenceRefs: [...item.lastEvidenceRefs],
    }));
    updateLatestCalendarPilotFlow({
      state: input.state,
      flowRunId: started.flowRunId,
      trackingId: started.trackingId,
      evidenceRefs: started.evidenceRefs,
      nextHumanAction: started.nextHumanAction,
    });

    return {
      action: input.action,
      flowType: "assisted_calendar_flow",
      status: started.status === "pilot_active" ? "pilot_active" : "blocked",
      rolloutStage: started.currentStage,
      approvalRef: started.approvalId ?? latestApproval.approvalId,
      trackingId: started.trackingId ?? null,
      jobId: started.jobId ?? null,
      evidenceRefs: [...started.evidenceRefs],
      nextHumanAction: started.nextHumanAction,
      visibleAgentId: started.visibleAgentId,
      generatedAt: started.generatedAt,
    } satisfies ImobPilotControlResult;
  }

  if (input.action === "hold_pilot") {
    const holdEvidence = [...(input.evidenceRefs ?? [])];
    const holdApproval = recordImobPilotApprovalDecision({
      state: input.state.approvals,
      flowType: "assisted_calendar_flow",
      decision: "rejected",
      approvedBy: input.approvedBy,
      approvedAt: generatedAt,
      approvalReason: input.approvalReason,
      evidenceRefs: holdEvidence,
    });

    input.state.rollout.entries = input.state.rollout.entries.filter((item) => item.flowType !== "assisted_calendar_flow");
    input.state.rollout.entries.push({
      flowType: "assisted_calendar_flow",
      currentStage: "shadow",
      lastApprovedAt: holdApproval.approvedAt,
      lastApprovedBy: holdApproval.approvedBy,
      lastPromotionDecision: holdApproval.decision,
      lastEvidenceRefs: [...holdApproval.evidenceRefs],
    });

    return {
      action: input.action,
      flowType: "assisted_calendar_flow",
      status: "shadow",
      rolloutStage: "shadow",
      approvalRef: holdApproval.approvalId,
      trackingId: input.state.latestCalendarPilotFlow?.trackingId ?? null,
      jobId: null,
      evidenceRefs: [...holdApproval.evidenceRefs],
      nextHumanAction: "manter o piloto em shadow até nova revisão operacional",
      visibleAgentId: holdApproval.visibleAgentId,
      generatedAt,
    } satisfies ImobPilotControlResult;
  }

  if (input.action === "regress_to_shadow") {
    const runtimeState = syncFirstPilotState(input.state);
    const regressed = regressImobFirstCalendarPilotToShadow({
      state: runtimeState,
      approvedBy: input.approvedBy,
      approvalReason: input.approvalReason,
      evidenceRefs: input.evidenceRefs ?? [],
      generatedAt,
    });

    input.state.approvals.entries = runtimeState.approvals.entries.map((item) => ({
      ...item,
      evidenceRefs: [...item.evidenceRefs],
    }));
    input.state.rollout.entries = runtimeState.rollout.entries.map((item) => ({
      ...item,
      lastEvidenceRefs: [...item.lastEvidenceRefs],
    }));
    updateLatestCalendarPilotFlow({
      state: input.state,
      flowRunId: regressed.flowRunId,
      trackingId: regressed.trackingId,
      evidenceRefs: regressed.evidenceRefs,
      nextHumanAction: regressed.nextHumanAction,
    });

    return {
      action: input.action,
      flowType: "assisted_calendar_flow",
      status: "shadow",
      rolloutStage: regressed.currentStage,
      approvalRef: regressed.approvalId ?? null,
      trackingId: regressed.trackingId ?? null,
      jobId: regressed.jobId ?? null,
      evidenceRefs: [...regressed.evidenceRefs],
      nextHumanAction: regressed.nextHumanAction,
      visibleAgentId: regressed.visibleAgentId,
      generatedAt: regressed.generatedAt,
    } satisfies ImobPilotControlResult;
  }

  return buildReadOnlyResult({
    action: input.action,
    state: input.state,
    caseContext: input.caseContext,
    generatedAt,
  });
}
