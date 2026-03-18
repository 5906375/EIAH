type ChatCopySnapshot = {
  quickReplies?: string[];
  [key: string]: unknown;
};

type UXSnapshot = {
  primaryUserValue: string;
  [key: string]: unknown;
};

type ParticipationSnapshot = {
  agentId: string;
  [key: string]: unknown;
};

type ModeContractSnapshot = {
  mode: "help" | "orchestrator" | "proposal";
  [key: string]: unknown;
};

type AttachmentContractSnapshot = {
  acceptsAttachments: boolean;
  [key: string]: unknown;
};

export type AgentChatRuntimeSnapshot = {
  readiness: "ready" | "incomplete";
  resolver: "agent_driven" | "legacy_compatible";
  missingFields: string[];
  hasModeContracts: boolean;
  hasAttachmentIntake: boolean;
  onboardingPolicy: "fail_closed_for_new_agents";
  chatEnabled: boolean;
  catalogVisibility: "visible" | "blocked";
  blockingReason: "missing_minimum_contract" | null;
};

function normalizeAgentKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function buildChatRuntimeSnapshot(
  agent: string,
  profile?: {
    chatCopy?: ChatCopySnapshot | null;
    uxContract?: UXSnapshot | null;
    participation?: ParticipationSnapshot | null;
    modeContracts?: ModeContractSnapshot[] | null;
    attachmentContract?: AttachmentContractSnapshot | null;
  } | null,
): AgentChatRuntimeSnapshot {
  const normalizedAgent = normalizeAgentKey(agent);
  const chatCopy = profile?.chatCopy ?? null;
  const uxContract = profile?.uxContract ?? null;
  const participation = profile?.participation ?? null;
  const modeContracts = profile?.modeContracts ?? null;
  const attachmentContract = profile?.attachmentContract ?? null;
  const missingFields: string[] = [];

  if (!chatCopy) missingFields.push("chatCopy");
  if (!uxContract) missingFields.push("uxContract");
  if (!participation) missingFields.push("participation");
  if (!chatCopy?.quickReplies || chatCopy.quickReplies.filter((value) => Boolean(value?.trim())).length === 0) {
    missingFields.push("quickReplies");
  }

  if (normalizedAgent === "eiah") {
    const declaredModes = new Set((modeContracts ?? []).map((entry) => entry.mode));
    for (const mode of ["help", "orchestrator", "proposal"] as const) {
      if (!declaredModes.has(mode)) {
        missingFields.push(`modeContracts.${mode}`);
      }
    }
  }

  return {
    readiness: missingFields.length === 0 ? "ready" : "incomplete",
    resolver: missingFields.length === 0 ? "agent_driven" : "legacy_compatible",
    missingFields,
    hasModeContracts: Array.isArray(modeContracts) && modeContracts.length > 0,
    hasAttachmentIntake: attachmentContract?.acceptsAttachments === true,
    onboardingPolicy: "fail_closed_for_new_agents",
    chatEnabled: missingFields.length === 0,
    catalogVisibility: missingFields.length === 0 ? "visible" : "blocked",
    blockingReason: missingFields.length === 0 ? null : "missing_minimum_contract",
  };
}
