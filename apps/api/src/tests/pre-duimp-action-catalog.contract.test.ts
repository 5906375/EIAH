import test from "node:test";
import assert from "node:assert/strict";

import {
  authorizePreDuimpAction,
  isKnownPreDuimpAction,
  resolvePreDuimpServerAuthoritySnapshot,
  PreDuimpActionRejectedError,
  type PreDuimpAuthorizationRequest,
  type PreDuimpServerAuthoritySource,
  type PreDuimpServerAuthoritySnapshot,
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

const VALID_INSTALLATION = {
  tenantId: "tenant-A",
  workspaceId: "workspace-A",
  product: "LOGISTICA",
  status: "active",
};

const VALID_HITL_APPROVAL = {
  approvalId: "approval-1",
  tenantId: "tenant-A",
  workspaceId: "workspace-A",
  action: "log.duimp_context.review",
  status: "approved" as const,
  approvedBy: "human-1",
  approvedAt: "2026-08-26T00:00:00Z",
};

function baseRequest(
  overrides: Partial<PreDuimpAuthorizationRequest> = {},
): PreDuimpAuthorizationRequest {
  return {
    action: "log.duimp_context.create",
    context: VALID_CONTEXT,
    ...overrides,
  };
}

function baseServerAuthority(
  overrides: Partial<PreDuimpServerAuthoritySource> = {},
): PreDuimpServerAuthoritySnapshot {
  return resolvePreDuimpServerAuthoritySnapshot({
    requester: REQUESTER_MATCH,
    grantedScopes: ["log.duimp_context.create"],
    installation: VALID_INSTALLATION,
    ...overrides,
  });
}

test("pre-duimp action catalog authorizes a known action with valid context, isolation, scope and entitlement", () => {
  const authorization = authorizePreDuimpAction(baseRequest(), baseServerAuthority());

  assert.equal(authorization.action, "log.duimp_context.create");
  assert.equal(authorization.context.mode, "shadow");
  assert.equal(isKnownPreDuimpAction("log.duimp_context.create"), true);
});

test("pre-duimp action catalog rejects an unknown action with PRE_DUIMP_ACTION_UNKNOWN", () => {
  assert.throws(
    () =>
      authorizePreDuimpAction(
        baseRequest({ action: "log.duimp_context.transmit" }),
        baseServerAuthority({ grantedScopes: [] }),
      ),
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
      authorizePreDuimpAction(
        baseRequest({ context: { ...VALID_CONTEXT, mode: "live" } }),
        baseServerAuthority(),
      ),
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
      authorizePreDuimpAction(
        baseRequest({ context: { ...VALID_CONTEXT, externalTransmissionAllowed: true } }),
        baseServerAuthority(),
      ),
    (error: unknown) => {
      assert.ok(error instanceof PreDuimpActionRejectedError);
      assert.equal(error.reasonCode, "PRE_DUIMP_EXTERNAL_TRANSMISSION_BLOCKED");
      assert.equal(error.subreason, "external_transmission_requested");
      return true;
    },
  );
});

test("pre-duimp action catalog rejects a tenant-mismatched server authority with PRE_DUIMP_ISOLATION_VIOLATION", () => {
  assert.throws(
    () =>
      authorizePreDuimpAction(
        baseRequest(),
        baseServerAuthority({ requester: { tenantId: "tenant-B", workspaceId: "workspace-A" } }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof PreDuimpActionRejectedError);
      assert.equal(error.reasonCode, "PRE_DUIMP_ISOLATION_VIOLATION");
      assert.equal(error.context.reason, "tenant_mismatch");
      return true;
    },
  );
});

test("pre-duimp action catalog rejects a workspace-mismatched server authority with PRE_DUIMP_ISOLATION_VIOLATION", () => {
  assert.throws(
    () =>
      authorizePreDuimpAction(
        baseRequest(),
        baseServerAuthority({ requester: { tenantId: "tenant-A", workspaceId: "workspace-B" } }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof PreDuimpActionRejectedError);
      assert.equal(error.reasonCode, "PRE_DUIMP_ISOLATION_VIOLATION");
      assert.equal(error.context.reason, "workspace_mismatch");
      return true;
    },
  );
});

test("pre-duimp action catalog rejects a server authority missing the action's scope with PRE_DUIMP_SCOPE_DENIED", () => {
  assert.throws(
    () => authorizePreDuimpAction(baseRequest(), baseServerAuthority({ grantedScopes: [] })),
    (error: unknown) => {
      assert.ok(error instanceof PreDuimpActionRejectedError);
      assert.equal(error.reasonCode, "PRE_DUIMP_SCOPE_DENIED");
      return true;
    },
  );
});

test("pre-duimp action catalog rejects a missing installation with PRE_DUIMP_ENTITLEMENT_DENIED/installation_missing", () => {
  assert.throws(
    () => authorizePreDuimpAction(baseRequest(), baseServerAuthority({ installation: null })),
    (error: unknown) => {
      assert.ok(error instanceof PreDuimpActionRejectedError);
      assert.equal(error.reasonCode, "PRE_DUIMP_ENTITLEMENT_DENIED");
      assert.equal(error.subreason, "installation_missing");
      return true;
    },
  );
});

test("pre-duimp action catalog rejects a cross-tenant installation with PRE_DUIMP_ENTITLEMENT_DENIED/installation_scope_mismatch", () => {
  assert.throws(
    () =>
      authorizePreDuimpAction(
        baseRequest(),
        baseServerAuthority({ installation: { ...VALID_INSTALLATION, tenantId: "tenant-B" } }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof PreDuimpActionRejectedError);
      assert.equal(error.reasonCode, "PRE_DUIMP_ENTITLEMENT_DENIED");
      assert.equal(error.subreason, "installation_scope_mismatch");
      return true;
    },
  );
});

test("pre-duimp action catalog rejects a non-LOGISTICA installation with PRE_DUIMP_ENTITLEMENT_DENIED/installation_product_mismatch", () => {
  assert.throws(
    () =>
      authorizePreDuimpAction(
        baseRequest(),
        baseServerAuthority({ installation: { ...VALID_INSTALLATION, product: "IMOB" } }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof PreDuimpActionRejectedError);
      assert.equal(error.reasonCode, "PRE_DUIMP_ENTITLEMENT_DENIED");
      assert.equal(error.subreason, "installation_product_mismatch");
      return true;
    },
  );
});

test("pre-duimp action catalog rejects a suspended installation with PRE_DUIMP_ENTITLEMENT_DENIED/status_denied", () => {
  assert.throws(
    () =>
      authorizePreDuimpAction(
        baseRequest(),
        baseServerAuthority({ installation: { ...VALID_INSTALLATION, status: "suspended" } }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof PreDuimpActionRejectedError);
      assert.equal(error.reasonCode, "PRE_DUIMP_ENTITLEMENT_DENIED");
      assert.equal(error.subreason, "status_denied");
      return true;
    },
  );
});

test("pre-duimp action catalog rejects log.duimp_context.review without a satisfied HITL approval", () => {
  assert.throws(
    () =>
      authorizePreDuimpAction(
        baseRequest({ action: "log.duimp_context.review" }),
        baseServerAuthority({ grantedScopes: ["log.duimp_context.review"] }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof PreDuimpActionRejectedError);
      assert.equal(error.reasonCode, "PRE_DUIMP_HITL_REQUIRED");
      return true;
    },
  );
});

test("pre-duimp action catalog authorizes log.duimp_context.review with a satisfied HITL approval", () => {
  const authorization = authorizePreDuimpAction(
    baseRequest({ action: "log.duimp_context.review" }),
    baseServerAuthority({
      grantedScopes: ["log.duimp_context.review"],
      hitlApproval: VALID_HITL_APPROVAL,
    }),
  );

  assert.equal(authorization.action, "log.duimp_context.review");
});

test("pre-duimp action catalog does not require HITL approval for log.duimp_context.create", () => {
  const authorization = authorizePreDuimpAction(
    baseRequest(),
    baseServerAuthority({ hitlApproval: null }),
  );

  assert.equal(authorization.action, "log.duimp_context.create");
});

test("pre-duimp action catalog ignores identity/scope/installation/HITL/authority fields smuggled onto the client request and authorizes strictly from the separate server authority parameter", () => {
  const maliciousRequest = {
    action: "log.duimp_context.create",
    context: VALID_CONTEXT,
    // Nenhum destes campos deve ser lido por authorizePreDuimpAction —
    // eles so existem no tipo de PreDuimpServerAuthoritySnapshot, jamais
    // em PreDuimpAuthorizationRequest. Simula um adapter ingenuo que
    // espalhou req.body inteiro no primeiro argumento.
    requester: REQUESTER_MATCH,
    grantedScopes: ["log.duimp_context.create"],
    installation: VALID_INSTALLATION,
    hitlApproval: VALID_HITL_APPROVAL,
    authority: { action: "log.duimp_context.create", context: VALID_CONTEXT },
  } as unknown as PreDuimpAuthorizationRequest;

  // Autoridade server-side real e deliberadamente negadora (sem o
  // escopo da action). Se qualquer campo do payload acima fosse lido,
  // esta chamada autorizaria incorretamente.
  const denyingServerAuthority = baseServerAuthority({ grantedScopes: [] });

  assert.throws(
    () => authorizePreDuimpAction(maliciousRequest, denyingServerAuthority),
    (error: unknown) => {
      assert.ok(error instanceof PreDuimpActionRejectedError);
      assert.equal(error.reasonCode, "PRE_DUIMP_SCOPE_DENIED");
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
    "PRE_DUIMP_SCOPE_DENIED",
    "PRE_DUIMP_ENTITLEMENT_DENIED",
    "PRE_DUIMP_HITL_REQUIRED",
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
