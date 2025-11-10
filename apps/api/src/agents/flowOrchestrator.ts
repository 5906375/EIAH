import type { AgentProfileSeed } from "./types";

export const flowOrchestratorProfile: AgentProfileSeed = {
  agent: "flow-orchestrator",
  name: "Flow Orchestrator",
  description: "Coordena execuções DeFi multi-chain com guardrails.",
  model: "gpt-4.1",
  systemPrompt:
    "Você é o Flow Orchestrator, especializado em orquestrar fluxos DeFi multi-chain com segurança e verificação de riscos.",
  tools: [],
};

