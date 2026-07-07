import crypto from "node:crypto";
import { z } from "zod";
import { recordGuardrailAudit } from "@eiah/core/services/guardrailLedgerStore";
import { createGovernedRouter } from "../middlewares/asyncHandler";
import { enforceTenant, type TenantAwareRequest } from "../middlewares/enforceTenant";
import {
  buildDelegationRenewalPolicyContract,
  buildDelegationRenewalPreview,
} from "../types/delegationRenewalPolicyContract";

export const delegationsRouter = createGovernedRouter();
delegationsRouter.use(enforceTenant);

const DelegationCreateSchema = z.object({
  delegateeId: z.string().min(1),
  marketplaceId: z.string().min(1).optional(),
  scope: z.enum(["read", "execute", "admin"]),
  trustMin: z.number().min(0).max(100),
  validUntil: z.string().datetime(),
  policyHash: z.string().optional(),
  signatureHash: z.string().optional(),
});

const DelegationUpdateSchema = z.object({
  marketplaceId: z.string().min(1).optional(),
  scope: z.enum(["read", "execute", "admin"]).optional(),
  trustMin: z.number().min(0).max(100).optional(),
  validUntil: z.string().datetime().optional(),
  policyHash: z.string().optional(),
  signatureHash: z.string().optional(),
});

function scopeRank(scope: string) {
  const normalized = scope.trim().toLowerCase();
  if (normalized === "admin") return 3;
  if (normalized === "execute") return 2;
  if (normalized === "read") return 1;
  return 0;
}

function buildDefaultDelegationRenewalPolicy() {
  return buildDelegationRenewalPolicyContract({
    renewalMode: "auto_eligible",
    renewalWindowDays: 30,
    extensionDays: 30,
    minTrustToAutoRenew: 70,
    failClosed: true,
    allowedScopes: ["read", "execute", "admin"],
  });
}

function evaluateDelegationRenewal(params: {
  scope: string;
  trustMin: number;
  validUntil: Date;
}) {
  const policy = buildDefaultDelegationRenewalPolicy();
  const now = Date.now();
  const validUntilTime = params.validUntil.getTime();
  const daysUntilExpiry = Math.ceil((validUntilTime - now) / (24 * 60 * 60 * 1000));
  const recommendedValidUntil = new Date(now + policy.extensionDays * 24 * 60 * 60 * 1000);

  if (!policy.allowedScopes.includes(params.scope as "read" | "execute" | "admin")) {
    return buildDelegationRenewalPreview({
      policy,
      evaluation: "blocked",
      summary: "Renovação bloqueada: escopo fora da policy de renewal.",
      recommendedValidUntil: null,
      daysUntilExpiry,
      canApplyRenewal: false,
      autoEligible: false,
    });
  }

  if (daysUntilExpiry > policy.renewalWindowDays) {
    return buildDelegationRenewalPreview({
      policy,
      evaluation: "too_early",
      summary: `Renovação ainda cedo para esta delegação. A janela assistida abre em até ${policy.renewalWindowDays} dias do vencimento.`,
      recommendedValidUntil: null,
      daysUntilExpiry,
      canApplyRenewal: false,
      autoEligible: false,
    });
  }

  const autoEligible =
    policy.renewalMode === "auto_eligible" &&
    params.scope !== "admin" &&
    params.trustMin < policy.minTrustToAutoRenew;
  const evaluation = autoEligible
    ? "eligible"
    : params.scope === "admin" || params.trustMin >= policy.minTrustToAutoRenew
      ? "review_required"
      : "eligible";

  const summary =
    autoEligible
      ? `Delegação elegível para renewal automático por ${policy.extensionDays} dias.`
      : evaluation === "eligible"
      ? `Delegação elegível para renewal assistido por ${policy.extensionDays} dias.`
      : `Delegação pede revisão antes da renovação por envolver trust/escopo mais sensível.`;

  return buildDelegationRenewalPreview({
    policy,
    evaluation,
    summary,
    recommendedValidUntil: recommendedValidUntil.toISOString(),
    daysUntilExpiry,
    canApplyRenewal: true,
    autoEligible,
  });
}

