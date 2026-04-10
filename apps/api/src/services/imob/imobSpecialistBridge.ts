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

export function listImobBackingSpecialists() {
  return IMOB_BACKING_SPECIALISTS.map((item) => ({ ...item }));
}

export function resolveImobBackingSpecialists(caseContext?: ImobCaseContext | null): ImobResolvedBackingSpecialist[] {
  if (!caseContext) return [];

  const journey = (caseContext.canonical?.journeyType ?? "").trim().toLowerCase();
  const flow = (caseContext.flow ?? "").trim().toLowerCase();
  const pending = (caseContext.pendingItems ?? []).map((item) => String(item).toLowerCase());
  const blocker = (caseContext.blocker ?? "").trim().toLowerCase();

  const resolved: ImobResolvedBackingSpecialist[] = [];
  const push = (key: ImobBackingSpecialistContract["key"], rationale: string) => {
    if (resolved.some((item) => item.key === key)) return;
    const specialist = IMOB_BACKING_SPECIALISTS.find((item) => item.key === key);
    if (!specialist) return;
    resolved.push({ ...specialist, rationale });
  };

  if (journey === "lead_qualification" || flow === "lead.qualify") {
    push("commercial_intelligence", "A jornada atual depende de priorização comercial e abordagem do lead.");
    push("daily_ops", "O caso pode entrar na rotina diária do corretor para follow-up e sequência.");
  }

  if (journey === "proposal" || journey === "negotiation" || flow === "proposal.create" || flow === "deal.review") {
    push("commercial_intelligence", "O caso exige leitura comercial de proposta, contraproposta ou avanço de negociação.");
  }

  if (journey === "documentation" || journey === "contract" || flow === "documents.collect" || flow === "contract.prepare") {
    push("legal", "A etapa atual pede apoio documental ou jurídico antes de seguir.");
  }

  if (journey === "commission" || includesAny(blocker, ["finance", "pag", "sinal", "comissao", "repasse"])) {
    push("financial", "Há sinal financeiro ou de liquidação relevante neste caso.");
  }

  if (includesAny(blocker, ["receipt", "verify", "bundle", "aud"])) {
    push("audit", "O caso traz exigência de fechamento auditável ou verificável.");
  }

  if (pending.some((item) => item.includes("document")) || pending.some((item) => item.includes("matricula")) || pending.some((item) => item.includes("contrato"))) {
    push("legal", "Existem pendências documentais que podem pedir leitura especializada.");
  }

  if (pending.some((item) => item.includes("orcamento")) || pending.some((item) => item.includes("budget")) || pending.some((item) => item.includes("lead"))) {
    push("commercial_intelligence", "Há pendências que afetam aderência comercial e próximo melhor passo.");
  }

  if (resolved.length === 0 && caseContext.canonical?.recommendedActions?.length) {
    push("daily_ops", "O caso já tem ação recomendada e pode ser tratado como rotina acionável.");
  }

  return resolved.slice(0, 2);
}
