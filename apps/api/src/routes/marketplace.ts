import { Router } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { enforceTenant, type TenantAwareRequest } from "../middlewares/enforceTenant";
import { requirePermission } from "../middlewares/requirePermission";
import { requireTenantRole } from "../middlewares/requireTenantRole";

export const marketplaceRouter = Router();
marketplaceRouter.use(enforceTenant);

type AutoAgentCatalogItem = {
  agentId: string;
  title: string;
};

const AUTO_SELF_SERVICE_AGENT_CATALOG: AutoAgentCatalogItem[] = [
  { agentId: "AADV", title: "AADV Self-Service" },
  { agentId: "MKT", title: "Briefing de Campanha" },
  { agentId: "J_360", title: "Visão 360º do Cliente" },
  { agentId: "flow-orchestrator", title: "Plano de Orquestração DeFi" },
  { agentId: "risk-analyzer", title: "Checklist de Risco & Compliance" },
  { agentId: "guardian", title: "Guardian – Registro Probatorio & LGPD" },
  { agentId: "fin-nexus", title: "FinNexus Insight Financeiro" },
  { agentId: "onchain-monitor", title: "Setup de Monitoramento On-chain" },
  { agentId: "I_BC", title: "Inteligência Comercial" },
  { agentId: "Diarias", title: "Rotina Operacional Diária" },
  { agentId: "NFT_PY", title: "Planejamento de Coleção NFT" },
  { agentId: "ImageNFTDiarias", title: "Prompts Visuais Diários" },
  { agentId: "DeFi_1", title: "Simulação DeFi" },
  { agentId: "Pitch", title: "Montar Pitch" },
  { agentId: "EIAH", title: "Central de Ajuda EIAH" },
];

const AUTO_PUBLISH_DISABLE_EVENT = "marketplace.auto_publish.disabled";
const AUTO_PUBLISH_ENABLE_EVENT = "marketplace.auto_publish.enabled";

function isAutoSelfServiceAgentName(name: string) {
  return AUTO_SELF_SERVICE_AGENT_CATALOG.some((entry) => entry.agentId === name.trim());
}

function extractElevatedCredential(req: TenantAwareRequest) {
  const headerToken = req.header("x-eiah-admin-token")?.trim();
  if (headerToken) return headerToken;
  const auth = req.header("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    return token.length > 0 ? token : null;
  }
  return null;
}

function hasElevatedMarketplaceCredential(req: TenantAwareRequest) {
  const expected = process.env.ADMIN_API_TOKEN?.trim();
  if (!expected) return false;
  const provided = extractElevatedCredential(req);
  return Boolean(provided && provided === expected);
}

async function resolveAutoPublishDisabledAgents(request: TenantAwareRequest) {
  if (!request.prisma || !request.authContext) return new Set<string>();

  const events = await request.prisma.guardrailAuditLedger.findMany({
    where: {
      tenantId: request.authContext.tenantId,
      eventType: {
        in: [AUTO_PUBLISH_DISABLE_EVENT, AUTO_PUBLISH_ENABLE_EVENT],
      },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      eventType: true,
      metadata: true,
    },
  });

  const disabled = new Set<string>();
  for (const event of events) {
    const metadata =
      event.metadata && typeof event.metadata === "object"
        ? (event.metadata as Record<string, unknown>)
        : null;
    const agentId =
      metadata && typeof metadata.agentId === "string" ? metadata.agentId.trim() : "";
    if (!agentId) continue;
    if (event.eventType === AUTO_PUBLISH_DISABLE_EVENT) disabled.add(agentId);
    if (event.eventType === AUTO_PUBLISH_ENABLE_EVENT) disabled.delete(agentId);
  }
  return disabled;
}

async function ensureAutoSelfServiceItems(request: TenantAwareRequest) {
  if (!request.prisma || !request.authContext) return;
  if (process.env.MARKETPLACE_AUTO_PUBLISH_SELF_SERVICE?.trim().toLowerCase() === "false") return;

  const disabledAgents = await resolveAutoPublishDisabledAgents(request);
  const existing = await request.prisma.marketplaceItem.findMany({
    where: {
      publisherId: request.authContext.tenantId,
      type: "agent",
      name: { in: AUTO_SELF_SERVICE_AGENT_CATALOG.map((entry) => entry.agentId) },
    },
    select: { name: true },
  });

  const existingNames = new Set(existing.map((item) => item.name));
  const toCreate = AUTO_SELF_SERVICE_AGENT_CATALOG.filter((entry) => {
    if (disabledAgents.has(entry.agentId)) return false;
    return !existingNames.has(entry.agentId);
  });

  if (toCreate.length === 0) return;

  await request.prisma.marketplaceItem.createMany({
    data: toCreate.map((entry) => ({
      type: "agent",
      name: entry.agentId,
      version: "v1",
      description: `${entry.title} (auto-publicado do catálogo Self-Service)`,
      trustScore: 70,
      isPublic: true,
      publisherId: request.authContext!.tenantId,
    })),
  });
}

