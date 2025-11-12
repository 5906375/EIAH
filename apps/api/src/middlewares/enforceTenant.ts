import { Request, Response, NextFunction } from "express";
import { bindLogger } from "@eiah/core";
import { findApiToken } from "../auth/apiTokenRepository";

export type AuthContext = {
  tokenId: string;
  tenantId: string;
  workspaceId: string;
  userId?: string;
};

export type TenantAwareRequest = Request & { authContext?: AuthContext };

function extractBearerToken(headerValue?: string | null) {
  if (!headerValue) return null;
  const trimmed = headerValue.trim();
  if (!trimmed.toLowerCase().startsWith("bearer ")) return null;
  const token = trimmed.slice(7).trim();
  return token.length > 0 ? token : null;
}

export async function enforceTenant(
  req: TenantAwareRequest,
  res: Response,
  next: NextFunction
) {
  const header = req.header("authorization") ?? req.header("Authorization");
  const token = extractBearerToken(header);

  if (!token) {
    req.logger?.warn(
      {
        event: "auth.missing_bearer",
      },
      "request.unauthorized"
    );
    return res.status(401).json({
      ok: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Missing bearer token",
      },
    });
  }

  const tokenRecord = await findApiToken(token);
  if (!tokenRecord || tokenRecord.revoked) {
    req.logger?.warn(
      {
        event: "auth.invalid_token",
      },
      "request.unauthorized"
    );
    return res.status(401).json({
      ok: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Invalid token",
      },
    });
  }

  if (tokenRecord.expiresAt && tokenRecord.expiresAt.getTime() < Date.now()) {
    req.logger?.warn(
      {
        event: "auth.token_expired",
      },
      "request.unauthorized"
    );
    return res.status(401).json({
      ok: false,
      error: {
        code: "TOKEN_EXPIRED",
        message: "API token expired",
      },
    });
  }

  req.authContext = {
    tokenId: tokenRecord.tokenId,
    tenantId: tokenRecord.tenantId,
    workspaceId: tokenRecord.workspaceId,
    userId: tokenRecord.userId,
  };
  if (req.logger) {
    req.logger = bindLogger(req.logger, {
      tenantId: tokenRecord.tenantId,
      workspaceId: tokenRecord.workspaceId,
      userId: tokenRecord.userId,
      tokenId: tokenRecord.tokenId,
    });
  }

  return next();
}
