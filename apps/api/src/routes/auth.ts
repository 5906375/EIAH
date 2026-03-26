import crypto from "node:crypto";
import { promisify } from "node:util";
import { Router } from "express";
import { z } from "zod";
import { prismaGlobal } from "@repo/db";
import { findApiToken } from "../auth/apiTokenRepository";
import { acceptWorkspaceInvitation, readWorkspaceInvitationByToken } from "../services/workspaceResponsibility";

const scryptAsync = promisify(crypto.scrypt);

const authRouter = Router();
let legacyStoreInitPromise: Promise<void> | null = null;
const walletChallenges = new Map<
  string,
  { address: string; message: string; expiresAt: number; used: boolean }
>();

const LoginSchema = z
  .object({
    email: z.string().email().optional(),
    password: z.string().min(1).optional(),
    token: z.string().min(1).optional(),
  })
  .refine((data) => Boolean(data.token) || (Boolean(data.email) && Boolean(data.password)), {
    message: "Provide token or email+password",
  });

type LegacyCredential = {
  email: string;
  passwordHash: string;
  tenantId?: string;
  workspaceId?: string;
  userId?: string;
};

type LegacyCredentialRecord = {
  email: string;
  passwordHash: string;
  userId?: string;
  tenantId?: string;
  workspaceId?: string;
  source: "db" | "env";
};

type TokenPayload = {
  token: string;
  tenantId: string;
  workspaceId: string;
  userId?: string | null;
  method: "password" | "token" | "wallet";
};

