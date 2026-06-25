import crypto from "node:crypto";

import {
  RecipeOrchestrationSchema,
  type RecipeOrchestration,
  type RecipeOrchestrationAgentKey,
} from "@eiah/core/actions/reporting/recipeOrchestrationSchema";

type PlainObject = Record<string, unknown>;

type LinkedRecipeContext = {
  id: string | null;
  agentId: string | null;
  title: string | null;
  summary: string | null;
  instructions: string | null;
  tags: string[];
  content: {
    mode: "simple" | "staged";
    goal: string | null;
    expectedOutcome: string | null;
    goCondition: string | null;
    blockCondition: string | null;
    steps: Array<{
      id: string;
      title: string;
      objective: string | null;
      checks: string[];
      evidence: string[];
      blocking: boolean;
    }>;
  } | null;
};

type SelfServiceAgent = {
  key: RecipeOrchestrationAgentKey;
  agentId: string;
  displayName: string;
};

const SELF_SERVICE_AGENTS: SelfServiceAgent[] = [
  { key: "guardian", agentId: "guardian", displayName: "Guardian" },
  { key: "mkt", agentId: "MKT", displayName: "MKT" },
  { key: "j_360", agentId: "J_360", displayName: "J_360" },
  { key: "pitch", agentId: "Pitch", displayName: "Pitch" },
  { key: "eiah", agentId: "EIAH", displayName: "EIAH" },
  { key: "finance", agentId: "fin-nexus", displayName: "FinNexus" },
];

type BuildRecipeOrchestrationParams = {
  agentId: string;
  tenantId?: string | null;
  workspaceId?: string | null;
  metadata: Record<string, unknown>;
  costCents?: number | null;
  availableAgents?: SelfServiceAgent[];
};

function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asTrimmedString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function extractLinkedRecipe(metadata: PlainObject): LinkedRecipeContext | null {
  if (!isPlainObject(metadata.linkedRecipe)) return null;
  const linkedRecipe = metadata.linkedRecipe;
  const content = isPlainObject(linkedRecipe.content)
    ? {
        mode: (linkedRecipe.content.mode === "staged" ? "staged" : "simple") as "staged" | "simple",
        goal: asTrimmedString(linkedRecipe.content.goal),
        expectedOutcome: asTrimmedString(linkedRecipe.content.expectedOutcome),
        goCondition: asTrimmedString(linkedRecipe.content.goCondition),
        blockCondition: asTrimmedString(linkedRecipe.content.blockCondition),
        steps: Array.isArray(linkedRecipe.content.steps)
          ? linkedRecipe.content.steps
              .filter((step): step is PlainObject => isPlainObject(step))
              .map((step) => ({
                id: asTrimmedString(step.id) ?? crypto.randomUUID(),
                title: asTrimmedString(step.title) ?? "Etapa sem título",
                objective: asTrimmedString(step.objective),
                checks: Array.isArray(step.checks)
                  ? step.checks.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
                  : [],
                evidence: Array.isArray(step.evidence)
                  ? step.evidence.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
                  : [],
                blocking: typeof step.blocking === "boolean" ? step.blocking : true,
              }))
          : [],
      }
    : null;
  return {
    id: asTrimmedString(linkedRecipe.id),
    agentId: asTrimmedString(linkedRecipe.agentId),
    title: asTrimmedString(linkedRecipe.title),
    summary: asTrimmedString(linkedRecipe.summary),
    instructions: asTrimmedString(linkedRecipe.instructions),
    tags: Array.isArray(linkedRecipe.tags)
      ? linkedRecipe.tags.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [],
    content,
  };
}

function normalizeText(value: string | null | undefined) {
  return value?.toLowerCase().normalize("NFKD") ?? "";
}

function includesAny(text: string, needles: string[]) {
  return needles.some((needle) => text.includes(needle));
}

function dedupe<T>(values: T[]) {
  return Array.from(new Set(values));
}

function dedupeStrings(values: Array<string | null | undefined>) {
  return dedupe(
    values
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value))
  );
}

