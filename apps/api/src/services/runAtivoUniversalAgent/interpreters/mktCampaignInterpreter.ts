import type { MktCampaignReport } from "../../../../../../packages/core/src/actions/reporting/mktCampaignReportSchema";
import type { RecipeOrchestration } from "../../../../../../packages/core/src/actions/reporting/recipeOrchestrationSchema";
import { MktCampaignReportSchema } from "../../../../../../packages/core/src/actions/reporting/mktCampaignReportSchema";

type PlainObject = Record<string, unknown>;

type BuildMktCampaignReportParams = {
  outputText?: string | null;
  rawOutput?: unknown;
  metadata?: Record<string, unknown> | null;
  recipeOrchestration?: RecipeOrchestration | null;
};

function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asTrimmedString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeText(value: string | null | undefined) {
  return value
    ?.toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") ?? "";
}

function splitIntoSections(markdown: string) {
  const sections = new Map<string, string[]>();
  let current = "body";

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    const heading = line.match(/^#{1,6}\s+(.+?)\s*$/);
    if (heading) {
      current = normalizeText(heading[1]);
      if (!sections.has(current)) sections.set(current, []);
      continue;
    }
    if (!sections.has(current)) sections.set(current, []);
    sections.get(current)?.push(rawLine);
  }

  return sections;
}

function sectionText(sections: Map<string, string[]>, needles: string[]) {
  for (const needle of needles) {
    const match = Array.from(sections.keys()).find((key) => key.includes(normalizeText(needle)));
    if (match) {
      return sections
        .get(match)
        ?.join("\n")
        .trim() ?? "";
    }
  }
  return "";
}

function extractList(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, "").trim())
    .filter((line) => line.length > 0);
}

function firstNonEmpty(...values: Array<string | null | undefined>) {
  return values.find((value) => typeof value === "string" && value.trim().length > 0)?.trim() ?? null;
}

function dedupeStrings(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
    )
  );
}

function inferIcpCluster(value: string) {
  const normalized = normalizeText(value);
  if (normalized.includes("boutique")) return "Boutique especializada";
  if (normalized.includes("full service")) return "Full service";
  if (normalized.includes("inovacao") || normalized.includes("inovação")) return "Inovação / transformação";
  if (normalized.includes("compliance") || normalized.includes("lgpd")) return "Compliance / LGPD";
  if (normalized.includes("trabalhista")) return "Trabalhista";
  if (normalized.includes("contrat")) return "Contratual empresarial";
  return "Escritórios consultivos";
}

function inferLegalAreas(values: string[]) {
  const haystack = normalizeText(values.join(" "));
  const areas: string[] = [];
  if (haystack.includes("trabalh")) areas.push("Trabalhista");
  if (haystack.includes("contrat")) areas.push("Contratual");
  if (haystack.includes("lgpd") || haystack.includes("privacidade")) areas.push("LGPD / Privacidade");
  if (haystack.includes("societ")) areas.push("Societário");
  if (haystack.includes("tribut")) areas.push("Tributário");
  if (haystack.includes("imobili")) areas.push("Imobiliário");
  return areas.length > 0 ? dedupeStrings(areas) : ["Trabalhista", "Contratual", "LGPD / Privacidade"];
}

function buildComplianceFlags(values: string[]) {
  const haystack = normalizeText(values.join(" "));
  const flags = ["oab_publicidade"];
  if (haystack.includes("lgpd") || haystack.includes("privacidade")) {
    flags.push("revisao_promessa_lgpd");
  }
  return dedupeStrings(flags);
}

