import type { ImobCrmWorkflowState } from "../crm/imobCrmWorkflowMachine";
import type { ImobCapabilityOwnerAgent } from "../imobCapabilityRegistry";
import type { ImobAgentMode, ImobAgentRole } from "./imobAgentActivity";

export type ImobInternalAgentId =
  | "IMOB_Orchestrator"
  | "IMOB_PropertyAgent"
  | "IMOB_OwnerAgent"
  | "IMOB_DedupeAgent"
  | "IMOB_LeadAgent"
  | "IMOB_MarketScanAgent"
  | "IMOB_VisitAgent"
  | "IMOB_DocumentAgent"
  | "IMOB_ContinuityAgent"
  | "IMOB_FollowUpAgent"
  | "Guardian_EvidenceAgent";

export type ImobVisibleSupportingAgentId =
  | "IMOB"
  | "I_BC"
  | "Diarias"
  | "J_360"
  | "fin-nexus"
  | "guardian";

export type ImobInternalAgentDefinition = {
  id: ImobInternalAgentId;
  label: string;
  role: ImobAgentRole;
  mode: ImobAgentMode;
  ownershipPreserved: true;
  visibleAgentId: "IMOB";
  backingAgentId?: ImobVisibleSupportingAgentId;
  capabilityOwnerAgent?: ImobCapabilityOwnerAgent;
  workflowStates: readonly ImobCrmWorkflowState[];
  responsibilities: readonly string[];
};

export type ImobWorkflowAgentBinding = {
  state: ImobCrmWorkflowState;
  primaryAgentId: ImobInternalAgentId;
  supportingAgentIds: readonly ImobInternalAgentId[];
};

const IMOB_INTERNAL_AGENTS = [
  {
    id: "IMOB_Orchestrator",
    label: "IMOB",
    role: "owner",
    mode: "propose_action",
    ownershipPreserved: true,
    visibleAgentId: "IMOB",
    backingAgentId: "IMOB",
    workflowStates: [
      "property.create",
      "property.market_scan",
      "property.market_scan.selection",
      "owner.create",
      "owner.dedupe_review",
      "owner.update",
      "lead.qualify",
      "case.review",
      "visit.schedule",
      "pilot.status",
      "documents.review",
    ],
    responsibilities: [
      "triagem da intenção operacional",
      "manter ownership do caso no IMOB",
      "acionar agentes internos e especialistas de apoio quando necessário",
    ],
  },
  {
    id: "IMOB_PropertyAgent",
    label: "IMOB",
    role: "owner",
    mode: "propose_action",
    ownershipPreserved: true,
    visibleAgentId: "IMOB",
    backingAgentId: "IMOB",
    workflowStates: ["property.create"],
    responsibilities: [
      "captar imóvel e organizar pendências do cadastro",
      "manter cidade, finalidade e estrutura do imóvel coerentes com o fluxo",
    ],
  },
  {
    id: "IMOB_OwnerAgent",
    label: "IMOB",
    role: "owner",
    mode: "propose_action",
    ownershipPreserved: true,
    visibleAgentId: "IMOB",
    backingAgentId: "IMOB",
    workflowStates: ["owner.create", "owner.update"],
    responsibilities: [
      "qualificar proprietário e vínculo com o caso",
      "preparar contexto para dedupe governado",
    ],
  },
  {
    id: "IMOB_DedupeAgent",
    label: "Dedupe",
    role: "supporting",
    mode: "execute",
    ownershipPreserved: true,
    visibleAgentId: "IMOB",
    backingAgentId: "IMOB",
    workflowStates: ["owner.dedupe_review"],
    responsibilities: [
      "comparar cadastros existentes",
      "bloquear atualização sem matchedEntityId",
    ],
  },
  {
    id: "IMOB_LeadAgent",
    label: "Lead",
    role: "supporting",
    mode: "propose_action",
    ownershipPreserved: true,
    visibleAgentId: "IMOB",
    backingAgentId: "IMOB",
    capabilityOwnerAgent: "imob.lead_qualifier",
    workflowStates: ["lead.qualify"],
    responsibilities: [
      "consolidar sinais de qualificação",
      "preparar próximo passo comercial sem assumir ownership",
    ],
  },
  {
    id: "IMOB_MarketScanAgent",
    label: "Market Scan",
    role: "supporting",
    mode: "read_only",
    ownershipPreserved: true,
    visibleAgentId: "IMOB",
    backingAgentId: "IMOB",
    capabilityOwnerAgent: "imob.inventory_watch_agent",
    workflowStates: ["property.create", "property.market_scan", "property.market_scan.selection", "case.review"],
    responsibilities: [
      "preparar leitura exploratória de oportunidades",
      "apoiar comparações sem criar entidades definitivas",
    ],
  },
  {
    id: "IMOB_VisitAgent",
    label: "Visitas",
    role: "supporting",
    mode: "execute",
    ownershipPreserved: true,
    visibleAgentId: "IMOB",
    backingAgentId: "Diarias",
    capabilityOwnerAgent: "imob.scheduling_agent",
    workflowStates: ["visit.schedule"],
    responsibilities: [
      "validar pré-condições de visita",
      "coordenar agendamento assistido sob guardas de workflow",
    ],
  },
  {
    id: "IMOB_DocumentAgent",
    label: "Documentos",
    role: "supporting",
    mode: "propose_action",
    ownershipPreserved: true,
    visibleAgentId: "IMOB",
    backingAgentId: "J_360",
    capabilityOwnerAgent: "imob.closing_agent",
    workflowStates: ["documents.review"],
    responsibilities: [
      "montar checklist documental",
      "acionar apoio jurídico sem transferir ownership do caso",
    ],
  },
  {
    id: "IMOB_ContinuityAgent",
    label: "Continuidade",
    role: "supporting",
    mode: "read_only",
    ownershipPreserved: true,
    visibleAgentId: "IMOB",
    backingAgentId: "Diarias",
    workflowStates: ["case.review", "pilot.status"],
    responsibilities: [
      "retomar contexto do caso",
      "consolidar fase, blockers e próximos passos operacionais",
    ],
  },
  {
    id: "IMOB_FollowUpAgent",
    label: "Marketing",
    role: "supporting",
    mode: "draft",
    ownershipPreserved: true,
    visibleAgentId: "IMOB",
    backingAgentId: "I_BC",
    workflowStates: ["lead.qualify", "case.review", "visit.schedule"],
    responsibilities: [
      "preparar abordagem comercial contextual",
      "apoiar retomada e follow-up sem envio automático",
    ],
  },
  {
    id: "Guardian_EvidenceAgent",
    label: "Guardian",
    role: "guardian",
    mode: "audit",
    ownershipPreserved: true,
    visibleAgentId: "IMOB",
    backingAgentId: "guardian",
    capabilityOwnerAgent: "guardian",
    workflowStates: [
      "property.create",
      "property.market_scan",
      "property.market_scan.selection",
      "owner.create",
      "owner.dedupe_review",
      "owner.update",
      "lead.qualify",
      "case.review",
      "visit.schedule",
      "pilot.status",
      "documents.review",
    ],
    responsibilities: [
      "registrar evidência e trilha auditável quando aplicável",
      "provar bloqueios, receipts e snapshots operacionais",
    ],
  },
] as const satisfies readonly ImobInternalAgentDefinition[];

