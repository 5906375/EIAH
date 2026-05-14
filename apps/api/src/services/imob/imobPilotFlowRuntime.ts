import { createHash } from "node:crypto";

import type { ImobEvidenceRef } from "./imobConversationContract";
import {
  createImobAssistedIntegrationState,
  processNextImobAssistedCapability,
  queueImobAssistedCapability,
  type ImobAssistedCapabilityId,
  type ImobAssistedIntegrationState,
} from "./imobAssistedIntegrations";
import { resolveImobCapabilityGate, type ImobCapabilityGateDecision } from "./imobCapabilityGate";
import {
  createImobEnrichmentCaptureState,
  ingestImobScoutingOpportunity,
  processNextImobLeadEnrichment,
  queueImobLeadEnrichment,
  type ImobEnrichmentCaptureState,
} from "./imobEnrichmentCaptureRuntime";
import {
  createImobPilotFlowCaseMemoryState,
  updateImobPilotFlowCaseMemory,
  type ImobPilotFlowCaseMemoryState,
} from "./imobPilotFlowCaseMemory";
import {
  createImobPilotFlowHistoryState,
  recordImobPilotFlowRun,
  type ImobPilotFlowHistoryState,
} from "./imobPilotFlowHistory";
import { completeImobMissionState, openImobMissionState, type ImobMissionStateStatus } from "./imobMissionState";

export type ImobPilotFlowType =
  | "assisted_reengagement_flow"
  | "assisted_calendar_flow"
  | "assisted_listing_flow"
  | "shadow_capture_enrichment_flow";

export type ImobPilotFlowStatus =
  | "blocked"
  | "queued"
  | "completed"
  | "shadow_recorded"
  | "duplicate";

export type ImobPilotFlowState = {
  assisted: ImobAssistedIntegrationState;
  enrichmentCapture: ImobEnrichmentCaptureState;
  history: ImobPilotFlowHistoryState;
  caseMemory: ImobPilotFlowCaseMemoryState;
};

export type ImobPilotFlowResult = {
  flowRunId: string;
  flowId: string;
  flowType: ImobPilotFlowType;
  missionId: string;
  visibleAgentId: "IMOB";
  capabilityId: string;
  caseId: string | null;
  leadId: string | null;
  gateDecision: ImobCapabilityGateDecision;
  jobId?: string | null;
  trackingId?: string | null;
  evidenceRefs: ImobEvidenceRef[];
  status: ImobPilotFlowStatus;
  nextHumanAction: string;
  generatedAt: string;
};

export type ImobPilotFlowContext = {
  state: ImobPilotFlowState;
  caseId?: string | null;
  leadId?: string | null;
  generatedAt?: string | null;
};

export type ImobAssistedReengagementFlowInput = ImobPilotFlowContext & {
  flowType: "assisted_reengagement_flow";
  consentProvided?: boolean;
  humanApprovalGranted?: boolean;
  evidenceRefsCount?: number;
  policyAccepted?: boolean;
  payload?: Record<string, unknown> | null;
  idempotencyKey?: string | null;
};

export type ImobAssistedCalendarFlowInput = ImobPilotFlowContext & {
  flowType: "assisted_calendar_flow";
  humanApprovalGranted?: boolean;
  evidenceRefsCount?: number;
  policyAccepted?: boolean;
  payload?: Record<string, unknown> | null;
  idempotencyKey?: string | null;
};

export type ImobAssistedListingFlowInput = ImobPilotFlowContext & {
  flowType: "assisted_listing_flow";
  humanApprovalGranted?: boolean;
  evidenceRefsCount?: number;
  policyAccepted?: boolean;
  payload?: Record<string, unknown> | null;
  idempotencyKey?: string | null;
};

export type ImobShadowCaptureEnrichmentFlowInput = ImobPilotFlowContext & {
  flowType: "shadow_capture_enrichment_flow";
  sourceUrl: string;
  sourceId: string;
  source: string;
  sourceTimestamp: string;
  confidence: number;
  consentBasis: string;
  piiMasking: "masked" | "minimized" | "full_authorized";
  reconciliationStatus: "pending" | "matched" | "conflict";
  address?: string | null;
  ownerName?: string | null;
  ownerPhone?: string | null;
  propertyType?: string | null;
  askingPriceCents?: number | null;
  payload?: Record<string, unknown> | null;
  consentProvided?: boolean;
  humanApprovalGranted?: boolean;
  evidenceRefsCount?: number;
  policyAccepted?: boolean;
  idempotencyKey?: string | null;
};

