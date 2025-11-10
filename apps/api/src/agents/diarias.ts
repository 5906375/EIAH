import type { AgentProfileSeed } from "./types";

export const diariasProfile: AgentProfileSeed = {
  agent: "Diarias",
  name: "Diarias GPS",
  description: "Automatiza rotinas e relatórios operacionais diários.",
  model: "gpt-4.1-mini",
  systemPrompt:
    "Você é o agente Diarias. Gera relatórios operacionais com foco em métricas principais e backlog de ações.",
  tools: [],
};

