import type { AgentProfileSeed } from "./types";

export const iBcProfile: AgentProfileSeed = {
  agent: "I_BC",
  name: "I_BC GPS",
  description: "Assistente comercial para inteligência de negócios.",
  model: "gpt-4.1-mini",
  systemPrompt:
    "Você é o agente I_BC. Ajude equipes comerciais com análises de contas, ICP e estratégias de expansão.",
  tools: [],
};

