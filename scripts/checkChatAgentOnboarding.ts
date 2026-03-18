import { agentProfiles } from "../packages/core/src/actions/agents/registry.ts";
import type { AgentProfileSeed } from "../packages/core/src/actions/agents/types.ts";
import {
  applyChatRuntimeGateToParticipation,
  buildChatRuntimeSnapshot,
} from "../apps/api/src/services/agentChatRuntime.ts";

const CHECK = "check:chat-agent-onboarding";

function fail(message: string, details?: Record<string, unknown>): never {
  console.error(JSON.stringify({ ok: false, check: CHECK, message, details }, null, 2));
  process.exit(1);
}

function normalizeAgentKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function buildNeutralParticipation(profile: AgentProfileSeed) {
  return {
    agentId: profile.agent,
    status: "active" as const,
    visibility: "visible" as const,
    canBeSuggested: true,
    canReceiveHandoff: true,
    requiresEntitlement: false,
  };
}

function buildNeutralUxContract() {
  return {
    primaryUserValue: "Entregar resposta útil sem comportamento genérico.",
    responseShape: "brief_answer" as const,
    toneProfile: "supportive" as const,
    interactionPattern: "single_turn" as const,
    defaultCTA: "Prosseguir",
    maxCognitiveLoad: "low" as const,
    clarificationPolicy: "minimal" as const,
    progressExposure: "none" as const,
    trustSignals: ["clareza"],
  };
}

type EvaluatedAgent = {
  agent: string;
  readiness: "ready" | "incomplete";
  resolver: "agent_driven" | "legacy_compatible";
  missingFields: string[];
  chatEnabled: boolean;
  catalogVisibility: "visible" | "blocked";
  blockingReason: "missing_minimum_contract" | null;
  gatedParticipation: {
    status: string;
    visibility: string;
    canBeSuggested: boolean;
    canReceiveHandoff: boolean;
    requiresEntitlement: boolean;
  };
};

const evaluatedAgents: EvaluatedAgent[] = agentProfiles.map((profile) => {
  const chatRuntime = buildChatRuntimeSnapshot(profile.agent, {
    chatCopy: profile.chatCopy ?? null,
    uxContract: (profile as AgentProfileSeed & { uxContract?: unknown }).uxContract ?? buildNeutralUxContract(),
    participation: profile.participation ?? buildNeutralParticipation(profile),
    modeContracts: profile.modeContracts ?? null,
    attachmentContract: profile.attachmentContract ?? null,
  });
  const gatedParticipation = applyChatRuntimeGateToParticipation(
    profile.participation ?? buildNeutralParticipation(profile),
    chatRuntime
  );

  return {
    agent: profile.agent,
    readiness: chatRuntime.readiness,
    resolver: chatRuntime.resolver,
    missingFields: [...chatRuntime.missingFields],
    chatEnabled: chatRuntime.chatEnabled,
    catalogVisibility: chatRuntime.catalogVisibility,
    blockingReason: chatRuntime.blockingReason,
    gatedParticipation: {
      status: gatedParticipation.status,
      visibility: gatedParticipation.visibility,
      canBeSuggested: gatedParticipation.canBeSuggested,
      canReceiveHandoff: gatedParticipation.canReceiveHandoff,
      requiresEntitlement: gatedParticipation.requiresEntitlement,
    },
  };
});

const inconsistencies: Array<Record<string, unknown>> = [];

for (const agent of evaluatedAgents) {
  if (agent.readiness === "ready") {
    if (!agent.chatEnabled) {
      inconsistencies.push({ agent: agent.agent, issue: "ready_agent_not_chat_enabled" });
    }
    if (agent.catalogVisibility !== "visible") {
      inconsistencies.push({ agent: agent.agent, issue: "ready_agent_not_visible" });
    }
    if (agent.blockingReason !== null) {
      inconsistencies.push({ agent: agent.agent, issue: "ready_agent_has_blocking_reason" });
    }
    if (agent.gatedParticipation.visibility === "hidden") {
      inconsistencies.push({ agent: agent.agent, issue: "ready_agent_hidden_after_gate" });
    }
    if (!agent.gatedParticipation.canBeSuggested) {
      inconsistencies.push({ agent: agent.agent, issue: "ready_agent_not_suggestable_after_gate" });
    }
  } else {
    if (agent.chatEnabled) {
      inconsistencies.push({ agent: agent.agent, issue: "incomplete_agent_chat_enabled" });
    }
    if (agent.catalogVisibility !== "blocked") {
      inconsistencies.push({ agent: agent.agent, issue: "incomplete_agent_not_blocked" });
    }
    if (agent.blockingReason !== "missing_minimum_contract") {
      inconsistencies.push({ agent: agent.agent, issue: "incomplete_agent_missing_blocking_reason" });
    }
    if (agent.gatedParticipation.visibility !== "hidden") {
      inconsistencies.push({ agent: agent.agent, issue: "incomplete_agent_not_hidden_after_gate" });
    }
    if (agent.gatedParticipation.canBeSuggested) {
      inconsistencies.push({ agent: agent.agent, issue: "incomplete_agent_still_suggestable" });
    }
    if (agent.gatedParticipation.canReceiveHandoff) {
      inconsistencies.push({ agent: agent.agent, issue: "incomplete_agent_still_receives_handoff" });
    }
    if (!agent.gatedParticipation.requiresEntitlement) {
      inconsistencies.push({ agent: agent.agent, issue: "incomplete_agent_not_restricted" });
    }
  }

  if (normalizeAgentKey(agent.agent) === "eiah") {
    const missingModeContracts = agent.missingFields.filter((field) => field.startsWith("modeContracts."));
    if (agent.readiness === "ready" && missingModeContracts.length > 0) {
      inconsistencies.push({
        agent: agent.agent,
        issue: "eiah_ready_missing_required_modes",
        missingModeContracts,
      });
    }
  }
}

if (inconsistencies.length > 0) {
  fail("chat_agent_onboarding_gate_inconsistent", {
    inconsistencies,
    evaluatedAgents,
  });
}

const readyAgents = evaluatedAgents.filter((entry) => entry.readiness === "ready").map((entry) => entry.agent);
const blockedAgents = evaluatedAgents
  .filter((entry) => entry.readiness === "incomplete")
  .map((entry) => ({ agent: entry.agent, missingFields: entry.missingFields }));

console.log(
  JSON.stringify(
    {
      ok: true,
      check: CHECK,
      onboardingPolicy: "fail_closed_for_new_agents",
      minimumContract: ["chatCopy", "uxContract", "participation", "quickReplies"],
      readyAgents,
      blockedAgents,
      totalAgents: evaluatedAgents.length,
    },
    null,
    2
  )
);