function extractGovernanceContext(metadata: PlainObject) {
  if (!isPlainObject(metadata.governanceContext)) return null;
  const raw = metadata.governanceContext;
  return {
    tenantIdPresent: raw.tenantIdPresent !== false,
    workspaceIdPresent: raw.workspaceIdPresent !== false,
    rbacEvaluated: raw.rbacEvaluated === true,
    entitlementEvaluated: raw.entitlementEvaluated === true,
    trustScoreEvaluated: raw.trustScoreEvaluated === true,
    costGuardEvaluated: raw.costGuardEvaluated === true,
    policyDecision:
      raw.policyDecision === "denied" || raw.policyDecision === "needs_review"
        ? (raw.policyDecision as "denied" | "needs_review")
        : ("allowed" as const),
    reasonCode: asTrimmedString(raw.reasonCode),
    trustScore: typeof raw.trustScore === "number" && Number.isFinite(raw.trustScore) ? raw.trustScore : null,
    trustLevel:
      raw.trustLevel === "high" || raw.trustLevel === "medium" || raw.trustLevel === "low"
        ? raw.trustLevel
        : null,
  };
}

function mapAgentIdToKey(agentId: string | null | undefined): RecipeOrchestrationAgentKey {
  const normalized = normalizeText(agentId);
  if (normalized === "guardian") return "guardian";
  if (normalized === "eiah") return "eiah";
  if (normalized === "mkt") return "mkt";
  if (normalized === "j_360" || normalized === "j360") return "j_360";
  if (normalized === "pitch") return "pitch";
  if (normalized === "fin-nexus" || normalized === "finance") return "finance";
  if (normalized === "imob") return "imob";
  if (normalized === "legal") return "legal";
  if (normalized === "urban") return "urban";
  return "other";
}

function hasAgent(agents: SelfServiceAgent[], key: RecipeOrchestrationAgentKey) {
  return agents.some((agent) => agent.key === key);
}

function getAgentDisplayName(agents: SelfServiceAgent[], key: RecipeOrchestrationAgentKey) {
  return agents.find((agent) => agent.key === key)?.displayName ?? key;
}

function classifyRecipe(params: {
  linkedRecipe: LinkedRecipeContext;
  currentAgentKey: RecipeOrchestrationAgentKey;
}) {
  const requestedAgentKey = mapAgentIdToKey(params.linkedRecipe.agentId);
  const corpus = [
    params.linkedRecipe.title,
    params.linkedRecipe.summary,
    params.linkedRecipe.instructions,
    params.linkedRecipe.content?.goal,
    params.linkedRecipe.content?.expectedOutcome,
    params.linkedRecipe.content?.steps.map((step) => [step.title, step.objective, step.checks.join(" "), step.evidence.join(" ")].join(" ")).join(" "),
    params.linkedRecipe.tags.join(" "),
    params.linkedRecipe.agentId,
  ]
    .filter(Boolean)
    .join(" ");
  const text = normalizeText(corpus);

  const hasSensitiveData = includesAny(text, [
    "lgpd",
    "pii",
    "dado pessoal",
    "dados pessoais",
    "cpf",
    "email",
    "segredo",
    "contrato",
    "evidencia",
    "evidência",
    "audit trail",
    "receipt",
  ]);
  const isGoLive = includesAny(text, [
    "go-live",
    "go live",
    "rollback",
    "healthcheck",
    "/health",
    "waf",
    "dns",
    "receipt",
    "audit trail",
    "evidencia",
    "evidência",
  ]);
  const isLegal = includesAny(text, [
    "jurid",
    "legal",
    "contrato",
    "clausula",
    "cláusula",
    "compliance",
    "parecer",
  ]);
  const isPitch = includesAny(text, [
    "pitch",
    "apresenta",
    "apresentação",
    "anuncio",
    "anúncio",
    "campanha",
    "narrativa",
    "copy",
  ]);
  const isMarketing = requestedAgentKey === "mkt" || includesAny(text, [
    "marketing",
    "campanha",
    "outbound",
    "audiencia",
    "audiência",
    "linkedin",
    "parcerias",
    "cpl",
    "cac",
    "go-to-market",
    "go to market",
    "briefing de campanha",
  ]);
  const isImob = includesAny(text, [
    "imob",
    "imovel",
    "imóvel",
    "corretor",
    "proprietario",
    "proprietário",
    "locacao",
    "locação",
    "lead imobiliario",
    "lead imobiliário",
  ]);
  const isFinance = includesAny(text, [
    "finance",
    "financeiro",
    "pagamento",
    "recebimento",
    "cobranca",
    "cobrança",
    "fatura",
    "invoice",
  ]);
  const isUrban = includesAny(text, [
    "urbano",
    "prefeitura",
    "servico publico",
    "serviço público",
  ]);

  const isStructuredGoLivePlan =
    isGoLive && params.linkedRecipe.content?.mode === "staged" && (params.linkedRecipe.content?.steps.length ?? 0) > 1;
  const intent = requestedAgentKey === "mkt"
    ? "marketing_campaign"
    : isGoLive
    ? "go_live_validation"
    : isMarketing
    ? "marketing_campaign"
    : isLegal
    ? "legal_review"
    : isImob
    ? "imob_task"
    : isPitch
    ? "pitch_creation"
    : isFinance
    ? "financial_analysis"
    : isUrban
    ? "urban_service"
    : hasSensitiveData
    ? "evidence_collection"
    : params.currentAgentKey === "mkt"
    ? "marketing_campaign"
    : params.currentAgentKey === "pitch"
    ? "pitch_creation"
    : params.currentAgentKey === "j_360"
    ? "legal_review"
    : "general_task";

  const domain = requestedAgentKey === "mkt"
    ? "marketing"
    : isGoLive
    ? "guardian"
    : isMarketing
    ? "marketing"
    : isImob
    ? "imob"
    : isLegal
    ? "legal"
    : isPitch
    ? "pitch"
    : isFinance
    ? "finance"
    : isUrban
    ? "urban"
    : params.currentAgentKey === "mkt"
    ? "marketing"
    : params.currentAgentKey === "guardian"
    ? "guardian"
    : "general";

  const riskLevel = requestedAgentKey === "mkt"
    ? hasSensitiveData
      ? "medium"
      : "low"
    : isGoLive
    ? isStructuredGoLivePlan || hasSensitiveData
      ? "critical"
      : "high"
    : hasSensitiveData || isLegal || isFinance
    ? "high"
    : isImob || isUrban
    ? "medium"
    : isPitch
    ? "low"
    : "medium";

  return { intent, domain, riskLevel, hasSensitiveData, isGoLive, isLegal, isPitch, isMarketing, isImob, isFinance, isUrban };
}

