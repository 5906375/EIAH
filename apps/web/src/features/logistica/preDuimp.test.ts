import test from "node:test";
import assert from "node:assert/strict";

import { ApiError } from "@/lib/api";
import {
  buildPreDuimpCreateRequest,
  getPreDuimpDirectAccessRedirect,
  isAuthorizedShadowResponse,
  isPreDuimpAccessAllowed,
  isPreDuimpFrontendEnabled,
  loadPreDuimpSessionContext,
  parsePreDuimpShadowCapability,
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

const ALLOWED_CAPABILITY = {
  version: "v1",
  allowed: true,
  mode: "shadow",
  externalTransmissionAllowed: false,
  reasonCode: null,
} as const;

test("direct access requires both the global kill switch and a ready allowed capability", () => {
  assert.equal(getPreDuimpDirectAccessRedirect(false, { status: "ready", capability: ALLOWED_CAPABILITY }), "/app/runs");
  assert.equal(getPreDuimpDirectAccessRedirect(true, { status: "idle" }), "/app/runs");
  assert.equal(getPreDuimpDirectAccessRedirect(true, { status: "loading" }), "/app/runs");
  assert.equal(getPreDuimpDirectAccessRedirect(true, { status: "error" }), "/app/runs");
  assert.equal(
    getPreDuimpDirectAccessRedirect(true, { status: "ready", capability: ALLOWED_CAPABILITY }),
    null,
  );
});

test("capability parser rejects incomplete, unknown and non-shadow contracts", () => {
  assert.equal(parsePreDuimpShadowCapability(ALLOWED_CAPABILITY)?.allowed, true);
  assert.equal(parsePreDuimpShadowCapability({ ...ALLOWED_CAPABILITY, version: "v2" }), null);
  assert.equal(parsePreDuimpShadowCapability({ ...ALLOWED_CAPABILITY, mode: "live" }), null);
  assert.equal(parsePreDuimpShadowCapability({ ...ALLOWED_CAPABILITY, reasonCode: undefined }), null);
  assert.equal(
    parsePreDuimpShadowCapability({
      ...ALLOWED_CAPABILITY,
      allowed: false,
      reasonCode: "PRE_DUIMP_UNKNOWN_REASON",
    }),
    null,
  );
});

test("frontend access remains default-deny for every non-ready or malformed state", () => {
  assert.equal(isPreDuimpAccessAllowed(true, { status: "idle" }), false);
  assert.equal(isPreDuimpAccessAllowed(true, { status: "loading" }), false);
  assert.equal(isPreDuimpAccessAllowed(true, { status: "error" }), false);
  assert.equal(
    isPreDuimpAccessAllowed(true, {
      status: "ready",
      capability: {
        version: "v1",
        allowed: false,
        mode: "shadow",
        externalTransmissionAllowed: false,
        reasonCode: "PRE_DUIMP_PILOT_GRANT_MISSING",
      },
    }),
    false,
  );
  assert.equal(isPreDuimpAccessAllowed(false, { status: "ready", capability: ALLOWED_CAPABILITY }), false);
});

test("session capability bootstrap denies 401, 403, network, 5xx and timeout failures", async () => {
  const failures = [
    new ApiError(401, "unauthorized"),
    new ApiError(403, "forbidden"),
    new ApiError(500, "unavailable"),
    new TypeError("network failed"),
  ];
  for (const failure of failures) {
    const result = await loadPreDuimpSessionContext(async () => Promise.reject(failure), 20);
    assert.equal(result.access.status, "error");
    assert.equal(result.access.capability, undefined);
  }

  const timeout = await loadPreDuimpSessionContext(
    (signal) =>
      new Promise((_, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      }),
    5,
  );
  assert.equal(timeout.access.status, "error");
});

test("session capability bootstrap accepts only a complete server-authoritative response", async () => {
  const result = await loadPreDuimpSessionContext(async () => ({
    ok: true,
    data: {
      tenantId: "tenant-a",
      workspaceId: "workspace-a",
      activeDomain: "core",
      availableDomains: ["core"],
      entitlements: {
        REAL_ESTATE_CORE: false,
        EXPORTS_ADDON: true,
        BILLING_INSIGHTS_ADDON: true,
      },
      roles: ["service"],
      branding: {
        brandName: "Synthetic",
        logoUrl: null,
        primaryColor: "#000000",
        workspaceLabel: "Synthetic",
      },
      capabilities: { preDuimpShadow: ALLOWED_CAPABILITY },
    },
  }));

  assert.equal(result.access.status, "ready");
  assert.equal(result.access.capability?.allowed, true);
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
