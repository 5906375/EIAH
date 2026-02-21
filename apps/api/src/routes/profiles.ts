import { Router } from "express";
import { z } from "zod";
import { Prisma, prismaGlobal } from "@repo/db";
import { incrCriticalCounter, normalizeReason, type ReasonCode } from "@eiah/core";
import { parseCookieHeader, verifySession, issueSessionCookie } from "../auth/session";
import { isOriginAllowed, shouldCheckOrigin } from "../services/profileGuards";
import { recordAuditEvent } from "../audit/auditLogger";

export const profilesRouter = Router();

const profileSchema = z.object({
  fullName: z.string().max(120).optional().nullable(),
  email: z.string().email().max(200).optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  cep: z.string().max(20).optional().nullable(),
  company: z.string().max(120).optional().nullable(),
  role: z.string().max(120).optional().nullable(),
  website: z.string().max(200).optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  country: z.string().max(120).optional().nullable(),
  tenantId: z.string().max(120).optional().nullable(),
  workspaceId: z.string().max(120).optional().nullable(),
  token: z.string().max(512).optional().nullable(),
});

type ProfilePayload = z.infer<typeof profileSchema>;
type ProfileOperation = "create" | "update" | "delete" | "activate";
type ProfileResult = "ok" | "deny" | "error";