function selectPrimaryAgent(params: {
  availableAgents: SelfServiceAgent[];
  classified: ReturnType<typeof classifyRecipe>;
  linkedRecipe: LinkedRecipeContext;
  currentAgentKey: RecipeOrchestrationAgentKey;
}) {
  const { availableAgents, classified, linkedRecipe, currentAgentKey } = params;
  const requestedAgentKey = mapAgentIdToKey(linkedRecipe.agentId);

  const choose = (key: RecipeOrchestrationAgentKey, fallback: RecipeOrchestrationAgentKey, reason: string, confidence: number) => {
    const selectedKey = hasAgent(availableAgents, key) ? key : fallback;
    const selectedReason =
      selectedKey === key
        ? reason
        : `${reason} Como o agente de domínio não está disponível no self-service atual, a recomendação recai para ${getAgentDisplayName(availableAgents, fallback)}.`;
    return {
      key: selectedKey,
      displayName: getAgentDisplayName(availableAgents, selectedKey),
      selectionReason: selectedReason,
      confidence,
    };
  };

  if (requestedAgentKey !== "other" && hasAgent(availableAgents, requestedAgentKey)) {
    const requestedDisplayName = getAgentDisplayName(availableAgents, requestedAgentKey);
    const explicitSelectionReason =
      linkedRecipe.agentId
        ? `A recipe foi publicada com o agente ${requestedDisplayName}; o orchestrator preserva esse líder como rota primária e usa a classificação apenas para apoio, risco e governança.`
        : "A recipe já está vinculada a um agente compatível com o domínio identificado, então ele permanece como líder recomendado.";
    return {
      key: requestedAgentKey,
      displayName: requestedDisplayName,
      selectionReason: explicitSelectionReason,
      confidence: 0.98,
    };
  }

  if (classified.isGoLive) {
    return choose("guardian", "eiah", "A receita descreve validação crítica, evidência auditável ou dado sensível, então o Guardian deve liderar a análise.", 0.95);
  }
  if (classified.isLegal) {
    return choose("j_360", "eiah", "A receita pede leitura jurídica, contratual ou de compliance, o que favorece um agente jurídico/documental.", 0.88);
  }
  if (classified.isPitch) {
    return choose("pitch", "eiah", "A receita é de comunicação, anúncio ou apresentação, então o agente de pitch é o líder mais aderente.", 0.9);
  }
  if (classified.isMarketing) {
    return choose("mkt", "eiah", "A receita é de campanha, aquisição ou posicionamento, então o agente MKT deve liderar a estratégia.", 0.92);
  }
  if (classified.isImob) {
    return choose("imob", "eiah", "A receita é imobiliária; se houver agente IMOB no catálogo ele lidera, caso contrário o EIAH assume a coordenação.", hasAgent(availableAgents, "imob") ? 0.85 : 0.7);
  }
  if (classified.isFinance) {
    return choose("finance", "eiah", "A receita é financeira e beneficia um agente especializado em cobrança, recebíveis ou análise financeira.", hasAgent(availableAgents, "finance") ? 0.84 : 0.72);
  }
  if (classified.isUrban) {
    return choose("urban", "eiah", "A receita é de serviço público/urbano; na ausência de agente de domínio o EIAH coordena o plano prático.", hasAgent(availableAgents, "urban") ? 0.82 : 0.7);
  }
  if (classified.hasSensitiveData) {
    return choose("guardian", "eiah", "A receita é geral, mas envolve PII, evidência ou material sensível, então o Guardian deve liderar a análise.", 0.9);
  }
  if (currentAgentKey !== "other" && hasAgent(availableAgents, currentAgentKey)) {
    return {
      key: currentAgentKey,
      displayName: getAgentDisplayName(availableAgents, currentAgentKey),
      selectionReason: "O domínio não ficou forte o bastante para redirecionar a receita; o agente atual segue como melhor default operacional.",
      confidence: 0.61,
    };
  }
  return {
    key: "eiah",
    displayName: getAgentDisplayName(availableAgents, "eiah"),
    selectionReason: "Sem confiança suficiente para um domínio mais específico, o EIAH é o resolvedor geral recomendado para orientar a conclusão da receita.",
    confidence: 0.55,
  };
}

