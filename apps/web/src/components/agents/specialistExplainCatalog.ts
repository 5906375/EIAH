import type { Agent } from "@/lib/api";

export type SpecialistExplainDefinition = {
  key: string;
  displayName: string;
  hints: string[];
  explainSignals?: string[];
  summary: string;
  fallbackCapabilities: string[];
  fallbackWhenToUse: string[];
};

const SPECIALIST_EXPLAIN_DEFINITIONS: SpecialistExplainDefinition[] = [
  {
    key: "j360",
    displayName: "J_360",
    hints: ["j360", "j_360", "juridico", "jurídico"],
    explainSignals: [
      "o que o j360 faz",
      "o que o j_360 faz",
      "o que o juridico faz",
      "o que juridico faz",
      "funcionamento do juridico",
      "funcionamento do j360",
      "funcionamento do j_360",
      "explique o juridico",
      "explique o j360",
      "explique o j_360",
      "explique o funcionamento do juridico",
      "como o juridico funciona",
      "como o j360 funciona",
      "como o j_360 funciona",
      "para que serve o juridico",
      "para que serve o j360",
      "para que serve o j_360",
      "quando usar o juridico",
      "quando usar o j360",
      "quando usar o j_360",
    ],
    summary: "o especialista em contratos, cláusulas, riscos e organização da análise jurídica",
    fallbackCapabilities: [
      "revisa contratos e cláusulas com foco em risco e consistência",
      "aponta lacunas, pontos sensíveis e informações que faltam para uma boa análise",
      "organiza o pedido jurídico antes de uma revisão mais profunda",
    ],
    fallbackWhenToUse: [
      "quando você precisa revisar, ajustar ou entender um contrato",
      "quando quer identificar risco jurídico, cláusulas críticas ou pontos faltantes",
    ],
  },
  {
    key: "aadv",
    displayName: "AADV",
    hints: ["aadv", "aadv selfservice", "aadv self-service", "aadv self service"],
    explainSignals: [
      "o que o aadv faz",
      "o que aadv faz",
      "funcionamento do aadv",
      "explique o aadv",
      "como o aadv funciona",
      "para que serve o aadv",
      "quando usar o aadv",
    ],
    summary: "o especialista em consolidar evidências, FinOps, risco e próximos passos executivos",
    fallbackCapabilities: [
      "organiza blocos de evidência sobre valor, custo, risco e segurança",
      "ajuda a identificar o que falta para consolidar um resumo executivo auditável",
      "transforma contexto operacional em próximos passos mais claros para decisão",
    ],
    fallbackWhenToUse: [
      "quando você precisa estruturar um caso com evidências e critérios de decisão",
      "quando quer entender riscos, lacunas ou próximos passos antes de consolidar o material",
    ],
  },
  {
    key: "finnexus",
    displayName: "FinNexus",
    hints: ["finnexus", "fin-nexus", "fin nexus"],
    explainSignals: [
      "o que o finnexus faz",
      "o que finnexus faz",
      "funcionamento do finnexus",
      "explique o finnexus",
      "como o finnexus funciona",
      "para que serve o finnexus",
      "quando usar o finnexus",
      "o que o fin-nexus faz",
      "o que o fin nexus faz",
      "quando usar o fin-nexus",
      "quando usar o fin nexus",
    ],
    summary: "o especialista financeiro da plataforma para pagamentos, pendências, billing operacional e conciliação",
    fallbackCapabilities: [
      "organiza contas a pagar, vencimentos e pendências financeiras",
      "ajuda a revisar boletos, notas, contratos e documentos antes do pagamento",
      "orienta conciliação bancária, fluxo de caixa e próximos passos financeiros",
    ],
    fallbackWhenToUse: [
      "quando você precisa revisar uma pendência financeira ou pagamento",
      "quando quer entender risco, documentação faltante ou conciliação",
    ],
  },
  {
    key: "guardian",
    displayName: "Guardian",
    hints: ["guardian"],
    explainSignals: [
      "o que o guardian faz",
      "o que guardian faz",
      "funcionamento do guardian",
      "explique o guardian",
      "como o guardian funciona",
      "para que serve o guardian",
      "quando usar o guardian",
    ],
    summary: "o especialista em evidências, receipt, verify_url, integridade e verificabilidade auditável",
    fallbackCapabilities: [
      "valida evidências, receipts e verify_url antes de avançar",
      "explica o que falta para uma prova auditável e verificável",
      "orienta trilha de integridade, recibos e conformidade em linguagem clara",
    ],
    fallbackWhenToUse: [
      "quando você precisa validar evidência, receipt, verify_url ou integridade",
      "quando quer preparar material para auditoria ou verificabilidade pública",
    ],
  },
  {
    key: "defi-one",
    displayName: "DeFi One",
    hints: ["defi1", "defione", "defi one", "de-fi one", "defi_1"],
    explainSignals: [
      "o que o defi one faz",
      "o que defi one faz",
      "funcionamento do defi one",
      "explique o defi one",
      "como o defi one funciona",
      "para que serve o defi one",
      "quando usar o defi one",
      "o que o defi1 faz",
      "o que o defi_1 faz",
      "quando usar o defi1",
      "quando usar o defi_1",
    ],
    summary: "o especialista em simulação DeFi, custo, risco e comparação de cenários antes da execução",
    fallbackCapabilities: [
      "simula operações DeFi antes da execução",
      "compara cenários de custo, slippage, gas e risco",
      "separa claramente simulação de execução on-chain",
    ],
    fallbackWhenToUse: [
      "quando você quer comparar cenários DeFi antes de agir",
      "quando precisa entender custo, risco ou impacto de uma operação",
    ],
  },
  {
    key: "mkt",
    displayName: "MKT",
    hints: ["mkt", "marketing gps", "marketing"],
    summary: "o especialista de negócio para briefing, campanha, canais, cronograma e métricas de marketing",
    fallbackCapabilities: [
      "organiza briefing, objetivo, público e mensagem principal da campanha",
      "estrutura canais, cronograma, KPIs e próximos passos de execução",
      "ajuda a transformar uma ideia comercial em plano de campanha mais claro",
    ],
    fallbackWhenToUse: [
      "quando você quer planejar campanha, canais ou narrativa de marketing",
      "quando precisa sair de uma ideia solta para um briefing com plano de ação",
    ],
  },
  {
    key: "pitch",
    displayName: "Pitch",
    hints: ["pitch", "pitch deck"],
    summary: "o especialista de negócio para estruturar narrativa, problema, solução, prova e CTA",
    fallbackCapabilities: [
      "organiza narrativa executiva para apresentação comercial ou institucional",
      "ajuda a transformar briefing em história clara com proposta de valor e próximos passos",
      "reforça a camada de decisão com foco em impacto, risco e tração",
    ],
    fallbackWhenToUse: [
      "quando você precisa montar ou revisar um pitch",
      "quando quer transformar contexto comercial em apresentação mais convincente",
    ],
  },
  {
    key: "i_bc",
    displayName: "I_BC GPS",
    hints: ["i_bc", "ibc", "i bc", "i_bc gps", "ibc gps"],
    summary: "o especialista de negócio para inteligência comercial, pipeline e estratégias de fechamento",
    fallbackCapabilities: [
      "ajuda a mapear pipeline, contas, prioridades e oportunidades comerciais",
      "organiza análise de ICP, expansão e próximos passos de fechamento",
      "transforma contexto comercial em visão mais clara de conta e estratégia",
    ],
    fallbackWhenToUse: [
      "quando você precisa analisar pipeline, prioridades comerciais ou expansão",
      "quando quer estruturar próximos passos de fechamento com mais clareza",
    ],
  },
  {
    key: "flow-orchestrator",
    displayName: "Flow Orchestrator",
    hints: ["flow orchestrator", "orchestrator", "flow"],
    summary: "o agente operacional para sequenciar fluxos, guardrails, validações e execução coordenada",
    fallbackCapabilities: [
      "organiza etapas de execução em sequência com verificações e guardrails",
      "ajuda a coordenar fluxos mais técnicos ou multi-etapa",
      "deixa explícito o próximo passo operacional antes de executar",
    ],
    fallbackWhenToUse: [
      "quando você precisa coordenar um fluxo com várias etapas",
      "quando o caso é mais operacional e menos de help geral",
    ],
  },
  {
    key: "risk-analyzer",
    displayName: "Risk Analyzer",
    hints: ["risk analyzer", "risk-analyzer", "risco"],
    summary: "o especialista de domínio para identificar riscos, classificar impacto e sugerir mitigação",
    fallbackCapabilities: [
      "ajuda a identificar riscos e organizar uma leitura priorizada",
      "separa impacto, criticidade e mitigação em linguagem objetiva",
      "apoia checklist de risco e compliance antes de avançar",
    ],
    fallbackWhenToUse: [
      "quando você quer entender riscos antes de decidir ou executar",
      "quando precisa estruturar mitigação e criticidade com clareza",
    ],
  },
  {
    key: "onchain-monitor",
    displayName: "On-chain Monitor",
    hints: ["on-chain monitor", "onchain monitor", "onchain-monitor"],
    summary: "o especialista de domínio para monitoramento on-chain, eventos e alertas operacionais",
    fallbackCapabilities: [
      "acompanha eventos on-chain e ajuda a estruturar regras de monitoramento",
      "organiza alertas, sinais e próximos passos em contexto blockchain",
      "apoia leitura operacional de atividade e exceções on-chain",
    ],
    fallbackWhenToUse: [
      "quando você precisa monitorar eventos ou atividade on-chain",
      "quando quer estruturar alertas e acompanhamento operacional de blockchain",
    ],
  },
  {
    key: "diarias",
    displayName: "Diarias GPS",
    hints: ["diarias", "diarias gps"],
    summary: "o agente operacional para rotina diária, resumo do dia, bloqueios e próximos passos",
    fallbackCapabilities: [
      "organiza resumo operacional do dia com foco em métricas e bloqueios",
      "ajuda a consolidar backlog e próximos passos de rotina",
      "transforma operação diária em visão mais clara e acionável",
    ],
    fallbackWhenToUse: [
      "quando você precisa consolidar a rotina operacional do dia",
      "quando quer resumir bloqueios, backlog e próximos passos",
    ],
  },
  {
    key: "image-nft-diarias",
    displayName: "Image NFT Diarias",
    hints: ["image nft diarias", "imagenftdiarias", "image nft", "nft diarias"],
    summary: "o agente operacional para prompts visuais e direção criativa diária ligada a NFT",
    fallbackCapabilities: [
      "cria prompts visuais consistentes com briefing e identidade",
      "ajuda a manter direção criativa recorrente para peças visuais",
      "organiza pedidos visuais de forma mais clara e reaproveitável",
    ],
    fallbackWhenToUse: [
      "quando você precisa gerar prompts visuais com consistência",
      "quando quer organizar direção criativa diária para peças NFT",
    ],
  },
  {
    key: "nft-py",
    displayName: "NFT PY",
    hints: ["nft py", "nft_py", "nftpy"],
    summary: "o agente operacional e nichado para estratégia, lançamentos e comunicação de coleções NFT",
    fallbackCapabilities: [
      "apoia estratégia e planejamento de lançamentos NFT",
      "ajuda com copy, direção e próximos passos para comunidade e campanha web3",
      "organiza briefing e execução de iniciativas focadas em NFT",
    ],
    fallbackWhenToUse: [
      "quando você precisa planejar um lançamento ou campanha NFT",
      "quando quer estruturar estratégia e comunicação para coleção web3",
    ],
  },
];

