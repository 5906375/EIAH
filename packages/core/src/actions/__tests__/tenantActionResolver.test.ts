import { test } from "node:test";
import assert from "node:assert/strict";

import { VersionedActionRegistry } from "../registry/VersionedActionRegistry";
import { TenantActionResolver } from "../registry/TenantActionResolver";
import type { RegisteredAction } from "../actionRegistry";

type TestContext = Parameters<RegisteredAction["handler"]>[0];

function createAction(name: string, output: unknown): RegisteredAction {
  return {
    name,
    handler: async () => ({
      status: "success",
      output,
    }),
  };
}

test("fallback to default version", async () => {
  const registry = new VersionedActionRegistry();
  registry.registerVersion({
    version: "default",
    actions: { ping: createAction("ping", "ok") },
  });

  const resolver = new TenantActionResolver(registry, new Map());
  const actions = resolver.resolveActions("unknown");
  const result = await actions.ping.handler({ action: "ping" } as TestContext);

  assert.equal(result.output, "ok");
});

test("tenant loads specific version", async () => {
  const registry = new VersionedActionRegistry();
  registry.registerVersion({
    version: "v1",
    actions: { a: createAction("a", 1) },
  });

  const configs = new Map();
  configs.set("t1", { tenantId: "t1", version: "v1" });

  const resolver = new TenantActionResolver(registry, configs);
  const actions = resolver.resolveActions("t1");
  const result = await actions.a.handler({ action: "a" } as TestContext);

  assert.equal(result.output, 1);
});

test("overrides override correctly", async () => {
  const registry = new VersionedActionRegistry();
  registry.registerVersion({
    version: "v1",
    actions: { a: createAction("a", 1) },
  });

  const configs = new Map();
  configs.set("t2", {
    tenantId: "t2",
    version: "v1",
    overrides: { a: createAction("a", 999) },
  });

  const resolver = new TenantActionResolver(registry, configs);
  const actions = resolver.resolveActions("t2");
  const result = await actions.a.handler({ action: "a" } as TestContext);

  assert.equal(result.output, 999);
});