function buildSuggestedAgents(params: {
  availableAgents: SelfServiceAgent[];
  primaryKey: RecipeOrchestrationAgentKey;
  classified: ReturnType<typeof classifyRecipe>;
  costKnown: boolean;
}) {
  const { availableAgents, primaryKey, classified, costKnown } = params;
  const suggestions: RecipeOrchestration["suggestedSelfServiceAgents"] = [];
  const estimatedCostStatus = costKnown ? "calculated" : "not_calculated";

  const push = (key: RecipeOrchestrationAgentKey, purpose: string) => {
    if (key === primaryKey || key === "guardian") return;
    if (!hasAgent(availableAgents, key)) return;
    if (suggestions.some((agent) => agent.key === key)) return;
    suggestions.push({
      key,
      displayName: getAgentDisplayName(availableAgents, key),
      purpose,
      canExecute: false,
      canAdvise: true,
      requiresApproval: false,
      requiredScope: null,
      estimatedCostStatus,
    });
  };

  if (classified.isGoLive || classified.hasSensitiveData) {
    push("eiah", "Traduzir a pendência em checklist prático e orientar a coleta dos insumos faltantes.");
    push("j_360", "Estruturar critério documental, evidência mínima e narrativa de risco antes do novo parecer.");
  } else if (classified.isMarketing) {
    push("pitch", "Ajudar a transformar a campanha em narrativa, assets e CTA mais fortes.");
    push("eiah", "Organizar execução, cadência e próximos passos operacionais da campanha.");
  } else if (classified.isLegal) {
    push("eiah", "Organizar os próximos passos operacionais para transformar o parecer em ação prática.");
  } else if (classified.isPitch) {
    push("eiah", "Ajudar a transformar o briefing em plano de execução, materiais e próximos passos objetivos.");
  } else if (classified.isImob || classified.isFinance || classified.isUrban) {
    push("eiah", "Conduzir o usuário na execução prática quando o agente de domínio não cobrir toda a operação.");
    push("j_360", "Apoiar critérios, documentação ou risco quando a receita exigir prova ou conformidade.");
  } else {
    push("eiah", "Apoiar a resolução prática e orientar o usuário sobre como concluir a receita.");
  }

  return suggestions;
}

