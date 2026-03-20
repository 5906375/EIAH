import type { Agent } from "@/lib/api";

export type LegalJourneyStage =
  | "contract_review"
  | "clause_review"
  | "legal_risk"
  | "document_intake"
  | "real_estate_legal";

export type LegalJourneyDefinition = {
  stage: LegalJourneyStage;
  entrySignals: string[];
  answerShort: string;
  nextQuestion: string;
};

const LEGAL_JOURNEY_MAP: LegalJourneyDefinition[] = [
  {
    stage: "contract_review",
    entrySignals: [
      "revisar contrato",
      "quero revisar um contrato",
      "contrato de locacao",
      "contrato de locação",
      "contrato de compra e venda",
      "prestacao de servicos",
      "prestação de serviços",
      "termo aditivo",
      "minuta",
    ],
    answerShort:
      "No contexto jurídico, eu posso te ajudar a organizar a revisão do contrato antes de seguir para análise mais profunda.",
    nextQuestion: "Você quer revisar o contrato inteiro, uma cláusula específica ou entender os riscos principais?",
  },
  {
    stage: "clause_review",
    entrySignals: [
      "clausula",
      "cláusula",
      "multa",
      "rescisao",
      "rescisão",
      "prazo",
      "responsabilidade",
      "garantia",
      "reajuste",
      "obrigacao",
      "obrigação",
    ],
    answerShort:
      "No jurídico, eu posso te ajudar a focar a análise em cláusulas críticas, como prazo, multa, rescisão, responsabilidade e garantias.",
    nextQuestion: "Qual ponto você quer revisar primeiro: multa, rescisão, pagamento, prazo ou responsabilidade?",
  },
  {
    stage: "legal_risk",
    entrySignals: [
      "risco juridico",
      "risco jurídico",
      "riscos juridicos",
      "riscos jurídicos",
      "lacuna",
      "lacunas",
      "ambiguidade",
      "parecer",
    ],
    answerShort:
      "Eu posso te ajudar a organizar os riscos jurídicos, lacunas e ambiguidades antes de encaminhar para revisão especializada.",
    nextQuestion: "Você quer entender riscos contratuais, o que está faltando no documento ou preparar um parecer inicial?",
  },
  {
    stage: "document_intake",
    entrySignals: [
      "documento",
      "documentos",
      "analisar documento",
      "o que esta faltando",
      "o que está faltando",
    ],
    answerShort:
      "Posso te ajudar a organizar o material jurídico, identificar o que falta e separar o próximo dado mínimo para análise.",
    nextQuestion: "Você já tem o contrato, só uma cláusula, ou ainda precisa organizar o pedido jurídico?",
  },
  {
    stage: "real_estate_legal",
    entrySignals: [
      "matricula",
      "matrícula",
      "posse",
      "registro",
      "distrato",
      "corretagem",
      "locacao",
      "locação",
      "compra e venda de imovel",
      "compra e venda de imóvel",
      "contrato imobiliario",
      "contrato imobiliário",
      "edital",
    ],
    answerShort:
      "Quando o jurídico envolve imóvel, eu posso te ajudar a separar contrato, matrícula, posse, corretagem, distrato ou edital antes da revisão mais profunda.",
    nextQuestion: "Você quer revisar contrato imobiliário, matrícula/posse, edital, locação ou distrato?",
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

export function resolveLegalJourneyStage(input: string): LegalJourneyDefinition | null {
  const normalized = normalizeIntentText(input);
  for (const definition of LEGAL_JOURNEY_MAP) {
    if (definition.entrySignals.some((signal) => normalized === signal || normalized.includes(signal))) {
      return definition;
    }
  }
  return null;
}

export function buildLegalQuickRepliesForInput(input: string) {
  const stage = resolveLegalJourneyStage(input);
  switch (stage?.stage) {
    case "contract_review":
      return ["Quero revisar o contrato inteiro", "Quero analisar uma cláusula", "Quero entender os riscos"];
    case "clause_review":
      return ["Revisar multa", "Revisar rescisão", "Revisar responsabilidade"];
    case "legal_risk":
      return ["Quais riscos principais?", "O que está faltando?", "Quero organizar um parecer"];
    case "document_intake":
      return ["Tenho o contrato", "Tenho só uma cláusula", "Quero organizar o pedido"];
    case "real_estate_legal":
      return ["Revisar contrato imobiliário", "Entender matrícula e posse", "Analisar edital ou distrato"];
    default:
      return ["Quero revisar um contrato.", "Quais dados preciso enviar?", "Quais riscos contratuais comuns?"];
  }
}

export function isLegalDataCollectionQuestion(input: string) {
  const normalized = normalizeIntentText(input).trim();
  const signals = [
    "tipo de contrato",
    "partes envolvidas",
    "prazo",
    "pontos sensiveis",
    "pontos sensíveis",
    "ponto sensivel",
    "ponto sensível",
  ];
  return signals.some((signal) => normalized === signal || normalized.startsWith(`${signal} `));
}

export function buildLegalDataCollectionReply(input: string) {
  const normalized = normalizeIntentText(input).trim();
  if (normalized.startsWith("tipo de contrato")) {
    return "Perfeito. Me diga qual é o tipo de contrato e, se puder, o objetivo principal da análise.";
  }
  if (normalized.startsWith("partes envolvidas")) {
    return "Certo. Informe quem são as partes envolvidas e qual é a relação entre elas nesse contrato.";
  }
  if (normalized.startsWith("prazo")) {
    return "Perfeito. Me diga o prazo do contrato, ou se a dúvida está justamente em renovação, vigência ou rescisão.";
  }
  if (
    normalized.startsWith("pontos sensiveis") ||
    normalized.startsWith("pontos sensíveis") ||
    normalized.startsWith("ponto sensivel") ||
    normalized.startsWith("ponto sensível")
  ) {
    return "Me diga quais pontos você quer revisar primeiro, por exemplo: multa, rescisão, pagamento, prazo ou responsabilidade.";
  }
  return [
    "Posso te ajudar a organizar o pedido para o Jurídico.",
    "",
    "Me envie, se possível:",
    "- tipo de contrato",
    "- partes envolvidas",
    "- prazo",
    "- ponto sensível que você quer revisar",
  ].join("\n");
}

export function buildLegalContextEntryReply(params: { legalAgent: Agent | null; isAvailable: boolean; input: string }) {
  const stage = resolveLegalJourneyStage(params.input);
  const opening = (() => {
    switch (stage?.stage) {
      case "contract_review":
        return "Isso parece uma entrada de revisão contratual.";
      case "clause_review":
        return "Isso parece uma análise de cláusula ou ponto crítico do contrato.";
      case "legal_risk":
        return "Isso parece uma análise de riscos jurídicos, lacunas ou ambiguidades.";
      case "document_intake":
        return "Isso parece uma organização inicial do documento ou do pedido jurídico.";
      case "real_estate_legal":
        return "Isso parece um caso jurídico com contexto imobiliário.";
      default:
        return "Isso parece um caso jurídico.";
    }
  })();

  const nextQuestion = (() => {
    switch (stage?.stage) {
      case "contract_review":
        return "Você quer revisar o contrato inteiro, uma cláusula específica ou os riscos principais?";
      case "clause_review":
        return "Qual ponto você quer revisar primeiro: multa, rescisão, prazo, pagamento ou responsabilidade?";
      case "legal_risk":
        return "Você quer entender riscos contratuais, lacunas do documento ou organizar um parecer inicial?";
      case "document_intake":
        return "Você já tem o contrato, só uma cláusula, ou ainda precisa organizar o pedido jurídico?";
      case "real_estate_legal":
        return "Você quer revisar contrato imobiliário, matrícula/posse, locação, edital ou distrato?";
      default:
        return "Se quiser seguir, me diga o tipo de contrato ou o ponto principal que você quer revisar.";
    }
  })();

  const handoffLine =
    params.legalAgent && params.isAvailable
      ? `Se fizer sentido, eu também posso te encaminhar para ${getAgentDisplayName(params.legalAgent)} depois disso.`
      : "Se esse caso exigir revisão aprofundada, eu sigo com o especialista jurídico quando ele estiver disponível.";

  return [opening, "", nextQuestion, "", handoffLine].join("\n");
}

export function buildLegalHandoffReply(params: { legalAgent: Agent | null; isAvailable: boolean; input: string }) {
  const stage = resolveLegalJourneyStage(params.input);
  const stageLine = (() => {
    switch (stage?.stage) {
      case "contract_review":
        return "Parece que você quer revisar um contrato ou organizar uma leitura jurídica mais completa.";
      case "clause_review":
        return "Parece que o foco está em cláusulas críticas, como multa, rescisão, prazo ou responsabilidade.";
      case "legal_risk":
        return "Parece que você quer entender riscos jurídicos, lacunas ou ambiguidades antes de decidir.";
      case "document_intake":
        return "Parece que você quer organizar o documento e entender o que falta para uma boa análise.";
      case "real_estate_legal":
        return "Parece que o tema jurídico envolve contexto imobiliário, como locação, matrícula, posse, edital ou distrato.";
      default:
        return "Esse caso parece jurídico.";
    }
  })();

  if (params.legalAgent && params.isAvailable) {
    const legalName = getAgentDisplayName(params.legalAgent);
    return [
      stageLine,
      "",
      `O melhor próximo passo é seguir com o agente ${legalName}.`,
      "",
      "Ele é o mais adequado para tratar contrato, cláusulas, riscos e lacunas do documento com mais precisão.",
      "",
      "Se quiser, eu também posso te ajudar a organizar o pedido antes de seguir, por exemplo:",
      "- tipo de contrato",
      "- partes envolvidas",
      "- prazo",
      "- pontos sensíveis que você quer revisar",
    ].join("\n");
  }

  return [
    stageLine,
    "",
    "Eu seguiria com o agente Jurídico para tratar contrato, cláusulas e riscos, mas ele não está disponível neste workspace agora.",
    "",
    "Se quiser, você pode assinar esse agente no tenant e depois eu continuo a partir daí.",
  ].join("\n");
}