function buildValuePropositionByArea(areas: string[]): MktCampaignReport["valuePropositionByArea"] {
  const templates: Record<string, Omit<MktCampaignReport["valuePropositionByArea"][number], "legalArea">> = {
    "Trabalhista": {
      headline: "Seu escritório trabalhista analisa risco de rescisão em minutos, não em horas.",
      pain: "Cálculo manual, parecer lento e risco de passivo sem trilha auditável.",
      solution: "A Vertical Legal estrutura o fluxo de análise, organiza evidências e entrega relatório pronto para revisão humana.",
      cta: "Agendar demonstração com caso trabalhista de exemplo.",
      complianceNote: "Evitar promessas de redução garantida de passivo ou eliminação total de risco.",
    },
    "Contratual": {
      headline: "Revise minutas e identifique cláusulas de risco antes da próxima rodada com o cliente.",
      pain: "Revisão manual sem trilha, com tempo gasto em varredura repetitiva.",
      solution: "A plataforma apoia triagem contratual, sinaliza pontos críticos e organiza relatório exportável para revisão do advogado.",
      cta: "Solicitar demo com contrato de exemplo.",
      complianceNote: "Evitar dizer que o sistema substitui o julgamento jurídico ou detecta 100% dos riscos.",
    },
    "LGPD / Privacidade": {
      headline: "Entregue análises de adequação LGPD com mais consistência e menos retrabalho.",
      pain: "Cada análise recomeça do zero e falta material auditável para discussão com o cliente.",
      solution: "A Vertical Legal organiza bases legais, riscos e documentação de apoio para revisão do advogado responsável.",
      cta: "Testar um fluxo guiado de análise LGPD.",
      complianceNote: "Evitar promessa de conformidade garantida; posicionar como suporte ao processo de adequação.",
    },
    "Societário": {
      headline: "Estruture análise societária com mais consistência e governança documental.",
      pain: "Due diligences e revisões societárias exigem consolidação manual e demorada.",
      solution: "A plataforma apoia leitura estruturada e organização dos pontos críticos para revisão final.",
      cta: "Avaliar aderência para operações societárias prioritárias.",
      complianceNote: "Evitar sugerir decisão automática para operações de alto risco.",
    },
    "Tributário": {
      headline: "Apoie o time tributário com fluxos auditáveis para análises recorrentes.",
      pain: "Leitura normativa dispersa e esforço manual para montar contexto e risco.",
      solution: "A Vertical Legal organiza insumos e relatório para acelerar a revisão técnica do advogado tributarista.",
      cta: "Agendar conversa para cenário tributário piloto.",
      complianceNote: "Evitar prometer economia fiscal garantida ou êxito em contencioso.",
    },
    "Imobiliário": {
      headline: "Organize análises imobiliárias com fluxo, evidência e relatório pronto para revisão.",
      pain: "Documentos dispersos e revisões repetitivas reduzem velocidade do escritório.",
      solution: "A plataforma apoia varredura inicial e consolidação de achados para validação do especialista.",
      cta: "Solicitar demonstração com documento imobiliário de exemplo.",
      complianceNote: "Evitar promessa de aprovação garantida ou cobertura integral de risco.",
    },
  };

  return areas.map((legalArea) => ({
    legalArea,
    ...(templates[legalArea] ?? {
      headline: `Apoio estruturado para fluxos de ${legalArea.toLowerCase()}.`,
      pain: `Volume operacional e necessidade de trilha auditável em ${legalArea.toLowerCase()}.`,
      solution: "A Vertical Legal organiza análise, evidência e relatório para revisão humana final.",
      cta: "Agendar conversa para avaliar aderência ao fluxo do escritório.",
      complianceNote: "Revisar promessa comercial e limites de comunicação antes da publicação.",
    }),
  }));
}