function buildPracticalPlan(params: {
  classified: ReturnType<typeof classifyRecipe>;
  linkedRecipe: LinkedRecipeContext;
  primaryDisplayName: string;
  primaryKey: RecipeOrchestrationAgentKey;
  requiresGuardianReview: boolean;
}) {
  const { classified, linkedRecipe, primaryDisplayName, primaryKey, requiresGuardianReview } = params;
  const structuredSteps = linkedRecipe.content?.steps ?? [];
  const structuredPracticalSteps = structuredSteps.map((step, index) => {
    const checks = step.checks.slice(0, 2).join(", ");
    return `${index + 1}. ${step.title}${checks ? ` — checks: ${checks}` : ""}`;
  });
  const structuredRerunCriteria =
    linkedRecipe.content?.goCondition
      ? dedupeStrings(linkedRecipe.content.goCondition.split(/\r?\n|;/))
      : [];

  if (structuredSteps.length > 0) {
    return {
      practicalSteps: dedupe([
        ...structuredPracticalSteps,
        "Rerode a receita após concluir as etapas bloqueantes e consolidar as evidências pedidas.",
      ]).slice(0, 7),
      readyForRerunWhen: dedupe([
        ...structuredRerunCriteria,
        linkedRecipe.content?.expectedOutcome,
      ]).slice(0, 6),
    };
  }

  if (classified.isGoLive || classified.hasSensitiveData) {
    return {
      practicalSteps: [
        `Revise a receita com ${primaryDisplayName} para confirmar o escopo probatório e os bloqueios atuais.`,
        "Produza evidência válida de healthcheck, rollback, artefatos e guardrails antes de um novo avanço.",
        "Anexe somente evidências verificáveis e alinhadas à rota descrita na receita.",
        "Rerode a receita após consolidar as pendências críticas.",
      ],
      readyForRerunWhen: [
        "Healthcheck e demais evidências obrigatórias estiverem registrados.",
        "Rollback e critérios de segurança estiverem documentados.",
        requiresGuardianReview ? "O Guardian tiver material suficiente para um novo parecer." : "O líder recomendado indicar que o contexto está completo.",
      ],
    };
  }
  if (classified.isLegal) {
    return {
      practicalSteps: [
        `Concentre a análise inicial em ${primaryDisplayName} para revisar contrato, cláusulas ou risco.`,
        "Liste as dúvidas decisórias e os pontos que precisam de redação, ajuste ou evidência adicional.",
        requiresGuardianReview ? "Submeta o material ao Guardian apenas se houver dado sensível, prova crítica ou necessidade de governança." : "Consolide o parecer e execute os próximos passos operacionais.",
      ],
      readyForRerunWhen: [
        "As cláusulas ou requisitos críticos estiverem revisados.",
        "Os documentos de apoio estiverem anexados de forma verificável.",
      ],
    };
  }
  if (classified.isPitch) {
    return {
      practicalSteps: [
        `Use ${primaryDisplayName} para montar a narrativa principal, público e CTA.`,
        "Valide mensagens, restrições e materiais de apoio antes de gerar a entrega final.",
        requiresGuardianReview ? "Encaminhe ao Guardian só se surgirem dados sensíveis, evidência crítica ou aprovação de governança." : "Gere a saída final e revise a consistência do briefing.",
      ],
      readyForRerunWhen: ["Briefing, narrativa e materiais estiverem consistentes com a receita."],
    };
  }
  if (classified.isMarketing) {
    return {
      practicalSteps: [
        `Use ${primaryDisplayName} para fechar ICP, oferta e canais da campanha antes de escalar execução.`,
        "Defina a mensagem principal, CTA, cadência outbound e métricas mínimas por canal.",
        "Valide materiais, lista de contas e cronograma antes de ativar outreach ou parceiros.",
      ],
      readyForRerunWhen: [
        "ICP, oferta e canais prioritários estiverem definidos.",
        "Mensagens, metas e cronograma estiverem prontos para execução.",
      ],
    };
  }
  return {
    practicalSteps: [
      `Siga com ${primaryDisplayName} como líder recomendado para conduzir a receita.`,
      "Reúna contexto, objetivos, restrições e artefatos que ainda não estejam explícitos.",
      primaryKey === "eiah"
        ? "Use os agentes sugeridos apenas como apoio consultivo; a decisão final continua dependente da receita rerodada."
        : "Depois de completar os insumos faltantes, reexecute a receita para consolidar a decisão final.",
    ],
    readyForRerunWhen: [
      "Os insumos obrigatórios estiverem preenchidos.",
      "As limitações listadas tiverem sido tratadas ou documentadas.",
    ],
  };
}

