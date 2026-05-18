import test from "node:test";
import assert from "node:assert/strict";

import { resolveImobTenantRecipeForWorkspace } from "../services/imob/crm/imobTenantRecipeContext";

function createPrismaRow(row: Record<string, unknown> | null) {
  return {
    async $queryRaw() {
      return row ? [row] : [];
    },
  } as any;
}

function recipeRow(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    id: "recipe-1",
    tenantId: "tenant-A",
    agentId: "IMOB",
    title: "Temporada",
    summary: "Captação temporada",
    instructions: null,
    status: "homologated",
    workspaceScopeMode: "selected_workspaces",
    workspaceScopeIds: ["workspace-A"],
    tags: ["imob", "temporada"],
    createdByUserId: null,
    updatedByUserId: null,
    homologatedAt: now,
    deprecatedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

test("IMOB tenant recipe context returns homologated workspace recipe", async () => {
  const recipe = await resolveImobTenantRecipeForWorkspace({
    prisma: createPrismaRow(recipeRow()),
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    recipeId: "recipe-1",
  });

  assert.equal(recipe?.id, "recipe-1");
  assert.equal(recipe?.agentId, "IMOB");
  assert.deepEqual(recipe?.tags, ["imob", "temporada"]);
});

test("IMOB tenant recipe context returns null when recipe is not found by scoped SQL", async () => {
  const recipe = await resolveImobTenantRecipeForWorkspace({
    prisma: createPrismaRow(null),
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    recipeId: "recipe-missing",
  });

  assert.equal(recipe, null);
});

test("IMOB tenant recipe context ignores empty recipe id", async () => {
  const recipe = await resolveImobTenantRecipeForWorkspace({
    prisma: createPrismaRow(recipeRow()),
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    recipeId: null,
  });

  assert.equal(recipe, null);
});
