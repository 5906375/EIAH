import { Router } from "express";
import { z } from "zod";
import { ROLE_PERMISSIONS, type RoleKey } from "../security/authz";
import { prismaGlobal } from "@repo/db";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { SiweMessage } from "siwe";
import {
  issueSessionCookie,
  parseCookieHeader,
  resolveSessionCookieOptions,
  verifySession,
} from "../auth/session";
import { loadCustomRoleWithPermissions } from "../services/customRoles";
import { resolveEffectivePermissions } from "../security/rolePermissions";

export const authRouter = Router();

const StepUpSchema = z.object({
  password: z.string().min(1).max(128),
});

const LoginSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(6).max(200),
  profileId: z.string().optional().nullable(),
});

const SelectProfileSchema = z.object({
  profileId: z.string().min(1),
});

const SiweNonceSchema = z.object({
  address: z.string().min(1).max(128),
});

const SiweVerifySchema = z.object({
  message: z.string().min(1),
  signature: z.string().min(1),
});

function resolveRoleFromProfile(role?: string | null): RoleKey | null {
  const raw = (role ?? "").trim().toLowerCase();
  if (!raw) return null;
  if (
    raw === "global_admin" ||
    raw === "eiah_admin" ||
    raw === "eiah admin" ||
    raw === "platform_admin" ||
    raw === "super_admin" ||
    raw === "super admin"
  )
    return "global_admin";
  if (raw === "global auditor") return "global_auditor";
  if (raw === "global_auditor") return "global_auditor";
  if (raw === "tenant_admin" || raw === "admin tenant") return "tenant_admin";
  if (raw === "tenant_operator") return "tenant_operator";
  if (raw === "tenant_viewer") return "tenant_viewer";
  return null;
}

function buildAuthPayload(
  role: RoleKey,
  params: { tenantId: string; workspaceId: string | null; customPermissions?: string[] | null }
) {
  const systemPermissions = ROLE_PERMISSIONS[role] ?? [];
  const permissions = resolveEffectivePermissions({
    systemPermissions,
    customPermissions: params.customPermissions ?? null,
  });
  const roles =
    role === "global_admin"
      ? ([
          "global_admin",
          "global_auditor",
          "tenant_admin",
          "tenant_operator",
          "tenant_viewer",
        ] as RoleKey[])
      : role === "tenant_admin"
      ? (["tenant_admin", "tenant_operator", "tenant_viewer"] as RoleKey[])
      : ([role] as RoleKey[]);
  return {
    role,
    roles,
    permissions,
    allowedTenants:
      role === "global_admin" || role === "global_auditor"
        ? ["*"]
        : [params.tenantId].filter(Boolean),
    allowedWorkspaces:
      role === "global_admin" || role === "global_auditor"
        ? ["*"]
        : [params.workspaceId].filter(Boolean),
    scope: role.startsWith("global") ? "global" : "tenant",
  };
}

function normalizeWalletAddress(address: string) {
  return address.trim().toLowerCase();
}

async function resolveDefaultTenantId() {
  const explicit =
    process.env.DEFAULT_TENANT_ID?.trim() ||
    process.env.TENANT_ID?.trim() ||
    "";
  if (explicit) return explicit;
  const tenant = await prismaGlobal.tenant.findFirst({
    orderBy: { createdAt: "asc" },
  });
  return tenant?.id ?? null;
}

async function resolveDefaultWorkspaceId(tenantId: string | null) {
  if (!tenantId) return null;
  const explicit =
    process.env.DEFAULT_WORKSPACE_ID?.trim() ||
    process.env.WORKSPACE_ID?.trim() ||
    "";
  if (explicit) return explicit;
  const workspace = await prismaGlobal.workspace.findFirst({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
  });
  return workspace?.id ?? null;
}

