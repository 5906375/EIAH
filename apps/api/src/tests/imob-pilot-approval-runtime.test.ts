import test from "node:test";
import assert from "node:assert/strict";

import {
  createImobPilotApprovalState,
  getLatestImobPilotApprovalDecision,
  recordImobPilotApprovalDecision,
} from "../services/imob/imobPilotApprovalRuntime";
import { getImobPilotFlow } from "../services/imob/imobPilotFlowRegistry";

test("pilot approval runtime records approved decision with audit evidence", () => {
  const state = createImobPilotApprovalState();

  const result = recordImobPilotApprovalDecision({
    state,
    flowType: "assisted_calendar_flow",
    decision: "approved",
    approvedBy: "manager@acme.test",
    approvedAt: "2026-05-03T10:00:00.000Z",
    approvalReason: "Fluxo está estável para piloto controlado.",
    evidenceRefs: [
      {
        kind: "workflow_signal",
        ref: "promotion.ready",
        label: "Readiness",
        value: "ready",
      },
    ],
  });

  assert.equal(result.flowType, "assisted_calendar_flow");
  assert.equal(result.decision, "approved");
  assert.equal(result.approvedBy, "manager@acme.test");
  assert.equal(result.visibleAgentId, "IMOB");
  assert.equal(result.promotionApplied, false);
  assert.equal(result.evidenceRefs.length, 1);
  assert.equal(state.entries.length, 1);
});

test("pilot approval runtime records rejected decision with audit trail", () => {
  const state = createImobPilotApprovalState();

  const result = recordImobPilotApprovalDecision({
    state,
    flowType: "assisted_listing_flow",
    decision: "rejected",
    approvedBy: "ops@acme.test",
    approvedAt: "2026-05-03T11:00:00.000Z",
    approvalReason: "Ainda falta evidência operacional para subir o flow.",
    evidenceRefs: [
      {
        kind: "workflow_signal",
        ref: "promotion.blocked",
        label: "Bloqueio",
        value: "evidence_below_threshold",
      },
    ],
  });

  assert.equal(result.flowType, "assisted_listing_flow");
  assert.equal(result.decision, "rejected");
  assert.equal(result.approvalReason, "Ainda falta evidência operacional para subir o flow.");
  assert.equal(result.evidenceRefs[0]?.ref, "promotion.blocked");
  assert.equal(result.visibleAgentId, "IMOB");
});

test("pilot approval runtime returns latest decision for flow", () => {
  const state = createImobPilotApprovalState();

  recordImobPilotApprovalDecision({
    state,
    flowType: "assisted_reengagement_flow",
    decision: "rejected",
    approvedBy: "ops-1@acme.test",
    approvedAt: "2026-05-03T09:00:00.000Z",
    approvalReason: "Primeira revisão ainda insegura.",
  });
  recordImobPilotApprovalDecision({
    state,
    flowType: "assisted_reengagement_flow",
    decision: "approved",
    approvedBy: "ops-2@acme.test",
    approvedAt: "2026-05-03T12:00:00.000Z",
    approvalReason: "Métricas estabilizaram para piloto controlado.",
  });

  const latest = getLatestImobPilotApprovalDecision({
    state,
    flowType: "assisted_reengagement_flow",
  });

  assert.equal(latest?.decision, "approved");
  assert.equal(latest?.approvedBy, "ops-2@acme.test");
});

test("pilot approval runtime is idempotent for the same approval event", () => {
  const state = createImobPilotApprovalState();

  const first = recordImobPilotApprovalDecision({
    state,
    flowType: "shadow_capture_enrichment_flow",
    decision: "approved",
    approvedBy: "governance@acme.test",
    approvedAt: "2026-05-03T13:00:00.000Z",
    approvalReason: "Shadow segue governado e apto para continuar observação.",
  });
  const second = recordImobPilotApprovalDecision({
    state,
    flowType: "shadow_capture_enrichment_flow",
    decision: "approved",
    approvedBy: "governance@acme.test",
    approvedAt: "2026-05-03T13:00:00.000Z",
    approvalReason: "Shadow segue governado e apto para continuar observação.",
  });

  assert.equal(first.approvalId, second.approvalId);
  assert.equal(state.entries.length, 1);
});

test("pilot approval runtime does not mutate pilot flow rollout registry", () => {
  const flowBefore = getImobPilotFlow("assisted_calendar_flow");
  const state = createImobPilotApprovalState();

  recordImobPilotApprovalDecision({
    state,
    flowType: "assisted_calendar_flow",
    decision: "approved",
    approvedBy: "director@acme.test",
    approvedAt: "2026-05-03T14:00:00.000Z",
    approvalReason: "Approval auditável registrado sem promoção automática.",
  });

  const flowAfter = getImobPilotFlow("assisted_calendar_flow");

  assert.equal(flowBefore?.rolloutStage, "shadow");
  assert.equal(flowAfter?.rolloutStage, "shadow");
  assert.equal(flowAfter?.visibleAgentId, "IMOB");
});
