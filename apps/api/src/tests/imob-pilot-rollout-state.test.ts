import test from "node:test";
import assert from "node:assert/strict";

import { createImobPilotApprovalState, recordImobPilotApprovalDecision } from "../services/imob/imobPilotApprovalRuntime";
import {
  createImobPilotRolloutState,
  getImobPilotRolloutStateEntry,
  resolveImobPilotRolloutStage,
  syncImobPilotRolloutStateFromLatestApproval,
  upsertImobPilotRolloutState,
} from "../services/imob/imobPilotRolloutState";

test("pilot rollout state falls back to registry when no persisted state exists", () => {
  const state = createImobPilotRolloutState();

  const currentStage = resolveImobPilotRolloutStage({
    state,
    flowType: "assisted_calendar_flow",
  });

  assert.equal(currentStage, "shadow");
});

test("pilot rollout state overrides registry stage when persisted state exists", () => {
  const approvalState = createImobPilotApprovalState();
  const rolloutState = createImobPilotRolloutState();
  const approval = recordImobPilotApprovalDecision({
    state: approvalState,
    flowType: "assisted_calendar_flow",
    decision: "approved",
    approvedBy: "director@acme.test",
    approvedAt: "2026-05-03T15:00:00.000Z",
    approvalReason: "Piloto controlado liberado.",
    evidenceRefs: [
      {
        kind: "workflow_signal",
        ref: "approval.ready",
        label: "Approval",
        value: "approved",
      },
    ],
  });

  upsertImobPilotRolloutState({
    state: rolloutState,
    flowType: "assisted_calendar_flow",
    currentStage: "pilot",
    approvalEntry: approval,
  });

  const currentStage = resolveImobPilotRolloutStage({
    state: rolloutState,
    flowType: "assisted_calendar_flow",
  });

  assert.equal(currentStage, "pilot");
});

test("pilot rollout state preserves approval metadata on persisted entry", () => {
  const approvalState = createImobPilotApprovalState();
  const rolloutState = createImobPilotRolloutState();
  const approval = recordImobPilotApprovalDecision({
    state: approvalState,
    flowType: "assisted_listing_flow",
    decision: "approved",
    approvedBy: "ops-lead@acme.test",
    approvedAt: "2026-05-03T16:00:00.000Z",
    approvalReason: "Listing apto para piloto controlado.",
    evidenceRefs: [
      {
        kind: "workflow_signal",
        ref: "listing.approval",
        label: "Listing approval",
        value: true,
      },
    ],
  });

  const entry = upsertImobPilotRolloutState({
    state: rolloutState,
    flowType: "assisted_listing_flow",
    currentStage: "pilot",
    approvalEntry: approval,
  });

  assert.equal(entry.lastApprovedBy, "ops-lead@acme.test");
  assert.equal(entry.lastApprovedAt, "2026-05-03T16:00:00.000Z");
  assert.equal(entry.lastPromotionDecision, "approved");
  assert.equal(entry.lastEvidenceRefs[0]?.ref, "listing.approval");
});

test("pilot rollout state does not persist non-shadow stage from rejected approval", () => {
  const approvalState = createImobPilotApprovalState();
  const rolloutState = createImobPilotRolloutState();
  const approval = recordImobPilotApprovalDecision({
    state: approvalState,
    flowType: "assisted_reengagement_flow",
    decision: "rejected",
    approvedBy: "governance@acme.test",
    approvedAt: "2026-05-03T17:00:00.000Z",
    approvalReason: "Reengagement ainda não pode subir.",
  });

  assert.throws(() =>
    upsertImobPilotRolloutState({
      state: rolloutState,
      flowType: "assisted_reengagement_flow",
      currentStage: "pilot",
      approvalEntry: approval,
    }));
});

test("pilot rollout state can sync from latest approval explicitly", () => {
  const approvalState = createImobPilotApprovalState();
  const rolloutState = createImobPilotRolloutState();

  recordImobPilotApprovalDecision({
    state: approvalState,
    flowType: "shadow_capture_enrichment_flow",
    decision: "rejected",
    approvedBy: "privacy@acme.test",
    approvedAt: "2026-05-03T18:00:00.000Z",
    approvalReason: "Manter em shadow por governança.",
    evidenceRefs: [
      {
        kind: "workflow_signal",
        ref: "privacy.hold",
        label: "Privacy hold",
        value: true,
      },
    ],
  });

  const entry = syncImobPilotRolloutStateFromLatestApproval({
    state: rolloutState,
    approvalState,
    flowType: "shadow_capture_enrichment_flow",
    currentStageWhenApproved: "pilot",
  });
  const persisted = getImobPilotRolloutStateEntry({
    state: rolloutState,
    flowType: "shadow_capture_enrichment_flow",
  });

  assert.equal(entry?.currentStage, "shadow");
  assert.equal(persisted?.lastPromotionDecision, "rejected");
  assert.equal(persisted?.lastApprovedBy, "privacy@acme.test");
});
