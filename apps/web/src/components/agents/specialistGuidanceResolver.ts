import type { Agent } from "@/lib/api";
import { j360Profile } from "../../../../../packages/core/src/actions/agents/j360Action";
import { resolveLegalSpecialtyContext } from "../../../../../packages/core/src/actions/agents/resolveLegalSpecialtyContext";

function normalizeAgentKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeIntentText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getAgentDisplayName(agent: Agent | null | undefined) {
  if (!agent) return "Agente";
  const normalizedId = normalizeAgentKey(agent.id ?? "");
  const normalizedName = normalizeAgentKey(agent.name ?? "");
  if (normalizedId === "eiah" || normalizedName === "eiahcore") return "EIAH";
  return agent.name?.trim() || agent.id?.trim() || "Agente";
}

export function isGuardianGuidanceQuestion(input: string) {
  const normalized = normalizeIntentText(input);
  const signals = ["receipt", "verify_url", "verify url", "integridade", "evidencia", "evidência", "pii", "lgpd"];
  return signals.some((signal) => normalized.includes(signal));
}

export function isFinanceGuidanceQuestion(input: string) {
  const normalized = normalizeIntentText(input);
  const signals = [
    "pagamento",
    "boleto",
    "nota",
    "fatura",
    "concil",
    "extrato",
    "banco",
    "pendencia",
    "pendência",
    "prioriz",
  ];
  return signals.some((signal) => normalized.includes(signal));
}

export function isAadvGuidanceQuestion(input: string) {
  const normalized = normalizeIntentText(input);
  const signals = [
    "bloco faltante",
    "consolidar",
    "riscos comuns",
    "quais riscos",
    "proximos passos",
    "próximos passos",
    "exemplo pratico",
    "exemplo prático",
  ];
  return signals.some((signal) => normalized.includes(signal));
}

export function buildJuridicoGuidanceReply(input: string, agentProfile: Agent | null) {
  const normalized = normalizeIntentText(input);
  if (
    normalized.includes("revisar contrato") ||
    normalized === "quero revisar um contrato" ||
    normalized === "voce pode revisar um contrato" ||
    normalized === "você pode revisar um contrato"
  ) {
    return [
      "Sim. Posso ajudar a revisar cláusulas, identificar riscos, apontar lacunas e organizar os pontos principais para análise.",
      "",
      "Se quiser seguir, envie o contrato, a cláusula ou descreva o ponto que você quer avaliar primeiro.",
    ].join("\n");
  }

  if (normalized.includes("locacao") || normalized.includes("locação") || normalized.includes("aluguel")) {
    return [
      "Em contrato de locação, eu costumo olhar primeiro:",
      "",
      "- prazo, reajuste e garantias",
      "- multa, rescisão e aviso prévio",
      "- obrigações das partes e condições de uso do imóvel",
      "",
      "Se quiser, me envie o contrato ou a cláusula que você quer revisar.",
    ].join("\n");
  }

  if (normalized.includes("compra e venda") || (normalized.includes("compra") && normalized.includes("venda"))) {
    return [
      "Em contrato de compra e venda, eu posso revisar principalmente:",
      "",
      "- objeto, preço e forma de pagamento",
      "- prazo, entrega e responsabilidade",
      "- multa, rescisão e penalidades",
      "",
      "Se quiser, me diga o ponto mais sensível ou envie a cláusula que você quer analisar.",
    ].join("\n");
  }

  if (
    normalized.includes("prestacao de servico") ||
    normalized.includes("prestação de serviço") ||
    normalized.includes("prestacao de serviços") ||
    normalized.includes("prestação de serviços")
  ) {
    return [
      "Em contrato de prestação de serviços, eu costumo revisar:",
      "",
      "- escopo, entregáveis e critério de aceite",
      "- prazo, pagamento e responsabilidade",
      "- confidencialidade, multa e rescisão",
      "",
      "Se quiser, me diga se a dúvida está no escopo, no pagamento, na multa ou na saída contratual.",
    ].join("\n");
  }

  if (
    normalized.includes("falta") ||
    normalized.includes("faltando") ||
    normalized.includes("lacuna") ||
    normalized.includes("documento")
  ) {
    return [
      "Posso te ajudar a identificar o que está faltando para uma análise jurídica melhor.",
      "",
      "Normalmente eu olho se faltam:",
      "- tipo de contrato e objetivo da análise",
      "- cláusula exata ou trecho problemático",
      "- prazo, responsabilidade, multa ou forma de pagamento",
      "- contexto mínimo da relação entre as partes",
      "",
      "Se quiser, me envie o trecho disponível e eu aponto as lacunas principais.",
    ].join("\n");
  }

  if (normalized.includes("risco")) {
    return [
      "Em contratos, os riscos mais comuns costumam estar em:",
      "",
      "- obrigação mal definida entre as partes",
      "- prazo, multa e rescisão pouco claros",
      "- cláusulas que deixam lacunas sobre responsabilidade e pagamento",
      "- documentos ou anexos que deveriam existir, mas não foram informados",
      "",
      agentProfile?.chatCopy?.defaultNextStep?.trim() || "Se quiser, me diga o contrato e o ponto sensível que você quer revisar.",
    ].join("\n");
  }

  if (normalized.includes("clausula") || normalized.includes("cláusula")) {
    return [
      "Para revisar cláusulas críticas, eu costumo olhar primeiro:",
      "",
      "- objeto do contrato",
      "- prazo e renovação",
      "- pagamento, reajuste e multa",
      "- rescisão e responsabilidades",
      "",
      "Se você quiser, envie a cláusula ou descreva o contrato e eu te digo o que observar.",
    ].join("\n");
  }

  return [
    "Posso ajudar com revisão contratual, análise de cláusulas, riscos jurídicos, lacunas documentais e organização do pedido jurídico.",
    "",
    "Para eu te orientar melhor, envie pelo menos:",
    "- o contrato, a cláusula ou o trecho que você quer analisar",
    "- o tipo de contrato e as partes envolvidas, se souber",
    "- o ponto de dúvida, risco ou decisão que você quer revisar",
    "",
    agentProfile?.chatCopy?.defaultNextStep?.trim() || "Se quiser, já me diga o contrato e o objetivo da análise.",
  ].join("\n");
}

