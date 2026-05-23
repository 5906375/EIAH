import { getImobInternalAgent, listImobInternalAgents } from "../agents/imobInternalAgents";
import { listImobOperationRoutes } from "./imobOperationRouter";

export type ImobCrmAgentRegistryEntry = {
  operation: ReturnType<typeof listImobOperationRoutes>[number]["operation"];
  ownerAgentId: "IMOB_Orchestrator";
  targetAgentId: ReturnType<typeof listImobOperationRoutes>[number]["dispatchedAgentId"];
  supportingAgentIds: ReturnType<typeof listImobOperationRoutes>[number]["supportingAgentIds"];
  visibleAgentId: "IMOB";
  targetAgentLabel: string;
  targetAgentMode: string;
  targetAgentRole: string;
  workflowStates: string[];
};

export function buildImobCrmAgentRegistry(): ImobCrmAgentRegistryEntry[] {
  return listImobOperationRoutes().map((route) => {
    const target = getImobInternalAgent(route.dispatchedAgentId);
    if (!target) {
      throw new Error(`Unknown IMOB internal agent in CRM registry: ${route.dispatchedAgentId}`);
    }

    return {
      operation: route.operation,
      ownerAgentId: route.ownerAgentId,
      targetAgentId: route.dispatchedAgentId,
      supportingAgentIds: route.supportingAgentIds,
      visibleAgentId: "IMOB",
      targetAgentLabel: target.label,
      targetAgentMode: target.mode,
      targetAgentRole: target.role,
      workflowStates: [...target.workflowStates],
    };
  });
}

export function listImobCrmAgentRegistryAgents() {
  return listImobInternalAgents();
}