function resolveSiweDomain(req: { header(_name: string): string | undefined }) {
  const envDomain = process.env.SIWE_DOMAIN?.trim();
  if (envDomain) return envDomain;
  const forwarded = req.header("x-forwarded-host");
  if (forwarded) return forwarded.split(",")[0]?.trim() || undefined;
  return req.header("host")?.trim();
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

function shouldAutoSelectProfileForUser(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  return resolveMasterDevAutoProfileEmails().includes(normalized);
}

function isMasterDevUser(email: string) {
  return shouldAutoSelectProfileForUser(email);
}

function rankProfileRoleForSelection(role?: string | null) {
  const resolved = resolveRoleFromProfile(role);
  if (resolved === "global_admin") return 0;
  if (resolved === "tenant_admin") return 1;
  if (resolved === "tenant_operator") return 2;
  if (resolved === "tenant_viewer") return 3;
  if (resolved === "global_auditor") return 4;
  return 5;
}

function selectAutoProfileForUser(
  profiles: Array<{ role?: string | null; email?: string | null }>,
  loginEmail: string
) {
  if (profiles.length === 0) return null;
  const normalizedEmail = loginEmail.trim().toLowerCase();
  const emailMatches = profiles.filter(
    (profile) => (profile.email ?? "").trim().toLowerCase() === normalizedEmail
  );
  const candidates = emailMatches.length > 0 ? emailMatches : profiles;
  let selected = candidates[0] ?? null;
  for (const candidate of candidates) {
    if (!selected) {
      selected = candidate;
      continue;
    }
    if (rankProfileRoleForSelection(candidate.role) < rankProfileRoleForSelection(selected.role)) {
      selected = candidate;
    }
  }
  return selected;
}

authRouter.get("/auth/me", async (req, res) => {
  const cookieBag = parseCookieHeader(req.header("cookie"));
  const token = cookieBag[(process.env.SESSION_COOKIE_NAME ?? "token").trim() || "token"];
  const claims = typeof token === "string" ? verifySession(token) : null;
  if (!claims) {
    return res.status(401).json({
      ok: false,
      error: { code: "UNAUTHORIZED", message: "Missing or invalid session" },
    });
  }

  const user = await prismaGlobal.user.findUnique({
    where: { id: claims.userId },
  });
  if (!user) {
    return res.status(401).json({
      ok: false,
      error: { code: "UNAUTHORIZED", message: "User not found" },
    });
  }

  const profiles = await prismaGlobal.userProfile.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
  });
  const memberships = await prismaGlobal.tenantMembership.findMany({
    where: { userId: user.id },
    select: { tenantId: true, role: true, status: true, customRoleId: true },
  });
  const activeProfile =
    (claims.activeProfileId &&
      profiles.find((profile) => profile.id === claims.activeProfileId)) ||
    (profiles.length === 1 ? profiles[0] : null);
  const role =
    (isMasterDevUser(user.email)
      ? ("global_admin" as RoleKey)
      : resolveRoleFromProfile(activeProfile?.role ?? null) ?? ("tenant_admin" as RoleKey));
  const activeTenantId = activeProfile?.tenantId ?? claims.tenantId;
  const activeMembership = memberships.find((membership) => membership.tenantId === activeTenantId);
  const customRoleId = activeMembership?.customRoleId ?? null;
  const customRole =
    customRoleId && activeTenantId
      ? await loadCustomRoleWithPermissions({
          prisma: prismaGlobal,
          tenantId: activeTenantId,
          roleId: customRoleId,
        })
      : null;
  const customPermissions = customRole ? Array.from(customRole.permissions) : null;
  return res.json({
    ok: true,
    data: {
      ...buildAuthPayload(role, {
        tenantId: activeTenantId,
        workspaceId: activeProfile?.workspaceId ?? claims.workspaceId,
        customPermissions,
      }),
      tenantId: activeTenantId,
      workspaceId: activeProfile?.workspaceId ?? claims.workspaceId,
      userId: user.id,
      identityType: claims.identityType ?? "password",
      activeProfileId: activeProfile?.id ?? null,
      tenantRole: activeMembership?.role ?? null,
      membershipStatus: activeMembership?.status ?? null,
      customRoleId,
      customRoleName: customRole?.name ?? null,
      memberships,
      profiles: profiles.map((profile) => ({
        id: profile.id,
        fullName: profile.fullName,
        role: profile.role,
        tenantId: profile.tenantId,
        workspaceId: profile.workspaceId,
      })),
    },
  });
});

authRouter.post("/auth/step-up", async (req, res) => {
  const cookieBag = parseCookieHeader(req.header("cookie"));
  const token = cookieBag[(process.env.SESSION_COOKIE_NAME ?? "token").trim() || "token"];
  const claims = typeof token === "string" ? verifySession(token) : null;
  if (!claims) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const parsed = StepUpSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_PAYLOAD", details: parsed.error.flatten() },
    });
  }

  const expected = (process.env.STEP_UP_SHARED_SECRET ?? "").trim();
  if (!expected || parsed.data.password !== expected) {
    await prismaGlobal.guardrailAuditLedger.create({
      data: {
        tenantId: claims.tenantId,
        workspaceId: claims.workspaceId,
        runId: null,
        eventType: "auth.step_up.failed",
        severity: "warn",
        message: "Step-up failed",
        metadata: {
          userId: claims.userId,
        },
      },
    });
    return res.status(403).json({
      ok: false,
      error: { code: "STEP_UP_DENIED", message: "Step-up denied" },
    });
  }

  await prismaGlobal.guardrailAuditLedger.create({
    data: {
      tenantId: claims.tenantId,
      workspaceId: claims.workspaceId,
      runId: null,
      eventType: "auth.step_up.success",
      severity: "info",
      message: "Step-up success",
      metadata: {
        userId: claims.userId,
      },
    },
  });

  return res.json({ ok: true, validUntilMs: 10 * 60 * 1000 });
});

