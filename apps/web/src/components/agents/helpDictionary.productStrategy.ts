import type { HelpDictionaryEntry } from "@/components/agents/helpDictionary";

export const PRODUCT_STRATEGY_HELP_DICTIONARY: HelpDictionaryEntry[] = [
  {
    id: "productStrategy.white_label",
    scope: "productStrategy",
    matcherTerms: ["white label", "whitelabel", "marca branca"],
    resolve: () => ({
      intentId: "product_strategy_white_label",
      content: [
        "**White label no EIAH**",
        "",
        "Use essa conversa para entender a ideia de adaptação da superfície do produto para a identidade de um tenant ou operação.",
        "",
        "Na prática, isso costuma envolver:",
        "- identidade visual e apresentação",
        "- linguagem e contexto comercial",
        "- governança de quais módulos e agentes ficam visíveis",
        "",
        "Isso não implica automaticamente que toda capacidade já esteja ativa no seu workspace atual.",
      ].join("\n"),
      quickReplies: ["DAO", "Tokenização", "Explicar plataforma"],
    }),
  },
  {
    id: "productStrategy.dao",
    scope: "productStrategy",
    matcherTerms: ["dao", "como funciona dao", "o que é dao"],
    resolve: () => ({
      intentId: "product_strategy_dao",
      content: [
        "**DAO no contexto do EIAH**",
        "",
        "Esse tema entra como estratégia de coordenação e governança distribuída, não como promessa automática de feature ativa no workspace.",
        "",
        "Quando essa conversa faz sentido:",
        "- governança de decisões coletivas",
        "- regras de participação e aprovação",
        "- desenho de operações que dependem de coordenação compartilhada",
      ].join("\n"),
      quickReplies: ["Tokenização", "White label", "Riscos comuns"],
    }),
  },
  {
    id: "productStrategy.tokenizacao",
    scope: "productStrategy",
    matcherTerms: ["tokenizacao", "tokenização", "tokenizar", "token"],
    resolve: () => ({
      intentId: "product_strategy_tokenizacao",
      content: [
        "**Tokenização no contexto do EIAH**",
        "",
        "Use esse tema quando você quiser discutir tokenização como modelo de produto, ativo ou operação governada.",
        "",
        "Na prática, a conversa costuma cair em:",
        "- representação digital de ativos ou direitos",
        "- governança e compliance do fluxo",
        "- trilha de evidência, risco e execução antes de qualquer operação real",
        "",
        "Isso não deve ser interpretado como disponibilidade automática de emissão, liquidação ou integração regulatória no workspace atual.",
      ].join("\n"),
      quickReplies: ["DAO", "White label", "Riscos comuns"],
    }),
  },
];
