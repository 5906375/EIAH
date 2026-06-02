import type { HelpDictionaryEntry } from "@/components/agents/helpDictionary";

export const GLOBAL_HELP_DICTIONARY: HelpDictionaryEntry[] = [
  {
    id: "global.platform_overview",
    scope: "global",
    matcherTerms: [
      "explicar plataforma",
      "plataforma como um todo",
      "explique a plataforma",
      "como a plataforma funciona",
      "o que da para fazer no site",
      "o que posso fazer aqui",
    ],
    resolve: () => ({
      intentId: "platform_overview",
      content: [
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
      quickReplies: ["Explique as páginas", "Me mostre o caminho mais rápido"],
    }),
  },
  {
    id: "global.best_page_for_goal",
    scope: "global",
    matcherTerms: [
      "me mostre o caminho mais rapido",
      "me mostre o caminho mais rápido",
      "qual pagina devo usar agora",
      "qual pagina e melhor para meu objetivo",
      "qual dessas paginas e a melhor para o seu objetivo",
    ],
    resolve: () => ({
      intentId: "best_page_for_goal",
      content: [
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
      quickReplies: [
        "Executar tarefa agora",
        "Conversar com especialista",
        "Entender custo e cobrança",
        "Ativar agente no Marketplace",
      ],
    }),
  },
  {
    id: "global.agents_choose_for_goal",
    scope: "global",
    matcherTerms: [
      "qual agente devo usar para meu objetivo",
      "qual agente devo usar",
      "que agente devo usar",
      "qual especialista devo usar",
    ],
    resolve: () => ({
      intentId: "agents_choose_for_goal_quick",
      content: [
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
      quickReplies: [
        "Como funciona a área de Agentes",
        "Quando usar o EIAH e quando usar especialista",
        "Quero ver agentes disponíveis",
      ],
    }),
  },
  {
    id: "global.billing_semantics",
    scope: "global",
    matcherTerms: [
      "qual a diferenca entre pricing e billing",
      "qual a diferença entre pricing e billing",
      "qual a diferenca entre preco e billing",
      "qual a diferença entre preço e billing",
      "onde vejo o preco",
      "onde vejo o preço",
      "onde vejo pricing",
    ],
    resolve: ({ normalizedInput }) => {
      const isWherePrice =
        normalizedInput.includes("onde vejo o preco") ||
        normalizedInput.includes("onde vejo o preço") ||
        normalizedInput.includes("onde vejo pricing");
      return {
        intentId: isWherePrice ? "billing_where_see_price" : "billing_price_vs_consumption",
        content: isWherePrice
          ? [
              "**Onde ver preço no EIAH**",
              "",
              "Use `Pricing oficial` para ver o preço do plano e `Billing` para ver consumo, custo real e reconciliação.",
              "",
              "Atalhos úteis:",
              "- [Pricing oficial](/app/self-service#pricing-oficial)",
              "- [Billing](/app/billing)",
            ].join("\n")
          : [
              "**Pricing, Billing e reconciliação**",
              "",
              "Diferença semântica rápida:",
              "- `Pricing oficial`: preço do plano",
              "- `Billing`: visão financeira ampla",
              "- `Controle financeiro`: consumo real, gaps e reconciliação",
              "- `Guia Interativo`: limites, alerts e quotas",
              "",
              "Atalhos úteis:",
              "- [Billing](/app/billing)",
              "- [Guia Interativo de Billing & Quotas](/app/billing#billing-guide-footer)",
              "- [Pricing oficial](/app/self-service#pricing-oficial)",
            ].join("\n"),
        quickReplies: ["Como funciona o billing", "Entender custo e cobrança"],
      };
    },
  },
];