function buildColdEmailTemplates(areas: string[]): MktCampaignReport["coldEmailTemplates"] {
  const baseTemplates: Record<string, Array<Omit<MktCampaignReport["coldEmailTemplates"][number], "legalArea">>> = {
    "Trabalhista": [
      {
        stage: "D0",
        subject: "Análise trabalhista com menos retrabalho no escritório",
        body: "Escritórios trabalhistas gastam horas estruturando análises repetitivas. A Vertical Legal organiza o fluxo, consolida risco e prepara relatório para revisão humana final.",
        cta: "Posso te mostrar um exemplo de saída aplicada ao contexto trabalhista?",
        complianceNote: "Não prometer redução garantida de passivo.",
      },
      {
        stage: "D3",
        subject: "Como acelerar triagem trabalhista sem abrir mão da revisão humana",
        body: "O foco é tirar o time da varredura manual e devolver tempo para o julgamento jurídico. A proposta é demonstrar um fluxo guiado, não substituir o advogado.",
        cta: "Faz sentido agendar uma demonstração de 20 minutos?",
        complianceNote: "Evitar linguagem de substituição do advogado.",
      },
    ],
    "Contratual": [
      {
        stage: "D0",
        subject: "Triagem contratual auditável para escritórios boutique",
        body: "Minutas recorrentes consomem tempo em varredura manual. A Vertical Legal apoia a leitura inicial e organiza achados para revisão do time contratual.",
        cta: "Posso enviar um exemplo de relatório contratual?",
        complianceNote: "Não dizer que detecta 100% dos riscos.",
      },
      {
        stage: "D7",
        subject: "Vale testar um contrato real em 20 minutos?",
        body: "A melhor forma de avaliar aderência é rodar um caso simples e ver o relatório sair com mapa de risco e pontos de atenção.",
        cta: "Se fizer sentido, abrimos uma demonstração objetiva.",
        complianceNote: "Evitar prometer resultado final automático.",
      },
    ],
    "LGPD / Privacidade": [
      {
        stage: "D0",
        subject: "Fluxo mais consistente para análises LGPD no escritório",
        body: "Quando cada análise começa do zero, a entrega fica lenta e sem trilha. A Vertical Legal ajuda a estruturar bases legais, riscos e documentação para revisão do especialista.",
        cta: "Posso te mostrar um fluxo de exemplo para LGPD?",
        complianceNote: "Evitar prometer conformidade garantida.",
      },
      {
        stage: "D14",
        subject: "Quando surgir a próxima demanda de privacidade, vale revisitar?",
        body: "Se ainda não for o momento, sem problema. Deixo o tema aberto para a próxima demanda LGPD com cliente corporativo.",
        cta: "Se quiser, retomamos quando fizer sentido.",
        complianceNote: "Manter abordagem institucional, sem captação agressiva.",
      },
    ],
  };

  return areas.flatMap((legalArea) =>
    (baseTemplates[legalArea] ?? []).map((template) => ({
      legalArea,
      ...template,
    }))
  );
}

function buildLaunchChecklist(areas: string[], complianceFlags: string[]): MktCampaignReport["launchChecklist"] {
  const hasOabFlag = complianceFlags.includes("oab_publicidade") ? "oab_publicidade" : null;
  return [
    {
      phase: "Pré-lançamento",
      item: "Fechar ICP, oferta e mensagem-base por especialidade prioritária.",
      owner: "Marketing",
      deadline: "D1-D3",
      complianceFlag: null,
    },
    {
      phase: "Pré-lançamento",
      item: `Preparar materiais base para ${areas.slice(0, 3).join(", ")}.`,
      owner: "Marketing",
      deadline: "D3-D5",
      complianceFlag: null,
    },
    {
      phase: "Pré-lançamento",
      item: "Revisar toda a copy com produto e jurídico antes da publicação.",
      owner: "Jurídico + Produto",
      deadline: "D4-D6",
      complianceFlag: hasOabFlag,
    },
    {
      phase: "Lançamento",
      item: "Ativar primeira onda de LinkedIn e outbound com contas Tier 1.",
      owner: "Marketing + Pré-vendas",
      deadline: "D7-D14",
      complianceFlag: null,
    },
    {
      phase: "Revisão",
      item: "Revisar métricas, respostas e contas qualificadas após a primeira onda.",
      owner: "Marketing",
      deadline: "D21-D30",
      complianceFlag: null,
    },
  ];
}

function inferChannel(value: string): MktCampaignReport["priorityChannels"][number] {
  const normalized = normalizeText(value);
  if (normalized.includes("linkedin")) return "linkedin";
  if (normalized.includes("email")) return "email";
  if (normalized.includes("whatsapp")) return "whatsapp";
  if (normalized.includes("parcer")) return "partnerships";
  if (normalized.includes("evento")) return "events";
  if (normalized.includes("comunidade")) return "communities";
  if (normalized.includes("blog") || normalized.includes("seo")) return "blog_seo";
  if (normalized.includes("paid") || normalized.includes("media paga")) return "paid_media";
  if (normalized.includes("rede social") || normalized.includes("instagram") || normalized.includes("tiktok") || normalized.includes("youtube")) {
    return "social";
  }
  return "other";
}

function extractForm(metadata?: Record<string, unknown> | null) {
  return isPlainObject(metadata?.form) ? (metadata?.form as PlainObject) : {};
}

