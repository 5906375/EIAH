import { Router } from "express";
import { z } from "zod";
import { prismaGlobal } from "@repo/db";
import {
  buildExperienceDiagnosticSnapshot,
  experienceDiagnosticsWindowSchema,
  type ExperienceDiagnosticsWindow,
} from "../types/experienceDiagnosticSnapshot";
import { enforceTenant, type TenantAwareRequest } from "../middlewares/enforceTenant";
import { readTenantOperationalInsight } from "../services/tenantOperationalInsight";
import {
  createWorkspaceInvitation,
  readWorkspaceManagementSummary,
  upsertWorkspaceRoleConfig,
} from "../services/workspaceResponsibility";
import {
  canTenantUseReservedDefaultWorkspaceName,
  isReservedDefaultWorkspaceName,
  RESERVED_DEFAULT_WORKSPACE_ALLOWED_TENANT,
  tenantAlreadyHasReservedDefaultWorkspace,
} from "../services/workspaceNamingPolicy";

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
  workspaceRoleOptions: z.array(z.union([
    z.string().max(120),
    z.object({
      label: z.string().max(120),
      permissions: z.array(z.string().max(120)).max(20).optional(),
    }),
  ])).max(20).optional(),
});

const workspaceInvitationSchema = z.object({
  email: z.string().email(),
  fullName: z.string().max(160).optional(),
  roleKey: z.string().min(1).max(120),
  permissions: z.array(z.string().max(120)).max(20).optional(),
});

