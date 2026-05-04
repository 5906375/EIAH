import type {
  ImobDecisionRationale,
  ImobEvidenceRef,
  ImobMissionOrchestrationSnapshot,
} from "./imobConversationContract";
import type { ImobCrmCaseContext } from "./crm/imobCrmAgentContract";
import {
  completeImobMissionState,
  openImobMissionState,
  type ImobMissionState,
  type ImobMissionStateStatus,
} from "./imobMissionState";

function buildMissionEvidenceRefs(params: {
  caseContext: ImobCrmCaseContext;
  decisionRationale?: Pick<ImobDecisionRationale, "sourceRefs"> | null;
  supportingAgents: string[];
  ownerCapability: string;
}) {
  const evidence: ImobEvidenceRef[] = [
    ...(params.decisionRationale?.sourceRefs ?? []),
    {
      kind: "case_field",
      ref: "mission.ownerCapability",
      label: "Capability dona da missão",
      value: params.ownerCapability,
    },
  ];

  if (params.caseContext?.caseId) {
    evidence.push({
      kind: "case_field",
      ref: "case.id",
      label: "Caso vinculado",
      value: params.caseContext.caseId,
    });
  }
  if (params.caseContext?.flow) {
    evidence.push({
      kind: "case_field",
      ref: "case.flow",
      label: "Fluxo do caso",
      value: params.caseContext.flow,
    });
  }

  for (const agentId of params.supportingAgents.slice(0, 3)) {
    evidence.push({
      kind: "specialist_hint",
      ref: `supporting_agent.${agentId}`,
      label: "Specialist de apoio sugerido",
      value: agentId,
    });
  }

  return evidence.filter((item) => item.value !== null && item.value !== "");
}

export function resolveImobMissionRuntime(params: {
  caseContext: ImobCrmCaseContext;
  ownerCapability: string;
  missionStatus: ImobMissionStateStatus;
  supportingAgents: string[];
  missionReasonCodes: string[];
  summary: string;
  pendingHandoffs: string[];
  blockingIssues: string[];
  recommendedNextMove: string;
  decisionRationale?: Pick<ImobDecisionRationale, "sourceRefs"> | null;
  generatedAt?: string | null;
}) {
  const createdAt = params.generatedAt ?? new Date().toISOString();
  const openedMission = openImobMissionState({
    caseId: params.caseContext?.caseId ?? null,
    capabilityId: params.ownerCapability,
    ownerAgent: "IMOB",
    supportingAgents: params.supportingAgents,
    createdAt,
  });
  const evidenceRefs = buildMissionEvidenceRefs({
    caseContext: params.caseContext,
    decisionRationale: params.decisionRationale ?? null,
    supportingAgents: params.supportingAgents,
    ownerCapability: params.ownerCapability,
  });
  const closedMission = completeImobMissionState({
    mission: openedMission,
    status: params.missionStatus,
    evidenceRefs,
    closedAt: createdAt,
  });

  const snapshot = {
    missionVersion: "imob.mission_orchestration.v1" as const,
    missionId: closedMission.missionId,
    missionStatus: params.missionStatus,
    ownerAgentId: "IMOB" as const,
    ownerCapability: params.ownerCapability,
    supportingAgents: closedMission.supportingAgents,
    missionReasonCodes: params.missionReasonCodes,
    summary: params.summary,
    pendingHandoffs: params.pendingHandoffs,
    blockingIssues: params.blockingIssues,
    recommendedNextMove: params.recommendedNextMove,
    evidenceRefs: closedMission.evidenceRefs,
    shadowMode: true as const,
    createdAt: closedMission.createdAt,
    closedAt: closedMission.closedAt,
    generatedAt: createdAt,
  } satisfies ImobMissionOrchestrationSnapshot;

  return {
    mission: closedMission satisfies ImobMissionState,
    snapshot,
  };
}
