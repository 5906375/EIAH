import { Router } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { enforceTenant, type TenantAwareRequest } from "../middlewares/enforceTenant";

export const marketplaceRouter = Router();
marketplaceRouter.use(enforceTenant);

marketplaceRouter.get("/marketplace/my-delegations", (req, res) => {
  const basePath = req.baseUrl ?? "";
  return res.redirect(307, `${basePath}/delegations?role=delegatee`);
});

const MarketplaceCreateSchema = z.object({
  type: z.enum(["agent", "action"]),
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().max(2000).optional(),
  trustScore: z.number().min(0).max(100).optional(),
  isPublic: z.boolean().optional(),
});

const MarketplaceUpdateSchema = z.object({
  type: z.enum(["agent", "action"]).optional(),
  name: z.string().min(1).optional(),
  version: z.string().min(1).optional(),
  description: z.string().max(2000).optional(),
  trustScore: z.number().min(0).max(100).optional(),
  isPublic: z.boolean().optional(),
});

const MarketplaceSubscribeSchema = z.object({
  scope: z.enum(["read", "execute", "admin"]).optional(),
  trustMin: z.number().min(0).max(100).optional(),
  validUntil: z.string().datetime().optional(),
  policyHash: z.string().optional(),
  signatureHash: z.string().optional(),
});

const MarketplaceActivateInstallationSchema = z.object({
  product: z.preprocess(
    (value) => (typeof value === "string" ? value.trim().toUpperCase() : value),
    z.enum(["IMOB"])
  ),
});

let tenantProductInstallationTableReady = false;

