export const PROPOSAL_OPTIONS = [
  {
    id: "micro-imob",
    title: "Micro Imobiliaria",
    profile: "Corretor + assistente + gestor",
    recommendation: "Solo",
    objective: "Entrada rapida com operacao enxuta e upgrade progressivo.",
    nextStep: "Comece com Solo e revise em 30 dias.",
  },
  {
    id: "operacao-starter",
    title: "Operacao Estruturada",
    profile: "Time comercial com multiplos atendentes",
    recommendation: "Starter",
    objective: "Escalar atendimento com governanca e trilha auditavel.",
    nextStep: "Ative Starter e configure limites por workspace.",
  },
  {
    id: "expansao-growth",
    title: "Expansao Regional",
    profile: "Multiplas frentes e alta demanda mensal",
    recommendation: "Growth",
    objective: "Ganhar escala sem perder controle de custo e qualidade.",
    nextStep: "Ative Growth e acompanhe previsao de invoice no billing.",
  },
  {
    id: "enterprise-custom",
    title: "Enterprise Custom",
    profile: "Operacao critica com requisitos proprios",
    recommendation: "Enterprise",
    objective: "Compor proposta tecnica e comercial sob consulta.",
    nextStep: "Abrir proposta assistida com agente EIAH.",
  },
] as const;

export type ProposalOption = (typeof PROPOSAL_OPTIONS)[number];
export type ProposalOptionId = ProposalOption["id"];
