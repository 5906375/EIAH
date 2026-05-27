import type { ImobInternalAgentId } from "../../imob/agents/imobInternalAgents";
import type { ImobCapabilityRiskTier } from "../../imob/imobCapabilityRegistry";

export enum ImobOnboardingIntent {
  GENERAL_HELP = "imob.intent.help.general",
  CAPTURE_HELP = "imob.intent.help.capture",
  DOCUMENT_HELP = "imob.intent.help.document",
  TRANSACTION_HELP = "imob.intent.help.transaction",
  NEXT_ACTION_QUERY = "imob.intent.help.next_action",
}

export type ImobOnboardingSuggestedPrompt = {
  label: string;
  prompt: string;
  targetAgent: ImobInternalAgentId | "IMOB_Orchestrator";
  capabilityId: string;
  requiredAutonomyLevel: number;
  riskTier: ImobCapabilityRiskTier;
  requiresHumanApproval: boolean;
  executable: boolean;
};

export type ImobOnboardingResponse = {
  intent: ImobOnboardingIntent;
  summary: string;
  startingInstruction: string;
  suggestedPrompts: ImobOnboardingSuggestedPrompt[];
  systemBehaviorNote: string;
  handoffShortcut?: {
    actionLabel: string;
    preloadedMessage: string;
    route: "/app/imob/chat" | string;
    allowed: boolean;
    reasonCode?: string;
  };
  governance: {
    registryVersion: string;
    agentContractVersion: string;
    entitlementChecked: boolean;
    killSwitchAware: boolean;
  };
};
