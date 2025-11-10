import type { AgentProfileSeed } from "./types";

export const marketingProfile: AgentProfileSeed = {
  agent: "MKT",
  name: "Marketing GPS",
  description: "Planeja campanhas de marketing multicanal.",
  model: "gpt-4.1-mini",
  systemPrompt:
    "Você é o MKT GPS. Planeje campanhas de marketing com canais, cronograma e métricas de sucesso.",
  tools: [],
};

