export type ImobCapabilityStatus =
  | "proposed"
  | "mapped"
  | "partial"
  | "ready_for_shadow"
  | "shadow"
  | "pilot"
  | "active";

export type ImobCapabilityExecutionMode =
  | "manual"
  | "assisted"
  | "shadow"
  | "pilot"
  | "automated";

export type ImobCapabilityRiskTier = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type ImobCapabilityRolloutStage =
  | "backlog"
  | "design"
  | "shadow"
  | "pilot"
  | "small"
  | "broad";

export type ImobCapabilityCategory =
  | "runtime_extension"
  | "external_integration"
  | "worker_orchestration";

export type ImobCapabilityOwnerAgent =
  | "IMOB"
  | "imob.scout_agent"
  | "imob.viability_analyst"
  | "imob.outreach_agent"
  | "imob.lead_qualifier"
  | "imob.lead_scoring_agent"
  | "imob.profile_analyst"
  | "imob.enrichment_agent"
  | "imob.scheduling_agent"
  | "imob.reengagement_agent"
  | "imob.inventory_watch_agent"
  | "imob.listing_publisher_agent"
  | "imob.closing_agent"
  | "imob.relationship_memory_agent"
  | "imob.mission_orchestrator"
  | "imob.mission_queue_agent"
  | "guardian"
  | "fin-nexus"
  | "J_360";

export type ImobCapabilityRegistryEntry = {
  capabilityId: string;
  category: ImobCapabilityCategory;
  ownerAgent: ImobCapabilityOwnerAgent;
  visibleAgentId: "IMOB";
  status: ImobCapabilityStatus;
  executionMode: ImobCapabilityExecutionMode;
  riskTier: ImobCapabilityRiskTier;
  rolloutStage: ImobCapabilityRolloutStage;
  requiresConsent: boolean;
  requiresHumanApproval: boolean;
  requiresEvidence: boolean;
  policyRequired: boolean;
  initialImplementation: string;
  dependsOn: readonly string[];
};

const IMOB_VISIBLE_AGENT_ID = "IMOB" as const;

