import crypto from "node:crypto";
import type { Request, Response } from "express";
import jwt from "jsonwebtoken";

export type SessionClaims = {
  userId: string;
  tenantId: string;
  workspaceId: string | null;
  activeProfileId: string | null;
  identityType: "password" | "wallet";
};

export function parseCookieHeader(headerValue?: string | null) {
  if (!headerValue) return {};
  const pairs = headerValue.split(";").map((chunk) => chunk.trim()).filter(Boolean);
  const entries = pairs.map((pair) => {
    const index = pair.indexOf("=");
    if (index < 0) return [pair, ""];
    return [pair.slice(0, index), pair.slice(index + 1)];
  });
  return Object.fromEntries(entries);
}

export function resolveSessionCookieOptions(req: { secure?: boolean; header(_name: string): string | undefined }) {
  const name = (process.env.SESSION_COOKIE_NAME ?? "token").trim() || "token";
  const rawSameSite = (process.env.SESSION_COOKIE_SAMESITE ?? "lax").trim().toLowerCase();
  const sameSite = rawSameSite === "strict" || rawSameSite === "none" ? rawSameSite : "lax";
  const maxAgeMs = (() => {
    const raw = process.env.SESSION_COOKIE_MAX_AGE_MS;
    if (!raw) return 1000 * 60 * 60;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1000 * 60 * 60;
  })();
  const secureFromEnv = process.env.SESSION_COOKIE_SECURE?.trim().toLowerCase();
  const secure =
    secureFromEnv === "true" ||
    secureFromEnv === "1" ||
    (secureFromEnv !== "false" &&
      ((req as { secure?: boolean }).secure || req.header("x-forwarded-proto") === "https"));
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

export function signSession(claims: SessionClaims) {
  const ttlSeconds = Number(process.env.AUTH_JWT_TTL_SECONDS ?? "3600");
  const expiresIn = Number.isFinite(ttlSeconds) && ttlSeconds > 0 ? ttlSeconds : 3600;
  return jwt.sign(claims, resolveJwtSecret(), { expiresIn });
}

export function verifySession(token: string): SessionClaims | null {
  try {
    return jwt.verify(token, resolveJwtSecret()) as SessionClaims;
  } catch {
    return null;
  }
}

export function issueSessionCookie(
  req: Request,
  res: Response,
  params: SessionClaims
) {
  const token = signSession(params);
  const { name, options } = resolveSessionCookieOptions(req);
  res.cookie(name, token, options);
}
