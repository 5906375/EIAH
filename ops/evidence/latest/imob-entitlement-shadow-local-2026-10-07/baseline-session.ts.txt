import type { Request, Response } from "express";
import { Router } from "express";
import crypto from "node:crypto";
import process from "node:process";
import { z } from "zod";
import { prismaGlobal } from "@repo/db";
import { recordGuardrailAudit } from "@eiah/core/services/guardrailLedgerStore";
import { findApiToken } from "../auth/apiTokenRepository";
import { buildFrictionEvent, mapResolverDecisionToFrictionKind } from "../types/frictionEventContract";
import {
  resolveImobInstallationStatus,
  sendImobAccessDenied,
} from "../services/imob/imobAccessGate";
import { resolvePlatformExperience } from "../services/experienceResolver";
import { resolveVerticalExperienceRegistry } from "../services/verticalExperienceRegistry";
import {
  buildResolverAuditEvent,
  ExperienceAuditRequestSchema,
  type ResolverAuditDecisionType,
} from "../types/resolverAuditEvent";
import { mapLandingSurfaceToExperienceSurface } from "../types/experienceSurfaceContract";
import { resolvePreDuimpAccessFromCanonicalSources } from "../services/logistica/control/preDuimpAccessResolver";
import { asyncHandler } from "../middlewares/asyncHandler";

const sessionRouter = Router();
const DOMAIN_ALLOWLIST = new Set(["core", "imob"] as const);
const switchWorkspaceSchema = z.object({
  workspaceId: z.string().min(1),
});

type SessionTokenRecord = NonNullable<Awaited<ReturnType<typeof findApiToken>>>;

function parseCookieHeader(headerValue?: string | null) {
  if (!headerValue) return {};
  const pairs = headerValue.split(";").map((chunk) => chunk.trim()).filter(Boolean);
  const entries = pairs.map((pair) => {
    const index = pair.indexOf("=");
    if (index < 0) return [pair, ""];
    return [pair.slice(0, index), pair.slice(index + 1)];
  });
  return Object.fromEntries(entries);
}

function extractBearerToken(headerValue?: string | null) {
  if (!headerValue) return null;
  const trimmed = headerValue.trim();
  if (!trimmed.toLowerCase().startsWith("bearer ")) return null;
  const token = trimmed.slice(7).trim();
  return token.length > 0 ? token : null;
}

