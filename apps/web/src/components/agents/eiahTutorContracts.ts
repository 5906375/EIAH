import type { LauncherAccessContext } from "@/components/agents/chatLauncherEngine";

export type TutorResponseMode =
  | "direct_answer"
  | "guided_steps"
  | "diagnostic_checklist"
  | "concept_explanation"
  | "onboarding_tutor"
  | "blocked_with_reason";

export type TutorPolicyV1 = {
  version: "1.0.0";
  agent: "EIAH";
  rules: {
    preferCanonicalKnowledge: boolean;
    askClarificationWhenAmbiguous: boolean;
    maxClarificationQuestions: number;
    handoffWhen: Array<"critical_action" | "deep_vertical_need">;
    blockWhen: Array<"missing_entitlement" | "missing_workspace_context">;
  };
};

export type IntentLibraryEntryV1 = {
  intentId: string;
  examples: string[];
  aliases?: string[];
  priority?: number;
  mapsToKnowledgeId: string;
  defaultPatternId: string;
};

export type ResponsePatternV1 = {
  patternId: string;
  mode: TutorResponseMode;
  shape: {
    opening: string;
    body: string;
    closing: string;
  };
};

export type KnowledgeUnitV1 = {
  id: string;
  title: string;
  vertical: "core" | "imob" | "legal";
  topic: string;
  problemItSolves: string;
  canonicalAnswer: string;
  stepByStep: string[];
  nextActions: string[];
  responseBody?: string;
};

const TUTOR_FALLBACK_INTENT_ID = "platform_overview_fallback";

function buildPastedContextExpandedReply() {
  return {
    intentId: "pasted_context_overview",
    content: [
      "**Entendi o contexto que você colou. Aqui vai a versão ampliada:**",
      "",
      "Quando você fala de `Runs`, o foco é execução prática:",
      "- simular antes de executar",
      "- acompanhar status e resultado",
      "- iterar até chegar no resultado esperado",
      "",
      "Quando você fala de `Chat`, o foco é orientação e escolha de especialista:",
      "- começar com o EIAH para triagem",
      "- chamar especialista quando precisar profundidade",
      "- seguir próximos passos guiados no próprio chat",
      "",
      "Quando você fala de `Billing`, o foco é custo e uso:",
      "- plano ativo",
      "- consumo de runs/usuários",
      "- faturas e cobrança",
      "",
      "Se você quiser, eu já te explico em detalhe apenas uma área agora.",
      "Escolha: Runs, Chat, Billing, Economy, Marketplace, Self-service ou Perfil.",
    ].join("\n"),
    quickReplies: [
      "Entender Runs",
      "Entender Chat",
      "Entender Billing",
      "Entender Marketplace",
      "Me mostre o caminho mais rápido",
    ],
  };
}

export const tutorPolicyV1: TutorPolicyV1 = {
  version: "1.0.0",
  agent: "EIAH",
  rules: {
    preferCanonicalKnowledge: true,
    askClarificationWhenAmbiguous: true,
    maxClarificationQuestions: 1,
    handoffWhen: ["critical_action", "deep_vertical_need"],
    blockWhen: ["missing_entitlement", "missing_workspace_context"],
  },
};

export const intentLibraryV1: IntentLibraryEntryV1[] = [
  {
    intentId: "agents_empty_state",
    examples: [
      "quero ver agentes disponiveis",
      "quero ver agentes disponíveis",
      "por que não aparece nenhum agente aqui",
      "não aparece agente",
      "seletor vazio",
      "não tem agente aqui",
    ],
    aliases: ["agentes vazios", "lista de agentes vazia"],
    mapsToKnowledgeId: "agents.empty_state.no_agents_available",
    defaultPatternId: "one_line_plus_3_checks",
  },
  {
    intentId: "top_menu_overview",
    examples: [
      "explique o menu acima",
      "me explica as páginas acima",
      "quero saber sobre páginas",
      "quero saber sobre paginas",
      "me fale sobre as páginas",
      "me fale sobre as paginas",
      "menu principal",
      "o que significa cada página",
      "entender páginas",
      "entender paginas",
      "quais páginas",
      "quais paginas",
    ],
    aliases: ["menu de cima", "barra de menu"],
    mapsToKnowledgeId: "platform.top_menu.quick_overview",
    defaultPatternId: "concept_explanation_short",
  },
  {
    intentId: "best_page_for_goal",
    examples: [
      "me mostre o caminho mais rapido",
      "me mostre o caminho mais rápido",
      "qual dessas paginas e a melhor para o seu objetivo",
      "qual dessas páginas é a melhor para o seu objetivo",
      "qual pagina e melhor para meu objetivo",
      "qual página é melhor para meu objetivo",
      "qual pagina devo usar agora",
      "qual página devo usar agora",
    ],
    aliases: ["melhor pagina para meu objetivo", "por onde comeco nas paginas"],
    mapsToKnowledgeId: "platform.page_recommendation.quick",
    defaultPatternId: "concept_explanation_short",
  },
  {
    intentId: "platform_overview",
    examples: [
      "explicar plataforma",
      "plataforma como um todo",
      "explique a plataforma",
      "como a plataforma funciona",
      "quero entender como funciona",
      "entender como funciona",
      "como funciona",
      "o que dá para fazer no site",
      "o que posso fazer aqui",
    ],
    aliases: ["visão geral da plataforma", "como funciona o eiah"],
    mapsToKnowledgeId: "platform.overview.quick",
    defaultPatternId: "concept_explanation_short",
  },
  {
    intentId: "chat_page_overview",
    examples: [
      "entender agentes",
      "entender chat",
      "como funciona agentes",
      "como funciona o chat",
      "explica agentes",
      "explica chat",
    ],
    aliases: ["pagina de agentes", "página de agentes", "pagina de chat", "página de chat"],
    mapsToKnowledgeId: "platform.chat.page.quick",
    defaultPatternId: "concept_explanation_short",
  },
  {
    intentId: "chat_vs_chat_imob",
    examples: [
      "qual a diferenca entre chat e chat imob",
      "qual a diferença entre chat e chat imob",
      "quando usar chat imob",
      "chat versus chat imob",
    ],
    aliases: ["chat vs chat imob", "diferença entre chat e chat imob"],
    mapsToKnowledgeId: "platform.chat.vs_imob.quick",
    defaultPatternId: "concept_explanation_short",
  },
  {
    intentId: "chat_triage_overview",
    examples: [
      "como funciona a triagem do eiah",
      "como o eiah faz triagem",
      "triagem do eiah",
    ],
    aliases: ["triagem eiah", "triagem do chat"],
    mapsToKnowledgeId: "platform.chat.triage.quick",
    defaultPatternId: "concept_explanation_short",
  },
  {
    intentId: "chat_handoff_overview",
    examples: [
      "como o eiah faz handoff para especialista",
      "como funciona o handoff para especialista",
      "handoff para especialista",
    ],
    aliases: ["handoff especialista", "encaminhamento para especialista"],
    mapsToKnowledgeId: "platform.chat.handoff.quick",
    defaultPatternId: "concept_explanation_short",
  },
  {
    intentId: "chat_vs_runs",
    examples: [
      "quando usar chat versus runs",
      "qual a diferenca entre chat e runs",
      "qual a diferença entre chat e runs",
      "chat vs runs",
    ],
    aliases: ["chat versus runs", "diferença entre chat e runs"],
    mapsToKnowledgeId: "platform.chat.vs_runs.quick",
    defaultPatternId: "concept_explanation_short",
  },
  {
    intentId: "agents_page_overview",
    priority: 5,
    examples: [
      "explicar agentes",
      "agentes",
      "como funciona a area de agentes",
      "como funciona a área de agentes",
      "como funciona a pagina de agentes",
      "como funciona a página de agentes",
      "entender area de agentes",
      "entender área de agentes",
    ],
    aliases: ["area de agentes", "área de agentes", "pagina de agentes", "página de agentes"],
    mapsToKnowledgeId: "agents.page.overview.quick",
    defaultPatternId: "concept_explanation_short",
  },
  {
    intentId: "agents_card_reading",
    examples: [
      "como ler os cards dos agentes",
      "como ler os cards de agentes",
      "como ler inventario governado de agentes",
      "como ler inventário governado de agentes",
    ],
    aliases: ["cards dos agentes", "inventario de agentes", "inventário de agentes"],
    mapsToKnowledgeId: "agents.inventory.reading.quick",
    defaultPatternId: "concept_explanation_short",
  },
  {
    intentId: "eiah_vs_specialist",
    examples: [
      "quando usar o eiah e quando usar especialista",
      "qual a diferenca entre eiah e especialista",
      "qual a diferença entre eiah e especialista",
      "quando usar especialista",
    ],
    aliases: ["eiah vs especialista", "diferença entre eiah e especialista"],
    mapsToKnowledgeId: "agents.eiah_vs_specialist.quick",
    defaultPatternId: "concept_explanation_short",
  },
  {
    intentId: "agents_choose_for_goal",
    examples: [
      "qual agente devo usar para meu objetivo",
      "qual agente devo usar",
      "que agente devo usar",
      "qual especialista devo usar",
    ],
    aliases: ["escolher agente para meu objetivo", "agente certo para meu objetivo"],
    mapsToKnowledgeId: "agents.choose_for_goal.quick",
    defaultPatternId: "concept_explanation_short",
  },
  {
    intentId: "run_create_help",
    examples: [
      "como criar um run no eiah",
      "como criar run",
      "criar run",
      "runs",
      "entender runs",
    ],
    aliases: ["abrir criação de run", "run criar"],
    mapsToKnowledgeId: "runs.create.how_to",
    defaultPatternId: "guided_steps_with_shortcut",
  },
  {
    intentId: "billing_overview",
    examples: [
      "explicar billing",
      "como funciona o billing",
      "billing",
      "invoice",
      "cobranca",
    ],
    aliases: ["cobrança", "fatura", "plano e cobrança"],
    mapsToKnowledgeId: "billing.overview.quick",
    defaultPatternId: "concept_explanation_short",
  },
  {
    intentId: "billing_where_see_price",
    examples: [
      "onde vejo o preco",
      "onde vejo o preço",
      "onde vejo tabela de preços",
      "onde vejo tabela de precos",
      "onde vejo pricing",
    ],
    aliases: ["ver preço", "ver preco", "pricing oficial"],
    mapsToKnowledgeId: "billing.where_see_price.quick",
    defaultPatternId: "concept_explanation_short",
  },
  {
    intentId: "billing_price_vs_consumption",
    examples: [
      "qual a diferenca entre pricing e billing",
      "qual a diferença entre pricing e billing",
      "qual a diferenca entre preco e billing",
      "qual a diferença entre preço e billing",
      "qual a diferenca entre pricing consumo e reconciliacao",
      "qual a diferença entre pricing consumo e reconciliação",
    ],
    aliases: ["pricing vs billing", "preço vs billing", "consumo vs pricing"],
    mapsToKnowledgeId: "billing.price_vs_consumption.quick",
    defaultPatternId: "concept_explanation_short",
  },
  {
    intentId: "economy_overview",
    examples: [
      "como funciona a pagina economy",
      "como funciona a página economy",
      "economy",
      "entender economy",
      "explica economy",
    ],
    aliases: ["impacto e oportunidades", "pagina economy", "página economy"],
    mapsToKnowledgeId: "economy.overview.quick",
    defaultPatternId: "concept_explanation_short",
  },
  {
    intentId: "economy_prioritization",
    examples: [
      "como priorizar oportunidades",
      "como priorizar oportunidades na economy",
      "como priorizar impacto",
    ],
    aliases: ["priorizar oportunidades", "priorizar impacto"],
    mapsToKnowledgeId: "economy.prioritization.quick",
    defaultPatternId: "concept_explanation_short",
  },
  {
    intentId: "economy_vs_billing_runs",
    examples: [
      "qual a diferenca entre economy billing e runs",
      "qual a diferença entre economy billing e runs",
      "como ligar economy com runs e billing",
      "economy vs billing vs runs",
    ],
    aliases: ["economy billing runs", "diferenca economy e billing"],
    mapsToKnowledgeId: "economy.vs.billing_runs.quick",
    defaultPatternId: "concept_explanation_short",
  },
  {
    intentId: "marketplace_overview",
    examples: [
      "como funciona o marketplace",
      "marketplace",
      "entender marketplace",
      "explica marketplace",
    ],
    aliases: ["pagina marketplace", "página marketplace"],
    mapsToKnowledgeId: "marketplace.overview.quick",
    defaultPatternId: "concept_explanation_short",
  },
  {
    intentId: "marketplace_installation_status",
    examples: [
      "o que significa nao instalado",
      "o que significa não instalado",
      "como saber se o agente foi habilitado",
      "como saber se o modulo foi habilitado",
      "como saber se o módulo foi habilitado",
    ],
    aliases: ["nao instalado", "não instalado", "status de instalação", "status de instalacao"],
    mapsToKnowledgeId: "marketplace.installation_status.quick",
    defaultPatternId: "concept_explanation_short",
  },
  {
    intentId: "marketplace_billing_relation",
    examples: [
      "ativar no marketplace gera cobranca",
      "ativar no marketplace gera cobrança",
      "qual a relacao entre marketplace e cobranca",
      "qual a relação entre marketplace e cobrança",
    ],
    aliases: ["marketplace e billing", "marketplace e cobrança", "marketplace e cobranca"],
    mapsToKnowledgeId: "marketplace.billing_relation.quick",
    defaultPatternId: "concept_explanation_short",
  },
  {
    intentId: "profile_overview",
    examples: [
      "como funciona a pagina perfil",
      "como funciona a página perfil",
      "entender perfil",
      "explica perfil",
      "perfil",
    ],
    aliases: ["pagina perfil", "página perfil", "conta e workspace"],
    mapsToKnowledgeId: "profile.overview.quick",
    defaultPatternId: "concept_explanation_short",
  },
  {
    intentId: "self_service_overview",
    examples: [
      "como funciona o self-service",
      "self service",
      "formulario guiado",
    ],
    aliases: ["fluxo guiado"],
    mapsToKnowledgeId: "self_service.overview.quick",
    defaultPatternId: "concept_explanation_short",
  },
  {
    intentId: "recipes_overview",
    examples: [
      "qual a diferenca entre draft e homologado",
      "qual a diferença entre draft e homologado",
      "como funcionam recipes",
      "recipes",
      "quero ver recipes",
    ],
    aliases: ["recipe", "homologar recipe", "catalogo interno homologado"],
    mapsToKnowledgeId: "self_service.recipes.overview",
    defaultPatternId: "concept_explanation_short",
  },
  {
    intentId: "tenant_recipes_simple_explanation",
    examples: [
      "o que sao tenant recipes",
      "o que são tenant recipes",
      "explicacao simples tenant recipes",
      "explicação simples tenant recipes",
      "catalogo interno homologado",
      "catálogo interno homologado",
    ],
    aliases: [
      "tenant recipes",
      "catálogo interno homologado",
      "catalogo interno homologado",
      "resumo simples recipes",
    ],
    priority: 5,
    mapsToKnowledgeId: "self_service.recipes.tenant.simple",
    defaultPatternId: "concept_explanation_short",
  },
  {
    intentId: "tenant_recipes_operational_explanation",
    examples: [
      "como publicar recipe no tenant",
      "como liberar recipe homologada para workspace",
      "como saber se recipe esta homologada",
      "como as tenant recipes padronizam uso dos agentes",
      "explicacao operacional tenant recipes",
      "explicação operacional tenant recipes",
    ],
    aliases: [
      "publicar tenant recipe",
      "liberar recipe por workspace",
      "onboarding com tenant recipes",
      "operacao recipes",
      "operação recipes",
    ],
    priority: 8,
    mapsToKnowledgeId: "self_service.recipes.tenant.operational",
    defaultPatternId: "guided_steps_with_shortcut",
  },
  {
    intentId: "tenant_recipes_governance_explanation",
    examples: [
      "explicacao de governanca tenant recipes",
      "explicação de governança tenant recipes",
      "como evitar drift em recipes",
      "por que so recipes homologadas ficam disponiveis",
      "como tenant recipes ajudam na auditoria",
      "como uma recipe entra no catalogo homologado",
    ],
    aliases: [
      "governanca de recipes",
      "governança de recipes",
      "auditoria recipes",
      "controle tenant recipes",
      "homologacao de recipe",
      "homologação de recipe",
    ],
    priority: 8,
    mapsToKnowledgeId: "self_service.recipes.tenant.governance",
    defaultPatternId: "concept_explanation_short",
  },
  {
    intentId: "access_check",
    examples: [
      "verificar acesso",
      "chec ar acesso",
      "checar acesso",
      "validar acesso",
      "conferir acesso",
    ],
    aliases: ["meu acesso", "acesso do workspace", "acesso ativo"],
    mapsToKnowledgeId: "access.check.workspace",
    defaultPatternId: "concept_explanation_short",
  },
  {
    intentId: "workspace_select_help",
    examples: [
      "selecionar workspace",
      "trocar workspace",
      "mudar workspace",
      "escolher workspace",
    ],
    aliases: ["workspace correto", "como selecionar workspace"],
    mapsToKnowledgeId: "workspace.select.how_to",
    defaultPatternId: "guided_steps_with_shortcut",
  },
  {
    intentId: "preview_vs_production",
    examples: [
      "qual a diferenca entre preview e producao",
      "qual a diferença entre preview e produção",
      "diferenca entre simular e rodar",
      "preview",
    ],
    aliases: ["promover para producao", "rodar agora", "simular"],
    mapsToKnowledgeId: "runs.preview_vs_production",
    defaultPatternId: "concept_explanation_short",
  },
  {
    intentId: "agent_not_enabled",
    examples: [
      "por que o agente nao esta habilitado no workspace",
      "por que o agente não está habilitado no workspace",
      "agente nao habilitado",
      "agent not enabled",
    ],
    aliases: ["nao esta habilitado no workspace", "não está habilitado no workspace"],
    mapsToKnowledgeId: "agents.enablement.not_enabled",
    defaultPatternId: "concept_explanation_short",
  },
  {
    intentId: "agent_enablement_requirements",
    examples: [
      "habilitar agente no workspace",
      "liberar agente no workspace",
      "enablement do agente",
      "assignment do agente",
    ],
    aliases: ["como liberar agente", "como habilitar agente"],
    mapsToKnowledgeId: "agents.enablement.requirements",
    defaultPatternId: "concept_explanation_short",
  },
  {
    intentId: "run_status_help",
    examples: [
      "acompanho o status",
      "acompanhar status",
      "status de uma run",
      "status em tempo real",
    ],
    aliases: ["acompanhar run", "status run"],
    mapsToKnowledgeId: "runs.status.realtime",
    defaultPatternId: "guided_steps_with_shortcut",
  },
  {
    intentId: "common_risks",
    examples: [
      "riscos comuns",
      "quais riscos",
    ],
    aliases: ["riscos no uso", "riscos do fluxo"],
    mapsToKnowledgeId: "platform.common_risks",
    defaultPatternId: "concept_explanation_short",
  },
  {
    intentId: "next_steps_generic",
    examples: [
      "proximos passos",
      "próximos passos",
    ],
    aliases: ["qual próximo passo", "como seguir agora"],
    mapsToKnowledgeId: "platform.next_steps.generic",
    defaultPatternId: "concept_explanation_short",
  },
];

