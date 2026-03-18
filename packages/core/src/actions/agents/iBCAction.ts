import type { AgentProfileSeed } from "./types";
import { profileAction } from "./types";

export const iBcProfile: AgentProfileSeed = {
  agent: "I_BC",
  name: "I_BC GPS",
  description: "Assistente comercial para inteligência de negócios.",
  model: "gpt-4.1-mini",
  systemPrompt:
    "Você é o agente I_BC. Ajude equipes comerciais com análises de contas, ICP e estratégias de expansão.",
  tools: [],
  knowledgePolicy: {
    deterministicSources: [
      { sourceId: "crm.account-history", kind: "db", authorityLevel: "primary", required: true, version: "v1" },
      { sourceId: "sales.playbooks", kind: "document_index", authorityLevel: "secondary", required: false, version: "v1" },
    ],
    sourcePrecedence: ["crm.account-history", "sales.playbooks"],
    conflictResolution: "human_review",
    llmUsageMode: "grounded_reasoning",
    fallbackPolicy: "human_review",
    provenancePolicy: "recommended",
    maskingPolicy: "conditional",
  },
};

export const iBCAgent = profileAction(iBcProfile);
