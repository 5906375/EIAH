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
  knowledgePolicy: {
    deterministicSources: [
      { sourceId: "finance.payables-registry", kind: "db", authorityLevel: "primary", required: true, version: "v1" },
      { sourceId: "finance.bank-reconciliation-ledger", kind: "ledger", authorityLevel: "primary", required: true, version: "v1" },
      { sourceId: "finance.payment-documents", kind: "document_index", authorityLevel: "secondary", required: false, version: "v1" },
    ],
    sourcePrecedence: [
      "finance.payables-registry",
      "finance.bank-reconciliation-ledger",
      "finance.payment-documents",
    ],
    conflictResolution: "fail_closed",
    llmUsageMode: "grounded_reasoning",
    fallbackPolicy: "block",
    provenancePolicy: "required",
    maskingPolicy: "required",
  },
  chatCopy: {
    whoIAm:
      "Sou o FinNexus, o agente financeiro da plataforma. Eu ajudo a organizar pendências financeiras, revisar documentos de pagamento, orientar conciliação e dar clareza sobre risco operacional.",
    whatIDo: [
      "organizo contas a pagar, vencimentos e pendências financeiras",
      "ajudo a revisar boletos, notas, contratos e documentos antes do pagamento",
      "oriento conciliação bancária, fluxo de caixa e próximos passos financeiros",
    ],
    whenToUseMe: [
      "quando você precisa revisar uma pendência financeira ou pagamento",
      "quando quer entender risco, documentação faltante ou conciliação",
    ],
    whatINotDo: [
      "não devo concluir execução financeira crítica sem base obrigatória disponível",
      "não substituo validação humana final em decisões financeiras sensíveis",
    ],
    exampleRequests: [
      "quais pendências financeiras devo priorizar agora?",
      "o que falta para aprovar este pagamento?",
      "como funciona a conciliação bancária aqui?",
    ],
    quickReplies: [
      "Quais pendências financeiras devo priorizar?",
      "O que falta para aprovar este pagamento?",
      "Como funciona a conciliação bancária?",
    ],
    defaultNextStep: "Se quiser, me diga a pendência, documento ou pagamento que você quer revisar.",
    blockedMessages: {
      missingContext: "Para seguir com segurança, eu preciso do documento, pagamento ou contexto financeiro que você quer analisar.",
      missingRequiredSource:
        "Não consegui concluir essa análise financeira com segurança porque faltam fontes obrigatórias.",
    },
  },
  attachmentContract: {
    acceptsAttachments: true,
    acceptedAttachmentKinds: ["invoice", "receipt", "spreadsheet", "proposal", "generic_document"],
    acceptedMimeTypes: [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
      "text/csv",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "image/png",
      "image/jpeg",
    ],
    intakeModes: ["upload_file", "paste_text", "structured_form"],
    analysisModes: ["financial_check", "risk_scan", "missing_fields"],
    defaultAnalysisMode: "financial_check",
    requiredMetadata: ["document_type", "analysis_goal"],
    initialPrompts: [
      "Quero revisar um documento financeiro",
      "Quero analisar uma invoice",
      "Quero identificar o que falta para aprovar o pagamento",
    ],
    uploadHelpText:
      "Envie a invoice, boleto, comprovante ou planilha que você quer revisar, ou cole o trecho financeiro principal.",
  },
};

export const finNexusAgent = profileAction(finNexusProfile);
