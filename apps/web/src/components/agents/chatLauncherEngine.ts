import type { Agent } from "@/lib/api";
import { j360Profile } from "../../../../../packages/core/src/actions/agents/j360Action";
import { resolveLegalSpecialtyContext } from "../../../../../packages/core/src/actions/agents/resolveLegalSpecialtyContext";

export type AgentParticipationSnapshot = NonNullable<Agent["participation"]>;

export type AgentParticipationRegistryEntry = {
  agent: Agent;
  participation: AgentParticipationSnapshot;
};

export type SpecialistAvailability = {
  agent: Agent | null;
  participation: AgentParticipationSnapshot | null;
  canBeSuggested: boolean;
  canReceiveHandoff: boolean;
};

export type LauncherRouteIntent = "proposal" | "imob" | "playbook" | "help" | "orchestrator";
export type EiahMode = "help" | "orchestrator" | "proposal";
export type EiahDecisionKind =
  | "self_intro"
  | "capabilities_summary"
  | "agent_explain"
  | "agent_signup_help"
  | "platform_self_explain"
  | "internal_technical_access"
  | "documentation_explain"
  | "hostile_input"
  | "imob_context_entry"
  | "legal_context_entry"
  | "legal_handoff"
  | "legal_data_collection"
  | "orchestrator_guidance"
  | "help_reply"
  | "imob_reply"
  | "playbook_reply"
  | "contextual_fallback"
  | "needs_run";

export type EiahDecision = {
  kind: EiahDecisionKind;
  shouldCreateRun: boolean;
  content?: string;
  launcherRouteIntent: LauncherRouteIntent;
  presentationRouteIntent:
    | LauncherRouteIntent
    | "self_intro"
    | "capabilities_summary"
    | "legal_handoff";
  eiahMode: EiahMode;
  renderVariant: "simple_help" | "self_intro" | "handoff" | "guided_flow" | "proposal";
  persistIntent?: {
    intent: string;
    confidenceFloor?: number;
  };
};

export type SpecialistDecision = {
  kind: "self_intro" | "capabilities_summary" | "specialist_guidance" | "contextual_fallback" | "needs_run";
  shouldCreateRun: boolean;
  content?: string;
  presentationRouteIntent: LauncherRouteIntent | "self_intro" | "capabilities_summary";
  renderVariant: "simple_help" | "self_intro" | "guided_flow";
};

export type LauncherLocalDecision = {
  kind: string;
  shouldCreateRun: boolean;
  content?: string;
  launcherRouteIntent: LauncherRouteIntent;
  presentationRouteIntent:
    | LauncherRouteIntent
    | "self_intro"
    | "capabilities_summary"
    | "legal_handoff";
  eiahMode?: EiahMode | null;
  renderVariant: "simple_help" | "self_intro" | "handoff" | "guided_flow" | "proposal";
  persistIntent?: {
    intent: string;
    confidenceFloor?: number;
  };
};

export type AttachmentIntakeResolution = {
  enabled: boolean;
  primaryActionLabel?: string;
  secondaryActionLabel?: string;
  helpText?: string;
  intakeModes?: Array<"upload_file" | "paste_text" | "structured_form">;
  analysisModes?: Array<
    | "full_review"
    | "partial_review"
    | "clause_review"
    | "risk_scan"
    | "missing_fields"
    | "evidence_validation"
    | "financial_check"
  >;
  acceptedKinds?: string[];
  acceptedMimeTypes?: string[];
  requiredMetadata?: string[];
  initialPrompts?: string[];
};

export type LegacyEnrichmentIntent = {
  intent: string;
  confidence: number;
  fallbackReason?: string;
};

type SpecialistExplainDefinition = {
  key: string;
  displayName: string;
  hints: string[];
  explainSignals?: string[];
  summary: string;
  fallbackCapabilities: string[];
  fallbackWhenToUse: string[];
};

type ImobFaqSeed = {
  key: string;
  domain: "imobiliarias" | "construtoras_incorporadoras" | "imoveis" | "leilao_imoveis";
  questionPatterns: string[];
  answerShort: string;
  nextQuestion: string;
  handoffHint?: "legal" | null;
  journeyStage?: ImobJourneyStage | null;
};

type ImobJourneyStage =
  | "captacao"
  | "compra"
  | "venda"
  | "locacao"
  | "proposta"
  | "leilao"
  | "negociacao"
  | "contrato"
  | "fechamento";

type ImobJourneyDefinition = {
  stage: ImobJourneyStage;
  entrySignals: string[];
  answerShort: string;
  nextQuestion: string;
  eligibleSpecialists: Array<"legal" | "none">;
  pageShortcuts: string[];
};

type LegalJourneyStage =
  | "contract_review"
  | "clause_review"
  | "legal_risk"
  | "document_intake"
  | "real_estate_legal";

type LegalJourneyDefinition = {
  stage: LegalJourneyStage;
  entrySignals: string[];
  answerShort: string;
  nextQuestion: string;
};

export function resolveAttachmentIntake(agentProfile: Agent | null): AttachmentIntakeResolution {
  const contract = agentProfile?.attachmentContract;
  if (!contract?.acceptsAttachments) {
    return { enabled: false };
  }

  const displayName = getAgentDisplayName(agentProfile);
  const isLegal = contract.acceptedAttachmentKinds.includes("contract") || displayName.toLowerCase().includes("jur");
  const isEvidence = contract.acceptedAttachmentKinds.includes("evidence") || contract.acceptedAttachmentKinds.includes("receipt");
  const isFinancial =
    contract.acceptedAttachmentKinds.includes("invoice") || contract.acceptedAttachmentKinds.includes("spreadsheet");

  const primaryActionLabel = isLegal
    ? "Anexar contrato"
    : isEvidence
    ? "Anexar evidência"
    : isFinancial
    ? "Anexar documento"
    : "Anexar arquivo";
  const secondaryActionLabel = isLegal
    ? "Colar cláusula"
    : isEvidence
    ? "Colar verify_url"
    : isFinancial
    ? "Colar trecho"
    : "Colar texto";

  return {
    enabled: true,
    primaryActionLabel,
    secondaryActionLabel,
    helpText: contract.uploadHelpText ?? `Envie um arquivo ou cole um trecho para ${displayName} analisar.`,
    intakeModes: contract.intakeModes,
    analysisModes: contract.analysisModes,
    acceptedKinds: contract.acceptedAttachmentKinds,
    acceptedMimeTypes: contract.acceptedMimeTypes,
    requiredMetadata: contract.requiredMetadata,
    initialPrompts: contract.initialPrompts,
  };
}

function formatLegacyContractValue(value: string | null | undefined) {
  if (!value) return "—";
  return value.replace(/_/g, " ");
}

function buildLegacyConfidenceBlock(params: {
  agentProfile: Agent | null;
  intentResult: LegacyEnrichmentIntent;
  runId?: string | null;
}) {
  const confidenceBehavior = params.agentProfile?.cognitiveProfile?.confidenceBehavior ?? "implicit";
  if (confidenceBehavior === "implicit") return "";
  const trustSignals = params.agentProfile?.uxContract?.trustSignals ?? [];
  const provenancePolicy = params.agentProfile?.knowledgePolicy?.provenancePolicy ?? "none";
  const confidencePct = Math.round((params.intentResult.confidence ?? 0) * 100);
  const lines: string[] = [];
  if (confidenceBehavior === "explicit" || confidenceBehavior === "gated") {
    lines.push(`Confiança de interpretação: ${confidencePct}%`);
  }
  if (provenancePolicy !== "none") {
    lines.push(`Proveniência: ${formatLegacyContractValue(provenancePolicy)}`);
  }
  if (params.runId) {
    lines.push(`Run: ${params.runId}`);
  }
  if (trustSignals.length > 0) {
    lines.push(`Sinais: ${trustSignals.slice(0, 3).join(", ")}`);
  }
  if (lines.length === 0) return "";
  return `\n\n**Confiança e sinais**\n${lines.map((line) => `- ${line}`).join("\n")}`;
}

function shouldAppendLegacyMetaBlock(params: {
  content: string;
  routeIntent: "proposal" | "imob" | "playbook" | "help" | "orchestrator";
  runId?: string | null;
  kind: "cta" | "confidence";
}) {
  const content = params.content.trim();
  const isSimpleHelpReply =
    (params.routeIntent === "help" || params.routeIntent === "playbook" || params.routeIntent === "imob") &&
    !params.runId;

  if (params.kind === "confidence" && isSimpleHelpReply) {
    return false;
  }

  if (params.kind === "cta" && isSimpleHelpReply) {
    if (/(se quiser|me diga|eu posso|posso te ajudar|eu te mostro)/i.test(content)) {
      return false;
    }
  }

  return true;
}

function buildLegacyCtaBlock(agentProfile: Agent | null, routeIntent: "proposal" | "imob" | "playbook" | "help" | "orchestrator") {
  const defaultCta = agentProfile?.uxContract?.defaultCTA?.trim();
  if (!defaultCta) return "";
  const title =
    routeIntent === "proposal"
      ? "Próximo passo recomendado"
      : routeIntent === "help"
      ? "Próximo passo"
      : routeIntent === "orchestrator"
      ? "Próxima decisão"
      : "Ação recomendada";
  return `\n\n**${title}**\n${defaultCta}`;
}

export function enrichLegacyAssistantContent(params: {
  content: string;
  agentProfile: Agent | null;
  routeIntent: "proposal" | "imob" | "playbook" | "help" | "orchestrator" | null;
  intentResult: LegacyEnrichmentIntent;
  runId?: string | null;
  presentationSnapshot?: {
    maxCognitiveLoad?: string;
    responseShape?: string;
  } | null;
}) {
  const routeIntent = params.routeIntent ?? "help";
  const base = params.content.trim();
  if (!base) return base;
  const maxLoad = params.presentationSnapshot?.maxCognitiveLoad ?? params.agentProfile?.uxContract?.maxCognitiveLoad ?? "medium";
  const responseShape = params.presentationSnapshot?.responseShape ?? params.agentProfile?.uxContract?.responseShape ?? "brief_answer";
  let next = base;

  const isGuardianAgent =
    normalizeAgentKey(params.agentProfile?.id ?? "") === "guardian" ||
    normalizeIntentText(params.agentProfile?.name ?? "").includes("guardian");
  if (isGuardianAgent && /knowledge_policy\.blocked:\s*knowledge_required_source_missing/i.test(next)) {
    next =
      params.agentProfile?.chatCopy?.blockedMessages?.missingRequiredSource?.trim() ||
      "Não consegui validar isso com segurança porque faltam evidências obrigatórias, como receipt, verify_url ou trilha de integridade.";
  }

  if (maxLoad === "low" && responseShape === "alert_card") {
    const compact = base
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter(Boolean)
      .slice(0, 3)
      .join("\n\n");
    next = compact || base;
  }

  if (params.presentationSnapshot) {
    return next.trim();
  }

  if (
    shouldAppendLegacyMetaBlock({
      content: next,
      routeIntent,
      runId: params.runId,
      kind: "cta",
    }) &&
    !/^\*\*Pr[oó]ximo passo/i.test(next) &&
    !/\n\*\*Pr[oó]ximo passo/i.test(next)
  ) {
    next += buildLegacyCtaBlock(params.agentProfile, routeIntent);
  }
  if (
    shouldAppendLegacyMetaBlock({
      content: next,
      routeIntent,
      runId: params.runId,
      kind: "confidence",
    }) &&
    !/\*\*Confiança e sinais\*\*/i.test(next)
  ) {
    next += buildLegacyConfidenceBlock({
      agentProfile: params.agentProfile,
      intentResult: params.intentResult,
      runId: params.runId,
    });
  }
  return next.trim();
}