function safeJsonParse<T>(raw: string | undefined): T | null {
  if (!raw?.trim()) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function getLegacyCredentials(): LegacyCredential[] {
  const fromJson = safeJsonParse<LegacyCredential[]>(process.env.LEGACY_ACCESS_USERS_JSON);
  const fromSingle =
    process.env.LEGACY_ACCESS_EMAIL && process.env.LEGACY_ACCESS_PASSWORD_HASH
      ? [
          {
            email: process.env.LEGACY_ACCESS_EMAIL,
            passwordHash: process.env.LEGACY_ACCESS_PASSWORD_HASH,
            tenantId: process.env.LEGACY_ACCESS_TENANT_ID,
            workspaceId: process.env.LEGACY_ACCESS_WORKSPACE_ID,
            userId: process.env.LEGACY_ACCESS_USER_ID,
          },
        ]
      : [];
  return [...(fromJson ?? []), ...fromSingle].map((item) => ({
    ...item,
    email: item.email.toLowerCase().trim(),
    passwordHash: item.passwordHash.trim(),
  }));
}

async function ensureLegacyCredentialStore() {
  if (!legacyStoreInitPromise) {
    legacyStoreInitPromise = prismaGlobal
      .$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS legacy_auth_credentials (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `)
      .then(() => undefined);
  }
  return legacyStoreInitPromise;
}

async function getDbLegacyCredentialByEmail(email: string) {
  await ensureLegacyCredentialStore();
  const rows = await prismaGlobal.$queryRaw<
    Array<{ userId: string; email: string; passwordHash: string }>
  >`
    SELECT user_id AS "userId", email, password_hash AS "passwordHash"
    FROM legacy_auth_credentials
    WHERE email = ${email}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function upsertDbLegacyCredential(params: {
  userId: string;
  email: string;
  passwordHash: string;
}) {
  await ensureLegacyCredentialStore();
  await prismaGlobal.$executeRaw`
    INSERT INTO legacy_auth_credentials (user_id, email, password_hash)
    VALUES (${params.userId}, ${params.email}, ${params.passwordHash})
    ON CONFLICT (user_id)
    DO UPDATE
    SET email = EXCLUDED.email,
        password_hash = EXCLUDED.password_hash,
        updated_at = NOW()
  `;
}

async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  // format: scrypt$<saltBase64>$<hashBase64>
  const parts = encoded.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "base64");
  const expected = Buffer.from(parts[2], "base64");
  const derived = (await scryptAsync(password, salt, expected.length)) as Buffer;
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return `scrypt$${salt.toString("base64")}$${derived.toString("base64")}`;
}

function getConfiguredLegacyCredentialByEmail(email: string): LegacyCredential | null {
  const credentials = getLegacyCredentials();
  return credentials.find((item) => item.email === email) ?? null;
}

async function resolveLegacyCredentialByEmail(email: string): Promise<LegacyCredentialRecord | null> {
  const dbCredential = await getDbLegacyCredentialByEmail(email);
  if (dbCredential) {
    return {
      email: dbCredential.email,
      passwordHash: dbCredential.passwordHash,
      userId: dbCredential.userId,
      source: "db",
    };
  }

  const envCredential = getConfiguredLegacyCredentialByEmail(email);
  if (!envCredential) return null;
  return {
    email: envCredential.email,
    passwordHash: envCredential.passwordHash,
    tenantId: envCredential.tenantId,
    workspaceId: envCredential.workspaceId,
    userId: envCredential.userId,
    source: "env",
  };
}

async function validateActiveToken(token: string) {
  const tokenRecord = await findApiToken(token);
  if (!tokenRecord || tokenRecord.revoked) return null;
  if (tokenRecord.expiresAt && tokenRecord.expiresAt.getTime() < Date.now()) return null;
  return tokenRecord;
}

function generateTokenValue() {
  return `tok_${crypto.randomBytes(24).toString("hex")}`;
}

async function resolveDefaultTenantWorkspace() {
  const envTenant = process.env.LEGACY_ACCESS_TENANT_ID;
  const tenantId =
    envTenant ??
    (
      await prismaGlobal.tenant.findFirst({
        orderBy: { createdAt: "asc" },
        select: { id: true },
      })
    )?.id;
  if (!tenantId) return null;
  const workspaceId =
    process.env.LEGACY_ACCESS_WORKSPACE_ID ??
    (
      await prismaGlobal.workspace.findFirst({
        where: { tenantId },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      })
    )?.id;
  if (!workspaceId) return null;
  return { tenantId, workspaceId };
}

async function issueTokenForUser(params: {
  userId: string;
  tenantId: string;
  workspaceId: string;
  method: "password" | "wallet";
}): Promise<TokenPayload> {
  const existingToken = await prismaGlobal.apiToken.findFirst({
    where: {
      userId: params.userId,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      revoked: false,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: { createdAt: "desc" },
    select: { token: true },
  });
  const finalToken = existingToken?.token ?? generateTokenValue();
  if (!existingToken) {
    await prismaGlobal.apiToken.create({
      data: {
        token: finalToken,
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        userId: params.userId,
        description:
          params.method === "wallet" ? "Wallet access login token" : "Legacy access login token",
      },
    });
  }
  return {
    token: finalToken,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    userId: params.userId,
    method: params.method,
  };
}

function normalizeWalletAddress(value: string) {
  return value.trim().toLowerCase();
}

function walletEmailFromAddress(address: string) {
  return `wallet+${normalizeWalletAddress(address)}@wallet.eiah.local`;
}

function walletAuthUnsafeModeEnabled() {
  const configured = process.env.WALLET_AUTH_ALLOW_UNVERIFIED_SIGNATURE;
  if (configured !== undefined) {
    return configured.trim().toLowerCase() === "true";
  }
  return process.env.NODE_ENV !== "production";
}

const WorkspaceInvitationPreviewSchema = z.object({
  token: z.string().min(1),
});

const WorkspaceInvitationAcceptSchema = z
  .object({
    token: z.string().min(1),
    loginToken: z.string().min(1).optional(),
    email: z.string().email().optional(),
    fullName: z.string().min(1).max(160).optional(),
    password: z.string().min(8).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.loginToken) return;
    if (!data.email) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["email"], message: "Email is required when loginToken is not provided" });
    }
    if (!data.fullName) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["fullName"], message: "Full name is required when loginToken is not provided" });
    }
    if (!data.password) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["password"], message: "Password is required when loginToken is not provided" });
    }
  });

