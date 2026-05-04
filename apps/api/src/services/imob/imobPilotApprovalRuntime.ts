import { createHash } from "node:crypto";

import type { ImobEvidenceRef } from "./imobConversationContract";
import { getImobPilotFlow } from "./imobPilotFlowRegistry";
import type { ImobPilotFlowType } from "./imobPilotFlowRuntime";

export type ImobPilotApprovalDecision = "approved" | "rejected";

export type ImobPilotApprovalEntry = {
  approvalId: string;
  flowType: ImobPilotFlowType;
  decision: ImobPilotApprovalDecision;
  approvedBy: string;
  approvedAt: string;
  approvalReason: string;
  evidenceRefs: ImobEvidenceRef[];
  visibleAgentId: "IMOB";
  promotionApplied: false;
};

export type ImobPilotApprovalState = {
  entries: ImobPilotApprovalEntry[];
};

export function createImobPilotApprovalState() {
  return {
    entries: [],
  } satisfies ImobPilotApprovalState;
}

function buildImobPilotApprovalId(params: {
  flowType: ImobPilotFlowType;
  decision: ImobPilotApprovalDecision;
  approvedBy: string;
  approvedAt: string;
}) {
  const hash = createHash("sha256");
  hash.update(params.flowType);
  hash.update(params.decision);
  hash.update(params.approvedBy);
  hash.update(params.approvedAt);
  return `approval-${hash.digest("hex").slice(0, 16)}`;
}

export function recordImobPilotApprovalDecision(params: {
  state: ImobPilotApprovalState;
  flowType: ImobPilotFlowType;
  decision: ImobPilotApprovalDecision;
  approvedBy: string;
  approvedAt?: string | null;
  approvalReason: string;
  evidenceRefs?: ImobEvidenceRef[] | null;
}) {
  const flow = getImobPilotFlow(params.flowType);
  if (!flow) {
    throw new Error(`Unknown IMOB pilot flow: ${params.flowType}`);
  }

  const approvedAt = params.approvedAt ?? new Date().toISOString();
  const approvalId = buildImobPilotApprovalId({
    flowType: params.flowType,
    decision: params.decision,
    approvedBy: params.approvedBy,
    approvedAt,
  });
  const existing = params.state.entries.find((item) => item.approvalId === approvalId);
  if (existing) return existing;

  const recorded = {
    approvalId,
    flowType: params.flowType,
    decision: params.decision,
    approvedBy: params.approvedBy,
    approvedAt,
    approvalReason: params.approvalReason,
    evidenceRefs: [...(params.evidenceRefs ?? [])],
    visibleAgentId: flow.visibleAgentId,
    promotionApplied: false as const,
  } satisfies ImobPilotApprovalEntry;

  params.state.entries.push(recorded);
  return recorded;
}

export function getLatestImobPilotApprovalDecision(params: {
  state: ImobPilotApprovalState;
  flowType: ImobPilotFlowType;
}) {
  return params.state.entries
    .filter((item) => item.flowType === params.flowType)
    .sort((left, right) => new Date(right.approvedAt).getTime() - new Date(left.approvedAt).getTime())[0] ?? null;
}
