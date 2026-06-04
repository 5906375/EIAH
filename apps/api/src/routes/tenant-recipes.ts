import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { enforceTenant, type TenantAwareRequest } from "../middlewares/enforceTenant";
import { prismaGlobal } from "@repo/db";
import {
  buildTenantRecipeContract,
  tenantRecipeContentSchema,
  tenantRecipeStatusSchema,
  tenantRecipeWorkspaceScopeSchema,
} from "../types/tenantRecipeContract";
import {
  readRequestedWorkspaceId,
  resolveEffectiveTenantRecipeWorkspaceId,
} from "./tenantRecipeWorkspaceSelection";

export const tenantRecipesRouter = Router();
tenantRecipesRouter.use(enforceTenant);

const TenantRecipeCreateSchema = z.object({
  agentId: z.string().min(1),
  title: z.string().min(1).max(140),
  summary: z.string().min(1).max(500),
  instructions: z.string().max(4000).optional(),
  status: tenantRecipeStatusSchema.optional(),
  workspaceScope: tenantRecipeWorkspaceScopeSchema.optional(),
  tags: z.array(z.string().min(1).max(40)).max(12).optional(),
  content: tenantRecipeContentSchema.nullable().optional(),
});

const TenantRecipeUpdateSchema = z.object({
  agentId: z.string().min(1).optional(),
  title: z.string().min(1).max(140).optional(),
  summary: z.string().min(1).max(500).optional(),
  instructions: z.string().max(4000).nullable().optional(),
  status: tenantRecipeStatusSchema.optional(),
  workspaceScope: tenantRecipeWorkspaceScopeSchema.optional(),
  tags: z.array(z.string().min(1).max(40)).max(12).optional(),
  content: tenantRecipeContentSchema.nullable().optional(),
});

let tenantRecipesTableReady = false;
let tenantRecipesTableInitPromise: Promise<void> | null = null;

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
  content: unknown;
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

function serializeTenantRecipe(row: TenantRecipeRow) {
  return buildTenantRecipeContract({
    id: row.id,
    tenantId: row.tenantId,
    agentId: row.agentId,
    title: row.title,
    summary: row.summary,
    instructions: row.instructions,
    status: row.status,
    workspaceScope: {
      mode:
        row.workspaceScopeMode === "selected_workspaces" ? "selected_workspaces" : "all_workspaces",
      workspaceIds: asStringArray(row.workspaceScopeIds),
    },
    tags: asStringArray(row.tags),
    content: row.content ?? null,
    createdByUserId: row.createdByUserId,
    updatedByUserId: row.updatedByUserId,
    homologatedAt: row.homologatedAt?.toISOString() ?? null,
    deprecatedAt: row.deprecatedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

async function ensureTenantRecipesTable(request: TenantAwareRequest) {
  if (tenantRecipesTableReady || !request.prisma) return;
  if (tenantRecipesTableInitPromise) {
    await tenantRecipesTableInitPromise;
    return;
  }

  tenantRecipesTableInitPromise = (async () => {
    await request.prisma!.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "tenant_recipes" (
        "id" TEXT NOT NULL,
        "tenant_id" TEXT NOT NULL,
        "agent_id" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "summary" TEXT NOT NULL,
        "instructions" TEXT,
        "status" TEXT NOT NULL DEFAULT 'draft',
        "workspace_scope_mode" TEXT NOT NULL DEFAULT 'all_workspaces',
        "workspace_scope_ids" JSONB NOT NULL DEFAULT '[]'::jsonb,
        "tags" JSONB NOT NULL DEFAULT '[]'::jsonb,
        "content" JSONB,
        "created_by_user_id" TEXT,
        "updated_by_user_id" TEXT,
        "homologated_at" TIMESTAMP(3),
        "deprecated_at" TIMESTAMP(3),
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "tenant_recipes_pkey" PRIMARY KEY ("id")
      );
    `);

    await request.prisma!.$executeRawUnsafe(`
      ALTER TABLE "tenant_recipes"
      ADD COLUMN IF NOT EXISTS "content" JSONB;
    `);

    await request.prisma!.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "tenant_recipes_tenant_status_idx"
        ON "tenant_recipes"("tenant_id", "status", "updated_at");
    `);
    await request.prisma!.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "tenant_recipes_tenant_agent_status_idx"
        ON "tenant_recipes"("tenant_id", "agent_id", "status");
    `);

    await request.prisma!.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'tenant_recipes_tenant_id_fkey'
            AND table_name = 'tenant_recipes'
        ) THEN
          ALTER TABLE "tenant_recipes"
            ADD CONSTRAINT "tenant_recipes_tenant_id_fkey"
            FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
        END IF;
      END $$;
    `);
    await request.prisma!.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'tenant_recipes_created_by_user_id_fkey'
            AND table_name = 'tenant_recipes'
        ) THEN
          ALTER TABLE "tenant_recipes"
            ADD CONSTRAINT "tenant_recipes_created_by_user_id_fkey"
            FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;
      END $$;
    `);
    await request.prisma!.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'tenant_recipes_updated_by_user_id_fkey'
            AND table_name = 'tenant_recipes'
        ) THEN
          ALTER TABLE "tenant_recipes"
            ADD CONSTRAINT "tenant_recipes_updated_by_user_id_fkey"
            FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;
      END $$;
    `);

    tenantRecipesTableReady = true;
  })();

  try {
    await tenantRecipesTableInitPromise;
  } finally {
    tenantRecipesTableInitPromise = null;
  }
}

