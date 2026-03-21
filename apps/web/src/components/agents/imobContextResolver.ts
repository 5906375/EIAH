export type ImobFaqSeed = {
  key: string;
  domain: "imobiliarias" | "construtoras_incorporadoras" | "imoveis" | "leilao_imoveis";
  questionPatterns: string[];
  answerShort: string;
  nextQuestion: string;
  handoffHint?: "legal" | null;
  journeyStage?: ImobJourneyStage | null;
};

export type ImobJourneyStage =
  | "captacao"
  | "compra"
  | "venda"
  | "locacao"
  | "proposta"
  | "leilao"
  | "negociacao"
  | "contrato"
  | "fechamento";

export type ImobJourneyDefinition = {
  stage: ImobJourneyStage;
  entrySignals: string[];
  answerShort: string;
  nextQuestion: string;
  eligibleSpecialists: Array<"legal" | "none">;
  pageShortcuts: string[];
};

export type ImobHelpIntent = "what_is" | "overview" | "end_to_end" | "navigation" | "install" | "shortcuts";

export type ImobKnowledgeSearchIntent =
  | "library"
  | "contracts_proposals"
  | "capture_materials"
  | "city_or_region";

export type ImobShortcutSelection = {
  key: "dashboard" | "chat" | "install";
  label: string;
  path: string;
  helpText: string;
};

function normalizeIntentText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
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
    key: "captacao_locacao_comercial",
    domain: "imobiliarias",
    questionPatterns: [
      "tenho imobiliaria e quero captar clientes para locacao",
      "tenho imobiliária e quero captar clientes para locação",
      "quero captar clientes para locacao",
      "quero captar clientes para locação",
      "quero captar para locacao",
      "quero captar para locação",
    ],
    answerShort:
      "Se o foco é locação, o IMOB pode te ajudar a organizar captação, entrada no pipeline, anúncio, proposta e acompanhamento até o contrato.",
    nextQuestion: "Você quer organizar primeiro a captação, o anúncio ou a proposta de locação?",
    journeyStage: "locacao",
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