export type ImobPilotFlowInput =
  | ImobAssistedReengagementFlowInput
  | ImobAssistedCalendarFlowInput
  | ImobAssistedListingFlowInput
  | ImobShadowCaptureEnrichmentFlowInput;

export function createImobPilotFlowState() {
  return {
    assisted: createImobAssistedIntegrationState(),
    enrichmentCapture: createImobEnrichmentCaptureState(),
    history: createImobPilotFlowHistoryState(),
    caseMemory: createImobPilotFlowCaseMemoryState(),
  } satisfies ImobPilotFlowState;
}

function buildFlowId(params: {
  flowType: ImobPilotFlowType;
  capabilityId: string;
  caseId?: string | null;
  leadId?: string | null;
}) {
  const hash = createHash("sha256");
  hash.update(params.flowType);
  hash.update(params.capabilityId);
  hash.update(params.caseId ?? "");
  hash.update(params.leadId ?? "");
  return `flow-${hash.digest("hex").slice(0, 16)}`;
}

function buildEvidenceRefs(params: {
  flowType: ImobPilotFlowType;
  capabilityId: string;
  caseId?: string | null;
  leadId?: string | null;
  status: ImobPilotFlowStatus;
  generatedAt: string;
  trackingId?: string | null;
  jobId?: string | null;
  sourceRef?: string | null;
  gateDecision: ImobCapabilityGateDecision;
}) {
  const evidence: ImobEvidenceRef[] = [
    {
      kind: "workflow_signal",
      ref: "pilot.flow.type",
      label: "Tipo de flow pilotado",
      value: params.flowType,
    },
    {
      kind: "workflow_signal",
      ref: "pilot.flow.status",
      label: "Status do flow",
      value: params.status,
    },
    {
      kind: "workflow_signal",
      ref: "pilot.flow.capability",
      label: "Capability do flow",
      value: params.capabilityId,
    },
    {
      kind: "workflow_signal",
      ref: "pilot.flow.generated_at",
      label: "Flow gerado em",
      value: params.generatedAt,
    },
  ];

  if (params.caseId) {
    evidence.push({
      kind: "case_field",
      ref: "case.id",
      label: "Caso vinculado",
      value: params.caseId,
    });
  }
  if (params.leadId) {
    evidence.push({
      kind: "case_field",
      ref: "lead.id",
      label: "Lead vinculado",
      value: params.leadId,
    });
  }
  if (params.jobId) {
    evidence.push({
      kind: "workflow_signal",
      ref: "pilot.job.id",
      label: "Job sandbox",
      value: params.jobId,
    });
  }
  if (params.trackingId) {
    evidence.push({
      kind: "workflow_signal",
      ref: "pilot.tracking.id",
      label: "Tracking sandbox",
      value: params.trackingId,
    });
  }
  if (params.sourceRef) {
    evidence.push({
      kind: "workflow_signal",
      ref: "pilot.source.ref",
      label: "Origem rastreada",
      value: params.sourceRef,
    });
  }

  for (const reasonCode of params.gateDecision.reasonCodes) {
    evidence.push({
      kind: "workflow_signal",
      ref: `pilot.gate.${reasonCode}`,
      label: "Gate avaliado",
      value: reasonCode,
    });
  }

  if (params.gateDecision.allowed) {
    evidence.push({
      kind: "workflow_signal",
      ref: "pilot.gate.allowed",
      label: "Gate permitido",
      value: true,
    });
  }

  return evidence;
}