function buildImplementationFollowUp(params: {
  classified: ReturnType<typeof classifyRecipe>;
  linkedRecipe: LinkedRecipeContext;
}) {
  const corpus = [
    params.linkedRecipe.title,
    params.linkedRecipe.summary,
    params.linkedRecipe.instructions,
    params.linkedRecipe.content?.goal,
    params.linkedRecipe.content?.expectedOutcome,
    params.linkedRecipe.tags.join(" "),
    params.linkedRecipe.content?.steps
      .map((step) => [step.title, step.objective, step.checks.join(" "), step.evidence.join(" ")].join(" "))
      .join(" "),
  ]
    .filter(Boolean)
    .join(" ");
  const text = normalizeText(corpus);

  const isGoLivePrincipal =
    params.classified.isGoLive &&
    params.linkedRecipe.content?.mode === "staged" &&
    (params.linkedRecipe.content?.steps.length ?? 0) > 1;

  const externalPlatformsInvolved = dedupe(
    [
      isGoLivePrincipal || text.includes("vercel") ? "Vercel" : null,
      isGoLivePrincipal || text.includes("aws") || text.includes("ecs") || text.includes("fargate") ? "AWS" : null,
      isGoLivePrincipal || text.includes("cloudflare") || text.includes("dns") || text.includes("waf") ? "Cloudflare" : null,
    ].filter((item): item is string => Boolean(item))
  );

  if (isGoLivePrincipal) {
    const recommendedRecipes = [
      {
        order: 1,
        title: "Validar publicação do app no Vercel",
        objective: "Confirmar domínio, build, env vars e segregação entre staging e produção do frontend.",
        externalPlatform: "Vercel",
      },
      {
        order: 2,
        title: "Validar publicação da API na AWS",
        objective: "Confirmar serviço, healthcheck, database connected e segregação real da API entre staging e produção.",
        externalPlatform: "AWS",
      },
      {
        order: 3,
        title: "Validar DNS, TLS e exposição pública no Cloudflare",
        objective: "Confirmar DNS, certificados, WAF, rate limit e proteção de borda nas rotas públicas.",
        externalPlatform: "Cloudflare",
      },
      {
        order: 4,
        title: "Validar integração fim a fim entre app, API e borda",
        objective: "Garantir que produção consome produção, staging consome staging e que o smoke funcional está íntegro.",
        externalPlatform: null,
      },
      {
        order: 5,
        title: "Validar rollback e evidências finais de go-live",
        objective: "Fechar rollback, bundle probatório, receipt e verify_url antes da promoção definitiva.",
        externalPlatform: null,
      },
    ];

    return {
      howToProceedNow: [
        "Use este GO como validação do plano principal; agora execute as mudanças reais nas plataformas externas envolvidas.",
        "Trate as recipes recomendadas abaixo como backlog operacional por plataforma, em vez de manter uma recipe gigante e genérica.",
        "Após cada ajuste relevante, preserve evidências e rode a recipe correspondente para confirmar a etapa.",
      ],
      recommendedRecipes,
      externalPlatformsInvolved,
      nextBestImplementationAction: recommendedRecipes[0]?.title ?? null,
    };
  }

  if (externalPlatformsInvolved.length > 0) {
    return {
      howToProceedNow: [
        "Use a saída desta recipe para orientar a implementação nas plataformas externas envolvidas.",
        "Quebre o trabalho em recipes menores por sistema externo e rerode após cada ajuste confirmado.",
      ],
      recommendedRecipes: [] as Array<{
        order: number;
        title: string;
        objective: string;
        externalPlatform: string | null;
      }>,
      externalPlatformsInvolved,
      nextBestImplementationAction: "Criar a próxima recipe operacional específica da plataforma externa mais crítica.",
    };
  }

  if (params.classified.isMarketing) {
    const recommendedRecipes = [
      {
        order: 1,
        title: "Definir ICP e segmentação da Vertical Legal",
        objective: "Priorizar escritórios, decisores e especialidades com maior aderência para parceria, piloto ou adoção inicial.",
        externalPlatform: null,
      },
      {
        order: 2,
        title: "Definir narrativa comercial e proposta de valor da campanha",
        objective: "Fechar tese, diferenciais, mensagem principal e CTA sem prometer capabilities não homologadas.",
        externalPlatform: null,
      },
      {
        order: 3,
        title: "Executar outreach em LinkedIn e email outbound",
        objective: "Rodar cadência inicial com scripts, follow-up e critérios claros de qualificação.",
        externalPlatform: "LinkedIn",
      },
      {
        order: 4,
        title: "Estruturar parcerias e comunidades jurídicas prioritárias",
        objective: "Mapear associações, eventos e parceiros setoriais para ampliar distribuição e credibilidade.",
        externalPlatform: null,
      },
      {
        order: 5,
        title: "Medir pipeline, respostas e pilotos abertos",
        objective: "Consolidar KPIs, revisar canal por canal e rerodar a recipe com base em conversão real.",
        externalPlatform: null,
      },
    ];

    return {
      howToProceedNow: [
        "Use esta saída para ativar uma campanha executável, não apenas como brainstorming de marketing.",
        "Comece por ICP, narrativa e lista de contas antes de ampliar canais ou orçamento.",
        "Rerode a recipe depois da primeira onda de outreach para recalibrar canais, mensagens e qualificação.",
      ],
      recommendedRecipes,
      externalPlatformsInvolved: dedupe([
        text.includes("linkedin") ? "LinkedIn" : null,
        text.includes("email") || text.includes("outbound") ? "Email" : null,
      ].filter((item): item is string => Boolean(item))),
      nextBestImplementationAction: recommendedRecipes[0]?.title ?? null,
    };
  }

  if (params.classified.isLegal) {
    const recommendedRecipes = [
      {
        order: 1,
        title: "Validar natureza não salarial da política de premiação",
        objective: "Revisar se a redação sustenta liberalidade, desempenho extraordinário e ausência de integração salarial.",
        externalPlatform: null,
      },
      {
        order: 2,
        title: "Validar critérios objetivos e risco de habitualidade",
        objective: "Confirmar que os critérios são verificáveis, não automáticos e não descrevem apenas o trabalho ordinário.",
        externalPlatform: null,
      },
      {
        order: 3,
        title: "Validar base de cálculo, reduções e proporcionalidade",
        objective: "Eliminar ambiguidades de cálculo e reduzir risco de leitura como penalidade disciplinar indireta.",
        externalPlatform: null,
      },
      {
        order: 4,
        title: "Validar transparência, demonstrativo e evidências do ciclo",
        objective: "Definir relatório mensal, documentação mínima e critérios auditáveis para o empregado e para a empresa.",
        externalPlatform: null,
      },
      {
        order: 5,
        title: "Validar versão final para uso interno com revisão jurídica humana",
        objective: "Submeter a redação consolidada à revisão humana final antes de aplicar a política.",
        externalPlatform: null,
      },
    ];

    return {
      howToProceedNow: [
        "Use esta saída como análise preliminar para priorizar ajustes documentais, não como validação jurídica definitiva.",
        "Ataque primeiro natureza jurídica, critérios objetivos e base de cálculo; esses pontos concentram o maior risco trabalhista.",
        "Depois de revisar a minuta e reunir evidências do processo real de apuração, rerode a recipe antes da revisão humana final.",
      ],
      recommendedRecipes,
      externalPlatformsInvolved: [] as string[],
      nextBestImplementationAction: recommendedRecipes[0]?.title ?? null,
    };
  }

  return {
    howToProceedNow: [] as string[],
    recommendedRecipes: [] as Array<{
      order: number;
      title: string;
      objective: string;
      externalPlatform: string | null;
    }>,
    externalPlatformsInvolved: [] as string[],
    nextBestImplementationAction: null as string | null,
  };
}

