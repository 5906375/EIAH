import type { ImobCapabilityRolloutStage } from "./imobCapabilityRegistry";
import { getLatestImobPilotApprovalDecision, type ImobPilotApprovalEntry } from "./imobPilotApprovalRuntime";
import { getImobPilotFlow } from "./imobPilotFlowRegistry";
import type { ImobPilotFlowType } from "./imobPilotFlowRuntime";

export type ImobPilotRolloutStateEntry = {
  flowType: ImobPilotFlowType;
  currentStage: ImobCapabilityRolloutStage;
  lastApprovedAt: string;
  lastApprovedBy: string;
  lastPromotionDecision: "approved" | "rejected";
  lastEvidenceRefs: ImobPilotApprovalEntry["evidenceRefs"];
};

export type ImobPilotRolloutState = {
  entries: ImobPilotRolloutStateEntry[];
};

export function createImobPilotRolloutState() {
  return {
    entries: [],
  } satisfies ImobPilotRolloutState;
}

export function upsertImobPilotRolloutState(params: {
  state: ImobPilotRolloutState;
  flowType: ImobPilotFlowType;
  currentStage: ImobCapabilityRolloutStage;
  approvalEntry: ImobPilotApprovalEntry;
}) {
  const flow = getImobPilotFlow(params.flowType);
  if (!flow) {
    throw new Error(`Unknown IMOB pilot flow: ${params.flowType}`);
  }
  if (params.approvalEntry.flowType !== params.flowType) {
    throw new Error(`Approval flow mismatch for IMOB rollout state: ${params.flowType}`);
  }
  if (params.approvalEntry.decision === "rejected" && params.currentStage !== "shadow") {
    throw new Error(`Rejected approval cannot set non-shadow rollout stage for ${params.flowType}`);
  }

  const entry = {
    flowType: params.flowType,
    currentStage: params.currentStage,
    lastApprovedAt: params.approvalEntry.approvedAt,
    lastApprovedBy: params.approvalEntry.approvedBy,
    lastPromotionDecision: params.approvalEntry.decision,
    lastEvidenceRefs: [...params.approvalEntry.evidenceRefs],
  } satisfies ImobPilotRolloutStateEntry;

  const existingIndex = params.state.entries.findIndex((item) => item.flowType === params.flowType);
  if (existingIndex >= 0) {
    params.state.entries[existingIndex] = entry;
    return entry;
  }

  params.state.entries.push(entry);
  return entry;
}

export function getImobPilotRolloutStateEntry(params: {
  state: ImobPilotRolloutState;
  flowType: ImobPilotFlowType;
}) {
  return params.state.entries.find((item) => item.flowType === params.flowType) ?? null;
}

export function resolveImobPilotRolloutStage(params: {
  state?: ImobPilotRolloutState | null;
  flowType: ImobPilotFlowType;
}) {
  const persisted = params.state
    ? getImobPilotRolloutStateEntry({
      state: params.state,
      flowType: params.flowType,
    })
    : null;

  if (persisted) return persisted.currentStage;
  return getImobPilotFlow(params.flowType)?.rolloutStage ?? "shadow";
}

export function syncImobPilotRolloutStateFromLatestApproval(params: {
  state: ImobPilotRolloutState;
  approvalState: { entries: ImobPilotApprovalEntry[] };
  flowType: ImobPilotFlowType;
  currentStageWhenApproved: ImobCapabilityRolloutStage;
}) {
  const latest = getLatestImobPilotApprovalDecision({
    state: params.approvalState,
    flowType: params.flowType,
  });
  if (!latest) return null;

  return upsertImobPilotRolloutState({
    state: params.state,
    flowType: params.flowType,
    currentStage: latest.decision === "approved" ? params.currentStageWhenApproved : "shadow",
    approvalEntry: latest,
  });
}
