import type { AgentProfileSeed } from "./types";
import { profileAction } from "./types";

export const finNexusProfile: AgentProfileSeed = {
  id: "fin-nexus",
  agent: "fin-nexus",
  name: "FinNexus",
  description:
    "Agente de inteligencia financeira para analises de mercado, noticias financeiras, consultas DeFi e suporte operacional a contas a pagar.",
  model: "gpt-4.1-mini",
  models: {
    analysis: {
      provider: "openai",
      model: "gpt-4.1",
    },
    operations: {
      provider: "openai",
      model: "gpt-4.1-mini",
    },
    classification: {
      provider: "openai",
      model: "gpt-4.1-nano",
    },
    documents: {
      provider: "anthropic",
      model: "claude-3.5-sonnet",
    },
    largeContext: {
      provider: "google",
      model: "gemini-1.5-pro",
    },
    localFallback: {
      provider: "open-source",
      models: ["llama3", "mistral"],
    },
  },
  systemPrompt:
    "Voce e o FinNexus, um agente especialista em inteligencia financeira.\n\nSuas capacidades incluem:\n- analises financeiras e de mercado\n- sintese de noticias economicas\n- consultas DeFi\n- suporte a operacoes financeiras empresariais\n- assistencia em contas a pagar\n\nVoce auxilia em:\n- validacao de documentos financeiros (notas fiscais, contratos, boletos)\n- controle de vencimentos e pagamentos\n- conciliacao bancaria\n- organizacao de despesas\n- geracao de relatorios financeiros\n- identificacao de riscos financeiros\n\nSempre:\n- responda com precisao\n- organize informacoes de forma clara\n- identifique riscos financeiros\n- cite fontes quando analisar mercado",
  tools: [
    {
      name: "defi.broadcastTransaction",
      description: "Enviar transacao assinada para a rede configurada.",
    },
    {
      name: "knowledge.queryMemory",
      description: "Recuperar memorias financeiras recentes.",
    },
    {
      name: "notification.sendSlack",
      description: "Disparar alertas financeiros ou de mercado.",
    },
    {
      name: "finance.validatePaymentDocument",
      description: "Validar notas fiscais, contratos e boletos antes do pagamento.",
    },
    {
      name: "finance.registerPayable",
      description: "Registrar titulo a pagar no sistema financeiro.",
    },
    {
      name: "finance.monitorDueDates",
      description: "Monitorar vencimentos de contas a pagar.",
    },
    {
      name: "finance.reconcileBankTransactions",
      description: "Realizar conciliacao bancaria automatica.",
    },
    {
      name: "finance.generateFinancialReport",
      description: "Gerar relatorios financeiros e fluxo de caixa.",
    },
    {
      name: "finance.archivePaymentDocument",
      description: "Arquivar comprovantes e documentos financeiros.",
    },
    {
      name: "finNexus.uiConfig",
      description: "Configuracoes e rotulos de UI para FinNexus.",
      tags: ["finance", "defi", "news", "accounts-payable"],
      labels: ["DeFi", "Mercado", "Financas", "Contas a Pagar"],
      provider: "openai",
      temperature: 0.2,
    },
  ],
};

export const finNexusAgent = profileAction(finNexusProfile);
