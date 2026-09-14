import assert from "node:assert";
import test from "node:test";
import { tenantGuard } from "./tenantGuard";

type GuardOperationParams = {
  model: string;
  operation: string;
  args: Record<string, any>;
};

async function runGuard(
  tenantId: string,
  workspaceId: string,
  params: GuardOperationParams,
) {
  const extension = (tenantGuard(tenantId, workspaceId) as any)({
    $extends(definition: unknown) {
      return definition;
    },
  });
  const operation = extension.query.$allModels.$allOperations;
  let forwardedArgs: Record<string, any> | undefined;

  await operation({
    ...params,
    query: async (args: Record<string, any>) => {
      forwardedArgs = args;
      return null;
    },
  });

  return forwardedArgs;
}

test("tenantGuard injects tenant/workspace on reads", async () => {
  const forwarded = await runGuard("t-1", "w-1", {
    model: "Run",
    operation: "findMany",
    args: { where: { status: "pending" } },
  });

  assert.strictEqual(forwarded?.where.tenantId, "t-1");
  assert.strictEqual(forwarded?.where.workspaceId, "w-1");
  assert.strictEqual(forwarded?.where.status, "pending");
});

test("tenantGuard enforces tenant on create", async () => {
  const forwarded = await runGuard("tenant-x", "ws-y", {
    model: "RunEvent",
    operation: "create",
    args: { data: { type: "foo" } },
  });

  assert.strictEqual(forwarded?.data.tenantId, "tenant-x");
  assert.strictEqual(forwarded?.data.workspaceId, "ws-y");
});

test("tenantGuard rejects mismatched tenant on update/delete", async () => {
  await assert.rejects(
    runGuard("t-allowed", "w-allowed", {
      model: "RunEvent",
      operation: "update",
      args: { where: { tenantId: "other", workspaceId: "w-allowed" } },
    }),
    /Tenant violation/,
  );
});

for (const model of ["GovernedCase", "GovernedCaseRevision"]) {
  for (const operation of [
    "findUnique",
    "findUniqueOrThrow",
    "findFirst",
    "findFirstOrThrow",
    "findMany",
    "count",
    "aggregate",
    "groupBy",
  ]) {
    test(model + " " + operation + " injects tenant and workspace", async () => {
      const forwarded = await runGuard("tenant-pre-duimp", "workspace-pre-duimp", {
        model,
        operation,
        args: { where: { revision: 1 } },
      });

      assert.strictEqual(forwarded?.where.tenantId, "tenant-pre-duimp");
      assert.strictEqual(forwarded?.where.workspaceId, "workspace-pre-duimp");
      assert.strictEqual(forwarded?.where.revision, 1);
    });
  }

  test(model + " create rejects divergent scope", async () => {
    await assert.rejects(
      runGuard("tenant-pre-duimp", "workspace-pre-duimp", {
        model,
        operation: "create",
        args: {
          data: {
            tenantId: "tenant-other",
            workspaceId: "workspace-pre-duimp",
          },
        },
      }),
      /Tenant violation/,
    );
  });

  for (const operation of ["update", "updateMany", "delete", "deleteMany"]) {
    test(model + " " + operation + " requires exact scope", async () => {
      await assert.rejects(
        runGuard("tenant-pre-duimp", "workspace-pre-duimp", {
          model,
          operation,
          args: { where: { id: "case-1" } },
        }),
        /Tenant violation/,
      );
    });
  }
}
