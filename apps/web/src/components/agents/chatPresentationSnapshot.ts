import type { Agent } from "@/lib/api";

export const PRESENTATION_SNAPSHOT_VERSION = "v1" as const;

export type MessagePresentationSnapshot = {
  snapshotVersion: typeof PRESENTATION_SNAPSHOT_VERSION;
  compatibilityMode?: "snapshot" | "legacy_conservative";
  verticalContext?: "IMOB" | "LEGAL" | null;
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
  return Array.isArray(snapshot.quickReplies) ? snapshot.quickReplies : [];
}

export function resolveSnapshotInputPlaceholder(
  snapshot: MessagePresentationSnapshot | null | undefined
): string | null {
  if (!isSnapshotV1(snapshot)) return null;
  if (typeof snapshot.inputPlaceholder !== "string" || !snapshot.inputPlaceholder.trim()) return null;
  return snapshot.inputPlaceholder;
}
