import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluatePreDuimpReplay,
  preDuimpReplayReasonCodeFor,
  resolvePreDuimpReplayServerAuthority,
  type PreDuimpReplayKnownExecution,
  type PreDuimpReplayRequest,
} from "../types/preDuimpReplayContract";
import { REASON_CODE_CATALOG } from "../../../../packages/core/src/reasons/reasonCatalog.js";

const REQUESTER = { tenantId: "tenant-A", workspaceId: "workspace-A" };
const ACTION = "log.duimp_context.create";

const VALID_CONTEXT = {
  tenantId: "tenant-A",
  workspaceId: "workspace-A",
  verticalId: "log",
  recordType: "log.comex_duimp_context",
  recordId: "duimp-context-replay-1",
};

function baseRequest(overrides: Partial<PreDuimpReplayRequest> = {}): PreDuimpReplayRequest {
  return {
    action: ACTION,
    context: VALID_CONTEXT,
    ...overrides,
  };
}

test("evaluatePreDuimpReplay: first_execution when no known execution exists", () => {
  const authority = resolvePreDuimpReplayServerAuthority({
    requester: REQUESTER,
    knownExecution: null,
  });

  const result = evaluatePreDuimpReplay(baseRequest(), authority);

  assert.equal(result.decision, "first_execution");
  assert.ok(result.canonicalIdentity);
  assert.equal(result.canonicalIdentity!.tenantId, "tenant-A");
  assert.equal(result.canonicalIdentity!.workspaceId, "workspace-A");
  assert.equal(result.canonicalIdentity!.action, ACTION);
  assert.equal(result.canonicalIdentity!.resourceType, "log.comex_duimp_context");
  assert.equal(result.canonicalIdentity!.resourceId, "duimp-context-replay-1");
  assert.match(result.canonicalIdentity!.fingerprint, /^[a-f0-9]{64}$/);
});

function knownExecutionFromFirstExecution(
  overrides: Partial<PreDuimpReplayKnownExecution> = {},
): PreDuimpReplayKnownExecution {
  const authority = resolvePreDuimpReplayServerAuthority({
    requester: REQUESTER,
    knownExecution: null,
  });
  const first = evaluatePreDuimpReplay(baseRequest(), authority);
  assert.equal(first.decision, "first_execution");
  const identity = first.canonicalIdentity!;
  return {
    tenantId: identity.tenantId,
    workspaceId: identity.workspaceId,
    action: identity.action,
    resourceType: identity.resourceType,
    resourceId: identity.resourceId,
    fingerprint: identity.fingerprint,
    status: "completed",
    ...overrides,
  };
}

test("evaluatePreDuimpReplay: safe_replay when known execution matches exactly and is completed", () => {
  const known = knownExecutionFromFirstExecution({ status: "completed" });
  const authority = resolvePreDuimpReplayServerAuthority({ requester: REQUESTER, knownExecution: known });

  const result = evaluatePreDuimpReplay(baseRequest(), authority);

  assert.equal(result.decision, "safe_replay");
  assert.equal(result.subreason, undefined);
});

test("evaluatePreDuimpReplay: in_progress when known execution matches exactly but is still in progress", () => {
  const known = knownExecutionFromFirstExecution({ status: "in_progress" });
  const authority = resolvePreDuimpReplayServerAuthority({ requester: REQUESTER, knownExecution: known });

  const result = evaluatePreDuimpReplay(baseRequest(), authority);

  assert.equal(result.decision, "in_progress");
  assert.equal(result.subreason, "in_progress");
});

test("evaluatePreDuimpReplay: conflict/fingerprint_conflict when identity matches but fingerprint differs", () => {
  const known = knownExecutionFromFirstExecution({ fingerprint: "0".repeat(64) });
  const authority = resolvePreDuimpReplayServerAuthority({ requester: REQUESTER, knownExecution: known });

  const result = evaluatePreDuimpReplay(baseRequest(), authority);

  assert.equal(result.decision, "conflict");
  assert.equal(result.subreason, "fingerprint_conflict");
});

test("evaluatePreDuimpReplay: conflict/tenant_mismatch when known execution belongs to another tenant", () => {
  const known = knownExecutionFromFirstExecution({ tenantId: "tenant-B" });
  const authority = resolvePreDuimpReplayServerAuthority({ requester: REQUESTER, knownExecution: known });

  const result = evaluatePreDuimpReplay(baseRequest(), authority);

  assert.equal(result.decision, "conflict");
  assert.equal(result.subreason, "tenant_mismatch");
});

test("evaluatePreDuimpReplay: conflict/workspace_mismatch when known execution belongs to another workspace", () => {
  const known = knownExecutionFromFirstExecution({ workspaceId: "workspace-B" });
  const authority = resolvePreDuimpReplayServerAuthority({ requester: REQUESTER, knownExecution: known });

  const result = evaluatePreDuimpReplay(baseRequest(), authority);

  assert.equal(result.decision, "conflict");
  assert.equal(result.subreason, "workspace_mismatch");
});