authRouter.post("/auth/login", async (req, res) => {
  const parsed = LoginSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_PAYLOAD", details: parsed.error.flatten() },
    });
  }

  const user = await prismaGlobal.user.findUnique({
    where: { email: parsed.data.email.trim().toLowerCase() },
  });
  if (!user || !user.passwordHash) {
    return res.status(401).json({
      ok: false,
      error: { code: "UNAUTHORIZED", message: "Invalid credentials" },
    });
  }

  const passwordOk = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!passwordOk) {
    return res.status(401).json({
      ok: false,
      error: { code: "UNAUTHORIZED", message: "Invalid credentials" },
    });
  }

  const profiles = await prismaGlobal.userProfile.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
  });

  const requestedProfileId = parsed.data.profileId?.trim() || null;
  const activeProfile =
    (requestedProfileId &&
      profiles.find((profile) => profile.id === requestedProfileId)) ||
    (profiles.length === 1
      ? profiles[0]
      : shouldAutoSelectProfileForUser(user.email)
      ? selectAutoProfileForUser(profiles, user.email)
      : null);

  const tenantId = activeProfile?.tenantId ?? user.tenantId;
  const workspaceId = activeProfile?.workspaceId ?? null;

  await issueSessionCookie(req, res, {
    userId: user.id,
    tenantId,
    workspaceId,
    activeProfileId: activeProfile?.id ?? null,
    identityType: "password",
  });

  return res.json({
    ok: true,
    data: {
      userId: user.id,
      tenantId,
      workspaceId,
      activeProfileId: activeProfile?.id ?? null,
      profiles: profiles.map((profile) => ({
        id: profile.id,
        fullName: profile.fullName,
        role: profile.role,
        tenantId: profile.tenantId,
        workspaceId: profile.workspaceId,
      })),
    },
  });
});

authRouter.post("/auth/logout", async (req, res) => {
  const { name, options } = resolveSessionCookieOptions(req);
  res.clearCookie(name, options);
  return res.json({ ok: true });
});

authRouter.post("/auth/select-profile", async (req, res) => {
  const cookieBag = parseCookieHeader(req.header("cookie"));
  const token = cookieBag[(process.env.SESSION_COOKIE_NAME ?? "token").trim() || "token"];
  const claims = typeof token === "string" ? verifySession(token) : null;
  if (!claims) {
    return res.status(401).json({
      ok: false,
      error: { code: "UNAUTHORIZED", message: "Missing or invalid session" },
    });
  }

  const parsed = SelectProfileSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_PAYLOAD", details: parsed.error.flatten() },
    });
  }

  const user = await prismaGlobal.user.findUnique({
    where: { id: claims.userId },
  });
  if (!user) {
    return res.status(401).json({
      ok: false,
      error: { code: "UNAUTHORIZED", message: "User not found" },
    });
  }

  const profile = await prismaGlobal.userProfile.findFirst({
    where: { id: parsed.data.profileId, userId: user.id },
  });
  if (!profile) {
    return res.status(404).json({
      ok: false,
      error: { code: "PROFILE_NOT_FOUND", message: "Profile not found" },
    });
  }
  if (profile.tenantId && profile.tenantId !== user.tenantId) {
    return res.status(403).json({
      ok: false,
      error: { code: "PROFILE_TENANT_MISMATCH", message: "Profile does not belong to tenant" },
    });
  }

  const tenantId = profile.tenantId ?? user.tenantId;
  const workspaceId = profile.workspaceId ?? null;
  const membership = await prismaGlobal.tenantMembership.findFirst({
    where: { tenantId, userId: user.id },
    select: { customRoleId: true },
  });
  const customRoleId = membership?.customRoleId ?? null;
  const customRole =
    customRoleId
      ? await loadCustomRoleWithPermissions({
          prisma: prismaGlobal,
          tenantId,
          roleId: customRoleId,
        })
      : null;
  const customPermissions = customRole ? Array.from(customRole.permissions) : null;

  await issueSessionCookie(req, res, {
    userId: user.id,
    tenantId,
    workspaceId,
    activeProfileId: profile.id,
    identityType: claims.identityType ?? "password",
  });

  const role =
    (isMasterDevUser(user.email)
      ? ("global_admin" as RoleKey)
      : resolveRoleFromProfile(profile.role ?? null) ?? ("tenant_admin" as RoleKey));
  return res.json({
    ok: true,
    data: {
      ...buildAuthPayload(role, {
        tenantId,
        workspaceId,
        customPermissions,
      }),
      tenantId,
      workspaceId,
      userId: user.id,
      identityType: claims.identityType ?? "password",
      activeProfileId: profile.id,
    },
  });
});

