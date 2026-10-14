// Texto das respostas a turnos transversais (P10). Só descreve o que a descoberta (servidor) apurou: nunca afirma que um
// agente foi contratado, habilitado ou executou trabalho quando isso não aconteceu. A explicação de autoridade comercial
// fica no cartão (que usa a autoridade resolvida pelo servidor); aqui entram o estado e o limite desta conversa.

import type { TransversalTurn } from "./imobTransversalTurn";

type DiscoveredLike = {
  state?: unknown;
  provider?: { name?: unknown; agentId?: unknown } | null;
} | null | undefined;

function agentLabel(capability: DiscoveredLike) {
  const name = typeof capability?.provider?.name === "string" ? capability.provider.name : null;
  const id = typeof capability?.provider?.agentId === "string" ? capability.provider.agentId : null;
  if (name && id) return `${name} (${id})`;
  return name ?? id ?? "Marketing";
}

export function buildTransversalTurnText(turn: TransversalTurn, capability: DiscoveredLike): string {
  const label = agentLabel(capability);
  const state = typeof capability?.state === "string" ? capability.state : "nao_verificado";
  const stateSentence = (() => {
    switch (state) {
      case "habilitavel":
        return `O especialista ${label} pode ser habilitado neste workspace, mas ainda não foi contratado nem ativado.`;
      case "habilitado":
        return `O especialista ${label} já está habilitado neste workspace. O encaminhamento do trabalho a ele ainda não está disponível nesta versão, então nenhum trabalho foi iniciado.`;
      case "indisponivel":
        return "Não há um especialista de Marketing disponível para este workspace no momento.";
      default:
        return "Não consegui verificar agora se há um especialista de Marketing disponível. Por segurança, considere que nada foi contratado.";
    }
  })();
  if (turn.operation === "agent_engagement" && turn.engagement === "status") {
    const answer = state === "habilitado" ? "Sim, está habilitado." : state === "habilitavel" ? "Ainda não." : state === "indisponivel" ? "Não." : "Não consegui confirmar.";
    return `${answer} ${stateSentence}`;
  }
  if (turn.operation === "agent_engagement") {
    return `Esta conversa não contrata agentes. ${stateSentence}`;
  }
  // request_capability: divulgação de um imóvel que já está no caso (não abre cadastro de novo imóvel)
  return `Para divulgar este imóvel você pode contar com um especialista de Marketing. ${stateSentence} Nenhum cadastro novo será aberto: estou usando o imóvel deste caso.`;
}

type ThreadStateLike = Record<string, unknown> | null | undefined;

/** "Convidar" sem referente claro: pergunta, em vez de abrir cadastro ou contrato. Sem efeito colateral. */
export function buildInviteClarificationResolution(params: { threadState: ThreadStateLike; caseBound: boolean }) {
  const choices = [
    { id: "invite-clarify-person", label: "Convidar uma pessoa para o workspace", kind: "primary" as const, action: "send_suggested_message" as const, nextMessage: "Convidar uma pessoa para o workspace" },
    ...(params.caseBound
      ? [{ id: "invite-clarify-agent", label: "Contratar o especialista de Marketing", kind: "secondary" as const, action: "send_suggested_message" as const, nextMessage: "Quero saber como contratar o especialista de Marketing" }]
      : []),
  ];
  return {
    mode: "consult",
    action: "crm.turn.clarify_invite_referent",
    threadLabel: "IMOB CRM",
    conversationState: params.threadState,
    presentation: {
      text: params.caseBound
        ? "Você quer convidar uma pessoa para o workspace ou contratar o especialista de Marketing para este caso? São ações diferentes."
        : "Você quer convidar uma pessoa para o workspace? Se for outra coisa, me diga o que precisa.",
      card: { title: "Qual é a sua intenção?", lines: ["Convidar uma pessoa dá acesso ao workspace.", "Contratar um agente habilita um especialista, e depende de quem tem autoridade comercial."], ctas: choices },
    },
  } as Record<string, unknown>;
}

/** Convite explícito de pessoa ao workspace: orienta; o chat não envia convites nem contrata agentes. */
export function buildInviteGuidanceResolution(params: { threadState: ThreadStateLike }) {
  return {
    mode: "consult",
    action: "crm.turn.invite_person_guidance",
    threadLabel: "IMOB CRM",
    conversationState: params.threadState,
    presentation: {
      text: "Convidar uma pessoa para o workspace é feito em Perfil, na área de equipe, por quem gerencia membros. Esta conversa não envia convites. Isso é diferente de contratar um agente especializado.",
    },
  } as Record<string, unknown>;
}