tenantRecipesRouter.get("/tenant-recipes", async (req, res) => {
  const request = req as TenantAwareRequest;
  if (!request.authContext || !request.prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  await ensureTenantRecipesTable(request);

  const view = req.query.view === "tenant" ? "tenant" : "workspace";
  const requestedWorkspaceId = readRequestedWorkspaceId(req);
  const requestedWorkspace =
    requestedWorkspaceId && requestedWorkspaceId !== request.authContext.workspaceId
      ? await prismaGlobal.workspace.findUnique({
          where: { id: requestedWorkspaceId },
          select: { tenantId: true },
        })
      : null;
  const effectiveWorkspaceId = resolveEffectiveTenantRecipeWorkspaceId({
    authTenantId: request.authContext.tenantId,
    authWorkspaceId: request.authContext.workspaceId,
    requestedWorkspaceId,
    requestedWorkspaceTenantId:
      requestedWorkspaceId && requestedWorkspaceId !== request.authContext.workspaceId
        ? requestedWorkspace?.tenantId ?? null
        : request.authContext.tenantId,
  });

  const rows =
    view === "tenant"
      ? await request.prisma.$queryRaw<TenantRecipeRow[]>`
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
            content,
            created_by_user_id AS "createdByUserId",
            updated_by_user_id AS "updatedByUserId",
            homologated_at AS "homologatedAt",
            deprecated_at AS "deprecatedAt",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
          FROM tenant_recipes
          WHERE tenant_id = ${request.authContext.tenantId}
          ORDER BY updated_at DESC;
        `
      : await request.prisma.$queryRaw<TenantRecipeRow[]>`
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
            content,
            created_by_user_id AS "createdByUserId",
            updated_by_user_id AS "updatedByUserId",
            homologated_at AS "homologatedAt",
            deprecated_at AS "deprecatedAt",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
          FROM tenant_recipes
          WHERE tenant_id = ${request.authContext.tenantId}
            AND status = 'homologated'
            AND (
              workspace_scope_mode = 'all_workspaces'
              OR workspace_scope_ids ? ${effectiveWorkspaceId}
            )
          ORDER BY updated_at DESC;
        `;

  return res.json({ items: rows.map(serializeTenantRecipe) });
});

tenantRecipesRouter.post("/tenant-recipes", async (req, res) => {
  const request = req as TenantAwareRequest;
  if (!request.authContext || !request.prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  await ensureTenantRecipesTable(request);

  const parsed = TenantRecipeCreateSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: { code: "INVALID_PAYLOAD" } });
  }

  const now = new Date();
  const status = parsed.data.status ?? "draft";
  const workspaceScope = parsed.data.workspaceScope ?? { mode: "all_workspaces" as const, workspaceIds: [] };
  const tags = parsed.data.tags ?? [];
  const content = parsed.data.content ?? null;

  const rows = await request.prisma.$queryRaw<TenantRecipeRow[]>`
    INSERT INTO tenant_recipes (
      id,
      tenant_id,
      agent_id,
      title,
      summary,
      instructions,
      status,
      workspace_scope_mode,
      workspace_scope_ids,
      tags,
      content,
      created_by_user_id,
      updated_by_user_id,
      homologated_at,
      deprecated_at,
      created_at,
      updated_at
    )
    VALUES (
      ${crypto.randomUUID()},
      ${request.authContext.tenantId},
      ${parsed.data.agentId},
      ${parsed.data.title},
      ${parsed.data.summary},
      ${parsed.data.instructions ?? null},
      ${status},
      ${workspaceScope.mode},
      CAST(${JSON.stringify(workspaceScope.workspaceIds)} AS JSONB),
      CAST(${JSON.stringify(tags)} AS JSONB),
      ${content ? JSON.stringify(content) : null}::jsonb,
      ${request.authContext.userId ?? null},
      ${request.authContext.userId ?? null},
      ${status === "homologated" ? now : null},
      ${status === "deprecated" ? now : null},
      ${now},
      ${now}
    )
    RETURNING
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
      content,
      created_by_user_id AS "createdByUserId",
      updated_by_user_id AS "updatedByUserId",
      homologated_at AS "homologatedAt",
      deprecated_at AS "deprecatedAt",
      created_at AS "createdAt",
      updated_at AS "updatedAt";
  `;

  return res.status(201).json({ ok: true, item: serializeTenantRecipe(rows[0]) });
});