const allowedOrigins = (process.env.APP_ORIGIN ?? process.env.CORS_ORIGIN ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const isProd = (process.env.NODE_ENV ?? "development").toLowerCase() === "production";

function normalizeOptional(value?: string | null) {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveGroupId(req: { header(_name: string): string | undefined }) {
  const raw = req.header("x-profile-group") || req.header("x-eiah-profile-group");
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

function resolveRequestId(req: { header(_name: string): string | undefined }) {
  return (
    req.header("x-trace-id") ??
    req.header("x-request-id") ??
    req.header("x-correlation-id") ??
    undefined
  );
}

function getSessionToken(req: { header(_name: string): string | undefined }) {
  const cookieBag = parseCookieHeader(req.header("cookie"));
  const name = (process.env.SESSION_COOKIE_NAME ?? "token").trim() || "token";
  const token = cookieBag[name];
  return typeof token === "string" && token.trim() ? token : null;
}

async function resolveSessionUser(req: { header(_name: string): string | undefined }) {
  const token = getSessionToken(req);
  if (!token) return { claims: null, user: null };
  const claims = verifySession(token);
  if (!claims) return { claims: null, user: null };
  const user = await prismaGlobal.user.findUnique({
    where: { id: claims.userId },
  });
  if (!user) return { claims: null, user: null };
  return { claims, user };
}

async function ensureTenantAccess(userId: string, tenantId: string) {
  const membership = await prismaGlobal.tenantMembership.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
    select: { status: true },
  });
  return membership?.status === "ACTIVE";
}

async function ensureWorkspaceInTenant(workspaceId: string, tenantId: string) {
  const workspace = await prismaGlobal.workspace.findUnique({
    where: { id: workspaceId },
    select: { tenantId: true },
  });
  return workspace?.tenantId === tenantId;
}

async function recordProfileAudit(params: {
  op: ProfileOperation;
  result: ProfileResult;
  reason?: ReasonCode | null;
  tenantId?: string | null;
  workspaceId?: string | null;
  profileId?: string | null;
  userId?: string | null;
  requestId?: string;
}) {
  if (!params.tenantId) return;
  await recordAuditEvent({
    prisma: prismaGlobal,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId ?? null,
    runId: null,
    eventType: `profile.${params.op}`,
    severity: params.result === "ok" ? "info" : params.result === "deny" ? "warn" : "error",
    message: `profile.${params.op}.${params.result}`,
    metadata: {
      result: params.result,
      reason: params.reason ?? null,
      profileId: params.profileId ?? null,
      userId: params.userId ?? null,
      requestId: params.requestId ?? null,
    },
  });
}

function recordProfileMetric(op: ProfileOperation, result: ProfileResult, reason?: string | null) {
  const labels: Record<string, string> = { op, result };
  if (result !== "ok" && reason) {
    labels.reason = normalizeReason(reason);
  }
  void incrCriticalCounter("profile_operations_total", labels);
}

function logProfileEvent(
  req: any,
  params: {
    op: ProfileOperation;
    result: ProfileResult;
    reason?: ReasonCode | null;
    profileId?: string | null;
    tenantId?: string | null;
    workspaceId?: string | null;
    userId?: string | null;
  }
) {
  const logger = req?.logger;
  if (!logger) return;
  const payload = {
    event: "profile.op",
    op: params.op,
    result: params.result,
    reason: params.reason ?? undefined,
    profileId: params.profileId ?? undefined,
    tenantId: params.tenantId ?? undefined,
    workspaceId: params.workspaceId ?? undefined,
    userId: params.userId ?? undefined,
  };
  if (params.result === "ok") {
    logger.info(payload, "profile.operation");
  } else if (params.result === "deny") {
    logger.warn(payload, "profile.operation");
  } else {
    logger.error(payload, "profile.operation");
  }
}

function respondProfileError(
  req: any,
  res: any,
  params: {
    status: number;
    code: string;
    message: string;
    op: ProfileOperation;
    result: ProfileResult;
    reason?: ReasonCode | null;
    tenantId?: string | null;
    workspaceId?: string | null;
    profileId?: string | null;
    userId?: string | null;
  }
) {
  const requestId = resolveRequestId(req);
  const normalizedReason: ReasonCode | null =
    params.reason ? normalizeReason(params.reason) : null;
  recordProfileMetric(params.op, params.result, normalizedReason);
  logProfileEvent(req, { ...params, reason: normalizedReason ?? undefined });
  void recordProfileAudit({
    op: params.op,
    result: params.result,
    reason: normalizedReason ?? null,
    tenantId: params.tenantId ?? null,
    workspaceId: params.workspaceId ?? null,
    profileId: params.profileId ?? null,
    userId: params.userId ?? null,
    requestId,
  });
  return res.status(params.status).json({
    ok: false,
    error: {
      code: params.code,
      reason: normalizedReason ?? undefined,
      message: params.message,
    },
  });
}

function buildData(payload: ProfilePayload) {
  return {
    fullName: normalizeOptional(payload.fullName),
    email: normalizeOptional(payload.email),
    phone: normalizeOptional(payload.phone),
    cep: normalizeOptional(payload.cep),
    company: normalizeOptional(payload.company),
    role: normalizeOptional(payload.role),
    website: normalizeOptional(payload.website),
    city: normalizeOptional(payload.city),
    country: normalizeOptional(payload.country),
    tenantId: normalizeOptional(payload.tenantId),
    workspaceId: normalizeOptional(payload.workspaceId),
    token: normalizeOptional(payload.token),
  };
}

type MembershipRole = "TENANT_ADMIN" | "TENANT_OPERATOR" | "TENANT_VIEWER";

function resolveMembershipRoleFromProfile(role?: string | null): MembershipRole | null {
  const value = (role ?? "").trim().toLowerCase();
  if (!value) return null;
  if (value.includes("viewer")) return "TENANT_VIEWER";
  if (value.includes("operator")) return "TENANT_OPERATOR";
  if (value.includes("admin") || value.includes("eiah") || value.includes("global")) {
    return "TENANT_ADMIN";
  }
  return null;
}

async function syncTenantMembershipFromProfile(params: {
  prisma: Prisma.TransactionClient;
  userId: string;
  tenantId: string;
  profileRole?: string | null;
}) {
  const role = resolveMembershipRoleFromProfile(params.profileRole);
  if (!role) return;

  await params.prisma.tenantMembership.upsert({
    where: {
      tenantId_userId: {
        tenantId: params.tenantId,
        userId: params.userId,
      },
    },
    create: {
      tenantId: params.tenantId,
      userId: params.userId,
      role,
      status: "ACTIVE",
    },
    update: {
      role,
      status: "ACTIVE",
    },
  });
}

profilesRouter.use((req, res, next) => {
  if (!shouldCheckOrigin(req.method)) return next();

  const verdict = isOriginAllowed({
    allowedOrigins,
    origin: req.header("origin"),
    referer: req.header("referer"),
  });

  if (verdict.ok) return next();

  if (!isProd && verdict.reason === "origin_missing") {
    req.logger?.warn(
      { event: "profile.origin.missing" },
      "profile.origin.warning"
    );
    return next();
  }

  const op: ProfileOperation = req.path.endsWith("/activate")
    ? "activate"
    : req.method.toUpperCase() === "POST"
    ? "create"
    : req.method.toUpperCase() === "PUT" || req.method.toUpperCase() === "PATCH"
    ? "update"
    : "delete";

  return respondProfileError(req, res, {
    status: 403,
    code: "ORIGIN_FORBIDDEN",
    message: "Origin not allowed",
    op,
    result: "deny",
    reason: verdict.reason,
  });
});

profilesRouter.get("/profiles", async (req, res) => {
  const groupId = resolveGroupId(req);
  const { user } = await resolveSessionUser(req);

  if (!user && !groupId) {
    return res.status(400).json({
      ok: false,
      error: { code: "GROUP_ID_REQUIRED", message: "Missing profile group id" },
    });
  }

  const where: Prisma.UserProfileWhereInput = user
    ? {
        OR: [
          { userId: user.id },
          ...(groupId ? [{ groupId, userId: { equals: null } }] : []),
        ],
      }
    : { groupId: groupId ?? undefined };

  const items = await prismaGlobal.userProfile.findMany({
    where,
    orderBy: { updatedAt: "desc" },
  });

  return res.json({ ok: true, items });
});

profilesRouter.post("/profiles", async (req, res) => {
  const groupId = resolveGroupId(req);
  const { user } = await resolveSessionUser(req);

  if (!groupId && !user) {
    return respondProfileError(req, res, {
      status: 400,
      code: "GROUP_ID_REQUIRED",
      message: "Missing profile group id",
      op: "create",
      result: "deny",
      reason: "invalid_payload",
    });
  }

  const parsed = profileSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return respondProfileError(req, res, {
      status: 400,
      code: "INVALID_PAYLOAD",
      message: "Invalid payload",
      op: "create",
      result: "deny",
      reason: "invalid_payload",
      userId: user?.id ?? null,
    });
  }

  const payload = parsed.data;
  const tenantId = normalizeOptional(payload.tenantId) ?? user?.tenantId ?? null;

  if (user && payload.tenantId && payload.tenantId !== user.tenantId) {
    return respondProfileError(req, res, {
      status: 403,
      code: "TENANT_FORBIDDEN",
      message: "Profile tenant mismatch",
      op: "create",
      result: "deny",
      reason: "not_owner",
      userId: user.id,
      tenantId: user.tenantId,
    });
  }

  if (user && tenantId) {
    const allowed = await ensureTenantAccess(user.id, tenantId);
    if (!allowed) {
      return respondProfileError(req, res, {
        status: 403,
        code: "MEMBERSHIP_INACTIVE",
        message: "Tenant membership inactive",
        op: "create",
        result: "deny",
        reason: "membership_inactive",
        userId: user.id,
        tenantId,
      });
    }
  }

  const workspaceId = normalizeOptional(payload.workspaceId);
  if (tenantId && workspaceId) {
    const ok = await ensureWorkspaceInTenant(workspaceId, tenantId);
    if (!ok) {
      return respondProfileError(req, res, {
        status: 403,
        code: "WORKSPACE_TENANT_MISMATCH",
        message: "Workspace does not belong to tenant",
        op: "create",
        result: "deny",
        reason: "workspace_out_of_tenant",
        userId: user?.id ?? null,
        tenantId,
        workspaceId,
      });
    }
  }

  const created = await prismaGlobal.$transaction(async (tx) => {
    const profile = await tx.userProfile.create({
      data: {
        groupId: groupId ?? user?.id ?? "default",
        userId: user?.id ?? null,
        ...buildData(payload),
      },
    });

    if (user?.id && tenantId) {
      await syncTenantMembershipFromProfile({
        prisma: tx,
        userId: user.id,
        tenantId,
        profileRole: profile.role,
      });
    }

    return profile;
  });

  recordProfileMetric("create", "ok");
  logProfileEvent(req, {
    op: "create",
    result: "ok",
    profileId: created.id,
    tenantId: tenantId ?? null,
    workspaceId: workspaceId ?? null,
    userId: user?.id ?? null,
  });
  void recordProfileAudit({
    op: "create",
    result: "ok",
    tenantId: tenantId ?? null,
    workspaceId: workspaceId ?? null,
    profileId: created.id,
    userId: user?.id ?? null,
    requestId: resolveRequestId(req),
  });

  return res.status(201).json({ ok: true, item: created });
});

