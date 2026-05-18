export type ImobAgentRole = "owner" | "supporting" | "guardian";

export type ImobAgentMode =
  | "read_only"
  | "draft"
  | "intelligence"
  | "restricted_scan"
  | "propose_action"
  | "execute"
  | "audit";

export type ImobAgentActivityStatus =
  | "queued"
  | "analyzing"
  | "working"
  | "blocked"
  | "completed"
  | "requires_confirmation";

export type ImobAgentActivityEvent = {
  agentId: string;
  agentLabel: string;
  displayPrefix?: "Agente";
  role: ImobAgentRole;
  mode: ImobAgentMode;
  status: ImobAgentActivityStatus;
  visibleMessage: string;
  reasonCode?: string;
  evidenceId?: string;
  startedAt?: string;
  completedAt?: string;
};

export function createImobAgentActivityEvent(
  params: ImobAgentActivityEvent,
): ImobAgentActivityEvent {
  return {
    ...params,
    displayPrefix: params.displayPrefix ?? "Agente",
    agentLabel: params.agentLabel.trim(),
    visibleMessage: params.visibleMessage.trim(),
  };
}