function buildFlowResult(params: {
  state: ImobPilotFlowState;
  flowType: ImobPilotFlowType;
  capabilityId: string;
  caseId?: string | null;
  leadId?: string | null;
  gateDecision: ImobCapabilityGateDecision;
  status: ImobPilotFlowStatus;
  nextHumanAction: string;
  generatedAt: string;
  evidenceRefs: ImobEvidenceRef[];
  jobId?: string | null;
  trackingId?: string | null;
}) {
  const missionStatus: ImobMissionStateStatus =
    params.status === "blocked"
      ? "blocked"
      : params.status === "shadow_recorded" || params.status === "duplicate"
        ? "watch"
        : "ready";

  const mission = completeImobMissionState({
    mission: openImobMissionState({
      caseId: params.caseId ?? null,
      capabilityId: params.capabilityId,
      ownerAgent: "IMOB",
      supportingAgents: ["guardian"],
      createdAt: params.generatedAt,
    }),
    status: missionStatus,
    evidenceRefs: params.evidenceRefs,
    closedAt: params.generatedAt,
  });

  const result = {
    flowRunId: "",
    flowId: buildFlowId({
      flowType: params.flowType,
      capabilityId: params.capabilityId,
      caseId: params.caseId ?? null,
      leadId: params.leadId ?? null,
    }),
    flowType: params.flowType,
    missionId: mission.missionId,
    visibleAgentId: "IMOB",
    capabilityId: params.capabilityId,
    caseId: params.caseId ?? null,
    leadId: params.leadId ?? null,
    gateDecision: params.gateDecision,
    jobId: params.jobId ?? null,
    trackingId: params.trackingId ?? null,
    evidenceRefs: mission.evidenceRefs,
    status: params.status,
    nextHumanAction: params.nextHumanAction,
    generatedAt: params.generatedAt,
  } satisfies ImobPilotFlowResult;
  const historyEntry = recordImobPilotFlowRun({
    state: params.state.history,
    entry: {
      flowId: result.flowId,
      flowType: result.flowType,
      missionId: result.missionId,
      capabilityId: result.capabilityId,
      caseId: result.caseId,
      leadId: result.leadId,
      status: result.status,
      gateReasonCodes: [...result.gateDecision.reasonCodes],
      jobId: result.jobId ?? null,
      trackingId: result.trackingId ?? null,
      visibleAgentId: result.visibleAgentId,
      evidenceRefs: [...result.evidenceRefs],
      generatedAt: result.generatedAt,
    },
  });
  result.flowRunId = historyEntry.flowRunId;
  updateImobPilotFlowCaseMemory({
    state: params.state.caseMemory,
    result,
  });
  return result;
}

function buildBlockedFlow(params: {
  state: ImobPilotFlowState;
  flowType: ImobPilotFlowType;
  capabilityId: string;
  caseId?: string | null;
  leadId?: string | null;
  gateDecision: ImobCapabilityGateDecision;
  generatedAt: string;
  nextHumanAction: string;
}) {
  return buildFlowResult({
    ...params,
    status: "blocked",
    evidenceRefs: buildEvidenceRefs({
      ...params,
      status: "blocked",
      generatedAt: params.generatedAt,
    }),
  });
}

function processAssistedFlow(params: {
  flowType: "assisted_reengagement_flow" | "assisted_calendar_flow" | "assisted_listing_flow";
  state: ImobPilotFlowState;
  capabilityId: string;
  assistedCapabilityId: ImobAssistedCapabilityId;
  caseId?: string | null;
  leadId?: string | null;
  generatedAt: string;
  consentProvided?: boolean;
  humanApprovalGranted?: boolean;
  evidenceRefsCount?: number;
  policyAccepted?: boolean;
  payload?: Record<string, unknown> | null;
  idempotencyKey?: string | null;
  nextHumanAction: string;
}) {
  const primaryGate = resolveImobCapabilityGate({
    capabilityId: params.capabilityId,
    consentProvided: params.consentProvided,
    humanApprovalGranted: params.humanApprovalGranted,
    evidenceRefsCount: params.evidenceRefsCount,
    policyAccepted: params.policyAccepted,
    minimumRolloutStage: "shadow",
  });

  if (!primaryGate.allowed) {
    return buildBlockedFlow({
      state: params.state,
      flowType: params.flowType,
      capabilityId: params.capabilityId,
      caseId: params.caseId,
      leadId: params.leadId,
      gateDecision: primaryGate,
      generatedAt: params.generatedAt,
      nextHumanAction: params.nextHumanAction,
    });
  }

  const queued = queueImobAssistedCapability({
    state: params.state.assisted,
    request: {
      capabilityId: params.assistedCapabilityId,
      payload: params.payload ?? null,
      consentProvided: params.consentProvided,
      humanApprovalGranted: params.humanApprovalGranted,
      evidenceRefsCount: params.evidenceRefsCount,
      policyAccepted: params.policyAccepted,
      idempotencyKey: params.idempotencyKey ?? null,
      now: params.generatedAt,
    },
  });

  if (queued.status === "blocked") {
    return buildBlockedFlow({
      state: params.state,
      flowType: params.flowType,
      capabilityId: params.capabilityId,
      caseId: params.caseId,
      leadId: params.leadId,
      gateDecision: queued.gate,
      generatedAt: params.generatedAt,
      nextHumanAction: params.nextHumanAction,
    });
  }

  const processed = processNextImobAssistedCapability({
    state: params.state.assisted,
    now: params.generatedAt,
  });

  const status: ImobPilotFlowStatus = queued.duplicate ? "duplicate" : processed ? "completed" : "queued";
  const gateDecision = resolveImobCapabilityGate({
    capabilityId: params.assistedCapabilityId,
    consentProvided: params.consentProvided,
    humanApprovalGranted: params.humanApprovalGranted,
    evidenceRefsCount: params.evidenceRefsCount,
    policyAccepted: params.policyAccepted,
    minimumRolloutStage: "shadow",
  });

  return buildFlowResult({
    state: params.state,
    flowType: params.flowType,
    capabilityId: params.capabilityId,
    caseId: params.caseId,
    leadId: params.leadId,
    gateDecision,
    jobId: queued.job.jobId,
    trackingId: queued.trackingId,
    status,
    generatedAt: params.generatedAt,
    nextHumanAction: status === "completed" ? "validar resultado sandbox e decidir rollout assistido" : params.nextHumanAction,
    evidenceRefs: buildEvidenceRefs({
      flowType: params.flowType,
      capabilityId: params.capabilityId,
      caseId: params.caseId,
      leadId: params.leadId,
      gateDecision,
      status,
      generatedAt: params.generatedAt,
      trackingId: queued.trackingId,
      jobId: queued.job.jobId,
      sourceRef: `${params.assistedCapabilityId}:sandbox`,
    }),
  });
}

