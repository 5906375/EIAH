import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildPolicyNotFoundResponseBody,
  PolicyNotFoundError,
  resolveAllowedActionNames,
} from "../routes/agentsPolicy";

test("resolveAllowedActionNames fails closed when tenant/workspace has no explicit policy", () => {
  assert.throws(
    () =>
      resolveAllowedActionNames({
        tenantId: "tenant-A",
        workspaceId: "workspace-A",
        dbPolicies: [],
        catalogActions: ["realestate.apply_adjustment"],
      }),
    (error: unknown) =>
      error instanceof PolicyNotFoundError
      && error.code === "POLICY_NOT_FOUND"
      && error.reasonCode === "POLICY_NOT_FOUND"
  );
});

test("policy not found response body returns 403-compatible payload", () => {
  assert.deepEqual(buildPolicyNotFoundResponseBody(), {
    ok: false,
    error: {
      code: "POLICY_NOT_FOUND",
      reasonCode: "POLICY_NOT_FOUND",
      message: "Ação bloqueada: policy explícita ausente para tenant/workspace.",
    },
  });
});
