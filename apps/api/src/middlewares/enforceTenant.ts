import { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";
import { bindLogger, normalizeReason, recordGuardrailLedger } from "@eiah/core";
import { findApiToken, type AuthTokenContext } from "../auth/apiTokenRepository";
import { checkDelegationPolicy } from "./checkDelegationPolicy";
import type { MembershipStatus, TenantRole } from "../services/tenantGovernance";
import { resolveMembershipReason } from "../services/membershipStatus";
import jwt from "jsonwebtoken";

import { getPrismaForTenant, prismaGlobal } from "@repo/db";
import type { PrismaClient } from "@repo/db/client";
import {
  getActiveInstallationsHint,
  type ActiveInstallationHint,
} from "../services/activeInstallationsCache";

function isGlobalAdminProfileRole(raw?: string | null) {
  const normalized = (raw ?? "").trim().toLowerCase();
  return (
    normalized === "global_admin" ||
    normalized === "eiah_admin" ||
    normalized === "eiah admin" ||
    normalized === "platform_admin" ||
    normalized === "super_admin" ||
    normalized === "super admin"
  );
}

function resolveMasterDevAutoProfileEmails() {
  const defaults =
    (process.env.NODE_ENV ?? "development").toLowerCase() === "production"
      ? ""
      : "mmerlon.adv@gmail.com";
  const raw = process.env.MASTER_DEV_AUTO_PROFILE_EMAILS ?? defaults;
  return raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function isMasterDevUserEmail(email?: string | null) {
  const normalized = (email ?? "").trim().toLowerCase();
  if (!normalized) return false;
  return resolveMasterDevAutoProfileEmails().includes(normalized);
}

export type AuthContext = {
  tokenId: string;
  tenantId: string;
  workspaceId: string;
  userId?: string;
  identityType?: "password" | "wallet" | "api_token";
  isGlobalAdmin?: boolean;
  activeProfileId?: string | null;
  originalTenantId?: string;
  originalWorkspaceId?: string;
  tenantRole?: TenantRole;
  membershipStatus?: MembershipStatus;
  customRoleId?: string | null;
  overrideActive?: boolean;
  overrideReason?: string | null;
  overrideTrusted?: boolean;
};

export type TenantAwareRequest = Request & {
  authContext?: AuthContext;
  prisma?: PrismaClient;
  activeInstallations?: ActiveInstallationHint[];
  active_installations?: ActiveInstallationHint[];
  delegationPolicy?: {
    id: string;
    delegatorId: string;
    delegateeId: string;
    marketplaceId?: string | null;
    scope: string;
    trustMin: number;
    validUntil: Date;
    policyHash: string;
    signatureHash: string;
    createdAt: Date;
  };
};

async function hydrateActiveInstallationsHint(req: TenantAwareRequest) {
  if (!req.authContext || !req.prisma) return;
  try {
    const installations = await getActiveInstallationsHint({
      prisma: req.prisma,
      tenantId: req.authContext.tenantId,
      workspaceId: req.authContext.workspaceId,
      logger: req.logger,
    });
    req.activeInstallations = installations;
    req.active_installations = installations;
  } catch (error) {
    req.logger?.warn?.({ error }, "active_installations.hydrate_failed");
    req.activeInstallations = [];
    req.active_installations = [];
  }
}

function extractBearerToken(headerValue?: string | null) {
  if (!headerValue) return null;
  const trimmed = headerValue.trim();
  if (!trimmed.toLowerCase().startsWith("bearer ")) return null;
  const token = trimmed.slice(7).trim();
  return token.length > 0 ? token : null;
}

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

type SessionClaims = {
  userId: string;
  tenantId: string;
  workspaceId: string | null;
  activeProfileId: string | null;
  identityType?: "password" | "wallet";
};

let cachedJwtSecret: string | null = null;
function resolveJwtSecret() {
  if (cachedJwtSecret) return cachedJwtSecret;
  const secret =
    process.env.AUTH_JWT_SECRET ??
    process.env.GLOBAL_ADMIN_TRUST_HMAC_SECRET ??
    "";
  cachedJwtSecret = secret || `dev-${crypto.randomUUID()}`;
  return cachedJwtSecret;
}

function verifySession(token: string): SessionClaims | null {
  try {
    return jwt.verify(token, resolveJwtSecret()) as SessionClaims;
  } catch {
    return null;
  }
}

function isSseRequest(req: Request) {
  const accept = req.header("accept") ?? req.header("Accept") ?? "";
  return req.path.endsWith("/stream") || accept.includes("text/event-stream");
}

function parseAllowList(raw?: string | null) {
  if (!raw) return [];
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function getHeaderValue(req: Request, name: string) {
  return req.header(name) ?? req.header(name.toLowerCase());
}

type OverrideValidation = {
  ok: boolean;
  reason?: string;
  ttl?: number;
};

function parseOverrideHeader(raw?: string | null) {
  if (!raw) return null;
  const normalized = raw.replace(/;/g, "&");
  const params = new URLSearchParams(normalized);
  const ts = params.get("ts");
  const ttl = params.get("ttl");
  const sig = params.get("sig");
  const reason = params.get("reason");
  return { ts, ttl, sig, reason };
}

function hmacPayload(params: { ts: string; ttl: string; reason?: string | null }) {
  const base = `ts=${params.ts}&ttl=${params.ttl}`;
  if (params.reason) return `${base}&reason=${params.reason}`;
  return base;
}

function validateOverrideHmac(rawHeader: string | null | undefined): OverrideValidation {
  const parsed = parseOverrideHeader(rawHeader);
  if (!parsed || !parsed.ts || !parsed.ttl || !parsed.sig) {
    return { ok: false, reason: "missing_header" };
  }

  const ts = Number(parsed.ts);
  const ttl = Number(parsed.ttl);
  if (!Number.isFinite(ts) || !Number.isFinite(ttl) || ts <= 0 || ttl <= 0) {
    return { ok: false, reason: "invalid_ts_ttl" };
  }

  const maxTtl = Number(process.env.GLOBAL_ADMIN_OVERRIDE_MAX_TTL_SECONDS ?? "120");
  const skew = Number(process.env.GLOBAL_ADMIN_OVERRIDE_CLOCK_SKEW_SECONDS ?? "30");
  if (Number.isFinite(maxTtl) && ttl > maxTtl) {
    return { ok: false, reason: "ttl_exceeds_max" };
  }

  const now = Math.floor(Date.now() / 1000);
  if (now < ts - skew || now > ts + ttl + skew) {
    return { ok: false, reason: "expired_or_future" };
  }

  const secrets = parseAllowList(process.env.GLOBAL_ADMIN_TRUST_HMAC_SECRETS);
  const primary = process.env.GLOBAL_ADMIN_TRUST_HMAC_SECRET;
  const candidates = [
    ...(primary ? [primary] : []),
    ...secrets,
  ].filter(Boolean);
  if (candidates.length === 0) {
    return { ok: false, reason: "missing_secret" };
  }

  const payload = hmacPayload({ ts: parsed.ts, ttl: parsed.ttl, reason: parsed.reason });
  const sigBytes = Buffer.from(parsed.sig, "hex");
  for (const secret of candidates) {
    const expected = crypto.createHmac("sha256", secret).update(payload).digest();
    if (sigBytes.length === expected.length && crypto.timingSafeEqual(sigBytes, expected)) {
      return { ok: true, ttl };
    }
  }

  return { ok: false, reason: "invalid_signature" };
}

export async function enforceTenant(
  req: TenantAwareRequest,
  res: Response,
  next: NextFunction
) {
  let tokenRecord: AuthTokenContext | null = null;
  let sessionClaims: SessionClaims | null = null;

  try {
    const cookieBag =
      typeof req.cookies === "object" && req.cookies !== null
        ? (req.cookies as Record<string, string>)
        : parseCookieHeader(req.header("cookie"));
    const sessionCookieName = (process.env.SESSION_COOKIE_NAME ?? "token").trim() || "token";
    const sessionToken = cookieBag[sessionCookieName];
    if (sessionToken && typeof sessionToken === "string") {
      sessionClaims = verifySession(sessionToken);
    }

    if (sessionClaims) {
      const claims = sessionClaims;
      const user = await prismaGlobal.user.findUnique({
        where: { id: claims.userId },
      });
      if (!user) {
        req.logger?.warn({ event: "auth.session_user_missing" }, "request.unauthorized");
        return res.status(401).json({
          ok: false,
          error: { code: "UNAUTHORIZED", message: "Invalid session" },
        });
      }

      const profiles = await prismaGlobal.userProfile.findMany({
        where: { userId: user.id },
        orderBy: { updatedAt: "desc" },
      });
      const activeProfile =
        (claims.activeProfileId &&
          profiles.find((profile) => profile.id === claims.activeProfileId)) ||
        (profiles.length === 1 ? profiles[0] : null);

      const effectiveTenantId = activeProfile?.tenantId ?? claims.tenantId;
      let effectiveWorkspaceId =
        activeProfile?.workspaceId ?? claims.workspaceId ?? "";
      if (!effectiveWorkspaceId && effectiveTenantId) {
        const fallback = await prismaGlobal.workspace.findFirst({
          where: { tenantId: effectiveTenantId },
          orderBy: { createdAt: "asc" },
          select: { id: true },
        });
        effectiveWorkspaceId = fallback?.id ?? "";
      }

      req.authContext = {
        tokenId: `session:${user.id}`,
        tenantId: effectiveTenantId,
        workspaceId: effectiveWorkspaceId,
        userId: user.id,
        identityType: claims.identityType ?? "password",
        activeProfileId: activeProfile?.id ?? null,
        isGlobalAdmin:
          isGlobalAdminProfileRole(activeProfile?.role) || isMasterDevUserEmail(user.email),
        originalTenantId: effectiveTenantId,
        originalWorkspaceId: effectiveWorkspaceId,
        overrideActive: false,
        overrideReason: null,
      };

      req.prisma = getPrismaForTenant(effectiveTenantId, effectiveWorkspaceId) as PrismaClient;
      if (req.authContext.isGlobalAdmin) {
        req.authContext.tenantRole = "TENANT_ADMIN";
        req.authContext.membershipStatus = "ACTIVE";
      } else if (req.authContext.userId) {
        const membership = await prismaGlobal.tenantMembership.findUnique({
          where: {
            tenantId_userId: {
              tenantId: req.authContext.tenantId,
              userId: req.authContext.userId,
            },
          },
          select: { role: true, status: true, customRoleId: true },
        });
        if (membership) {
          req.authContext.tenantRole = membership.role as TenantRole;
          req.authContext.membershipStatus = membership.status as MembershipStatus;
          req.authContext.customRoleId = membership.customRoleId ?? null;
        }
      }

      if (!req.authContext.isGlobalAdmin) {
        const status = req.authContext.membershipStatus;
        if (!status || status !== "ACTIVE") {
          const reason = resolveMembershipReason(status);
          return res.status(403).json({
            ok: false,
            error: {
              code: "TENANT_MEMBERSHIP_INACTIVE",
              reason: normalizeReason(reason),
              message: "Tenant membership inactive",
            },
          });
        }
      }

      await hydrateActiveInstallationsHint(req);
      const delegationOk = await checkDelegationPolicy(req, res);
      if (!delegationOk) {
        return;
      }

      return next();
    }

    const header = req.header("authorization") ?? req.header("Authorization");
    let token = extractBearerToken(header);

    if (!token && isSseRequest(req)) {
      const cookieToken = cookieBag.token ?? cookieBag.access_token ?? cookieBag.api_token;
      token = typeof cookieToken === "string" && cookieToken.trim() ? cookieToken.trim() : null;
    }

    if (!token) {
      req.logger?.warn({ event: "auth.missing_bearer" }, "request.unauthorized");
      return res.status(401).json({
        ok: false,
        error: { code: "UNAUTHORIZED", message: "Missing bearer token" },
      });
    }

    tokenRecord = await findApiToken(token);
    if (!tokenRecord || tokenRecord.revoked) {
      req.logger?.warn({ event: "auth.invalid_token" }, "request.unauthorized");
      return res.status(401).json({
        ok: false,
        error: { code: "UNAUTHORIZED", message: "Invalid token" },
      });
    }

    if (tokenRecord.expiresAt && tokenRecord.expiresAt.getTime() < Date.now()) {
      req.logger?.warn({ event: "auth.token_expired" }, "request.unauthorized");
      return res.status(401).json({
        ok: false,
        error: { code: "TOKEN_EXPIRED", message: "API token expired" },
      });
    }

    const globalTokenIds = parseAllowList(process.env.GLOBAL_ADMIN_TOKEN_IDS);
    const globalTokens = parseAllowList(process.env.GLOBAL_ADMIN_TOKENS);
    const isGlobalAdmin =
      globalTokenIds.includes(tokenRecord.tokenId) || globalTokens.includes(token);

    const overrideHeader = getHeaderValue(req, "x-eiah-admin-override");
    const overrideCheck = validateOverrideHmac(overrideHeader);
    const trustedOk = overrideCheck.ok;

    const allowTenantSwitch =
      isGlobalAdmin &&
      trustedOk &&
      process.env.GLOBAL_ADMIN_ALLOW_TENANT_SWITCH === "true";
    const requestedTenant = allowTenantSwitch
      ? getHeaderValue(req, "x-eiah-tenant") ?? getHeaderValue(req, "x-tenant-id")
      : null;
    const requestedWorkspace =
      isGlobalAdmin && trustedOk
        ? getHeaderValue(req, "x-eiah-workspace") ?? getHeaderValue(req, "x-workspace-id")
        : null;

    const effectiveTenantId = (requestedTenant ?? tokenRecord.tenantId).toString();
    const effectiveWorkspaceId = (requestedWorkspace ?? tokenRecord.workspaceId).toString();
    const overrideActive =
      effectiveTenantId !== tokenRecord.tenantId ||
      effectiveWorkspaceId !== tokenRecord.workspaceId;
    const overrideReason =
      overrideActive
        ? parseOverrideHeader(overrideHeader)?.reason ??
          getHeaderValue(req, "x-admin-override-reason") ??
          null
        : null;

    req.authContext = {
      tokenId: tokenRecord.tokenId,
      tenantId: effectiveTenantId,
      workspaceId: effectiveWorkspaceId,
      userId: tokenRecord.userId,
      identityType: "api_token",
      isGlobalAdmin,
      originalTenantId: tokenRecord.tenantId,
      originalWorkspaceId: tokenRecord.workspaceId,
      overrideActive,
      overrideReason,
      overrideTrusted: trustedOk,
    };

    if (overrideActive && !["GET", "HEAD", "OPTIONS"].includes(req.method.toUpperCase())) {
      return res.status(403).json({
        ok: false,
        error: { code: "FORBIDDEN", message: "Global admin override is read-only" },
      });
    }

    if (process.env.NODE_ENV !== "production" && req.header("x-force-enforce-error") === "1") {
      throw new Error("Forced enforceTenant error for guardrail validation");
    }

    if (req.logger) {
      req.logger = bindLogger(req.logger, {
        tenantId: tokenRecord.tenantId,
        workspaceId: tokenRecord.workspaceId,
        userId: tokenRecord.userId,
        tokenId: tokenRecord.tokenId,
      });
    }

    /**
    * ✅ Substituição: client Prisma específico para este tenant/workspace.
    * Aplica tenantGuard internamente (Prisma v7+ via $extends)
    */
    req.prisma = getPrismaForTenant(
      req.authContext.tenantId,
      req.authContext.workspaceId
    ) as PrismaClient;
    const prisma = req.prisma;
    if (!prisma) {
      throw new Error("Prisma tenant client unavailable");
    }

    if (req.authContext.isGlobalAdmin) {
      req.authContext.tenantRole = "TENANT_ADMIN";
      req.authContext.membershipStatus = "ACTIVE";
    } else if (req.authContext.userId) {
      try {
        const membership = await prisma.tenantMembership.findUnique({
          where: {
            tenantId_userId: {
              tenantId: req.authContext.tenantId,
              userId: req.authContext.userId,
            },
          },
          select: { role: true, status: true, customRoleId: true },
        });
        if (membership) {
          req.authContext.tenantRole = membership.role as TenantRole;
          req.authContext.membershipStatus = membership.status as MembershipStatus;
          req.authContext.customRoleId = membership.customRoleId ?? null;
        }
      } catch (membershipError) {
        req.logger?.warn({ err: membershipError }, "tenant.membership.lookup_failed");
      }
    }

    if (!req.authContext.isGlobalAdmin) {
      const status = req.authContext.membershipStatus;
      if (!status || status !== "ACTIVE") {
        const reason = resolveMembershipReason(status);
        return res.status(403).json({
          ok: false,
          error: {
            code: "TENANT_MEMBERSHIP_INACTIVE",
            reason: normalizeReason(reason),
            message: "Tenant membership inactive",
          },
        });
      }
    }

    await hydrateActiveInstallationsHint(req);
    if (overrideActive) {
      try {
        const prisma = (req.prisma ?? prismaGlobal) as PrismaClient;
        await recordGuardrailLedger({
          prisma,
          tenantId: req.authContext.tenantId,
          actionType: "admin.override.context",
          idempotencyKey: req.authContext.tokenId,
          usageCount: 1,
          payload: {
            originalTenantId: tokenRecord.tenantId,
            originalWorkspaceId: tokenRecord.workspaceId,
            effectiveTenantId: req.authContext.tenantId,
            effectiveWorkspaceId: req.authContext.workspaceId,
            reason: overrideReason,
            ttl:
              Number.isFinite(overrideCheck.ttl) && overrideCheck.ttl
                ? String(overrideCheck.ttl)
                : getHeaderValue(req, "x-admin-override-ttl") ?? null,
            overrideTrusted: trustedOk,
            overrideValidation: overrideCheck.reason ?? null,
            method: req.method,
            path: req.path,
          },
        });
      } catch (auditError) {
        req.logger?.warn({ err: auditError }, "admin.override.audit_failed");
      }
    }

    const delegationOk = await checkDelegationPolicy(req, res);
    if (!delegationOk) {
      return;
    }

    return next();
  } catch (error) {
    const tenantId = req.authContext?.tenantId ?? tokenRecord?.tenantId ?? null;
    if (tenantId) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      const txId = crypto.randomUUID();
      const criticalHash = crypto
        .createHash("sha256")
        .update(
          JSON.stringify({
            event: "auth.enforce.error",
            message: errorMessage,
            stack: errorStack,
            method: req.method,
            path: req.path,
            timestamp: new Date().toISOString(),
          })
        )
        .digest("hex");
      try {
        await recordGuardrailLedger({
          prisma: (req.prisma ?? prismaGlobal) as PrismaClient,
          tenantId,
          actionType: "auth.enforce.error",
          idempotencyKey: req.authContext?.tokenId ?? tokenRecord?.tokenId ?? null,
          usageCount: 1,
          isSystemFault: true,
          txId,
          criticalHash,
        });
      } catch (ledgerError) {
        req.logger?.error({ error: ledgerError }, "guardrailLedger.write_failed");
      }
    }

    req.logger?.error({ error }, "auth.enforce.failure");
    if (!res.headersSent) {
      return res.status(500).json({
        ok: false,
        error: { code: "INTERNAL_GOVERNANCE_FAULT", message: "Authentication infrastructure failure" },
      });
    }
  }
}