authRouter.post("/auth/workspace-invitations/preview", async (req, res) => {
  const parsed = WorkspaceInvitationPreviewSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_PAYLOAD", details: parsed.error.flatten() },
    });
  }

  const invitation = await readWorkspaceInvitationByToken({ token: parsed.data.token.trim() });
  if (!invitation) {
    return res.status(404).json({
      ok: false,
      error: { code: "WORKSPACE_INVITATION_NOT_FOUND", message: "Workspace invitation not found" },
    });
  }

  return res.json({
    ok: true,
    data: {
      token: invitation.token,
      tenantId: invitation.tenantId,
      tenantName: invitation.tenantName,
      workspaceId: invitation.workspaceId,
      workspaceName: invitation.workspaceName,
      email: invitation.email,
      fullName: invitation.fullName,
      roleKey: invitation.roleKey,
      roleLabel: invitation.roleLabel,
      permissions: invitation.permissions,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      expired: invitation.expired,
    },
  });
});

authRouter.post("/auth/workspace-invitations/accept", async (req, res) => {
  const parsed = WorkspaceInvitationAcceptSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_PAYLOAD", details: parsed.error.flatten() },
    });
  }

  try {
    let authenticatedUserId: string | null = null;
    if (parsed.data.loginToken) {
      const tokenRecord = await validateActiveToken(parsed.data.loginToken.trim());
      if (!tokenRecord || !tokenRecord.userId) {
        return res.status(401).json({
          ok: false,
          error: { code: "UNAUTHORIZED", message: "Invalid login token" },
        });
      }
      authenticatedUserId = tokenRecord.userId;
    }

    if (!authenticatedUserId && parsed.data.password) {
      await ensureLegacyCredentialStore();
    }
    const passwordHash = !authenticatedUserId && parsed.data.password
      ? await hashPassword(parsed.data.password)
      : null;

    const accepted = await acceptWorkspaceInvitation({
      token: parsed.data.token.trim(),
      authenticatedUserId,
      email: parsed.data.email?.trim().toLowerCase(),
      fullName: parsed.data.fullName?.trim(),
      passwordHash,
    });

    return res.status(201).json({
      ok: true,
      data: {
        token: accepted.token,
        tenantId: accepted.tenantId,
        workspaceId: accepted.workspaceId,
        userId: accepted.userId,
        email: accepted.email,
        fullName: accepted.fullName,
        roleKey: accepted.roleKey,
        roleLabel: accepted.roleLabel,
        responsibleLabel: accepted.responsibleLabel,
        method: authenticatedUserId ? "token" : "password",
      },
    });
  } catch (error) {
    const maybe = error as { code?: string; status?: number; message?: string };
    if (maybe?.status) {
      return res.status(maybe.status).json({
        ok: false,
        error: { code: maybe.code ?? "WORKSPACE_INVITATION_ACCEPT_FAILED", message: maybe.message ?? "Invitation acceptance failed" },
      });
    }
    return res.status(500).json({
      ok: false,
      error: { code: "WORKSPACE_INVITATION_ACCEPT_FAILED", message: "Failed to accept workspace invitation" },
    });
  }
});

authRouter.post("/auth/login", async (req, res) => {
  const parsed = LoginSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_PAYLOAD", details: parsed.error.flatten() },
    });
  }

  const { token, email, password } = parsed.data;

  // Compatibility path: legacy token login keeps current auth model working.
  if (token) {
    const tokenRecord = await validateActiveToken(token);
    if (!tokenRecord) {
      return res.status(401).json({
        ok: false,
        error: { code: "UNAUTHORIZED", message: "Invalid token" },
      });
    }

    return res.json({
      ok: true,
      data: {
        token,
        tenantId: tokenRecord.tenantId,
        workspaceId: tokenRecord.workspaceId,
        userId: tokenRecord.userId ?? null,
        method: "token",
      },
    });
  }

  const normalizedEmail = email!.toLowerCase().trim();
  const user = await prismaGlobal.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, email: true, tenantId: true },
  });

  if (!user) {
    return res.status(401).json({
      ok: false,
      error: { code: "INVALID_CREDENTIALS", message: "Email or password is invalid" },
    });
  }

  const configured = await resolveLegacyCredentialByEmail(normalizedEmail);
  if (!configured) {
    return res.status(401).json({
      ok: false,
      error: {
        code: "LEGACY_AUTH_NOT_CONFIGURED",
        message: "Legacy password auth not configured for this user",
      },
    });
  }

  const passwordOk = await verifyPassword(password!, configured.passwordHash);
  if (!passwordOk) {
    return res.status(401).json({
      ok: false,
      error: { code: "INVALID_CREDENTIALS", message: "Email or password is invalid" },
    });
  }

  const tenantId = configured.tenantId ?? user.tenantId;
  const workspaceId =
    configured.workspaceId ??
    (
      await prismaGlobal.workspace.findFirst({
        where: { tenantId },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      })
    )?.id;

  if (!workspaceId) {
    return res.status(409).json({
      ok: false,
      error: { code: "WORKSPACE_NOT_FOUND", message: "No workspace available for this tenant" },
    });
  }

  const tokenPayload = await issueTokenForUser({
    userId: configured.userId ?? user.id,
    tenantId,
    workspaceId,
    method: "password",
  });

  return res.json({
    ok: true,
    data: tokenPayload,
  });
});