marketplaceRouter.get("/marketplace/my-delegations", (req, res) => {
  const basePath = req.baseUrl ?? "";
  return res.redirect(307, `${basePath}/delegations?role=delegatee`);
});

marketplaceRouter.get(
  "/marketplace/agents",
  requireTenantRole(["TENANT_ADMIN", "TENANT_OPERATOR", "TENANT_VIEWER"]),
  async (req, res) => {
    const request = req as TenantAwareRequest;
    if (!request.prisma) {
      return res.status(500).json({
        ok: false,
        error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
      });
    }
    await ensureAutoSelfServiceItems(request);
    const items = await request.prisma.marketplaceItem.findMany({
      where: { type: "agent" },
      orderBy: { createdAt: "desc" },
    });
    return res.json({ items });
  }
);

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
  planRef: z.string().min(1).optional(),
  quotaRef: z.string().min(1).optional(),
});

marketplaceRouter.get("/marketplace", requirePermission("delegation.view"), async (req, res) => {
  const request = req as TenantAwareRequest;
  if (!request.authContext || !request.prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }
  await ensureAutoSelfServiceItems(request);

  const type = typeof req.query.type === "string" ? req.query.type : undefined;
  const publisherId = typeof req.query.publisherId === "string" ? req.query.publisherId : undefined;

  const items = await request.prisma.marketplaceItem.findMany({
    where: {
      ...(type ? { type } : {}),
      ...(publisherId ? { publisherId } : {}),
      OR: [{ isPublic: true }, { publisherId: request.authContext.tenantId }],
    },
    orderBy: { createdAt: "desc" },
    include: { publisher: { select: { name: true } } },
  });

  return res.json({
    items: items.map((item) => {
      const { publisher, ...rest } = item;
      return { ...rest, publisherName: publisher?.name ?? null };
    }),
  });
});

marketplaceRouter.get("/marketplace/:id", requirePermission("delegation.view"), async (req, res) => {
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

const AutoPublishToggleSchema = z.object({
  agentId: z.string().min(1),
});

marketplaceRouter.post(
  "/marketplace/auto-publish/disable",
  requirePermission("delegation.manage"),
  async (req, res) => {
    const request = req as TenantAwareRequest;
    if (!request.authContext || !request.prisma) {
      return res.status(500).json({
        ok: false,
        error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
      });
    }
    if (!hasElevatedMarketplaceCredential(request)) {
      return res.status(403).json({
        ok: false,
        error: {
          code: "ELEVATED_CREDENTIAL_REQUIRED",
          message: "x-eiah-admin-token válido é obrigatório para desabilitar auto-publicação",
        },
      });
    }

    const parsed = AutoPublishToggleSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: { code: "INVALID_PAYLOAD" } });
    }
    const agentId = parsed.data.agentId.trim();
    if (!isAutoSelfServiceAgentName(agentId)) {
      return res.status(404).json({ ok: false, error: { code: "AGENT_NOT_IN_AUTO_CATALOG" } });
    }

    await request.prisma.$transaction(async (tx) => {
      await tx.guardrailAuditLedger.create({
        data: {
          tenantId: request.authContext!.tenantId,
          workspaceId: request.authContext!.workspaceId,
          runId: null,
          eventType: AUTO_PUBLISH_DISABLE_EVENT,
          severity: "warn",
          message: "Auto-publicação do agente desabilitada",
          metadata: {
            agentId,
            actorUserId: request.authContext?.userId ?? null,
          },
        },
      });
      await tx.marketplaceItem.deleteMany({
        where: {
          publisherId: request.authContext!.tenantId,
          type: "agent",
          name: agentId,
        },
      });
    });

    return res.json({ ok: true, agentId, autoPublish: "disabled" });
  }
);

marketplaceRouter.post(
  "/marketplace/auto-publish/enable",
  requirePermission("delegation.manage"),
  async (req, res) => {
    const request = req as TenantAwareRequest;
    if (!request.authContext || !request.prisma) {
      return res.status(500).json({
        ok: false,
        error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
      });
    }
    if (!hasElevatedMarketplaceCredential(request)) {
      return res.status(403).json({
        ok: false,
        error: {
          code: "ELEVATED_CREDENTIAL_REQUIRED",
          message: "x-eiah-admin-token válido é obrigatório para habilitar auto-publicação",
        },
      });
    }

    const parsed = AutoPublishToggleSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: { code: "INVALID_PAYLOAD" } });
    }
    const agentId = parsed.data.agentId.trim();
    if (!isAutoSelfServiceAgentName(agentId)) {
      return res.status(404).json({ ok: false, error: { code: "AGENT_NOT_IN_AUTO_CATALOG" } });
    }

    await request.prisma.guardrailAuditLedger.create({
      data: {
        tenantId: request.authContext.tenantId,
        workspaceId: request.authContext.workspaceId,
        runId: null,
        eventType: AUTO_PUBLISH_ENABLE_EVENT,
        severity: "info",
        message: "Auto-publicação do agente habilitada",
        metadata: {
          agentId,
          actorUserId: request.authContext?.userId ?? null,
        },
      },
    });
    await ensureAutoSelfServiceItems(request);

    return res.json({ ok: true, agentId, autoPublish: "enabled" });
  }
);