function resolveProfileDiagnosticsWindow(req: TenantAwareRequest): ExperienceDiagnosticsWindow {
  const parsed = experienceDiagnosticsWindowSchema.safeParse(req.query.window);
  return parsed.success ? parsed.data : "7d";
}

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
      // Legacy table may not exist; ignore.
    }
  }

  const workspaceSummary = await readWorkspaceManagementSummary({
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    userId: authContext.userId,
  });
  const diagnosticsWindow = resolveProfileDiagnosticsWindow(req);
  const diagnosticsWindowStart = new Date(
    Date.now() - (diagnosticsWindow === "7d" ? 7 : 30) * 24 * 60 * 60 * 1000
  );
  const operationalInsight = await readTenantOperationalInsight(prismaGlobal, {
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    window: diagnosticsWindow,
  });
  const recommendedActionAuditRows = await prismaGlobal.guardrailAuditLedger.findMany({
    where: {
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      eventType: {
        in: ["experience.recommended_action.aligned", "experience.recommended_action.diverged"],
      },
      createdAt: {
        gte: diagnosticsWindowStart,
      },
    },
    orderBy: { createdAt: "desc" },
    take: 12,
  });
  const alignedCount = recommendedActionAuditRows.filter(
    (item) => item.eventType === "experience.recommended_action.aligned"
  ).length;
  const divergedCount = recommendedActionAuditRows.filter(
    (item) => item.eventType === "experience.recommended_action.diverged"
  ).length;
  const totalAlignmentEvents = alignedCount + divergedCount;
  const alignmentRate = totalAlignmentEvents > 0 ? Math.round((alignedCount / totalAlignmentEvents) * 100) : null;
  const alignmentStatus =
    alignmentRate === null ? "unknown" : alignmentRate >= 80 ? "healthy" : alignmentRate >= 50 ? "watch" : "poor";
  const alignmentSummary =
    alignmentRate === null
      ? `Sem eventos de convergência entre landing e ação primária na janela ${diagnosticsWindow}.`
      : alignmentStatus === "healthy"
        ? `Convergência saudável na janela ${diagnosticsWindow}: ${alignmentRate}% aligned (${alignedCount}) vs ${divergedCount} diverged.`
        : alignmentStatus === "watch"
          ? `Convergência em observação na janela ${diagnosticsWindow}: ${alignmentRate}% aligned (${alignedCount}) vs ${divergedCount} diverged.`
          : `Convergência baixa na janela ${diagnosticsWindow}: ${alignmentRate}% aligned (${alignedCount}) vs ${divergedCount} diverged.`;
  const recentSources = recommendedActionAuditRows
    .slice(0, 6)
    .map((item) => {
      const metadata =
        item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata)
          ? (item.metadata as Record<string, unknown>)
          : null;
      const extra =
        metadata?.extra && typeof metadata.extra === "object" && !Array.isArray(metadata.extra)
          ? (metadata.extra as Record<string, unknown>)
          : null;
      return typeof extra?.source === "string" ? extra.source : null;
    })
    .filter((item): item is string => Boolean(item));
  const sourceCounts = recentSources.reduce<Record<string, number>>((acc, source) => {
    acc[source] = (acc[source] ?? 0) + 1;
    return acc;
  }, {});
  const sortedSources = Object.entries(sourceCounts).sort((a, b) => b[1] - a[1]);
  const dominantSource =
    sortedSources.length === 0
      ? "unknown"
      : sortedSources.length > 1 && sortedSources[0]?.[1] === sortedSources[1]?.[1]
        ? "mixed"
        : sortedSources[0]?.[0] ?? "unknown";
  const resolveDominantSource = (
    rows: typeof recommendedActionAuditRows
  ) => {
    const filteredSources = rows
      .slice(0, 6)
      .map((item) => {
        const metadata =
          item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata)
            ? (item.metadata as Record<string, unknown>)
            : null;
        const extra =
          metadata?.extra && typeof metadata.extra === "object" && !Array.isArray(metadata.extra)
            ? (metadata.extra as Record<string, unknown>)
            : null;
        return typeof extra?.source === "string" ? extra.source : null;
      })
      .filter((item): item is string => Boolean(item));
    const filteredCounts = filteredSources.reduce<Record<string, number>>((acc, source) => {
      acc[source] = (acc[source] ?? 0) + 1;
      return acc;
    }, {});
    const sortedFilteredSources = Object.entries(filteredCounts).sort((a, b) => b[1] - a[1]);
    return sortedFilteredSources.length === 0
      ? "unknown"
      : sortedFilteredSources.length > 1 && sortedFilteredSources[0]?.[1] === sortedFilteredSources[1]?.[1]
        ? "mixed"
        : sortedFilteredSources[0]?.[0] ?? "unknown";
  };
  const resolveDominantSurface = (
    rows: typeof recommendedActionAuditRows
  ) => {
    const recentSurfaces = rows
      .slice(0, 6)
      .map((item) => {
        const metadata =
          item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata)
            ? (item.metadata as Record<string, unknown>)
            : null;
        const resolverAuditEvent =
          metadata?.resolverAuditEvent &&
          typeof metadata.resolverAuditEvent === "object" &&
          !Array.isArray(metadata.resolverAuditEvent)
            ? (metadata.resolverAuditEvent as Record<string, unknown>)
            : null;
        return typeof resolverAuditEvent?.surfaceId === "string" ? resolverAuditEvent.surfaceId : null;
      })
      .filter((item): item is string => Boolean(item));
    const surfaceCounts = recentSurfaces.reduce<Record<string, number>>((acc, surface) => {
      acc[surface] = (acc[surface] ?? 0) + 1;
      return acc;
    }, {});
    const sortedSurfaces = Object.entries(surfaceCounts).sort((a, b) => b[1] - a[1]);
    return sortedSurfaces.length === 0
      ? "unknown"
      : sortedSurfaces.length > 1 && sortedSurfaces[0]?.[1] === sortedSurfaces[1]?.[1]
        ? "mixed"
        : sortedSurfaces[0]?.[0] ?? "unknown";
  };
  const dominantAlignedSurface = resolveDominantSurface(
    recommendedActionAuditRows.filter((item) => item.eventType === "experience.recommended_action.aligned")
  );
  const dominantDivergedSurface = resolveDominantSurface(
    recommendedActionAuditRows.filter((item) => item.eventType === "experience.recommended_action.diverged")
  );
  const dominantAlignedSource = resolveDominantSource(
    recommendedActionAuditRows.filter((item) => item.eventType === "experience.recommended_action.aligned")
  );
  const dominantDivergedSource = resolveDominantSource(
    recommendedActionAuditRows.filter((item) => item.eventType === "experience.recommended_action.diverged")
  );
  const convergenceSummary =
    alignedCount === 0
      ? `Nenhuma convergência recente entre landing e ação primária na janela ${diagnosticsWindow}.`
      : dominantAlignedSource === "unknown" && dominantAlignedSurface === "unknown"
        ? `Há ${alignedCount} convergência(s) na janela ${diagnosticsWindow}, mas sem concentração clara de origem ou surface.`
        : `As convergências na janela ${diagnosticsWindow} estão mais concentradas em origem ${dominantAlignedSource} e surface ${dominantAlignedSurface}.`;
  const divergenceSummary =
    divergedCount === 0
      ? `Nenhuma divergência recente entre landing e ação primária na janela ${diagnosticsWindow}.`
      : dominantDivergedSource === "unknown" && dominantDivergedSurface === "unknown"
        ? `Há ${divergedCount} divergência(s) na janela ${diagnosticsWindow}, mas sem concentração clara de origem ou surface.`
        : `As divergências na janela ${diagnosticsWindow} estão mais concentradas em origem ${dominantDivergedSource} e surface ${dominantDivergedSurface}.`;

  const recommendedActionSummary = {
    aligned: alignedCount,
    diverged: divergedCount,
    alignmentRate,
    alignmentStatus,
    alignmentSummary,
    dominantSource,
    dominantAlignedSource,
    dominantDivergedSource,
    dominantAlignedSurface,
    dominantDivergedSurface,
    convergenceSummary,
    divergenceSummary,
    latestEventAt: recommendedActionAuditRows[0]?.createdAt ?? null,
    recentEvents: recommendedActionAuditRows.slice(0, 6).map((item) => {
      const metadata =
        item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata)
          ? (item.metadata as Record<string, unknown>)
          : null;
      const resolverAuditEvent =
        metadata?.resolverAuditEvent &&
        typeof metadata.resolverAuditEvent === "object" &&
        !Array.isArray(metadata.resolverAuditEvent)
          ? (metadata.resolverAuditEvent as Record<string, unknown>)
          : null;
      const extra =
        metadata?.extra && typeof metadata.extra === "object" && !Array.isArray(metadata.extra)
          ? (metadata.extra as Record<string, unknown>)
          : null;
      return {
        eventType: item.eventType,
        message: item.message,
        createdAt: item.createdAt,
        surfaceId: typeof resolverAuditEvent?.surfaceId === "string" ? resolverAuditEvent.surfaceId : null,
        landingPath: typeof extra?.landingPath === "string" ? extra.landingPath : null,
        primaryActionId: typeof extra?.primaryActionId === "string" ? extra.primaryActionId : null,
        primaryActionPath: typeof extra?.primaryActionPath === "string" ? extra.primaryActionPath : null,
        source: typeof extra?.source === "string" ? extra.source : null,
      };
    }),
  };
  const diagnosticSnapshot = buildExperienceDiagnosticSnapshot({
    window: diagnosticsWindow,
    totals: {
      aligned: alignedCount,
      diverged: divergedCount,
    },
    alignment: {
      rate: alignmentRate,
      status: alignmentStatus,
      summary: alignmentSummary,
      dominantSource,
      dominantAlignedSource,
      dominantDivergedSource,
      dominantAlignedSurface,
      dominantDivergedSurface,
      convergenceSummary,
      divergenceSummary,
    },
    latestEventAt: recommendedActionAuditRows[0]?.createdAt ?? null,
    recentEvents: recommendedActionSummary.recentEvents,
  });
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
      roleKey: workspaceSummary.selectedRoleKey ?? "",
      roleLabel: workspaceSummary.selectedRoleLabel ?? "",
      responsibleLabel: workspaceSummary.responsibleLabel,
      roleOptions: workspaceSummary.options,
      permissions: workspaceSummary.permissions,
      canManageMembers: workspaceSummary.canManageMembers,
      members: workspaceSummary.members,
      invitations: workspaceSummary.invitations,
    },
    experienceDiagnostics: {
      window: diagnosticsWindow,
      diagnosticSnapshot,
      frictionSummary: operationalInsight.frictionSummary,
      optimizationSnapshot: operationalInsight.optimizationSnapshot,
      economyOpportunitySnapshot: operationalInsight.economyOpportunitySnapshot,
      operationalInsightSnapshot: operationalInsight.operationalInsightSnapshot,
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
  const normalizedWorkspaceRoleOptions = payload.workspaceRoleOptions?.flatMap((item) => {
    if (typeof item === "string") {
      const label = item.trim();
      return label ? [{ label }] : [];
    }
    const label = item.label.trim();
    if (!label) return [];
    return [{
      label,
      permissions: item.permissions?.map((permission) => permission.trim()).filter(Boolean),
    }];
  });

  if (normalizedWorkspaceName && isReservedDefaultWorkspaceName(normalizedWorkspaceName)) {
    const allowed = await canTenantUseReservedDefaultWorkspaceName({
      prisma: prismaGlobal,
      tenantId: authContext.tenantId,
    });
    if (!allowed) {
      return res.status(403).json({
        ok: false,
        error: {
          code: "WORKSPACE_NAME_RESERVED",
          message: `Workspace ${normalizedWorkspaceName.toUpperCase()} is reserved for tenant ${RESERVED_DEFAULT_WORKSPACE_ALLOWED_TENANT}`,
        },
      });
    }

    const alreadyExists = await tenantAlreadyHasReservedDefaultWorkspace({
      prisma: prismaGlobal,
      tenantId: authContext.tenantId,
      excludeWorkspaceId: authContext.workspaceId,
    });
    if (alreadyExists) {
      return res.status(409).json({
        ok: false,
        error: {
          code: "DEFAULT_WORKSPACE_ALREADY_EXISTS",
          message: "O workspace DEFAULT já existe neste tenant.",
        },
      });
    }
  }

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

      if (normalizedWorkspaceRoleOptions !== undefined) {
        await upsertWorkspaceRoleConfig({
          prisma: tx,
          tenantId: authContext.tenantId,
          workspaceId: authContext.workspaceId,
          userId: authContext.userId!,
          roleLabels: normalizedWorkspaceRoleOptions,
          selectedRoleKey: null,
        });
      }
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

profileRouter.post("/profile/workspace-members/invitations", async (req, res) => {
  const typedReq = req as TenantAwareRequest;
  const authContext = typedReq.authContext;
  if (!authContext?.userId) {
    return res.status(409).json({
      ok: false,
      error: {
        code: "USER_CONTEXT_REQUIRED",
        message: "Authenticated user context is required for workspace invitations",
      },
    });
  }

  const parsed = workspaceInvitationSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_PAYLOAD", details: parsed.error.flatten() },
    });
  }

  try {
    const invitation = await createWorkspaceInvitation({
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      invitedByUserId: authContext.userId,
      email: parsed.data.email,
      fullName: parsed.data.fullName,
      roleKey: parsed.data.roleKey,
      permissions: parsed.data.permissions,
    });
    return res.status(201).json({ ok: true, data: invitation });
  } catch (error) {
    const maybe = error as { code?: string; status?: number; message?: string };
    if (maybe?.status) {
      return res.status(maybe.status).json({
        ok: false,
        error: { code: maybe.code ?? "WORKSPACE_INVITATION_FAILED", message: maybe.message ?? "Invitation failed" },
      });
    }
    typedReq.logger?.error({ error }, "workspace.invitation_failed");
    return res.status(500).json({
      ok: false,
      error: { code: "WORKSPACE_INVITATION_FAILED", message: "Failed to create workspace invitation" },
    });
  }
});

export { profileRouter };
