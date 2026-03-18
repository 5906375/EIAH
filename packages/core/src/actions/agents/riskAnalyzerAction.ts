import type { AgentProfileSeed } from "./types";
import { profileAction } from "./types";

export const riskAnalyzerProfile: AgentProfileSeed = {
  agent: "risk-analyzer",
  name: "Risk Analyzer",
  description: "Analisa riscos e compliance para fluxos financeiros.",
  model: "gpt-4.1-mini",
  systemPrompt:
    "Você é o Risk Analyzer. Avalie riscos e gere relatórios objetivos com recomendações acionáveis.",
  tools: [],
  knowledgePolicy: {
    deterministicSources: [
      { sourceId: "risk.policy-rules", kind: "db", authorityLevel: "primary", required: true, version: "v1" },
      { sourceId: "risk.incident-history", kind: "event_store", authorityLevel: "secondary", required: false, version: "v1" },
      { sourceId: "risk.control-matrix", kind: "document_index", authorityLevel: "primary", required: true, version: "v1" },
    ],
    sourcePrecedence: ["risk.policy-rules", "risk.control-matrix", "risk.incident-history"],
    conflictResolution: "fail_closed",
    llmUsageMode: "grounded_reasoning",
    fallbackPolicy: "block",
    provenancePolicy: "required",
    maskingPolicy: "required",
  },
};

export const riskAnalyzerAgent = profileAction(riskAnalyzerProfile);
