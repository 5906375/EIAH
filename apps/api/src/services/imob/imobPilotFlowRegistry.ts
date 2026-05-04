import type {
  ImobCapabilityExecutionMode,
  ImobCapabilityOwnerAgent,
  ImobCapabilityRiskTier,
  ImobCapabilityRolloutStage,
  ImobCapabilityStatus,
} from "./imobCapabilityRegistry";
import type { ImobPilotFlowType } from "./imobPilotFlowRuntime";

export type ImobPilotFlowRegistryEntry = {
  flowType: ImobPilotFlowType;
  ownerAgent: ImobCapabilityOwnerAgent;
  visibleAgentId: "IMOB";
  status: ImobCapabilityStatus;
  executionMode: ImobCapabilityExecutionMode;
  riskTier: ImobCapabilityRiskTier;
  rolloutStage: ImobCapabilityRolloutStage;
  requiresConsent: boolean;
  requiresHumanApproval: boolean;
  requiresEvidence: boolean;
  policyRequired: boolean;
  primaryCapability: string;
  supportingCapabilities: readonly string[];
};

const IMOB_VISIBLE_AGENT_ID = "IMOB" as const;

export const imobPilotFlowRegistry = [
  {
    flowType: "assisted_reengagement_flow",
    ownerAgent: "imob.reengagement_agent",
    visibleAgentId: IMOB_VISIBLE_AGENT_ID,
    status: "ready_for_shadow",
    executionMode: "shadow",
    riskTier: "CRITICAL",
    rolloutStage: "shadow",
    requiresConsent: true,
    requiresHumanApproval: true,
    requiresEvidence: true,
    policyRequired: true,
    primaryCapability: "reengagement.continuous",
    supportingCapabilities: ["outbound.owner_contact", "evidence.decision_rationale"],
  },
  {
    flowType: "assisted_calendar_flow",
    ownerAgent: "imob.scheduling_agent",
    visibleAgentId: IMOB_VISIBLE_AGENT_ID,
    status: "ready_for_shadow",
    executionMode: "shadow",
    riskTier: "HIGH",
    rolloutStage: "shadow",
    requiresConsent: false,
    requiresHumanApproval: true,
    requiresEvidence: true,
    policyRequired: true,
    primaryCapability: "schedule.real_calendar",
    supportingCapabilities: ["multiagent.mission_orchestration", "evidence.decision_rationale"],
  },
  {
    flowType: "assisted_listing_flow",
    ownerAgent: "imob.listing_publisher_agent",
    visibleAgentId: IMOB_VISIBLE_AGENT_ID,
    status: "ready_for_shadow",
    executionMode: "shadow",
    riskTier: "HIGH",
    rolloutStage: "shadow",
    requiresConsent: false,
    requiresHumanApproval: true,
    requiresEvidence: true,
    policyRequired: true,
    primaryCapability: "listing.ads_api_publish",
    supportingCapabilities: ["viability.market_analysis", "evidence.decision_rationale"],
  },
  {
    flowType: "shadow_capture_enrichment_flow",
    ownerAgent: "imob.scout_agent",
    visibleAgentId: IMOB_VISIBLE_AGENT_ID,
    status: "ready_for_shadow",
    executionMode: "shadow",
    riskTier: "CRITICAL",
    rolloutStage: "shadow",
    requiresConsent: true,
    requiresHumanApproval: true,
    requiresEvidence: true,
    policyRequired: true,
    primaryCapability: "active_capture.scouting",
    supportingCapabilities: ["lead.enrichment_public", "evidence.decision_rationale"],
  },
] as const satisfies readonly ImobPilotFlowRegistryEntry[];

export function listImobPilotFlows() {
  return imobPilotFlowRegistry.map((item) => ({
    ...item,
    supportingCapabilities: [...item.supportingCapabilities],
  }));
}

export function getImobPilotFlow(flowType: ImobPilotFlowType) {
  return imobPilotFlowRegistry.find((item) => item.flowType === flowType) ?? null;
}