function buildWorkspaceBrand(metadata?: Record<string, unknown> | null): MktCampaignReport["workspaceBrand"] {
  const candidate = isPlainObject(metadata?.workspaceBrand) ? metadata.workspaceBrand : null;
  return {
    name: asTrimmedString(candidate && candidate.name) ?? asTrimmedString(metadata?.workspaceName) ?? asTrimmedString(metadata?.workspaceId),
    logoUrl: asTrimmedString(candidate && candidate.logoUrl),
    primaryColor: asTrimmedString(candidate && candidate.primaryColor),
    accentColor: asTrimmedString(candidate && candidate.accentColor),
  };
}

function buildDocumentIdentity(params: {
  metadata?: Record<string, unknown> | null;
  recipeOrchestration?: RecipeOrchestration | null;
}): MktCampaignReport["documentIdentity"] {
  const reportVersion =
    asTrimmedString(params.metadata?.reportVersion) ??
    "v1";
  return {
    documentName:
      asTrimmedString(params.metadata?.documentName) ??
      asTrimmedString(params.recipeOrchestration?.recipeTitle) ??
      "Campanha de marketing",
    generatedAt: new Date().toISOString(),
    reportVersion,
  };
}

function buildSections(params: {
  summary: string;
  positioning: string | null;
  offer: string | null;
  icp: MktCampaignReport["icp"];
  channelPlans: MktCampaignReport["channelPlans"];
  outboundCadence: MktCampaignReport["outboundCadence"];
  timeline: MktCampaignReport["timeline"];
  requiredAssets: MktCampaignReport["requiredAssets"];
  kpis: MktCampaignReport["kpis"];
  followUpPlan: string[];
  prioritizationPlan: MktCampaignReport["prioritizationPlan"];
  nextActions: string[];
}) {
  const section = (id: string, title: string, summary: string | null, status: MktCampaignReport["reportSections"][number]["status"] = "available") => ({
    id,
    title,
    anchor: id,
    summary,
    status,
  });

  return [
    section("resumo", "Resumo executivo", params.summary),
    section("posicionamento", "Posicionamento e oferta", params.offer ?? params.positioning, params.positioning || params.offer ? "available" : "partial"),
    section("icp", "Público-alvo / ICP", params.icp[0]?.label ?? null, params.icp.length > 0 ? "available" : "partial"),
    section("canais", "Canais prioritários", params.channelPlans[0]?.label ?? null, params.channelPlans.length > 0 ? "available" : "partial"),
    section("cadencia", "Cadência outbound", params.outboundCadence[0]?.action ?? null, params.outboundCadence.length > 0 ? "available" : "partial"),
    section("cronograma", "Cronograma", params.timeline[0]?.activity ?? null, params.timeline.length > 0 ? "available" : "partial"),
    section("assets", "Assets necessários", params.requiredAssets[0]?.name ?? null, params.requiredAssets.length > 0 ? "available" : "partial"),
    section("kpis", "KPIs e metas", params.kpis[0]?.name ?? null, params.kpis.length > 0 ? "available" : "partial"),
    section("follow-up", "Plano de follow-up", params.followUpPlan[0] ?? null, params.followUpPlan.length > 0 ? "available" : "partial"),
    section("priorizacao", "Priorização 30/60/90 dias", params.prioritizationPlan[0]?.focus ?? null, params.prioritizationPlan.length > 0 ? "available" : "partial"),
    section("proximos-passos", "Próximos passos", params.nextActions[0] ?? null, params.nextActions.length > 0 ? "available" : "partial"),
  ];
}

