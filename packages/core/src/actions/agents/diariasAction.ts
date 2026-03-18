import type { AgentProfileSeed } from "./types";
import { profileAction } from "./types";

export const diariasProfile: AgentProfileSeed = {
  agent: "Diarias",
  name: "Diarias GPS",
  description: "Automatiza rotinas e relatórios operacionais diários.",
  model: "gpt-4.1-mini",
  systemPrompt:
    "Você é o agente Diarias. Gera relatórios operacionais com foco em métricas principais e backlog de ações.",
  tools: [],
  knowledgePolicy: {
    deterministicSources: [
      { sourceId: "ops.daily-snapshot", kind: "snapshot", authorityLevel: "primary", required: true, version: "v1" },
    ],
    sourcePrecedence: ["ops.daily-snapshot"],
    conflictResolution: "use_primary",
    llmUsageMode: "format_only",
    fallbackPolicy: "approved_snapshot",
    provenancePolicy: "recommended",
    maskingPolicy: "none",
  },
};

export const diariasAgent = profileAction(diariasProfile);
