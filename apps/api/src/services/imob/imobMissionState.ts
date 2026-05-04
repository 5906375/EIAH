import type { ImobEvidenceRef } from "./imobConversationContract";

export type ImobMissionStateStatus = "ready" | "watch" | "blocked" | "insufficient_context";

export type ImobMissionState = {
  missionId: string;
  capabilityId: string;
  ownerAgent: "IMOB";
  supportingAgents: string[];
  status: ImobMissionStateStatus;
  createdAt: string;
  closedAt: string | null;
  evidenceRefs: ImobEvidenceRef[];
};

function normalizeMissionToken(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "unknown";
}

export function buildImobMissionId(params: {
  caseId?: string | null;
  capabilityId: string;
  ownerAgent?: "IMOB";
}) {
  const caseToken = normalizeMissionToken(params.caseId);
  const capabilityToken = normalizeMissionToken(params.capabilityId);
  const ownerToken = normalizeMissionToken(params.ownerAgent ?? "IMOB");
  return `mission-${ownerToken}-${caseToken}-${capabilityToken}`;
}

export function openImobMissionState(params: {
  caseId?: string | null;
  capabilityId: string;
  ownerAgent?: "IMOB";
  supportingAgents?: string[] | null;
  createdAt?: string | null;
}) {
  const createdAt = params.createdAt ?? new Date().toISOString();
  return {
    missionId: buildImobMissionId({
      caseId: params.caseId,
      capabilityId: params.capabilityId,
      ownerAgent: params.ownerAgent ?? "IMOB",
    }),
    capabilityId: params.capabilityId,
    ownerAgent: params.ownerAgent ?? "IMOB",
    supportingAgents: Array.from(new Set(params.supportingAgents ?? [])).slice(0, 5),
    status: "watch" as const,
    createdAt,
    closedAt: null,
    evidenceRefs: [],
  } satisfies ImobMissionState;
}

export function completeImobMissionState(params: {
  mission: ImobMissionState;
  status: ImobMissionStateStatus;
  evidenceRefs?: ImobEvidenceRef[] | null;
  closedAt?: string | null;
}) {
  return {
    ...params.mission,
    status: params.status,
    evidenceRefs: Array.from(new Set(params.evidenceRefs ?? [])),
    closedAt: params.closedAt ?? new Date().toISOString(),
  } satisfies ImobMissionState;
}