marketplaceRouter.post("/marketplace", requirePermission("delegation.manage"), async (req, res) => {
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

marketplaceRouter.patch("/marketplace/:id", requirePermission("delegation.manage"), async (req, res) => {
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

marketplaceRouter.delete("/marketplace/:id", requirePermission("delegation.manage"), async (req, res) => {
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

  const isProtectedAutoItem = existing.type === "agent" && isAutoSelfServiceAgentName(existing.name);
  if (isProtectedAutoItem && !hasElevatedMarketplaceCredential(request)) {
    return res.status(403).json({
      ok: false,
      error: {
        code: "ELEVATED_CREDENTIAL_REQUIRED",
        message: "Item auto-publicado exige x-eiah-admin-token válido para remoção",
      },
    });
  }

  if (isProtectedAutoItem) {
    await request.prisma.guardrailAuditLedger.create({
      data: {
        tenantId: request.authContext.tenantId,
        workspaceId: request.authContext.workspaceId,
        runId: null,
        eventType: AUTO_PUBLISH_DISABLE_EVENT,
        severity: "warn",
        message: "Auto-publicação desabilitada por remoção explícita",
        metadata: {
          agentId: existing.name,
          actorUserId: request.authContext?.userId ?? null,
          source: "marketplace.delete",
        },
      },
    });
  }

  await request.prisma.marketplaceItem.delete({ where: { id: existing.id } });
  return res.json({ ok: true });
});

marketplaceRouter.post(
  "/marketplace/:id/subscribe",
  requirePermission("delegation.manage"),
  async (req, res) => {
  const request = req as TenantAwareRequest;
  if (!request.authContext || !request.prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }
  const authContext = request.authContext;

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

  if (!item.isPublic && item.publisherId !== authContext.tenantId) {
    return res.status(403).json({ ok: false, error: { code: "MARKETPLACE_FORBIDDEN" } });
  }

  const scope = parsed.data.scope ?? "execute";
  const trustMin = parsed.data.trustMin ?? item.trustScore ?? 0;
  const validUntil = parsed.data.validUntil
    ? new Date(parsed.data.validUntil)
    : new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  const requiresApproval = item.type === "action" && scope !== "read";

  const policyPayload = {
    delegatorId: item.publisherId,
    delegateeId: authContext.tenantId,
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

  const agentId = item.name.trim();
  const activatedWorkspaceId = authContext.workspaceId?.trim() || null;
  const entitlementMeta = {
    source: "marketplace.subscribe",
    scope,
    trustMin,
    validUntil: validUntil.toISOString(),
  };

  const result = await request.prisma.$transaction(async (tx) => {
    const delegation = await tx.delegationPolicy.create({
      data: {
        delegatorId: item.publisherId,
        delegateeId: authContext.tenantId,
        marketplaceId: item.id,
        scope,
        trustMin,
        validUntil,
        policyHash,
        signatureHash,
        status: requiresApproval ? "pending_approval" : "active",
      },
    });

    const tenantEntitlement = await tx.tenantEntitlement.upsert({
      where: {
        unique_tenant_entitlement_agent: {
          tenantId: authContext.tenantId,
          agentId,
        },
      },
      create: {
        tenantId: authContext.tenantId,
        agentId,
        marketplaceId: item.id,
        planRef: parsed.data.planRef ?? null,
        quotaRef: parsed.data.quotaRef ?? null,
        status: "ACTIVE",
        startsAt: new Date(),
        metadata: entitlementMeta,
      },
      update: {
        marketplaceId: item.id,
        planRef: parsed.data.planRef ?? undefined,
        quotaRef: parsed.data.quotaRef ?? undefined,
        status: "ACTIVE",
        endsAt: null,
        metadata: entitlementMeta,
      },
    });

    const workspaceEntitlement = activatedWorkspaceId
      ? await tx.workspaceEntitlement.upsert({
          where: {
            unique_workspace_entitlement_agent: {
              tenantId: authContext.tenantId,
              workspaceId: activatedWorkspaceId,
              agentId,
            },
          },
          create: {
            tenantId: authContext.tenantId,
            workspaceId: activatedWorkspaceId,
            agentId,
            tenantEntitlementId: tenantEntitlement.id,
            status: "ACTIVE",
            activatedByUserId: authContext.userId ?? null,
            metadata: {
              source: "marketplace.subscribe",
            },
          },
          update: {
            tenantEntitlementId: tenantEntitlement.id,
            status: "ACTIVE",
            activatedByUserId: authContext.userId ?? null,
            metadata: {
              source: "marketplace.subscribe",
            },
          },
        })
      : null;

    return { delegation, tenantEntitlement, workspaceEntitlement };
  });

  return res.json({
    ok: true,
    delegationId: result.delegation.id,
    status: result.delegation.status,
    publisherName: item.publisher?.name ?? null,
    entitlement: {
      tenantEntitlementId: result.tenantEntitlement.id,
      workspaceEntitlementId: result.workspaceEntitlement?.id ?? null,
      workspaceId: activatedWorkspaceId,
      agentId,
    },
  });
  }
);
