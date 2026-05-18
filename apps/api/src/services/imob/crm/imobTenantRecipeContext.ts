import { buildTenantRecipeContract, type TenantRecipeContract } from "../../../types/tenantRecipeContract";

type PrismaLike = {
  $queryRaw: <T = unknown>(strings: TemplateStringsArray, ...values: unknown[]) => Promise<T>;
};

type TenantRecipeRow = {
  id: string;
  tenantId: string;
  agentId: string;
  title: string;
  summary: string;
  instructions: string | null;
  status: string;
  workspaceScopeMode: string;
  workspaceScopeIds: unknown;
  tags: unknown;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  homologatedAt: Date | null;
  deprecatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function serializeTenantRecipe(row: TenantRecipeRow): TenantRecipeContract {
  return buildTenantRecipeContract({
    id: row.id,
    tenantId: row.tenantId,
    agentId: row.agentId,
    title: row.title,
    summary: row.summary,
    instructions: row.instructions,
    status: row.status,
    workspaceScope: {
      mode: row.workspaceScopeMode === "selected_workspaces" ? "selected_workspaces" : "all_workspaces",
      workspaceIds: asStringArray(row.workspaceScopeIds),
    },
    tags: asStringArray(row.tags),
    createdByUserId: row.createdByUserId,
    updatedByUserId: row.updatedByUserId,
    homologatedAt: row.homologatedAt?.toISOString() ?? null,
    deprecatedAt: row.deprecatedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

export async function resolveImobTenantRecipeForWorkspace(params: {
  prisma: PrismaLike;
  tenantId: string;
  workspaceId: string;
  recipeId?: string | null;
}): Promise<TenantRecipeContract | null> {
  if (!params.recipeId) return null;
  const rows = await params.prisma.$queryRaw<TenantRecipeRow[]>`
    SELECT
      id,
      tenant_id AS "tenantId",
      agent_id AS "agentId",
      title,
      summary,
      instructions,
      status,
      workspace_scope_mode AS "workspaceScopeMode",
      workspace_scope_ids AS "workspaceScopeIds",
      tags,
      created_by_user_id AS "createdByUserId",
      updated_by_user_id AS "updatedByUserId",
      homologated_at AS "homologatedAt",
      deprecated_at AS "deprecatedAt",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM tenant_recipes
    WHERE id = ${params.recipeId}
      AND tenant_id = ${params.tenantId}
      AND status = 'homologated'
      AND (
        workspace_scope_mode = 'all_workspaces'
        OR workspace_scope_ids ? ${params.workspaceId}
      )
    LIMIT 1;
  `;
  return rows[0] ? serializeTenantRecipe(rows[0]) : null;
}