function extractBodyToken(req: Request) {
  const body = req.body as { token?: unknown } | undefined;
  if (!body || typeof body.token !== "string") return null;
  const trimmed = body.token.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveTokenFromRequest(req: Request) {
  const header = req.header("authorization") ?? req.header("Authorization");
  const bearer = extractBearerToken(header);
  const cookieBag =
    typeof (req as Request & { cookies?: Record<string, string> }).cookies === "object" &&
    (req as Request & { cookies?: Record<string, string> }).cookies !== null
      ? ((req as Request & { cookies?: Record<string, string> }).cookies as Record<string, string>)
      : parseCookieHeader(req.header("cookie"));
  const cookieToken = cookieBag.token ?? cookieBag.access_token ?? cookieBag.api_token;
  const resolvedCookieToken =
    typeof cookieToken === "string" && cookieToken.trim() ? cookieToken.trim() : null;
  const bodyToken = extractBodyToken(req);
  return bearer ?? resolvedCookieToken ?? bodyToken;
}

function resolveRequestedDomain(req: Request): "core" | "imob" {
  const queryDomain = typeof req.query.domain === "string" ? req.query.domain.trim().toLowerCase() : "";
  const headerDomain = (req.header("x-eiah-domain") ?? req.header("x-domain") ?? "").trim().toLowerCase();
  const candidate = queryDomain || headerDomain || "core";
  if (DOMAIN_ALLOWLIST.has(candidate as "core" | "imob")) {
    return candidate as "core" | "imob";
  }
  return "core";
}

function paletteFromTenantId(tenantId: string) {
  const digest = crypto.createHash("sha256").update(tenantId).digest("hex");
  return `#${digest.slice(0, 6)}`;
}

function resolveSessionCookieOptions(req: Request) {
  const name = (process.env.SESSION_COOKIE_NAME ?? "token").trim() || "token";
  const rawSameSite = (process.env.SESSION_COOKIE_SAMESITE ?? "lax").trim().toLowerCase();
  const sameSite = rawSameSite === "strict" || rawSameSite === "none" ? rawSameSite : "lax";
  const maxAgeMs = (() => {
    const raw = process.env.SESSION_COOKIE_MAX_AGE_MS;
    if (!raw) return 1000 * 60 * 60 * 24 * 7;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1000 * 60 * 60 * 24 * 7;
  })();
  const secureFromEnv = process.env.SESSION_COOKIE_SECURE?.trim().toLowerCase();
  const secure =
    secureFromEnv === "true" ||
    secureFromEnv === "1" ||
    (secureFromEnv !== "false" &&
      ((req as Request & { secure?: boolean }).secure ||
        req.header("x-forwarded-proto") === "https"));
  const domain = process.env.SESSION_COOKIE_DOMAIN?.trim() || undefined;

  return {
    name,
    options: {
      httpOnly: true,
      sameSite,
      secure: sameSite === "none" ? true : secure,
      maxAge: maxAgeMs,
      path: "/",
      domain,
    } as const,
  };
}

async function resolveExperienceSnapshot(
  tokenRecord: Pick<SessionTokenRecord, "tenantId" | "workspaceId" | "userId">,
  requestedDomain: "core" | "imob"
) {
  const [realEstatePolicies, realEstateItems, productInstallations] = await Promise.all([
    prismaGlobal.tenantActionPolicy.findMany({
      where: {
        tenantId: tokenRecord.tenantId,
        OR: [{ workspaceId: tokenRecord.workspaceId }, { workspaceId: null }],
        actionName: {
          in: [
            "realestate.apply_adjustment",
            "action.realestate.apply_adjustment",
            "realestate.register_property",
            "realestate.create_contract",
            "realestate.release_commission",
          ],
        },
        allowed: true,
      },
      select: { id: true },
      take: 1,
    }),
    prismaGlobal.marketplaceItem.findMany({
      where: {
        OR: [{ publisherId: tokenRecord.tenantId }, { isPublic: true }],
        name: { contains: "imob", mode: "insensitive" },
      },
      select: { id: true },
      take: 1,
    }),
    prismaGlobal
      .$queryRaw<Array<{ product: string; status: string }>>`
        SELECT product, status
        FROM tenant_product_installations
        WHERE tenant_id = ${tokenRecord.tenantId}
          AND workspace_id = ${tokenRecord.workspaceId}
      `
      .catch(() => []),
  ]);

  const installationStatus = resolveImobInstallationStatus(productInstallations);
  const hasImobInstallation = installationStatus === "active";
  const realEstateCore = hasImobInstallation || realEstatePolicies.length > 0 || realEstateItems.length > 0;
  const entitlements = {
    REAL_ESTATE_CORE: realEstateCore,
    EXPORTS_ADDON: true,
    BILLING_INSIGHTS_ADDON: true,
    IMOB_INSTALLED: hasImobInstallation,
  };
  const activeDomain = requestedDomain;
  const availableDomains: Array<"core" | "imob"> = entitlements.REAL_ESTATE_CORE ? ["core", "imob"] : ["core"];
  const roles = tokenRecord.userId ? ["admin"] : ["service"];
  const experience = resolvePlatformExperience({
    roles,
    tenantId: tokenRecord.tenantId,
    workspaceId: tokenRecord.workspaceId,
    activeDomain,
    availableDomains,
    entitlements,
    productInstallations,
  });

  return {
    installationStatus,
    entitlements,
    activeDomain,
    availableDomains,
    roles,
    productInstallations,
    experience,
  };
}

sessionRouter.post("/session", async (req: Request, res: Response) => {
  const token = resolveTokenFromRequest(req);

  if (!token) {
    return res.status(400).json({
      ok: false,
      error: { code: "TOKEN_MISSING", message: "Missing bearer token for session cookie" },
    });
  }

  const tokenRecord = await findApiToken(token);
  if (!tokenRecord || tokenRecord.revoked) {
    return res.status(401).json({
      ok: false,
      error: { code: "UNAUTHORIZED", message: "Invalid token" },
    });
  }

  if (tokenRecord.expiresAt && tokenRecord.expiresAt.getTime() < Date.now()) {
    return res.status(401).json({
      ok: false,
      error: { code: "TOKEN_EXPIRED", message: "API token expired" },
    });
  }

  const { name, options } = resolveSessionCookieOptions(req);
  res.cookie(name, token, options);

  return res.json({
    ok: true,
    data: {
      tokenId: tokenRecord.tokenId,
      tenantId: tokenRecord.tenantId,
      workspaceId: tokenRecord.workspaceId,
      userId: tokenRecord.userId ?? null,
      cookie: {
        name,
        sameSite: options.sameSite,
        httpOnly: options.httpOnly,
        secure: options.secure,
        maxAgeMs: options.maxAge,
      },
    },
  });
});

sessionRouter.get("/session/context", asyncHandler(async (req: Request, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  const token = resolveTokenFromRequest(req);
  if (!token) {
    return res.status(401).json({
      ok: false,
      error: { code: "UNAUTHORIZED", message: "Missing bearer token" },
    });
  }

  const tokenRecord = await findApiToken(token);
  if (!tokenRecord || tokenRecord.revoked) {
    return res.status(401).json({
      ok: false,
      error: { code: "UNAUTHORIZED", message: "Invalid token" },
    });
  }
  if (tokenRecord.expiresAt && tokenRecord.expiresAt.getTime() < Date.now()) {
    return res.status(401).json({
      ok: false,
      error: { code: "TOKEN_EXPIRED", message: "API token expired" },
    });
  }

  const requestedDomain = resolveRequestedDomain(req);
  const [tenant, workspace, snapshot, preDuimpAccess] = await Promise.all([
    prismaGlobal.tenant.findUnique({
      where: { id: tokenRecord.tenantId },
      select: { id: true, name: true },
    }),
    prismaGlobal.workspace.findUnique({
      where: { id: tokenRecord.workspaceId },
      select: { id: true, name: true },
    }),
    resolveExperienceSnapshot(tokenRecord, requestedDomain),
    resolvePreDuimpAccessFromCanonicalSources({
      identity: {
        tenantId: tokenRecord.tenantId,
        workspaceId: tokenRecord.workspaceId,
        userId: tokenRecord.userId ?? undefined,
        tokenId: tokenRecord.tokenId,
      },
    }),
  ]);

  if (requestedDomain === "imob" && !snapshot.entitlements.REAL_ESTATE_CORE) {
    return sendImobAccessDenied(res, {
      req,
      code: "ENTITLEMENT_MISSING",
      reasonCode:
        snapshot.installationStatus === "inactive" ? "IMOB_INSTALLATION_INACTIVE" : "IMOB_ENTITLEMENT_MISSING",
      capability: "CENTRAL_OPERACIONAL",
      tenantId: tokenRecord.tenantId,
      workspaceId: tokenRecord.workspaceId,
      installationStatus: snapshot.installationStatus,
    });
  }
  const resolverEvent = buildResolverAuditEvent({
    resolverVersion: snapshot.experience.resolverVersion,
    tenantId: tokenRecord.tenantId,
    workspaceId: tokenRecord.workspaceId,
    role: snapshot.experience.roleProfile,
    activeDomain: snapshot.activeDomain,
    installedProducts: snapshot.productInstallations.map((entry) => entry.product),
    surfaceId: mapLandingSurfaceToExperienceSurface(snapshot.experience.landingSurface),
    decisionType: "landing_resolved",
    decisionValue: snapshot.experience.landingPath,
    fallbackMode: snapshot.experience.fallbackMode,
    traceId: req.traceId ?? undefined,
  });

  req.logger?.info(
    {
      event: "experience.resolved",
      resolverAuditEvent: resolverEvent,
      tenantId: tokenRecord.tenantId,
      workspaceId: tokenRecord.workspaceId,
    },
    "experience.resolved"
  );

  return res.json({
    ok: true,
    data: {
      tenantId: tokenRecord.tenantId,
      workspaceId: tokenRecord.workspaceId,
      userId: tokenRecord.userId ?? null,
      activeDomain: snapshot.activeDomain,
      availableDomains: snapshot.availableDomains,
      entitlements: snapshot.entitlements,
      capabilities: {
        preDuimpShadow: preDuimpAccess.capability,
      },
      productInstallations: snapshot.productInstallations.map((entry) => ({
        product: entry.product,
        status: entry.status,
      })),
      verticals: resolveVerticalExperienceRegistry({
        installedProducts: snapshot.productInstallations,
      }),
      roles: snapshot.roles,
      experience: snapshot.experience,
      branding: {
        brandName: tenant?.name ?? tokenRecord.tenantId,
        logoUrl: null,
        primaryColor: paletteFromTenantId(tokenRecord.tenantId),
        workspaceLabel: workspace?.name ?? tokenRecord.workspaceId,
      },
    },
  });
}));

sessionRouter.post("/session/workspace", async (req: Request, res: Response) => {
  const header = req.header("authorization") ?? req.header("Authorization");
  const token = extractBearerToken(header);
  if (!token) {
    return res.status(401).json({
      ok: false,
      error: { code: "UNAUTHORIZED", message: "Missing bearer token" },
    });
  }

  const currentToken = await findApiToken(token);
  if (!currentToken || currentToken.revoked) {
    return res.status(401).json({
      ok: false,
      error: { code: "UNAUTHORIZED", message: "Invalid token" },
    });
  }

  if (currentToken.expiresAt && currentToken.expiresAt.getTime() < Date.now()) {
    return res.status(401).json({
      ok: false,
      error: { code: "TOKEN_EXPIRED", message: "API token expired" },
    });
  }

  const parsed = switchWorkspaceSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_PAYLOAD", details: parsed.error.flatten() },
    });
  }

  const targetWorkspaceId = parsed.data.workspaceId.trim();
  const workspace = await prismaGlobal.workspace.findUnique({
    where: { id: targetWorkspaceId },
    select: { id: true, tenantId: true },
  });

  if (!workspace || workspace.tenantId !== currentToken.tenantId) {
    return res.status(403).json({
      ok: false,
      error: { code: "WORKSPACE_FORBIDDEN", message: "Workspace not available for this tenant" },
    });
  }

  const existing = await prismaGlobal.apiToken.findFirst({
    where: {
      tenantId: currentToken.tenantId,
      workspaceId: targetWorkspaceId,
      userId: currentToken.userId ?? null,
      revoked: false,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      token: true,
      tenantId: true,
      workspaceId: true,
      userId: true,
    },
  });

  const record =
    existing ??
    (await prismaGlobal.apiToken.create({
      data: {
        token: `tok_${crypto.randomBytes(24).toString("hex")}`,
        tenantId: currentToken.tenantId,
        workspaceId: targetWorkspaceId,
        userId: currentToken.userId ?? null,
        description: "Workspace switch token",
      },
      select: {
        id: true,
        token: true,
        tenantId: true,
        workspaceId: true,
        userId: true,
      },
    }));

  const { name, options } = resolveSessionCookieOptions(req);
  res.cookie(name, record.token, options);

  return res.json({
    ok: true,
    data: {
      tokenId: record.id,
      token: record.token,
      tenantId: record.tenantId,
      workspaceId: record.workspaceId,
      userId: record.userId ?? null,
      cookie: {
        name,
        sameSite: options.sameSite,
        httpOnly: options.httpOnly,
        secure: options.secure,
        maxAgeMs: options.maxAge,
      },
    },
  });
});

