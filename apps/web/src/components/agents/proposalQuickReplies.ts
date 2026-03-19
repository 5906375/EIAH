import type { ConversationStage, ProposalDomain } from "@/components/agents/proposalTypes";

const SAAS_PROPOSAL_QUICK_REPLIES: Record<ConversationStage, string[]> = {
  proposal_idle: [
    "Tenho 3 usuários e 2000 runs/mês. Qual plano?",
    "Quero abrir proposta comercial",
    "Quero agendar demonstração",
  ],
  proposal_collecting_usage: [
    "Tenho 3 usuários e 2000 runs/mês. Qual plano?",
    "Quero abrir proposta comercial",
    "Quero agendar demonstração",
  ],
  proposal_recommended: [
    "Abrir proposta comercial",
    "Agendar demonstração",
    "Criar trial assistido",
  ],
  proposal_ready_to_open: [
    "É compra nova",
    "É expansão do workspace",
    "Quero falar com comercial",
  ],
  proposal_opening: [
    "É compra nova",
    "É expansão do workspace",
    "Quero falar com comercial",
  ],
  proposal_demo_requested: [
    "Quero agendar demonstração",
    "Criar trial assistido",
    "Quero falar com comercial",
  ],
  proposal_demo_ready: [
    "Quero agendar demonstração",
    "Criar trial assistido",
    "Quero falar com comercial",
  ],
};

export function buildProposalQuickReplies(params: {
  proposalDomain?: ProposalDomain | null;
  conversationStage?: ConversationStage | null;
}) {
  if (params.proposalDomain !== "saas") {
    return SAAS_PROPOSAL_QUICK_REPLIES.proposal_collecting_usage;
  }

  return SAAS_PROPOSAL_QUICK_REPLIES[params.conversationStage ?? "proposal_collecting_usage"];
}
