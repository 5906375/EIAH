type ImobCaseForSla = {
  flow: string;
  stage: string;
  status: string;
  pendingItems: string[];
};

export type ImobCrmSlaSeverity = "low" | "medium" | "high";

export type ImobCrmSlaRuleId =
  | "lead_stale_24h"
  | "documents_pending_48h"
  | "proposal_stale_24h";

export type ImobCrmSlaRule = {
  id: ImobCrmSlaRuleId;
  title: string;
  thresholdHours: number;
  cooldownHours: number;
  severity: ImobCrmSlaSeverity;
  nextAction: string;
  suggestedMessage: string;
  matches: (item: ImobCaseForSla) => boolean;
};

const normalize = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();

export const IMOB_CRM_SLA_RULES: ImobCrmSlaRule[] = [
  {
    id: "lead_stale_24h",
    title: "Lead sem avanço em 24h",
    thresholdHours: 24,
    cooldownHours: 20,
    severity: "high",
    nextAction: "Retomar contato com o lead e confirmar interesse atual.",
    suggestedMessage: "Oi! Passando para retomar seu atendimento e alinhar próximos passos da busca.",
    matches: (item) => {
      const flow = normalize(item.flow);
      const stage = normalize(item.stage);
      const status = normalize(item.status);
      if (status === "done" || status === "success" || status === "completed" || status === "archived") return false;
      return flow === "lead.qualify" || stage.includes("lead") || stage === "qualified";
    },
  },
  {
    id: "documents_pending_48h",
    title: "Pendência documental acima de 48h",
    thresholdHours: 48,
    cooldownHours: 24,
    severity: "high",
    nextAction: "Cobrar os documentos pendentes e confirmar canal de envio.",
    suggestedMessage: "Para avançar seu processo, faltam documentos pendentes. Pode enviar por este canal agora?",
    matches: (item) => {
      const flow = normalize(item.flow);
      const status = normalize(item.status);
      if (status === "done" || status === "success" || status === "completed" || status === "archived") return false;
      if (flow !== "documents.collect") return false;
      return item.pendingItems.length > 0;
    },
  },
  {
    id: "proposal_stale_24h",
    title: "Proposta sem resposta em 24h",
    thresholdHours: 24,
    cooldownHours: 20,
    severity: "medium",
    nextAction: "Fazer follow-up da proposta e registrar contraproposta se houver.",
    suggestedMessage: "Conseguiu revisar a proposta? Posso ajustar condições para facilitar o avanço.",
    matches: (item) => {
      const flow = normalize(item.flow);
      const status = normalize(item.status);
      if (status === "done" || status === "success" || status === "completed" || status === "archived") return false;
      return flow === "proposal.create";
    },
  },
];

