import test from "node:test";
import assert from "node:assert/strict";
import { requireScope } from "../middlewares/requireScope";
import { TenantPolicyStore, type ScopeDecision } from "../../../../packages/core/src/policy/TenantPolicyStore";

function buildDecision(
  decision: Pick<ScopeDecision, "allowed" | "reasonCode">,
): ScopeDecision {
  return {
    tenantId: "tenant-a",
    workspaceId: "workspace-a",
    scope: "reports.view",
    ...(decision.allowed
      ? { allowed: true, reasonCode: "SCOPE_ALLOWED" as const }
      : { allowed: false, reasonCode: decision.reasonCode }),
  } as ScopeDecision;
}

function withMockedPolicyStore(decision: ScopeDecision) {
  const original = TenantPolicyStore.getInstance;
  Object.defineProperty(TenantPolicyStore, "getInstance", {
    configurable: true,
    value: () => ({
      resolveScopeDecision: async () => decision,
    }),
  });
  return () => {
    Object.defineProperty(TenantPolicyStore, "getInstance", {
      configurable: true,
      value: original,
    });
  };
}

function createMockResponse() {
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return response;
}

function createMockRequest() {
  return {
    authContext: {
      tenantId: "tenant-a",
      workspaceId: "workspace-a",
      userId: "user-a",
      tokenId: "token-a",
    },
    logger: {
      warn: () => undefined,
    },
  };
}

test("requireScope returns 403 POLICY_NOT_FOUND when policy is missing", async () => {
  const restore = withMockedPolicyStore(buildDecision({ allowed: false, reasonCode: "POLICY_NOT_FOUND" }));
  const req = createMockRequest();
  const res = createMockResponse();
  let nextCalled = false;

  try {
    await requireScope("reports.view")(req as any, res as any, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
    assert.equal((res.body as any)?.error?.code, "POLICY_NOT_FOUND");
    assert.equal((res.body as any)?.error?.reasonCode, "POLICY_NOT_FOUND");
  } finally {
    restore();
  }
});

test("requireScope returns 403 POLICY_STORE_UNAVAILABLE when store fails closed", async () => {
  const restore = withMockedPolicyStore(buildDecision({ allowed: false, reasonCode: "POLICY_STORE_UNAVAILABLE" }));
  const req = createMockRequest();
  const res = createMockResponse();
  let nextCalled = false;

  try {
    await requireScope("reports.view")(req as any, res as any, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
    assert.equal((res.body as any)?.error?.code, "POLICY_STORE_UNAVAILABLE");
    assert.equal((res.body as any)?.error?.reasonCode, "POLICY_STORE_UNAVAILABLE");
  } finally {
    restore();
  }
});

test("requireScope returns 403 SCOPE_NOT_ALLOWED when scope is blank or invalid", async () => {
  const restore = withMockedPolicyStore(buildDecision({ allowed: false, reasonCode: "SCOPE_NOT_ALLOWED" }));
  const req = createMockRequest();
  const res = createMockResponse();
  let nextCalled = false;

  try {
    await requireScope("reports.view")(req as any, res as any, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
    assert.notEqual(res.statusCode, 500);
    assert.equal((res.body as any)?.error?.code, "SCOPE_NOT_ALLOWED");
    assert.equal((res.body as any)?.error?.reasonCode, "SCOPE_NOT_ALLOWED");
    assert.equal((res.body as any)?.error?.message, "Scope denied: reports.view");
  } finally {
    restore();
  }
});

test("requireScope returns 403 WORKSPACE_SCOPE_MISMATCH when policy belongs to another workspace", async () => {
  const restore = withMockedPolicyStore(buildDecision({ allowed: false, reasonCode: "WORKSPACE_SCOPE_MISMATCH" }));
  const req = createMockRequest();
  const res = createMockResponse();
  let nextCalled = false;

  try {
    await requireScope("reports.view")(req as any, res as any, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
    assert.notEqual(res.statusCode, 500);
    assert.equal((res.body as any)?.error?.code, "WORKSPACE_SCOPE_MISMATCH");
    assert.equal((res.body as any)?.error?.reasonCode, "WORKSPACE_SCOPE_MISMATCH");
    assert.equal((res.body as any)?.error?.message, "Scope denied: reports.view");
  } finally {
    restore();
  }
});

test("requireScope returns 403 TENANT_POLICY_DISABLED when policy explicitly denies the scope", async () => {
  const restore = withMockedPolicyStore(buildDecision({ allowed: false, reasonCode: "TENANT_POLICY_DISABLED" }));
  const req = createMockRequest();
  const res = createMockResponse();
  let nextCalled = false;

  try {
    await requireScope("reports.view")(req as any, res as any, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
    assert.notEqual(res.statusCode, 500);
    assert.equal((res.body as any)?.error?.code, "TENANT_POLICY_DISABLED");
    assert.equal((res.body as any)?.error?.reasonCode, "TENANT_POLICY_DISABLED");
    assert.equal((res.body as any)?.error?.message, "Scope denied: reports.view");
  } finally {
    restore();
  }
});

test("requireScope allows request when scope decision is allowed", async () => {
  const restore = withMockedPolicyStore(buildDecision({ allowed: true, reasonCode: "SCOPE_ALLOWED" }));
  const req = createMockRequest();
  const res = createMockResponse();
  let nextCalled = false;

  try {
    await requireScope("reports.view")(req as any, res as any, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, 200);
  } finally {
    restore();
  }
});

test("TenantPolicyStore public subpath exposes symbols and stays fail-closed without policy lookup", async () => {
  process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/eiah_test";

  const mod = await import("@eiah/core/policy/TenantPolicyStore");

  assert.equal(typeof mod.TenantPolicyStore, "function");
  assert.equal(typeof mod.closeTenantPolicyStoreResources, "function");

  const decision = await mod.TenantPolicyStore.getInstance().resolveScopeDecision(
    "tenant-a",
    "workspace-a",
    "   ",
  );

  assert.equal(decision.allowed, false);
  assert.equal(decision.reasonCode, "SCOPE_NOT_ALLOWED");
});
