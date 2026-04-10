export type ImobBusinessQuickAction = {
  id: string;
  title: string;
  summary: string;
  autoprompt: string;
  journey: "captacao" | "lead" | "compra_venda" | "locacao" | "documentacao" | "negociacao";
};

export const IMOB_BUSINESS_QUICK_ACTIONS: ImobBusinessQuickAction[] = [
  {
    id: "qualify_lead_buyer",
    title: "Qualificar lead comprador",
    summary: "Captura interesse, orçamento, cidade e próximo passo comercial sem abrir fluxo genérico.",
    autoprompt: "qualificar lead comprador e sugerir próximos passos deste caso",
    journey: "lead",
  },
  {
    id: "capture_property",
    title: "Captar imóvel",
    summary: "Organiza cadastro do proprietário, dados do imóvel, pendências e entrada no pipeline.",
    autoprompt: "Quero iniciar uma captação no IMOB. Me mostre opções de próximos passos no chat.",
    journey: "captacao",
  },
  {
    id: "generate_proposal",
    title: "Gerar proposta",
    summary: "Prepara proposta de compra, venda ou locação com foco em rapidez comercial.",
    autoprompt: "gerar proposta comercial para este atendimento imobiliário",
    journey: "compra_venda",
  },
  {
    id: "rent_operation",
    title: "Destravar locação",
    summary: "Resume garantias, contrato, anúncio e próximos passos para fechar a locação.",
    autoprompt: "destravar locação com foco em garantia, contrato e próximo passo",
    journey: "locacao",
  },
  {
    id: "request_documents",
    title: "Cobrar documentação",
    summary: "Mostra o que falta no caso e transforma pendência documental em ação clara.",
    autoprompt: "mostrar pendências documentais e preparar cobrança do que falta",
    journey: "documentacao",
  },
  {
    id: "open_negotiation",
    title: "Abrir negociação",
    summary: "Resume histórico, condições e contraproposta para acelerar fechamento.",
    autoprompt: "abrir negociação e resumir contraproposta e condições do caso",
    journey: "negociacao",
  },
];
