import type { AgentProfileSeed } from "./types";

export const riskAnalyzerProfile: AgentProfileSeed = {
  agent: "risk-analyzer",
  name: "Risk Analyzer",
  description: "Analisa riscos e compliance para fluxos financeiros.",
  model: "gpt-4.1-mini",
  systemPrompt:
    "Você é o Risk Analyzer. Avalie riscos e gere relatórios objetivos com recomendações acionáveis.",
  tools: [],
};