export const responsePatternsV1: ResponsePatternV1[] = [
  {
    patternId: "one_line_plus_3_checks",
    mode: "diagnostic_checklist",
    shape: {
      opening: "one_line_reason",
      body: "three_checks",
      closing: "single_primary_cta",
    },
  },
  {
    patternId: "concept_explanation_short",
    mode: "concept_explanation",
    shape: {
      opening: "label",
      body: "short_bullets",
      closing: "next_step_offer",
    },
  },
  {
    patternId: "guided_steps_with_shortcut",
    mode: "guided_steps",
    shape: {
      opening: "how_to_title",
      body: "ordered_steps",
      closing: "shortcut",
    },
  },
];

export const knowledgeUnitsV1: KnowledgeUnitV1[] = [
  {
    id: "agents.empty_state.no_agents_available",
    title: "Nenhum agente disponível no workspace",
    vertical: "core",
    topic: "agents",
    problemItSolves: "Explica por que a lista de agentes está vazia e o que fazer.",
    canonicalAnswer:
      "Os agentes do EIAH aparecem conforme seu contexto de acesso (tenant/workspace), permissões e módulos habilitados.",
    stepByStep: [
      "Você está no workspace correto.",
      "Seu acesso para usar agentes está ativo.",
      "A vertical ou agente desejado está habilitado neste workspace.",
    ],
    nextActions: ["Verificar acesso", "Selecionar workspace", "Ativar módulo no Marketplace"],
  },
  {
    id: "platform.top_menu.quick_overview",
    title: "Guia rápido do menu principal",
    vertical: "core",
    topic: "navigation",
    problemItSolves: "Explica rapidamente as páginas do topo da plataforma.",
    canonicalAnswer:
      "O menu principal organiza sua navegação por tipo de objetivo: execução, chat, financeiro, oportunidades, catálogo, fluxos guiados e perfil.",
    stepByStep: [
      "`Runs`: criar, simular e acompanhar execuções.",
      "`Chat`: conversar no launcher e escolher especialistas.",
      "`Billing`: ver plano, uso, limites e cobrança.",
      "`Economy`: visão consolidada de impacto e oportunidades.",
      "`Marketplace`: ativar agentes e módulos no workspace.",
      "`Self-service`: fluxos guiados por formulário/recipe.",
      "`Perfil`: dados da conta, workspace e governança pessoal.",
    ],
    nextActions: [
      "Entender Runs",
      "Entender Chat",
      "Entender Billing",
      "Entender Economy",
      "Entender Marketplace",
      "Entender Self-service",
      "Entender Perfil",
    ],
    responseBody: [
      "**Guia rápido do menu principal**",
      "",
      "- `Runs`: criar, simular e acompanhar execuções",
      "- `Chat`: conversar no launcher e escolher especialistas",
      "- `Billing`: ver plano, uso, limites e cobrança",
      "- `Economy`: visão consolidada de impacto e oportunidades",
      "- `Marketplace`: ativar agentes e módulos no workspace",
      "- `Self-service`: fluxos guiados por formulário/recipe",
      "- `Perfil`: dados da conta, workspace e governança pessoal",
      "",
      "Qual página você quer entender agora?",
      "Você pode escolher: Runs, Chat, Billing, Economy, Marketplace, Self-service ou Perfil.",
    ].join("\n"),
  },
  {
    id: "platform.overview.quick",
    title: "Como a plataforma EIAH se organiza",
    vertical: "core",
    topic: "platform",
    problemItSolves: "Explica a visão geral do produto no primeiro contato.",
    canonicalAnswer:
      "O EIAH combina chat, especialistas, runs, billing e verticais para te ajudar a sair de uma dúvida até uma execução com mais contexto.",
    stepByStep: [
      "`Runs`: executar, simular e acompanhar tarefas",
      "`Chat`: ver especialistas disponíveis no workspace",
      "`Billing`: plano, uso, faturas e cobrança",
      "`Marketplace`: ativar agentes e módulos",
      "`IMOB`: contexto imobiliário, pipeline e acompanhamento",
    ],
    nextActions: ["Explique as páginas", "Me mostre o caminho mais rápido"],
    responseBody: [
      "**Como a plataforma EIAH se organiza**",
      "",
      "O EIAH combina chat, especialistas, runs, billing e verticais para te ajudar a sair de uma dúvida até uma execução com mais contexto.",
      "",
      "Na prática, a plataforma se divide assim:",
      "- `Runs`: executar, simular e acompanhar tarefas",
      "- `Chat`: ver especialistas disponíveis no workspace",
      "- `Billing`: plano, uso, faturas e cobrança",
      "- `Marketplace`: ativar agentes e módulos",
      "- `IMOB`: contexto imobiliário, pipeline e acompanhamento",
      "",
      "Se você quiser, eu posso te explicar só uma dessas áreas agora.",
    ].join("\n"),
  },
  {
    id: "platform.chat.page.quick",
    title: "Como funciona a página Chat",
    vertical: "core",
    topic: "navigation",
    problemItSolves: "Explica o uso da página Chat (antes chamada Agentes).",
    canonicalAnswer:
      "A página Chat é o front door para conversar com o EIAH e selecionar especialistas quando necessário.",
    stepByStep: [
      "Use o seletor para escolher o agente quando houver mais de um disponível.",
      "Descreva seu objetivo no campo de entrada.",
      "Envie e siga os próximos passos sugeridos pelo EIAH no próprio chat.",
      "Quando necessário, o engine faz handoff para especialista sem quebrar a conversa.",
    ],
    nextActions: ["Entender Runs", "Entender Billing", "Entender Marketplace"],
    responseBody: [
      "**Como funciona a página Chat**",
      "",
      "A página `Chat` é o front door para conversar com o EIAH e selecionar especialistas quando necessário.",
      "",
      "Use assim:",
      "- escolha o agente no seletor (quando houver catálogo disponível)",
      "- descreva seu objetivo no campo de entrada",
      "- envie e siga os próximos passos sugeridos no próprio chat",
      "",
      "Quando o caso exige profundidade, o engine encaminha para especialista sem ruptura da conversa.",
    ].join("\n"),
  },
  {
    id: "platform.chat.vs_imob.quick",
    title: "Diferença entre Chat principal e Chat IMOB",
    vertical: "core",
    topic: "navigation",
    problemItSolves: "Explica quando usar o Chat principal versus o Chat IMOB.",
    canonicalAnswer:
      "Use o Chat principal quando a dúvida ainda estiver ampla. Use o Chat IMOB quando o caso já estiver claramente dentro da operação imobiliária.",
    stepByStep: [
      "Comece no Chat principal quando precisar triagem, navegação e definição de caminho.",
      "Use o Chat IMOB quando o objetivo já for contextual ao fluxo imobiliário.",
      "Volte ao Chat principal quando quiser reorientar a conversa para a plataforma como um todo.",
    ],
    nextActions: ["Como funciona a triagem do EIAH", "Quando usar Chat versus Runs", "Como funciona o handoff para especialista"],
    responseBody: [
      "**Chat principal e Chat IMOB: quando usar cada um**",
      "",
      "- `Chat principal`: triagem, páginas da plataforma, comparação de caminhos e próximo passo",
      "- `Chat IMOB`: orientação contextual de casos e jornadas da operação imobiliária",
      "",
      "Regra prática:",
      "- comece no `Chat` quando a dúvida ainda estiver aberta",
      "- use `Chat IMOB` quando o caso já for claramente imobiliário",
    ].join("\n"),
  },
  {
    id: "platform.chat.triage.quick",
    title: "Como funciona a triagem do EIAH",
    vertical: "core",
    topic: "navigation",
    problemItSolves: "Explica como o EIAH classifica a dúvida e indica o melhor caminho.",
    canonicalAnswer:
      "O EIAH funciona como front door: entende a intenção, escolhe a área certa e só encaminha para especialista quando a pergunta já exige profundidade de domínio.",
    stepByStep: [
      "Você descreve o objetivo em linguagem simples.",
      "O EIAH identifica se a dúvida é de plataforma, execução, billing, vertical ou especialista.",
      "Se necessário, ele orienta a página certa ou faz handoff sem quebrar a conversa.",
    ],
    nextActions: ["Como funciona a página Chat", "Como o EIAH faz handoff para especialista", "Quando usar Chat versus Runs"],
    responseBody: [
      "**Como funciona a triagem do EIAH**",
      "",
      "O `EIAH` atua como front door da conversa.",
      "",
      "Na prática, ele faz três coisas:",
      "- entende sua intenção",
      "- escolhe a área mais adequada da plataforma",
      "- encaminha para especialista quando a profundidade do caso exigir",
    ].join("\n"),
  },
  {
    id: "platform.chat.handoff.quick",
    title: "Como o EIAH faz handoff para especialista",
    vertical: "core",
    topic: "navigation",
    problemItSolves: "Explica quando e por que o EIAH encaminha para especialista.",
    canonicalAnswer:
      "O handoff acontece quando a dúvida deixa de ser só navegação ou triagem e passa a exigir profundidade de domínio, risco ou contexto vertical específico.",
    stepByStep: [
      "O EIAH começa pela triagem.",
      "Quando detecta necessidade de profundidade, ele sugere ou executa o handoff.",
      "A conversa continua sem ruptura brusca de contexto.",
    ],
    nextActions: ["Quando usar o EIAH e quando usar especialista", "Como funciona a triagem do EIAH"],
    responseBody: [
      "**Como o EIAH faz handoff para especialista**",
      "",
      "O handoff acontece quando a conversa sai da orientação geral e entra em profundidade de domínio.",
      "",
      "Sinais típicos:",
      "- necessidade jurídica, financeira ou vertical específica",
      "- decisão crítica",
      "- contexto que exige especialista com mais profundidade",
      "",
      "O objetivo é manter continuidade, não parecer troca brusca de bot.",
    ].join("\n"),
  },
  {
    id: "platform.chat.vs_runs.quick",
    title: "Quando usar Chat versus Runs",
    vertical: "core",
    topic: "navigation",
    problemItSolves: "Explica quando a interação deve ficar no chat e quando deve virar execução.",
    canonicalAnswer:
      "Use Chat quando ainda estiver entendendo o caminho ou escolhendo o especialista. Use Runs quando já souber a ação que precisa ser executada.",
    stepByStep: [
      "Comece em Chat quando a dúvida ainda estiver aberta ou exploratória.",
      "Vá para Runs quando o objetivo já puder virar execução concreta.",
      "Volte ao Chat se precisar reavaliar o caminho antes de rodar.",
    ],
    nextActions: ["Como criar um run no EIAH", "Como funciona a triagem do EIAH", "Como funciona a página Chat"],
    responseBody: [
      "**Quando usar Chat e quando usar Runs**",
      "",
      "- `Chat`: entender o caminho, escolher especialista, esclarecer contexto",
      "- `Runs`: executar a ação prática",
      "",
      "Regra simples:",
      "- se você ainda está decidindo, fique no `Chat`",
      "- se você já sabe o que quer executar, vá para `Runs`",
    ].join("\n"),
  },
  {
    id: "agents.page.overview.quick",
    title: "Como funciona a área de Agentes",
    vertical: "core",
    topic: "agents",
    problemItSolves: "Explica o papel da área de Agentes no workspace.",
    canonicalAnswer:
      "A área de Agentes mostra quais especialistas estão disponíveis no workspace e ajuda a decidir quando seguir com o EIAH ou aprofundar em um especialista.",
    stepByStep: [
      "Abra Agentes para ver quais especialistas estão disponíveis no workspace.",
      "Leia o foco de cada agente antes de escolher.",
      "Use o EIAH para triagem e o especialista para profundidade de domínio.",
    ],
    nextActions: ["Como ler os cards dos agentes", "Quando usar o EIAH e quando usar especialista", "Verificar acesso"],
    responseBody: [
      "**Como funciona a área de Agentes**",
      "",
      "A área de `Agentes` mostra quais especialistas estão disponíveis no workspace e qual o foco de cada um.",
      "",
      "Use essa página para:",
      "- entender qual agente faz mais sentido para o caso",
      "- ver disponibilidade por workspace",
      "- decidir quando seguir com o `EIAH` ou quando aprofundar em um especialista",
      "",
      "Resumo rápido:",
      "- `EIAH`: triagem e orientação de plataforma",
      "- `Especialista`: profundidade de domínio e contexto específico",
    ].join("\n"),
  },
  {
    id: "agents.inventory.reading.quick",
    title: "Como ler os cards e o inventário de agentes",
    vertical: "core",
    topic: "agents",
    problemItSolves: "Explica como interpretar os elementos dos cards e do inventário governado.",
    canonicalAnswer:
      "Ao ler um agente, observe especialidade, disponibilidade, risco, integrações e exigências de uso antes de decidir se ele é o melhor para o caso.",
    stepByStep: [
      "Veja primeiro a especialidade do agente.",
      "Confirme se ele está disponível no workspace atual.",
      "Observe risco, integrações e necessidade de aprovação.",
      "Confira comprovantes ou contexto exigido antes de usar.",
    ],
    nextActions: ["Como funciona a área de Agentes", "Quando usar o EIAH e quando usar especialista"],
    responseBody: [
      "**Como ler os cards dos agentes**",
      "",
      "Ao olhar um agente, observe principalmente:",
      "- especialidade",
      "- disponibilidade no workspace",
      "- risco e necessidade de aprovação",
      "- integrações declaradas",
      "- comprovantes ou contexto exigidos",
      "",
      "No inventário governado, esses campos ajudam a decidir se o agente está adequado ao caso e ao nível de governança exigido.",
    ].join("\n"),
  },
  {
    id: "agents.eiah_vs_specialist.quick",
    title: "Quando usar o EIAH e quando usar especialista",
    vertical: "core",
    topic: "agents",
    problemItSolves: "Explica a diferença de papel entre o EIAH e um especialista.",
    canonicalAnswer:
      "Use o EIAH para triagem, orientação de plataforma e próximo passo. Use um especialista quando o caso exigir profundidade de domínio ou contexto específico.",
    stepByStep: [
      "Comece pelo EIAH quando a dúvida ainda estiver aberta ou ampla.",
      "Mude para especialista quando precisar profundidade técnica, jurídica, financeira ou vertical.",
      "Volte ao EIAH quando quiser reorientar o caminho dentro da plataforma.",
    ],
    nextActions: ["Como funciona a área de Agentes", "Como funciona a página Chat", "Quero ver agentes disponíveis"],
    responseBody: [
      "**Quando usar o EIAH e quando usar especialista**",
      "",
      "- `EIAH`: triagem, navegação, comparação de páginas e próximo passo",
      "- `Especialista`: profundidade de domínio e contexto operacional específico",
      "",
      "Regra prática:",
      "- comece pelo `EIAH` quando a dúvida ainda estiver aberta",
      "- use um especialista quando o caso já estiver claramente dentro de um domínio",
    ].join("\n"),
  },
  {
    id: "agents.choose_for_goal.quick",
    title: "Qual agente usar para seu objetivo",
    vertical: "core",
    topic: "agents",
    problemItSolves: "Ajuda a escolher entre EIAH, especialistas e o próximo caminho mais útil.",
    canonicalAnswer:
      "A escolha do agente depende do tipo de problema. Comece no EIAH quando a dúvida ainda estiver aberta e siga para especialista quando o caso já exigir profundidade de domínio.",
    stepByStep: [
      "Use o EIAH quando ainda estiver entendendo o problema, a página certa ou o próximo passo.",
      "Use um especialista quando o caso já estiver claramente jurídico, financeiro ou vertical.",
      "Se não houver agente disponível, valide acesso, workspace e módulo ativo antes de tentar novamente.",
    ],
    nextActions: ["Como funciona a área de Agentes", "Quando usar o EIAH e quando usar especialista", "Quero ver agentes disponíveis"],
    responseBody: [
      "**Qual agente devo usar para meu objetivo?**",
      "",
      "Use esta regra prática:",
      "- `EIAH`: quando você ainda está entendendo o problema, a página certa ou o próximo passo",
      "- `Especialista`: quando o caso já exige profundidade de domínio ou contexto operacional específico",
      "",
      "Exemplos:",
      "- plataforma, navegação e comparação de caminhos -> `EIAH`",
      "- jurídico, billing avançado ou vertical específica -> especialista",
      "",
      "Se o workspace não mostrar agentes disponíveis, valide acesso, módulo ativo e contexto do workspace antes de seguir.",
    ].join("\n"),
  },
  {
    id: "platform.page_recommendation.quick",
    title: "Qual página usar primeiro",
    vertical: "core",
    topic: "navigation",
    problemItSolves: "Recomenda a melhor página conforme o objetivo do usuário.",
    canonicalAnswer:
      "A melhor página depende do seu objetivo imediato. Escolha o objetivo e eu te levo para o caminho mais rápido.",
    stepByStep: [
      "Quero executar tarefa agora -> Runs.",
      "Quero conversar com especialista -> Chat.",
      "Quero entender custo e cobrança -> Billing.",
      "Quero ativar agente/módulo -> Marketplace.",
      "Quero acompanhar oportunidades -> Economy.",
      "Quero fluxo guiado pronto -> Self-service.",
      "Quero revisar conta e workspace -> Perfil.",
    ],
    nextActions: [
      "Executar tarefa agora",
      "Conversar com especialista",
      "Entender custo e cobrança",
      "Ativar agente no Marketplace",
      "Fluxo guiado no Self-service",
      "Revisar conta e workspace",
    ],
    responseBody: [
      "**Qual página é melhor para seu objetivo?**",
      "",
      "Me diga o objetivo e eu te aponto o caminho mais rápido:",
      "- executar tarefa agora -> `Runs`",
      "- conversar com especialista -> `Chat`",
      "- entender custo e cobrança -> `Billing`",
      "- ativar agente/módulo -> `Marketplace`",
      "- acompanhar oportunidades -> `Economy`",
      "- usar fluxo guiado -> `Self-service`",
      "- revisar conta/workspace -> `Perfil`",
      "",
      "Se quiser, eu já te direciono para uma dessas opções.",
    ].join("\n"),
  },
  {
    id: "runs.create.how_to",
    title: "Como criar um run no EIAH",
    vertical: "core",
    topic: "runs",
    problemItSolves: "Ajuda usuário a iniciar uma execução com segurança.",
    canonicalAnswer: "Crie uma run em Runs, simule primeiro e depois rode em produção quando o resultado estiver válido.",
    stepByStep: [
      "Abra `Runs` no menu principal.",
      "Escolha o agente que vai executar a tarefa.",
      "Escreva o objetivo em linguagem simples no campo de entrada.",
      "Comece por **Simular primeiro** para validar sem risco.",
      "Se o resultado estiver ok, clique em **Rodar agora**.",
      "Acompanhe status, custo e resultado no histórico da própria página.",
    ],
    nextActions: ["Runs · criar", "Quero simular primeiro"],
    responseBody: [
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
      "- [Runs · criar](/app/runs#runs-criar)",
    ].join("\n"),
  },
  {
    id: "billing.overview.quick",
    title: "Como funciona o billing",
    vertical: "core",
    topic: "billing",
    problemItSolves: "Explica leitura rápida de preços, consumo, reconciliação e quotas.",
    canonicalAnswer:
      "No EIAH, o billing combina pricing, consumo do workspace, reconciliação e quotas para compor a leitura financeira.",
    stepByStep: [
      "Veja o Pricing oficial quando quiser comparar plano, base mensal e excedentes.",
      "Use o Guia Interativo de Billing & Quotas para entender limites, alertas e previsão.",
      "Confira Controle financeiro quando quiser consumo real, gaps e reconciliação.",
    ],
    nextActions: ["Onde vejo o preço", "Qual a diferença entre pricing e billing", "Abrir guia interativo"],
    responseBody: [
      "No EIAH, o billing combina pricing, consumo do workspace, reconciliação e quotas para compor a leitura financeira.",
      "",
      "O que você encontra nessa área:",
      "- `Pricing oficial`: plano, base mensal, runs incluídos, excedente e usuário extra",
      "- `Guia Interativo · Billing & Quotas`: explicação prática de consumo, soft limit, hard limit, previsão e alertas",
      "- `Controle financeiro`: consumo, reconciliação, ledger e trilha auditável do tenant/workspace",
      "",
      "Como usar rapidamente:",
      "- se a dúvida for `preço`, abra `Pricing oficial`",
      "- se a dúvida for `limite`, quota ou bloqueio, abra o guia interativo",
      "- se a dúvida for `consumo real`, gaps ou reconciliação, use `Controle financeiro`",
      "",
      "Diferença semântica rápida:",
      "- `Pricing`: quanto custa o plano",
      "- `Billing`: guarda-chuva da leitura financeira",
      "- `Controle financeiro`: uso real e trilha operacional",
      "- `Reconciliação`: consistência entre ledger, evidência e cobrança",
      "",
      "Atalhos:",
      "- [Billing](/app/billing)",
      "- [Guia Interativo de Billing & Quotas](/app/billing#billing-guide-footer)",
      "- [Pricing oficial](/app/self-service#pricing-oficial)",
    ].join("\n"),
  },
  {
    id: "billing.where_see_price.quick",
    title: "Onde ver preço no EIAH",
    vertical: "core",
    topic: "billing",
    problemItSolves: "Explica onde o usuário vê preço versus consumo real.",
    canonicalAnswer:
      "Se a dúvida for preço do plano, o lugar certo é o Pricing oficial. Se a dúvida for uso real e impacto financeiro, use Billing.",
    stepByStep: [
      "Abra Pricing oficial para ver plano, base mensal e excedentes.",
      "Abra Billing para ver consumo, quotas, gaps e reconciliação.",
      "Não trate a tela de controle financeiro como sinônimo de tabela comercial de preços.",
    ],
    nextActions: ["Abrir Billing", "Abrir guia interativo", "Qual a diferença entre pricing e billing"],
    responseBody: [
      "**Onde ver preço no EIAH**",
      "",
      "Se a dúvida for `preço`, abra `Pricing oficial`.",
      "Se a dúvida for `consumo real`, quotas ou reconciliação, abra `Billing`.",
      "",
      "Resumo rápido:",
      "- `Pricing oficial`: quanto custa o plano",
      "- `Billing`: quanto foi usado e como isso se reconcilia",
      "",
      "Atalhos:",
      "- [Pricing oficial](/app/self-service#pricing-oficial)",
      "- [Billing](/app/billing)",
    ].join("\n"),
  },
  {
    id: "billing.price_vs_consumption.quick",
    title: "Diferença entre pricing, billing e reconciliação",
    vertical: "core",
    topic: "billing",
    problemItSolves: "Separa preço, consumo e consistência financeira para reduzir ambiguidade.",
    canonicalAnswer:
      "Pricing mostra quanto custa o plano; Billing mostra consumo e previsão; reconciliação mostra se a trilha financeira está consistente.",
    stepByStep: [
      "Use Pricing para entender plano, base e excedentes.",
      "Use Billing para ver consumo real, quotas, projeção e custo consolidado.",
      "Use reconciliação para validar gaps, ledger e consistência da trilha auditável.",
    ],
    nextActions: ["Onde vejo o preço", "Como funciona o billing", "Abrir guia interativo"],
    responseBody: [
      "**Pricing, Billing e reconciliação: qual é a diferença?**",
      "",
      "- `Pricing`: quanto custa o plano",
      "- `Billing`: consumo, quotas, previsão e custo consolidado",
      "- `Reconciliação`: verifica se ledger, evidências e cobrança estão coerentes",
      "",
      "Regra prática:",
      "- dúvida comercial -> `Pricing`",
      "- dúvida de uso -> `Billing`",
      "- dúvida de consistência financeira -> `Reconciliação`",
    ].join("\n"),
  },
  {
    id: "economy.overview.quick",
    title: "Como funciona a página Economy",
    vertical: "core",
    topic: "economy",
    problemItSolves: "Explica o papel da página Economy e seus blocos principais.",
    canonicalAnswer:
      "A página Economy consolida impacto, oportunidades e leitura econômica da operação para ajudar a priorizar onde agir primeiro.",
    stepByStep: [
      "Use Economy para ver oportunidades priorizadas e impacto estimado.",
      "Olhe primeiro a prioridade, depois a origem do ganho e por fim a ação sugerida.",
      "Cruze essa leitura com Runs para executar e com Billing para validar consumo real.",
    ],
    nextActions: ["Como priorizar oportunidades", "Como ligar Economy com Runs e Billing", "Abrir Billing"],
    responseBody: [
      "**Como funciona a página Economy**",
      "",
      "A `Economy` mostra impacto consolidado, oportunidades e priorização econômica da operação.",
      "",
      "Use essa área para:",
      "- identificar onde existe ganho ou desperdício",
      "- priorizar ações com maior retorno operacional",
      "- entender quais oportunidades merecem execução primeiro",
      "",
      "Blocos que valem atenção:",
      "- `oportunidades priorizadas`: o que merece atenção primeiro",
      "- `impacto estimado`: qual ganho ou redução de custo está em jogo",
      "- `origem do ganho`: de onde vem a oportunidade",
      "- `ligação com execução`: o que precisa virar ação prática em `Runs`",
    ].join("\n"),
  },
  {
    id: "economy.prioritization.quick",
    title: "Como priorizar oportunidades na Economy",
    vertical: "core",
    topic: "economy",
    problemItSolves: "Ajuda a escolher quais oportunidades tratar primeiro.",
    canonicalAnswer:
      "Na Economy, priorize primeiro o maior impacto com menor bloqueio operacional, depois valide se a ação pode ser executada com segurança.",
    stepByStep: [
      "Leia primeiro o impacto estimado.",
      "Confirme a urgência e a prioridade da oportunidade.",
      "Veja se a ação depende de execução em Runs ou revisão financeira em Billing.",
      "Ataque primeiro o que combina alto impacto e baixa fricção operacional.",
    ],
    nextActions: ["Como funciona a página Economy", "Como ligar Economy com Runs e Billing"],
    responseBody: [
      "**Como priorizar oportunidades na Economy**",
      "",
      "Use esta ordem de leitura:",
      "1. impacto estimado",
      "2. prioridade operacional",
      "3. bloqueios ou dependências",
      "4. facilidade de execução",
      "",
      "Em geral, vale começar pelo que combina alto impacto com baixa fricção.",
    ].join("\n"),
  },
  {
    id: "economy.vs.billing_runs.quick",
    title: "Diferença entre Economy, Billing e Runs",
    vertical: "core",
    topic: "economy",
    problemItSolves: "Evita confusão entre impacto, consumo e execução.",
    canonicalAnswer:
      "Economy prioriza oportunidades, Billing mostra consumo e reconciliação, e Runs é a área de execução prática.",
    stepByStep: [
      "Use Economy para decidir onde agir.",
      "Use Billing para confirmar custo, uso real e consistência financeira.",
      "Use Runs para transformar a decisão em execução.",
    ],
    nextActions: ["Como funciona a página Economy", "Como funciona o billing", "Como criar um run no EIAH"],
    responseBody: [
      "**Economy, Billing e Runs: quando usar cada um**",
      "",
      "- `Economy`: priorizar oportunidades e impacto",
      "- `Billing`: ver consumo real, plano, quotas e reconciliação",
      "- `Runs`: executar a ação prática",
      "",
      "Resumo rápido:",
      "- primeiro você decide na `Economy`",
      "- depois valida custo e consistência em `Billing`",
      "- por fim executa em `Runs`",
    ].join("\n"),
  },
  {
    id: "marketplace.overview.quick",
    title: "Como funciona o Marketplace",
    vertical: "core",
    topic: "marketplace",
    problemItSolves: "Explica o papel da página Marketplace e quando usá-la.",
    canonicalAnswer:
      "O Marketplace é a área onde você ativa agentes, módulos e verticais no workspace, controlando o que fica disponível para uso operacional.",
    stepByStep: [
      "Abra o Marketplace para ver o que está disponível no workspace.",
      "Leia o status de cada item antes de tentar usar a área correspondente.",
      "Ative o módulo ou agente quando quiser liberar a capacidade operacional.",
      "Depois volte para Chat, Runs ou a vertical correspondente para usar o recurso ativado.",
    ],
    nextActions: ["Como saber se o agente foi habilitado", "Ativar no Marketplace gera cobrança?", "Entender Billing"],
    responseBody: [
      "**Como funciona o Marketplace**",
      "",
      "O `Marketplace` é a área onde você ativa agentes, módulos e verticais no workspace.",
      "",
      "Use essa página para:",
      "- ver o que já está disponível",
      "- identificar o que ainda não foi instalado",
      "- ativar uma capacidade antes de tentar operar em outra área",
      "",
      "Resumo prático:",
      "- `Marketplace` libera capacidade",
      "- `Chat` orienta uso",
      "- `Runs` executa",
      "- verticais como `IMOB` aparecem para operar depois da ativação",
    ].join("\n"),
  },
  {
    id: "marketplace.installation_status.quick",
    title: "Como ler status de instalação no Marketplace",
    vertical: "core",
    topic: "marketplace",
    problemItSolves: "Explica o que significa item não instalado, habilitado ou ativo.",
    canonicalAnswer:
      "Quando um item aparece como não instalado, ele ainda não está liberado para uso operacional no workspace.",
    stepByStep: [
      "`não instalado`: ainda não disponível para operação no workspace.",
      "`ativado` ou equivalente: capacidade liberada para uso.",
      "Depois da ativação, volte para a área correspondente e recarregue o contexto.",
    ],
    nextActions: ["Como funciona o Marketplace", "Ativar no Marketplace gera cobrança?"],
    responseBody: [
      "**Como ler o status no Marketplace**",
      "",
      "- `não instalado`: o agente, módulo ou vertical ainda não está liberado para uso operacional",
      "- `ativado` ou equivalente: a capacidade já pode ser usada no workspace",
      "",
      "Se algo estiver indisponível em `Chat`, `Agentes` ou numa vertical, vale confirmar primeiro esse status no `Marketplace`.",
    ].join("\n"),
  },
  {
    id: "marketplace.billing_relation.quick",
    title: "Relação entre Marketplace e cobrança",
    vertical: "core",
    topic: "marketplace",
    problemItSolves: "Explica a diferença entre ativação e consumo financeiro.",
    canonicalAnswer:
      "Ativar no Marketplace libera capacidade operacional. O impacto financeiro depende do plano, do módulo ativado e do consumo posterior.",
    stepByStep: [
      "A ativação libera o recurso no workspace.",
      "O custo não depende só do clique de ativação, mas do plano e do uso posterior.",
      "Use Billing para validar preço, consumo e impacto financeiro real.",
    ],
    nextActions: ["Entender Billing", "Como funciona o Marketplace", "Como saber se o agente foi habilitado"],
    responseBody: [
      "**Marketplace e cobrança: como se relacionam**",
      "",
      "Ativar no `Marketplace` libera capacidade operacional.",
      "",
      "O impacto financeiro depende de três fatores:",
      "- plano ativo",
      "- tipo de módulo ou vertical ativado",
      "- consumo posterior da operação",
      "",
      "Resumo rápido:",
      "- `Marketplace`: libera o recurso",
      "- `Billing`: mostra preço, consumo e reconciliação",
    ].join("\n"),
  },
  {
    id: "profile.overview.quick",
    title: "Como funciona a página Perfil",
    vertical: "core",
    topic: "profile",
    problemItSolves: "Explica o papel da página Perfil para conta, workspace e acesso.",
    canonicalAnswer:
      "A página Perfil concentra dados da conta, contexto do workspace e verificações de acesso antes de voltar para Chat, Marketplace ou Agentes.",
    stepByStep: [
      "Abra Perfil para confirmar conta e workspace ativos.",
      "Valide se o workspace atual é o correto para a operação.",
      "Confirme permissões antes de concluir que um agente, módulo ou vertical está indisponível.",
      "Depois volte para Chat, Marketplace ou Agentes com o contexto correto.",
    ],
    nextActions: ["Como selecionar workspace correto", "Como verificar acesso no workspace", "Como funciona o Marketplace"],
    responseBody: [
      "**Como funciona a página Perfil**",
      "",
      "A página `Perfil` concentra dados da conta, contexto do workspace e verificações de acesso.",
      "",
      "Use essa área para:",
      "- confirmar em qual workspace você está",
      "- revisar se o acesso está coerente com a operação",
      "- validar o contexto antes de voltar para `Chat`, `Agentes` ou `Marketplace`",
      "",
      "Resumo rápido:",
      "- `Perfil` confirma identidade e contexto",
      "- `Marketplace` confirma ativação",
      "- `Chat` e `Agentes` usam esse contexto para responder e operar",
    ].join("\n"),
  },
  {
    id: "self_service.overview.quick",
    title: "Como funciona o Self-service",
    vertical: "core",
    topic: "self_service",
    problemItSolves: "Explica o papel de fluxos guiados por recipes.",
    canonicalAnswer: "O Self-service é a área de fluxos guiados da plataforma.",
    stepByStep: [
      "Abrir formulários prontos por agente.",
      "Coletar contexto de forma guiada.",
      "Simular antes de executar.",
      "Transformar formulário em run real quando habilitado.",
    ],
    nextActions: ["Quero ver recipes", "Quero criar um run"],
    responseBody: [
      "**Como funciona o Self-service**",
      "",
      "O `Self-service` e a area de fluxos guiados da plataforma.",
      "",
      "Na pratica, ele serve para:",
      "- abrir formularios prontos por agente",
      "- coletar contexto de forma guiada",
      "- simular antes de executar",
      "- transformar o formulario em uma run real quando o agente estiver liberado no workspace",
      "",
      "O catalogo de recipes do tenant controla quais caminhos guiados aparecem para cada workspace.",
    ].join("\n"),
  },
  {
    id: "self_service.recipes.overview",
    title: "Como funcionam recipes",
    vertical: "core",
    topic: "self_service",
    problemItSolves: "Explica governança de recipes por estado e visibilidade.",
    canonicalAnswer: "Recipe é a camada de governança que libera um caminho guiado por agente no workspace.",
    stepByStep: [
      "`draft`: salva no catálogo do tenant, mas ainda não libera uso visível no workspace.",
      "`homologated`: libera a recipe para aparecer no self-service conforme escopo configurado.",
      "Recipe publica contexto e visibilidade; não cria sozinha novo formulário se a rota já for fixa.",
    ],
    nextActions: ["Quero ver self-service", "Quero homologar uma recipe"],
    responseBody: [
      "**Como funcionam recipes**",
      "",
      "Recipe e a camada de governanca que libera um caminho guiado por agente no workspace.",
      "",
      "Estados principais:",
      "- `draft`: salva no catalogo do tenant, mas ainda nao libera para uso visivel no workspace",
      "- `homologated`: libera a recipe para aparecer no self-service conforme o escopo configurado",
      "",
      "Importante: a recipe publica contexto e visibilidade. Ela nao cria sozinha um formulario novo se a rota do agente ja for fixa no codigo.",
      "",
      "Se quiser, eu explico em 3 camadas:",
      "- explicação simples",
      "- explicação operacional",
      "- explicação de governança",
    ].join("\n"),
  },
  {
    id: "self_service.recipes.tenant.simple",
    title: "Tenant recipes — explicação simples",
    vertical: "core",
    topic: "self_service",
    problemItSolves: "Explica conceito e benefício direto de tenant recipes sem burocracia.",
    canonicalAnswer:
      "Tenant recipes são recipes aprovadas para uso dentro de um tenant, permitindo liberar caminhos guiados por workspace de forma padronizada.",
    stepByStep: [
      "Pense em tenant recipe como caminho aprovado para o time usar agente sem depender de jeito pessoal.",
      "O catálogo interno homologado é a lista oficial do que foi validado para operação.",
      "Recipe comum é fluxo; tenant recipe é fluxo com escopo e controle por tenant/workspace.",
      "Publicar e homologar não são iguais: homologação é o que autoriza uso governado.",
    ],
    nextActions: [
      "Quero explicação operacional",
      "Quero explicação de governança",
      "Como publicar tenant recipe",
      "Como liberar recipe para workspace",
    ],
    responseBody: [
      "**Tenant recipes**",
      "",
      "**Catálogo interno homologado**",
      "Recipes do tenant permitem homologar um agente e liberar um caminho guiado por workspace.",
      "",
      "Em linguagem simples:",
      "- tenant recipe = fluxo aprovado para uso real",
      "- catálogo interno homologado = vitrine oficial do que está validado",
      "- benefício no dia a dia = mais consistência, menos improviso e onboarding mais rápido",
      "",
      "Se quiser, eu te mostro agora a visão operacional ou de governança.",
    ].join("\n"),
  },
  {
    id: "self_service.recipes.tenant.operational",
    title: "Tenant recipes — explicação operacional",
    vertical: "core",
    topic: "self_service",
    problemItSolves: "Explica publicação, homologação e liberação por workspace no fluxo operacional.",
    canonicalAnswer:
      "Operacionalmente, publicar coloca a recipe no trilho do tenant; homologar valida o fluxo; liberar define em quais workspaces ela fica disponível.",
    stepByStep: [
      "Publicar uma recipe não significa liberação automática.",
      "Homologação valida aderência ao catálogo interno homologado do tenant.",
      "Depois de homologada, a recipe é liberada para workspaces autorizados.",
      "Uso real exige as duas condições: homologada + habilitada no workspace correto.",
      "Isso reduz erro operacional e padroniza execução entre times.",
    ],
    nextActions: [
      "Como saber se está homologada",
      "Como liberar para workspace específico",
      "Como evitar drift das recipes",
      "Explicação simples tenant recipes",
    ],
    responseBody: [
      "**Tenant recipes — operação**",
      "",
      "Fluxo prático:",
      "1. publicar a recipe no tenant (entrada no ciclo)",
      "2. homologar conforme regra interna (validação)",
      "3. liberar para os workspaces autorizados (disponibilidade real)",
      "",
      "Regra de ouro:",
      "- publicar != homologar",
      "- homologar != liberar para todos os workspaces",
      "",
      "Isso mantém padronização sem quebrar governança.",
    ].join("\n"),
  },
  {
    id: "self_service.recipes.tenant.governance",
    title: "Tenant recipes — explicação de governança",
    vertical: "core",
    topic: "governance",
    problemItSolves: "Explica controle, auditoria, anti-drift e critérios de homologação no tenant.",
    canonicalAnswer:
      "Na governança, tenant recipes garantem que o uso dos agentes aconteça por fluxos aprovados, rastreáveis e controlados por escopo.",
    stepByStep: [
      "Só recipes homologadas entram no catálogo interno homologado.",
      "Disponibilidade é controlada por tenant/workspace e não por publicação isolada.",
      "Isso melhora auditoria, comparabilidade e rastreabilidade entre workspaces.",
      "Drift cai quando execução real segue apenas o que foi homologado e liberado oficialmente.",
      "Homologação separa experimento de uso autorizado.",
    ],
    nextActions: [
      "Como evitar drift",
      "Como homologar uma recipe",
      "Explicação operacional tenant recipes",
      "Explicação simples tenant recipes",
    ],
    responseBody: [
      "**Tenant recipes — governança**",
      "",
      "Por que isso existe:",
      "- evitar fluxo paralelo sem controle",
      "- garantir uso autorizado por escopo",
      "- manter auditoria clara por workspace",
      "",
      "Invariantes que o EIAH preserva:",
      "- recipe publicada não é automaticamente homologada",
      "- recipe homologada não é automaticamente liberada para todo workspace",
      "- catálogo homologado é a fonte oficial de uso permitido",
      "",
      "Resultado: menos drift, mais previsibilidade e melhor controle operacional.",
    ].join("\n"),
  },
  {
    id: "runs.preview_vs_production",
    title: "Preview, rodar agora e promover para produção",
    vertical: "core",
    topic: "runs",
    problemItSolves: "Explica diferença entre simulação e execução real.",
    canonicalAnswer:
      "Simular valida sem efeito real; rodar agora executa direto; promover para produção converte prévia aprovada em execução real.",
    stepByStep: [
      "`Simular`: prévia técnica sem executar efeito real.",
      "`Rodar agora`: tenta criar a run real diretamente.",
      "`Promover para produção`: transforma prévia aprovada em execução real.",
    ],
    nextActions: ["Quero simular primeiro", "Quero criar um run"],
    responseBody: [
      "**Preview, rodar agora e promover para producao**",
      "",
      "- `Simular`: gera uma prévia técnica sem executar o efeito real",
      "- `Rodar agora`: tenta criar a run real diretamente",
      "- `Promover para producao`: pega uma prévia aprovada e transforma em execucao real",
      "",
      "Em resumo: simular e ensaio. Producao e execucao real do agente.",
    ].join("\n"),
  },
  {
    id: "agents.enablement.not_enabled",
    title: "Por que o agente não está habilitado no workspace",
    vertical: "core",
    topic: "agents",
    problemItSolves: "Explica bloqueio de enablement do agente em workspace.",
    canonicalAnswer: "Esse bloqueio normalmente significa que o agente ainda não foi liberado para uso nesse workspace.",
    stepByStep: [
      "Plano e limites controlam execução dentro da política de cobrança.",
      "Habilitação do agente controla se um agente específico está liberado no workspace.",
      "É possível simular e ainda ficar bloqueado para produção.",
    ],
    nextActions: ["Verificar acesso", "Ativar módulo no Marketplace"],
    responseBody: [
      "**Por que o agente nao esta habilitado no workspace**",
      "",
      "Esse bloqueio normalmente significa que esse agente ainda nao foi liberado para uso nesse workspace.",
      "",
      "Isso e diferente de billing:",
      "- plano e limites: controlam se o workspace pode executar dentro da politica de cobranca",
      "- habilitacao do agente: controla se um agente especifico esta liberado naquele workspace",
      "",
      "Por isso, voce pode conseguir simular e ainda assim ficar bloqueado para rodar em producao.",
    ].join("\n"),
  },
  {
    id: "agents.enablement.requirements",
    title: "O que precisa para liberar um agente no workspace",
    vertical: "core",
    topic: "agents",
    problemItSolves: "Mostra pré-requisitos de enablement para produção.",
    canonicalAnswer: "Para rodar em produção, o workspace precisa de plano/limites e o agente deve estar liberado.",
    stepByStep: [
      "Workspace com plano e limites habilitados.",
      "Agente liberado para uso naquele workspace.",
      "Sem liberação de agente, ocorre bloqueio de enablement; sem plano/limites, bloqueio tende a cobrança.",
    ],
    nextActions: ["Verificar acesso", "Selecionar workspace", "Ativar módulo no Marketplace"],
    responseBody: [
      "**O que precisa para liberar um agente no workspace**",
      "",
      "Para um agente rodar em producao, normalmente voce precisa de duas coisas:",
      "1. o workspace com plano e limites habilitados;",
      "2. o agente liberado para uso naquele workspace.",
      "",
      "Se faltar a liberacao do agente, aparece o erro de agente nao habilitado. Se faltarem plano ou limites, o bloqueio tende a ser de cobranca.",
    ].join("\n"),
  },
  {
    id: "runs.status.realtime",
    title: "Como acompanhar status de run em tempo real",
    vertical: "core",
    topic: "runs",
    problemItSolves: "Orienta monitoramento de execução e leitura de resultado.",
    canonicalAnswer: "Acompanhe em Runs o andamento, atualize eventos e valide saída/evidências antes do próximo passo.",
    stepByStep: [
      "Abra `Runs` e selecione a execução que deseja acompanhar.",
      "Observe os indicadores de andamento (em execução, sucesso, falha ou bloqueio).",
      "Use o botão de atualizar para recarregar eventos recentes quando necessário.",
      "Abra o resultado da run para validar saída, evidências e próximo passo.",
    ],
    nextActions: ["Runs · status", "Runs · resultado"],
    responseBody: [
      "**Como acompanhar status de run em tempo real**",
      "",
      "1. Abra `Runs` e selecione a execução que deseja acompanhar.",
      "2. Observe os indicadores de andamento (em execução, sucesso, falha ou bloqueio).",
      "3. Use o botão de atualizar para recarregar eventos recentes quando necessário.",
      "4. Abra o resultado da run para validar saída, evidências e próximo passo.",
      "",
      "**Atalhos**",
      "- [Runs · status](/app/runs#runs-status)",
      "- [Runs · resultado](/app/runs#runs-resultado)",
    ].join("\n"),
  },
  {
    id: "platform.common_risks",
    title: "Riscos comuns no uso da plataforma",
    vertical: "core",
    topic: "governance",
    problemItSolves: "Explica riscos operacionais frequentes para reduzir erro de execução.",
    canonicalAnswer: "Os riscos mais comuns são erro de agente, execução sem simulação e pedido amplo sem objetivo claro.",
    stepByStep: [
      "Escolher o agente errado para o objetivo.",
      "Executar sem simular quando o caso ainda é novo.",
      "Pedir algo amplo demais sem dizer o resultado esperado.",
      "Avançar em fluxo sensível sem revisar risco ou aprovação.",
    ],
    nextActions: ["Me mostre o caminho mais rápido", "Quero simular primeiro"],
    responseBody: [
      "Os riscos mais comuns são estes:",
      "",
      "- escolher o agente errado para o objetivo",
      "- executar sem simular quando o caso ainda é novo",
      "- pedir algo amplo demais sem dizer o resultado esperado",
      "- avançar em fluxo sensível sem revisar risco ou aprovação",
    ].join("\n"),
  },
  {
    id: "platform.next_steps.generic",
    title: "Próximos passos para seguir no EIAH",
    vertical: "core",
    topic: "onboarding",
    problemItSolves: "Organiza sequência mínima para usuários que pedem direção.",
    canonicalAnswer: "Defina objetivo, escolha área correta e execute o próximo passo guiado.",
    stepByStep: [
      "Definir o objetivo principal.",
      "Escolher a área certa: Runs, Chat, Billing, IMOB ou proposta.",
      "Seguir o próximo passo guiado pelo launcher.",
    ],
    nextActions: ["Quero resolver algo agora", "Me mostre o caminho mais rápido"],
    responseBody: [
      "Os próximos passos dependem do que você quer resolver, mas o caminho mais comum é:",
      "",
      "1. definir o objetivo principal",
      "2. escolher a área certa: Runs, Chat, Billing, IMOB ou proposta",
      "3. seguir o próximo passo guiado pelo launcher",
    ].join("\n"),
  },
  {
    id: "access.check.workspace",
    title: "Como verificar acesso no workspace",
    vertical: "core",
    topic: "access",
    problemItSolves: "Orienta validação rápida quando o usuário clica em Verificar acesso.",
    canonicalAnswer:
      "Para confirmar acesso, valide workspace, permissão de uso de agentes e módulo ativo no ambiente atual.",
    stepByStep: [
      "Confirme o nome do workspace ativo no topo da plataforma.",
      "Abra Perfil e valide se seu usuário está com acesso ao workspace.",
      "No Marketplace, confira se o módulo ou vertical desejado está ativo.",
      "Volte para Chat e recarregue a lista de agentes.",
    ],
    nextActions: ["Selecionar workspace", "Ativar módulo no Marketplace", "Quero ver agentes disponíveis"],
    responseBody: [
      "**Como verificar acesso**",
      "",
      "Use este checklist rápido:",
      "1. confirme o workspace ativo",
      "2. valide se seu usuário tem acesso ao workspace",
      "3. confira se o módulo/vertical está ativo no Marketplace",
      "4. volte para `Chat` e recarregue a lista de agentes",
      "",
      "Se algum item estiver faltando, o agente não aparece até esse acesso ser liberado.",
    ].join("\n"),
  },
  {
    id: "workspace.select.how_to",
    title: "Como selecionar o workspace correto",
    vertical: "core",
    topic: "workspace",
    problemItSolves: "Explica como trocar para o workspace certo antes de usar agentes.",
    canonicalAnswer: "A troca de workspace define quais agentes e módulos você pode usar na conversa.",
    stepByStep: [
      "Abra Perfil e localize a seção de workspace.",
      "Selecione o workspace desejado para sua operação atual.",
      "Confirme se o workspace trocou no cabeçalho da plataforma.",
      "Retorne para Chat para carregar os agentes desse contexto.",
    ],
    nextActions: ["Verificar acesso", "Quero ver agentes disponíveis", "Ativar módulo no Marketplace"],
    responseBody: [
      "**Como selecionar o workspace**",
      "",
      "1. abra `Perfil`",
      "2. selecione o workspace correto",
      "3. confirme a troca no cabeçalho",
      "4. volte para `Chat` para recarregar os agentes",
      "",
      "Sem o workspace correto, a lista de agentes pode ficar vazia mesmo com conta ativa.",
    ].join("\n"),
  },
];