authRouter.post("/auth/siwe/nonce", async (req, res) => {
  const parsed = SiweNonceSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_PAYLOAD", details: parsed.error.flatten() },
    });
  }

  const address = normalizeWalletAddress(parsed.data.address);
  const nonce = crypto.randomBytes(16).toString("hex");
  const ttlMs = Number(process.env.SIWE_NONCE_TTL_MS ?? "300000");
  const expiresAt = new Date(Date.now() + (Number.isFinite(ttlMs) ? ttlMs : 300000));

  await prismaGlobal.siweNonce.create({
    data: {
      address,
      nonce,
      expiresAt,
    },
  });

  return res.json({ ok: true, data: { nonce, expiresAt: expiresAt.toISOString() } });
});

authRouter.post("/auth/siwe/verify", async (req, res) => {
  const parsed = SiweVerifySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_PAYLOAD", details: parsed.error.flatten() },
    });
  }

  let siwe: SiweMessage;
  try {
    siwe = new SiweMessage(parsed.data.message);
  } catch {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_MESSAGE", message: "Invalid SIWE message" },
    });
  }

  const address = normalizeWalletAddress(siwe.address);
  const nonce = siwe.nonce;
  const domain = resolveSiweDomain(req);

  if (domain && siwe.domain !== domain) {
    return res.status(400).json({
      ok: false,
      error: { code: "DOMAIN_MISMATCH", message: "SIWE domain mismatch" },
    });
  }

  const record = await prismaGlobal.siweNonce.findFirst({
    where: {
      address,
      nonce,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!record) {
    return res.status(401).json({
      ok: false,
      error: { code: "NONCE_INVALID", message: "Nonce not found or expired" },
    });
  }

  try {
    const verification = await siwe.verify({
      signature: parsed.data.signature,
      nonce,
      domain: siwe.domain,
    });
    if (!verification.success) {
      return res.status(401).json({
        ok: false,
        error: { code: "SIGNATURE_INVALID", message: "Signature invalid" },
      });
    }
  } catch {
    return res.status(401).json({
      ok: false,
      error: { code: "SIGNATURE_INVALID", message: "Signature invalid" },
    });
  }

  await prismaGlobal.siweNonce.update({
    where: { id: record.id },
    data: { consumedAt: new Date() },
  });

  let identity = await prismaGlobal.walletIdentity.findUnique({
    where: { address },
  });

  let userId = identity?.userId ?? null;
  let profileId = identity?.profileId ?? null;
  let tenantId = identity?.tenantId ?? null;
  let workspaceId = identity?.workspaceId ?? null;

  if (!userId || !tenantId) {
    tenantId = await resolveDefaultTenantId();
    if (!tenantId) {
      return res.status(500).json({
        ok: false,
        error: { code: "TENANT_UNAVAILABLE", message: "Default tenant not configured" },
      });
    }
    workspaceId = await resolveDefaultWorkspaceId(tenantId);

    const email = `${address}@wallet.local`;
    const displayName = `Wallet ${address.slice(0, 6)}`;
    const user = await prismaGlobal.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        displayName,
        tenantId,
      },
    });
    userId = user.id;

    const profile = await prismaGlobal.userProfile.create({
      data: {
        userId,
        groupId: `wallet:${address}`,
        fullName: displayName,
        role: process.env.SIWE_DEFAULT_ROLE?.trim() || "tenant_viewer",
        tenantId,
        workspaceId,
      },
    });
    profileId = profile.id;

    await prismaGlobal.tenantMembership.upsert({
      where: {
        tenantId_userId: {
          tenantId,
          userId,
        },
      },
      update: {},
      create: {
        tenantId,
        userId,
        role: "TENANT_VIEWER",
      },
    });
  }

  identity =
    identity ??
    (await prismaGlobal.walletIdentity.create({
      data: {
        address,
        chainId: siwe.chainId ?? null,
        userId: userId!,
        profileId: profileId ?? null,
        tenantId: tenantId!,
        workspaceId,
        lastSeenAt: new Date(),
      },
    }));

  if (identity) {
    await prismaGlobal.walletIdentity.update({
      where: { id: identity.id },
      data: {
        chainId: siwe.chainId ?? identity.chainId,
        lastSeenAt: new Date(),
      },
    });
  }

  await issueSessionCookie(req, res, {
    userId: userId!,
    tenantId: tenantId!,
    workspaceId,
    activeProfileId: profileId ?? null,
    identityType: "wallet",
  });

  return res.json({
    ok: true,
    data: {
      userId,
      tenantId,
      workspaceId,
      activeProfileId: profileId ?? null,
      address,
    },
  });
});
