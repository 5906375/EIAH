import crypto from "node:crypto";
import type { PrismaClient } from "@repo/db";
import { provisionWorkspaceAgentAssignments } from "../workspaceAgentProvisioning";
import { provisionWorkspaceActionPolicies } from "../workspaceActionPolicyProvisioning";
import { getProductDefaultActionPolicies } from "@eiah/core/catalog/workspaceActionPolicyProvisioning";
import {
  getProductProvisionedAgents,
  WORKSPACE_AGENT_PROVISIONING_VERSION,
} from "@eiah/core/catalog/workspaceAgentProvisioning";

/**
 * Ativação de produto no workspace (instalação + agentes + políticas padrão,
 * atômica — ADR-010 PR A/A2). Mesmo caminho para o Marketplace e para a
 * ativação pelo chat do front door (ADR-010 etapa F).
 */

export type ActivatableProduct = "IMOB";

export const PRODUCT_RELEASED_ROUTES: Record<ActivatableProduct, string[]> = {
  IMOB: ["/app/imob/chat", "/app/imob/properties", "/app/imob/processes", "/app/imob/partners"],
};

let tenantProductInstallationTableReady = false;

export async function ensureTenantProductInstallationTable(prisma: PrismaClient | null | undefined) {
  if (tenantProductInstallationTableReady) return;
  if (!prisma) return;

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "tenant_product_installations" (
      "id" TEXT NOT NULL,
      "tenant_id" TEXT NOT NULL,
      "workspace_id" TEXT NOT NULL,
      "product" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'active',
      "activated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "activated_by_user_id" TEXT,
      "metadata" JSONB,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "tenant_product_installations_pkey" PRIMARY KEY ("id")
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "tenant_product_installations_tenant_workspace_product_key"
      ON "tenant_product_installations"("tenant_id", "workspace_id", "product");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "tenant_product_installations_tenant_status_idx"
      ON "tenant_product_installations"("tenant_id", "status");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "tenant_product_installations_workspace_product_status_idx"
      ON "tenant_product_installations"("workspace_id", "product", "status");
  `);

  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'tenant_product_installations_tenant_id_fkey'
          AND table_name = 'tenant_product_installations'
      ) THEN
        ALTER TABLE "tenant_product_installations"
          ADD CONSTRAINT "tenant_product_installations_tenant_id_fkey"
          FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
      END IF;
    END $$;
  `);
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'tenant_product_installations_workspace_id_fkey'
          AND table_name = 'tenant_product_installations'
      ) THEN
        ALTER TABLE "tenant_product_installations"
          ADD CONSTRAINT "tenant_product_installations_workspace_id_fkey"
          FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
      END IF;
    END $$;
  `);
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'tenant_product_installations_activated_by_user_id_fkey'
          AND table_name = 'tenant_product_installations'
      ) THEN
        ALTER TABLE "tenant_product_installations"
          ADD CONSTRAINT "tenant_product_installations_activated_by_user_id_fkey"
          FOREIGN KEY ("activated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      END IF;
    END $$;
  `);

  tenantProductInstallationTableReady = true;
}

export type ProductInstallationRow = {
  tenantId: string;
  workspaceId: string;
  product: string;
  status: string;
  activatedAt: Date;
  activatedByUserId: string | null;
};

export type ProductActivationResult =
  | { ok: true; installation: ProductInstallationRow; releasedRoutes: string[] }
  | { ok: false; code: "WORKSPACE_AGENT_PROVISIONING_FAILED"; error: unknown }
  | { ok: false; code: "INSTALLATION_WRITE_FAILED" };

export async function activateProductInstallation(params: {
  prisma: PrismaClient;
  tenantId: string;
  workspaceId: string;
  userId: string | null;
  product: ActivatableProduct;
}): Promise<ProductActivationResult> {
  await ensureTenantProductInstallationTable(params.prisma);
  const now = new Date();
  const activatedByUserId = params.userId;
  const { tenantId, workspaceId, product } = params;
  try {
    const productAgents = getProductProvisionedAgents(product);
    const productActionPolicies = getProductDefaultActionPolicies(product);
    await params.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO tenant_product_installations (
          id,
          tenant_id,
          workspace_id,
          product,
          status,
          activated_at,
          activated_by_user_id,
          created_at,
          updated_at
        )
        VALUES (
          ${crypto.randomUUID()},
          ${tenantId},
          ${workspaceId},
          ${product},
          'active',
          ${now},
          ${activatedByUserId},
          ${now},
          ${now}
        )
        ON CONFLICT (tenant_id, workspace_id, product)
        DO UPDATE SET
          status = 'active',
          activated_at = EXCLUDED.activated_at,
          activated_by_user_id = EXCLUDED.activated_by_user_id,
          updated_at = EXCLUDED.updated_at;
      `;
      await provisionWorkspaceAgentAssignments({
        prisma: tx as unknown as PrismaClient,
        tenantId,
        workspaceId,
        agents: productAgents,
        trigger: `product_activation:${product}`,
        catalogVersion: WORKSPACE_AGENT_PROVISIONING_VERSION,
      });
      // ADR-010 (PR A2): grant only the approved default action policies.
      await provisionWorkspaceActionPolicies({
        prisma: tx as unknown as PrismaClient,
        tenantId,
        workspaceId,
        actionNames: productActionPolicies,
      });
    });
  } catch (error) {
    return { ok: false, code: "WORKSPACE_AGENT_PROVISIONING_FAILED", error };
  }

  const rows = await params.prisma.$queryRaw<ProductInstallationRow[]>`
    SELECT
      tenant_id AS "tenantId",
      workspace_id AS "workspaceId",
      product,
      status,
      activated_at AS "activatedAt",
      activated_by_user_id AS "activatedByUserId"
    FROM tenant_product_installations
    WHERE tenant_id = ${tenantId}
      AND workspace_id = ${workspaceId}
      AND product = ${product}
    LIMIT 1;
  `;
  const installation = rows[0];
  if (!installation) return { ok: false, code: "INSTALLATION_WRITE_FAILED" };
  return { ok: true, installation, releasedRoutes: PRODUCT_RELEASED_ROUTES[product] ?? [] };
}