function isGuardianGuidanceQuestion(input: string) {
  const normalized = normalizeIntentText(input);
  const signals = [
    "receipt",
    "verify_url",
    "verify url",
    "evidencia",
    "evidências",
    "evidencia",
    "prova",
    "provas",
    "integridade",
    "verificavel",
    "verificável",
    "auditoria",
    "cadeia de custodia",
    "cadeia de custódia",
    "pii",
  ];
  return signals.some((signal) => normalized.includes(signal));
}

function isFinanceGuidanceQuestion(input: string) {
  const normalized = normalizeIntentText(input);
  const signals = [
    "financeiro",
    "financeira",
    "pagamento",
    "pagamentos",
    "conta a pagar",
    "contas a pagar",
    "pendencia",
    "pendencias",
    "boleto",
    "nota fiscal",
    "concil",
    "fluxo de caixa",
    "invoice",
    "cobranca",
    "vencimento",
    "despesa",
  ];
  return signals.some((signal) => normalized.includes(signal));
}

function isAadvGuidanceQuestion(input: string) {
  const normalized = normalizeIntentText(input);
  const signals = [
    "evidencia",
    "evidências",
    "finops",
    "seguranca",
    "segurança",
    "resumo executivo",
    "bloco faltante",
    "consolidar evidencias",
    "consolidar evidências",
    "governanca",
    "governança",
    "rbac",
    "riscos comuns",
    "proximos passos",
    "próximos passos",
    "exemplo pratico",
    "exemplo prático",
  ];
  return signals.some((signal) => normalized.includes(signal));
}

function isPlaybookQuestion(input: string) {
  const normalized = normalizeIntentText(input);
  const patterns = [
    "central de ajuda",
    "roteiros principais",
    "diretrizes criticas",
    "diretrizes",
    "checklist",
    "playbook",
    "modo help",
    "modo proposal",
    "solicitar proposta",
    "pagina runs",
    "pagina agentes",
    "pagina billing",
    "pagina marketplace",
    "pagina imob",
    "pagina self-service",
    "pagina perfil",
    "comandos do chat",
  ];
  return patterns.some((pattern) => normalized.includes(pattern));
}

const IMOB_FAQ_SEEDS: ImobFaqSeed[] = [
  {
    key: "imobiliaria_o_que_faz",
    domain: "imobiliarias",
    questionPatterns: ["o que faz uma imobiliaria", "o que faz uma imobiliária"],
    answerShort: "A imobiliária intermedeia compra, venda, locação e administração de imóveis.",
    nextQuestion: "Você quer seguir por compra, venda, locação, captação ou administração?",
    journeyStage: null,
  },
  {
    key: "captacao_como_funciona",
    domain: "imobiliarias",
    questionPatterns: ["como funciona a captacao de imoveis", "como funciona a captação de imóveis", "quero captar imovel", "quero captar imóvel"],
    answerShort:
      "Captação é o processo de trazer imóveis para a carteira, com coleta de dados, documentos, fotos e estratégia comercial.",
    nextQuestion: "Você está captando para venda, locação ou leilão?",
    journeyStage: "captacao",
  },
  {
    key: "construtora_incorporadora_diferenca",
    domain: "construtoras_incorporadoras",
    questionPatterns: [
      "qual a diferenca entre construtora e incorporadora",
      "qual a diferença entre construtora e incorporadora",
    ],
    answerShort: "A incorporadora estrutura o empreendimento e o negócio; a construtora executa a obra.",
    nextQuestion: "Você está avaliando um lançamento, uma obra na planta ou um contrato do empreendimento?",
    handoffHint: "legal",
    journeyStage: null,
  },
  {
    key: "imovel_documentos_compra",
    domain: "imoveis",
    questionPatterns: ["quais documentos sao importantes na compra de um imovel", "quais documentos são importantes na compra de um imóvel"],
    answerShort: "Em geral, matrícula, documentos do vendedor, certidões e contrato.",
    nextQuestion: "Você quer entender a compra, revisar proposta ou checar documentação?",
    handoffHint: "legal",
    journeyStage: "compra",
  },
  {
    key: "leilao_o_que_e",
    domain: "leilao_imoveis",
    questionPatterns: ["o que e leilao de imoveis", "o que é leilão de imóveis", "tenho interesse em leilao", "tenho interesse em leilão"],
    answerShort: "Leilão de imóveis é a venda pública por lances, conforme regras do edital.",
    nextQuestion: "Você quer entender edital, riscos, ocupação ou custo total da operação?",
    handoffHint: "legal",
    journeyStage: "leilao",
  },
  {
    key: "edital_analise",
    domain: "leilao_imoveis",
    questionPatterns: ["quero analisar um edital", "como analisar edital", "quero revisar edital"],
    answerShort: "Antes de dar lance, o essencial é analisar edital, matrícula, ocupação, débitos e custo total da operação.",
    nextQuestion: "Você quer entender riscos, matrícula, ocupação ou custo total?",
    handoffHint: "legal",
    journeyStage: "leilao",
  },
];

const IMOB_JOURNEY_MAP: ImobJourneyDefinition[] = [
  {
    stage: "captacao",
    entrySignals: ["captacao", "captação", "captar", "captar imovel", "captar imóvel"],
    answerShort:
      "Em captação, eu posso te ajudar a organizar imóvel, proposta de entrada, documentação inicial e próximos passos comerciais.",
    nextQuestion: "Você está captando para venda, locação ou leilão?",
    eligibleSpecialists: ["none"],
    pageShortcuts: ["/app/imob/dashboard", "/app/imob/chat"],
  },
  {
    stage: "compra",
    entrySignals: ["comprar", "compra", "comprar apartamento", "comprar imovel", "comprar imóvel"],
    answerShort:
      "Na jornada de compra, eu posso te ajudar a organizar busca, proposta, documentação, negociação e próximos passos.",
    nextQuestion: "Você está na etapa de busca, proposta, negociação, contrato ou fechamento?",
    eligibleSpecialists: ["legal"],
    pageShortcuts: ["/app/imob/dashboard", "/app/imob/chat"],
  },
  {
    stage: "venda",
    entrySignals: ["vender", "venda", "vender imovel", "vender imóvel", "anunciar imovel", "anunciar imóvel"],
    answerShort:
      "Na jornada de venda, eu posso te ajudar a organizar captação, anúncio, proposta, negociação e fechamento.",
    nextQuestion: "O imóvel já está em captação, anúncio, proposta, negociação ou contrato?",
    eligibleSpecialists: ["legal"],
    pageShortcuts: ["/app/imob/dashboard", "/app/imob/chat"],
  },
  {
    stage: "locacao",
    entrySignals: ["locacao", "locação", "alugar", "locar", "aluguel", "administrar aluguel"],
    answerShort:
      "Na jornada de locação, eu posso te ajudar a organizar anúncio, proposta, garantias, contrato e acompanhamento.",
    nextQuestion: "Você quer seguir por anúncio, proposta, garantia locatícia, contrato ou administração?",
    eligibleSpecialists: ["legal"],
    pageShortcuts: ["/app/imob/dashboard", "/app/imob/chat"],
  },
  {
    stage: "proposta",
    entrySignals: ["proposta", "proposta imobiliaria", "proposta imobiliária", "proposta de compra", "proposta de locacao", "proposta de locação"],
    answerShort:
      "Em proposta, eu posso te ajudar a organizar valor, prazo, condições, documentação e próximo passo comercial.",
    nextQuestion: "Essa proposta é de compra, venda ou locação?",
    eligibleSpecialists: ["legal"],
    pageShortcuts: ["/app/imob/chat", "/app/imob/dashboard"],
  },
  {
    stage: "leilao",
    entrySignals: ["leilao", "leilão", "leiloar", "edital", "arrematacao", "arrematação", "imovel ocupado", "imóvel ocupado"],
    answerShort:
      "Em leilão de imóveis, eu posso te ajudar a organizar edital, ocupação, débitos, custo total e próximo passo da análise.",
    nextQuestion: "Você quer entender edital, ocupação, custos, matrícula ou riscos?",
    eligibleSpecialists: ["legal"],
    pageShortcuts: ["/app/imob/chat", "/app/imob/dashboard"],
  },
  {
    stage: "negociacao",
    entrySignals: ["negociacao", "negociação", "negociar"],
    answerShort:
      "Na negociação, eu posso te ajudar a organizar valor, condições, contraproposta e próximos passos até o contrato.",
    nextQuestion: "Você está negociando preço, prazo, condições ou documentação?",
    eligibleSpecialists: ["legal"],
    pageShortcuts: ["/app/imob/chat"],
  },
  {
    stage: "contrato",
    entrySignals: ["contrato", "contratual"],
    answerShort:
      "Quando a jornada já chegou em contrato, eu posso te ajudar a organizar o contexto antes de seguir para revisão jurídica.",
    nextQuestion: "Você quer revisar cláusulas, prazo, pagamento, garantia ou responsabilidade?",
    eligibleSpecialists: ["legal"],
    pageShortcuts: ["/app/imob/chat"],
  },
  {
    stage: "fechamento",
    entrySignals: ["fechamento", "fechar negocio", "fechar negócio", "escritura", "repasse"],
    answerShort:
      "No fechamento, eu posso te ajudar a organizar documentação final, escritura, repasse, assinatura e próximos passos da operação.",
    nextQuestion: "Você está na etapa de assinatura, escritura, repasse ou entrega?",
    eligibleSpecialists: ["legal"],
    pageShortcuts: ["/app/imob/chat", "/app/imob/dashboard"],
  },
];

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

