import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { prismaGlobal } from "@repo/db";
import {
  RESERVED_DEFAULT_WORKSPACE_ALLOWED_TENANT,
  RESERVED_DEFAULT_WORKSPACE_NAME,
  tenantAlreadyHasReservedDefaultWorkspace,
} from "../services/workspaceNamingPolicy";
import { ensureWorkspaceMembershipForUser } from "../services/workspaceResponsibility";

const onboardingRouter = Router();

const onboardingSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  orgName: z.string().min(1),
  marketplaceId: z.string().min(1).optional(),
  mode: z.enum(["provision", "register_only"]).optional(),
});

class OnboardingError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function slugifyTenantId(value: string) {
  const base = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || "tenant";
}

function generateTokenValue() {
  return `tok_${crypto.randomBytes(24).toString("hex")}`;
}

onboardingRouter.post("/auth/onboarding", async (req, res) => {
  const parsed = onboardingSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_PAYLOAD", details: parsed.error.flatten() },
    });
  }

  const { email, name, orgName, marketplaceId, mode } = parsed.data;
  const onboardingMode = mode ?? "provision";
  const trustBaseline = 60;

  try {
    const result = await prismaGlobal.$transaction(async (tx) => {
      const existingUser = await tx.user.findUnique({
        where: { email },
        select: { id: true },
      });
      if (existingUser) {
        throw new OnboardingError(409, "USER_EXISTS", "User already exists");
      }

      const tenantBase = slugifyTenantId(orgName);
      let tenantId = tenantBase;
      let attempt = 0;
      while (attempt < 5) {
        const tenantExists = await tx.tenant.findUnique({
          where: { id: tenantId },
          select: { id: true },
        });
        if (!tenantExists) break;
        tenantId = `${tenantBase}-${crypto.randomBytes(2).toString("hex")}`;
        attempt += 1;
      }
      const finalTenantExists = await tx.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true },
      });
      if (finalTenantExists) {
        throw new OnboardingError(409, "TENANT_EXISTS", "Tenant id already exists");
      }

      const tenant = await tx.tenant.create({
        data: {
          id: tenantId,
          name: orgName,
        },
      });

      const shouldUseReservedDefault =
        orgName.trim().toUpperCase() === RESERVED_DEFAULT_WORKSPACE_ALLOWED_TENANT.trim().toUpperCase();
      const initialWorkspaceName = shouldUseReservedDefault ? RESERVED_DEFAULT_WORKSPACE_NAME : "Workspace Inicial";

      if (shouldUseReservedDefault) {
        const defaultAlreadyExists = await tenantAlreadyHasReservedDefaultWorkspace({
          prisma: tx,
          tenantId,
        });
        if (defaultAlreadyExists) {
          throw new OnboardingError(409, "DEFAULT_WORKSPACE_ALREADY_EXISTS", "Workspace DEFAULT already exists for this tenant");
        }
      }

      const workspace = await tx.workspace.create({
        data: {
          tenantId: tenant.id,
          name: initialWorkspaceName,
        },
      });

      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email,
          displayName: name,
        },
      });

      await ensureWorkspaceMembershipForUser({
        prisma: tx,
        tenantId: tenant.id,
        workspaceId: workspace.id,
        userId: user.id,
        roleKey: shouldUseReservedDefault ? "founder" : "gestor",
      });

      let tokenValue: string | null = null;
      if (onboardingMode === "provision") {
        tokenValue = generateTokenValue();
        await tx.apiToken.create({
          data: {
            token: tokenValue,
            tenantId: tenant.id,
            workspaceId: workspace.id,
            userId: user.id,
            description: "Onboarding token",
          },
        });
      }

      let delegationId: string | null = null;
      let marketplaceItem: { id: string; publisherId: string } | null = null;

      if (marketplaceId && onboardingMode === "provision") {
        const item = await tx.marketplaceItem.findUnique({
          where: { id: marketplaceId },
          select: { id: true, publisherId: true, isPublic: true },
        });
        if (!item) {
          throw new OnboardingError(404, "MARKETPLACE_NOT_FOUND", "Marketplace item not found");
        }
        if (!item.isPublic) {
          throw new OnboardingError(403, "MARKETPLACE_FORBIDDEN", "Marketplace item is not public");
        }

        const validUntil = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
        const policyPayload = {
          delegatorId: item.publisherId,
          delegateeId: tenant.id,
          marketplaceId: item.id,
          scope: "execute",
          trustMin: 50,
          validUntil: validUntil.toISOString(),
        };
        const policyHash = crypto
          .createHash("sha256")
          .update(JSON.stringify(policyPayload))
          .digest("hex");
        const signatureHash = crypto
          .createHash("sha256")
          .update(`${policyHash}:${item.publisherId}`)
          .digest("hex");

        const delegation = await tx.delegationPolicy.create({
          data: {
            delegatorId: item.publisherId,
            delegateeId: tenant.id,
            marketplaceId: item.id,
            scope: "execute",
            trustMin: 50,
            validUntil,
            policyHash,
            signatureHash,
          },
          select: { id: true },
        });

        delegationId = delegation.id;
        marketplaceItem = { id: item.id, publisherId: item.publisherId };
      }

      const ledgerPayload = {
        tenantId: tenant.id,
        workspaceId: workspace.id,
        userId: user.id,
        email,
        marketplaceId: marketplaceItem?.id ?? null,
        trustBaseline,
      };
      const payloadHash = crypto
        .createHash("sha256")
        .update(JSON.stringify(ledgerPayload))
        .digest("hex");

      await tx.guardrailLedger.create({
        data: {
          tenantId: tenant.id,
          actionType: "tenant.onboarded",
          criticalHash: payloadHash,
          payloadHash,
        },
      });

      await tx.guardrailAuditLedger.create({
        data: {
          tenantId: tenant.id,
          workspaceId: workspace.id,
          eventType: "tenant.onboarded",
          severity: "info",
          message: "Novo tenant criado via onboarding",
          metadata: ledgerPayload,
        },
      });

      return {
        tenantId: tenant.id,
        workspaceId: workspace.id,
        userId: user.id,
        token: tokenValue,
        delegationId,
      };
    });

    return res.status(201).json({
      ok: true,
      data: {
        tenantId: result.tenantId,
        workspaceId: result.workspaceId,
        userId: result.userId,
        token: result.token,
        delegationId: result.delegationId,
        trustBaseline,
        mode: onboardingMode,
      },
    });
  } catch (error) {
    if (error instanceof OnboardingError) {
      return res.status(error.status).json({
        ok: false,
        error: { code: error.code, message: error.message },
      });
    }

    return res.status(500).json({
      ok: false,
      error: { code: "ONBOARDING_FAILED", message: "Failed to create onboarding resources" },
    });
  }
});

export { onboardingRouter };
