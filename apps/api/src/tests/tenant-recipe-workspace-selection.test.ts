import test from "node:test";
import assert from "node:assert/strict";
import { resolveEffectiveTenantRecipeWorkspaceId } from "../routes/tenantRecipeWorkspaceSelection";

test("uses auth workspace when request does not provide override", () => {
  const workspaceId = resolveEffectiveTenantRecipeWorkspaceId({
    authTenantId: "tenant-A",
    authWorkspaceId: "workspace-auth",
    requestedWorkspaceId: null,
    requestedWorkspaceTenantId: null,
  });

  assert.equal(workspaceId, "workspace-auth");
});

test("uses requested workspace when it belongs to the same tenant", () => {
  const workspaceId = resolveEffectiveTenantRecipeWorkspaceId({
    authTenantId: "tenant-A",
    authWorkspaceId: "workspace-auth",
    requestedWorkspaceId: "workspace-selected",
    requestedWorkspaceTenantId: "tenant-A",
  });

  assert.equal(workspaceId, "workspace-selected");
});

test("falls back to auth workspace when requested workspace belongs to another tenant", () => {
  const workspaceId = resolveEffectiveTenantRecipeWorkspaceId({
    authTenantId: "tenant-A",
    authWorkspaceId: "workspace-auth",
    requestedWorkspaceId: "workspace-foreign",
    requestedWorkspaceTenantId: "tenant-B",
  });

  assert.equal(workspaceId, "workspace-auth");
});
