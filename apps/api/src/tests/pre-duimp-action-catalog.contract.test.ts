import test from "node:test";
import assert from "node:assert/strict";

import {
  authorizePreDuimpAction,
  isKnownPreDuimpAction,
  PreDuimpActionRejectedError,
} from "../services/logistica/control/preDuimpActionCatalog";
import { REASON_CODE_CATALOG } from "../../../../packages/core/src/reasons/reasonCatalog.js";

const VALID_CONTEXT = {
  tenantId: "tenant-A",
  workspaceId: "workspace-A",
  verticalId: "log",
  recordType: "log.comex_duimp_context",
  recordId: "duimp-context-1",
};

const REQUESTER_MATCH = { tenantId: "tenant-A", workspaceId: "workspace-A" };

test("pre-duimp action catalog authorizes a known action with a valid shadow context and matching requester", () => {
  const authorization = authorizePreDuimpAction({
    action: "log.duimp_context.create",
    context: VALID_CONTEXT,
    requester: REQUESTER_MATCH,
  });

  assert.equal(authorization.action, "log.duimp_context.create");
  assert.equal(authorization.context.mode, "shadow");
  assert.equal(isKnownPreDuimpAction("log.duimp_context.create"), true);
});

test("pre-duimp action catalog rejects an unknown action with PRE_DUIMP_ACTION_UNKNOWN", () => {
  assert.throws(
    () =>
      authorizePreDuimpAction({
        action: "log.duimp_context.transmit",
        context: VALID_CONTEXT,
        requester: REQUESTER_MATCH,
      }),
    (error: unknown) => {
      assert.ok(error instanceof PreDuimpActionRejectedError);
      assert.equal(error.reasonCode, "PRE_DUIMP_ACTION_UNKNOWN");
      return true;
    },
  );
});

test("pre-duimp action catalog rejects a non-shadow mode request with subreason mode_not_shadow", () => {
  assert.throws(
    () =>
      authorizePreDuimpAction({
        action: "log.duimp_context.create",
        context: { ...VALID_CONTEXT, mode: "live" },
        requester: REQUESTER_MATCH,
      }),
    (error: unknown) => {
      assert.ok(error instanceof PreDuimpActionRejectedError);
      assert.equal(error.reasonCode, "PRE_DUIMP_EXTERNAL_TRANSMISSION_BLOCKED");
      assert.equal(error.subreason, "mode_not_shadow");
      return true;
    },
  );
});

test("pre-duimp action catalog rejects externalTransmissionAllowed=true with subreason external_transmission_requested", () => {
  assert.throws(
    () =>
      authorizePreDuimpAction({
        action: "log.duimp_context.create",
        context: { ...VALID_CONTEXT, externalTransmissionAllowed: true },
        requester: REQUESTER_MATCH,
      }),
    (error: unknown) => {
      assert.ok(error instanceof PreDuimpActionRejectedError);
      assert.equal(error.reasonCode, "PRE_DUIMP_EXTERNAL_TRANSMISSION_BLOCKED");
      assert.equal(error.subreason, "external_transmission_requested");
      return true;
    },
  );
});

test("pre-duimp action catalog rejects a tenant-mismatched requester with PRE_DUIMP_ISOLATION_VIOLATION", () => {
  assert.throws(
    () =>
      authorizePreDuimpAction({
        action: "log.duimp_context.create",
        context: VALID_CONTEXT,
        requester: { tenantId: "tenant-B", workspaceId: "workspace-A" },
      }),
    (error: unknown) => {
      assert.ok(error instanceof PreDuimpActionRejectedError);
      assert.equal(error.reasonCode, "PRE_DUIMP_ISOLATION_VIOLATION");
      assert.equal(error.context.reason, "tenant_mismatch");
      return true;
    },
  );
});

test("pre-duimp action catalog rejects a workspace-mismatched requester with PRE_DUIMP_ISOLATION_VIOLATION", () => {
  assert.throws(
    () =>
      authorizePreDuimpAction({
        action: "log.duimp_context.create",
        context: VALID_CONTEXT,
        requester: { tenantId: "tenant-A", workspaceId: "workspace-B" },
      }),
    (error: unknown) => {
      assert.ok(error instanceof PreDuimpActionRejectedError);
      assert.equal(error.reasonCode, "PRE_DUIMP_ISOLATION_VIOLATION");
      assert.equal(error.context.reason, "workspace_mismatch");
      return true;
    },
  );
});

test("pre-duimp reason codes are registered in the canonical catalog with the expected metadata and no approver", () => {
  const byCode = new Map(REASON_CODE_CATALOG.map((entry) => [entry.code, entry]));

  const unknownAction = byCode.get("PRE_DUIMP_ACTION_UNKNOWN");
  assert.ok(unknownAction, "PRE_DUIMP_ACTION_UNKNOWN must be registered");
  assert.equal(unknownAction!.domain, "log");
  assert.equal(unknownAction!.severity, "warning");
  assert.equal(unknownAction!.category, "validation");
  assert.equal(unknownAction!.status, "proposed");
  assert.equal(unknownAction!.approver, undefined);

  for (const code of [
    "PRE_DUIMP_EXTERNAL_TRANSMISSION_BLOCKED",
    "PRE_DUIMP_ISOLATION_VIOLATION",
  ] as const) {
    const entry = byCode.get(code);
    assert.ok(entry, `${code} must be registered`);
    assert.equal(entry!.domain, "log");
    assert.equal(entry!.severity, "critical");
    assert.equal(entry!.category, "authorization");
    assert.equal(entry!.status, "proposed");
    assert.equal(entry!.approver, undefined);
  }
});
