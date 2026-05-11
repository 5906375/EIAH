import { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";
import { bindLogger } from "@eiah/core/logging/logger";
import { recordGuardrailLedger } from "@eiah/core/services/guardrailLedgerStore";
import { findApiToken, type AuthTokenContext } from "../auth/apiTokenRepository";
import { checkDelegationPolicy } from "./checkDelegationPolicy";

import { getPrismaForTenant, prismaGlobal, PrismaClient } from "@repo/db";

export type AuthContext = {
  tokenId: string;
  tenantId: string;
  workspaceId: string;
  userId?: string;
};

export type TenantAwareRequest = Request & {
  authContext?: AuthContext;
  prisma?: PrismaClient;
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

function isSseRequest(req: Request) {
  const accept = req.header("accept") ?? req.header("Accept") ?? "";
  return req.path.endsWith("/stream") || accept.includes("text/event-stream");
}

export async function enforceTenant(
  req: TenantAwareRequest,
  res: Response,
  next: NextFunction
) {
  let tokenRecord: AuthTokenContext | null = null;

  try {
    const header = req.header("authorization") ?? req.header("Authorization");
    let token = extractBearerToken(header);

    if (!token && isSseRequest(req)) {
      const cookieBag =
        typeof req.cookies === "object" && req.cookies !== null
          ? (req.cookies as Record<string, string>)
          : parseCookieHeader(req.header("cookie"));
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

    req.authContext = {
      tokenId: tokenRecord.tokenId,
      tenantId: tokenRecord.tenantId,
      workspaceId: tokenRecord.workspaceId,
      userId: tokenRecord.userId,
    };

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
      tokenRecord.tenantId,
      tokenRecord.workspaceId
    );
    const requestPrisma = req.prisma;
    const currentResponseMaxListeners =
      typeof (res as unknown as { getMaxListeners?: () => number }).getMaxListeners === "function"
        ? (res as unknown as { getMaxListeners: () => number }).getMaxListeners()
        : 10;
    if (Number.isFinite(currentResponseMaxListeners) && currentResponseMaxListeners > 0) {
      res.setMaxListeners(currentResponseMaxListeners + 2);
    }
    let prismaClosed = false;
    const closeRequestPrisma = () => {
      if (prismaClosed) return;
      prismaClosed = true;
      void requestPrisma.$disconnect().catch((disconnectError) => {
        req.logger?.warn({ error: disconnectError }, "auth.enforce.prisma_disconnect_failed");
      });
    };
    res.once("finish", closeRequestPrisma);
    res.once("close", closeRequestPrisma);

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
