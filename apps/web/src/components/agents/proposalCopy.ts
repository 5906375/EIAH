export function buildProposalCostReductionReply() {
  return [
    "**Como reduzir custo mensal no EIAH**",
    "",
    "- Reduza excedentes de runs e usuários extras.",
    "- Use Simular primeiro para evitar execuções desnecessárias.",
    "- Compare plano atual com o volume real do mês.",
    "",
    "**Para calcular economia potencial**",
    "Me informe `usuários` e `runs/mês` estimados.",
  ].join("\n");
}

export function buildProposalOpenCommercialReply(params: { users: number; runs: number }) {
  return [
    "**Resumo do cenário**",
    `Já registrei ${params.users} usuários e ${params.runs} runs/mês para a proposta.`,
    "",
    "**Próximo passo para proposta comercial**",
    "Para abrir com o comercial sem perder contexto, me responda:",
    "- se é compra nova ou expansão do workspace",
    "- nome da empresa",
    "- nome do responsável",
    "- email ou WhatsApp de contato",
  ].join("\n");
}

export function buildProposalScheduleDemoReply(params: { users: number | null; runs: number | null }) {
  return [
    "**Agendar demonstração**",
    params.users && params.runs
      ? `Já considerei ${params.users} usuários e ${params.runs} runs/mês no contexto atual.`
      : "Posso seguir mesmo sem o volume fechado agora.",
    "",
    "Para eu encaminhar a demonstração, me envie:",
    "- nome da empresa",
    "- melhor email",
    "- objetivo principal da demo",
    "- faixa de usuários ou runs, se já tiver",
  ].join("\n");
}

export function buildProposalAssistedTrialReply(params: { users: number | null; runs: number | null }) {
  return [
    "**Criar trial assistido**",
    params.users && params.runs
      ? `Vou considerar ${params.users} usuários e ${params.runs} runs/mês como base do trial.`
      : "Se você já souber usuários e runs/mês, eu incorporo isso no trial.",
    "",
    "Para seguir, me envie:",
    "- nome da empresa",
    "- email do responsável",
    "- objetivo principal do trial",
    "- se quer trial para compra nova ou expansão",
  ].join("\n");
}

export function buildProposalPurchaseContextReply(params: {
  purchaseLabel: string;
  users: number;
  runs: number;
}) {
  return [
    "**Contexto comercial confirmado**",
    `Registrei que a proposta é para ${params.purchaseLabel}.`,
    `Base atual: ${params.users} usuários e ${params.runs} runs/mês.`,
    "",
    "**Próximo passo**",
    "Agora me envie:",
    "- nome da empresa",
    "- nome do responsável",
    "- email ou WhatsApp de contato",
  ].join("\n");
}

export function buildProposalUsagePromptReply(params: { missingUsers: boolean; missingRuns: boolean }) {
  const missingQuestions = [
    params.missingUsers ? "- Quantos usuários você terá no workspace?" : null,
    params.missingRuns ? "- Quantos runs/mês você estima?" : null,
  ]
    .filter(Boolean)
    .join("\n");
  const formatHint =
    params.missingUsers && params.missingRuns
      ? "Responda no formato: `X usuários e Y runs/mês`."
      : params.missingUsers
      ? "Responda no formato: `X usuários`."
      : "Responda no formato: `Y runs/mês`.";

  return [
    "**Resumo do cenário**",
    "Consigo montar sua proposta agora. Para fechar o cálculo, preciso apenas do dado que falta:",
    "",
    missingQuestions,
    "",
    "**Próximo passo**",
    formatHint,
  ].join("\n");
}

export function buildProposalQuoteReply(params: {
  users: number;
  runs: number;
  recommendedLabel: string;
  recommendedCode: string;
  estimateLabel: string;
  estimateTitle: string;
  economicOption: string;
  balanceOption: string;
  scaleOption: string;
}) {
  return [
    "**Resumo do cenário**",
    `${params.users} usuários e ${params.runs} runs/mês.`,
    "",
    "**Plano recomendado**",
    `${params.recommendedLabel} (${params.recommendedCode.toUpperCase()})`,
    "",
    `**${params.estimateTitle}**`,
    params.estimateLabel,
    "",
    "**3 opções**",
    `- Econômica: ${params.economicOption}`,
    `- Equilíbrio: ${params.balanceOption}`,
    `- Escala: ${params.scaleOption}`,
    "",
    "**Próximos passos**",
    "- Abrir proposta comercial",
    "- Agendar demonstração",
    "- Criar trial assistido",
  ].join("\n");
}
