import {
  type ImobInternalAgentId,
  resolveImobWorkflowAgentBindingLoose,
} from "../agents/imobInternalAgents";
import type { ImobOperation } from "./imobMissionTypes";

type ImobOperationRouteDefinition = {
  targetAgentId: ImobInternalAgentId;
  supportingAgentIds: readonly ImobInternalAgentId[];
};

export type ImobOperationRoute = {
  operation: ImobOperation;
  ownerAgentId: "IMOB_Orchestrator";
  dispatchedAgentId: ImobInternalAgentId;
  supportingAgentIds: ImobInternalAgentId[];
  ownershipPreserved: true;
  source: "operation_map" | "workflow_binding";
};

const IMOB_OPERATION_AGENT_MAP: Record<ImobOperation, ImobOperationRouteDefinition> = {
  owner: {
    targetAgentId: "IMOB_OwnerAgent",
    supportingAgentIds: ["Guardian_EvidenceAgent"],
  },
  property: {
    targetAgentId: "IMOB_PropertyAgent",
    supportingAgentIds: ["IMOB_MarketScanAgent", "Guardian_EvidenceAgent"],
  },
  lead: {
    targetAgentId: "IMOB_LeadAgent",
    supportingAgentIds: ["IMOB_FollowUpAgent", "Guardian_EvidenceAgent"],
  },
  market: {
    targetAgentId: "IMOB_MarketScanAgent",
    supportingAgentIds: ["IMOB_PublicWebScanAgent", "Guardian_EvidenceAgent"],
  },
  documents: {
    targetAgentId: "IMOB_DocumentAgent",
    supportingAgentIds: ["Guardian_EvidenceAgent"],
  },
  visit: {
    targetAgentId: "IMOB_VisitAgent",
    supportingAgentIds: ["IMOB_FollowUpAgent", "Guardian_EvidenceAgent"],
  },
  campaign: {
    targetAgentId: "IMOB_FollowUpAgent",
    supportingAgentIds: ["Guardian_EvidenceAgent"],
  },
  contract: {
    targetAgentId: "IMOB_DocumentAgent",
    supportingAgentIds: ["Guardian_EvidenceAgent"],
  },
  commission: {
    targetAgentId: "IMOB_ContinuityAgent",
    supportingAgentIds: ["Guardian_EvidenceAgent"],
  },
  case: {
    targetAgentId: "IMOB_ContinuityAgent",
    supportingAgentIds: ["IMOB_MarketScanAgent", "IMOB_PublicWebScanAgent", "IMOB_FollowUpAgent", "Guardian_EvidenceAgent"],
  },
  proof: {
    targetAgentId: "Guardian_EvidenceAgent",
    supportingAgentIds: [],
  },
};

function dedupeAgentIds(agentIds: readonly ImobInternalAgentId[], dispatchedAgentId: ImobInternalAgentId) {
  return [...new Set(agentIds.filter((agentId) => agentId !== dispatchedAgentId))];
}

export function listImobOperationRoutes() {
  return Object.entries(IMOB_OPERATION_AGENT_MAP).map(([operation, route]) => ({
    operation: operation as ImobOperation,
    ownerAgentId: "IMOB_Orchestrator" as const,
    dispatchedAgentId: route.targetAgentId,
    supportingAgentIds: [...route.supportingAgentIds],
    ownershipPreserved: true as const,
    source: "operation_map" as const,
  }));
}

export function resolveImobOperationRoute(
  operation: ImobOperation,
  workflowState?: string | null,
): ImobOperationRoute {
  const base = IMOB_OPERATION_AGENT_MAP[operation];
  const workflowBinding = resolveImobWorkflowAgentBindingLoose(workflowState);

  if (!workflowBinding) {
    return {
      operation,
      ownerAgentId: "IMOB_Orchestrator",
      dispatchedAgentId: base.targetAgentId,
      supportingAgentIds: [...base.supportingAgentIds],
      ownershipPreserved: true,
      source: "operation_map",
    };
  }

  return {
    operation,
    ownerAgentId: "IMOB_Orchestrator",
    dispatchedAgentId: workflowBinding.primaryAgentId,
    supportingAgentIds: dedupeAgentIds(
      [...base.supportingAgentIds, ...workflowBinding.supportingAgentIds],
      workflowBinding.primaryAgentId,
    ),
    ownershipPreserved: true,
    source: "workflow_binding",
  };
}

export function resolveImobOperationRouteLoose(
  operation?: string | null,
  workflowState?: string | null,
): ImobOperationRoute | null {
  if (!operation) return null;
  if (!(operation in IMOB_OPERATION_AGENT_MAP)) return null;
  return resolveImobOperationRoute(operation as ImobOperation, workflowState);
}