delegationsRouter.get("/delegations", async (req, res) => {
  const request = req as TenantAwareRequest;
  if (!request.authContext || !request.prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const role = typeof req.query.role === "string" ? req.query.role : "all";
  const workspaceScoped = typeof req.query.workspaceScoped === "string"
    ? req.query.workspaceScoped.trim().toLowerCase() === "true"
    : false;
  const baseWhere =
    role === "delegator"
      ? { delegatorId: request.authContext.tenantId }
      : role === "delegatee"
      ? { delegateeId: request.authContext.tenantId }
      : {
          OR: [
            { delegatorId: request.authContext.tenantId },
            { delegateeId: request.authContext.tenantId },
          ],
        };
  const where = workspaceScoped
    ? { delegateeId: request.authContext.tenantId }
    : baseWhere;

  const items = await request.prisma.delegationPolicy.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      marketplace: {
        select: {
          id: true,
          type: true,
          name: true,
          publisherId: true,
          publisher: { select: { name: true } },
        },
      },
    },
  });

  if (!workspaceScoped) {
    const serialized = items.map(({ marketplace, ...rest }) => ({
      ...rest,
      marketplaceName: marketplace?.name ?? null,
      marketplaceType: marketplace?.type ?? null,
      publisherId: marketplace?.publisherId ?? null,
      publisherName: marketplace?.publisher?.name ?? null,
    }));
    return res.json({ items: serialized });
  }

  const allowedPolicies = await request.prisma.tenantActionPolicy.findMany({
    where: {
      tenantId: request.authContext.tenantId,
      workspaceId: request.authContext.workspaceId,
      allowed: true,
    },
    select: { actionName: true },
  });

  const allowedAgentNames = new Set(
    allowedPolicies.map((policy) => policy.actionName.trim().toLowerCase())
  );

  const filtered = items.filter((item) => {
    const marketplace = (item as typeof item & {
      marketplace?: { id: string; type: string; name: string } | null;
    }).marketplace;
    if (!marketplace) return false;
    if (marketplace.type !== "agent") return false;
    return allowedAgentNames.has(marketplace.name.trim().toLowerCase());
  });

  const dedupedByAgentAndState = (() => {
    const byKey = new Map<string, (typeof filtered)[number]>();
    const now = Date.now();

    for (const item of filtered) {
      const marketplace = (item as typeof item & {
        marketplace?: { id: string; type: string; name: string } | null;
      }).marketplace;
      if (!marketplace) continue;
      const isActive = item.validUntil.getTime() > now;
      const stateKey = isActive ? "active" : "expired";
      const key = `${marketplace.name.trim().toLowerCase()}::${stateKey}`;

      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, item);
        continue;
      }

      const scopeDelta = scopeRank(item.scope) - scopeRank(existing.scope);
      if (scopeDelta > 0) {
        byKey.set(key, item);
        continue;
      }
      if (scopeDelta < 0) {
        continue;
      }

      const trustDelta = Number(item.trustMin ?? 0) - Number(existing.trustMin ?? 0);
      if (trustDelta > 0) {
        byKey.set(key, item);
        continue;
      }
      if (trustDelta < 0) {
        continue;
      }

      if (item.validUntil.getTime() > existing.validUntil.getTime()) {
        byKey.set(key, item);
        continue;
      }

      if (item.createdAt.getTime() > existing.createdAt.getTime()) {
        byKey.set(key, item);
      }
    }

    return [...byKey.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  })();

  const serialized = dedupedByAgentAndState.map(({ marketplace, ...rest }) => ({
    ...rest,
    marketplaceName: marketplace?.name ?? null,
    marketplaceType: marketplace?.type ?? null,
    publisherId: marketplace?.publisherId ?? null,
    publisherName: marketplace?.publisher?.name ?? null,
  }));
  return res.json({ items: serialized });
});

