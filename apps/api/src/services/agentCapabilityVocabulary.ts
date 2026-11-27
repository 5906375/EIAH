// Módulo SEM dependências de runtime (nem banco, nem @eiah/core): o vocabulário de capacidades declaradas é lido por motores de
// turno puros (ex.: IMOB) que rodam sem builds. `agents.ts` reexporta estes símbolos e continua dono da descoberta/habilitação.

export type AgentCapabilityDeclaration = Readonly<{
  domain: string;
  capability: string;
  label: string;
  /**
   * Vocabulário que o próprio agente declara para ser reconhecido na conversa (registro estruturado, não regra de
   * roteamento): como o agente é chamado (`agentTerms`) e quais necessidades ele cobre (`needTerms`). Termos sem acento e
   * em minúsculas. Servem só para interpretar o turno; declarar não habilita nada nem substitui a descoberta por servidor.
   */
  agentTerms?: readonly string[];
  needTerms?: readonly string[];
}>;

/**
 * Declaração ESTRUTURADA das capacidades transversais que um agente oferece a outras verticais (domínio + capacidade).
 * É a chave da descoberta por necessidade estruturada: não depende de texto do usuário nem de lista de expressões.
 * Declarar aqui NÃO habilita nada: a disponibilidade operacional continua vindo do catálogo, da política do workspace,
 * da delegação e do estado de participação (`listAgents`). Chave = identificador normalizado do agente.
 */
export const AGENT_CAPABILITY_DECLARATIONS: Readonly<Record<string, readonly AgentCapabilityDeclaration[]>> = {
  mkt: [{
    domain: "marketing",
    capability: "campaign",
    label: "Planejamento de campanha de divulgação multicanal",
    agentTerms: ["marketing", "marketing gps", "mkt"],
    needTerms: [
      "divulgar", "divulgue", "divulgando", "divulgacao", "anunciar", "anuncie", "anunciando",
      "campanha", "campanhas", "promover", "promocao", "publicidade", "propaganda", "impulsionar",
    ],
  }],
};

/**
 * Id canônico do agente por chave declarada. Deve coincidir com `resolveAgentId(chave)` de `agents.ts` (que deriva dos perfis
 * nativos); a igualdade é verificada em `agent-capability-vocabulary.test.ts`.
 */
const CAPABILITY_AGENT_ID_BY_KEY: Readonly<Record<string, string>> = { mkt: "MKT" };

/** Vocabulário declarado pelos agentes governados, para a interpretação do turno (somente leitura). */
export function listCapabilityTurnVocabulary(): Array<{
  agentId: string;
  domain: string;
  capability: string;
  label: string;
  agentTerms: readonly string[];
  needTerms: readonly string[];
}> {
  return Object.entries(AGENT_CAPABILITY_DECLARATIONS).flatMap(([key, declarations]) =>
    declarations.map((entry) => ({
      agentId: CAPABILITY_AGENT_ID_BY_KEY[key] ?? key,
      domain: entry.domain,
      capability: entry.capability,
      label: entry.label,
      agentTerms: entry.agentTerms ?? [],
      needTerms: entry.needTerms ?? [],
    })),
  );
}

