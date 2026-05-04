import test from "node:test";
import assert from "node:assert/strict";

import { buildImobMissionId, completeImobMissionState, openImobMissionState } from "../services/imob/imobMissionState";
import { resolveImobMissionRuntime } from "../services/imob/imobMissionRuntime";

test("mission state builds deterministic id from case and capability", () => {
  const missionId = buildImobMissionId({
    caseId: "case-1",
    capabilityId: "inventory.active_watch",
    ownerAgent: "IMOB",
  });

  assert.equal(missionId, "mission-imob-case-1-inventory-active-watch");
});

test("mission runtime opens and closes mission in the same request with evidence", () => {
  const resolved = resolveImobMissionRuntime({
    caseContext: {
      caseId: "case-1",
      flow: "lead.qualify",
    } as any,
    ownerCapability: "inventory.active_watch",
    missionStatus: "ready",
    supportingAgents: ["I_BC"],
    missionReasonCodes: ["watch_status_matching"],
    summary: "Missão pronta.",
    pendingHandoffs: ["I_BC: retomar lead com imóveis aderentes"],
    blockingIssues: [],
    recommendedNextMove: "retomar lead com imóveis aderentes",
    decisionRationale: {
      sourceRefs: [{ kind: "case_field", ref: "case.flow", label: "Fluxo", value: "lead.qualify" }],
    },
    generatedAt: "2026-05-03T10:00:00.000Z",
  });

  assert.equal(resolved.mission.status, "ready");
  assert.equal(resolved.mission.ownerAgent, "IMOB");
  assert.equal(resolved.mission.closedAt, "2026-05-03T10:00:00.000Z");
  assert.equal(resolved.snapshot.missionId, resolved.mission.missionId);
  assert.equal(resolved.snapshot.createdAt, "2026-05-03T10:00:00.000Z");
  assert.equal(resolved.snapshot.closedAt, "2026-05-03T10:00:00.000Z");
  assert.ok(resolved.snapshot.evidenceRefs.length >= 3);
});

test("mission state can be opened and completed with final status", () => {
  const opened = openImobMissionState({
    caseId: "case-2",
    capabilityId: "closing.documents_real",
    supportingAgents: ["J_360"],
    createdAt: "2026-05-03T11:00:00.000Z",
  });
  const closed = completeImobMissionState({
    mission: opened,
    status: "blocked",
    evidenceRefs: [{ kind: "workflow_signal", ref: "case.blocker", label: "Bloqueio", value: "documentação pendente" }],
    closedAt: "2026-05-03T11:00:01.000Z",
  });

  assert.equal(opened.status, "watch");
  assert.equal(closed.status, "blocked");
  assert.equal(closed.closedAt, "2026-05-03T11:00:01.000Z");
  assert.equal(closed.supportingAgents[0], "J_360");
});
