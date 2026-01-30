import type { AgentProfileSeed } from "./types";
import { profileAction } from "./types";

/**
 * Perfil do agente j360.
 * Mantido simples, pois AgentProfileSeed não suporta "tools" avançadas.
 */
export const j360Profile: AgentProfileSeed = {
  agent: "j360",
  name: "Jurídico",
  description:
    "Agente especializado em contratos civis, imobiliários, tokenização, CVM e tributação.",
  model: "gpt-4o-mini",
  systemPrompt:
    "Você é o J_360. Agente especializado em contratos civis, imobiliários, tokenização, CVM e tributação. " +
    "Analisa cláusulas, detecta riscos, insere jurisprudência e gera parecer técnico em linguagem acessível.",
  tools: [], // permanece vazio, como o padrão dos outros agentes
};

/**
 * Handler simples: expõe o perfil para ser utilizado pelo executor de LLM do gateway.
 */
export const j360Agent = profileAction(j360Profile);