export function buildRecipeOrchestration(params: BuildRecipeOrchestrationParams): RecipeOrchestration | null {
  const linkedRecipe = extractLinkedRecipe(params.metadata);
  if (!linkedRecipe) return null;

  const availableAgents = params.availableAgents ?? SELF_SERVICE_AGENTS;
  const currentAgentKey = mapAgentIdToKey(params.agentId);
  const classified = classifyRecipe({ linkedRecipe, currentAgentKey });
  const primaryAgent = selectPrimaryAgent({
    availableAgents,
    classified,
    linkedRecipe,
    currentAgentKey,
  });
  const requiresGuardianReview =
    primaryAgent.key === "guardian" || classified.riskLevel === "high" || classified.riskLevel === "critical" || classified.hasSensitiveData;
  const guardianReviewReason = dedupe(
    [
      primaryAgent.key === "guardian" ? "A receita exige validação sensível, probatória ou crítica." : null,
      classified.hasSensitiveData ? "Há indício de PII, contrato, evidência ou material sensível." : null,
      classified.riskLevel === "high" || classified.riskLevel === "critical" ? `O risco detectado é ${classified.riskLevel}.` : null,
    ].filter((item): item is string => Boolean(item))
  );
  const governance = {
    tenantIdPresent: Boolean(asTrimmedString(params.tenantId)),
    workspaceIdPresent: Boolean(asTrimmedString(params.workspaceId)),
    rbacEvaluated: false,
    entitlementEvaluated: false,
    trustScoreEvaluated: false,
    costGuardEvaluated: typeof params.costCents === "number",
    policyDecision: "allowed" as "allowed" | "denied" | "needs_review",
    reasonCode: null as string | null,
  };
  const governanceContext = extractGovernanceContext(params.metadata);

  if (governanceContext) {
    governance.tenantIdPresent = governanceContext.tenantIdPresent;
    governance.workspaceIdPresent = governanceContext.workspaceIdPresent;
    governance.rbacEvaluated = governanceContext.rbacEvaluated;
    governance.entitlementEvaluated = governanceContext.entitlementEvaluated;
    governance.trustScoreEvaluated = governanceContext.trustScoreEvaluated;
    governance.costGuardEvaluated = governanceContext.costGuardEvaluated;
    governance.policyDecision = governanceContext.policyDecision;
    governance.reasonCode = governanceContext.reasonCode;
  }

  if (!governance.tenantIdPresent || !governance.workspaceIdPresent) {
    governance.policyDecision = "denied";
    governance.reasonCode = "RECIPE_ORCHESTRATION_CONTEXT_MISSING";
  }

  const suggestedSelfServiceAgents = buildSuggestedAgents({
    availableAgents,
    primaryKey: primaryAgent.key as RecipeOrchestrationAgentKey,
    classified,
    costKnown: typeof params.costCents === "number",
  });

  const supportMode: RecipeOrchestration["supportMode"] =
    governance.policyDecision === "denied"
      ? suggestedSelfServiceAgents.length > 0
        ? "suggest_only"
        : "external_handoff"
      : suggestedSelfServiceAgents.length > 0
      ? "delegate_assisted"
      : classified.riskLevel === "high" || classified.riskLevel === "critical"
      ? "suggest_only"
      : "none";

  const limitations = dedupe(
    [
      !governance.tenantIdPresent || !governance.workspaceIdPresent
        ? "Tenant/workspace ausente: a plataforma só pode orientar, não preparar delegação futura."
        : null,
      primaryAgent.key === "eiah" && ["imob", "urban"].includes(classified.domain)
        ? `Não há agente ${classified.domain} disponível no self-service atual; o EIAH assume como fallback operacional.`
        : null,
      requiresGuardianReview && primaryAgent.key !== "guardian"
        ? "O Guardian entra apenas como gate/review de governança, não como resolvedor auxiliar genérico."
        : null,
      suggestedSelfServiceAgents.length === 0 && supportMode !== "none"
        ? "Nenhum agente self-service adicional foi identificado como apoio confiável para esta receita."
        : null,
    ].filter((item): item is string => Boolean(item))
  );

  const plan = buildPracticalPlan({
    classified,
    linkedRecipe,
    primaryDisplayName: primaryAgent.displayName,
    primaryKey: primaryAgent.key as RecipeOrchestrationAgentKey,
    requiresGuardianReview,
  });
  const implementationFollowUp = buildImplementationFollowUp({
    classified,
    linkedRecipe,
  });

  return RecipeOrchestrationSchema.parse({
    schemaVersion: "recipe_orchestration.v1",
    source: "recipe_run",
    recipeId: linkedRecipe.id,
    recipeTitle: linkedRecipe.title,
    recipeGoal: linkedRecipe.content?.goal ?? null,
    recipeExpectedOutcome: linkedRecipe.content?.expectedOutcome ?? null,
    recipeSteps:
      linkedRecipe.content?.steps.map((step) => ({
        id: step.id,
        title: step.title,
        objective: step.objective ?? "",
        checks: step.checks,
        evidence: step.evidence,
        blocking: step.blocking,
      })) ?? [],
    intent: classified.intent,
    domain: classified.domain,
    riskLevel: classified.riskLevel,
    primaryAgent,
    requiresGuardianReview,
    guardianReviewReason,
    supportMode,
    allowedSelfServiceAgents: dedupe(availableAgents.map((agent) => agent.key)),
    suggestedSelfServiceAgents,
    limitations,
    howToProceedNow: implementationFollowUp.howToProceedNow,
    recommendedRecipes: implementationFollowUp.recommendedRecipes,
    externalPlatformsInvolved: implementationFollowUp.externalPlatformsInvolved,
    nextBestImplementationAction: implementationFollowUp.nextBestImplementationAction,
    practicalSteps: plan.practicalSteps,
    readyForRerunWhen: plan.readyForRerunWhen,
    governance,
    audit: {
      orchestrationDecisionId: crypto
        .createHash("sha1")
        .update([linkedRecipe.id, linkedRecipe.title, classified.intent, primaryAgent.key].join(":"))
        .digest("hex"),
      selectedAt: new Date().toISOString(),
      basedOnPattern: "chat_imob_orchestrator",
    },
  });
}
