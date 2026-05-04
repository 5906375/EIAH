import type {
  ImobClosingDocumentsSnapshot,
  ImobCommercialMemorySnapshot,
  ImobDecisionRationale,
  ImobEvidenceRef,
  ImobInventoryWatchSnapshot,
  ImobLeadProfileReportSnapshot,
  ImobLeadScoringSnapshot,
  ImobMissionOrchestrationSnapshot,
  ImobReengagementSuggestion,
  ImobViabilityMarketAnalysisSnapshot,
} from "../imobConversationContract";
import type { ImobCrmCaseContext } from "../crm/imobCrmAgentContract";
import {
  createImobSpecialistExecution,
  type ImobSpecialistExecution,
} from "./imobSpecialistRuntime";

function createCaseFieldEvidence(params: {
  caseContext: ImobCrmCaseContext;
  includeLeadGoal?: boolean;
  includeLeadCity?: boolean;
  includeBudget?: boolean;
  includeBlocker?: boolean;
  includeNextStep?: boolean;
}) {
  const evidence: ImobEvidenceRef[] = [
    {
      kind: "case_field",
      ref: "case.flow",
      label: "Fluxo do caso",
      value: params.caseContext?.flow ?? null,
    },
  ];

  if (params.includeLeadGoal) {
    evidence.push({
      kind: "case_field",
      ref: "lead.goal",
      label: "Objetivo do lead",
      value: params.caseContext?.lead?.goal ?? null,
    });
  }
  if (params.includeLeadCity) {
    evidence.push({
      kind: "case_field",
      ref: "lead.targetCity",
      label: "Cidade-alvo",
      value: params.caseContext?.lead?.targetCity ?? params.caseContext?.property?.city ?? null,
    });
  }
  if (params.includeBudget) {
    evidence.push({
      kind: "case_field",
      ref: "lead.budgetMaxCents",
      label: "Orçamento do lead",
      value: params.caseContext?.lead?.budgetMaxCents ?? params.caseContext?.property?.askingPriceCents ?? null,
    });
  }
  if (params.includeBlocker) {
    evidence.push({
      kind: "workflow_signal",
      ref: "case.blocker",
      label: "Bloqueio atual",
      value: params.caseContext?.blocker ?? null,
    });
  }
  if (params.includeNextStep) {
    evidence.push({
      kind: "recommended_action",
      ref: "case.nextStep",
      label: "Próximo passo",
      value: params.caseContext?.nextStep ?? null,
    });
  }

  return evidence.filter((item) => item.value !== null && item.value !== "");
}

type LeadScoringInput = { caseContext: ImobCrmCaseContext };
type CommercialMemoryInput = {
  caseContext: ImobCrmCaseContext;
  decisionRationale?: ImobDecisionRationale | null;
  leadScore?: ImobLeadScoringSnapshot | null;
};
type LeadProfileInput = {
  caseContext: ImobCrmCaseContext;
  leadDiscovery?: { coverage?: string | null; missingSignals?: string[] | null } | null;
  leadScore?: ImobLeadScoringSnapshot | null;
  commercialMemory?: ImobCommercialMemorySnapshot | null;
};
type ViabilityInput = {
  caseContext: ImobCrmCaseContext;
  leadProfileReport?: ImobLeadProfileReportSnapshot | null;
  commercialMemory?: ImobCommercialMemorySnapshot | null;
  leadScore?: ImobLeadScoringSnapshot | null;
};
type ClosingInput = {
  caseContext: ImobCrmCaseContext;
  leadProfileReport?: ImobLeadProfileReportSnapshot | null;
};
type ReengagementInput = {
  caseContext: ImobCrmCaseContext;
  commercialMemory?: ImobCommercialMemorySnapshot | null;
  leadScore?: ImobLeadScoringSnapshot | null;
  decisionRationale?: ImobDecisionRationale | null;
  preparedFollowUp?: {
    recipientRole?: string | null;
    variants?: Array<{ text?: string | null }> | null;
  } | null;
};
type InventoryWatchInput = {
  caseContext: ImobCrmCaseContext;
  commercialMemory?: ImobCommercialMemorySnapshot | null;
  leadScore?: ImobLeadScoringSnapshot | null;
  reengagementSuggestion?: ImobReengagementSuggestion | null;
};
type MissionInput = {
  caseContext: ImobCrmCaseContext;
  decisionRationale?: ImobDecisionRationale | null;
  closingDocuments?: ImobClosingDocumentsSnapshot | null;
  viabilityMarketAnalysis?: ImobViabilityMarketAnalysisSnapshot | null;
  inventoryWatch?: ImobInventoryWatchSnapshot | null;
};

