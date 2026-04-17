import type {
  ImobBackingSpecialistContract,
  ImobCaseContext,
  ImobResolvedBackingSpecialist,
} from "./imobConversationContract";

const IMOB_BACKING_SPECIALISTS: ImobBackingSpecialistContract[] = [
  {
    key: "commercial_intelligence",
    primaryAgentId: "I_BC",
    responsibility: "priorização comercial e próxima melhor abordagem",
    visibleToUserByDefault: false,
    escalationTriggers: ["lead quente", "oportunidade prioritária", "próximo passo comercial"],
  },
  {
    key: "daily_ops",
    primaryAgentId: "Diarias",
    responsibility: "rotina diária, follow-up e backlog acionável",
    visibleToUserByDefault: false,
    escalationTriggers: ["resumo do dia", "follow-up", "o que fazer hoje"],
  },
  {
    key: "legal",
    primaryAgentId: "J_360",
    responsibility: "contrato, cláusulas, matrícula e risco documental imobiliário",
    visibleToUserByDefault: false,
    escalationTriggers: ["contrato", "matrícula", "cláusula", "locação", "compra e venda"],
  },
  {
    key: "financial",
    primaryAgentId: "fin-nexus",
    responsibility: "pendência financeira, cobrança e conciliação operacional",
    visibleToUserByDefault: false,
    escalationTriggers: ["sinal", "comissão", "cobrança", "repasse", "pendência financeira"],
  },
  {
    key: "audit",
    primaryAgentId: "guardian",
    responsibility: "receipt, bundle, verify URL e fechamento auditável",
    visibleToUserByDefault: false,
    escalationTriggers: ["receipt", "bundle", "verify", "audit trail", "fechamento crítico"],
  },
];

function includesAny(value: string | null | undefined, terms: string[]) {
  const normalized = (value ?? "").trim().toLowerCase();
  return terms.some((term) => normalized.includes(term));
}

function normalizeItems(items: unknown[] | null | undefined) {
  return Array.isArray(items)
    ? items.map((item) => String(item ?? "").trim().toLowerCase()).filter(Boolean)
    : [];
}

function resolveBaseUrgency(caseContext?: ImobCaseContext | null): "low" | "medium" | "high" {
  const workflowUrgency = caseContext?.humanWorkflow?.urgency;
  if (workflowUrgency === "critical" || workflowUrgency === "high") return "high";
  if (workflowUrgency === "medium") return "medium";
  return "low";
}

function mergeUrgency(
  base: "low" | "medium" | "high",
  next: "low" | "medium" | "high"
): "low" | "medium" | "high" {
  const rank = { low: 0, medium: 1, high: 2 } as const;
  return rank[next] > rank[base] ? next : base;
}

function resolveSpecialistUrgency(
  key: ImobBackingSpecialistContract["key"],
  caseContext: ImobCaseContext,
  baseUrgency: "low" | "medium" | "high"
): "low" | "medium" | "high" {
  const followUpRisk = caseContext.humanWorkflow?.followUpRisk ?? null;
  const waitingOn = caseContext.humanWorkflow?.waitingOn ?? null;
  const agingHours = caseContext.humanWorkflow?.agingHours ?? 0;
  const currentObjective = (caseContext.humanWorkflow?.currentObjective ?? "").toLowerCase();
  const hasBlocker = Boolean((caseContext.blocker ?? "").trim());

  switch (key) {
    case "daily_ops":
      if (followUpRisk === "high" || agingHours >= 48) return "high";
      if (followUpRisk === "medium" || agingHours >= 24) return mergeUrgency(baseUrgency, "medium");
      return baseUrgency;
    case "commercial_intelligence":
      if (currentObjective.includes("proposta") || currentObjective.includes("negocia")) return "high";
      if (waitingOn === "lead" || waitingOn === "broker") return mergeUrgency(baseUrgency, "medium");
      return baseUrgency;
    case "legal":
      if (waitingOn === "legal" || hasBlocker) return "high";
      return mergeUrgency(baseUrgency, "medium");
    case "financial":
      if (waitingOn === "finance" || hasBlocker) return "high";
      return mergeUrgency(baseUrgency, "medium");
    case "audit":
      if (hasBlocker) return "high";
      return mergeUrgency(baseUrgency, "medium");
    default:
      return baseUrgency;
  }
}

export function listImobBackingSpecialists() {
  return IMOB_BACKING_SPECIALISTS.map((item) => ({ ...item }));
}