function normalizeIntentText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeAgentKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getAgentDisplayName(agent: Agent | null | undefined) {
  if (!agent) return "Agente";
  const normalizedId = normalizeAgentKey(agent.id ?? "");
  const normalizedName = normalizeAgentKey(agent.name ?? "");
  if (normalizedId === "eiah" || normalizedName === "eiahcore") return "EIAH";
  return agent.name?.trim() || agent.id?.trim() || "Agente";
}

export function isAgentExplainQuestion(normalized: string) {
  const questionSignals = [
    "o que ",
    "como ",
    "funciona",
    "explique",
    "para que serve",
    "quando usar",
    "quem e",
    "quem é",
  ];
  return questionSignals.some((signal) => normalized.includes(signal));
}

export function resolveSpecialistExplainTarget(input: string) {
  const normalized = normalizeIntentText(input);
  return SPECIALIST_EXPLAIN_DEFINITIONS.find((definition) => {
    if (definition.explainSignals?.some((signal) => normalized.includes(signal))) {
      return true;
    }
    if (!isAgentExplainQuestion(normalized)) {
      return false;
    }
    return definition.hints.some((hint) => normalized.includes(normalizeIntentText(hint)));
  });
}

export function buildSpecialistExplainReply(params: {
  definition: SpecialistExplainDefinition;
  agent: Agent | null;
  canReceiveHandoff: boolean;
}) {
  const { definition, agent, canReceiveHandoff } = params;
  const capabilities = agent?.chatCopy?.whatIDo?.slice(0, 3) ?? definition.fallbackCapabilities;
  const whenToUse = agent?.chatCopy?.whenToUseMe?.slice(0, 2) ?? definition.fallbackWhenToUse;

  if (!agent) {
    return [
      `${definition.displayName} é ${definition.summary}.`,
      "",
      ...capabilities.map((item) => `- ${item}`),
      "",
      "Quando vale usar:",
      ...whenToUse.map((item) => `- ${item}`),
      "",
      "Se esse especialista estiver ativo no workspace, eu também posso te orientar a seguir com ele.",
    ].join("\n");
  }

  const displayName = getAgentDisplayName(agent);
  const availabilityLine = canReceiveHandoff
    ? `Se fizer sentido, eu também posso te encaminhar para ${displayName} neste workspace.`
    : `${displayName} não está disponível para transferência neste workspace no momento.`;

  return [
    `${displayName} é ${definition.summary} na plataforma.`,
    "",
    capabilities.map((item) => `- ${item}`).join("\n"),
    whenToUse.length > 0 ? `\nQuando vale usar:\n${whenToUse.map((item) => `- ${item}`).join("\n")}` : "",
    "",
    availabilityLine,
  ]
    .filter(Boolean)
    .join("\n");
}
