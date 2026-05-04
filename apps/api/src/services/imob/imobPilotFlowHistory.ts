import { createHash } from "node:crypto";

import type { ImobEvidenceRef } from "./imobConversationContract";

export type ImobPilotFlowHistoryStatus =
  | "blocked"
  | "queued"
  | "completed"
  | "shadow_recorded"
  | "duplicate";

export type ImobPilotFlowHistoryType =
  | "assisted_reengagement_flow"
  | "assisted_calendar_flow"
  | "assisted_listing_flow"
  | "shadow_capture_enrichment_flow";

export type ImobPilotFlowHistoryEntry = {
  flowRunId: string;
  flowId: string;
  flowType: ImobPilotFlowHistoryType;
  missionId: string;
  capabilityId: string;
  caseId: string | null;
  leadId: string | null;
  status: ImobPilotFlowHistoryStatus;
  gateReasonCodes: string[];
  jobId: string | null;
  trackingId: string | null;
  visibleAgentId: "IMOB";
  evidenceRefs: ImobEvidenceRef[];
  generatedAt: string;
};

export type ImobPilotFlowHistoryState = {
  entries: ImobPilotFlowHistoryEntry[];
};

export function createImobPilotFlowHistoryState() {
  return {
    entries: [],
  } satisfies ImobPilotFlowHistoryState;
}

export function buildImobPilotFlowRunId(params: {
  flowId: string;
  status: ImobPilotFlowHistoryStatus;
  generatedAt: string;
}) {
  const hash = createHash("sha256");
  hash.update(params.flowId);
  hash.update(params.status);
  hash.update(params.generatedAt);
  return `flowrun-${hash.digest("hex").slice(0, 16)}`;
}

export function recordImobPilotFlowRun(params: {
  state: ImobPilotFlowHistoryState;
  entry: Omit<ImobPilotFlowHistoryEntry, "flowRunId">;
}) {
  const flowRunId = buildImobPilotFlowRunId({
    flowId: params.entry.flowId,
    status: params.entry.status,
    generatedAt: params.entry.generatedAt,
  });
  const existing = params.state.entries.find((item) => item.flowRunId === flowRunId);
  if (existing) return existing;

  const recorded = {
    flowRunId,
    ...params.entry,
  } satisfies ImobPilotFlowHistoryEntry;
  params.state.entries.push(recorded);
  return recorded;
}
