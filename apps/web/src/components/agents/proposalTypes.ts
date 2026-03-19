export type ProposalDomain = "saas" | "imob";

export type ConversationStage =
  | "proposal_idle"
  | "proposal_collecting_usage"
  | "proposal_recommended"
  | "proposal_ready_to_open"
  | "proposal_opening"
  | "proposal_demo_requested"
  | "proposal_demo_ready";

export type ProposalRequestedAction =
  | "open_commercial_proposal"
  | "schedule_demo"
  | "create_assisted_trial"
  | "send_to_sales"
  | "new_purchase"
  | "workspace_expansion";

export type ResolvedProposalUsageContext = {
  users: number | null;
  runs: number | null;
  source: "current_input" | "previous_context" | "mixed" | "none";
};

export type ResolvedProposalState = {
  domain: ProposalDomain;
  stage: ConversationStage;
  usage: ResolvedProposalUsageContext;
  requestedAction: ProposalRequestedAction | null;
  contextRecovered: boolean;
  contextLost: boolean;
  domainMismatch: boolean;
};
