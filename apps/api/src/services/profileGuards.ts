import { type ReasonCode } from "@eiah/core";

const PROFILE_REASON_CODES = [
  "membership_inactive",
  "workspace_out_of_tenant",
  "cannot_delete_active",
  "cannot_delete_last",
  "not_found",
  "not_owner",
  "invalid_payload",
  "session_write_failed",
  "origin_mismatch",
  "origin_missing",
] as const satisfies readonly ReasonCode[];

export type ProfileReasonCode = (typeof PROFILE_REASON_CODES)[number];

export function isProfileReasonCode(value?: string | null): value is ProfileReasonCode {
  if (!value) return false;
  return (PROFILE_REASON_CODES as readonly string[]).includes(value);
}

export function parseOriginFromReferer(referer?: string | null) {
  if (!referer) return null;
  try {
    const url = new URL(referer);
    return url.origin;
  } catch {
    return null;
  }
}

export function isOriginAllowed(params: {
  allowedOrigins: string[];
  origin?: string | null;
  referer?: string | null;
}) {
  const origin = params.origin?.trim();
  if (origin) {
    return {
      ok: params.allowedOrigins.length === 0 || params.allowedOrigins.includes(origin),
      reason: "origin_mismatch" as const,
    };
  }

  const refererOrigin = parseOriginFromReferer(params.referer);
  if (refererOrigin) {
    return {
      ok: params.allowedOrigins.length === 0 || params.allowedOrigins.includes(refererOrigin),
      reason: "origin_mismatch" as const,
    };
  }

  return { ok: false, reason: "origin_missing" as const };
}

export function shouldCheckOrigin(method: string) {
  const upper = method.toUpperCase();
  return upper === "POST" || upper === "PUT" || upper === "PATCH" || upper === "DELETE";
}