const WalletChallengeSchema = z.object({
  address: z.string().min(3),
});

const WalletLoginSchema = z.object({
  address: z.string().min(3),
  challengeId: z.string().min(1),
  signature: z.string().min(1),
});

authRouter.post("/auth/wallet/challenge", async (req, res) => {
  const parsed = WalletChallengeSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_PAYLOAD", details: parsed.error.flatten() },
    });
  }

  const address = normalizeWalletAddress(parsed.data.address);
  const challengeId = crypto.randomUUID();
  const nonce = crypto.randomBytes(16).toString("hex");
  const expiresAt = Date.now() + 5 * 60 * 1000;
  const message =
    `EIAH ACCESS wallet login\n` +
    `Address: ${address}\n` +
    `Challenge: ${challengeId}\n` +
    `Nonce: ${nonce}\n` +
    `ExpiresAt: ${new Date(expiresAt).toISOString()}`;

  walletChallenges.set(challengeId, {
    address,
    message,
    expiresAt,
    used: false,
  });

  return res.json({
    ok: true,
    data: {
      challengeId,
      message,
      expiresAt: new Date(expiresAt).toISOString(),
    },
  });
});

authRouter.post("/auth/wallet/login", async (req, res) => {
  const parsed = WalletLoginSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_PAYLOAD", details: parsed.error.flatten() },
    });
  }

  const address = normalizeWalletAddress(parsed.data.address);
  const challenge = walletChallenges.get(parsed.data.challengeId);
  if (!challenge) {
    return res.status(401).json({
      ok: false,
      error: { code: "INVALID_CHALLENGE", message: "Wallet challenge not found" },
    });
  }
  if (challenge.used || challenge.expiresAt < Date.now()) {
    return res.status(401).json({
      ok: false,
      error: { code: "CHALLENGE_EXPIRED", message: "Wallet challenge expired" },
    });
  }
  if (challenge.address !== address) {
    return res.status(401).json({
      ok: false,
      error: { code: "WALLET_MISMATCH", message: "Wallet address mismatch" },
    });
  }

  if (!walletAuthUnsafeModeEnabled()) {
    return res.status(501).json({
      ok: false,
      error: {
        code: "WALLET_VERIFY_NOT_CONFIGURED",
        message:
          "Wallet signature verification is not configured on this environment. Set WALLET_AUTH_ALLOW_UNVERIFIED_SIGNATURE=true for development.",
      },
    });
  }

  if (!parsed.data.signature.trim()) {
    return res.status(401).json({
      ok: false,
      error: { code: "INVALID_SIGNATURE", message: "Invalid wallet signature" },
    });
  }

  challenge.used = true;
  walletChallenges.set(parsed.data.challengeId, challenge);

  const tenantWorkspace = await resolveDefaultTenantWorkspace();
  if (!tenantWorkspace) {
    return res.status(409).json({
      ok: false,
      error: { code: "WORKSPACE_NOT_FOUND", message: "No workspace available for wallet login" },
    });
  }

  const walletEmail = walletEmailFromAddress(address);
  const user = await prismaGlobal.user.upsert({
    where: { email: walletEmail },
    create: {
      tenantId: tenantWorkspace.tenantId,
      email: walletEmail,
      displayName: `Wallet ${address.slice(0, 6)}...${address.slice(-4)}`,
    },
    update: {},
    select: { id: true },
  });

  const tokenPayload = await issueTokenForUser({
    userId: user.id,
    tenantId: tenantWorkspace.tenantId,
    workspaceId: tenantWorkspace.workspaceId,
    method: "wallet",
  });

  return res.json({
    ok: true,
    data: tokenPayload,
  });
});