export const imobCapabilityRegistry = {
  runtimeExtensions: [
    {
      capabilityId: "lead.qualify.discovery",
      category: "runtime_extension",
      ownerAgent: "imob.lead_qualifier",
      visibleAgentId: IMOB_VISIBLE_AGENT_ID,
      status: "ready_for_shadow",
      executionMode: "shadow",
      riskTier: "MEDIUM",
      rolloutStage: "shadow",
      requiresConsent: false,
      requiresHumanApproval: false,
      requiresEvidence: true,
      policyRequired: false,
      initialImplementation:
        "Persist structured discovery signals on lead qualification and expose a consultive shadow snapshot of coverage and missing signals in business read.",
      dependsOn: ["imobTurnResolver", "imobCrmTurnEngine", "imobCrmBusinessRead"],
    },
    {
      capabilityId: "lead.profile_report",
      category: "runtime_extension",
      ownerAgent: "imob.profile_analyst",
      visibleAgentId: IMOB_VISIBLE_AGENT_ID,
      status: "ready_for_shadow",
      executionMode: "shadow",
      riskTier: "HIGH",
      rolloutStage: "shadow",
      requiresConsent: true,
      requiresHumanApproval: true,
      requiresEvidence: true,
      policyRequired: true,
      initialImplementation:
        "Derive consented commercial and financial profile from declared data, CRM history and authorized documents only.",
      dependsOn: ["caseBrief", "preparedFollowUp", "fin-nexus"],
    },
    {
      capabilityId: "closing.documents_real",
      category: "runtime_extension",
      ownerAgent: "imob.closing_agent",
      visibleAgentId: IMOB_VISIBLE_AGENT_ID,
      status: "ready_for_shadow",
      executionMode: "shadow",
      riskTier: "HIGH",
      rolloutStage: "shadow",
      requiresConsent: true,
      requiresHumanApproval: true,
      requiresEvidence: true,
      policyRequired: true,
      initialImplementation:
        "Expose consultive document-readiness, packet status and legal handoff guidance from internal case state before any real document workflow automation.",
      dependsOn: ["documents.collect", "contract.prepare", "deal.review", "J_360"],
    },
    {
      capabilityId: "evidence.decision_rationale",
      category: "runtime_extension",
      ownerAgent: "guardian",
      visibleAgentId: IMOB_VISIBLE_AGENT_ID,
      status: "mapped",
      executionMode: "assisted",
      riskTier: "MEDIUM",
      rolloutStage: "design",
      requiresConsent: false,
      requiresHumanApproval: false,
      requiresEvidence: true,
      policyRequired: false,
      initialImplementation:
        "Attach sourceRefs, reasonCodes, confidence and missingEvidence to critical recommendations.",
      dependsOn: ["guardian", "receipts", "audit", "imobCrmBusinessRead"],
    },
  ] as const satisfies readonly ImobCapabilityRegistryEntry[],

  externalIntegrations: [
    {
      capabilityId: "active_capture.scouting",
      category: "external_integration",
      ownerAgent: "imob.scout_agent",
      visibleAgentId: IMOB_VISIBLE_AGENT_ID,
      status: "ready_for_shadow",
      executionMode: "shadow",
      riskTier: "HIGH",
      rolloutStage: "shadow",
      requiresConsent: false,
      requiresHumanApproval: false,
      requiresEvidence: true,
      policyRequired: true,
      initialImplementation:
        "Run shadow capture ingestion from CSV or mock sources with sourceUrl, sourceId, dedupe, ranking and evidence pack before any live portal integration.",
      dependsOn: ["capture", "guardian"],
    },
    {
      capabilityId: "viability.market_analysis",
      category: "external_integration",
      ownerAgent: "imob.viability_analyst",
      visibleAgentId: IMOB_VISIBLE_AGENT_ID,
      status: "ready_for_shadow",
      executionMode: "shadow",
      riskTier: "HIGH",
      rolloutStage: "shadow",
      requiresConsent: false,
      requiresHumanApproval: false,
      requiresEvidence: true,
      policyRequired: false,
      initialImplementation:
        "Compute consultive viabilityScore, liquiditySignal and priceConfidence from internal case, lead and property context only, without external market integrations.",
      dependsOn: ["caseBrief", "fin-nexus", "inventory"],
    },
    {
      capabilityId: "outbound.owner_contact",
      category: "external_integration",
      ownerAgent: "imob.outreach_agent",
      visibleAgentId: IMOB_VISIBLE_AGENT_ID,
      status: "proposed",
      executionMode: "assisted",
      riskTier: "CRITICAL",
      rolloutStage: "backlog",
      requiresConsent: true,
      requiresHumanApproval: true,
      requiresEvidence: true,
      policyRequired: true,
      initialImplementation:
        "Prepare outbound message, validate consent and policy, require human approval, then enqueue tracked send.",
      dependsOn: ["preparedFollowUp", "policy", "tracking"],
    },
    {
      capabilityId: "lead.enrichment_public",
      category: "external_integration",
      ownerAgent: "imob.enrichment_agent",
      visibleAgentId: IMOB_VISIBLE_AGENT_ID,
      status: "ready_for_shadow",
      executionMode: "shadow",
      riskTier: "CRITICAL",
      rolloutStage: "shadow",
      requiresConsent: true,
      requiresHumanApproval: true,
      requiresEvidence: true,
      policyRequired: true,
      initialImplementation:
        "Keep enrichment in governed shadow with provenance, timestamp, masking, consent basis and reconciliation fields before any live public-source automation.",
      dependsOn: ["crm", "policy", "guardian"],
    },
    {
      capabilityId: "schedule.real_calendar",
      category: "external_integration",
      ownerAgent: "imob.scheduling_agent",
      visibleAgentId: IMOB_VISIBLE_AGENT_ID,
      status: "ready_for_shadow",
      executionMode: "shadow",
      riskTier: "HIGH",
      rolloutStage: "shadow",
      requiresConsent: false,
      requiresHumanApproval: true,
      requiresEvidence: true,
      policyRequired: true,
      initialImplementation:
        "Run governed shadow calendar scheduling with sandbox availability, hold, confirmation and reschedule evidence before any live provider execution.",
      dependsOn: ["visit.schedule", "calendar_provider", "idempotency"],
    },
    {
      capabilityId: "listing.ads_api_publish",
      category: "external_integration",
      ownerAgent: "imob.listing_publisher_agent",
      visibleAgentId: IMOB_VISIBLE_AGENT_ID,
      status: "ready_for_shadow",
      executionMode: "shadow",
      riskTier: "HIGH",
      rolloutStage: "shadow",
      requiresConsent: false,
      requiresHumanApproval: true,
      requiresEvidence: true,
      policyRequired: true,
      initialImplementation:
        "Generate publication package, validate required fields, require approval and publish only to sandbox/mock channels with tracked evidence.",
      dependsOn: ["listing.activate", "publication_channels", "status_sync"],
    },
  ] as const satisfies readonly ImobCapabilityRegistryEntry[],

  workerOrchestration: [
    {
      capabilityId: "lead.scoring",
      category: "worker_orchestration",
      ownerAgent: "imob.lead_scoring_agent",
      visibleAgentId: IMOB_VISIBLE_AGENT_ID,
      status: "ready_for_shadow",
      executionMode: "shadow",
      riskTier: "HIGH",
      rolloutStage: "shadow",
      requiresConsent: false,
      requiresHumanApproval: false,
      requiresEvidence: true,
      policyRequired: true,
      initialImplementation:
        "Use explainable scoring factors such as budgetFit, urgency, engagement, propertyMatch and documentReadiness.",
      dependsOn: ["lead.qualify.discovery", "crm", "guardian"],
    },
    {
      capabilityId: "reengagement.continuous",
      category: "worker_orchestration",
      ownerAgent: "imob.reengagement_agent",
      visibleAgentId: IMOB_VISIBLE_AGENT_ID,
      status: "ready_for_shadow",
      executionMode: "shadow",
      riskTier: "MEDIUM",
      rolloutStage: "shadow",
      requiresConsent: true,
      requiresHumanApproval: true,
      requiresEvidence: true,
      policyRequired: true,
      initialImplementation:
        "Generate reengagement suggestions from triggers like no-response, cancellation, stalled proposal or new matching unit.",
      dependsOn: ["preparedFollowUp", "events", "tracking"],
    },
    {
      capabilityId: "inventory.active_watch",
      category: "worker_orchestration",
      ownerAgent: "imob.inventory_watch_agent",
      visibleAgentId: IMOB_VISIBLE_AGENT_ID,
      status: "ready_for_shadow",
      executionMode: "shadow",
      riskTier: "MEDIUM",
      rolloutStage: "shadow",
      requiresConsent: false,
      requiresHumanApproval: false,
      requiresEvidence: true,
      policyRequired: false,
      initialImplementation:
        "Generate a consultive shadow snapshot of current inventory fit using internal case and commercial signals only, without background monitoring or automated outreach.",
      dependsOn: ["inventory_search", "listing", "matching"],
    },
    {
      capabilityId: "relationship.commercial_memory",
      category: "worker_orchestration",
      ownerAgent: "imob.relationship_memory_agent",
      visibleAgentId: IMOB_VISIBLE_AGENT_ID,
      status: "ready_for_shadow",
      executionMode: "shadow",
      riskTier: "MEDIUM",
      rolloutStage: "shadow",
      requiresConsent: false,
      requiresHumanApproval: false,
      requiresEvidence: true,
      policyRequired: true,
      initialImplementation:
        "Promote conversation memory into active commercial memory with preferences, objections, urgency and next trigger.",
      dependsOn: ["chat_persistence", "runs", "receipts", "crm"],
    },
    {
      capabilityId: "multiagent.mission_orchestration",
      category: "worker_orchestration",
      ownerAgent: "imob.mission_orchestrator",
      visibleAgentId: IMOB_VISIBLE_AGENT_ID,
      status: "ready_for_shadow",
      executionMode: "shadow",
      riskTier: "HIGH",
      rolloutStage: "shadow",
      requiresConsent: false,
      requiresHumanApproval: false,
      requiresEvidence: true,
      policyRequired: true,
      initialImplementation:
        "Generate a consultive shadow mission snapshot with owner capability, supporting specialists and safe next move while preserving IMOB ownership, without queues or real subagents.",
      dependsOn: ["imobSpecialistBridge", "agentOrchestrator", "guardian"],
    },
    {
      capabilityId: "scale.concurrent_leads_1000",
      category: "worker_orchestration",
      ownerAgent: "imob.mission_queue_agent",
      visibleAgentId: IMOB_VISIBLE_AGENT_ID,
      status: "ready_for_shadow",
      executionMode: "shadow",
      riskTier: "CRITICAL",
      rolloutStage: "shadow",
      requiresConsent: false,
      requiresHumanApproval: false,
      requiresEvidence: true,
      policyRequired: true,
      initialImplementation:
        "Run shadow throughput control with prioritized queue, per-channel rate limiting, retry, DLQ and operational KPIs before any live high-volume automation.",
      dependsOn: ["queue", "rate_limit", "tracking", "observability"],
    },
  ] as const satisfies readonly ImobCapabilityRegistryEntry[],
} as const;

export function listAllImobCapabilities(): readonly ImobCapabilityRegistryEntry[] {
  return [
    ...imobCapabilityRegistry.runtimeExtensions,
    ...imobCapabilityRegistry.externalIntegrations,
    ...imobCapabilityRegistry.workerOrchestration,
  ];
}