delegationsRouter.get("/delegations/:id", async (req, res) => {
  const request = req as TenantAwareRequest;
  if (!request.authContext || !request.prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const item = await request.prisma.delegationPolicy.findUnique({
    where: { id: req.params.id },
  });

  if (!item) {
    return res.status(404).json({ ok: false, error: { code: "DELEGATION_NOT_FOUND" } });
  }

  const tenantId = request.authContext.tenantId;
  if (item.delegatorId !== tenantId && item.delegateeId !== tenantId) {
    return res.status(403).json({ ok: false, error: { code: "DELEGATION_FORBIDDEN" } });
  }

  return res.json({ item });
});

delegationsRouter.get("/delegations/:id/renewal-preview", async (req, res) => {
  const request = req as TenantAwareRequest;
  if (!request.authContext || !request.prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const item = await request.prisma.delegationPolicy.findUnique({
    where: { id: req.params.id },
  });

  if (
    !item ||
    (item.delegatorId !== request.authContext.tenantId &&
      item.delegateeId !== request.authContext.tenantId)
  ) {
    return res.status(404).json({ ok: false, error: { code: "DELEGATION_NOT_FOUND" } });
  }

  const preview = evaluateDelegationRenewal({
    scope: item.scope,
    trustMin: item.trustMin,
    validUntil: item.validUntil,
  });

  return res.json({ ok: true, preview });
});

delegationsRouter.post("/delegations", async (req, res) => {
  const request = req as TenantAwareRequest;
  if (!request.authContext || !request.prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const parsed = DelegationCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: { code: "INVALID_PAYLOAD" } });
  }

  const validUntil = new Date(parsed.data.validUntil);
  const policyPayload = {
    delegatorId: request.authContext.tenantId,
    delegateeId: parsed.data.delegateeId,
    marketplaceId: parsed.data.marketplaceId ?? null,
    scope: parsed.data.scope,
    trustMin: parsed.data.trustMin,
    validUntil: validUntil.toISOString(),
  };

  const policyHash =
    parsed.data.policyHash ??
    crypto.createHash("sha256").update(JSON.stringify(policyPayload)).digest("hex");
  const signatureHash =
    parsed.data.signatureHash ??
    crypto.createHash("sha256").update(`${policyHash}:${request.authContext.tenantId}`).digest("hex");

  const item = await request.prisma.delegationPolicy.create({
    data: {
      delegatorId: request.authContext.tenantId,
      delegateeId: parsed.data.delegateeId,
      marketplaceId: parsed.data.marketplaceId ?? null,
      scope: parsed.data.scope,
      trustMin: parsed.data.trustMin,
      validUntil,
      policyHash,
      signatureHash,
    },
  });

  return res.json({ ok: true, item });
});

delegationsRouter.patch("/delegations/:id", async (req, res) => {
  const request = req as TenantAwareRequest;
  if (!request.authContext || !request.prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const parsed = DelegationUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: { code: "INVALID_PAYLOAD" } });
  }

  const existing = await request.prisma.delegationPolicy.findUnique({
    where: { id: req.params.id },
  });

  if (
    !existing ||
    (existing.delegatorId !== request.authContext.tenantId &&
      existing.delegateeId !== request.authContext.tenantId)
  ) {
    return res.status(404).json({ ok: false, error: { code: "DELEGATION_NOT_FOUND" } });
  }

  const validUntil = parsed.data.validUntil ? new Date(parsed.data.validUntil) : existing.validUntil;
  const policyPayload = {
    delegatorId: existing.delegatorId,
    delegateeId: existing.delegateeId,
    marketplaceId: parsed.data.marketplaceId ?? existing.marketplaceId ?? null,
    scope: parsed.data.scope ?? existing.scope,
    trustMin: parsed.data.trustMin ?? existing.trustMin,
    validUntil: validUntil.toISOString(),
  };

  const policyHash =
    parsed.data.policyHash ??
    crypto.createHash("sha256").update(JSON.stringify(policyPayload)).digest("hex");
  const signatureHash =
    parsed.data.signatureHash ??
    crypto.createHash("sha256").update(`${policyHash}:${existing.delegatorId}`).digest("hex");

  const item = await request.prisma.delegationPolicy.update({
    where: { id: existing.id },
    data: {
      marketplaceId: parsed.data.marketplaceId ?? existing.marketplaceId,
      scope: parsed.data.scope ?? existing.scope,
      trustMin: parsed.data.trustMin ?? existing.trustMin,
      validUntil,
      policyHash,
      signatureHash,
    },
  });

  return res.json({ ok: true, item });
});

