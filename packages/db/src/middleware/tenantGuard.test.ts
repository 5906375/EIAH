import assert from "node:assert";
import test from "node:test";
import { tenantGuard } from "./tenantGuard";

test("tenantGuard injects tenant/workspace on reads", async () => {
  const middleware = tenantGuard("t-1", "w-1");
  const params = {
    model: "Run",
    action: "findMany",
    args: { where: { status: "pending" } },
  } as any;

  let forwarded: any;
  await middleware(params, async (nextParams) => {
    forwarded = nextParams;
    return null;
  });

  assert.strictEqual(forwarded.args.where.tenantId, "t-1");
  assert.strictEqual(forwarded.args.where.workspaceId, "w-1");
  assert.strictEqual(forwarded.args.where.status, "pending");
});

test("tenantGuard enforces tenant on create", async () => {
  const middleware = tenantGuard("tenant-x", "ws-y");
  const params = {
    model: "RunEvent",
    action: "create",
    args: { data: { type: "foo" } },
  } as any;

  let forwarded: any;
  await middleware(params, async (nextParams) => {
    forwarded = nextParams;
    return null;
  });

  assert.strictEqual(forwarded.args.data.tenantId, "tenant-x");
  assert.strictEqual(forwarded.args.data.workspaceId, "ws-y");
});

test("tenantGuard rejects mismatched tenant on update/delete", async () => {
  const middleware = tenantGuard("t-allowed", "w-allowed");
  const params = {
    model: "RunEvent",
    action: "update",
    args: { where: { tenantId: "other", workspaceId: "w-allowed" } },
  } as any;

  await assert.rejects(() => middleware(params, async () => null), /Tenant violation/);
});