sessionRouter.delete("/session", (req: Request, res: Response) => {
  const { name, options } = resolveSessionCookieOptions(req);
  res.clearCookie(name, options);
  return res.json({ ok: true });
});

sessionRouter.post("/session/experience/audit", async (req: Request, res: Response) => {
  const token = resolveTokenFromRequest(req);
  if (!token) {
    return res.status(401).json({
      ok: false,
      error: { code: "UNAUTHORIZED", message: "Missing bearer token" },
    });
  }

  const tokenRecord = await findApiToken(token);
  if (!tokenRecord || tokenRecord.revoked) {
    return res.status(401).json({
      ok: false,
      error: { code: "UNAUTHORIZED", message: "Invalid token" },
    });
  }
  if (tokenRecord.expiresAt && tokenRecord.expiresAt.getTime() < Date.now()) {
    return res.status(401).json({
      ok: false,
      error: { code: "TOKEN_EXPIRED", message: "API token expired" },
    });
  }

  const parsed = ExperienceAuditRequestSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_PAYLOAD", details: parsed.error.flatten() },
    });
  }

  const snapshot = await resolveExperienceSnapshot(tokenRecord, resolveRequestedDomain(req));
  const payload = parsed.data;
  const isInvestigationAudit = payload.auditType !== "landing_action_alignment";
  const eventType = isInvestigationAudit
    ? `surface.investigation_mode.${payload.action}`
    : `experience.recommended_action.${payload.action}`;
  const decisionType: ResolverAuditDecisionType = isInvestigationAudit
    ? payload.action === "entered"
      ? "investigation_mode.entered"
      : payload.action === "exited"
        ? "investigation_mode.exited"
        : "investigation_mode.changed"
    : payload.action === "aligned"
      ? "recommended_action.aligned"
      : "recommended_action.diverged";
  const resolverEvent = buildResolverAuditEvent({
    resolverVersion: snapshot.experience.resolverVersion,
    tenantId: tokenRecord.tenantId,
    workspaceId: tokenRecord.workspaceId,
    role: snapshot.experience.roleProfile,
    activeDomain: snapshot.activeDomain,
    installedProducts: snapshot.productInstallations.map((entry) => entry.product),
    surfaceId: payload.surfaceId,
    decisionType,
    decisionValue: isInvestigationAudit
      ? payload.toMode ?? (payload.action === "exited" ? "standard" : "investigation")
      : payload.primaryActionPath ?? payload.landingPath,
    fallbackMode: snapshot.experience.fallbackMode,
    fromMode: isInvestigationAudit ? payload.fromMode : payload.landingPath,
    toMode: isInvestigationAudit ? payload.toMode : payload.primaryActionPath,
    reasonCodes: payload.reasonCodes,
    traceId: req.traceId ?? undefined,
  });
  const frictionKind = mapResolverDecisionToFrictionKind(decisionType);
  const frictionEvent = frictionKind
    ? buildFrictionEvent({
        eventId: crypto.randomUUID(),
        source: "resolver_audit",
        kind: frictionKind,
        severity: decisionType === "recommended_action.diverged" ? "medium" : "low",
        tenantId: tokenRecord.tenantId,
        workspaceId: tokenRecord.workspaceId,
        activeDomain: snapshot.activeDomain,
        surfaceId: payload.surfaceId,
        reasonCode: payload.reasonCodes?.[0],
        traceId: req.traceId ?? undefined,
        summary: isInvestigationAudit
          ? `Investigation mode ${payload.action} on ${payload.surfaceId}`
          : `Recommended action ${payload.action} for ${payload.surfaceId}`,
        occurredAt: new Date().toISOString(),
        metadata: {
          resolverDecisionType: decisionType,
          resolverAuditEvent: resolverEvent,
        },
      })
    : null;

  await recordGuardrailAudit({
    prisma: prismaGlobal,
    tenantId: tokenRecord.tenantId,
    workspaceId: tokenRecord.workspaceId,
    eventType,
    severity: "info",
    message: isInvestigationAudit
      ? `Investigation mode ${payload.action} on ${payload.surfaceId}`
      : `Recommended action ${payload.action} for ${payload.surfaceId}`,
    metadata: {
      frictionEvent,
      resolverAuditEvent: resolverEvent,
      extra: payload.metadata
        ? {
            ...payload.metadata,
            ...(isInvestigationAudit
              ? {}
              : {
                  landingPath: payload.landingPath,
                  primaryActionId: payload.primaryActionId ?? null,
                  primaryActionPath: payload.primaryActionPath ?? null,
                }),
          }
        : isInvestigationAudit
          ? null
          : {
              landingPath: payload.landingPath,
              primaryActionId: payload.primaryActionId ?? null,
              primaryActionPath: payload.primaryActionPath ?? null,
            },
    },
  });

  req.logger?.info(
    {
      event: eventType,
      resolverAuditEvent: resolverEvent,
    },
    eventType
  );

  return res.json({
    ok: true,
    data: {
      eventType,
      traceId: req.traceId ?? null,
      resolverAuditEvent: resolverEvent,
    },
  });
});

export { sessionRouter };