export function resolveJ360AgentProfile(agentProfile: Agent | null, input: string): Agent | null {
  const legalContext = resolveLegalSpecialtyContext(j360Profile, {
    vertical:
      /imob|imovel|imóvel|locacao|locação|aluguel|matricula|matrícula|posse|corretagem|distrato|incorporacao|incorporação/.test(
        normalizeIntentText(input),
      )
        ? "imob"
        : null,
    intent: normalizeIntentText(input),
    userText: input,
  });

  if (!agentProfile || !legalContext.resolvedChatCopy) {
    return agentProfile;
  }

  return {
    ...agentProfile,
    chatCopy: {
      ...agentProfile.chatCopy,
      ...legalContext.resolvedChatCopy,
      blockedMessages: {
        ...agentProfile.chatCopy?.blockedMessages,
        ...legalContext.resolvedChatCopy.blockedMessages,
      },
    },
  };
}

export function buildFinNexusGuidanceReply(input: string, agentProfile: Agent | null) {
  const normalized = normalizeIntentText(input);
  if (normalized.includes("concil") || normalized.includes("extrato") || normalized.includes("banco")) {
    return [
      "Para orientar uma conciliação bancária, eu costumo olhar primeiro:",
      "",
      "- lançamentos esperados e realizados",
      "- diferença de valor, data ou documento",
      "- comprovantes, boletos, notas ou contratos vinculados",
      "- itens sem correspondência clara no ledger",
      "",
      "Se quiser, me diga qual divergência você encontrou e eu te digo o que conferir primeiro.",
    ].join("\n");
  }

  if (normalized.includes("pagamento") || normalized.includes("boleto") || normalized.includes("nota") || normalized.includes("fatura")) {
    return [
      "Para revisar um pagamento com segurança, eu preciso confirmar pelo menos:",
      "",
      "- documento principal envolvido",
      "- valor e vencimento",
      "- favorecido ou contraparte",
      "- o ponto de dúvida ou bloqueio",
      "",
      agentProfile?.chatCopy?.defaultNextStep?.trim() ||
        "Se quiser, me diga o documento e a dúvida financeira que eu sigo por aí.",
    ].join("\n");
  }

  if (normalized.includes("pendencia") || normalized.includes("prioriz")) {
    return [
      "Para priorizar pendências financeiras, eu começo por esta ordem:",
      "",
      "- itens vencidos ou próximos do vencimento",
      "- pagamentos sem documentação suficiente",
      "- divergências entre documento, registro e conciliação",
      "- casos com impacto financeiro maior ou risco operacional",
      "",
      agentProfile?.chatCopy?.defaultNextStep?.trim() || "Se quiser, me diga a pendência e eu te ajudo a priorizar.",
    ].join("\n");
  }

  return [
    "Posso te ajudar a organizar uma análise financeira inicial desse caso.",
    "",
    "Para eu te orientar melhor, envie pelo menos:",
    "- qual pagamento, documento ou pendência você quer revisar",
    "- valor ou vencimento, se houver",
    "- o risco, bloqueio ou decisão que precisa tomar",
    "",
    agentProfile?.chatCopy?.defaultNextStep?.trim() || "Se quiser, já me diga o documento ou pendência financeira e eu sigo daí.",
  ].join("\n");
}

