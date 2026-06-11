import type { HelpDictionaryEntry } from "@/components/agents/helpDictionary";

export const BILLING_HELP_DICTIONARY: HelpDictionaryEntry[] = [
  {
    id: "billing.pricing_where",
    scope: "billing",
    matcherTerms: ["onde vejo o preco", "onde vejo o preço", "onde vejo pricing"],
    resolve: () => ({
      intentId: "billing_where_see_price",
      content: [
        "**Onde ver preço no EIAH**",
        "",
        "Use `Pricing oficial` para ver o preço do plano e `Billing` para ver consumo, custo real e reconciliação.",
        "",
        "Atalhos úteis:",
        "- [Pricing oficial](/app/self-service#pricing-oficial)",
        "- [Billing](/app/billing)",
      ].join("\n"),
      quickReplies: ["Como funciona o billing", "Qual a diferença entre pricing e billing?"],
    }),
  },
  {
    id: "billing.pricing_vs_billing",
    scope: "billing",
    matcherTerms: [
      "qual a diferenca entre pricing e billing",
      "qual a diferença entre pricing e billing",
      "qual a diferenca entre preco e billing",
      "qual a diferença entre preço e billing",
    ],
    resolve: () => ({
      intentId: "billing_price_vs_consumption",
      content: [
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
      quickReplies: ["Como funciona o billing", "Onde vejo o preço?"],
    }),
  },
  {
    id: "billing.quotas_and_gaps",
    scope: "billing",
    matcherTerms: ["billing quotas", "billing & quotas", "ledger gaps", "audit gaps", "custo auditavel", "custo auditável"],
    resolve: () => ({
      intentId: "billing_quotas_and_gaps",
      content: [
        "**Quotas, gaps e custo auditável**",
        "",
        "Use essa leitura quando você quiser entender limites operacionais e consistência financeira.",
        "",
        "Na prática:",
        "- `Billing & Quotas`: mostra consumo, limites e alertas",
        "- `Ledger gaps`: mostram divergências entre o que deveria estar no ledger e o que foi registrado",
        "- `Audit gaps`: mostram falhas de rastreabilidade entre execução, evidência e trilha auditável",
        "- `Custo auditável`: é o total já reconciliado com segurança para leitura financeira",
      ].join("\n"),
      quickReplies: ["Como funciona o billing", "Entender custo e cobrança"],
    }),
  },
  {
    id: "billing.cost_reconciliation",
    scope: "billing",
    matcherTerms: ["reconciliacao", "reconciliação", "controle financeiro", "consumo real"],
    resolve: () => ({
      intentId: "billing_cost_reconciliation",
      content: [
        "**Custo, consumo real e reconciliação**",
        "",
        "Use `Billing` para acompanhar o custo consolidado do workspace e validar se a trilha financeira está coerente.",
        "",
        "A leitura principal é esta:",
        "- custo consolidado mostra o total do ciclo",
        "- consumo real mostra onde o custo está concentrado",
        "- reconciliação ajuda a confirmar se ledger, execução e evidências estão consistentes",
      ].join("\n"),
      quickReplies: ["Como funciona o billing", "Qual a diferença entre pricing e billing?"],
    }),
  },
];