profilesRouter.put("/profiles/:id", async (req, res) => {
  const groupId = resolveGroupId(req);
  const { user } = await resolveSessionUser(req);

  if (!groupId && !user) {
    return respondProfileError(req, res, {
      status: 400,
      code: "GROUP_ID_REQUIRED",
      message: "Missing profile group id",
      op: "update",
      result: "deny",
      reason: "invalid_payload",
    });
  }

  const parsed = profileSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return respondProfileError(req, res, {
      status: 400,
      code: "INVALID_PAYLOAD",
      message: "Invalid payload",
      op: "update",
      result: "deny",
      reason: "invalid_payload",
      userId: user?.id ?? null,
    });
  }

  const existing = await prismaGlobal.userProfile.findFirst({
    where: user
      ? {
          id: req.params.id,
          OR: [
            { userId: user.id },
            ...(groupId ? [{ groupId, userId: null }] : []),
          ],
        }
      : { id: req.params.id, groupId: groupId ?? undefined },
  });
  if (!existing) {
    return respondProfileError(req, res, {
      status: 404,
      code: "NOT_FOUND",
      message: "Profile not found",
      op: "update",
      result: "deny",
      reason: "not_found",
      userId: user?.id ?? null,
    });
  }

  const payload = parsed.data;
  const tenantId = normalizeOptional(payload.tenantId) ?? existing.tenantId ?? user?.tenantId ?? null;

  if (user && payload.tenantId && payload.tenantId !== user.tenantId) {
    return respondProfileError(req, res, {
      status: 403,
      code: "TENANT_FORBIDDEN",
      message: "Profile tenant mismatch",
      op: "update",
      result: "deny",
      reason: "not_owner",
      userId: user.id,
      tenantId: user.tenantId,
      profileId: existing.id,
    });
  }

  if (user && tenantId) {
    const allowed = await ensureTenantAccess(user.id, tenantId);
    if (!allowed) {
      return respondProfileError(req, res, {
        status: 403,
        code: "MEMBERSHIP_INACTIVE",
        message: "Tenant membership inactive",
        op: "update",
        result: "deny",
        reason: "membership_inactive",
        userId: user.id,
        tenantId,
        profileId: existing.id,
      });
    }
  }

  const workspaceId = normalizeOptional(payload.workspaceId);
  if (tenantId && workspaceId) {
    const ok = await ensureWorkspaceInTenant(workspaceId, tenantId);
    if (!ok) {
      return respondProfileError(req, res, {
        status: 403,
        code: "WORKSPACE_TENANT_MISMATCH",
        message: "Workspace does not belong to tenant",
        op: "update",
        result: "deny",
        reason: "workspace_out_of_tenant",
        userId: user?.id ?? null,
        tenantId,
        workspaceId,
        profileId: existing.id,
      });
    }
  }

  const updated = await prismaGlobal.$transaction(async (tx) => {
    const profile = await tx.userProfile.update({
      where: { id: existing.id },
      data: {
        ...buildData(payload),
        ...(user && !existing.userId ? { userId: user.id } : {}),
      },
    });

    if (user?.id && tenantId) {
      await syncTenantMembershipFromProfile({
        prisma: tx,
        userId: user.id,
        tenantId,
        profileRole: profile.role,
      });
    }

    return profile;
  });

  recordProfileMetric("update", "ok");
  logProfileEvent(req, {
    op: "update",
    result: "ok",
    profileId: updated.id,
    tenantId: tenantId ?? null,
    workspaceId: updated.workspaceId ?? null,
    userId: user?.id ?? null,
  });
  void recordProfileAudit({
    op: "update",
    result: "ok",
    tenantId: tenantId ?? null,
    workspaceId: updated.workspaceId ?? null,
    profileId: updated.id,
    userId: user?.id ?? null,
    requestId: resolveRequestId(req),
  });

  return res.json({ ok: true, item: updated });
});