test("evaluatePreDuimpReplay: conflict/action_mismatch when known execution belongs to another action", () => {
  const known = knownExecutionFromFirstExecution({ action: "log.duimp_context.review" });
  const authority = resolvePreDuimpReplayServerAuthority({ requester: REQUESTER, knownExecution: known });

  const result = evaluatePreDuimpReplay(baseRequest(), authority);

  assert.equal(result.decision, "conflict");
  assert.equal(result.subreason, "action_mismatch");
});

test("evaluatePreDuimpReplay: conflict/resource_mismatch when known execution belongs to another resource", () => {
  const known = knownExecutionFromFirstExecution({ resourceId: "duimp-context-replay-OTHER" });
  const authority = resolvePreDuimpReplayServerAuthority({ requester: REQUESTER, knownExecution: known });

  const result = evaluatePreDuimpReplay(baseRequest(), authority);

  assert.equal(result.decision, "conflict");
  assert.equal(result.subreason, "resource_mismatch");
});

test("evaluatePreDuimpReplay: a contradictory transported idempotencyKey has no effect — the server-side snapshot always prevails", () => {
  const known = knownExecutionFromFirstExecution({ status: "completed" });
  const authority = resolvePreDuimpReplayServerAuthority({ requester: REQUESTER, knownExecution: known });

  const noKey = evaluatePreDuimpReplay(baseRequest(), authority);
  const keyA = evaluatePreDuimpReplay(baseRequest({ idempotencyKey: "client-claims-key-a" }), authority);
  const keyB = evaluatePreDuimpReplay(baseRequest({ idempotencyKey: "totally-different-forged-key" }), authority);

  assert.deepEqual(noKey, keyA);
  assert.deepEqual(noKey, keyB);
  assert.equal(noKey.decision, "safe_replay");
});

test("evaluatePreDuimpReplay: invalid/invalid_key when idempotencyKey is transported but empty", () => {
  const authority = resolvePreDuimpReplayServerAuthority({ requester: REQUESTER, knownExecution: null });

  const result = evaluatePreDuimpReplay(baseRequest({ idempotencyKey: "" }), authority);

  assert.equal(result.decision, "invalid");
  assert.equal(result.subreason, "invalid_key");
  assert.equal(result.canonicalIdentity, null);
});

test("evaluatePreDuimpReplay: invalid when the action is not in the canonical PRE_DUIMP catalog", () => {
  const authority = resolvePreDuimpReplayServerAuthority({ requester: REQUESTER, knownExecution: null });

  const result = evaluatePreDuimpReplay(baseRequest({ action: "log.duimp_context.transmit" }), authority);

  assert.equal(result.decision, "invalid");
  assert.equal(result.canonicalIdentity, null);
});

test("evaluatePreDuimpReplay: invalid when the context fails domain contract validation", () => {
  const authority = resolvePreDuimpReplayServerAuthority({ requester: REQUESTER, knownExecution: null });

  const result = evaluatePreDuimpReplay(
    baseRequest({ context: { ...VALID_CONTEXT, mode: "live" } }),
    authority,
  );

  assert.equal(result.decision, "invalid");
  assert.equal(result.canonicalIdentity, null);
});

test("evaluatePreDuimpReplay: invalid when the context tenant/workspace do not match the server-side authority", () => {
  const authority = resolvePreDuimpReplayServerAuthority({ requester: REQUESTER, knownExecution: null });

  const result = evaluatePreDuimpReplay(
    baseRequest({ context: { ...VALID_CONTEXT, tenantId: "tenant-attacker" } }),
    authority,
  );

  assert.equal(result.decision, "invalid");
  assert.equal(result.canonicalIdentity, null);
});

test("preDuimpReplayReasonCodeFor maps proceed decisions to null and blocking decisions to PRE_DUIMP_REPLAY_REJECTED", () => {
  assert.equal(preDuimpReplayReasonCodeFor("first_execution"), null);
  assert.equal(preDuimpReplayReasonCodeFor("safe_replay"), null);
  assert.equal(preDuimpReplayReasonCodeFor("in_progress"), "PRE_DUIMP_REPLAY_REJECTED");
  assert.equal(preDuimpReplayReasonCodeFor("conflict"), "PRE_DUIMP_REPLAY_REJECTED");
  assert.equal(preDuimpReplayReasonCodeFor("invalid"), "PRE_DUIMP_REPLAY_REJECTED");
});

test("PRE_DUIMP_REPLAY_REJECTED is registered in the canonical catalog with the expected metadata and no approver", () => {
  const entry = REASON_CODE_CATALOG.find((e) => e.code === "PRE_DUIMP_REPLAY_REJECTED");
  assert.ok(entry, "PRE_DUIMP_REPLAY_REJECTED must be registered");
  assert.equal(entry!.domain, "log");
  assert.equal(entry!.severity, "warning");
  assert.equal(entry!.category, "integrity");
  assert.equal(entry!.status, "proposed");
  assert.equal(entry!.approver, undefined);
});