function normalizeIntentText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeNormalizedText(value: string) {
  return value
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function calculateTokenOverlapScore(normalizedInput: string, normalizedTerm: string) {
  const inputTokens = new Set(tokenizeNormalizedText(normalizedInput));
  const termTokens = new Set(tokenizeNormalizedText(normalizedTerm));
  let overlapCount = 0;
  for (const token of inputTokens) {
    if (termTokens.has(token)) overlapCount += 1;
  }
  return overlapCount * 10;
}

function scoreIntentMatch(
  normalizedInput: string,
  normalizedTerm: string,
  source: "example" | "alias"
) {
  let baseScore = 0;
  if (normalizedInput === normalizedTerm) {
    baseScore = source === "alias" ? 80 : 100;
  } else if (normalizedTerm.startsWith(normalizedInput) || normalizedInput.startsWith(normalizedTerm)) {
    baseScore = 60;
  } else if (normalizedInput.includes(normalizedTerm) || normalizedTerm.includes(normalizedInput)) {
    baseScore = 40;
  }

  return baseScore + calculateTokenOverlapScore(normalizedInput, normalizedTerm);
}

type RankedIntentMatch = {
  entry: IntentLibraryEntryV1;
  score: number;
};

type TutorPolicyResolutionType = "answer" | "clarify" | "handoff" | "blocked";
type TutorExplanationDepth = "simple" | "operational" | "governance";

type TutorContractReply = {
  intentId: string;
  content: string;
  quickReplies: string[];
};

export function resolveEiahTutorRouteQuickReplies(
  routeIntent: "help" | "orchestrator",
  input?: string | null
): string[] {
  const thematic = resolveEiahTutorQuickReplyHints(input ?? "");
  if (thematic?.length) return thematic;

  if (routeIntent === "orchestrator") {
    return [
      "Qual agente devo usar?",
      "Analise este fluxo e recomende o próximo passo.",
      "Quero auditar esse processo.",
    ];
  }

  return [
    "O que o EIAH pode fazer por mim?",
    "Como criar um run no EIAH?",
    "Como funciona o billing?",
  ];
}

export function resolveEiahTutorInputPlaceholder(routeIntent: "help" | "orchestrator", input?: string | null) {
  if (routeIntent === "orchestrator") {
    return "Ex.: analise este fluxo e recomende o próximo passo";
  }

  const thematic = resolveEiahTutorQuickReplyHints(input ?? "");
  if (thematic?.some((reply) => reply.toLowerCase().includes("billing"))) {
    return "Ex.: quero entender plano, uso e cobrança do workspace";
  }
  if (thematic?.some((reply) => reply.toLowerCase().includes("run"))) {
    return "Ex.: quero criar um run e entender a diferença entre simular e rodar agora";
  }
  if (thematic?.some((reply) => reply.toLowerCase().includes("tenant recipes"))) {
    return "Ex.: quero entender como publicar, homologar e liberar tenant recipes";
  }

  return "Descreva o objetivo, contexto e restricoes...";
}

export function resolveEiahTutorQuickReplyHints(input: string): string[] | null {
  const normalized = normalizeIntentText(input);
  if (!normalized) return null;

  if (
    normalized.includes("recipe") ||
    normalized.includes("homolog") ||
    normalized.includes("catalogo interno homologado") ||
    normalized.includes("catálogo interno homologado")
  ) {
    return [
      "Explicação simples tenant recipes",
      "Explicação operacional tenant recipes",
      "Explicação de governança tenant recipes",
    ];
  }
  if (normalized.includes("run") || normalized.includes("runs") || normalized.includes("simular") || normalized.includes("rodar")) {
    return [
      "Como criar um run no EIAH?",
      "Como acompanhar status de run?",
      "Diferença entre simular e rodar agora",
    ];
  }
  if (
    normalized.includes("billing") ||
    normalized.includes("cobranca") ||
    normalized.includes("cobrança") ||
    normalized.includes("fatura") ||
    normalized.includes("plano")
  ) {
    return [
      "Como funciona o billing?",
      "Como ler plano, uso e fatura",
      "Como reduzir custo no workspace",
    ];
  }
  if (normalized.includes("economy") || normalized.includes("oportunidade") || normalized.includes("impacto")) {
    return [
      "Como funciona a página Economy?",
      "Como priorizar oportunidades",
      "Como ligar Economy com Runs e Billing",
    ];
  }
  if (normalized.includes("marketplace") || normalized.includes("ativar agente") || normalized.includes("instalar")) {
    return [
      "Como funciona o Marketplace?",
      "Como ativar agente no workspace",
      "Como saber se o agente foi habilitado",
    ];
  }
  if (
    normalized.includes("self-service") ||
    normalized.includes("self service") ||
    normalized.includes("formulario") ||
    normalized.includes("formulário")
  ) {
    return [
      "Como funciona o self-service?",
      "Quais blocos existem no self-service?",
      "Como transformar fluxo guiado em execução",
    ];
  }
  if (normalized.includes("perfil") || normalized.includes("workspace") || normalized.includes("acesso")) {
    return [
      "Como selecionar workspace correto",
      "Como verificar acesso no workspace",
      "Como liberar agente para o workspace",
    ];
  }
  if (normalized.includes("chat") || normalized.includes("agente") || normalized.includes("agentes")) {
    return [
      "Como funciona a página Chat?",
      "Qual agente devo usar para meu objetivo?",
      "Como o EIAH faz handoff para especialista",
    ];
  }
  if (normalized.includes("governanca") || normalized.includes("governança") || normalized.includes("auditoria") || normalized.includes("drift")) {
    return [
      "Explicação simples de governança",
      "Explicação operacional de governança",
      "Como evitar drift no dia a dia",
    ];
  }

  return null;
}

type TutorPolicyResolution =
  | { resolutionType: "answer" }
  | { resolutionType: "clarify"; reply: TutorContractReply }
  | { resolutionType: "handoff"; reply: TutorContractReply }
  | { resolutionType: "blocked"; reply: TutorContractReply };

function rankIntents(input: string): RankedIntentMatch[] {
  const normalizedInput = normalizeIntentText(input);
  return intentLibraryV1
    .map((entry) => {
      const normalizedExamples = entry.examples.map((item) => normalizeIntentText(item));
      const normalizedAliases = (entry.aliases ?? []).map((item) => normalizeIntentText(item));
      let bestScore = 0;

      for (const term of normalizedExamples) {
        bestScore = Math.max(bestScore, scoreIntentMatch(normalizedInput, term, "example"));
      }
      for (const term of normalizedAliases) {
        bestScore = Math.max(bestScore, scoreIntentMatch(normalizedInput, term, "alias"));
      }

      return {
        entry,
        score: bestScore + (entry.priority ?? 0),
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (b.entry.priority ?? 0) - (a.entry.priority ?? 0);
    });
}

function pickBestIntent(ranked: RankedIntentMatch[], threshold: number) {
  const best = ranked[0];
  if (!best) return null;
  if (best.score < threshold) return null;
  return best.entry;
}

function isLikelyPastedInput(value: string) {
  const raw = value.trim();
  if (!raw) return false;
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const colonCount = (raw.match(/:/g) ?? []).length;
  const semicolonCount = (raw.match(/;/g) ?? []).length;
  const hasQuestion = raw.includes("?");
  return (
    lines.length >= 2 ||
    (raw.length >= 30 && colonCount >= 1 && hasQuestion) ||
    (raw.length >= 90 && semicolonCount >= 1)
  );
}

function looksLikePlatformStructuredContext(normalizedInput: string) {
  const signals = [
    "runs",
    "chat",
    "agentes",
    "billing",
    "economy",
    "marketplace",
    "self-service",
    "self service",
    "perfil",
    "executar",
    "simular",
    "acompanhar",
  ];
  const hitCount = signals.reduce((acc, signal) => (normalizedInput.includes(signal) ? acc + 1 : acc), 0);
  return hitCount >= 2;
}

function getKnowledgeById(id: string) {
  return knowledgeUnitsV1.find((unit) => unit.id === id) ?? null;
}

function getPatternById(id: string) {
  return responsePatternsV1.find((pattern) => pattern.patternId === id) ?? null;
}

function detectExplanationDepth(input: string): { depth: TutorExplanationDepth; subject: string } | null {
  const normalized = normalizeIntentText(input);
  const patterns: Array<{ prefix: string; depth: TutorExplanationDepth }> = [
    { prefix: "explicacao simples ", depth: "simple" },
    { prefix: "explicação simples ", depth: "simple" },
    { prefix: "explicacao operacional ", depth: "operational" },
    { prefix: "explicação operacional ", depth: "operational" },
    { prefix: "explicacao de governanca ", depth: "governance" },
    { prefix: "explicação de governança ", depth: "governance" },
    { prefix: "governanca de ", depth: "governance" },
    { prefix: "governança de ", depth: "governance" },
  ];

  for (const pattern of patterns) {
    if (normalized.startsWith(pattern.prefix)) {
      const subject = normalized.slice(pattern.prefix.length).trim();
      if (subject) {
        return {
          depth: pattern.depth,
          subject,
        };
      }
    }
  }

  return null;
}

function buildDepthAwareQuickReplies(params: {
  depth: TutorExplanationDepth;
  knowledge: KnowledgeUnitV1;
}) {
  const depthReplies: Record<TutorExplanationDepth, string[]> = {
    simple: ["Explicação operacional", "Explicação de governança"],
    operational: ["Explicação simples", "Explicação de governança"],
    governance: ["Explicação simples", "Explicação operacional"],
  };

  const depthReplyPrefix =
    params.knowledge.topic === "self_service" || params.knowledge.id.includes("recipes")
      ? "tenant recipes"
      : params.knowledge.title.replace(/^Como funciona /i, "").replace(/^Como /i, "").trim();

  const normalizedPrefix = depthReplyPrefix.length > 0 ? depthReplyPrefix : params.knowledge.topic;
  const normalizedActions = depthReplies[params.depth].map((label) => `${label} ${normalizedPrefix}`.trim());
  return [...normalizedActions, ...params.knowledge.nextActions]
    .filter((value, index, array) => array.indexOf(value) === index)
    .slice(0, 4);
}

function buildDepthAwareReply(params: {
  intent: IntentLibraryEntryV1;
  knowledge: KnowledgeUnitV1;
  depth: TutorExplanationDepth;
}): TutorContractReply {
  const titleByDepth: Record<TutorExplanationDepth, string> = {
    simple: `**${params.knowledge.title} — explicação simples**`,
    operational: `**${params.knowledge.title} — explicação operacional**`,
    governance: `**${params.knowledge.title} — explicação de governança**`,
  };

  const contentByDepth: Record<TutorExplanationDepth, string> = {
    simple: [
      titleByDepth.simple,
      "",
      params.knowledge.canonicalAnswer,
      "",
      "Em linguagem simples:",
      ...params.knowledge.stepByStep.slice(0, 3).map((step) => `- ${step}`),
    ].join("\n"),
    operational: [
      titleByDepth.operational,
      "",
      "No dia a dia, o caminho prático é este:",
      ...params.knowledge.stepByStep.map((step, index) => `${index + 1}. ${step}`),
    ].join("\n"),
    governance: [
      titleByDepth.governance,
      "",
      "Do ponto de governança, o ponto principal é:",
      params.knowledge.canonicalAnswer,
      "",
      "O que isso ajuda a preservar:",
      `- consistência no tema \`${params.knowledge.topic}\``,
      "- menos improviso e menos drift entre uso e regra",
      "- mais previsibilidade, rastreabilidade e clareza de operação",
    ].join("\n"),
  };

  return {
    intentId: `${params.intent.intentId}_${params.depth}`,
    content: contentByDepth[params.depth],
    quickReplies: buildDepthAwareQuickReplies({
      depth: params.depth,
      knowledge: params.knowledge,
    }),
  };
}

function buildCanonicalTutorFallbackReply() {
  const fallbackKnowledge = getKnowledgeById("platform.overview.quick");
  if (fallbackKnowledge) {
    return {
      intentId: TUTOR_FALLBACK_INTENT_ID,
      content:
        fallbackKnowledge.responseBody ??
        [
          `**${fallbackKnowledge.title}**`,
          "",
          fallbackKnowledge.canonicalAnswer,
          "",
          ...fallbackKnowledge.stepByStep,
        ].join("\n"),
      quickReplies: fallbackKnowledge.nextActions,
    };
  }

  return {
    intentId: TUTOR_FALLBACK_INTENT_ID,
    content: [
      "**Como a plataforma EIAH se organiza**",
      "",
      "Posso te orientar rapidamente por áreas como Runs, Chat, Billing, Marketplace e Self-service.",
      "Se você quiser, eu te direciono para o caminho mais curto agora.",
    ].join("\n"),
    quickReplies: ["Explique as páginas", "Como criar um run", "Como funciona o self-service"],
  };
}

function isExactTermMatch(intent: IntentLibraryEntryV1, normalizedInput: string) {
  const terms = [...intent.examples, ...(intent.aliases ?? [])].map((item) => normalizeIntentText(item));
  return terms.includes(normalizedInput);
}

function hasMissingWorkspaceContext(accessContext?: LauncherAccessContext | null) {
  return !accessContext?.tenantId || !accessContext?.workspaceId;
}

function isMissingImobEntitlement(accessContext?: LauncherAccessContext | null) {
  const hasImobProduct = (accessContext?.installedProducts ?? []).some((product) =>
    product.trim().toLowerCase().includes("imob")
  );
  if (hasImobProduct) return false;
  return accessContext?.entitlements?.IMOB_INSTALLED === false || accessContext?.entitlements?.REAL_ESTATE_CORE === false;
}

function looksLikeDeepVerticalNeed(normalizedInput: string) {
  return (
    normalizedInput.includes("imob") ||
    normalizedInput.includes("imobili") ||
    normalizedInput.includes("legal") ||
    normalizedInput.includes("jurid")
  );
}

function shouldAskClarification(params: {
  normalizedInput: string;
  ranked: RankedIntentMatch[];
  intent: IntentLibraryEntryV1 | null;
}) {
  if (!tutorPolicyV1.rules.askClarificationWhenAmbiguous) return false;
  if (tutorPolicyV1.rules.maxClarificationQuestions <= 0) return false;
  const tokenCount = tokenizeNormalizedText(params.normalizedInput).length;
  if (tokenCount > 2) return false;
  if (!params.intent) return false;
  if (isExactTermMatch(params.intent, params.normalizedInput)) return false;
  const first = params.ranked[0];
  const second = params.ranked[1];
  if (!first || !second) return false;
  const minimumRelevantScore = 35;
  if (first.score < minimumRelevantScore || second.score < minimumRelevantScore) return false;
  return first.score - second.score <= 5;
}

function isGenericExplanationQuestion(normalizedInput: string) {
  const exactQuestions = new Set([
    "como funciona",
    "explique",
    "explica",
    "me explique",
    "me explica",
    "quero entender",
    "entender como funciona",
    "explique como funciona",
    "explica como funciona",
    "me explique como funciona",
    "me explica como funciona",
  ]);

  return exactQuestions.has(normalizedInput);
}

function resolveDirectCoreTutorReply(normalizedInput: string): TutorContractReply | null {
  const directIntentMap: Array<{ patterns: string[]; knowledgeId: string }> = [
    {
      patterns: ["explicar plataforma", "plataforma como um todo"],
      knowledgeId: "platform.overview.quick",
    },
    {
      patterns: ["explicar agentes"],
      knowledgeId: "agents.page.overview.quick",
    },
    {
      patterns: ["explicar billing"],
      knowledgeId: "billing.overview.quick",
    },
    {
      patterns: ["explicar chat imob"],
      knowledgeId: "platform.chat.vs_imob.quick",
    },
    {
      patterns: ["me mostre o caminho mais rapido", "me mostre o caminho mais rápido"],
      knowledgeId: "platform.page_recommendation.quick",
    },
    {
      patterns: [
        "qual agente devo usar para meu objetivo",
        "qual agente devo usar",
        "que agente devo usar",
        "qual especialista devo usar",
      ],
      knowledgeId: "agents.choose_for_goal.quick",
    },
    {
      patterns: [
        "qual a diferenca entre chat e chat imob",
        "qual a diferença entre chat e chat imob",
        "quando usar chat imob",
        "chat versus chat imob",
        "chat vs chat imob",
      ],
      knowledgeId: "platform.chat.vs_imob.quick",
    },
  ];

  const match = directIntentMap.find((entry) => entry.patterns.some((pattern) => normalizedInput.includes(normalizeIntentText(pattern))));
  if (!match) return null;

  const knowledge = getKnowledgeById(match.knowledgeId);
  if (!knowledge) return null;

  return {
    intentId: match.knowledgeId.replace(/\./g, "_"),
    content:
      knowledge.responseBody ??
      [
        `**${knowledge.title}**`,
        "",
        knowledge.canonicalAnswer,
        "",
        ...knowledge.stepByStep,
      ].join("\n"),
    quickReplies: knowledge.nextActions,
  };
}

export function hasExactEiahTutorIntentMatch(input: string) {
  const normalizedInput = normalizeIntentText(input);
  if (resolveDirectCoreTutorReply(normalizedInput)) return true;

  const ranked = rankIntents(input);
  const intent = pickBestIntent(ranked, 35);
  if (!intent) return false;

  return isExactTermMatch(intent, normalizedInput);
}

function buildClarificationReply(): TutorContractReply {
  return {
    intentId: "policy_clarify",
    content: [
      "Posso explicar melhor se você me disser qual área quer entender agora.",
      "",
      "Exemplos de foco:",
      "- plataforma como um todo",
      "- agentes",
      "- chat",
      "- Chat IMOB",
      "- billing e quotas",
      "- marketplace",
      "- self-service",
    ].join("\n"),
    quickReplies: ["Explicar plataforma", "Explicar agentes", "Explicar Chat IMOB", "Explicar Billing"],
  };
}

function buildHandoffReply(): TutorContractReply {
  return {
    intentId: "policy_handoff",
    content: [
      "Esse pedido parece exigir contexto vertical especializado.",
      "",
      "Posso seguir com o front door no Chat ou te encaminhar para o especialista do domínio.",
    ].join("\n"),
    quickReplies: ["Quero começar por IMOB", "Me explique primeiro no Chat", "Ver agentes disponíveis"],
  };
}

function buildBlockedReply(reason: "missing_workspace_context" | "missing_entitlement"): TutorContractReply {
  if (reason === "missing_entitlement") {
    return {
      intentId: "policy_blocked_missing_entitlement",
      content: [
        "Não consigo avançar nesse fluxo porque falta habilitação de produto/entitlement para este workspace.",
        "",
        "Ative o módulo correspondente e tente novamente para continuar com segurança.",
      ].join("\n"),
      quickReplies: ["Ativar módulo no Marketplace", "Verificar acesso"],
    };
  }
  return {
    intentId: "policy_blocked_missing_workspace_context",
    content: [
      "Ainda não consigo validar essa ação porque falta contexto de workspace/tenant.",
      "",
      "Entre no workspace correto e tente novamente para eu continuar com precisão.",
    ].join("\n"),
    quickReplies: ["Selecionar workspace", "Verificar acesso"],
  };
}

function hasResolvedWorkspaceContext(accessContext?: LauncherAccessContext | null) {
  return Boolean(accessContext?.tenantId && accessContext?.workspaceId);
}

function buildAgentsEmptyStateContextualReply(params: {
  intentId: string;
  knowledge: KnowledgeUnitV1;
  accessContext?: LauncherAccessContext | null;
}): TutorContractReply {
  const workspaceKnown = hasResolvedWorkspaceContext(params.accessContext);
  const checklist = workspaceKnown
    ? [
        "Seu acesso para usar agentes está ativo.",
        "A vertical ou agente desejado está habilitado neste workspace.",
        "Volte para `Chat` e recarregue a lista de agentes.",
      ]
    : params.knowledge.stepByStep;
  const quickReplies = workspaceKnown
    ? ["Verificar acesso", "Ativar módulo no Marketplace", "Quero ver agentes disponíveis"]
    : params.knowledge.nextActions;

  return {
    intentId: params.intentId,
    content: [
      "Nenhum agente disponível neste workspace no momento.",
      "",
      params.knowledge.canonicalAnswer,
      "Para liberar a lista, verifique:",
      "",
      ...checklist.map((step, index) => `${index + 1}. ${step}`),
      "",
      "Quando isso estiver ok, os agentes serão carregados automaticamente.",
    ].join("\n"),
    quickReplies,
  };
}

function buildAccessCheckContextualReply(params: { knowledge: KnowledgeUnitV1; accessContext?: LauncherAccessContext | null }) {
  const workspaceKnown = hasResolvedWorkspaceContext(params.accessContext);
  const steps = workspaceKnown
    ? [
        "Valide se seu usuário continua com acesso para usar agentes neste workspace.",
        "Confira no Marketplace se o módulo ou vertical desejado está ativo.",
        "Volte para `Chat` e recarregue a lista de agentes.",
      ]
    : params.knowledge.stepByStep;
  const quickReplies = workspaceKnown
    ? ["Ativar módulo no Marketplace", "Quero ver agentes disponíveis", "Selecionar workspace"]
    : params.knowledge.nextActions;

  return {
    intentId: "access_check",
    content: [
      "**Como verificar acesso**",
      "",
      "Use este checklist rápido:",
      ...steps.map((step, index) => `${index + 1}. ${step}`),
      "",
      "Se algum item estiver faltando, o agente não aparece até esse acesso ser liberado.",
    ].join("\n"),
    quickReplies,
  };
}

function applyTutorPolicy(params: {
  normalizedInput: string;
  ranked: RankedIntentMatch[];
  intent: IntentLibraryEntryV1 | null;
  accessContext?: LauncherAccessContext | null;
}): TutorPolicyResolution {
  const workspaceGuardIntents = new Set([
    "agents_empty_state",
    "access_check",
    "workspace_select_help",
    "agent_not_enabled",
    "agent_enablement_requirements",
  ]);

  if (
    params.intent &&
    workspaceGuardIntents.has(params.intent.intentId) &&
    tutorPolicyV1.rules.blockWhen.includes("missing_workspace_context") &&
    hasMissingWorkspaceContext(params.accessContext)
  ) {
    return {
      resolutionType: "blocked",
      reply: buildBlockedReply("missing_workspace_context"),
    };
  }

  if (
    looksLikeDeepVerticalNeed(params.normalizedInput) &&
    tutorPolicyV1.rules.blockWhen.includes("missing_entitlement") &&
    isMissingImobEntitlement(params.accessContext)
  ) {
    return {
      resolutionType: "blocked",
      reply: buildBlockedReply("missing_entitlement"),
    };
  }

  if (shouldAskClarification(params)) {
    return {
      resolutionType: "clarify",
      reply: buildClarificationReply(),
    };
  }

  if (
    tutorPolicyV1.rules.handoffWhen.includes("deep_vertical_need") &&
    looksLikeDeepVerticalNeed(params.normalizedInput) &&
    (!params.intent || params.intent.vertical !== "core") &&
    !isMissingImobEntitlement(params.accessContext)
  ) {
    return {
      resolutionType: "handoff",
      reply: buildHandoffReply(),
    };
  }

  return { resolutionType: "answer" };
}

export function resolveEiahTutorContractResponse(params: {
  input: string;
  accessContext?: LauncherAccessContext | null;
}): {
  intentId: string;
  content: string;
  quickReplies: string[];
} | null {
  const fallbackReply = buildCanonicalTutorFallbackReply();
  const normalizedInput = normalizeIntentText(params.input);
  if (isLikelyPastedInput(params.input) && looksLikePlatformStructuredContext(normalizedInput)) {
    return buildPastedContextExpandedReply();
  }

  const directCoreReply = resolveDirectCoreTutorReply(normalizedInput);
  if (directCoreReply) return directCoreReply;

  if (isGenericExplanationQuestion(normalizedInput)) {
    return buildClarificationReply();
  }

  const depthRequest = detectExplanationDepth(params.input);
  if (depthRequest) {
    const rankedSubjectIntents = rankIntents(depthRequest.subject);
    const subjectIntent = pickBestIntent(rankedSubjectIntents, 35);
    if (subjectIntent) {
      const subjectKnowledge = getKnowledgeById(subjectIntent.mapsToKnowledgeId);
      if (subjectKnowledge) {
        return buildDepthAwareReply({
          intent: subjectIntent,
          knowledge: subjectKnowledge,
          depth: depthRequest.depth,
        });
      }
    }
  }

  const ranked = rankIntents(params.input);
  const intent = pickBestIntent(ranked, 35);
  const policyDecision = applyTutorPolicy({
    normalizedInput,
    ranked,
    intent,
    accessContext: params.accessContext,
  });
  if (policyDecision.resolutionType === "blocked") return policyDecision.reply;
  if (policyDecision.resolutionType === "clarify") return policyDecision.reply;
  if (policyDecision.resolutionType === "handoff") return policyDecision.reply;
  if (!intent) return fallbackReply;

  const knowledge = getKnowledgeById(intent.mapsToKnowledgeId);
  if (!knowledge) return fallbackReply;
  const pattern = getPatternById(intent.defaultPatternId);
  if (!pattern) return fallbackReply;

  if (
    tutorPolicyV1.rules.blockWhen.includes("missing_workspace_context") &&
    intent.intentId === "agents_empty_state" &&
    (!params.accessContext?.tenantId || !params.accessContext?.workspaceId)
  ) {
    return {
      intentId: intent.intentId,
      content: [
        "Ainda não consigo validar a lista de agentes porque falta contexto de workspace/tenant.",
        "",
        "Entre no workspace correto e tente novamente para eu te orientar com precisão.",
      ].join("\n"),
      quickReplies: ["Selecionar workspace", "Verificar acesso"],
    };
  }

  if (intent.intentId === "access_check") {
    return buildAccessCheckContextualReply({
      knowledge,
      accessContext: params.accessContext,
    });
  }

  if (pattern.patternId === "one_line_plus_3_checks") {
    return buildAgentsEmptyStateContextualReply({
      intentId: intent.intentId,
      knowledge,
      accessContext: params.accessContext,
    });
  }

  return {
    intentId: intent.intentId,
    content:
      knowledge.responseBody ??
      [
        `**${knowledge.title}**`,
        "",
        knowledge.canonicalAnswer,
        "",
        ...knowledge.stepByStep,
        "",
        "Se quiser, eu te digo agora qual dessas páginas é a melhor para o seu objetivo.",
      ].join("\n"),
    quickReplies: knowledge.nextActions,
  };
}