export function runImobAssistedReengagementFlow(input: Omit<ImobAssistedReengagementFlowInput, "flowType">) {
  return processAssistedFlow({
    ...input,
    flowType: "assisted_reengagement_flow",
    capabilityId: "reengagement.continuous",
    assistedCapabilityId: "outbound.owner_contact",
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    nextHumanAction: "revisar copy, consentimento e aprovar retomada comercial",
  });
}

export function runImobAssistedCalendarFlow(input: Omit<ImobAssistedCalendarFlowInput, "flowType">) {
  return processAssistedFlow({
    ...input,
    flowType: "assisted_calendar_flow",
    capabilityId: "schedule.real_calendar",
    assistedCapabilityId: "schedule.real_calendar",
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    nextHumanAction: "confirmar janela de agenda e validar hold sandbox",
  });
}

export function runImobAssistedListingFlow(input: Omit<ImobAssistedListingFlowInput, "flowType">) {
  return processAssistedFlow({
    ...input,
    flowType: "assisted_listing_flow",
    capabilityId: "listing.ads_api_publish",
    assistedCapabilityId: "listing.ads_api_publish",
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    nextHumanAction: "revisar pacote de publicação e aprovar sandbox",
  });
}

export function runImobShadowCaptureEnrichmentFlow(input: Omit<ImobShadowCaptureEnrichmentFlowInput, "flowType">) {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const captureGate = resolveImobCapabilityGate({
    capabilityId: "active_capture.scouting",
    evidenceRefsCount: input.evidenceRefsCount,
    policyAccepted: input.policyAccepted,
    minimumRolloutStage: "shadow",
  });
  if (!captureGate.allowed) {
    return buildBlockedFlow({
      state: input.state,
      flowType: "shadow_capture_enrichment_flow",
      capabilityId: "active_capture.scouting",
      caseId: input.caseId,
      leadId: input.leadId,
      gateDecision: captureGate,
      generatedAt,
      nextHumanAction: "validar policy e evidência mínima antes de ingerir captação",
    });
  }

  const captured = ingestImobScoutingOpportunity({
    state: input.state.enrichmentCapture,
    request: {
      capabilityId: "active_capture.scouting",
      sourceUrl: input.sourceUrl,
      sourceId: input.sourceId,
      address: input.address ?? null,
      ownerName: input.ownerName ?? null,
      ownerPhone: input.ownerPhone ?? null,
      propertyType: input.propertyType ?? null,
      askingPriceCents: input.askingPriceCents ?? null,
      payload: input.payload ?? null,
      evidenceRefsCount: input.evidenceRefsCount,
      policyAccepted: input.policyAccepted,
      now: generatedAt,
    },
  });

  if (captured.status === "blocked") {
    return buildBlockedFlow({
      state: input.state,
      flowType: "shadow_capture_enrichment_flow",
      capabilityId: "active_capture.scouting",
      caseId: input.caseId,
      leadId: input.leadId,
      gateDecision: captured.gate,
      generatedAt,
      nextHumanAction: "corrigir requisitos de governança para captura shadow",
    });
  }

  if (captured.status === "duplicate") {
    return buildFlowResult({
      state: input.state,
      flowType: "shadow_capture_enrichment_flow",
      capabilityId: "active_capture.scouting",
      caseId: input.caseId,
      leadId: input.leadId,
      gateDecision: captureGate,
      status: "duplicate",
      generatedAt,
      nextHumanAction: "revisar oportunidade já deduplicada antes de novo enriquecimento",
      evidenceRefs: buildEvidenceRefs({
        flowType: "shadow_capture_enrichment_flow",
        capabilityId: "active_capture.scouting",
        caseId: input.caseId,
        leadId: input.leadId,
        gateDecision: captureGate,
        status: "duplicate",
        generatedAt,
        sourceRef: `${input.sourceUrl}#${input.sourceId}`,
      }),
    });
  }

  const enrichmentGate = resolveImobCapabilityGate({
    capabilityId: "lead.enrichment_public",
    consentProvided: input.consentProvided,
    humanApprovalGranted: input.humanApprovalGranted,
    evidenceRefsCount: input.evidenceRefsCount,
    policyAccepted: input.policyAccepted,
    minimumRolloutStage: "shadow",
  });
  if (!enrichmentGate.allowed) {
    return buildBlockedFlow({
      state: input.state,
      flowType: "shadow_capture_enrichment_flow",
      capabilityId: "lead.enrichment_public",
      caseId: input.caseId,
      leadId: input.leadId,
      gateDecision: enrichmentGate,
      generatedAt,
      nextHumanAction: "obter consentimento, approval e policy antes do enrichment shadow",
    });
  }

  const enrichment = queueImobLeadEnrichment({
    state: input.state.enrichmentCapture,
    request: {
      capabilityId: "lead.enrichment_public",
      leadId: input.leadId ?? "unknown-lead",
      source: input.source,
      sourceTimestamp: input.sourceTimestamp,
      confidence: input.confidence,
      consentBasis: input.consentBasis,
      piiMasking: input.piiMasking,
      reconciliationStatus: input.reconciliationStatus,
      payload: input.payload ?? null,
      consentProvided: input.consentProvided,
      humanApprovalGranted: input.humanApprovalGranted,
      evidenceRefsCount: input.evidenceRefsCount,
      policyAccepted: input.policyAccepted,
      idempotencyKey: input.idempotencyKey ?? null,
      now: generatedAt,
    },
  });

  if (enrichment.status === "blocked") {
    return buildBlockedFlow({
      state: input.state,
      flowType: "shadow_capture_enrichment_flow",
      capabilityId: "lead.enrichment_public",
      caseId: input.caseId,
      leadId: input.leadId,
      gateDecision: enrichment.gate,
      generatedAt,
      nextHumanAction: "corrigir requisitos de governança para enrichment shadow",
    });
  }

  const processed = processNextImobLeadEnrichment({
    state: input.state.enrichmentCapture,
    now: generatedAt,
  });
  const status: ImobPilotFlowStatus = enrichment.duplicate
    ? "duplicate"
    : processed
      ? "shadow_recorded"
      : "queued";

  return buildFlowResult({
    state: input.state,
    flowType: "shadow_capture_enrichment_flow",
    capabilityId: "active_capture.scouting",
    caseId: input.caseId,
    leadId: input.leadId,
    gateDecision: enrichmentGate,
    jobId: enrichment.job.jobId,
    trackingId: enrichment.trackingId,
    status,
    generatedAt,
    nextHumanAction: status === "shadow_recorded"
      ? "revisar captação e enrichment shadow antes de promover para pilot"
      : "acompanhar fila de enrichment shadow",
    evidenceRefs: buildEvidenceRefs({
      flowType: "shadow_capture_enrichment_flow",
      capabilityId: "active_capture.scouting",
      caseId: input.caseId,
      leadId: input.leadId,
      gateDecision: enrichmentGate,
      status,
      generatedAt,
      trackingId: enrichment.trackingId,
      jobId: enrichment.job.jobId,
      sourceRef: `${input.sourceUrl}#${input.sourceId}`,
    }),
  });
}

export function runImobPilotFlow(input: ImobPilotFlowInput) {
  switch (input.flowType) {
    case "assisted_reengagement_flow":
      return runImobAssistedReengagementFlow(input);
    case "assisted_calendar_flow":
      return runImobAssistedCalendarFlow(input);
    case "assisted_listing_flow":
      return runImobAssistedListingFlow(input);
    case "shadow_capture_enrichment_flow":
      return runImobShadowCaptureEnrichmentFlow(input);
    default: {
      const exhaustive: never = input;
      return exhaustive;
    }
  }
}
