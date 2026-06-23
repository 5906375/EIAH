import type { ImobAgentRuntimeMetadata, ImobChatExperienceContract } from "./imobConversationContract";
import { imobCapabilityRegistry, listAllImobCapabilities } from "./imobCapabilityRegistry";
import { IMOB_CONVERSATIONAL_INTENT_CATALOG } from "./imobIntentCatalog";
import { buildImobPromotionReviewSurface } from "./imobPromotionReviewSurface";
import { listImobBackingSpecialists } from "./imobSpecialistBridge";

const IMOB_AGENT_CONTRACT_ID = "imob.case_concierge.v1" as const;
const IMOB_AGENT_CONTRACT_VERSION = 1 as const;

export const IMOB_AGENT_INITIAL_INTENT_IDS = [
  "daily.leads_today",
  "lead.resume_case",
  "lead.prepare_message",
  "match.suggest_properties",
  "visit.follow_up",
  "proposal.advance",
  "documents.unblock_case",
] as const;

const IMOB_CHAT_EXPERIENCE_CONTRACT_V1: ImobChatExperienceContract = {
  sourceOfTruth: "imob_orchestrator_contract",
  visibleAgentId: "IMOB",
  dashboardRole: "managerial_console",
  marketplaceRole: "activation_only",
  widgets: [
    "commercial_home",
    "daily_routine",
    "inventory_showcase",
    "lead_summary",
    "case_summary",
    "proposal_summary",
    "document_checklist",
    "print_bundle",
    "contract_intake_draft",
    "contract_intake_result",
  ],
  backingSpecialists: listImobBackingSpecialists(),
};

export function listImobAgentInitialIntents() {
  return IMOB_CONVERSATIONAL_INTENT_CATALOG
    .filter((intent) => IMOB_AGENT_INITIAL_INTENT_IDS.includes(intent.intentId as (typeof IMOB_AGENT_INITIAL_INTENT_IDS)[number]))
    .map((intent) => ({ ...intent }));
}

export function buildImobAgentContractV1() {
  const initialIntents = listImobAgentInitialIntents();
  const capabilities = {
    runtimeExtensions: imobCapabilityRegistry.runtimeExtensions.map((item) => ({ ...item, dependsOn: [...item.dependsOn] })),
    externalIntegrations: imobCapabilityRegistry.externalIntegrations.map((item) => ({ ...item, dependsOn: [...item.dependsOn] })),
    workerOrchestration: imobCapabilityRegistry.workerOrchestration.map((item) => ({ ...item, dependsOn: [...item.dependsOn] })),
  };
  return {
    id: IMOB_AGENT_CONTRACT_ID,
    version: IMOB_AGENT_CONTRACT_VERSION,
    visibleName: IMOB_CHAT_EXPERIENCE_CONTRACT_V1.visibleAgentId,
    role: "vertical_case_concierge" as const,
    experience: {
      ...IMOB_CHAT_EXPERIENCE_CONTRACT_V1,
      backingSpecialists: IMOB_CHAT_EXPERIENCE_CONTRACT_V1.backingSpecialists.map((item) => ({ ...item })),
    },
    surfaces: {
      primary: "chat" as const,
      management: "dashboard" as const,
      activation: "marketplace" as const,
    },
    ownershipModel: {
      visibleAgentKeepsCaseOwnership: true as const,
      backingSpecialistsVisibleByDefault: false as const,
    },
    backingSpecialists: IMOB_CHAT_EXPERIENCE_CONTRACT_V1.backingSpecialists.map((item) => item.primaryAgentId),
    initialIntents: initialIntents.map((intent) => intent.intentId),
    capabilities: {
      total: listAllImobCapabilities().length,
      ...capabilities,
    },
  };
}

export function buildImobAgentRuntimeMetadata(): ImobAgentRuntimeMetadata {
  const contract = buildImobAgentContractV1();
  const promotionReviewSurface = buildImobPromotionReviewSurface({
    history: [],
  });
  return {
    contractId: contract.id,
    contractVersion: contract.version,
    visibleAgentId: contract.experience.visibleAgentId,
    visibleName: contract.visibleName,
    role: contract.role,
    sourceOfTruth: contract.experience.sourceOfTruth,
    surfaces: contract.surfaces,
    ownershipModel: contract.ownershipModel,
    backingSpecialists: [...contract.backingSpecialists],
    initialIntents: [...contract.initialIntents],
    capabilities: {
      total: contract.capabilities.total,
      runtimeExtensions: contract.capabilities.runtimeExtensions.map((item) => ({ ...item, dependsOn: [...item.dependsOn] })),
      externalIntegrations: contract.capabilities.externalIntegrations.map((item) => ({ ...item, dependsOn: [...item.dependsOn] })),
      workerOrchestration: contract.capabilities.workerOrchestration.map((item) => ({ ...item, dependsOn: [...item.dependsOn] })),
    },
    promotionReviewSurface,
  };
}