export function isImobGuideQuestion(input: string) {
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

export function resolveImobKnowledgeSearchIntent(input: string): ImobKnowledgeSearchIntent | null {
  const normalized = normalizeIntentText(input);

  if (
    normalized.includes("buscar no acervo imob") ||
    normalized.includes("pesquisar no acervo imob") ||
    normalized.includes("pesquisar no drive imob") ||
    normalized.includes("buscar no drive imob") ||
    normalized.includes("buscar no acervo")
  ) {
    return "library";
  }

  if (
    normalized.includes("buscar contratos e propostas") ||
    normalized.includes("pesquisar contratos e propostas") ||
    normalized.includes("buscar contratos") ||
    normalized.includes("buscar propostas") ||
    normalized.includes("pesquisar documentos") ||
    normalized.includes("documentos de locacao") ||
    normalized.includes("documentos de locação")
  ) {
    return "contracts_proposals";
  }

  if (
    normalized.includes("buscar materiais de captacao") ||
    normalized.includes("buscar materiais de captação") ||
    normalized.includes("pesquisar materiais de captacao") ||
    normalized.includes("pesquisar materiais de captação") ||
    normalized.includes("modelos de proposta") ||
    normalized.includes("checklists de captacao") ||
    normalized.includes("checklists de captação")
  ) {
    return "capture_materials";
  }

  if (
    normalized.includes("buscar por cidade ou regiao") ||
    normalized.includes("buscar por cidade ou região") ||
    normalized.includes("pesquisar por cidade ou regiao") ||
    normalized.includes("pesquisar por cidade ou região") ||
    normalized.includes("pesquisar por regiao") ||
    normalized.includes("pesquisar por região")
  ) {
    return "city_or_region";
  }

  return null;
}

export function resolveImobFaqSeed(input: string) {
  const normalized = normalizeIntentText(input);
  return IMOB_FAQ_SEEDS.find((seed) => seed.questionPatterns.some((pattern) => normalized.includes(pattern)));
}

export function resolveImobHelpIntent(input: string): ImobHelpIntent | null {
  const normalized = normalizeIntentText(input);

  if (
    (normalized.includes("o que e imob") || normalized.includes("o que eh imob") || normalized.includes("ta mas o que e imob")) &&
    normalized.includes("imob")
  ) {
    return "what_is";
  }

  if (
    normalized.includes("o que e o imob") ||
    normalized.includes("o que eh o imob") ||
    normalized.includes("fale sobre o imob")
  ) {
    return "what_is";
  }

  if (
    normalized.includes("como funciona imob do inicio ao fim") ||
    normalized.includes("como funciona imob do início ao fim") ||
    normalized.includes("imob do inicio ao fim") ||
    normalized.includes("imob do início ao fim") ||
    normalized.includes("jornada do imob")
  ) {
    return "end_to_end";
  }

  if (
    normalized.includes("onde acompanho pipeline") ||
    normalized.includes("pipeline e etapas no imob") ||
    normalized.includes("onde acompanho as etapas") ||
    normalized.includes("acompanho pipeline") ||
    normalized.includes("acompanho etapas no imob")
  ) {
    return "navigation";
  }

  if (
    normalized.includes("instalar o imob") ||
    normalized.includes("quero instalar o imob") ||
    normalized.includes("instalacao do imob") ||
    normalized.includes("instalação do imob") ||
    normalized.includes("marketplace/imob")
  ) {
    return "install";
  }

  if (
    normalized.includes("o que e esses atalhos") ||
    normalized.includes("o que sao esses atalhos") ||
    normalized.includes("o que são esses atalhos") ||
    normalized.includes("para que servem esses atalhos") ||
    normalized.includes("o que significa esses atalhos")
  ) {
    return "shortcuts";
  }

  if (isImobGuideQuestion(input)) {
    return "overview";
  }

  return null;
}

export function resolveImobShortcutSelection(input: string): ImobShortcutSelection | null {
  const normalized = normalizeIntentText(input);

  if (
    normalized.includes("/app/imob/dashboard") ||
    normalized.includes("dashboard imob") ||
    normalized.includes("abrir dashboard do imob")
  ) {
    return {
      key: "dashboard",
      label: "Dashboard IMOB",
      path: "/app/imob/dashboard",
      helpText: "Use esse atalho para acompanhar pipeline, contexto operacional e evolução das etapas do IMOB.",
    };
  }

  if (
    normalized.includes("/app/imob/chat") ||
    normalized.includes("chat imob") ||
    normalized.includes("abrir chat imob")
  ) {
    return {
      key: "chat",
      label: "Chat IMOB",
      path: "/app/imob/chat",
      helpText: "Use esse atalho quando quiser destravar o próximo passo do caso atual pela conversa.",
    };
  }

  if (
    normalized.includes("/app/marketplace/imob") ||
    normalized.includes("instalacao (se necessario)") ||
    normalized.includes("instalação (se necessário)") ||
    normalized.includes("abrir instalacao do imob") ||
    normalized.includes("abrir instalacao do imob")
  ) {
    return {
      key: "install",
      label: "Marketplace IMOB",
      path: "/app/marketplace/imob",
      helpText: "Use esse atalho para ativar o IMOB no workspace antes de seguir para dashboard e chat.",
    };
  }

  return null;
}

export function resolveImobJourneyStage(input: string): ImobJourneyDefinition | null {
  const normalized = normalizeIntentText(input);
  for (const definition of IMOB_JOURNEY_MAP) {
    if (definition.entrySignals.some((signal) => normalized === signal || normalized.includes(signal))) {
      return definition;
    }
  }
  return null;
}

export function buildImobQuickRepliesForInput(input: string) {
  const knowledgeIntent = resolveImobKnowledgeSearchIntent(input);
  if (knowledgeIntent) {
    return buildImobKnowledgeSearchQuickReplies();
  }

  const helpIntent = resolveImobHelpIntent(input);
  switch (helpIntent) {
    case "what_is":
      return ["Como funciona IMOB do início ao fim?", "Onde acompanho pipeline e etapas no IMOB?", "Quero instalar o IMOB no workspace."];
    case "end_to_end":
      return ["Quero entender captação no IMOB", "Quero entender proposta no IMOB", "Onde acompanho pipeline e etapas no IMOB?"];
    case "navigation":
      return ["Dashboard IMOB: /app/imob/dashboard", "Chat IMOB: /app/imob/chat", "Instalação (se necessário): /app/marketplace/imob"];
    case "install":
      return ["O que o IMOB resolve?", "Onde acompanho pipeline e etapas no IMOB?", "Como funciona IMOB do início ao fim?"];
    case "overview":
      return ["O que é o IMOB?", "Como funciona IMOB do início ao fim?", "Onde acompanho pipeline e etapas no IMOB?"];
    default:
      break;
  }

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

export function buildImobKnowledgeSearchQuickReplies() {
  return [
    "Buscar no acervo IMOB",
    "Buscar contratos e propostas",
    "Buscar materiais de captação",
    "Buscar por cidade ou região",
  ];
}

function buildImobWhatIsReply() {
  return [
    "**O que é o IMOB**",
    "",
    "O IMOB é a vertical do EIAH para operação imobiliária.",
    "",
    "Na prática, ele organiza a jornada comercial e operacional de imóveis com apoio de IA, cobrindo contexto como:",
    "- captação",
    "- compra",
    "- venda",
    "- locação",
    "- proposta",
    "- contrato e acompanhamento",
    "",
    "Ele serve para o time enxergar melhor a etapa atual, reduzir retrabalho e decidir o próximo passo com mais contexto.",
  ].join("\n");
}

function buildImobOverviewReply() {
  return [
    "**IMOB — guia rápido**",
    "",
    "O IMOB organiza a operação imobiliária com apoio de IA: leads, proposta, contrato e acompanhamento do processo comercial.",
    "",
    "Ele ajuda o time a enxergar a jornada, reduzir retrabalho e decidir o próximo passo com mais contexto.",
    "",
    "**Como usar**",
    "1. Abra o dashboard do IMOB para visualizar pipeline e contexto da operação.",
    "2. Use o chat IMOB para orientar a próxima ação com base no caso atual.",
    "3. Acompanhe a evolução das etapas com rastreabilidade.",
    "4. Revise resultados e gargalos para melhorar a rotina do time.",
    "",
    "**Atalhos**",
    "- Dashboard IMOB: `/app/imob/dashboard`",
    "- Chat IMOB: `/app/imob/chat`",
    "- Instalação (se necessário): `/app/marketplace/imob`",
  ].join("\n");
}

function buildImobEndToEndReply() {
  return [
    "**Como o IMOB funciona do início ao fim**",
    "",
    "A jornada típica no IMOB segue esta linha:",
    "1. captar ou entrar com o imóvel/oportunidade no contexto certo;",
    "2. organizar etapa comercial: compra, venda ou locação;",
    "3. estruturar proposta, condições e documentação inicial;",
    "4. acompanhar negociação, contrato e próximos passos;",
    "5. seguir o caso pelo dashboard e pelo chat até o fechamento.",
    "",
    "**Onde cada parte acontece**",
    "- Dashboard: visão de pipeline, etapas e gargalos",
    "- Chat IMOB: orientação do próximo passo no caso atual",
    "",
    "Se quiser, eu também posso detalhar só uma etapa: captação, proposta, negociação ou contrato.",
  ].join("\n");
}

function buildImobNavigationReply() {
  return [
    "**Onde acompanhar pipeline e etapas no IMOB**",
    "",
    "- Use `/app/imob/dashboard` para ver pipeline, contexto operacional e evolução das etapas.",
    "- Use `/app/imob/chat` quando quiser orientação do próximo passo com base no caso atual.",
    "",
    "**Regra prática**",
    "- dashboard para visão de jornada e acompanhamento",
    "- chat para destravar decisão, proposta, contrato ou próximo passo",
  ].join("\n");
}

function buildImobShortcutsReply() {
  return [
    "**O que são esses atalhos no IMOB**",
    "",
    "- `Dashboard IMOB`: para acompanhar pipeline, etapas e gargalos da operação.",
    "- `Chat IMOB`: para destravar o próximo passo do caso atual pela conversa.",
    "- `Marketplace IMOB`: para instalar ou ativar a vertical no workspace.",
    "",
    "Regra prática:",
    "- dashboard para visão e acompanhamento",
    "- chat para decisão e orientação contextual",
    "- marketplace para ativação",
  ].join("\n");
}

function buildImobInstallReply() {
  return [
    "**Como instalar o IMOB no workspace**",
    "",
    "1. Abra o Marketplace do workspace.",
    "2. Procure por `IMOB`.",
    "3. Revise descrição, escopo e disponibilidade do módulo.",
    "4. Ative a vertical no workspace.",
    "5. Depois disso, siga por `/app/imob/dashboard` ou `/app/imob/chat`.",
    "",
    "**Atalho**",
    "- `/app/marketplace/imob`",
  ].join("\n");
}

export function buildImobKnowledgeSearchEntryReply(input?: string) {
  const intent = input ? resolveImobKnowledgeSearchIntent(input) : null;
  const title =
    intent === "contracts_proposals"
      ? "**Busca documental IMOB: contratos e propostas**"
      : intent === "capture_materials"
      ? "**Busca documental IMOB: materiais de captação**"
      : intent === "city_or_region"
      ? "**Busca documental IMOB: cidade ou região**"
      : "**Busca documental IMOB**";
  const nextStep =
    intent === "contracts_proposals"
      ? "No chat IMOB, me peça algo como: `buscar contratos de locação em São Paulo`."
      : intent === "capture_materials"
      ? "No chat IMOB, me peça algo como: `buscar materiais de captação para locação`."
      : intent === "city_or_region"
      ? "No chat IMOB, me peça algo como: `buscar documentos para locação em Santa Catarina`."
      : "No chat IMOB, me diga o recorte documental que você quer encontrar.";

  return [
    title,
    "",
    "Eu consigo encaminhar sua busca documental do IMOB sem cair em help genérico.",
    "",
    "Você pode procurar por:",
    "- contratos e propostas",
    "- materiais de captação",
    "- conteúdo por cidade ou região",
    "- acervo base do time IMOB",
    "",
    nextStep,
    "Se preferir, eu também posso seguir com um desses atalhos logo abaixo.",
  ].join("\n");
}

export function buildImobKnowledgeAccessBlockedReply() {
  return [
    "**IMOB indisponível neste tenant/workspace**",
    "",
    "A busca documental do IMOB só pode ser usada por tenants cadastrados e com a vertical habilitada.",
    "",
    "Próximos passos sugeridos:",
    "- ver opções no Marketplace",
    "- falar com comercial",
    "- entender quais planos habilitam a vertical",
  ].join("\n");
}

function buildImobShortcutReply(selection: ImobShortcutSelection) {
  return [
    `**${selection.label}**`,
    "",
    selection.helpText,
    "",
    `**Abrir agora**`,
    `- [${selection.label}](${selection.path})`,
  ].join("\n");
}

function buildImobSellValueReply() {
  return [
    "**Como o IMOB ajuda a vender um imóvel**",
    "",
    "Na prática, o IMOB te ajuda a vender organizando a jornada comercial com mais contexto:",
    "- entrada do imóvel e captação no pipeline certo",
    "- acompanhamento de anúncio, interesse e próximos passos",
    "- organização de proposta, negociação e documentação inicial",
    "- continuidade do caso até contrato e fechamento",
    "",
    "Se você quiser, eu posso detalhar a etapa de captação, proposta, negociação ou contrato.",
  ].join("\n");
}

export function buildDeterministicImobReply(input?: string) {
  const normalized = input ? normalizeIntentText(input) : "";

  const shortcut = input ? resolveImobShortcutSelection(input) : null;
  if (shortcut) {
    return buildImobShortcutReply(shortcut);
  }

  if (
    normalized.includes("como vai ajudar a vender um imovel") ||
    normalized.includes("como vai ajudar a vender um imóvel") ||
    normalized.includes("como o imob ajuda a vender") ||
    normalized.includes("como ajuda a vender um imovel") ||
    normalized.includes("como ajuda a vender um imóvel")
  ) {
    return buildImobSellValueReply();
  }

  const faq = input ? resolveImobFaqSeed(input) : null;
  if (faq) {
    return buildImobFaqReply(faq);
  }

  const stage = input ? resolveImobJourneyStage(input) : null;
  if (stage) {
    return buildImobJourneyReply(stage);
  }

  const helpIntent = input ? resolveImobHelpIntent(input) : null;
  switch (helpIntent) {
    case "what_is":
      return buildImobWhatIsReply();
    case "end_to_end":
      return buildImobEndToEndReply();
    case "navigation":
      return buildImobNavigationReply();
    case "install":
      return buildImobInstallReply();
    case "shortcuts":
      return buildImobShortcutsReply();
    case "overview":
    default:
      return buildImobOverviewReply();
  }
}

function buildImobFaqReply(seed: ImobFaqSeed) {
  const handoffLine =
    seed.handoffHint === "legal"
      ? "\nSe a dúvida avançar para edital, matrícula, cláusula, contrato ou risco jurídico, eu também posso te encaminhar para o Jurídico."
      : "";
  return [seed.answerShort, "", seed.nextQuestion, handoffLine].filter(Boolean).join("\n");
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

export function buildImobContextEntryReply(input: string) {
  const helpIntent = resolveImobHelpIntent(input);
  if (helpIntent) {
    return buildDeterministicImobReply(input);
  }

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