profilesRouter.delete("/profiles/:id", async (req, res) => {
  const groupId = resolveGroupId(req);
  const { user, claims } = await resolveSessionUser(req);

  if (!groupId && !user) {
    return respondProfileError(req, res, {
      status: 400,
      code: "GROUP_ID_REQUIRED",
      message: "Missing profile group id",
      op: "delete",
      result: "deny",
      reason: "invalid_payload",
    });
  }

  const existing = await prismaGlobal.userProfile.findFirst({
    where: user
      ? {
          id: req.params.id,
          OR: [
            { userId: user.id },
            ...(groupId ? [{ groupId, userId: null }] : []),
          ],
        }
      : { id: req.params.id, groupId: groupId ?? undefined },
  });
  if (!existing) {
    return respondProfileError(req, res, {
      status: 404,
      code: "NOT_FOUND",
      message: "Profile not found",
      op: "delete",
      result: "deny",
      reason: "not_found",
      userId: user?.id ?? null,
    });
  }

  if (claims?.activeProfileId && claims.activeProfileId === existing.id) {
    return respondProfileError(req, res, {
      status: 409,
      code: "CANNOT_DELETE_ACTIVE",
      message: "Cannot delete active profile",
      op: "delete",
      result: "deny",
      reason: "cannot_delete_active",
      userId: user?.id ?? null,
      profileId: existing.id,
      tenantId: existing.tenantId ?? user?.tenantId ?? null,
      workspaceId: existing.workspaceId ?? null,
    });
  }

  const remaining = await prismaGlobal.userProfile.count({
    where: user
      ? {
          OR: [
            { userId: user.id },
            ...(groupId ? [{ groupId, userId: null }] : []),
          ],
        }
      : { groupId: groupId ?? undefined },
  });

  if (remaining <= 1) {
    return respondProfileError(req, res, {
      status: 409,
      code: "CANNOT_DELETE_LAST",
      message: "Cannot delete last profile",
      op: "delete",
      result: "deny",
      reason: "cannot_delete_last",
      userId: user?.id ?? null,
      profileId: existing.id,
      tenantId: existing.tenantId ?? user?.tenantId ?? null,
      workspaceId: existing.workspaceId ?? null,
    });
  }

  await prismaGlobal.userProfile.delete({ where: { id: existing.id } });
  recordProfileMetric("delete", "ok");
  logProfileEvent(req, {
    op: "delete",
    result: "ok",
    profileId: existing.id,
    tenantId: existing.tenantId ?? user?.tenantId ?? null,
    workspaceId: existing.workspaceId ?? null,
    userId: user?.id ?? null,
  });
  void recordProfileAudit({
    op: "delete",
    result: "ok",
    tenantId: existing.tenantId ?? user?.tenantId ?? null,
    workspaceId: existing.workspaceId ?? null,
    profileId: existing.id,
    userId: user?.id ?? null,
    requestId: resolveRequestId(req),
  });
  return res.json({ ok: true });
});

