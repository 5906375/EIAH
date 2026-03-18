import type { AgentProfileSeed } from "./types";
import { profileAction } from "./types";

export const marketingProfile: AgentProfileSeed = {
  agent: "MKT",
  name: "Marketing GPS",
  description: "Planeja campanhas de marketing multicanal.",
  model: "gpt-4.1-mini",
  systemPrompt:
    "Você é o MKT GPS. Planeje campanhas de marketing com canais, cronograma e métricas de sucesso.",
  tools: [],
  knowledgePolicy: {
    deterministicSources: [
      { sourceId: "marketing.campaign-history", kind: "db", authorityLevel: "primary", required: true, version: "v1" },
      { sourceId: "marketing.playbooks", kind: "document_index", authorityLevel: "secondary", required: false, version: "v1" },
    ],
    sourcePrecedence: ["marketing.campaign-history", "marketing.playbooks"],
    conflictResolution: "human_review",
    llmUsageMode: "grounded_reasoning",
    fallbackPolicy: "human_review",
    provenancePolicy: "recommended",
    maskingPolicy: "conditional",
  },
};

export const mktAgent = profileAction(marketingProfile);