async function ensureTenantProductInstallationTable(request: TenantAwareRequest) {
  if (tenantProductInstallationTableReady) return;
  if (!request.prisma) return;

  await request.prisma.$executeRawUnsafe(`
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

  await request.prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "tenant_product_installations_tenant_workspace_product_key"
      ON "tenant_product_installations"("tenant_id", "workspace_id", "product");
  `);
  await request.prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "tenant_product_installations_tenant_status_idx"
      ON "tenant_product_installations"("tenant_id", "status");
  `);
  await request.prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "tenant_product_installations_workspace_product_status_idx"
      ON "tenant_product_installations"("workspace_id", "product", "status");
  `);

  await request.prisma.$executeRawUnsafe(`
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
  await request.prisma.$executeRawUnsafe(`
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
  await request.prisma.$executeRawUnsafe(`
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

function normalizeMarketplaceName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function scoreApprovalStatus(value: string | null | undefined) {
  if (value === "approved") return 3;
  if (value === "pending") return 2;
  if (value === "rejected") return 1;
  return 0;
}

function compareMarketplacePriority(
  a: {
    publisherId: string;
    approvalStatus?: string | null;
    trustScore?: number | null;
    createdAt: Date;
  },
  b: {
    publisherId: string;
    approvalStatus?: string | null;
    trustScore?: number | null;
    createdAt: Date;
  },
  tenantId: string
) {
  const aOwner = a.publisherId === tenantId ? 1 : 0;
  const bOwner = b.publisherId === tenantId ? 1 : 0;
  if (aOwner !== bOwner) return bOwner - aOwner;

  const aApproval = scoreApprovalStatus(a.approvalStatus ?? null);
  const bApproval = scoreApprovalStatus(b.approvalStatus ?? null);
  if (aApproval !== bApproval) return bApproval - aApproval;

  const aTrust = typeof a.trustScore === "number" ? a.trustScore : -1;
  const bTrust = typeof b.trustScore === "number" ? b.trustScore : -1;
  if (aTrust !== bTrust) return bTrust - aTrust;

  return b.createdAt.getTime() - a.createdAt.getTime();
}

function scopePriority(scope: string) {
  const normalized = scope.trim().toLowerCase();
  if (normalized === "admin") return 3;
  if (normalized === "execute") return 2;
  if (normalized === "read") return 1;
  return 0;
}

marketplaceRouter.get("/marketplace", async (req, res) => {
  const request = req as TenantAwareRequest;
  if (!request.authContext || !request.prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const type = typeof req.query.type === "string" ? req.query.type : undefined;
  const publisherId = typeof req.query.publisherId === "string" ? req.query.publisherId : undefined;
  const dedupeEnabled =
    typeof req.query.dedupe === "string"
      ? req.query.dedupe.trim().toLowerCase() !== "false"
      : true;

  const items = await request.prisma.marketplaceItem.findMany({
    where: {
      ...(type ? { type } : {}),
      ...(publisherId ? { publisherId } : {}),
      OR: [{ isPublic: true }, { publisherId: request.authContext.tenantId }],
    },
    orderBy: { createdAt: "desc" },
    include: { publisher: { select: { name: true } } },
  });

  const deduped = dedupeEnabled
    ? (() => {
        const byKey = new Map<string, (typeof items)[number]>();
        for (const item of items) {
          const key = `${item.type}:${normalizeMarketplaceName(item.name)}`;
          const existing = byKey.get(key);
          if (!existing) {
            byKey.set(key, item);
            continue;
          }
          const pickExisting =
            compareMarketplacePriority(existing, item, request.authContext.tenantId) <= 0;
          if (!pickExisting) {
            byKey.set(key, item);
          }
        }
        return [...byKey.values()].sort(
          (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
        );
      })()
    : items;

  return res.json({
    items: deduped.map((item) => {
      const { publisher, ...rest } = item;
      return { ...rest, publisherName: publisher?.name ?? null };
    }),
  });
});

marketplaceRouter.get("/marketplace/installations", async (req, res) => {
  const request = req as TenantAwareRequest;
  if (!request.authContext || !request.prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  await ensureTenantProductInstallationTable(request);

  type InstallationRow = {
    tenantId: string;
    workspaceId: string;
    product: string;
    status: string;
    activatedAt: Date;
    activatedByUserId: string | null;
  };

  const rows = await request.prisma.$queryRaw<InstallationRow[]>`
    SELECT
      tenant_id AS "tenantId",
      workspace_id AS "workspaceId",
      product,
      status,
      activated_at AS "activatedAt",
      activated_by_user_id AS "activatedByUserId"
    FROM tenant_product_installations
    WHERE tenant_id = ${request.authContext.tenantId}
      AND workspace_id = ${request.authContext.workspaceId}
    ORDER BY activated_at DESC;
  `;

  return res.json({
    ok: true,
    items: rows.map((row) => ({
      tenantId: row.tenantId,
      workspaceId: row.workspaceId,
      product: row.product,
      status: row.status,
      activatedAt: row.activatedAt.toISOString(),
      activatedByUserId: row.activatedByUserId,
    })),
  });
});

marketplaceRouter.get("/marketplace/:id", async (req, res) => {
  const request = req as TenantAwareRequest;
  if (!request.authContext || !request.prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const item = await request.prisma.marketplaceItem.findUnique({
    where: { id: req.params.id },
    include: { publisher: { select: { name: true } } },
  });

  if (!item) {
    return res.status(404).json({ ok: false, error: { code: "MARKETPLACE_NOT_FOUND" } });
  }

  if (!item.isPublic && item.publisherId !== request.authContext.tenantId) {
    const delegation = await request.prisma.delegationPolicy.findFirst({
      where: {
        delegateeId: request.authContext.tenantId,
        marketplaceId: item.id,
        validUntil: { gt: new Date() },
      },
    });
    if (!delegation) {
      return res.status(403).json({ ok: false, error: { code: "MARKETPLACE_FORBIDDEN" } });
    }
  }

  const { publisher, ...rest } = item;
  return res.json({
    item: {
      ...rest,
      publisherName: publisher?.name ?? null,
    },
  });
});

marketplaceRouter.post("/marketplace", async (req, res) => {
  const request = req as TenantAwareRequest;
  if (!request.authContext || !request.prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const parsed = MarketplaceCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: { code: "INVALID_PAYLOAD" } });
  }

  const item = await request.prisma.marketplaceItem.create({
    data: {
      type: parsed.data.type,
      name: parsed.data.name,
      version: parsed.data.version,
      description: parsed.data.description ?? null,
      trustScore: parsed.data.trustScore ?? null,
      isPublic: parsed.data.isPublic ?? false,
      publisherId: request.authContext.tenantId,
    },
    include: { publisher: { select: { name: true } } },
  });

  const { publisher, ...rest } = item;
  return res.json({
    ok: true,
    item: {
      ...rest,
      publisherName: publisher?.name ?? null,
    },
  });
});

marketplaceRouter.patch("/marketplace/:id", async (req, res) => {
  const request = req as TenantAwareRequest;
  if (!request.authContext || !request.prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const parsed = MarketplaceUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: { code: "INVALID_PAYLOAD" } });
  }

  const existing = await request.prisma.marketplaceItem.findUnique({
    where: { id: req.params.id },
  });

  if (!existing || existing.publisherId !== request.authContext.tenantId) {
    return res.status(404).json({ ok: false, error: { code: "MARKETPLACE_NOT_FOUND" } });
  }

  const item = await request.prisma.marketplaceItem.update({
    where: { id: existing.id },
    data: {
      type: parsed.data.type ?? existing.type,
      name: parsed.data.name ?? existing.name,
      version: parsed.data.version ?? existing.version,
      description: parsed.data.description ?? existing.description,
      trustScore: parsed.data.trustScore ?? existing.trustScore,
      isPublic: parsed.data.isPublic ?? existing.isPublic,
    },
    include: { publisher: { select: { name: true } } },
  });

  const { publisher, ...rest } = item;
  return res.json({
    ok: true,
    item: {
      ...rest,
      publisherName: publisher?.name ?? null,
    },
  });
});

marketplaceRouter.delete("/marketplace/:id", async (req, res) => {
  const request = req as TenantAwareRequest;
  if (!request.authContext || !request.prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const existing = await request.prisma.marketplaceItem.findUnique({
    where: { id: req.params.id },
  });

  if (!existing || existing.publisherId !== request.authContext.tenantId) {
    return res.status(404).json({ ok: false, error: { code: "MARKETPLACE_NOT_FOUND" } });
  }

  await request.prisma.marketplaceItem.delete({ where: { id: existing.id } });
  return res.json({ ok: true });
});

marketplaceRouter.post("/marketplace/:id/subscribe", async (req, res) => {
  const request = req as TenantAwareRequest;
  if (!request.authContext || !request.prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const parsed = MarketplaceSubscribeSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: { code: "INVALID_PAYLOAD" } });
  }

  const item = await request.prisma.marketplaceItem.findUnique({
    where: { id: req.params.id },
    include: { publisher: { select: { name: true } } },
  });

  if (!item) {
    return res.status(404).json({ ok: false, error: { code: "MARKETPLACE_NOT_FOUND" } });
  }

  if (!item.isPublic && item.publisherId !== request.authContext.tenantId) {
    return res.status(403).json({ ok: false, error: { code: "MARKETPLACE_FORBIDDEN" } });
  }

  const scope = parsed.data.scope ?? "execute";
  const trustMin = parsed.data.trustMin ?? item.trustScore ?? 0;
  const validUntil = parsed.data.validUntil
    ? new Date(parsed.data.validUntil)
    : new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

  const policyPayload = {
    delegatorId: item.publisherId,
    delegateeId: request.authContext.tenantId,
    marketplaceId: item.id,
    scope,
    trustMin,
    validUntil: validUntil.toISOString(),
  };
  const policyHash =
    parsed.data.policyHash ??
    crypto.createHash("sha256").update(JSON.stringify(policyPayload)).digest("hex");
  const signatureHash =
    parsed.data.signatureHash ??
    crypto.createHash("sha256").update(`${policyHash}:${item.publisherId}`).digest("hex");

  const now = new Date();
  let delegation = null as Awaited<ReturnType<typeof request.prisma.delegationPolicy.create>> | null;

  if (item.type === "agent") {
    const existingActiveByAgentName = await request.prisma.delegationPolicy.findMany({
      where: {
        delegateeId: request.authContext.tenantId,
        validUntil: { gt: now },
        scope: { in: ["read", "execute", "admin"] },
        marketplace: {
          is: {
            type: "agent",
            name: { equals: item.name, mode: "insensitive" },
          },
        },
      },
      include: { marketplace: true },
    });

    if (existingActiveByAgentName.length > 0) {
      const ranked = [...existingActiveByAgentName].sort((a, b) => {
        const scopeDelta = scopePriority(b.scope) - scopePriority(a.scope);
        if (scopeDelta !== 0) return scopeDelta;
        const trustDelta = Number(b.trustMin ?? 0) - Number(a.trustMin ?? 0);
        if (trustDelta !== 0) return trustDelta;
        const validUntilDelta = b.validUntil.getTime() - a.validUntil.getTime();
        if (validUntilDelta !== 0) return validUntilDelta;
        return b.createdAt.getTime() - a.createdAt.getTime();
      });
      delegation = ranked[0];
    }
  } else {
    const existingByMarketplace = await request.prisma.delegationPolicy.findFirst({
      where: {
        delegateeId: request.authContext.tenantId,
        marketplaceId: item.id,
        validUntil: { gt: now },
        scope: { in: ["read", "execute", "admin"] },
      },
      orderBy: { createdAt: "desc" },
    });
    if (existingByMarketplace) {
      delegation = existingByMarketplace;
    }
  }

  if (!delegation) {
    delegation = await request.prisma.delegationPolicy.create({
      data: {
        delegatorId: item.publisherId,
        delegateeId: request.authContext.tenantId,
        marketplaceId: item.id,
        scope,
        trustMin,
        validUntil,
        policyHash,
        signatureHash,
      },
    });
  }

  if (item.type === "agent") {
    const existingWorkspacePolicies = await request.prisma.tenantActionPolicy.findMany({
      where: {
        tenantId: request.authContext.tenantId,
        workspaceId: request.authContext.workspaceId,
        actionName: { equals: item.name, mode: "insensitive" },
      },
      orderBy: { createdAt: "desc" },
    });

    const keeper = existingWorkspacePolicies[0];

    if (keeper) {
      const duplicateIds = existingWorkspacePolicies.slice(1).map((row) => row.id);
      if (duplicateIds.length > 0) {
        await request.prisma.tenantActionPolicy.deleteMany({
          where: { id: { in: duplicateIds } },
        });
      }
      await request.prisma.tenantActionPolicy.update({
        where: { id: keeper.id },
        data: {
          actionName: item.name,
          allowed: true,
        },
      });
    } else {
      await request.prisma.tenantActionPolicy.create({
        data: {
          tenantId: request.authContext.tenantId,
          workspaceId: request.authContext.workspaceId,
          actionName: item.name,
          allowed: true,
        },
      });
    }
  }

  return res.json({
    ok: true,
    delegationId: delegation.id,
    publisherName: item.publisher?.name ?? null,
  });
});

marketplaceRouter.post("/marketplace/installations/activate", async (req, res) => {
  const request = req as TenantAwareRequest;
  if (!request.authContext || !request.prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const parsed = MarketplaceActivateInstallationSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: { code: "INVALID_PAYLOAD" } });
  }

  await ensureTenantProductInstallationTable(request);

  const now = new Date();
  const activatedByUserId = request.authContext.userId ?? null;

  await request.prisma.$executeRaw`
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
      ${request.authContext.tenantId},
      ${request.authContext.workspaceId},
      ${parsed.data.product},
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

  type InstallationRow = {
    tenantId: string;
    workspaceId: string;
    product: string;
    status: string;
    activatedAt: Date;
    activatedByUserId: string | null;
  };

  const rows = await request.prisma.$queryRaw<InstallationRow[]>`
    SELECT
      tenant_id AS "tenantId",
      workspace_id AS "workspaceId",
      product,
      status,
      activated_at AS "activatedAt",
      activated_by_user_id AS "activatedByUserId"
    FROM tenant_product_installations
    WHERE tenant_id = ${request.authContext.tenantId}
      AND workspace_id = ${request.authContext.workspaceId}
      AND product = ${parsed.data.product}
    LIMIT 1;
  `;

  const installation = rows[0];
  if (!installation) {
    return res.status(500).json({
      ok: false,
      error: { code: "INSTALLATION_WRITE_FAILED", message: "Unable to persist installation" },
    });
  }

  const releasedRoutes =
    parsed.data.product === "IMOB"
      ? ["/app/imob/chat", "/app/imob/properties", "/app/imob/processes", "/app/imob/partners"]
      : [];

  return res.json({
    ok: true,
    installation: {
      tenantId: installation.tenantId,
      workspaceId: installation.workspaceId,
      product: installation.product,
      status: installation.status,
      activatedAt: installation.activatedAt.toISOString(),
      activatedByUserId: installation.activatedByUserId,
    },
    releasedRoutes,
  });
});
