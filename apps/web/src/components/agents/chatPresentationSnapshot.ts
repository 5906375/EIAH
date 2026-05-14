import type { Agent } from "@/lib/api";
import type { ConversationStage, ProposalDomain } from "@/components/agents/proposalTypes";

export const PRESENTATION_SNAPSHOT_VERSION = "v1" as const;

export type MessagePresentationSnapshot = {
  snapshotVersion: typeof PRESENTATION_SNAPSHOT_VERSION;
  compatibilityMode?: "snapshot" | "legacy_conservative";
  quickReplySource?: "backend_payload" | "agent_contract" | "frontend_copy" | "none";
  verticalContext?: "IMOB" | "LEGAL" | null;
  proposalDomain?: ProposalDomain | null;
  conversationStage?: ConversationStage | null;
  routeIntent:
    | "proposal"
    | "imob"
    | "playbook"
    | "help"
    | "orchestrator"
    | "self_intro"
    | "capabilities_summary"
    | "legal_handoff";
  eiahMode?: "help" | "orchestrator" | "proposal" | null;
  showConfidence: boolean;
  confidencePercent?: number;
  provenanceMode: "none" | "recommended" | "required";
  signals: string[];
  nextDecision?: string;
  quickReplies: string[];
  journeyContext?: {
    frontDoorLabel: string;
    firstStepLabel: string;
  } | null;
  renderVariant: "simple_help" | "self_intro" | "handoff" | "guided_flow" | "proposal";
  responseShape?: Agent["uxContract"] extends { responseShape: infer T } ? T : string;
  maxCognitiveLoad?: Agent["uxContract"] extends { maxCognitiveLoad: infer T } ? T : string;
  inputPlaceholder?: string;
  attachmentEnabled?: boolean;
  attachmentKinds?: string[];
  attachmentIntakeModes?: string[];
  attachmentAnalysisModes?: string[];
  attachmentPrimaryActionLabel?: string;
  attachmentSecondaryActionLabel?: string;
  attachmentHelpText?: string;
  governedRuntime?: {
    domain: "IMOB";
    contractVersion: "imob.crm.governed.v1";
    launcherPolicy: "render_only";
    quickRepliesSource: "backend_payload";
    recommendedActionsSource: "backend_payload";
    agentActivitiesSource: "backend_payload";
  } | null;
  agentSwitchRequest?: {
    targetAgentId: string;
    replayInput?: string;
    switchImmediately?: boolean;
    trigger?: "affirmative";
  } | null;
};

export function isSnapshotV1(value: unknown): value is MessagePresentationSnapshot {
  return Boolean(value) && typeof value === "object" && (value as { snapshotVersion?: string }).snapshotVersion === PRESENTATION_SNAPSHOT_VERSION;
}

export function resolveSnapshotCompatibleRouteIntent(
  snapshot: MessagePresentationSnapshot | null | undefined
): "proposal" | "imob" | "playbook" | "help" | "orchestrator" {
  if (!snapshot) return "help";
  if (
    snapshot.routeIntent === "self_intro" ||
    snapshot.routeIntent === "capabilities_summary" ||
    snapshot.routeIntent === "legal_handoff"
  ) {
    return "help";
  }
  return snapshot.routeIntent;
}

export function resolveSnapshotQuickReplies(
  snapshot: MessagePresentationSnapshot | null | undefined
): string[] {
  if (!isSnapshotV1(snapshot)) return [];
  if (snapshot.compatibilityMode === "legacy_conservative") return [];
  if (snapshot.governedRuntime && !hasGovernedImobSnapshotContract(snapshot)) return [];
  return Array.isArray(snapshot.quickReplies) ? snapshot.quickReplies : [];
}

export function isBackendGovernedImobSnapshot(
  snapshot: MessagePresentationSnapshot | null | undefined
): boolean {
  return Boolean(
    isSnapshotV1(snapshot)
      && snapshot.compatibilityMode === "snapshot"
      && snapshot.routeIntent === "imob"
      && snapshot.governedRuntime?.domain === "IMOB"
      && snapshot.governedRuntime?.contractVersion === "imob.crm.governed.v1"
      && snapshot.governedRuntime?.launcherPolicy === "render_only"
      && snapshot.quickReplySource === "backend_payload",
  );
}

export function hasGovernedImobSnapshotContract(
  snapshot: MessagePresentationSnapshot | null | undefined
): boolean {
  if (!isSnapshotV1(snapshot)) return false;
  if (!snapshot.governedRuntime) return false;
  return Boolean(
    snapshot.compatibilityMode === "snapshot"
      && snapshot.routeIntent === "imob"
      && snapshot.governedRuntime.domain === "IMOB"
      && snapshot.governedRuntime.contractVersion === "imob.crm.governed.v1"
      && snapshot.governedRuntime.launcherPolicy === "render_only"
      && snapshot.governedRuntime.quickRepliesSource === "backend_payload"
      && snapshot.governedRuntime.recommendedActionsSource === "backend_payload"
      && snapshot.governedRuntime.agentActivitiesSource === "backend_payload"
      && snapshot.quickReplySource === "backend_payload"
  );
}

export function resolveSnapshotInputPlaceholder(
  snapshot: MessagePresentationSnapshot | null | undefined
): string | null {
  if (!isSnapshotV1(snapshot)) return null;
  if (typeof snapshot.inputPlaceholder !== "string" || !snapshot.inputPlaceholder.trim()) return null;
  return snapshot.inputPlaceholder;
}