function isImobGuideQuestion(input: string) {
  const normalized = normalizeIntentText(input);
  const patterns = [
    "imob",
    "como usar imob",
    "como usar o imob",
    "explica imob",
    "explique imob",
    "modulo imob",
    "jornada imobiliaria",
  ];
  return patterns.some((pattern) => normalized.includes(pattern));
}

function resolveImobFaqSeed(input: string) {
  const normalized = normalizeIntentText(input);
  return IMOB_FAQ_SEEDS.find((seed) => seed.questionPatterns.some((pattern) => normalized.includes(pattern)));
}

function resolveImobJourneyStage(input: string): ImobJourneyDefinition | null {
  const normalized = normalizeIntentText(input);
  for (const definition of IMOB_JOURNEY_MAP) {
    if (definition.entrySignals.some((signal) => normalized === signal || normalized.includes(signal))) {
      return definition;
    }
  }
  return null;
}

function resolveLegalJourneyStage(input: string): LegalJourneyDefinition | null {
  const normalized = normalizeIntentText(input);
  for (const definition of LEGAL_JOURNEY_MAP) {
    if (definition.entrySignals.some((signal) => normalized === signal || normalized.includes(signal))) {
      return definition;
    }
  }
  return null;
}

export function resolveConversationVerticalContext(
  input: string
): { vertical: "IMOB"; stage?: ImobJourneyStage; faq?: ImobFaqSeed } | { vertical: "LEGAL"; stage?: LegalJourneyStage } | null {
  const faq = resolveImobFaqSeed(input);
  if (faq) {
    return { vertical: "IMOB", stage: faq.journeyStage ?? undefined, faq };
  }
  const stage = resolveImobJourneyStage(input);
  if (stage) {
    return { vertical: "IMOB", stage: stage.stage };
  }
  const legalStage = resolveLegalJourneyStage(input);
  if (legalStage) {
    return { vertical: "LEGAL", stage: legalStage.stage };
  }
  return null;
}

function resolveVerticalContext(input: string) {
  return resolveConversationVerticalContext(input);
}

function isImobContextEntryQuestion(input: string) {
  return resolveVerticalContext(input)?.vertical === "IMOB";
}

function normalizeAgentKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeIntentText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getAgentDisplayName(agent: Agent | null | undefined) {
  if (!agent) return "Agente";
  const normalizedId = normalizeAgentKey(agent.id ?? "");
  const normalizedName = normalizeAgentKey(agent.name ?? "");
  if (normalizedId === "eiah" || normalizedName === "eiahcore") return "EIAH";
  return agent.name?.trim() || agent.id?.trim() || "Agente";
}

function isPresentationQuestion(input: string) {
  const normalized = normalizeIntentText(input);
  const signals = [
    "explique voce",
    "o que voce faz",
    "o que vc faz",
    "quem e voce",
    "se apresente",
    "explique suas capacidades",
    "explique suas funcoes",
  ];
  return signals.some((signal) => normalized.includes(signal));
}

function buildDefaultParticipation(agent: Agent): AgentParticipationSnapshot {
  return {
    agentId: agent.id,
    status: "active",
    visibility: "visible",
    canBeSuggested: true,
    canReceiveHandoff: true,
    requiresEntitlement: false,
    requiredModules: [],
    requiredWorkspaceCapabilities: [],
  };
}

export function getAgentParticipation(agent: Agent | null | undefined): AgentParticipationSnapshot | null {
  if (!agent) return null;
  return agent.participation ?? buildDefaultParticipation(agent);
}

export function resolveAgentParticipation(
  agents: Agent[],
  hints: string[] | string,
): AgentParticipationSnapshot | null {
  const registry = buildAgentParticipationRegistry(agents);
  const normalizedHints = Array.isArray(hints) ? hints : [hints];

  for (const hint of normalizedHints) {
    const entry = registry.get(normalizeAgentKey(hint));
    if (!entry) continue;
    return entry.participation;
  }

  return null;
}

export function canSuggestAgent(agent: Agent | null | undefined) {
  const participation = getAgentParticipation(agent);
  if (!participation) return false;
  return participation.visibility === "visible" && participation.canBeSuggested && participation.status === "active";
}

export function canHandoffToAgent(agent: Agent | null | undefined) {
  const participation = getAgentParticipation(agent);
  if (!participation) return false;
  return participation.visibility === "visible" && participation.canReceiveHandoff && participation.status === "active";
}

export function buildAgentParticipationRegistry(agents: Agent[]) {
  const registry = new Map<string, AgentParticipationRegistryEntry>();

  for (const agent of agents) {
    const participation = getAgentParticipation(agent);
    if (!participation) continue;
    const keys = new Set<string>([
      normalizeAgentKey(agent.id ?? ""),
      normalizeAgentKey(agent.name ?? ""),
      normalizeAgentKey(participation.agentId ?? ""),
    ]);
    for (const key of keys) {
      if (!key) continue;
      registry.set(key, { agent, participation });
    }
  }

  return registry;
}

export function resolveSpecialistAvailability(agents: Agent[], hints: string[]): SpecialistAvailability {
  const registry = buildAgentParticipationRegistry(agents);
  for (const hint of hints) {
    const entry = registry.get(normalizeAgentKey(hint));
    if (!entry) continue;
    return {
      agent: entry.agent,
      participation: entry.participation,
      canBeSuggested: canSuggestAgent(entry.agent),
      canReceiveHandoff: canHandoffToAgent(entry.agent),
    };
  }

  return {
    agent: null,
    participation: null,
    canBeSuggested: false,
    canReceiveHandoff: false,
  };
}

export function isEiahCapabilitiesQuestion(input: string) {
  const normalized = normalizeIntentText(input);
  const signals = [
    "o que o eiah pode fazer por mim",
    "o que o eiah oferece",
    "como o eiah pode me ajudar",
    "como voce pode me ajudar",
    "como vc pode me ajudar",
    "qual agente devo usar",
    "qual especialista devo usar",
  ];
  return signals.some((signal) => normalized.includes(signal));
}

function isDirectAnswerFriendlyQuestion(input: string) {
  const normalized = normalizeIntentText(input);
  const starters = ["como ", "o que ", "quais ", "qual ", "mostre ", "me mostre ", "explique "];
  const topicalSignals = ["exemplo", "exemplo pratico", "riscos comuns", "riscos", "proximos passos", "como comecar"];
  return (
    starters.some((starter) => normalized.startsWith(starter)) ||
    topicalSignals.some((signal) => normalized.includes(signal))
  );
}