const IMOB_WORKFLOW_AGENT_BINDINGS = [
  {
    state: "property.create",
    primaryAgentId: "IMOB_PropertyAgent",
    supportingAgentIds: ["IMOB_MarketScanAgent", "Guardian_EvidenceAgent"],
  },
  {
    state: "property.market_scan",
    primaryAgentId: "IMOB_MarketScanAgent",
    supportingAgentIds: ["Guardian_EvidenceAgent"],
  },
  {
    state: "property.market_scan.selection",
    primaryAgentId: "IMOB_MarketScanAgent",
    supportingAgentIds: ["Guardian_EvidenceAgent"],
  },
  {
    state: "owner.create",
    primaryAgentId: "IMOB_OwnerAgent",
    supportingAgentIds: ["Guardian_EvidenceAgent"],
  },
  {
    state: "owner.dedupe_review",
    primaryAgentId: "IMOB_DedupeAgent",
    supportingAgentIds: ["Guardian_EvidenceAgent"],
  },
  {
    state: "owner.update",
    primaryAgentId: "IMOB_OwnerAgent",
    supportingAgentIds: ["Guardian_EvidenceAgent"],
  },
  {
    state: "lead.qualify",
    primaryAgentId: "IMOB_LeadAgent",
    supportingAgentIds: ["IMOB_FollowUpAgent", "Guardian_EvidenceAgent"],
  },
  {
    state: "case.review",
    primaryAgentId: "IMOB_ContinuityAgent",
    supportingAgentIds: ["IMOB_MarketScanAgent", "IMOB_FollowUpAgent", "Guardian_EvidenceAgent"],
  },
  {
    state: "visit.schedule",
    primaryAgentId: "IMOB_VisitAgent",
    supportingAgentIds: ["IMOB_FollowUpAgent", "Guardian_EvidenceAgent"],
  },
  {
    state: "pilot.status",
    primaryAgentId: "IMOB_ContinuityAgent",
    supportingAgentIds: ["Guardian_EvidenceAgent"],
  },
  {
    state: "documents.review",
    primaryAgentId: "IMOB_DocumentAgent",
    supportingAgentIds: ["Guardian_EvidenceAgent"],
  },
] as const satisfies readonly ImobWorkflowAgentBinding[];

export function listImobInternalAgents() {
  return IMOB_INTERNAL_AGENTS.map((item) => ({
    ...item,
    workflowStates: [...item.workflowStates],
    responsibilities: [...item.responsibilities],
  }));
}

export function listImobWorkflowAgentBindings() {
  return IMOB_WORKFLOW_AGENT_BINDINGS.map((item) => ({
    ...item,
    supportingAgentIds: [...item.supportingAgentIds],
  }));
}

export function getImobInternalAgent(agentId: ImobInternalAgentId) {
  const definition = IMOB_INTERNAL_AGENTS.find((item) => item.id === agentId);
  return definition
    ? {
        ...definition,
        workflowStates: [...definition.workflowStates],
        responsibilities: [...definition.responsibilities],
      }
    : null;
}

export function resolveImobWorkflowAgentBinding(state: ImobCrmWorkflowState) {
  const binding = IMOB_WORKFLOW_AGENT_BINDINGS.find((item) => item.state === state);
  return binding
    ? {
        ...binding,
        supportingAgentIds: [...binding.supportingAgentIds],
      }
    : null;
}