profilesRouter.post("/profiles/:id/activate", async (req, res) => {
  const groupId = resolveGroupId(req);
  const { user, claims } = await resolveSessionUser(req);

  if (!user || !claims) {
    return respondProfileError(req, res, {
      status: 401,
      code: "UNAUTHORIZED",
      message: "Missing or invalid session",
      op: "activate",
      result: "deny",
      reason: "not_owner",
    });
  }

  const profile = await prismaGlobal.userProfile.findFirst({
    where: {
      id: req.params.id,
      OR: [
        { userId: user.id },
        ...(groupId ? [{ groupId, userId: null }] : []),
      ],
    },
  });
  if (!profile) {
    return respondProfileError(req, res, {
      status: 404,
      code: "NOT_FOUND",
      message: "Profile not found",
      op: "activate",
      result: "deny",
      reason: "not_found",
      userId: user.id,
    });
  }

  if (profile.tenantId && profile.tenantId !== user.tenantId) {
    return respondProfileError(req, res, {
      status: 403,
      code: "PROFILE_TENANT_MISMATCH",
      message: "Profile does not belong to tenant",
      op: "activate",
      result: "deny",
      reason: "not_owner",
      userId: user.id,
      tenantId: user.tenantId,
      profileId: profile.id,
    });
  }

  const tenantId = profile.tenantId ?? user.tenantId;
  const membershipOk = await ensureTenantAccess(user.id, tenantId);
  if (!membershipOk) {
    return respondProfileError(req, res, {
      status: 403,
      code: "MEMBERSHIP_INACTIVE",
      message: "Tenant membership inactive",
      op: "activate",
      result: "deny",
      reason: "membership_inactive",
      userId: user.id,
      tenantId,
      profileId: profile.id,
    });
  }

  if (profile.workspaceId) {
    const ok = await ensureWorkspaceInTenant(profile.workspaceId, tenantId);
    if (!ok) {
      return respondProfileError(req, res, {
        status: 403,
        code: "WORKSPACE_TENANT_MISMATCH",
        message: "Workspace does not belong to tenant",
        op: "activate",
        result: "deny",
        reason: "workspace_out_of_tenant",
        userId: user.id,
        tenantId,
        workspaceId: profile.workspaceId ?? null,
        profileId: profile.id,
      });
    }
  }

  if (!profile.userId) {
    await prismaGlobal.userProfile.update({
      where: { id: profile.id },
      data: { userId: user.id },
    });
  }

  try {
    await issueSessionCookie(req as any, res, {
      userId: user.id,
      tenantId,
      workspaceId: profile.workspaceId ?? null,
      activeProfileId: profile.id,
      identityType: claims.identityType ?? "password",
    });
  } catch {
    return respondProfileError(req, res, {
      status: 500,
      code: "SESSION_WRITE_FAILED",
      message: "Failed to persist session",
      op: "activate",
      result: "error",
      reason: "session_write_failed",
      userId: user.id,
      tenantId,
      profileId: profile.id,
    });
  }

  recordProfileMetric("activate", "ok");
  logProfileEvent(req, {
    op: "activate",
    result: "ok",
    profileId: profile.id,
    tenantId,
    workspaceId: profile.workspaceId ?? null,
    userId: user.id,
  });
  void recordProfileAudit({
    op: "activate",
    result: "ok",
    tenantId,
    workspaceId: profile.workspaceId ?? null,
    profileId: profile.id,
    userId: user.id,
    requestId: resolveRequestId(req),
  });

  return res.json({
    ok: true,
    data: {
      activeProfileId: profile.id,
      tenantId,
      workspaceId: profile.workspaceId ?? null,
    },
  });
});
