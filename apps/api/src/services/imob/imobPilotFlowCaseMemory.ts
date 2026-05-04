import type {
  ImobPilotFlowResult,
  ImobPilotFlowStatus,
  ImobPilotFlowType,
} from "./imobPilotFlowRuntime";

export type ImobPilotFlowCaseMemoryEntry = {
  caseId: string;
  lastSuggestedFlowType: ImobPilotFlowType;
  lastExecutedFlowType: ImobPilotFlowType | null;
  lastBlockedFlowType: ImobPilotFlowType | null;
  lastGateReasonCodes: string[];
  lastFlowStatus: ImobPilotFlowStatus;
  lastFlowGeneratedAt: string;
  nextHumanAction: string;
};

export type ImobPilotFlowCaseMemoryState = {
  byCaseId: Record<string, ImobPilotFlowCaseMemoryEntry>;
};

export function createImobPilotFlowCaseMemoryState() {
  return {
    byCaseId: {},
  } satisfies ImobPilotFlowCaseMemoryState;
}

export function updateImobPilotFlowCaseMemory(params: {
  state: ImobPilotFlowCaseMemoryState;
  result: ImobPilotFlowResult;
}) {
  const caseId = params.result.caseId?.trim();
  if (!caseId) return null;

  const current = params.state.byCaseId[caseId] ?? null;
  const executedFlowType =
    params.result.status === "completed" || params.result.status === "shadow_recorded"
      ? params.result.flowType
      : current?.lastExecutedFlowType ?? null;
  const blockedFlowType =
    params.result.status === "blocked"
      ? params.result.flowType
      : current?.lastBlockedFlowType ?? null;

  const updated = {
    caseId,
    lastSuggestedFlowType: params.result.flowType,
    lastExecutedFlowType: executedFlowType,
    lastBlockedFlowType: blockedFlowType,
    lastGateReasonCodes: [...params.result.gateDecision.reasonCodes],
    lastFlowStatus: params.result.status,
    lastFlowGeneratedAt: params.result.generatedAt,
    nextHumanAction: params.result.nextHumanAction,
  } satisfies ImobPilotFlowCaseMemoryEntry;

  params.state.byCaseId[caseId] = updated;
  return updated;
}

export function getImobPilotFlowCaseMemory(params: {
  state: ImobPilotFlowCaseMemoryState;
  caseId: string;
}) {
  return params.state.byCaseId[params.caseId] ?? null;
}