export function buildGuardianGuidanceReply(input: string, agentProfile: Agent | null) {
  const normalized = normalizeIntentText(input);
  if (normalized.includes("exemplo") || normalized.includes("pratico") || normalized.includes("prático")) {
    return [
      "Um exemplo simples seria este:",
      "",
      "Você quer comprovar que uma execução gerou um artefato verificável.",
      "Eu te ajudo a checar se existe receipt, verify_url e trilha mínima de integridade antes de prosseguir.",
      "",
      "Se faltar algum desses itens, eu te digo exatamente o que precisa ser regularizado.",
    ].join("\n");
  }

  if (normalized.includes("receipt") || normalized.includes("verify")) {
    return [
      "Para validar receipt e verify_url com segurança, eu costumo confirmar:",
      "",
      "- se existe receipt vinculando a execução ou evidência",
      "- se o verify_url está presente e utilizável",
      "- se a trilha de integridade está coerente com o contexto",
      "",
      agentProfile?.chatCopy?.defaultNextStep?.trim() || "Se quiser, me envie o receipt ou verify_url que eu reviso com você.",
    ].join("\n");
  }

  if (normalized.includes("pii") || normalized.includes("lgpd")) {
    return [
      "No Guardian, PII nunca deve seguir para trilha pública ou artefato ancorado.",
      "",
      "Se houver dado pessoal sensível, o correto é bloquear, sanitizar e preservar apenas o que for compatível com a política de integridade e auditoria.",
    ].join("\n");
  }

  return [
    "Posso te ajudar a validar evidência, integridade e verificabilidade desse caso.",
    "",
    "Para eu te orientar melhor, envie pelo menos:",
    "- qual evidência, receipt ou verify_url você quer revisar",
    "- qual é a dúvida principal",
    "- se existe bloqueio, risco ou exigência de auditoria",
    "",
    agentProfile?.chatCopy?.defaultNextStep?.trim() || "Se quiser, me diga a evidência ou receipt que eu sigo por aí.",
  ].join("\n");
}

export function buildAadvGuidanceReply(input: string, agentProfile: Agent | null) {
  const normalized = normalizeIntentText(input);

  if (
    normalized.includes("exemplo pratico") ||
    normalized.includes("exemplo prático") ||
    normalized === "mostre um exemplo pratico" ||
    normalized === "mostre um exemplo prático"
  ) {
    return [
      "Um exemplo simples seria este:",
      "",
      "Você quer consolidar um caso com valor esperado, riscos e evidências mínimas para decisão.",
      "Eu te ajudo a separar o que já existe, o que está faltando e qual bloco precisa ser completado primeiro.",
      "",
      "A partir disso, fica mais fácil montar um resumo executivo auditável sem perder contexto.",
    ].join("\n");
  }

  if (normalized.includes("riscos comuns") || normalized.includes("quais riscos")) {
    return [
      "Os riscos mais comuns nesse tipo de consolidação são:",
      "",
      "- decidir com evidências incompletas de FinOps ou segurança",
      "- misturar hipótese com dado validado",
      "- avançar sem confirmar RBAC, reconciliação ou trilha assinada",
      "- consolidar resumo executivo sem deixar claro o que ainda falta",
    ].join("\n");
  }

  if (normalized.includes("proximos passos") || normalized.includes("próximos passos")) {
    return [
      "Os próximos passos mais úteis costumam ser estes:",
      "",
      "1. identificar qual bloco está faltando",
      "2. reunir a evidência mínima de FinOps, segurança ou operação",
      "3. consolidar o resumo executivo só depois de validar as lacunas",
    ].join("\n");
  }

  if (normalized.includes("bloco faltante") || normalized.includes("consolidar")) {
    return [
      "Se o objetivo é completar o bloco faltante, eu sugiro começar por:",
      "",
      "- qual evidência está ausente",
      "- qual risco depende dessa confirmação",
      "- qual decisão precisa ser tomada depois da consolidação",
      "",
      agentProfile?.chatCopy?.defaultNextStep?.trim() || "Se quiser, me diga qual bloco falta e eu organizo o próximo passo.",
    ].join("\n");
  }

  return [
    "Posso te ajudar a organizar esse caso em blocos claros de evidência, risco e decisão.",
    "",
    "Para eu te orientar melhor, me diga pelo menos:",
    "- qual bloco você quer consolidar",
    "- qual evidência já existe",
    "- qual risco, dúvida ou decisão está travando o caso",
    "",
    agentProfile?.chatCopy?.defaultNextStep?.trim() || "Se quiser, me diga qual bloco está faltando e eu sigo daí.",
  ].join("\n");
}