const SetPasswordSchema = z
  .object({
    email: z.string().email(),
    newPassword: z.string().min(8),
    confirmPassword: z.string().min(8).optional(),
    currentPassword: z.string().min(1).optional(),
    token: z.string().min(1).optional(),
  })
  .refine(
    (data) =>
      !data.confirmPassword ||
      data.newPassword === data.confirmPassword,
    { message: "Password confirmation mismatch", path: ["confirmPassword"] }
  );

authRouter.post("/auth/password/set", async (req, res) => {
  const parsed = SetPasswordSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_PAYLOAD", details: parsed.error.flatten() },
    });
  }

  const { email, newPassword, currentPassword, token } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();

  const user = await prismaGlobal.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, email: true, tenantId: true },
  });
  if (!user) {
    return res.status(404).json({
      ok: false,
      error: { code: "USER_NOT_FOUND", message: "User not found" },
    });
  }

  const existingCredential = await resolveLegacyCredentialByEmail(normalizedEmail);
  const firstPasswordSelfServiceDefault = process.env.NODE_ENV !== "production";
  const firstPasswordSelfServiceRaw =
    process.env.LEGACY_ACCESS_ALLOW_FIRST_PASSWORD_SELF_SERVICE ??
    String(firstPasswordSelfServiceDefault);
  const firstPasswordSelfService = String(firstPasswordSelfServiceRaw).trim().toLowerCase() === "true";

  let authorized = false;
  let authorizationMethod: "token" | "current_password" | "bootstrap" | "email_recovery" | null =
    null;

  if (token) {
    const tokenRecord = await validateActiveToken(token);
    if (tokenRecord && tokenRecord.userId === user.id) {
      authorized = true;
      authorizationMethod = "token";
    }
  }

  if (!authorized && currentPassword && existingCredential) {
    const currentPasswordOk = await verifyPassword(currentPassword, existingCredential.passwordHash);
    if (currentPasswordOk) {
      authorized = true;
      authorizationMethod = "current_password";
    }
  }

  if (!authorized && !existingCredential && firstPasswordSelfService) {
    authorized = true;
    authorizationMethod = "bootstrap";
  }

  const emailRecoveryDefault = process.env.NODE_ENV !== "production";
  const emailRecoveryRaw =
    process.env.LEGACY_ACCESS_ALLOW_PASSWORD_RESET_BY_EMAIL ?? String(emailRecoveryDefault);
  const allowPasswordResetByEmail = String(emailRecoveryRaw).trim().toLowerCase() === "true";
  if (!authorized && allowPasswordResetByEmail) {
    authorized = true;
    authorizationMethod = "email_recovery";
  }

  if (!authorized) {
    return res.status(401).json({
      ok: false,
      error: {
        code: "UNAUTHORIZED_PASSWORD_SET",
        message:
          "Provide a valid token or current password. For first password enable LEGACY_ACCESS_ALLOW_FIRST_PASSWORD_SELF_SERVICE=true. For email recovery enable LEGACY_ACCESS_ALLOW_PASSWORD_RESET_BY_EMAIL=true.",
      },
    });
  }

  const passwordHash = await hashPassword(newPassword);
  await upsertDbLegacyCredential({
    userId: user.id,
    email: normalizedEmail,
    passwordHash,
  });

  return res.json({
    ok: true,
    data: {
      email: normalizedEmail,
      method: authorizationMethod,
      legacyAuthSource: "db",
    },
  });
});

export { authRouter };
