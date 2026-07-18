import type { ChatVerticalHandoffSurfaceSnapshot } from "../../components/chat/ChatVerticalHandoffSurface";

export const IMOB_PILOT_2_FIXTURE_SLUG = "imob-pilot-2-shadow-dry-run";
export const IMOB_FRONTDOOR_FIXTURE_PREVIEW_ROUTE =
  `/app/chat?agent=eiah&domain=imob&fixture=${IMOB_PILOT_2_FIXTURE_SLUG}#chat-agent-launcher`;

export type ImobPilot2FixturePreview = {
  sourceFixturePath: string;
  fixtureId: string;
  status: string;
  dataPolicy: {
    syntheticOnly: boolean;
    sanitized: boolean;
  };
  handoffSnapshot: ChatVerticalHandoffSurfaceSnapshot;
  hitlGateState: {
    approvalState: string;
    hitlRequired: boolean;
    riskLevel: string;
    reasonCode: string;
    message: string;
    allowedUserActions: string[];
    accessibilityLabel: string;
  };
  proofReceiptBundleState: {
    proofStatus: string;
    reasonCode: string;
    accessibilityLabel: string;
  };
  reasonCodes: string[];
  boundaries: string[];
};

export function shouldRenderImobPilot2FixturePreview(search: string | URLSearchParams) {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  return (
    params.get("agent")?.trim().toLowerCase() === "eiah" &&
    params.get("domain")?.trim().toLowerCase() === "imob" &&
    params.get("fixture")?.trim() === IMOB_PILOT_2_FIXTURE_SLUG
  );
}

export const imobPilot2FixturePreview: ImobPilot2FixturePreview = {
  sourceFixturePath: "apps/api/src/tests/fixtures/imob-pilot-2/imob-pilot-2-shadow-dry-run.fixture.json",
  fixtureId: "imob-pilot-2-shadow-dry-run-fixture-v1",
  status: "fixture_only_not_executed",
  dataPolicy: {
    syntheticOnly: true,
    sanitized: true,
  },
  handoffSnapshot: {
    version: "chat.vertical_handoff.v1",
    verticalId: "imob",
    handoffMessage:
      "Synthetic IMOB shadow dry-run fixture. Review controlled case context in read-only mode; do not execute operational actions.",
    reasonCode: "CHAT_VERTICAL_HANDOFF_TO_COCKPIT",
    riskLevel: "high",
    hitlRequired: true,
    renderHints: {
      verticalBadgeLabel: "IMOB shadow dry-run",
      suggestedSurface: "cockpit",
    },
  },
  hitlGateState: {
    approvalState: "blocked",
    hitlRequired: true,
    riskLevel: "high",
    reasonCode: "APPROVAL_REQUIRED",
    message: "Synthetic read-only gate. Human review is required before any future operational action.",
    allowedUserActions: ["view_details", "request_review"],
    accessibilityLabel: "IMOB shadow dry-run read-only HITL gate",
  },
  proofReceiptBundleState: {
    proofStatus: "not_required",
    reasonCode: "PROOF_UNAVAILABLE_READ_ONLY",
    accessibilityLabel:
      "Proof state unavailable in read-only fixture; no receipt, bundle or ledger reference is generated.",
  },
  reasonCodes: [
    "IMOB_PILOT_2_FIXTURE_PACK_ONLY",
    "CHAT_VERTICAL_HANDOFF_TO_COCKPIT",
    "APPROVAL_REQUIRED",
    "PROOF_UNAVAILABLE_READ_ONLY",
    "NO_PROVIDER_EXTERNAL_CALL",
    "NO_MUTATION_EXTERNAL_SIDE_EFFECT",
    "NO_DB_LEDGER_AUDIT_WRITE",
    "NO_RECEIPT_BUNDLE_PROOF_GENERATION",
    "NO_PII_LEAKAGE",
    "NO_SHADOW_DRY_RUN_EXECUTION",
    "NO_PILOT_SMALL_ROLLOUT_EXECUTION",
  ],
  boundaries: [
    "Sem provider",
    "Sem DB, ledger ou audit",
    "Sem receipt, bundle ou proof real",
    "Sem CTA mutacional",
    "Sem aprovação real",
    "Sem policy decision no frontend",
    "Sem regra no ChatAgentLauncher",
    "Sem dry-run real, shadow real, pilot ou small rollout",
  ],
};