export function resolveImobBackingSpecialists(caseContext?: ImobCaseContext | null): ImobResolvedBackingSpecialist[] {
  if (!caseContext) return [];

  const journey = (caseContext.canonical?.journeyType ?? "").trim().toLowerCase();
  const flow = (caseContext.flow ?? "").trim().toLowerCase();
  const pending = normalizeItems(caseContext.pendingItems);
  const blocker = (caseContext.blocker ?? "").trim().toLowerCase();
  const baseUrgency = resolveBaseUrgency(caseContext);

  const resolved: ImobResolvedBackingSpecialist[] = [];
  const push = (
    key: ImobBackingSpecialistContract["key"],
    params: {
      rationale: string;
      reasonCode?: ImobResolvedBackingSpecialist["reasonCode"];
      suggestedAction?: string | null;
      urgency?: "low" | "medium" | "high";
      outputType?: ImobResolvedBackingSpecialist["outputType"];
      requiredContext?: string[];
    }
  ) => {
    if (resolved.some((item) => item.key === key)) return;
    const specialist = IMOB_BACKING_SPECIALISTS.find((item) => item.key === key);
    if (!specialist) return;
    resolved.push({
      ...specialist,
      rationale: params.rationale,
      reasonCode: params.reasonCode,
      suggestedAction: params.suggestedAction ?? null,
      urgency: params.urgency ?? resolveSpecialistUrgency(key, caseContext, baseUrgency),
      outputType: params.outputType,
      requiredContext: params.requiredContext ?? [],
    });
  };

  if (journey === "lead_qualification" || flow === "lead.qualify") {
    push("commercial_intelligence", {
      rationale: "A jornada atual depende de priorização comercial e abordagem do lead.",
      reasonCode: "COMMERCIAL_PRIORITY",
      suggestedAction: "Revisar aderência do lead e definir a próxima abordagem comercial.",
      outputType: "advice",
      requiredContext: ["case.nextStep", "lead.context", "humanWorkflow.currentObjective"],
    });
    push("daily_ops", {
      rationale: "O caso pode entrar na rotina diária do corretor para follow-up e sequência.",
      reasonCode: "FOLLOW_UP_DISCIPLINE",
      suggestedAction: "Organizar follow-up do caso e colocar a retomada na fila do dia.",
      outputType: "operational_support",
      requiredContext: ["humanWorkflow.followUpRisk", "case.pendingItems", "case.nextStep"],
    });
  }

  if (journey === "proposal" || journey === "negotiation" || flow === "proposal.create" || flow === "deal.review") {
    push("commercial_intelligence", {
      rationale: "O caso exige leitura comercial de proposta, contraproposta ou avanço de negociação.",
      reasonCode: "COMMERCIAL_PRIORITY",
      suggestedAction: "Revisar proposta, mapear objeções e definir a melhor abordagem de negociação.",
      outputType: "advice",
      requiredContext: ["case.nextStep", "case.stage", "lead.context"],
    });
  }

  if (journey === "documentation" || journey === "contract" || flow === "documents.collect" || flow === "contract.prepare") {
    push("legal", {
      rationale: "A etapa atual pede apoio documental ou jurídico antes de seguir.",
      reasonCode: "DOCUMENT_BLOCKER",
      suggestedAction: "Validar pendências documentais e contratuais antes de avançar o caso.",
      outputType: "validation",
      requiredContext: ["case.blocker", "case.pendingItems", "case.stage"],
    });
  }

  if (journey === "commission" || includesAny(blocker, ["finance", "pag", "sinal", "comissao", "repasse"])) {
    push("financial", {
      rationale: "Há sinal financeiro ou de liquidação relevante neste caso.",
      reasonCode: "FINANCIAL_BLOCKER",
      suggestedAction: "Checar comissão, repasse, sinal ou cobrança antes do fechamento.",
      outputType: "financial_check",
      requiredContext: ["case.blocker", "case.nextStep", "case.stage"],
    });
  }

  if (includesAny(blocker, ["receipt", "verify", "bundle", "aud"])) {
    push("audit", {
      rationale: "O caso traz exigência de fechamento auditável ou verificável.",
      reasonCode: "AUDIT_BLOCKER",
      suggestedAction: "Garantir evidências, receipt e bundle verificável antes de concluir.",
      outputType: "evidence",
      requiredContext: ["case.blocker", "case.stage"],
    });
  }

  if (pending.some((item) => item.includes("document")) || pending.some((item) => item.includes("matricula")) || pending.some((item) => item.includes("contrato"))) {
    push("legal", {
      rationale: "Existem pendências documentais que podem pedir leitura especializada.",
      reasonCode: "DOCUMENT_BLOCKER",
      suggestedAction: "Revisar checklist documental e validar o que bloqueia o avanço.",
      outputType: "validation",
      requiredContext: ["case.pendingItems", "case.nextStep"],
    });
  }

  if (pending.some((item) => item.includes("orcamento")) || pending.some((item) => item.includes("budget")) || pending.some((item) => item.includes("lead"))) {
    push("commercial_intelligence", {
      rationale: "Há pendências que afetam aderência comercial e próximo melhor passo.",
      reasonCode: "COMMERCIAL_PRIORITY",
      suggestedAction: "Revisar aderência comercial do caso e definir a melhor ação seguinte.",
      outputType: "advice",
      requiredContext: ["case.pendingItems", "lead.context", "case.nextStep"],
    });
  }

  if (resolved.length === 0 && caseContext.canonical?.recommendedActions?.length) {
    push("daily_ops", {
      rationale: "O caso já tem ação recomendada e pode ser tratado como rotina acionável.",
      reasonCode: "FOLLOW_UP_DISCIPLINE",
      suggestedAction: "Colocar a próxima ação do caso na rotina diária e executar o follow-up.",
      outputType: "operational_support",
      requiredContext: ["case.recommendedActions", "humanWorkflow.followUpRisk", "case.nextStep"],
    });
  }

  return resolved.slice(0, 2);
}
