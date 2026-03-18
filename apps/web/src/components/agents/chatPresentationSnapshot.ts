import type { Agent } from "@/lib/api";

export const PRESENTATION_SNAPSHOT_VERSION = "v1" as const;

export type MessagePresentationSnapshot = {
  snapshotVersion: typeof PRESENTATION_SNAPSHOT_VERSION;
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
  attachmentPrimaryActionLabel?: string;
  attachmentSecondaryActionLabel?: string;
  attachmentHelpText?: string;
};