export function buildMktCampaignReport(
  params: BuildMktCampaignReportParams
): MktCampaignReport | null {
  const metadata = params.metadata ?? {};
  const recipeOrchestration = params.recipeOrchestration ?? null;
  const linkedRecipe = isPlainObject(metadata.linkedRecipe) ? metadata.linkedRecipe : null;
  const linkedRecipeAgentId = asTrimmedString(linkedRecipe?.agentId);
  const currentAgent = asTrimmedString(metadata.agentId) ?? linkedRecipeAgentId;
  const normalizedAgent = normalizeText(currentAgent);

  if (normalizedAgent !== "mkt") return null;

  const form = extractForm(metadata);
  const sections = splitIntoSections(params.outputText ?? "");

  const objective =
    asTrimmedString(form.goal) ??
    asTrimmedString(linkedRecipe && linkedRecipe.content && isPlainObject(linkedRecipe.content) ? linkedRecipe.content.goal : null) ??
    asTrimmedString(recipeOrchestration?.recipeGoal) ??
    "Organizar campanha de marketing com execução prática.";

  const summary = firstNonEmpty(
    sectionText(sections, ["Resumo e KPIs", "Resumo executivo"]),
    asTrimmedString(recipeOrchestration?.recipeExpectedOutcome),
    asTrimmedString(form.notes),
    objective
  ) ?? objective;

  const positioning = firstNonEmpty(
    sectionText(sections, ["Posicionamento"]),
    asTrimmedString(form.notes)
  );
  const offer = firstNonEmpty(
    sectionText(sections, ["Oferta", "Proposta de valor", "Oferta e CTA"]),
    "Diagnóstico de aderência e piloto guiado da Vertical Legal para escritórios com perfil consultivo."
  );

  const audiencePrimary =
    asTrimmedString(form.audience) ??
    "Público-alvo não informado.";
  const audienceSegments = extractList(sectionText(sections, ["ICP", "Público", "Publico-alvo", "Audiência", "Audiencia"]));
  const legalAreas = inferLegalAreas([
    objective,
    summary,
    positioning ?? "",
    offer ?? "",
    audiencePrimary,
    ...audienceSegments,
    String(form.notes ?? ""),
  ]);
  const complianceFlags = buildComplianceFlags([
    objective,
    summary,
    positioning ?? "",
    String(form.notes ?? ""),
    ...legalAreas,
  ]);

  const rawChannels = Array.isArray(form.channels)
    ? form.channels.map((item) => String(item))
    : [];
  const sectionChannels = extractList(sectionText(sections, ["Canais e estratégias", "Canais e estrategias", "Canais prioritários", "Canais prioritarios"]));
  const allChannelLabels = dedupeStrings([...rawChannels, ...sectionChannels]);
  const priorityChannels = dedupeStrings(allChannelLabels).map(inferChannel);

  const kpis = dedupeStrings([
    ...String(form.kpis ?? "").split(/[,;]\s*/),
    ...extractList(sectionText(sections, ["Resumo e KPIs", "KPIs", "Métricas", "Metricas"])),
  ])
    .slice(0, 8)
    .map((item) => ({
      name: item,
      target:
        normalizeText(item).includes("reunio")
          ? "10 reuniões"
          : normalizeText(item).includes("lead")
          ? "20 leads qualificados"
          : normalizeText(item).includes("pilot")
          ? "2 pilotos"
          : "Definir meta quantitativa",
      channel: null,
      notes: null,
    }));

  const timelineText = sectionText(sections, ["Timeline", "Cronograma"]);
  const timeline = extractList(timelineText).map((item, index) => ({
    period: `Etapa ${index + 1}`,
    activity: item.split(" — ")[0] ?? item,
    description: item,
    owner: null,
  }));

  const nextActions = dedupeStrings([
    ...extractList(sectionText(sections, ["Próximos passos", "Proximos passos"])),
    ...(recipeOrchestration?.howToProceedNow ?? []),
  ]).slice(0, 8);

  const channelPlans = allChannelLabels.map((label, index) => {
    const channel = inferChannel(label);
    const linkedKpi = kpis[index] ?? kpis[0] ?? null;
    return {
      channel,
      label,
      objective:
        channel === "linkedin"
          ? "Abrir conversas com sócios e heads de inovação."
          : channel === "email"
          ? "Gerar resposta qualificada e reunião de descoberta."
          : channel === "partnerships"
          ? "Ativar distribuidores de credibilidade e acesso ao ICP."
          : "Ativar o canal com mensagem aderente ao ICP e objetivo da campanha.",
      approach:
        channel === "linkedin" || channel === "email"
          ? "Executar em ondas curtas com segmentação por especialidade e prova de valor."
          : "Executar com cadência curta, mensagem consultiva e revisão semanal.",
      contentFocus: dedupeStrings([
        asTrimmedString(form.toneProfile),
        "proposta de valor",
        "oferta",
        "cta",
      ]),
      targetMetric: linkedKpi ? linkedKpi.name : "Meta principal do canal",
      targetMetricValue: linkedKpi?.target ?? "Definir meta quantitativa",
      cadence:
        channel === "linkedin" || channel === "email"
          ? "Cadência de 3 a 4 toques em 10 dias"
          : "Revisão semanal",
    };
  });

  const preferredOutboundChannel =
    channelPlans.find((item) => item.channel === "linkedin")?.channel ??
    channelPlans.find((item) => item.channel === "email")?.channel ??
    priorityChannels[0] ??
    "linkedin";

  const outboundCadence: MktCampaignReport["outboundCadence"] = [
    {
      step: "Toque 1",
      dayOffset: 0,
      channel: preferredOutboundChannel,
      action: "Primeiro contato com proposta de valor e contexto da Vertical Legal.",
      goal: "Abrir conversa e validar interesse inicial.",
    },
    {
      step: "Toque 2",
      dayOffset: 3,
      channel: preferredOutboundChannel,
      action: "Follow-up com prova de valor, ICP aderente e convite para conversa.",
      goal: "Aumentar taxa de resposta qualificada.",
    },
    {
      step: "Toque 3",
      dayOffset: 7,
      channel: preferredOutboundChannel,
      action: "Reforço com oferta de diagnóstico ou piloto guiado.",
      goal: "Converter interesse em reunião.",
    },
    {
      step: "Toque 4",
      dayOffset: 10,
      channel: "whatsapp",
      action: "Contato curto para destravar retorno quando houver relação prévia.",
      goal: "Recuperar contas mornas com menor fricção.",
    },
  ];

  const requiredAssets = dedupeStrings([
    "One-pager da Vertical Legal",
    "Mensagem base de outreach",
    ...extractList(sectionText(sections, ["Assets", "Materiais", "Peças", "Pecas"])),
  ]).slice(0, 8).map((item) => ({
    name: item,
    objective: "Apoiar ativação da campanha e conversão do público-alvo.",
    format: null,
    owner: null,
  }));

  const icp = dedupeStrings([
    ...audienceSegments,
    ...String(form.audience ?? "").split(/\s*-\s+/).filter((item) => item.trim().length > 0),
  ]).slice(0, 8).map((item, index) => ({
    cluster: inferIcpCluster(item),
    label: item,
    description: `Cluster com aderência potencial para ${item.toLowerCase()} e abertura para tecnologia jurídica.`,
    priority: index + 1,
  }));

  const qualificationCriteria: MktCampaignReport["qualificationCriteria"] = [
    {
      category: "lead",
      criteria: [
        "Tem aderência à especialidade priorizada",
        "Mostra abertura para tecnologia jurídica",
        "Tem decisor acessível para reunião comercial",
      ],
    },
    {
      category: "partner",
      criteria: [
        "Pode ampliar distribuição ou credibilidade da campanha",
        "Tem acesso ao público jurídico-alvo",
        "Consegue cocriar narrativa ou abrir portas comerciais",
      ],
    },
    {
      category: "pilot",
      criteria: [
        "Aceita testar a Vertical Legal em escopo inicial",
        "Tem maturidade para validar processo e feedback",
        "Tem caso real e urgência suficiente para execução assistida",
      ],
    },
  ];
  const icpScoring: MktCampaignReport["icpScoring"] = {
    positiveSignals: [
      "Especialidade aderente ao Tier prioritário",
      "Decisor com abertura para tecnologia jurídica",
      "Clientela majoritariamente empresarial",
      "Engajamento prévio com conteúdo jurídico-operacional",
    ],
    negativeSignals: [
      "Resistência explícita à tecnologia",
      "Atuação majoritária em PF sem demanda consultiva recorrente",
      "Baixa maturidade digital ou ausência de decisor acessível",
    ],
    scoreRules: [
      { criterion: "Especialidade Tier 1", score: 30, note: "Sinal positivo principal" },
      { criterion: "Cargo decisor", score: 25, note: "Sócio ou gestor com poder de compra" },
      { criterion: "Clientela B2B", score: 20, note: "Maior aderência à proposta inicial" },
      { criterion: "Abertura para tecnologia", score: 15, note: "Sinal de adoção mais rápida" },
      { criterion: "Engajamento em outreach", score: 10, note: "Aumenta prioridade de abordagem" },
      { criterion: "Resistência explícita a tecnologia", score: -30, note: "Desqualificar ou nutrir" },
    ],
    mqlThreshold: 60,
    sqlThreshold: 80,
  };

  const followUpPlan = dedupeStrings([
    ...extractList(sectionText(sections, ["Follow-up", "Plano de follow-up"])),
    "Revisar respostas após cada onda de outreach e reclassificar contas quentes, mornas e frias.",
    "Agendar reunião em até 48h para respostas positivas e manter segunda cadência para contas mornas.",
    "Encerrar contas sem resposta após o quarto toque e reciclar após 30 dias com novo gancho.",
  ]).slice(0, 6);

  const prioritizationPlan: MktCampaignReport["prioritizationPlan"] = [
    {
      horizonDays: 30,
      focus: "Definir tese, ICP e máquina inicial de prospecção.",
      actions: dedupeStrings([
        "Fechar lista inicial de contas e especialidades.",
        "Validar oferta, CTA e mensagens-base.",
        "Ativar LinkedIn, email e parceiros iniciais.",
      ]),
      expectedOutcome: "Pipeline inicial aberto com primeiras reuniões qualificadas.",
    },
    {
      horizonDays: 60,
      focus: "Otimizar canais e aprofundar qualificação.",
      actions: dedupeStrings([
        "Reforçar follow-up por cluster.",
        "Descartar canais fracos e ampliar os vencedores.",
        "Converter reuniões em pilotos ou parcerias.",
      ]),
      expectedOutcome: "Canal mais eficiente identificado e pipeline com contas priorizadas.",
    },
    {
      horizonDays: 90,
      focus: "Escalar com ativos vencedores e cases iniciais.",
      actions: dedupeStrings([
        "Transformar aprendizados em playbook.",
        "Usar pilotos e parceiros como prova social.",
        "Escalar contas semelhantes aos melhores clusters.",
      ]),
      expectedOutcome: "Campanha repetível com oferta validada e expansão previsível.",
    },
  ];
  const valuePropositionByArea = buildValuePropositionByArea(legalAreas);
  const coldEmailTemplates = buildColdEmailTemplates(legalAreas);
  const launchChecklist = buildLaunchChecklist(legalAreas, complianceFlags);

  const reportSections = buildSections({
    summary,
    positioning,
    offer,
    icp,
    channelPlans,
    outboundCadence,
    timeline,
    requiredAssets,
    kpis,
    followUpPlan,
    prioritizationPlan,
    nextActions,
  });

  const tableOfContents = reportSections.map((section, index) => ({
    id: section.id,
    title: section.title,
    anchor: section.anchor,
    order: index,
  }));

  return MktCampaignReportSchema.parse({
    schemaVersion: "mkt_campaign_report.v1",
    workspaceBrand: buildWorkspaceBrand(metadata),
    documentIdentity: buildDocumentIdentity({ metadata, recipeOrchestration }),
    reportSections,
    tableOfContents,
    campaignTitle: asTrimmedString(linkedRecipe?.title) ?? asTrimmedString(recipeOrchestration?.recipeTitle),
    objective,
    campaignSummary: summary,
    positioning,
    offer,
    audience: {
      primary: audiencePrimary,
      segments: audienceSegments,
      geography: [],
      notes: asTrimmedString(form.notes),
    },
    icp,
    icpScoring,
    coreMessage: firstNonEmpty(sectionText(sections, ["Mensagem principal", "Mensagem", "Posicionamento"]), asTrimmedString(form.toneNotes)),
    cta: firstNonEmpty(sectionText(sections, ["CTA"]), "Agendar conversa para avaliar aderência à Vertical Legal."),
    complianceFlags,
    valuePropositionByArea,
    priorityChannels,
    channelPlans,
    outboundCadence,
    timeline,
    requiredAssets,
    kpis,
    qualificationCriteria,
    coldEmailTemplates,
    launchChecklist,
    followUpPlan,
    prioritizationPlan,
    risks: dedupeStrings([
      "Evitar prometer capabilities ainda não homologadas.",
      ...extractList(sectionText(sections, ["Riscos", "Pontos de atenção", "Pontos de atencao"])),
    ]),
    riskLevel: recipeOrchestration?.riskLevel === "high" || recipeOrchestration?.riskLevel === "critical" ? "medium" : "low",
    nextActions,
    executiveGuidance: {
      adjustNow: nextActions.slice(0, 3),
      dependsOnInternalReview: [
        "Validar promessa comercial e limites da Vertical Legal com produto e jurídico.",
      ],
      rerunWhen: [
        "Após a primeira onda de outreach e coleta de respostas.",
      ],
      readyToLaunchWhen: [
        "ICP, canais, mensagem e materiais-base estiverem definidos.",
      ],
    },
  });
}