export function detectLauncherRouteIntent(input: string, proposalMode: boolean): LauncherRouteIntent {
  if (proposalMode) return "proposal";
  const normalized = normalizeIntentText(input);
  const strongProposalSignals = [
    "proposta",
    "plano",
    "preco",
    "preço",
    "valor",
    "custo",
    "quanto vou pagar",
    "quanto custa",
    "mensalidade",
    "orcamento",
    "orçamento",
    "comercial",
  ];
  const secondaryProposalSignals = [
    "usuarios",
    "usuario",
    "pessoas",
    "equipe",
    "runs",
    "run",
    "implantacao",
    "implantar",
    "trial",
    "demonstracao",
    "demonstração",
  ];
  const helpOperationalSignals = [
    "status",
    "tempo real",
    "simular",
    "rodar agora",
    "como criar run",
    "como criar um run",
    "pagina",
    "página",
    "endpoints",
    "api",
    "como funciona imob",
  ];
  const hasStrongProposal = strongProposalSignals.some((signal) => normalized.includes(signal));
  const hasSecondaryProposal = secondaryProposalSignals.some((signal) => normalized.includes(signal));
  const hasOperationalHelp = helpOperationalSignals.some((signal) => normalized.includes(signal));
  if (hasStrongProposal || (hasSecondaryProposal && !hasOperationalHelp)) return "proposal";
  if (isImobGuideQuestion(input) || isImobContextEntryQuestion(input)) return "imob";
  if (isPlaybookQuestion(input)) return "playbook";
  if (isLegalRoutingQuestion(input)) return "orchestrator";
  if (
    normalized.includes("analisar") ||
    normalized.includes("analise") ||
    normalized.includes("orquestrar") ||
    normalized.includes("delegar") ||
    normalized.includes("executar") ||
    normalized.includes("auditar")
  ) {
    return "orchestrator";
  }
  return "help";
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

export function buildSuggestedAgentReply(agents: Agent[]) {
  const suggested = agents
    .filter((agent) => normalizeAgentKey(agent.id ?? "") !== "eiah" && canSuggestAgent(agent))
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

export function buildOrchestratorGuidanceReply() {
  return [
    "Posso analisar esse fluxo com você e indicar o próximo passo mais seguro.",
    "",
    "Para eu te ajudar melhor, descreva em uma frase:",
    "- o objetivo que você quer alcançar",
    "- em que etapa você está agora",
    "- se existe risco, bloqueio ou decisão pendente",
    "",
    "Com isso, eu consigo sugerir se vale analisar, simular, executar ou encaminhar para um especialista.",
  ].join("\n");
}

export function buildEiahQuickReplies(params: { routeIntent: LauncherRouteIntent | "legal_handoff"; proposalMode: boolean }) {
  if (params.proposalMode || params.routeIntent === "proposal") {
    return [
      "Tenho 3 usuários e 2000 runs/mês. Qual plano?",
      "Quero abrir proposta comercial.",
      "Quero agendar demonstração.",
    ];
  }

  if (params.routeIntent === "orchestrator") {
    return [
      "Qual agente devo usar?",
      "Analise este fluxo e recomende o próximo passo.",
      "Quero auditar esse processo.",
    ];
  }

  if (params.routeIntent === "legal_handoff") {
    return [
      "Quero revisar um contrato.",
      "Quais dados preciso enviar?",
      "Quais riscos contratuais comuns?",
    ];
  }

  if (params.routeIntent === "imob") {
    return [
      "Como funciona IMOB do início ao fim?",
      "Onde acompanho pipeline e etapas no IMOB?",
      "Quero instalar o IMOB no workspace.",
    ];
  }

  return [
    "O que o EIAH pode fazer por mim?",
    "Como criar um run no EIAH?",
    "Como funciona o billing?",
  ];
}

export function buildImobQuickRepliesForInput(input: string) {
  const stage = resolveImobJourneyStage(input);
  switch (stage?.stage) {
    case "compra":
      return ["Estou na busca", "Quero fazer proposta", "Preciso revisar documentação"];
    case "venda":
      return ["Estou em captação", "Quero anunciar", "Recebi proposta"];
    case "locacao":
      return ["Quero anunciar locação", "Preciso de garantia", "Quero revisar contrato"];
    case "captacao":
      return ["Captar para venda", "Captar para locação", "Organizar proposta"];
    case "leilao":
      return ["Quero analisar edital", "Quero entender riscos", "Quero calcular custo total"];
    case "proposta":
      return ["É proposta de compra", "É proposta de venda", "É proposta de locação"];
    default:
      return ["Como funciona IMOB do início ao fim?", "Onde acompanho pipeline e etapas no IMOB?", "Quero instalar o IMOB no workspace."];
  }
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

export function buildInputPlaceholderForContext(params: {
  routeIntent: LauncherRouteIntent | "legal_handoff";
  input?: string | null;
}) {
  const resolvedVerticalContext = params.input ? resolveConversationVerticalContext(params.input) : null;

  if (resolvedVerticalContext?.vertical === "LEGAL") {
    switch (resolvedVerticalContext.stage) {
      case "contract_review":
        return "Ex.: quero revisar contrato de locação com foco em multa e rescisão";
      case "clause_review":
        return "Ex.: quero analisar a cláusula de responsabilidade deste contrato";
      case "legal_risk":
        return "Ex.: quero entender os principais riscos jurídicos deste documento";
      case "document_intake":
        return "Ex.: tenho só uma cláusula e quero saber o que falta para analisar";
      case "real_estate_legal":
        return "Ex.: quero revisar matrícula, posse e cláusulas de contrato imobiliário";
      default:
        return "Ex.: quero revisar um contrato e entender o ponto de risco principal";
    }
  }

  if (params.routeIntent === "imob") {
    const stage = params.input ? resolveImobJourneyStage(params.input) : null;
    switch (stage?.stage) {
      case "compra":
        return "Ex.: estou na etapa de proposta para compra de apartamento";
      case "venda":
        return "Ex.: recebi proposta para venda de casa e quero organizar os próximos passos";
      case "locacao":
        return "Ex.: quero anunciar locação de apartamento e entender a garantia";
      case "captacao":
        return "Ex.: estou em captação para venda de imóvel residencial";
      case "leilao":
        return "Ex.: quero analisar edital de imóvel em leilão";
      default:
        return "Ex.: estou na etapa de proposta para venda de apartamento";
    }
  }

  if (params.routeIntent === "legal_handoff") {
    const stage = params.input ? resolveLegalJourneyStage(params.input) : null;
    switch (stage?.stage) {
      case "contract_review":
        return "Ex.: quero revisar contrato de locação com foco em multa e rescisão";
      case "clause_review":
        return "Ex.: quero analisar a cláusula de responsabilidade deste contrato";
      case "legal_risk":
        return "Ex.: quero entender os principais riscos jurídicos deste documento";
      case "document_intake":
        return "Ex.: tenho só uma cláusula e quero saber o que falta para analisar";
      case "real_estate_legal":
        return "Ex.: quero revisar matrícula, posse e cláusulas de contrato imobiliário";
      default:
        return "Ex.: quero revisar contrato de locação com foco em multa e rescisão";
    }
  }

  return "Descreva o objetivo, contexto e restricoes...";
}

export function isLegalRoutingQuestion(input: string) {
  const normalized = normalizeIntentText(input);
  const patterns = [
    "contrato",
    "clausula",
    "parecer",
    "juridico",
    "termo aditivo",
    "minuta",
    "aluguel",
    "aluguem",
    "locacao",
    "locaçao",
    "locacacao",
    "venda",
    "imovel",
    "imoveis",
    "imobiliario",
    "sala comercial",
  ];
  const tokenHits = patterns.filter((pattern) => normalized.includes(pattern)).length;
  if (tokenHits > 0) return true;
  const hasContractLike = normalized.includes("contrat");
  const hasRentOrSaleLike =
    normalized.includes("alugu") ||
    normalized.includes("loca") ||
    normalized.includes("vend") ||
    normalized.includes("imov") ||
    normalized.includes("sala comerc");
  return hasContractLike && hasRentOrSaleLike;
}

function isAgentPresentationQuestion(input: string) {
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

export function buildLauncherClarificationPrompt(params: {
  agentProfile: Agent | null;
  routeIntent: LauncherRouteIntent;
  trimmedInput: string;
  confidence: number;
}) {
  if (isAgentPresentationQuestion(params.trimmedInput)) return null;
  if (isEiahCapabilitiesQuestion(params.trimmedInput)) return null;
  if (isLegalRoutingQuestion(params.trimmedInput)) return null;
  if (
    (params.routeIntent === "help" || params.routeIntent === "playbook" || params.routeIntent === "imob") &&
    isDirectAnswerFriendlyQuestion(params.trimmedInput)
  ) {
    return null;
  }
  const clarificationPolicy = params.agentProfile?.uxContract?.clarificationPolicy ?? "minimal";
  const ambiguityStrategy = params.agentProfile?.cognitiveProfile?.ambiguityStrategy ?? "infer_conservatively";
  if (params.confidence >= 0.6 && ambiguityStrategy !== "ask_first") return null;
  if ((params.routeIntent === "help" || params.routeIntent === "playbook" || params.routeIntent === "imob") && params.confidence >= 0.45) return null;
  if (clarificationPolicy === "minimal" && ambiguityStrategy !== "ask_first") return null;

  const defaultCta = params.agentProfile?.uxContract?.defaultCTA?.trim();
  const ctaLine = defaultCta ? `\n\n**Próximo passo**\n${defaultCta}` : "";
  if (params.routeIntent === "proposal") {
    return [
      "**Preciso de uma clarificação rápida**",
      "Para evitar estimativa errada, confirme apenas o mínimo necessário:",
      "",
      "- Quantos usuários terão acesso?",
      "- Quantos runs/mês você estima?",
      ctaLine,
    ]
      .filter(Boolean)
      .join("\n");
  }
  if (clarificationPolicy === "strict") {
    return [
      "**Preciso de uma clarificação antes de avançar**",
      `Seu pedido foi: "${params.trimmedInput}".`,
      "",
      "Responda em uma frase dizendo:",
      "- objetivo principal",
      "- contexto ou página envolvida",
      "- resultado esperado",
      ctaLine,
    ]
      .filter(Boolean)
      .join("\n");
  }
  return [
    "**Quero confirmar o foco da resposta**",
    "Escolha uma direção para eu responder com mais precisão:",
    "",
    "- explicar rapidamente",
    "- montar próximos passos",
    "- avaliar risco ou decisão",
    ctaLine,
  ]
    .filter(Boolean)
    .join("\n");
}

function isRelatedToEiahTopic(input: string) {
  const normalized = normalizeIntentText(input);
  const productTerms = [
    "runs",
    "run",
    "agentes",
    "agente",
    "billing",
    "invoice",
    "imob",
    "marketplace",
    "perfil",
    "self-service",
    "site",
    "plataforma",
    "eiah",
  ];
  const proposalTerms = [
    "plano",
    "preco",
    "preço",
    "usuarios",
    "usuários",
    "runs/mes",
    "runs/mês",
    "trial",
    "demonstracao",
    "demonstração",
    "proposta",
  ];
  const usageTerms = ["como", "onde", "status", "simular", "rodar", "exemplo", "riscos", "proximos passos"];
  return [...productTerms, ...proposalTerms, ...usageTerms].some((term) => normalized.includes(term));
}

function isFlowGuidanceQuestion(input: string) {
  const normalized = normalizeIntentText(input);
  return (
    normalized.includes("analise este fluxo") ||
    normalized.includes("analise esse fluxo") ||
    normalized.includes("recomende o proximo passo") ||
    normalized.includes("recomende o próximo passo")
  );
}

function isAgentSignupHelpQuestion(input: string) {
  const normalized = normalizeIntentText(input);
  return (
    (normalized.includes("assinar") || normalized.includes("ativar") || normalized.includes("instalar")) &&
    (normalized.includes("agente") || normalized.includes("agentes") || normalized.includes("marketplace"))
  );
}

function buildAgentSignupHelpReply() {
  return [
    "Para assinar ou ativar agentes no workspace, o caminho mais rápido é este:",
    "",
    "1. Abra `Marketplace` no menu principal.",
    "2. Procure o agente que você quer usar.",
    "3. Revise descrição, caso de uso e disponibilidade para o workspace.",
    "4. Ative ou assine o agente no catálogo.",
    "5. Volte para `Agentes` ou `Runs` para começar a usar.",
    "",
    "Se quiser, eu também posso te dizer qual agente faz mais sentido para o seu caso antes da assinatura.",
  ].join("\n");
}

function isPlatformSelfExplainQuestion(input: string) {
  const normalized = normalizeIntentText(input);
  const signals = [
    "o que e o eiah",
    "o que eh o eiah",
    "preciso entender o que o eiah e",
    "me explique o que e o eiah",
    "entender o que o eiah e",
    "fala de voce",
    "qual agente esta aqui",
    "qual agente está aqui",
    "quem esta falando comigo",
    "quem está falando comigo",
    "quem esta aqui",
    "quem está aqui",
    "qual agente esta ativo",
    "qual agente está ativo",
  ];
  return signals.some((signal) => normalized.includes(signal));
}

function buildPlatformSelfExplainReply(agentProfile: Agent | null) {
  const displayName = getAgentDisplayName(agentProfile);
  return [
    `${displayName} é o assistente principal da plataforma.`,
    "",
    "Eu existo para te ajudar a entender o produto, navegar pelas páginas, organizar o próximo passo e te encaminhar para o especialista certo quando o caso pedir profundidade maior.",
    "",
    "Na prática, eu costumo ajudar melhor quando você quer:",
    "- entender o que dá para fazer no site",
    "- descobrir qual página ou agente usar",
    "- seguir um passo a passo rápido sem cair em burocracia",
    "",
    "Se quiser, me diga o que você quer resolver e eu sigo pelo caminho mais direto.",
  ].join("\n");
}

function isInternalTechnicalAccessQuestion(input: string) {
  const normalized = normalizeIntentText(input);
  const codeSignals = [
    "clonar os codigos internos",
    "clonar os codigos",
    "acessar os codigos internos",
    "codigo interno",
    "codigo fonte",
    "repositorio interno",
    "repositorio privado",
  ];
  return codeSignals.some((signal) => normalized.includes(signal));
}

function buildInternalTechnicalAccessReply() {
  return [
    "Eu não consigo liberar acesso aos códigos internos por aqui.",
    "",
    "Se você precisa desse tipo de acesso, o caminho correto é contatar o Admin do workspace ou o responsável interno pela administração da plataforma.",
    "",
    "Se quiser, eu posso te ajudar a identificar se a sua necessidade é de uso da plataforma, documentação ou acesso administrativo.",
  ].join("\n");
}

function isDocumentationExplainQuestion(input: string) {
  const normalized = normalizeIntentText(input);
  const signals = [
    "base interna documental",
    "documentacao interna do eiah",
    "documentacao do eiah",
    "consulta da base interna documental do eiah",
    "guia do usuario",
    "guia do usuário",
  ];
  return signals.some((signal) => normalized.includes(signal));
}

function buildDocumentationExplainReply() {
  return [
    "A base documental do EIAH reúne guias, playbooks e referências internas para explicar como a plataforma funciona.",
    "",
    "Ela serve principalmente para:",
    "- orientar páginas e fluxos",
    "- responder dúvidas de uso com base interna",
    "- mostrar próximos passos sem inventar funcionalidade",
    "",
    "Se você quiser, eu posso resumir uma área específica, como Runs, Billing, Marketplace, IMOB ou Agentes.",
  ].join("\n");
}

function isHostileInput(input: string) {
  const normalized = normalizeIntentText(input);
  const signals = [
    "filho da puta",
    "fdp",
    "vai se foder",
    "vai tomar no cu",
    "puta que pariu",
    "caralho",
    "merda",
    "idiota",
    "imbecil",
    "otario",
    "otário",
    "burro",
  ];
  return signals.some((signal) => normalized.includes(signal));
}

function buildHostileInputReply() {
  return [
    "Posso continuar te ajudando, mas preciso que você me diga o que quer resolver.",
    "",
    "Se quiser seguir, me diga sua dúvida sobre a plataforma e eu respondo de forma direta.",
  ].join("\n");
}

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

function isAgentExplainQuestion(normalized: string) {
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

function resolveSpecialistExplainTarget(input: string) {
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

function buildAgentExplainReply(agents: Agent[], definition: SpecialistExplainDefinition) {
  const availability = resolveSpecialistAvailability(agents, definition.hints);
  const agent = availability.agent;
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
  const availabilityLine = availability.canReceiveHandoff
    ? `Se fizer sentido, eu também posso te encaminhar para ${displayName} neste workspace.`
    : `${displayName} não está disponível para transferência neste workspace no momento.`;

  return [
    `${displayName} é ${definition.summary} na plataforma.`,
    "",
    capabilities.map((item) => `- ${item}`).join("\n"),
    whenToUse.length > 0
      ? `\nQuando vale usar:\n${whenToUse.map((item) => `- ${item}`).join("\n")}`
      : "",
    "",
    availabilityLine,
  ]
    .filter(Boolean)
    .join("\n");
}

function isLegalDataCollectionQuestion(input: string) {
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

function buildLegalDataCollectionReply(input: string) {
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
  if (normalized.startsWith("pontos sensiveis") || normalized.startsWith("pontos sensíveis") || normalized.startsWith("ponto sensivel") || normalized.startsWith("ponto sensível")) {
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

function buildLegalContextEntryReply(params: { legalAgent: Agent | null; isAvailable: boolean; input: string }) {
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

function buildLegalHandoffReply(params: { legalAgent: Agent | null; isAvailable: boolean; input: string }) {
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

function buildDeterministicImobReply() {
  return [
    "**IMOB — guia rápido**",
    "",
    "O IMOB organiza a operacao imobiliaria com apoio de IA: leads, proposta, contrato e acompanhamento do processo comercial.",
    "",
    "Ele ajuda o time a enxergar a jornada, reduzir retrabalho e decidir o próximo passo com mais contexto.",
    "",
    "**Como usar**",
    "1. Abra o dashboard do IMOB para visualizar pipeline e contexto da operacao.",
    "2. Use o chat IMOB para orientar a proxima acao com base no caso atual.",
    "3. Acompanhe a evolucao das etapas com rastreabilidade.",
    "4. Revise resultados e gargalos para melhorar a rotina do time.",
    "",
    "**Atalhos**",
    "- Dashboard IMOB: `/app/imob/dashboard`",
    "- Chat IMOB: `/app/imob/chat`",
    "- Instalacao (se necessario): `/app/marketplace/imob`",
  ].join("\n");
}

function buildImobFaqReply(seed: ImobFaqSeed) {
  const handoffLine =
    seed.handoffHint === "legal"
      ? "\nSe a dúvida avançar para edital, matrícula, cláusula, contrato ou risco jurídico, eu também posso te encaminhar para o Jurídico."
      : "";
  return [
    seed.answerShort,
    "",
    seed.nextQuestion,
    handoffLine,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildImobJourneyReply(stage: ImobJourneyDefinition) {
  const handoffLine = stage.eligibleSpecialists.includes("legal")
    ? "\nSe a conversa avançar para cláusulas, contrato, edital, matrícula ou risco jurídico, eu posso te encaminhar para o Jurídico."
    : "";
  return [
    stage.answerShort,
    "",
    stage.nextQuestion,
    handoffLine,
    "Posso te guiar pelo dashboard do IMOB ou seguir aqui pela conversa.",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildImobContextEntryReply(input: string) {
  const faq = resolveImobFaqSeed(input);
  if (faq) return buildImobFaqReply(faq);

  const stage = resolveImobJourneyStage(input);
  if (stage) return buildImobJourneyReply(stage);

  return [
    "Refere-se a imóveis?",
    "",
    "Se sim, eu posso te ajudar a organizar a jornada imobiliária com mais clareza, por exemplo em:",
    "- captação",
    "- compra",
    "- venda",
    "- locação",
    "- proposta",
    "- imóvel em leilão",
    "",
    "Se quiser seguir, me diga em que etapa você está agora: busca, captação, proposta, negociação, contrato ou fechamento.",
  ].join("\n");
}

function buildDeterministicPlaybookReply() {
  return [
    "**Resumo**",
    "O EIAH te ajuda a entender a plataforma e seguir o melhor caminho para cada tarefa.",
    "",
    "**O que eu cubro aqui**",
    "- orientação sobre Runs, Agentes, Billing, Marketplace, IMOB, Self-service e Perfil",
    "- ajuda passo a passo para usar páginas e fluxos",
    "- apoio comercial para proposta, plano e estimativa",
    "- encaminhamento para especialistas quando fizer mais sentido",
    "",
    "Se você quiser, me diga o que está tentando resolver e eu já te respondo do jeito mais direto.",
  ].join("\n");
}

function buildDeterministicHelpReply(input: string): string | null {
  const normalized = normalizeIntentText(input);
  if (
    normalized.includes("selecione um agente") ||
    normalized.includes("escolher um agente") ||
    normalized.includes("escolher agente") ||
    normalized.includes("por que escolher um agente") ||
    normalized.includes("qual a vantagem de escolher um agente") ||
    normalized.includes("o que eu ganho ao escolher um agente") ||
    normalized.includes("quando escolher um agente")
  ) {
    return [
      "Escolher um agente te dá foco no domínio certo.",
      "",
      "Sem escolher, você pode falar comigo no EIAH e eu faço a triagem: explico a plataforma, entendo a intenção e te encaminho quando necessário.",
      "",
      "Escolhendo um especialista, você ganha:",
      "- respostas mais curtas e específicas no tema certo",
      "- menos triagem e menos ambiguidade",
      "- mais profundidade no domínio escolhido",
      "",
      "Na prática:",
      "- J_360: contratos, cláusulas e risco jurídico",
      "- FinNexus: pagamentos, pendências e conciliação",
      "- Guardian: evidências, integridade e verificabilidade",
      "- AADV: consolidação de evidências e próximos passos executivos",
      "- DeFi One: simulação DeFi, custo e risco",
      "",
      "Se você ainda não souber qual agente usar, pode começar comigo no EIAH que eu direciono a conversa pelo caminho mais útil.",
    ].join("\n");
  }
  if (
    normalized.includes("acompanho o status") ||
    normalized.includes("acompanhar status") ||
    normalized.includes("status de uma run") ||
    normalized.includes("status em tempo real")
  ) {
    return [
      "**Como acompanhar status de run em tempo real**",
      "",
      "1. Abra `Runs` e selecione a execução que deseja acompanhar.",
      "2. Observe os indicadores de andamento (em execução, sucesso, falha ou bloqueio).",
      "3. Use o botão de atualizar para recarregar eventos recentes quando necessário.",
      "4. Abra o resultado da run para validar saída, evidências e próximo passo.",
      "",
      "**Atalhos**",
      "- `/app/runs#runs-status`",
      "- `/app/runs#runs-resultado`",
    ].join("\n");
  }
  if (normalized.includes("como criar um run") || (normalized.includes("criar") && normalized.includes("run"))) {
    return [
      "**Como criar um run no EIAH**",
      "",
      "1. Abra `Runs` no menu principal.",
      "2. Escolha o agente que vai executar a tarefa.",
      "3. Escreva o objetivo em linguagem simples no campo de entrada.",
      "4. Comece por **Simular primeiro** para validar sem risco.",
      "5. Se o resultado estiver ok, clique em **Rodar agora**.",
      "6. Acompanhe status, custo e resultado no histórico da própria página.",
      "",
      "**Atalho**",
      "- `/app/runs#runs-criar`",
    ].join("\n");
  }
  if (normalized.includes("billing") || normalized.includes("invoice") || normalized.includes("cobranca")) {
    return [
      "No EIAH, o billing reúne o uso do workspace e transforma isso em custo mensal.",
      "",
      "Você consegue ver:",
      "- resumo do plano",
      "- uso de runs e usuários",
      "- invoices e cobranças",
      "",
      "Se quiser consultar isso agora, o melhor caminho é abrir `Billing` em `/app/billing`.",
    ].join("\n");
  }
  if (normalized.includes("endpoint") || normalized.includes("api")) {
    return [
      "**API no EIAH (visão rápida)**",
      "",
      "- Runs: execução, eventos e histórico.",
      "- Billing: resumo, usage, quote e invoices.",
      "- Help: consulta da base interna documental do EIAH.",
      "",
      "**Exemplos**",
      "- `/api/runs/*`",
      "- `/api/billing/*`",
      "- `/api/help/eiah/query`",
    ].join("\n");
  }
  if (
    normalized.includes("exemplo pratico") ||
    normalized === "mostre um exemplo" ||
    normalized === "mostre um exemplo pratico"
  ) {
    return [
      "Claro. Um exemplo simples seria este:",
      "",
      "Você me diz algo como `quero criar um run para analisar um caso comercial`.",
      "A partir disso, eu te mostro onde fazer isso, qual agente usar e qual é o próximo passo mais seguro.",
      "",
      "Também posso te ajudar com coisas como criar runs, escolher agentes, revisar billing, orientar IMOB ou montar proposta comercial.",
    ].join("\n");
  }
  if (normalized.includes("riscos comuns") || normalized.includes("quais riscos")) {
    return [
      "Os riscos mais comuns são estes:",
      "",
      "- escolher o agente errado para o objetivo",
      "- executar sem simular quando o caso ainda é novo",
      "- pedir algo amplo demais sem dizer o resultado esperado",
      "- avançar em fluxo sensível sem revisar risco ou aprovação",
    ].join("\n");
  }
  if (normalized.includes("proximos passos") || normalized.includes("próximos passos")) {
    return [
      "Os próximos passos dependem do que você quer resolver, mas o caminho mais comum é:",
      "",
      "1. definir o objetivo principal",
      "2. escolher a área certa: Runs, Agentes, Billing, IMOB ou proposta",
      "3. seguir o próximo passo guiado pelo launcher",
    ].join("\n");
  }
  return null;
}

function buildDeterministicAgentOverviewReply(agentProfile: Agent | null) {
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

function buildAgentCapabilitiesReply(agentProfile: Agent | null) {
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

function buildJuridicoGuidanceReply(input: string, agentProfile: Agent | null) {
  const normalized = normalizeIntentText(input);
  if (
    normalized.includes("revisar contrato") ||
    normalized === "quero revisar um contrato" ||
    normalized === "voce pode revisar um contrato" ||
    normalized === "você pode revisar um contrato"
  ) {
    return [
      "Sim. Posso ajudar a revisar cláusulas, identificar riscos, apontar lacunas e organizar os pontos principais para análise.",
      "",
      "Se quiser seguir, envie o contrato, a cláusula ou descreva o ponto que você quer avaliar primeiro.",
    ].join("\n");
  }

  if (
    normalized.includes("locacao") ||
    normalized.includes("locação") ||
    normalized.includes("aluguel")
  ) {
    return [
      "Em contrato de locação, eu costumo olhar primeiro:",
      "",
      "- prazo, reajuste e garantias",
      "- multa, rescisão e aviso prévio",
      "- obrigações das partes e condições de uso do imóvel",
      "",
      "Se quiser, me envie o contrato ou a cláusula que você quer revisar.",
    ].join("\n");
  }

  if (
    normalized.includes("compra e venda") ||
    (normalized.includes("compra") && normalized.includes("venda"))
  ) {
    return [
      "Em contrato de compra e venda, eu posso revisar principalmente:",
      "",
      "- objeto, preço e forma de pagamento",
      "- prazo, entrega e responsabilidade",
      "- multa, rescisão e penalidades",
      "",
      "Se quiser, me diga o ponto mais sensível ou envie a cláusula que você quer analisar.",
    ].join("\n");
  }

  if (
    normalized.includes("prestacao de servico") ||
    normalized.includes("prestação de serviço") ||
    normalized.includes("prestacao de serviços") ||
    normalized.includes("prestação de serviços")
  ) {
    return [
      "Em contrato de prestação de serviços, eu costumo revisar:",
      "",
      "- escopo, entregáveis e critério de aceite",
      "- prazo, pagamento e responsabilidade",
      "- confidencialidade, multa e rescisão",
      "",
      "Se quiser, me diga se a dúvida está no escopo, no pagamento, na multa ou na saída contratual.",
    ].join("\n");
  }

  if (
    normalized.includes("falta") ||
    normalized.includes("faltando") ||
    normalized.includes("lacuna") ||
    normalized.includes("documento")
  ) {
    return [
      "Posso te ajudar a identificar o que está faltando para uma análise jurídica melhor.",
      "",
      "Normalmente eu olho se faltam:",
      "- tipo de contrato e objetivo da análise",
      "- cláusula exata ou trecho problemático",
      "- prazo, responsabilidade, multa ou forma de pagamento",
      "- contexto mínimo da relação entre as partes",
      "",
      "Se quiser, me envie o trecho disponível e eu aponto as lacunas principais.",
    ].join("\n");
  }

  if (normalized.includes("risco")) {
    return [
      "Em contratos, os riscos mais comuns costumam estar em:",
      "",
      "- obrigação mal definida entre as partes",
      "- prazo, multa e rescisão pouco claros",
      "- cláusulas que deixam lacunas sobre responsabilidade e pagamento",
      "- documentos ou anexos que deveriam existir, mas não foram informados",
      "",
      agentProfile?.chatCopy?.defaultNextStep?.trim() || "Se quiser, me diga o contrato e o ponto sensível que você quer revisar.",
    ].join("\n");
  }

  if (normalized.includes("clausula") || normalized.includes("cláusula")) {
    return [
      "Para revisar cláusulas críticas, eu costumo olhar primeiro:",
      "",
      "- objeto do contrato",
      "- prazo e renovação",
      "- pagamento, reajuste e multa",
      "- rescisão e responsabilidades",
      "",
      "Se você quiser, envie a cláusula ou descreva o contrato e eu te digo o que observar.",
    ].join("\n");
  }

  return [
    "Posso ajudar com revisão contratual, análise de cláusulas, riscos jurídicos, lacunas documentais e organização do pedido jurídico.",
    "",
    "Para eu te orientar melhor, envie pelo menos:",
    "- o contrato, a cláusula ou o trecho que você quer analisar",
    "- o tipo de contrato e as partes envolvidas, se souber",
    "- o ponto de dúvida, risco ou decisão que você quer revisar",
    "",
    agentProfile?.chatCopy?.defaultNextStep?.trim() || "Se quiser, já me diga o contrato e o objetivo da análise.",
  ].join("\n");
}

function resolveJ360AgentProfile(agentProfile: Agent | null, input: string): Agent | null {
  const legalContext = resolveLegalSpecialtyContext(j360Profile, {
    vertical:
      /imob|imovel|imóvel|locacao|locação|aluguel|matricula|matrícula|posse|corretagem|distrato|incorporacao|incorporação/.test(
        normalizeIntentText(input),
      )
        ? "imob"
        : null,
    intent: normalizeIntentText(input),
    userText: input,
  });

  if (!agentProfile || !legalContext.resolvedChatCopy) {
    return agentProfile;
  }

  return {
    ...agentProfile,
    chatCopy: {
      ...agentProfile.chatCopy,
      ...legalContext.resolvedChatCopy,
      blockedMessages: {
        ...agentProfile.chatCopy?.blockedMessages,
        ...legalContext.resolvedChatCopy.blockedMessages,
      },
    },
  };
}

function buildFinNexusGuidanceReply(input: string, agentProfile: Agent | null) {
  const normalized = normalizeIntentText(input);
  if (
    normalized.includes("concil") ||
    normalized.includes("extrato") ||
    normalized.includes("banco")
  ) {
    return [
      "Para orientar uma conciliação bancária, eu costumo olhar primeiro:",
      "",
      "- lançamentos esperados e realizados",
      "- diferença de valor, data ou documento",
      "- comprovantes, boletos, notas ou contratos vinculados",
      "- itens sem correspondência clara no ledger",
      "",
      "Se quiser, me diga qual divergência você encontrou e eu te digo o que conferir primeiro.",
    ].join("\n");
  }

  if (
    normalized.includes("pagamento") ||
    normalized.includes("boleto") ||
    normalized.includes("nota") ||
    normalized.includes("fatura")
  ) {
    return [
      "Para revisar um pagamento com segurança, eu preciso confirmar pelo menos:",
      "",
      "- documento principal envolvido",
      "- valor e vencimento",
      "- favorecido ou contraparte",
      "- o ponto de dúvida ou bloqueio",
      "",
      agentProfile?.chatCopy?.defaultNextStep?.trim() ||
        "Se quiser, me diga o documento e a dúvida financeira que eu sigo por aí.",
    ].join("\n");
  }

  if (normalized.includes("pendencia") || normalized.includes("prioriz")) {
    return [
      "Para priorizar pendências financeiras, eu começo por esta ordem:",
      "",
      "- itens vencidos ou próximos do vencimento",
      "- pagamentos sem documentação suficiente",
      "- divergências entre documento, registro e conciliação",
      "- casos com impacto financeiro maior ou risco operacional",
      "",
      agentProfile?.chatCopy?.defaultNextStep?.trim() ||
        "Se quiser, me diga a pendência e eu te ajudo a priorizar.",
    ].join("\n");
  }

  return [
    "Posso te ajudar a organizar uma análise financeira inicial desse caso.",
    "",
    "Para eu te orientar melhor, envie pelo menos:",
    "- qual pagamento, documento ou pendência você quer revisar",
    "- valor ou vencimento, se houver",
    "- o risco, bloqueio ou decisão que precisa tomar",
    "",
    agentProfile?.chatCopy?.defaultNextStep?.trim() ||
      "Se quiser, já me diga o documento ou pendência financeira e eu sigo daí.",
  ].join("\n");
}

function buildGuardianGuidanceReply(input: string, agentProfile: Agent | null) {
  const normalized = normalizeIntentText(input);
  if (
    normalized.includes("exemplo") ||
    normalized.includes("pratico") ||
    normalized.includes("prático")
  ) {
    return [
      "Um exemplo simples seria este:",
      "",
      "Você quer comprovar que uma execução gerou um artefato verificável.",
      "Eu te ajudo a checar se existe receipt, verify_url e trilha mínima de integridade antes de prosseguir.",
      "",
      "Se faltar algum desses itens, eu te digo exatamente o que precisa ser regularizado.",
    ].join("\n");
  }

  if (normalized.includes("receipt") || normalized.includes("verify")) {
    return [
      "Para validar receipt e verify_url com segurança, eu costumo confirmar:",
      "",
      "- se existe receipt vinculando a execução ou evidência",
      "- se o verify_url está presente e utilizável",
      "- se a trilha de integridade está coerente com o contexto",
      "",
      agentProfile?.chatCopy?.defaultNextStep?.trim() ||
        "Se quiser, me envie o receipt ou verify_url que eu reviso com você.",
    ].join("\n");
  }

  if (normalized.includes("pii") || normalized.includes("lgpd")) {
    return [
      "No Guardian, PII nunca deve seguir para trilha pública ou artefato ancorado.",
      "",
      "Se houver dado pessoal sensível, o correto é bloquear, sanitizar e preservar apenas o que for compatível com a política de integridade e auditoria.",
    ].join("\n");
  }

  return [
    "Posso te ajudar a validar evidência, integridade e verificabilidade desse caso.",
    "",
    "Para eu te orientar melhor, envie pelo menos:",
    "- qual evidência, receipt ou verify_url você quer revisar",
    "- qual é a dúvida principal",
    "- se existe bloqueio, risco ou exigência de auditoria",
    "",
    agentProfile?.chatCopy?.defaultNextStep?.trim() ||
      "Se quiser, me diga a evidência ou receipt que eu sigo por aí.",
  ].join("\n");
}

function buildAadvGuidanceReply(input: string, agentProfile: Agent | null) {
  const normalized = normalizeIntentText(input);

  if (
    normalized.includes("exemplo pratico") ||
    normalized.includes("exemplo prático") ||
    normalized === "mostre um exemplo pratico" ||
    normalized === "mostre um exemplo prático"
  ) {
    return [
      "Um exemplo simples seria este:",
      "",
      "Você quer consolidar um caso com valor esperado, riscos e evidências mínimas para decisão.",
      "Eu te ajudo a separar o que já existe, o que está faltando e qual bloco precisa ser completado primeiro.",
      "",
      "A partir disso, fica mais fácil montar um resumo executivo auditável sem perder contexto.",
    ].join("\n");
  }

  if (normalized.includes("riscos comuns") || normalized.includes("quais riscos")) {
    return [
      "Os riscos mais comuns nesse tipo de consolidação são:",
      "",
      "- decidir com evidências incompletas de FinOps ou segurança",
      "- misturar hipótese com dado validado",
      "- avançar sem confirmar RBAC, reconciliação ou trilha assinada",
      "- consolidar resumo executivo sem deixar claro o que ainda falta",
    ].join("\n");
  }

  if (normalized.includes("proximos passos") || normalized.includes("próximos passos")) {
    return [
      "Os próximos passos mais úteis costumam ser estes:",
      "",
      "1. identificar qual bloco está faltando",
      "2. reunir a evidência mínima de FinOps, segurança ou operação",
      "3. consolidar o resumo executivo só depois de validar as lacunas",
    ].join("\n");
  }

  if (normalized.includes("bloco faltante") || normalized.includes("consolidar")) {
    return [
      "Se o objetivo é completar o bloco faltante, eu sugiro começar por:",
      "",
      "- qual evidência está ausente",
      "- qual risco depende dessa confirmação",
      "- qual decisão precisa ser tomada depois da consolidação",
      "",
      agentProfile?.chatCopy?.defaultNextStep?.trim() ||
        "Se quiser, me diga qual bloco falta e eu organizo o próximo passo.",
    ].join("\n");
  }

  return [
    "Posso te ajudar a organizar esse caso em blocos claros de evidência, risco e decisão.",
    "",
    "Para eu te orientar melhor, me diga pelo menos:",
    "- qual bloco você quer consolidar",
    "- qual evidência já existe",
    "- qual risco, dúvida ou decisão está travando o caso",
    "",
    agentProfile?.chatCopy?.defaultNextStep?.trim() ||
      "Se quiser, me diga qual bloco está faltando e eu sigo daí.",
  ].join("\n");
}

export function resolveJuridicoDecision(params: {
  input: string;
  agentProfile: Agent | null;
  intentUnknown: boolean;
}): SpecialistDecision {
  const input = params.input.trim();
  const normalized = normalizeIntentText(input);
  const resolvedAgentProfile = resolveJ360AgentProfile(params.agentProfile, input);

  if (isPresentationQuestion(input)) {
    return {
      kind: "self_intro",
      shouldCreateRun: false,
      content: buildDeterministicAgentOverviewReply(resolvedAgentProfile) ?? buildAgentCapabilitiesReply(resolvedAgentProfile),
      presentationRouteIntent: "self_intro",
      renderVariant: "self_intro",
    };
  }

  if (
    normalized.includes("o que voce pode fazer") ||
    normalized.includes("como voce pode me ajudar") ||
    normalized.includes("especialidades") ||
    normalized.includes("capacidades")
  ) {
    return {
      kind: "capabilities_summary",
      shouldCreateRun: false,
      content: buildAgentCapabilitiesReply(resolvedAgentProfile),
      presentationRouteIntent: "capabilities_summary",
      renderVariant: "simple_help",
    };
  }

  if (
    normalized.includes("contrato") ||
    normalized.includes("clausula") ||
    normalized.includes("cláusula") ||
    normalized.includes("parecer") ||
    normalized.includes("risco") ||
    normalized.includes("locacao") ||
    normalized.includes("locação") ||
    normalized.includes("aluguel") ||
    normalized.includes("venda")
  ) {
    return {
      kind: "specialist_guidance",
      shouldCreateRun: false,
      content: buildJuridicoGuidanceReply(input, resolvedAgentProfile),
      presentationRouteIntent: "help",
      renderVariant: "simple_help",
    };
  }

  if (params.intentUnknown) {
    return {
      kind: "contextual_fallback",
      shouldCreateRun: false,
      content:
        "Posso te ajudar com contratos, cláusulas, riscos jurídicos e organização da análise. Se você me disser o tipo de contrato ou o ponto que quer revisar, eu sigo de forma mais direta.",
      presentationRouteIntent: "help",
      renderVariant: "simple_help",
    };
  }

  return {
    kind: "needs_run",
    shouldCreateRun: true,
    presentationRouteIntent: "help",
    renderVariant: "guided_flow",
  };
}

export function resolveFinNexusDecision(params: {
  input: string;
  agentProfile: Agent | null;
  intentUnknown: boolean;
}): SpecialistDecision {
  const input = params.input.trim();
  const normalized = normalizeIntentText(input);

  if (isPresentationQuestion(input)) {
    return {
      kind: "self_intro",
      shouldCreateRun: false,
      content: buildDeterministicAgentOverviewReply(params.agentProfile) ?? buildAgentCapabilitiesReply(params.agentProfile),
      presentationRouteIntent: "self_intro",
      renderVariant: "self_intro",
    };
  }

  if (
    normalized.includes("o que voce pode fazer") ||
    normalized.includes("como voce pode me ajudar") ||
    normalized.includes("especialidades") ||
    normalized.includes("capacidades")
  ) {
    return {
      kind: "capabilities_summary",
      shouldCreateRun: false,
      content: buildAgentCapabilitiesReply(params.agentProfile),
      presentationRouteIntent: "capabilities_summary",
      renderVariant: "simple_help",
    };
  }

  if (isFinanceGuidanceQuestion(input)) {
    return {
      kind: "specialist_guidance",
      shouldCreateRun: false,
      content: buildFinNexusGuidanceReply(input, params.agentProfile),
      presentationRouteIntent: "help",
      renderVariant: "simple_help",
    };
  }

  if (params.intentUnknown) {
    return {
      kind: "contextual_fallback",
      shouldCreateRun: false,
      content:
        "Posso te ajudar com pagamentos, pendências financeiras, documentos de cobrança, conciliação e risco operacional. Se você me disser o pagamento, documento ou pendência, eu sigo de forma mais direta.",
      presentationRouteIntent: "help",
      renderVariant: "simple_help",
    };
  }

  return {
    kind: "needs_run",
    shouldCreateRun: true,
    presentationRouteIntent: "help",
    renderVariant: "guided_flow",
  };
}

export function resolveGuardianDecision(params: {
  input: string;
  agentProfile: Agent | null;
  intentUnknown: boolean;
}): SpecialistDecision {
  const input = params.input.trim();
  const normalized = normalizeIntentText(input);

  if (isPresentationQuestion(input)) {
    return {
      kind: "self_intro",
      shouldCreateRun: false,
      content: buildDeterministicAgentOverviewReply(params.agentProfile) ?? buildAgentCapabilitiesReply(params.agentProfile),
      presentationRouteIntent: "self_intro",
      renderVariant: "self_intro",
    };
  }

  if (
    normalized.includes("o que voce pode fazer") ||
    normalized.includes("como voce pode me ajudar") ||
    normalized.includes("especialidades") ||
    normalized.includes("capacidades") ||
    normalized.includes("o que voce valida")
  ) {
    return {
      kind: "capabilities_summary",
      shouldCreateRun: false,
      content: buildAgentCapabilitiesReply(params.agentProfile),
      presentationRouteIntent: "capabilities_summary",
      renderVariant: "simple_help",
    };
  }

  if (isGuardianGuidanceQuestion(input)) {
    return {
      kind: "specialist_guidance",
      shouldCreateRun: false,
      content: buildGuardianGuidanceReply(input, params.agentProfile),
      presentationRouteIntent: "help",
      renderVariant: "simple_help",
    };
  }

  if (params.intentUnknown) {
    return {
      kind: "contextual_fallback",
      shouldCreateRun: false,
      content:
        "Posso te ajudar com evidências, receipt, verify_url, integridade e trilha de auditoria. Se você me disser qual artefato quer validar, eu sigo de forma mais direta.",
      presentationRouteIntent: "help",
      renderVariant: "simple_help",
    };
  }

  return {
    kind: "needs_run",
    shouldCreateRun: true,
    presentationRouteIntent: "help",
    renderVariant: "guided_flow",
  };
}

export function resolveAadvDecision(params: {
  input: string;
  agentProfile: Agent | null;
  intentUnknown: boolean;
}): SpecialistDecision {
  const input = params.input.trim();
  const normalized = normalizeIntentText(input);

  if (isPresentationQuestion(input)) {
    return {
      kind: "self_intro",
      shouldCreateRun: false,
      content: buildDeterministicAgentOverviewReply(params.agentProfile) ?? buildAgentCapabilitiesReply(params.agentProfile),
      presentationRouteIntent: "self_intro",
      renderVariant: "self_intro",
    };
  }

  if (
    normalized.includes("o que voce pode fazer") ||
    normalized.includes("como voce pode me ajudar") ||
    normalized.includes("especialidades") ||
    normalized.includes("capacidades")
  ) {
    return {
      kind: "capabilities_summary",
      shouldCreateRun: false,
      content: buildAgentCapabilitiesReply(params.agentProfile),
      presentationRouteIntent: "capabilities_summary",
      renderVariant: "simple_help",
    };
  }

  if (isAadvGuidanceQuestion(input)) {
    return {
      kind: "specialist_guidance",
      shouldCreateRun: false,
      content: buildAadvGuidanceReply(input, params.agentProfile),
      presentationRouteIntent: "help",
      renderVariant: "simple_help",
    };
  }

  if (params.intentUnknown) {
    return {
      kind: "contextual_fallback",
      shouldCreateRun: false,
      content:
        "Posso te ajudar a organizar evidências, riscos, FinOps e próximos passos desse caso. Se você me disser qual bloco ou evidência quer consolidar, eu sigo de forma mais direta.",
      presentationRouteIntent: "help",
      renderVariant: "simple_help",
    };
  }

  return {
    kind: "needs_run",
    shouldCreateRun: true,
    presentationRouteIntent: "help",
    renderVariant: "guided_flow",
  };
}

function buildContextualFallback() {
  return "Posso te ajudar a entender a plataforma, explicar páginas e indicar o melhor próximo passo. Se você me disser o objetivo, eu sigo de forma mais direta.";
}

export function resolveEiahDecision(params: {
  input: string;
  routeIntent: LauncherRouteIntent;
  eiahMode: EiahMode;
  agentProfile: Agent | null;
  catalogAgents: Agent[];
  intentUnknown: boolean;
}): EiahDecision {
  const input = params.input.trim();
  if (params.eiahMode === "proposal" || params.routeIntent === "proposal") {
    return {
      kind: "needs_run",
      shouldCreateRun: true,
      launcherRouteIntent: params.routeIntent,
      presentationRouteIntent: params.routeIntent,
      eiahMode: params.eiahMode,
      renderVariant: "proposal",
    };
  }

  if (isPlatformSelfExplainQuestion(input)) {
    return {
      kind: "platform_self_explain",
      shouldCreateRun: false,
      content: buildPlatformSelfExplainReply(params.agentProfile),
      launcherRouteIntent: "help",
      presentationRouteIntent: "self_intro",
      eiahMode: "help",
      renderVariant: "self_intro",
      persistIntent: { intent: "product_explain", confidenceFloor: 0.82 },
    };
  }

  if (isAgentSignupHelpQuestion(input)) {
    return {
      kind: "agent_signup_help",
      shouldCreateRun: false,
      content: buildAgentSignupHelpReply(),
      launcherRouteIntent: "help",
      presentationRouteIntent: "help",
      eiahMode: "help",
      renderVariant: "simple_help",
      persistIntent: { intent: "product_explain", confidenceFloor: 0.8 },
    };
  }

  if (isDocumentationExplainQuestion(input)) {
    return {
      kind: "documentation_explain",
      shouldCreateRun: false,
      content: buildDocumentationExplainReply(),
      launcherRouteIntent: "help",
      presentationRouteIntent: "help",
      eiahMode: "help",
      renderVariant: "simple_help",
      persistIntent: { intent: "product_explain", confidenceFloor: 0.8 },
    };
  }

  if (isInternalTechnicalAccessQuestion(input)) {
    return {
      kind: "internal_technical_access",
      shouldCreateRun: false,
      content: buildInternalTechnicalAccessReply(),
      launcherRouteIntent: "help",
      presentationRouteIntent: "help",
      eiahMode: "help",
      renderVariant: "simple_help",
      persistIntent: { intent: "product_explain", confidenceFloor: 0.84 },
    };
  }

  if (isHostileInput(input)) {
    return {
      kind: "hostile_input",
      shouldCreateRun: false,
      content: buildHostileInputReply(),
      launcherRouteIntent: "help",
      presentationRouteIntent: "help",
      eiahMode: "help",
      renderVariant: "simple_help",
      persistIntent: { intent: "unknown", confidenceFloor: 0.78 },
    };
  }

  if (isImobContextEntryQuestion(input)) {
    return {
      kind: "imob_context_entry",
      shouldCreateRun: false,
      content: buildImobContextEntryReply(input),
      launcherRouteIntent: "imob",
      presentationRouteIntent: "imob",
      eiahMode: "help",
      renderVariant: "simple_help",
      persistIntent: { intent: "product_explain", confidenceFloor: 0.8 },
    };
  }

  const specialistExplainTarget = resolveSpecialistExplainTarget(input);
  if (specialistExplainTarget) {
    return {
      kind: "agent_explain",
      shouldCreateRun: false,
      content: buildAgentExplainReply(params.catalogAgents, specialistExplainTarget),
      launcherRouteIntent: "help",
      presentationRouteIntent: "capabilities_summary",
      eiahMode: "help",
      renderVariant: "simple_help",
      persistIntent: { intent: "product_explain", confidenceFloor: 0.8 },
    };
  }

  if (isLegalDataCollectionQuestion(input)) {
    return {
      kind: "legal_data_collection",
      shouldCreateRun: false,
      content: buildLegalDataCollectionReply(input),
      launcherRouteIntent: "help",
      presentationRouteIntent: "legal_handoff",
      eiahMode: "help",
      renderVariant: "simple_help",
      persistIntent: { intent: "agent_execute", confidenceFloor: 0.74 },
    };
  }

  if (isLegalRoutingQuestion(input)) {
    const legal = resolveSpecialistAvailability(params.catalogAgents, ["j360", "j_360", "juridico", "jurídico"]);
    return {
      kind: "legal_context_entry",
      shouldCreateRun: false,
      content: buildLegalContextEntryReply({ legalAgent: legal.agent, isAvailable: legal.canReceiveHandoff, input }),
      launcherRouteIntent: "help",
      presentationRouteIntent: "legal_handoff",
      eiahMode: "help",
      renderVariant: "simple_help",
      persistIntent: { intent: "product_explain", confidenceFloor: 0.74 },
    };
  }

  if (isEiahCapabilitiesQuestion(input)) {
    const content = input.includes("qual agente") || input.includes("especialista")
      ? buildSuggestedAgentReply(params.catalogAgents)
      : buildEiahCapabilitiesSummary(params.agentProfile);
    return {
      kind: "capabilities_summary",
      shouldCreateRun: false,
      content,
      launcherRouteIntent: "help",
      presentationRouteIntent: "capabilities_summary",
      eiahMode: "help",
      renderVariant: "simple_help",
      persistIntent: { intent: "product_explain", confidenceFloor: 0.8 },
    };
  }

  if (isFlowGuidanceQuestion(input)) {
    return {
      kind: "orchestrator_guidance",
      shouldCreateRun: false,
      content: buildOrchestratorGuidanceReply(),
      launcherRouteIntent: "orchestrator",
      presentationRouteIntent: "orchestrator",
      eiahMode: "orchestrator",
      renderVariant: "guided_flow",
      persistIntent: { intent: "agent_execute", confidenceFloor: 0.76 },
    };
  }

  if (isAgentPresentationQuestion(input)) {
    return {
      kind: "self_intro",
      shouldCreateRun: false,
      content: buildDeterministicAgentOverviewReply(params.agentProfile) ?? buildContextualFallback(),
      launcherRouteIntent: "help",
      presentationRouteIntent: "self_intro",
      eiahMode: "help",
      renderVariant: "self_intro",
      persistIntent: { intent: "product_explain", confidenceFloor: 0.78 },
    };
  }

  if (params.routeIntent === "imob") {
    return {
      kind: "imob_reply",
      shouldCreateRun: false,
      content: buildDeterministicImobReply(),
      launcherRouteIntent: "imob",
      presentationRouteIntent: "imob",
      eiahMode: "help",
      renderVariant: "simple_help",
    };
  }

  if (params.routeIntent === "playbook") {
    return {
      kind: "playbook_reply",
      shouldCreateRun: false,
      content: buildDeterministicPlaybookReply(),
      launcherRouteIntent: "playbook",
      presentationRouteIntent: "playbook",
      eiahMode: "help",
      renderVariant: "simple_help",
    };
  }

  if (params.routeIntent === "help") {
    const directHelp = buildDeterministicHelpReply(input);
    if (directHelp) {
      return {
        kind: "help_reply",
        shouldCreateRun: false,
        content: directHelp,
        launcherRouteIntent: "help",
        presentationRouteIntent: "help",
        eiahMode: "help",
        renderVariant: "simple_help",
      };
    }

    if (params.intentUnknown || !isRelatedToEiahTopic(input)) {
      return {
        kind: "contextual_fallback",
        shouldCreateRun: false,
        content: buildContextualFallback(),
        launcherRouteIntent: "help",
        presentationRouteIntent: "help",
        eiahMode: "help",
        renderVariant: "simple_help",
        persistIntent: { intent: "unknown" },
      };
    }
  }

  if (params.intentUnknown) {
    return {
      kind: "contextual_fallback",
      shouldCreateRun: false,
      content: buildContextualFallback(),
      launcherRouteIntent: "help",
      presentationRouteIntent: "help",
      eiahMode: "help",
      renderVariant: "simple_help",
      persistIntent: { intent: "unknown" },
    };
  }

  return {
    kind: "needs_run",
    shouldCreateRun: true,
    launcherRouteIntent: params.routeIntent,
    presentationRouteIntent: params.routeIntent,
    eiahMode: params.eiahMode,
    renderVariant: params.routeIntent === "orchestrator" ? "guided_flow" : "simple_help",
  };
}

export function resolveLauncherLocalDecision(params: {
  input: string;
  routeIntent: LauncherRouteIntent;
  proposalMode: boolean;
  isUnifiedEiah: boolean;
  eiahMode: EiahMode | null;
  agentProfile: Agent | null;
  catalogAgents: Agent[];
  intentUnknown: boolean;
}): LauncherLocalDecision | null {
  if (params.isUnifiedEiah) {
    return resolveEiahDecision({
      input: params.input,
      routeIntent: params.routeIntent,
      eiahMode: params.eiahMode ?? "help",
      agentProfile: params.agentProfile,
      catalogAgents: params.catalogAgents,
      intentUnknown: params.intentUnknown,
    });
  }

  const normalizedId = normalizeAgentKey(params.agentProfile?.id ?? "");
  const normalizedName = normalizeIntentText(params.agentProfile?.name ?? "");

  if (normalizedId === "j360" || normalizedName.includes("juridico")) {
    return {
      ...resolveJuridicoDecision({
        input: params.input,
        agentProfile: params.agentProfile,
        intentUnknown: params.intentUnknown,
      }),
      launcherRouteIntent: "help",
    };
  }

  if (normalizedId.replace(/-/g, "") === "finnexus" || normalizedName.includes("finnexus")) {
    return {
      ...resolveFinNexusDecision({
        input: params.input,
        agentProfile: params.agentProfile,
        intentUnknown: params.intentUnknown,
      }),
      launcherRouteIntent: "help",
    };
  }

  if (normalizedId === "guardian" || normalizedName.includes("guardian")) {
    return {
      ...resolveGuardianDecision({
        input: params.input,
        agentProfile: params.agentProfile,
        intentUnknown: params.intentUnknown,
      }),
      launcherRouteIntent: "help",
    };
  }

  if (normalizedId === "aadv" || normalizedName.includes("aadv")) {
    return {
      ...resolveAadvDecision({
        input: params.input,
        agentProfile: params.agentProfile,
        intentUnknown: params.intentUnknown,
      }),
      launcherRouteIntent: "help",
    };
  }

  if (isAgentPresentationQuestion(params.input)) {
    const overviewReply = buildAgentOverviewReply(params.agentProfile);
    if (overviewReply) {
      return {
        kind: "self_intro",
        shouldCreateRun: false,
        content: overviewReply,
        launcherRouteIntent: "help",
        presentationRouteIntent: "self_intro",
        renderVariant: "self_intro",
      };
    }
  }

  return null;
}
