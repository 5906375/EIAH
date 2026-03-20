import type { Agent } from "@/lib/api";

function normalizeIntentText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getAgentDisplayName(agent: Agent | null | undefined) {
  return agent?.chatCopy?.displayName || agent?.name || agent?.agent || "EIAH";
}

export function isAgentPresentationQuestion(input: string) {
  const normalized = normalizeIntentText(input);
  const signals = [
    "especialidades",
    "especialidade",
    "quais especialidades",
    "o que posso usar aqui",
    "o que posso fazer aqui",
    "o que o site pode me ajudar",
    "o que esse site pode me ajudar",
    "como o site pode me ajudar",
    "como esse site pode me ajudar",
    "o que o site oferece",
    "o que o eiah oferece",
    "explique voce",
    "fale sobre voce",
    "quais agentes existem",
    "quais agentes posso usar",
    "o que voce faz",
    "o que vc faz",
    "quem e voce",
    "quem eh voce",
    "se apresente",
    "apresente-se",
    "me explique voce",
    "explique suas funcoes",
    "explique suas capacidades",
  ];
  return signals.some((signal) => normalized.includes(signal));
}

export function buildDeterministicAgentOverviewReply(agentProfile: Agent | null) {
  if (!agentProfile) return null;
  const displayName = getAgentDisplayName(agentProfile);
  const chatCopy = agentProfile.chatCopy;
  if (chatCopy) {
    const opening = chatCopy.whoIAm.trim();
    const helpList = chatCopy.whatIDo.slice(0, 3).map((item) => `- ${item}`).join("\n");
    const bridge =
      chatCopy.whenToUseMe.length > 0
        ? `\n\nSe você estiver começando, eu costumo ajudar melhor em situações como:\n${chatCopy.whenToUseMe
            .slice(0, 2)
            .map((item) => `- ${item}`)
            .join("\n")}`
        : "";
    const nextStep = chatCopy.defaultNextStep?.trim() ? `\n\n${chatCopy.defaultNextStep.trim()}` : "";

    return [
      `**${displayName}**`,
      "",
      opening,
      "",
      "Na prática, eu consigo:",
      helpList,
      bridge,
      nextStep,
    ].join("\n");
  }
  return `${displayName} pode te ajudar a entender a plataforma e te mostrar o melhor próximo passo.`;
}

export function buildAgentOverviewReply(agentProfile: Agent | null) {
  return buildDeterministicAgentOverviewReply(agentProfile);
}

export function buildAgentCapabilitiesReply(agentProfile: Agent | null) {
  const displayName = getAgentDisplayName(agentProfile);
  const capabilities = agentProfile?.chatCopy?.whatIDo?.slice(0, 3) ?? [];
  if (capabilities.length === 0) {
    return `${displayName} pode te ajudar com orientação prática dentro do seu domínio principal.`;
  }
  return [
    `${displayName} pode te ajudar principalmente nestas frentes:`,
    "",
    ...capabilities.map((item) => `- ${item}`),
    "",
    agentProfile?.chatCopy?.defaultNextStep?.trim() || "Se quiser, me diga o caso e eu sigo por aí.",
  ].join("\n");
}

export function buildEiahCapabilitiesSummary(agentProfile: Agent | null) {
  const displayName = getAgentDisplayName(agentProfile);
  const capabilities = agentProfile?.chatCopy?.whatIDo?.slice(0, 3) ?? [];
  if (capabilities.length === 0) {
    return [
      `${displayName} pode te ajudar a entender a plataforma, explicar páginas e indicar o melhor próximo passo para cada tarefa.`,
      "",
      "Se quiser, me diga o que você quer resolver agora e eu sigo de forma direta.",
    ].join("\n");
  }

  return [
    `${displayName} pode te ajudar principalmente nestas frentes:`,
    "",
    ...capabilities.map((item) => `- ${item}`),
    "",
    "Se você me disser o objetivo, eu te mostro o melhor caminho ou o especialista mais adequado.",
  ].join("\n");
}

export function buildSuggestedAgentReply(
  agents: Agent[],
  deps: {
    canSuggestAgent: (agent: Agent | null | undefined) => boolean;
    normalizeAgentKey: (value: string) => string;
  }
) {
  const suggested = agents
    .filter((agent) => deps.normalizeAgentKey(agent.id ?? "") !== "eiah" && deps.canSuggestAgent(agent))
    .slice(0, 4);

  if (suggested.length === 0) {
    return [
      "Eu consigo te orientar pelo próximo passo aqui no EIAH, mas neste workspace não encontrei especialistas prontos para sugerir agora.",
      "",
      "Se você me disser o objetivo, eu posso te orientar por página, fluxo ou assinatura necessária.",
    ].join("\n");
  }

  const lines = suggested.map((agent) => {
    const area = agent.uxContract?.primaryUserValue?.trim() || agent.description?.trim() || "apoio especializado";
    return `- ${getAgentDisplayName(agent)}: ${area}`;
  });

  return [
    "Depende do que você quer resolver. Os especialistas mais úteis neste workspace são:",
    "",
    ...lines,
    "",
    "Se você me disser o caso, eu te indico qual deles faz mais sentido agora.",
  ].join("\n");
}
