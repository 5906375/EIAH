import test from "node:test";
import assert from "node:assert/strict";

import { ApiError } from "@/lib/api";
import {
  buildPreDuimpCreateRequest,
  getPreDuimpDirectAccessRedirect,
  isAuthorizedShadowResponse,
  isPreDuimpFrontendEnabled,
  PRE_DUIMP_REASON_MESSAGES,
  presentPreDuimpError,
  type PreDuimpReasonCode,
} from "./preDuimp";

test("PRE_DUIMP frontend flag is default-off and only literal true enables it", () => {
  assert.equal(isPreDuimpFrontendEnabled({}), false);
  assert.equal(isPreDuimpFrontendEnabled({ VITE_PRE_DUIMP_FRONTEND_ENABLED: "false" }), false);
  assert.equal(isPreDuimpFrontendEnabled({ VITE_PRE_DUIMP_FRONTEND_ENABLED: "TRUE" }), false);
  assert.equal(isPreDuimpFrontendEnabled({ VITE_PRE_DUIMP_FRONTEND_ENABLED: "1" }), false);
  assert.equal(isPreDuimpFrontendEnabled({ VITE_PRE_DUIMP_FRONTEND_ENABLED: "true" }), true);
});

test("direct access redirects to runs only while the frontend flag is off", () => {
  assert.equal(getPreDuimpDirectAccessRedirect(false), "/app/runs");
  assert.equal(getPreDuimpDirectAccessRedirect(true), null);
});

test("create request has the exact action and canonical context fields", () => {
  const request = buildPreDuimpCreateRequest({
    tenantId: " tenant-session ",
    workspaceId: " workspace-session ",
    recordId: " context-001 ",
  });

  assert.deepEqual(request, {
    action: "log.duimp_context.create",
    context: {
      tenantId: "tenant-session",
      workspaceId: "workspace-session",
      verticalId: "log",
      recordType: "log.comex_duimp_context",
      recordId: "context-001",
      mode: "shadow",
      externalTransmissionAllowed: false,
    },
  });
  assert.deepEqual(Object.keys(request), ["action", "context"]);
  assert.deepEqual(Object.keys(request.context), [
    "tenantId",
    "workspaceId",
    "verticalId",
    "recordType",
    "recordId",
    "mode",
    "externalTransmissionAllowed",
  ]);
});

test("create request rejects a missing session coordinate or recordId", () => {
  assert.throws(() =>
    buildPreDuimpCreateRequest({ tenantId: "", workspaceId: "workspace", recordId: "record" }),
  );
  assert.throws(() =>
    buildPreDuimpCreateRequest({ tenantId: "tenant", workspaceId: "", recordId: "record" }),
  );
  assert.throws(() =>
    buildPreDuimpCreateRequest({ tenantId: "tenant", workspaceId: "workspace", recordId: "  " }),
  );
});

test("client request cannot contain authority fields", () => {
  const serialized = JSON.stringify(
    buildPreDuimpCreateRequest({ tenantId: "tenant", workspaceId: "workspace", recordId: "record" }),
  );
  assert.doesNotMatch(
    serialized,
    /grantedScopes|scopes|installation|entitlement|hitlApproval|approval|policyDecision|authority|billingPastDue|gracePeriodActive|userId|token/,
  );
});

test("authorized_shadow is accepted only with all three shadow invariants", () => {
  const valid = {
    ok: true,
    decision: "authorized_shadow",
    action: "log.duimp_context.create",
    mode: "shadow",
    externalTransmissionAllowed: false,
  };
  assert.equal(isAuthorizedShadowResponse(valid), true);
  assert.equal(isAuthorizedShadowResponse({ ...valid, decision: "allowed" }), false);
  assert.equal(isAuthorizedShadowResponse({ ...valid, mode: "live" }), false);
  assert.equal(isAuthorizedShadowResponse({ ...valid, externalTransmissionAllowed: true }), false);
  assert.equal(isAuthorizedShadowResponse(null), false);
});

const canonicalCases: Array<[number, PreDuimpReasonCode]> = [
  [401, "UNAUTHORIZED"],
  [403, "PRE_DUIMP_SCOPE_DENIED"],
  [403, "PRE_DUIMP_ENTITLEMENT_DENIED"],
  [403, "PRE_DUIMP_ISOLATION_VIOLATION"],
  [400, "PRE_DUIMP_ACTION_UNKNOWN"],
  [403, "PRE_DUIMP_HITL_REQUIRED"],
  [403, "PRE_DUIMP_EXTERNAL_TRANSMISSION_BLOCKED"],
  [400, "VALIDATION_ERROR"],
];

for (const [status, reasonCode] of canonicalCases) {
  test(`error presentation sanitizes ${reasonCode}`, () => {
    const error = new ApiError(status, "unsafe backend detail", {
      error: { code: reasonCode, reasonCode },
    });
    assert.deepEqual(presentPreDuimpError(error), {
      reasonCode,
      message: PRE_DUIMP_REASON_MESSAGES[reasonCode],
    });
  });
}

test("401 is normalized to UNAUTHORIZED even without a reason code", () => {
  assert.equal(presentPreDuimpError(new ApiError(401, "Unauthorized")).reasonCode, "UNAUTHORIZED");
});

test("unknown errors do not expose backend details or invent a reason code", () => {
  const presentation = presentPreDuimpError(
    new ApiError(500, "database host and internal stack", { reasonCode: "INTERNAL_ERROR" }),
  );
  assert.equal(presentation.reasonCode, null);
  assert.doesNotMatch(presentation.message, /database|stack|INTERNAL_ERROR/);
});
