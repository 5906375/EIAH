import { Router } from "express";
import { z } from "zod";
import { prismaGlobal } from "@repo/db";
import { enforceTenant, type TenantAwareRequest } from "../middlewares/enforceTenant";

const profileRouter = Router();
profileRouter.use(enforceTenant);

let profileStoreInitPromise: Promise<void> | null = null;

async function ensureUserProfileStore() {
  if (!profileStoreInitPromise) {
    profileStoreInitPromise = prismaGlobal
      .$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS eiah_user_profiles (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          phone TEXT,
          cep TEXT,
          role TEXT,
          website TEXT,
          city TEXT,
          country TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `)
      .then(() => undefined);
  }
  return profileStoreInitPromise;
}

const profileUpdateSchema = z.object({
  fullName: z.string().max(160).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(60).optional(),
  cep: z.string().max(20).optional(),
  role: z.string().max(120).optional(),
  website: z.string().max(255).optional(),
  city: z.string().max(120).optional(),
  country: z.string().max(120).optional(),
  tenantName: z.string().max(160).optional(),
  workspaceName: z.string().max(160).optional(),
});

async function readProfileSummary(req: TenantAwareRequest) {
  const authContext = req.authContext;
  if (!authContext?.userId) return null;

  await ensureUserProfileStore();

  const user = await prismaGlobal.user.findUnique({
    where: { id: authContext.userId },
    select: { id: true, email: true, displayName: true, tenantId: true },
  });
  if (!user) return null;

  const tenant = await prismaGlobal.tenant.findUnique({
    where: { id: user.tenantId },
    select: { id: true, name: true },
  });

  const workspaces = await prismaGlobal.workspace.findMany({
    where: { tenantId: user.tenantId },
    select: { id: true, name: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const currentWorkspace =
    workspaces.find((workspace) => workspace.id === authContext.workspaceId) ?? null;

  const rows = await prismaGlobal.$queryRaw<
    Array<{
      phone: string | null;
      cep: string | null;
      role: string | null;
      website: string | null;
      city: string | null;
      country: string | null;
    }>
  >`
    SELECT phone, cep, role, website, city, country
    FROM eiah_user_profiles
    WHERE user_id = ${user.id}
    ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
    LIMIT 1
  `;
  let extra = rows[0] ?? null;
  if (!extra) {
    try {
      const legacyRows = await prismaGlobal.$queryRaw<
        Array<{
          phone: string | null;
          cep: string | null;
          role: string | null;
          website: string | null;
          city: string | null;
          country: string | null;
        }>
      >`
        SELECT phone, cep, role, website, city, country
        FROM user_profiles
        WHERE user_id = ${user.id}
        ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
        LIMIT 1
      `;
      extra = legacyRows[0] ?? null;
    } catch {
      // Legacy table may not exist (or may be incompatible); ignore safely.
    }
  }

  return {
    fullName: user.displayName ?? "",
    email: user.email,
    phone: extra?.phone ?? "",
    cep: extra?.cep ?? "",
    role: extra?.role ?? "",
    website: extra?.website ?? "",
    city: extra?.city ?? "",
    country: extra?.country ?? "",
    tenant: {
      id: tenant?.id ?? user.tenantId,
      name: tenant?.name ?? user.tenantId,
    },
    workspace: {
      id: authContext.workspaceId,
      name: currentWorkspace?.name ?? authContext.workspaceId,
    },
    workspaces: workspaces.map((workspace) => ({
      id: workspace.id,
      name: workspace.name,
      createdAt: workspace.createdAt,
      isCurrent: workspace.id === authContext.workspaceId,
    })),
  };
}

profileRouter.get("/profile/me", async (req, res) => {
  const typedReq = req as TenantAwareRequest;
  if (!typedReq.authContext?.userId) {
    return res.status(409).json({
      ok: false,
      error: {
        code: "USER_CONTEXT_REQUIRED",
        message: "Authenticated user context is required for profile access",
      },
    });
  }

  const summary = await readProfileSummary(typedReq);
  if (!summary) {
    return res.status(404).json({
      ok: false,
      error: { code: "PROFILE_NOT_FOUND", message: "Profile not found for this user" },
    });
  }

  return res.json({ ok: true, data: summary });
});

profileRouter.put("/profile/me", async (req, res) => {
  const typedReq = req as TenantAwareRequest;
  const authContext = typedReq.authContext;
  if (!authContext?.userId) {
    return res.status(409).json({
      ok: false,
      error: {
        code: "USER_CONTEXT_REQUIRED",
        message: "Authenticated user context is required for profile updates",
      },
    });
  }

  const parsed = profileUpdateSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_PAYLOAD", details: parsed.error.flatten() },
    });
  }

  try {
    await ensureUserProfileStore();
  } catch (error) {
    typedReq.logger?.error({ error }, "profile.store_init_failed");
    return res.status(500).json({
      ok: false,
      error: { code: "PROFILE_STORE_INIT_FAILED", message: "Failed to initialize profile store" },
    });
  }

  const payload = parsed.data;
  const normalizedEmail = payload.email?.trim().toLowerCase();
  const normalizedFullName = payload.fullName?.trim();
  const normalizedTenantName = payload.tenantName?.trim();
  const normalizedWorkspaceName = payload.workspaceName?.trim();

  try {
    await prismaGlobal.$transaction(async (tx) => {
      if (normalizedEmail !== undefined || normalizedFullName !== undefined) {
        await tx.user.update({
          where: { id: authContext.userId! },
          data: {
            ...(normalizedEmail !== undefined ? { email: normalizedEmail } : {}),
            ...(normalizedFullName !== undefined ? { displayName: normalizedFullName } : {}),
          },
        });
      }

      if (normalizedTenantName !== undefined && normalizedTenantName.length > 0) {
        await tx.tenant.update({
          where: { id: authContext.tenantId },
          data: { name: normalizedTenantName },
        });
      }

      if (normalizedWorkspaceName !== undefined && normalizedWorkspaceName.length > 0) {
        await tx.workspace.updateMany({
          where: {
            id: authContext.workspaceId,
            tenantId: authContext.tenantId,
          },
          data: { name: normalizedWorkspaceName },
        });
      }

      await tx.$executeRaw`
        INSERT INTO eiah_user_profiles (
          user_id, phone, cep, role, website, city, country, created_at, updated_at
        )
        VALUES (
          ${authContext.userId!},
          ${payload.phone?.trim() ?? null},
          ${payload.cep?.trim() ?? null},
          ${payload.role?.trim() ?? null},
          ${payload.website?.trim() ?? null},
          ${payload.city?.trim() ?? null},
          ${payload.country?.trim() ?? null},
          NOW(),
          NOW()
        )
        ON CONFLICT (user_id)
        DO UPDATE SET
          phone = EXCLUDED.phone,
          cep = EXCLUDED.cep,
          role = EXCLUDED.role,
          website = EXCLUDED.website,
          city = EXCLUDED.city,
          country = EXCLUDED.country,
          updated_at = NOW()
      `;
    });
  } catch (error) {
    const maybe = error as { code?: string };
    if (maybe?.code === "P2002") {
      return res.status(409).json({
        ok: false,
        error: { code: "EMAIL_ALREADY_EXISTS", message: "Email already in use" },
      });
    }
    typedReq.logger?.error({ error }, "profile.update_failed");
    return res.status(500).json({
      ok: false,
      error: { code: "PROFILE_UPDATE_FAILED", message: "Failed to update profile" },
    });
  }

  const summary = await readProfileSummary(typedReq);
  return res.json({ ok: true, data: summary });
});

export { profileRouter };
