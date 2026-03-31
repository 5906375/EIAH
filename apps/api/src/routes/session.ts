import type { Request, Response } from "express";
import { Router } from "express";
import crypto from "node:crypto";
import process from "node:process";
import { z } from "zod";
import { prismaGlobal } from "@repo/db";
import { findApiToken } from "../auth/apiTokenRepository";
import {
  resolveImobInstallationStatus,
  sendImobAccessDenied,
} from "../services/imob/imobAccessGate";

const sessionRouter = Router();
const DOMAIN_ALLOWLIST = new Set(["core", "imob"] as const);
const switchWorkspaceSchema = z.object({
  workspaceId: z.string().min(1),
});

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

sessionRouter.get("/session/context", async (req: Request, res: Response) => {
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
  const [tenant, workspace, realEstatePolicies, realEstateItems, productInstallations] = await Promise.all([
    prismaGlobal.tenant.findUnique({
      where: { id: tokenRecord.tenantId },
      select: { id: true, name: true },
    }),
    prismaGlobal.workspace.findUnique({
      where: { id: tokenRecord.workspaceId },
      select: { id: true, name: true },
    }),
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

  if (requestedDomain === "imob" && !entitlements.REAL_ESTATE_CORE) {
    return sendImobAccessDenied(res, {
      req,
      code: "ENTITLEMENT_MISSING",
      reasonCode:
        installationStatus === "inactive" ? "IMOB_INSTALLATION_INACTIVE" : "IMOB_ENTITLEMENT_MISSING",
      capability: "CENTRAL_OPERACIONAL",
      tenantId: tokenRecord.tenantId,
      workspaceId: tokenRecord.workspaceId,
      installationStatus,
    });
  }

  const activeDomain = requestedDomain;
  const availableDomains: Array<"core" | "imob"> = entitlements.REAL_ESTATE_CORE ? ["core", "imob"] : ["core"];
  const roles = tokenRecord.userId ? ["admin"] : ["service"];

  return res.json({
    ok: true,
    data: {
      tenantId: tokenRecord.tenantId,
      workspaceId: tokenRecord.workspaceId,
      userId: tokenRecord.userId ?? null,
      activeDomain,
      availableDomains,
      entitlements,
      productInstallations: productInstallations.map((entry) => ({
        product: entry.product,
        status: entry.status,
      })),
      roles,
      branding: {
        brandName: tenant?.name ?? tokenRecord.tenantId,
        logoUrl: null,
        primaryColor: paletteFromTenantId(tokenRecord.tenantId),
        workspaceLabel: workspace?.name ?? tokenRecord.workspaceId,
      },
    },
  });
});

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

export { sessionRouter };