export function executeLeadScoringSpecialist(params: {
  input: LeadScoringInput;
  buildSnapshot: (caseContext: ImobCrmCaseContext) => ImobLeadScoringSnapshot;
}) {
  const output = params.buildSnapshot(params.input.caseContext);
  return createImobSpecialistExecution({
    specialistId: "imob.lead_scoring_agent",
    capabilityId: "lead.scoring",
    version: output.scoreVersion,
    input: params.input,
    output,
    reasonCodes: output.reasonCodes,
    evidenceRefs: createCaseFieldEvidence({
      caseContext: params.input.caseContext,
      includeLeadGoal: true,
      includeLeadCity: true,
      includeBudget: true,
      includeBlocker: true,
    }),
    generatedAt: output.generatedAt,
  });
}

export function executeRelationshipMemorySpecialist(params: {
  input: CommercialMemoryInput;
  buildSnapshot: (input: CommercialMemoryInput) => ImobCommercialMemorySnapshot;
}) {
  const output = params.buildSnapshot(params.input);
  return createImobSpecialistExecution({
    specialistId: "imob.relationship_memory_agent",
    capabilityId: "relationship.commercial_memory",
    version: output.memoryVersion,
    input: params.input,
    output,
    reasonCodes: output.reasonCodes,
    evidenceRefs: params.input.decisionRationale?.sourceRefs ?? createCaseFieldEvidence({
      caseContext: params.input.caseContext,
      includeLeadGoal: true,
      includeLeadCity: true,
      includeBudget: true,
      includeNextStep: true,
    }),
    generatedAt: output.generatedAt,
  });
}

export function executeLeadProfileSpecialist(params: {
  input: LeadProfileInput;
  buildSnapshot: (input: LeadProfileInput) => ImobLeadProfileReportSnapshot;
}) {
  const output = params.buildSnapshot(params.input);
  return createImobSpecialistExecution({
    specialistId: "imob.profile_analyst",
    capabilityId: "lead.profile_report",
    version: output.profileVersion,
    input: params.input,
    output,
    reasonCodes: [
      `profile_status_${output.profileStatus}`,
      `commercial_readiness_${output.commercialReadiness}`,
      `financial_readiness_${output.financialReadiness}`,
    ],
    evidenceRefs: createCaseFieldEvidence({
      caseContext: params.input.caseContext,
      includeLeadGoal: true,
      includeLeadCity: true,
      includeBudget: true,
    }),
    generatedAt: output.generatedAt,
  });
}

export function executeViabilitySpecialist(params: {
  input: ViabilityInput;
  buildSnapshot: (input: ViabilityInput) => ImobViabilityMarketAnalysisSnapshot;
}) {
  const output = params.buildSnapshot(params.input);
  return createImobSpecialistExecution({
    specialistId: "imob.viability_analyst",
    capabilityId: "viability.market_analysis",
    version: output.analysisVersion,
    input: params.input,
    output,
    reasonCodes: [`market_status_${output.marketStatus}`],
    evidenceRefs: createCaseFieldEvidence({
      caseContext: params.input.caseContext,
      includeLeadGoal: true,
      includeLeadCity: true,
      includeBudget: true,
      includeBlocker: true,
    }),
    generatedAt: output.generatedAt,
  });
}