tenantRecipesRouter.patch("/tenant-recipes/:id", async (req, res) => {
  const request = req as TenantAwareRequest;
  if (!request.authContext || !request.prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  await ensureTenantRecipesTable(request);

  const parsed = TenantRecipeUpdateSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: { code: "INVALID_PAYLOAD" } });
  }

  const existingRows = await request.prisma.$queryRaw<TenantRecipeRow[]>`
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
      content,
      created_by_user_id AS "createdByUserId",
      updated_by_user_id AS "updatedByUserId",
      homologated_at AS "homologatedAt",
      deprecated_at AS "deprecatedAt",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM tenant_recipes
    WHERE id = ${req.params.id}
      AND tenant_id = ${request.authContext.tenantId}
    LIMIT 1;
  `;

  const existing = existingRows[0];
  if (!existing) {
    return res.status(404).json({ ok: false, error: { code: "TENANT_RECIPE_NOT_FOUND" } });
  }

  const nextStatus = parsed.data.status ?? existing.status;
  const workspaceScope = parsed.data.workspaceScope ?? {
    mode:
      existing.workspaceScopeMode === "selected_workspaces" ? "selected_workspaces" : "all_workspaces",
    workspaceIds: asStringArray(existing.workspaceScopeIds),
  };
  const tags = parsed.data.tags ?? asStringArray(existing.tags);
  const content = parsed.data.content !== undefined ? parsed.data.content : existing.content ?? null;
  const now = new Date();
  const homologatedAt =
    nextStatus === "homologated"
      ? existing.homologatedAt ?? now
      : parsed.data.status === "draft"
      ? null
      : existing.homologatedAt;
  const deprecatedAt =
    nextStatus === "deprecated"
      ? now
      : parsed.data.status === "draft" || parsed.data.status === "homologated"
      ? null
      : existing.deprecatedAt;

  const rows = await request.prisma.$queryRaw<TenantRecipeRow[]>`
    UPDATE tenant_recipes
    SET
      agent_id = ${parsed.data.agentId ?? existing.agentId},
      title = ${parsed.data.title ?? existing.title},
      summary = ${parsed.data.summary ?? existing.summary},
      instructions = ${
        parsed.data.instructions !== undefined ? parsed.data.instructions : existing.instructions
      },
      status = ${nextStatus},
      workspace_scope_mode = ${workspaceScope.mode},
      workspace_scope_ids = CAST(${JSON.stringify(workspaceScope.workspaceIds)} AS JSONB),
      tags = CAST(${JSON.stringify(tags)} AS JSONB),
      content = ${content ? JSON.stringify(content) : null}::jsonb,
      updated_by_user_id = ${request.authContext.userId ?? null},
      homologated_at = ${homologatedAt},
      deprecated_at = ${deprecatedAt},
      updated_at = ${now}
    WHERE id = ${existing.id}
      AND tenant_id = ${request.authContext.tenantId}
    RETURNING
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
      content,
      created_by_user_id AS "createdByUserId",
      updated_by_user_id AS "updatedByUserId",
      homologated_at AS "homologatedAt",
      deprecated_at AS "deprecatedAt",
      created_at AS "createdAt",
      updated_at AS "updatedAt";
  `;

  return res.json({ ok: true, item: serializeTenantRecipe(rows[0]) });
});
