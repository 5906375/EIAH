import type { Request, Response } from "express";
import { Router } from "express";
import { findApiToken } from "../auth/apiTokenRepository";

const sessionRouter = Router();

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
  const token = bearer ?? resolvedCookieToken ?? bodyToken;

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

sessionRouter.delete("/session", (req: Request, res: Response) => {
  const { name, options } = resolveSessionCookieOptions(req);
  res.clearCookie(name, options);
  return res.json({ ok: true });
});

export { sessionRouter };