export function executeClosingSpecialist(params: {
  input: ClosingInput;
  buildSnapshot: (input: ClosingInput) => ImobClosingDocumentsSnapshot;
}) {
  const output = params.buildSnapshot(params.input);
  return createImobSpecialistExecution({
    specialistId: "imob.closing_agent",
    capabilityId: "closing.documents_real",
    version: output.documentStateVersion,
    input: params.input,
    output,
    reasonCodes: [`readiness_${output.readinessStatus}`],
    evidenceRefs: createCaseFieldEvidence({
      caseContext: params.input.caseContext,
      includeBlocker: true,
      includeNextStep: true,
    }),
    generatedAt: output.generatedAt,
  });
}

export function executeReengagementSpecialist(params: {
  input: ReengagementInput;
  buildSnapshot: (input: ReengagementInput) => ImobReengagementSuggestion | undefined;
}) {
  const output = params.buildSnapshot(params.input);
  if (!output) return undefined;
  return createImobSpecialistExecution({
    specialistId: "imob.reengagement_agent",
    capabilityId: "reengagement.continuous",
    version: "imob.reengagement.continuous.v1",
    input: params.input,
    output,
    reasonCodes: [output.reason],
    evidenceRefs: params.input.decisionRationale?.sourceRefs ?? createCaseFieldEvidence({
      caseContext: params.input.caseContext,
      includeBlocker: true,
      includeNextStep: true,
    }),
    generatedAt: output.generatedAt,
  });
}

export function executeInventoryWatchSpecialist(params: {
  input: InventoryWatchInput;
  buildSnapshot: (input: InventoryWatchInput) => ImobInventoryWatchSnapshot;
}) {
  const output = params.buildSnapshot(params.input);
  return createImobSpecialistExecution({
    specialistId: "imob.inventory_watch_agent",
    capabilityId: "inventory.active_watch",
    version: output.watchVersion,
    input: params.input,
    output,
    reasonCodes: [`watch_status_${output.watchStatus}`, `match_strength_${output.matchStrength}`],
    evidenceRefs: createCaseFieldEvidence({
      caseContext: params.input.caseContext,
      includeLeadGoal: true,
      includeLeadCity: true,
      includeBudget: true,
    }),
    generatedAt: output.generatedAt,
  });
}

export function executeMissionOrchestrationSpecialist(params: {
  input: MissionInput;
  buildSnapshot: (input: MissionInput) => ImobMissionOrchestrationSnapshot;
}) {
  const output = params.buildSnapshot(params.input);
  return createImobSpecialistExecution({
    specialistId: "imob.mission_orchestrator",
    capabilityId: "multiagent.mission_orchestration",
    version: output.missionVersion,
    input: params.input,
    output,
    reasonCodes: output.missionReasonCodes,
    evidenceRefs: output.evidenceRefs.length
      ? output.evidenceRefs
      : (params.input.decisionRationale?.sourceRefs ?? createCaseFieldEvidence({
          caseContext: params.input.caseContext,
          includeBlocker: true,
          includeNextStep: true,
        })),
    generatedAt: output.generatedAt,
  });
}

export type ImobLeadScoringExecution = ImobSpecialistExecution<LeadScoringInput, ImobLeadScoringSnapshot>;
export type ImobRelationshipMemoryExecution = ImobSpecialistExecution<CommercialMemoryInput, ImobCommercialMemorySnapshot>;
export type ImobLeadProfileExecution = ImobSpecialistExecution<LeadProfileInput, ImobLeadProfileReportSnapshot>;
export type ImobViabilityExecution = ImobSpecialistExecution<ViabilityInput, ImobViabilityMarketAnalysisSnapshot>;
export type ImobClosingExecution = ImobSpecialistExecution<ClosingInput, ImobClosingDocumentsSnapshot>;
export type ImobReengagementExecution = ImobSpecialistExecution<ReengagementInput, ImobReengagementSuggestion>;
export type ImobInventoryWatchExecution = ImobSpecialistExecution<InventoryWatchInput, ImobInventoryWatchSnapshot>;
export type ImobMissionExecution = ImobSpecialistExecution<MissionInput, ImobMissionOrchestrationSnapshot>;
