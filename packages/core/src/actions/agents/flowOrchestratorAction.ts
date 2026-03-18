import type { AgentProfileSeed } from "./types";
import { profileAction } from "./types";

export const flowOrchestratorProfile: AgentProfileSeed = {
  agent: "flow-orchestrator",
  name: "Flow Orchestrator",
  description: "Coordena execuções DeFi multi-chain com guardrails.",
  model: "gpt-4.1",
  systemPrompt:
    "Você é o Flow Orchestrator, especializado em orquestrar fluxos DeFi multi-chain com segurança e verificação de riscos.",
  tools: [],
  knowledgePolicy: {
    deterministicSources: [
      { sourceId: "runs.state-machine", kind: "event_store", authorityLevel: "primary", required: true, version: "v1" },
      { sourceId: "workflow.policy-registry", kind: "db", authorityLevel: "primary", required: true, version: "v1" },
    ],
    sourcePrecedence: ["runs.state-machine", "workflow.policy-registry"],
    conflictResolution: "fail_closed",
    llmUsageMode: "grounded_reasoning",
    fallbackPolicy: "block",
    provenancePolicy: "required",
    maskingPolicy: "conditional",
  },
};

export const flowOrchestratorAgent = profileAction(flowOrchestratorProfile);
