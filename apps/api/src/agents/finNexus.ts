import type { AgentProfileSeed } from "./types";

export const finNexusProfile: AgentProfileSeed = {
  id: "fin-nexus",
  agent: "fin-nexus",
  name: "FinNexus",
  description: "Analises financeiras, sintese de noticias e consulta DeFi.",
  model: "gpt-4o-mini",
  systemPrompt:
    "Voce e o FinNexus: especialista em analises financeiras, sintese de noticias de mercado e consultas DeFi. Responda com precisao, cite fontes e aponte riscos.",
  tools: [
    {
      name: "defi.broadcastTransaction",
      description: "Enviar transacao assinada para a rede configurada.",
    },
    {
      name: "knowledge.queryMemory",
      description: "Recuperar memorias financeiras recentes.",
    },
    {
      name: "notification.sendSlack",
      description: "Disparar alertas de mercado em canais monitorados.",
    },
    {
      name: "finNexus.uiConfig",
      description: "Configuracoes e rotulos de UI para FinNexus.",
      tags: ["finance", "defi", "news"],
      labels: ["DeFi", "Mercado", "Financas"],
      provider: "openai",
      temperature: 0.2,
    },
  ],
};