delegationsRouter.post("/delegations/:id/renew", async (req, res) => {
  const request = req as TenantAwareRequest;
  if (!request.authContext || !request.prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const existing = await request.prisma.delegationPolicy.findUnique({
    where: { id: req.params.id },
  });

  if (!existing || existing.delegatorId !== request.authContext.tenantId) {
    return res.status(404).json({ ok: false, error: { code: "DELEGATION_NOT_FOUND" } });
  }

  const preview = evaluateDelegationRenewal({
    scope: existing.scope,
    trustMin: existing.trustMin,
    validUntil: existing.validUntil,
  });

  if (!preview.canApplyRenewal || !preview.recommendedValidUntil) {
    return res.status(409).json({
      ok: false,
      error: { code: "DELEGATION_RENEWAL_BLOCKED", message: preview.summary },
      preview,
    });
  }

  const nextValidUntil = new Date(preview.recommendedValidUntil);
  const policyPayload = {
    delegatorId: existing.delegatorId,
    delegateeId: existing.delegateeId,
    marketplaceId: existing.marketplaceId ?? null,
    scope: existing.scope,
    trustMin: existing.trustMin,
    validUntil: nextValidUntil.toISOString(),
  };

  const policyHash = crypto.createHash("sha256").update(JSON.stringify(policyPayload)).digest("hex");
  const signatureHash = crypto
    .createHash("sha256")
    .update(`${policyHash}:${existing.delegatorId}`)
    .digest("hex");

  const item = await request.prisma.delegationPolicy.update({
    where: { id: existing.id },
    data: {
      validUntil: nextValidUntil,
      policyHash,
      signatureHash,
    },
  });

  await recordGuardrailAudit({
    prisma: request.prisma,
    tenantId: request.authContext.tenantId,
    workspaceId: request.authContext.workspaceId,
    eventType: "delegation.renewal.applied",
    severity: "info",
    message: existing.id,
    metadata: {
      delegationId: existing.id,
      evaluation: preview.evaluation,
      previousValidUntil: existing.validUntil.toISOString(),
      nextValidUntil: nextValidUntil.toISOString(),
    },
  });

  return res.json({ ok: true, item, preview });
});

delegationsRouter.post("/delegations/renew-expiring", async (req, res) => {
  const request = req as TenantAwareRequest;
  if (!request.authContext || !request.prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const now = new Date();
  const policy = buildDefaultDelegationRenewalPolicy();
  const renewalCutoff = new Date(now.getTime() + policy.renewalWindowDays * 24 * 60 * 60 * 1000);

  const items = await request.prisma.delegationPolicy.findMany({
    where: {
      delegateeId: request.authContext.tenantId,
      validUntil: {
        lte: renewalCutoff,
      },
    },
    orderBy: { validUntil: "asc" },
  });

  const results: Array<{
    delegationId: string;
    evaluation: string;
    renewed: boolean;
    nextValidUntil?: string | null;
  }> = [];

  for (const item of items) {
    const preview = evaluateDelegationRenewal({
      scope: item.scope,
      trustMin: item.trustMin,
      validUntil: item.validUntil,
    });

    if (!preview.autoEligible || !preview.canApplyRenewal || !preview.recommendedValidUntil) {
      results.push({
        delegationId: item.id,
        evaluation: preview.evaluation,
        renewed: false,
        nextValidUntil: preview.recommendedValidUntil,
      });
      continue;
    }

    const nextValidUntil = new Date(preview.recommendedValidUntil);
    const policyPayload = {
      delegatorId: item.delegatorId,
      delegateeId: item.delegateeId,
      marketplaceId: item.marketplaceId ?? null,
      scope: item.scope,
      trustMin: item.trustMin,
      validUntil: nextValidUntil.toISOString(),
    };
    const policyHash = crypto.createHash("sha256").update(JSON.stringify(policyPayload)).digest("hex");
    const signatureHash = crypto
      .createHash("sha256")
      .update(`${policyHash}:${item.delegatorId}`)
      .digest("hex");

    await request.prisma.delegationPolicy.update({
      where: { id: item.id },
      data: {
        validUntil: nextValidUntil,
        policyHash,
        signatureHash,
      },
    });

    await recordGuardrailAudit({
      prisma: request.prisma,
      tenantId: request.authContext.tenantId,
      workspaceId: request.authContext.workspaceId,
      eventType: "delegation.renewal.auto_applied",
      severity: "info",
      message: item.id,
      metadata: {
        delegationId: item.id,
        evaluation: preview.evaluation,
        previousValidUntil: item.validUntil.toISOString(),
        nextValidUntil: nextValidUntil.toISOString(),
      },
    });

    results.push({
      delegationId: item.id,
      evaluation: preview.evaluation,
      renewed: true,
      nextValidUntil: nextValidUntil.toISOString(),
    });
  }

  return res.json({
    ok: true,
    data: {
      processed: results.length,
      renewed: results.filter((item) => item.renewed).length,
      results,
    },
  });
});

delegationsRouter.delete("/delegations/:id", async (req, res) => {
  const request = req as TenantAwareRequest;
  if (!request.authContext || !request.prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const item = await request.prisma.delegationPolicy.findUnique({
    where: { id: req.params.id },
  });

  if (!item || item.delegatorId !== request.authContext.tenantId) {
    return res.status(404).json({ ok: false, error: { code: "DELEGATION_NOT_FOUND" } });
  }

  await request.prisma.delegationPolicy.delete({ where: { id: item.id } });
  return res.json({ ok: true });
});
