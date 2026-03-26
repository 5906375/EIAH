import crypto from "node:crypto";
import { prismaGlobal } from "@repo/db";

const DEFAULT_WORKSPACE_ROLE_LABELS = ["Founder", "Admin", "Gestor", "Desenvolvedor", "Corretor", "Assistente"] as const;
const DEFAULT_INVITATION_EXPIRY_DAYS = 14;
const IMOB_STAGE_PERMISSION_PREFIX = "imob.stage.";
const IMOB_STAGE_WILDCARD_PERMISSION = `${IMOB_STAGE_PERMISSION_PREFIX}*`;

export const IMOB_STAGE_PERMISSION_OPTIONS = [
  { key: "new", label: "Novo" },
  { key: "collecting", label: "Coleta" },
  { key: "pending_data", label: "Dados pendentes" },
  { key: "ready_for_review", label: "Pronto para revisão" },
  { key: "qualified", label: "Qualificado" },
] as const;

export type WorkspaceRoleOption = {
  key: string;
  label: string;
  defaultPermissions: string[];
};

export type WorkspaceMembershipView = {
  userId: string;
  email: string;
  fullName: string;
  roleKey: string;
  roleLabel: string;
  permissions: string[];
  status: string;
  isCurrentUser: boolean;
  createdAt: string;
};

export type WorkspaceInvitationView = {
  id: string;
  email: string;
  fullName: string;
  roleKey: string;
  roleLabel: string;
  permissions: string[];
  status: string;
  token: string;
  expiresAt: string;
  createdAt: string;
};

let workspaceResponsibilityStoreInitPromise: Promise<void> | null = null;

function titleCaseLabel(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
    .join(" ");
}

export function normalizeWorkspaceRoleKey(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || "funcao";
}

function normalizeWorkspaceRoleLabels(labels?: Array<string | { label: string; permissions?: string[] | null }> | null) {
  const unique = new Map<string, WorkspaceRoleOption>();
  for (const defaultLabel of DEFAULT_WORKSPACE_ROLE_LABELS) {
    const key = normalizeWorkspaceRoleKey(defaultLabel);
    unique.set(key, { key, label: defaultLabel, defaultPermissions: sanitizePermissionsForRole(key) });
  }
  for (const raw of labels ?? []) {
    const sourceLabel = typeof raw === "string" ? raw : raw?.label;
    if (typeof sourceLabel !== "string") continue;
    const trimmed = sourceLabel.trim();
    if (!trimmed) continue;
    const label = titleCaseLabel(trimmed);
    const key = normalizeWorkspaceRoleKey(label);
    const defaultPermissions = sanitizePermissionsForRole(key, typeof raw === "string" ? undefined : raw.permissions);
    unique.set(key, { key, label, defaultPermissions });
  }
  return [...unique.values()];
}

function normalizeImobStageKey(value: string) {
  return normalizeWorkspaceRoleKey(value);
}

export function buildImobStagePermission(stageKey: string) {
  return `${IMOB_STAGE_PERMISSION_PREFIX}${normalizeImobStageKey(stageKey)}`;
}

function listNormalizedStagePermissions(values?: string[] | null) {
  const unique = new Set<string>();
  for (const value of values ?? []) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (trimmed === IMOB_STAGE_WILDCARD_PERMISSION) {
      unique.add(IMOB_STAGE_WILDCARD_PERMISSION);
      continue;
    }
    const normalized = trimmed.startsWith(IMOB_STAGE_PERMISSION_PREFIX)
      ? buildImobStagePermission(trimmed.slice(IMOB_STAGE_PERMISSION_PREFIX.length))
      : null;
    if (normalized) unique.add(normalized);
  }
  return [...unique];
}

export function listPermittedImobStagesFromPermissions(permissions?: string[] | null) {
  return listNormalizedStagePermissions(permissions)
    .filter((permission) => permission !== IMOB_STAGE_WILDCARD_PERMISSION)
    .map((permission) => permission.slice(IMOB_STAGE_PERMISSION_PREFIX.length));
}

export function hasWorkspacePermission(permissions: string[] | null | undefined, permission: string) {
  return safeArray(permissions).includes(permission.trim());
}

export function canWorkspaceOperateImobStage(permissions: string[] | null | undefined, stage: string | null | undefined) {
  const normalizedPermissions = safeArray(permissions);
  if (normalizedPermissions.includes(IMOB_STAGE_WILDCARD_PERMISSION)) return true;
  const normalizedStage = typeof stage === "string" ? normalizeImobStageKey(stage) : "";
  if (!normalizedStage) return true;
  return normalizedPermissions.includes(buildImobStagePermission(normalizedStage));
}

function uniqueNormalizedPermissions(values?: string[] | null) {
  const unique = new Set<string>();
  for (const value of values ?? []) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    unique.add(trimmed);
  }
  return [...unique];
}

function defaultPermissionsForRole(roleKey: string) {
  const normalized = normalizeWorkspaceRoleKey(roleKey);
  if (["gestor", "admin", "founder", "desenvolvedor", "developer"].includes(normalized)) {
    return [
      "workspace.manage_members",
      "workspace.manage_roles",
      "imob.chat.use",
      "imob.case.review",
      IMOB_STAGE_WILDCARD_PERMISSION,
    ];
  }
  if (normalized === "corretor") {
    return ["imob.chat.use", IMOB_STAGE_WILDCARD_PERMISSION];
  }
  if (normalized === "assistente") {
    return ["imob.chat.use"];
  }
  return ["imob.chat.use"];
}

function sanitizePermissionsForRole(roleKey: string, requestedPermissions?: string[] | null) {
  const normalized = normalizeWorkspaceRoleKey(roleKey);
  const basePermissions = defaultPermissionsForRole(normalized);
  if (["gestor", "admin", "founder", "desenvolvedor", "developer", "corretor"].includes(normalized)) {
    return uniqueNormalizedPermissions(basePermissions);
  }
  if (normalized === "assistente") {
    return uniqueNormalizedPermissions([
      ...basePermissions,
      ...listNormalizedStagePermissions(requestedPermissions),
    ]);
  }
  const directPermissions = uniqueNormalizedPermissions((requestedPermissions ?? []).filter(
    (permission) => !permission.startsWith(IMOB_STAGE_PERMISSION_PREFIX)
  ));
  return uniqueNormalizedPermissions([
    ...(directPermissions.length > 0 ? directPermissions : basePermissions),
    ...listNormalizedStagePermissions(requestedPermissions),
  ]);
}

function safeArray(value: unknown): string[] {
  if (Array.isArray(value)) return uniqueNormalizedPermissions(value.map((item) => String(item)));
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? uniqueNormalizedPermissions(parsed.map((item) => String(item))) : [];
    } catch {
      return [];
    }
  }
  return [];
}

async function ensureLegacyAssignmentStore(prisma: any) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS eiah_workspace_role_assignments (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      role_key TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, workspace_id)
    );
  `);
}

export async function ensureWorkspaceResponsibilityStore(prisma: any = prismaGlobal) {
  if (!workspaceResponsibilityStoreInitPromise) {
    workspaceResponsibilityStoreInitPromise = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS eiah_workspace_roles (
          tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
          role_key TEXT NOT NULL,
          label TEXT NOT NULL,
          default_permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (tenant_id, workspace_id, role_key)
        );
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE eiah_workspace_roles
        ADD COLUMN IF NOT EXISTS default_permissions JSONB NOT NULL DEFAULT '[]'::jsonb;
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS eiah_workspace_roles_lookup_idx
        ON eiah_workspace_roles (tenant_id, workspace_id, updated_at DESC);
      `);
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS eiah_workspace_memberships (
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
          role_key TEXT NOT NULL,
          permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
          status TEXT NOT NULL DEFAULT 'active',
          invited_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (user_id, workspace_id)
        );
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS eiah_workspace_memberships_lookup_idx
        ON eiah_workspace_memberships (tenant_id, workspace_id, status, updated_at DESC);
      `);
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS eiah_workspace_invitations (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
          email TEXT NOT NULL,
          full_name TEXT,
          role_key TEXT NOT NULL,
          permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
          status TEXT NOT NULL DEFAULT 'pending',
          token TEXT NOT NULL UNIQUE,
          expires_at TIMESTAMPTZ NOT NULL,
          invited_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
          accepted_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
          accepted_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS eiah_workspace_invitations_lookup_idx
        ON eiah_workspace_invitations (tenant_id, workspace_id, status, updated_at DESC);
      `);
      await ensureLegacyAssignmentStore(prisma);
    })().then(() => undefined);
  }
  return workspaceResponsibilityStoreInitPromise;
}

async function ensureWorkspaceRoleCatalog(params: {
  prisma?: any;
  tenantId: string;
  workspaceId: string;
  roleLabels?: Array<string | { label: string; permissions?: string[] | null }> | null;
}) {
  const prisma = params.prisma ?? prismaGlobal;
  await ensureWorkspaceResponsibilityStore(prisma);
  const existingRows = await prisma.$queryRaw<Array<{ role_key: string; label: string; default_permissions: unknown }>>`
    SELECT role_key, label, default_permissions
    FROM eiah_workspace_roles
    WHERE tenant_id = ${params.tenantId}
      AND workspace_id = ${params.workspaceId}
  `;
  if (params.roleLabels === undefined) {
    if (existingRows.length > 0) {
      return normalizeWorkspaceRoleLabels(existingRows.map((row) => ({
        label: row.label,
        permissions: safeArray(row.default_permissions),
      })));
    }
  }

  const normalizedOptions = normalizeWorkspaceRoleLabels(params.roleLabels);
  const existingKeys = new Set(existingRows.map((row: { role_key: string }) => row.role_key));

  for (const option of normalizedOptions) {
    await prisma.$executeRaw`
      INSERT INTO eiah_workspace_roles (
        tenant_id, workspace_id, role_key, label, default_permissions, created_at, updated_at
      )
      VALUES (
        ${params.tenantId},
        ${params.workspaceId},
        ${option.key},
        ${option.label},
        ${JSON.stringify(option.defaultPermissions)}::jsonb,
        NOW(),
        NOW()
      )
      ON CONFLICT (tenant_id, workspace_id, role_key)
      DO UPDATE SET
        label = EXCLUDED.label,
        default_permissions = EXCLUDED.default_permissions,
        updated_at = NOW()
    `;
  }

  for (const staleKey of existingKeys) {
    if (normalizedOptions.some((option) => option.key === staleKey)) continue;
    await prisma.$executeRaw`
      DELETE FROM eiah_workspace_roles
      WHERE tenant_id = ${params.tenantId}
        AND workspace_id = ${params.workspaceId}
        AND role_key = ${staleKey}
    `;
  }

  return normalizedOptions;
}

export async function listWorkspaceRoleOptions(params: {
  prisma?: any;
  tenantId: string;
  workspaceId: string;
}): Promise<WorkspaceRoleOption[]> {
  const prisma = params.prisma ?? prismaGlobal;
  await ensureWorkspaceRoleCatalog({ prisma, tenantId: params.tenantId, workspaceId: params.workspaceId });
  const rows = await prisma.$queryRaw<Array<{ role_key: string; label: string; default_permissions: unknown }>>`
    SELECT role_key, label, default_permissions
    FROM eiah_workspace_roles
    WHERE tenant_id = ${params.tenantId}
      AND workspace_id = ${params.workspaceId}
    ORDER BY created_at ASC, label ASC
  `;
  return normalizeWorkspaceRoleLabels(rows.map((row: { label: string; default_permissions: unknown }) => ({
    label: row.label,
    permissions: safeArray(row.default_permissions),
  })));
}

async function upsertWorkspaceMembership(params: {
  prisma?: any;
  tenantId: string;
  workspaceId: string;
  userId: string;
  roleKey: string;
  permissions?: string[] | null;
  invitedByUserId?: string | null;
  status?: string;
}) {
  const prisma = params.prisma ?? prismaGlobal;
  await ensureWorkspaceResponsibilityStore(prisma);
  const roleOptions = await listWorkspaceRoleOptions({ prisma, tenantId: params.tenantId, workspaceId: params.workspaceId });
  const normalizedRoleKey = normalizeWorkspaceRoleKey(params.roleKey);
  const fallbackRole = roleOptions.find((item) => item.key === normalizedRoleKey) ?? roleOptions[0] ?? { key: "corretor", label: "Corretor", defaultPermissions: sanitizePermissionsForRole("corretor") };
  const permissions = sanitizePermissionsForRole(fallbackRole.key, params.permissions?.length ? params.permissions : fallbackRole.defaultPermissions);

  await prisma.$executeRaw`
    INSERT INTO eiah_workspace_memberships (
      user_id, tenant_id, workspace_id, role_key, permissions, status, invited_by_user_id, created_at, updated_at
    )
    VALUES (
      ${params.userId},
      ${params.tenantId},
      ${params.workspaceId},
      ${fallbackRole.key},
      ${JSON.stringify(permissions)}::jsonb,
      ${params.status ?? "active"},
      ${params.invitedByUserId ?? null},
      NOW(),
      NOW()
    )
    ON CONFLICT (user_id, workspace_id)
    DO UPDATE SET
      role_key = EXCLUDED.role_key,
      permissions = EXCLUDED.permissions,
      status = EXCLUDED.status,
      invited_by_user_id = COALESCE(EXCLUDED.invited_by_user_id, eiah_workspace_memberships.invited_by_user_id),
      updated_at = NOW()
  `;

  return {
    roleKey: fallbackRole.key,
    roleLabel: fallbackRole.label,
    permissions,
  };
}

async function bootstrapWorkspaceMembership(params: {
  prisma?: any;
  tenantId: string;
  workspaceId: string;
  userId: string;
}) {
  const prisma = params.prisma ?? prismaGlobal;
  await ensureWorkspaceResponsibilityStore(prisma);

  const [roleOptions, legacyAssignments, profileRows, membershipCountRows] = await Promise.all([
    listWorkspaceRoleOptions({ prisma, tenantId: params.tenantId, workspaceId: params.workspaceId }),
    prisma.$queryRaw<Array<{ role_key: string }>>`
      SELECT role_key
      FROM eiah_workspace_role_assignments
      WHERE user_id = ${params.userId}
        AND tenant_id = ${params.tenantId}
        AND workspace_id = ${params.workspaceId}
      LIMIT 1
    `.catch(() => []),
    prisma.$queryRaw<Array<{ role: string | null }>>`
      SELECT role
      FROM eiah_user_profiles
      WHERE user_id = ${params.userId}
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
      LIMIT 1
    `.catch(() => []),
    prisma.$queryRaw<Array<{ total: bigint | number }>>`
      SELECT COUNT(*)::bigint AS total
      FROM eiah_workspace_memberships
      WHERE tenant_id = ${params.tenantId}
        AND workspace_id = ${params.workspaceId}
    `,
  ]);

  const legacyRoleKey = legacyAssignments[0]?.role_key ? normalizeWorkspaceRoleKey(legacyAssignments[0].role_key) : null;
  const profileRoleKey = profileRows[0]?.role?.trim() ? normalizeWorkspaceRoleKey(profileRows[0].role!.trim()) : null;
  const workspaceHasMembers = Number(membershipCountRows[0]?.total ?? 0) > 0;
  const fallbackRoleKey =
    (!workspaceHasMembers && roleOptions.some((item) => item.key === "gestor") ? "gestor" : null) ??
    (legacyRoleKey && roleOptions.some((item) => item.key === legacyRoleKey) ? legacyRoleKey : null) ??
    (profileRoleKey && roleOptions.some((item) => item.key === profileRoleKey) ? profileRoleKey : null) ??
    (roleOptions.some((item) => item.key === "corretor") ? "corretor" : roleOptions[0]?.key ?? "corretor");

  return upsertWorkspaceMembership({
    prisma,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    userId: params.userId,
    roleKey: fallbackRoleKey,
    permissions: sanitizePermissionsForRole(fallbackRoleKey),
  });
}

async function promoteSoleWorkspaceMemberIfNeeded(params: {
  prisma?: any;
  tenantId: string;
  workspaceId: string;
  userId: string;
  membership: { role_key?: string | null; permissions?: unknown; status?: string | null };
}) {
  const prisma = params.prisma ?? prismaGlobal;
  const currentRoleKey = normalizeWorkspaceRoleKey(params.membership.role_key ?? "corretor");
  if (["founder", "admin", "gestor", "desenvolvedor", "developer"].includes(currentRoleKey)) {
    return params.membership;
  }
  const countRows = await prisma.$queryRaw<Array<{ total: bigint | number }>>`
    SELECT COUNT(*)::bigint AS total
    FROM eiah_workspace_memberships
    WHERE tenant_id = ${params.tenantId}
      AND workspace_id = ${params.workspaceId}
      AND status = 'active'
  `;
  if (Number(countRows[0]?.total ?? 0) !== 1) {
    return params.membership;
  }
  const promoted = await upsertWorkspaceMembership({
    prisma,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    userId: params.userId,
    roleKey: "founder",
    permissions: sanitizePermissionsForRole("founder"),
    status: params.membership.status ?? "active",
  });
  return {
    role_key: promoted.roleKey,
    permissions: promoted.permissions,
    status: params.membership.status ?? "active",
  };
}

async function readCurrentMembership(params: {
  prisma?: any;
  tenantId: string;
  workspaceId: string;
  userId: string;
}) {
  const prisma = params.prisma ?? prismaGlobal;
  await ensureWorkspaceResponsibilityStore(prisma);
  const rows = await prisma.$queryRaw<Array<{ role_key: string; permissions: unknown; status: string }>>`
    SELECT role_key, permissions, status
    FROM eiah_workspace_memberships
    WHERE user_id = ${params.userId}
      AND tenant_id = ${params.tenantId}
      AND workspace_id = ${params.workspaceId}
    LIMIT 1
  `;
  if (rows[0]) {
    return promoteSoleWorkspaceMemberIfNeeded({
      prisma,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      userId: params.userId,
      membership: rows[0],
    });
  }
  return bootstrapWorkspaceMembership(params);
}

export async function listWorkspaceMembers(params: {
  prisma?: any;
  tenantId: string;
  workspaceId: string;
  currentUserId?: string | null;
}): Promise<WorkspaceMembershipView[]> {
  const prisma = params.prisma ?? prismaGlobal;
  await ensureWorkspaceResponsibilityStore(prisma);
  const roleOptions = await listWorkspaceRoleOptions({ prisma, tenantId: params.tenantId, workspaceId: params.workspaceId });
  const rows = await prisma.$queryRaw<Array<{
    user_id: string;
    email: string;
    display_name: string | null;
    role_key: string;
    permissions: unknown;
    status: string;
    created_at: Date;
  }>>`
    SELECT
      membership.user_id,
      usr.email,
      usr.display_name,
      membership.role_key,
      membership.permissions,
      membership.status,
      membership.created_at
    FROM eiah_workspace_memberships AS membership
    JOIN users AS usr ON usr.id = membership.user_id
    WHERE membership.tenant_id = ${params.tenantId}
      AND membership.workspace_id = ${params.workspaceId}
    ORDER BY membership.created_at ASC, usr.email ASC
  `;
  return rows.map((row: {
    user_id: string;
    email: string;
    display_name: string | null;
    role_key: string;
    permissions: unknown;
    status: string;
    created_at: Date;
  }) => ({
    userId: row.user_id,
    email: row.email,
    fullName: row.display_name?.trim() || row.email,
    roleKey: row.role_key,
    roleLabel: roleOptions.find((item) => item.key === row.role_key)?.label ?? titleCaseLabel(row.role_key.replace(/_/g, " ")),
    permissions: safeArray(row.permissions),
    status: row.status,
    isCurrentUser: params.currentUserId === row.user_id,
    createdAt: row.created_at.toISOString(),
  }));
}

export async function listWorkspaceInvitations(params: {
  prisma?: any;
  tenantId: string;
  workspaceId: string;
}): Promise<WorkspaceInvitationView[]> {
  const prisma = params.prisma ?? prismaGlobal;
  await ensureWorkspaceResponsibilityStore(prisma);
  const roleOptions = await listWorkspaceRoleOptions({ prisma, tenantId: params.tenantId, workspaceId: params.workspaceId });
  const rows = await prisma.$queryRaw<Array<{
    id: string;
    email: string;
    full_name: string | null;
    role_key: string;
    permissions: unknown;
    status: string;
    token: string;
    expires_at: Date;
    created_at: Date;
  }>>`
    SELECT id, email, full_name, role_key, permissions, status, token, expires_at, created_at
    FROM eiah_workspace_invitations
    WHERE tenant_id = ${params.tenantId}
      AND workspace_id = ${params.workspaceId}
    ORDER BY created_at DESC
  `;
  return rows.map((row: {
    id: string;
    email: string;
    full_name: string | null;
    role_key: string;
    permissions: unknown;
    status: string;
    token: string;
    expires_at: Date;
    created_at: Date;
  }) => ({
    id: row.id,
    email: row.email,
    fullName: row.full_name?.trim() || row.email,
    roleKey: row.role_key,
    roleLabel: roleOptions.find((item) => item.key === row.role_key)?.label ?? titleCaseLabel(row.role_key.replace(/_/g, " ")),
    permissions: safeArray(row.permissions),
    status: row.status,
    token: row.token,
    expiresAt: row.expires_at.toISOString(),
    createdAt: row.created_at.toISOString(),
  }));
}

export async function readWorkspaceManagementSummary(params: {
  prisma?: any;
  tenantId: string;
  workspaceId: string;
  userId: string;
}) {
  const prisma = params.prisma ?? prismaGlobal;
  await ensureWorkspaceResponsibilityStore(prisma);
  const [user, membershipRow, roleOptions, members, invitations] = await Promise.all([
    prisma.user.findUnique({
      where: { id: params.userId },
      select: { id: true, email: true, displayName: true },
    }),
    readCurrentMembership(params),
    listWorkspaceRoleOptions({ prisma, tenantId: params.tenantId, workspaceId: params.workspaceId }),
    listWorkspaceMembers({ prisma, tenantId: params.tenantId, workspaceId: params.workspaceId, currentUserId: params.userId }),
    listWorkspaceInvitations({ prisma, tenantId: params.tenantId, workspaceId: params.workspaceId }),
  ]);

  const selectedRoleKey = membershipRow?.role_key ?? membershipRow?.roleKey ?? null;
  const selectedRoleLabel = roleOptions.find((item) => item.key === selectedRoleKey)?.label ?? null;
  const identityName = user?.displayName?.trim() || user?.email?.trim() || null;
  const responsibleLabel = identityName && selectedRoleLabel
    ? `${identityName} (${selectedRoleLabel})`
    : identityName || selectedRoleLabel || "Responsável não definido";
  const permissions = safeArray((membershipRow as { permissions?: unknown } | null)?.permissions);
  const canManageMembers = permissions.includes("workspace.manage_members") || permissions.includes("workspace.manage_roles");

  return {
    options: roleOptions,
    selectedRoleKey,
    selectedRoleLabel,
    responsibleLabel,
    identityName,
    permissions,
    canManageMembers,
    members,
    invitations,
  };
}

export async function readWorkspaceResponsibleProfile(params: {
  prisma?: any;
  tenantId: string;
  workspaceId: string;
  userId: string;
}) {
  const summary = await readWorkspaceManagementSummary(params);
  return {
    options: summary.options,
    selectedRoleKey: summary.selectedRoleKey,
    selectedRoleLabel: summary.selectedRoleLabel,
    responsibleLabel: summary.responsibleLabel,
    identityName: summary.identityName,
    permissions: summary.permissions,
    canManageMembers: summary.canManageMembers,
  };
}

export async function upsertWorkspaceRoleConfig(params: {
  prisma?: any;
  tenantId: string;
  workspaceId: string;
  userId: string;
  roleLabels?: Array<string | { label: string; permissions?: string[] | null }> | null;
  selectedRoleKey?: string | null;
}) {
  const prisma = params.prisma ?? prismaGlobal;
  const options = await ensureWorkspaceRoleCatalog({
    prisma,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    roleLabels: params.roleLabels,
  });
  const selectedRoleKey = params.selectedRoleKey ? normalizeWorkspaceRoleKey(params.selectedRoleKey) : null;
  if (selectedRoleKey && options.some((item) => item.key === selectedRoleKey)) {
    const selectedRole = options.find((item) => item.key === selectedRoleKey) ?? null;
    await upsertWorkspaceMembership({
      prisma,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      userId: params.userId,
      roleKey: selectedRoleKey,
      permissions: sanitizePermissionsForRole(selectedRoleKey, selectedRole?.defaultPermissions),
    });
  }
  return { options, selectedRoleKey };
}

export async function ensureWorkspaceMembershipForUser(params: {
  prisma?: any;
  tenantId: string;
  workspaceId: string;
  userId: string;
  roleKey?: string | null;
  permissions?: string[] | null;
  invitedByUserId?: string | null;
}) {
  return upsertWorkspaceMembership({
    prisma: params.prisma,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    userId: params.userId,
    roleKey: params.roleKey ?? "gestor",
    permissions: sanitizePermissionsForRole(params.roleKey ?? "gestor", params.permissions),
    invitedByUserId: params.invitedByUserId ?? null,
  });
}

export async function createWorkspaceInvitation(params: {
  prisma?: any;
  tenantId: string;
  workspaceId: string;
  invitedByUserId: string;
  email: string;
  fullName?: string | null;
  roleKey: string;
  permissions?: string[] | null;
  expiresInDays?: number;
}) {
  const prisma = params.prisma ?? prismaGlobal;
  await ensureWorkspaceResponsibilityStore(prisma);
  const manager = await readWorkspaceManagementSummary({
    prisma,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    userId: params.invitedByUserId,
  });
  if (!manager.canManageMembers) {
    throw Object.assign(new Error("Current user cannot manage workspace members"), {
      code: "WORKSPACE_MEMBERS_FORBIDDEN",
      status: 403,
    });
  }

  const normalizedEmail = params.email.trim().toLowerCase();
  const normalizedRoleKey = normalizeWorkspaceRoleKey(params.roleKey);
  const roleOptions = await listWorkspaceRoleOptions({ prisma, tenantId: params.tenantId, workspaceId: params.workspaceId });
  const roleLabel = roleOptions.find((item) => item.key === normalizedRoleKey)?.label;
  if (!roleLabel) {
    throw Object.assign(new Error("Workspace role is invalid"), {
      code: "WORKSPACE_ROLE_INVALID",
      status: 400,
    });
  }

  const token = `wsi_${crypto.randomBytes(18).toString("hex")}`;
  const invitationId = `wsi_${crypto.randomUUID()}`;
  const expiresAt = new Date(Date.now() + (params.expiresInDays ?? DEFAULT_INVITATION_EXPIRY_DAYS) * 24 * 60 * 60 * 1000);
  const permissions = sanitizePermissionsForRole(normalizedRoleKey, params.permissions?.length ? params.permissions : roleOptions.find((item) => item.key === normalizedRoleKey)?.defaultPermissions);

  await prisma.$executeRaw`
    INSERT INTO eiah_workspace_invitations (
      id, tenant_id, workspace_id, email, full_name, role_key, permissions, status, token, expires_at, invited_by_user_id, created_at, updated_at
    )
    VALUES (
      ${invitationId},
      ${params.tenantId},
      ${params.workspaceId},
      ${normalizedEmail},
      ${params.fullName?.trim() || null},
      ${normalizedRoleKey},
      ${JSON.stringify(permissions)}::jsonb,
      'pending',
      ${token},
      ${expiresAt},
      ${params.invitedByUserId},
      NOW(),
      NOW()
    )
  `;

  return {
    id: invitationId,
    token,
    email: normalizedEmail,
    fullName: params.fullName?.trim() || normalizedEmail,
    roleKey: normalizedRoleKey,
    roleLabel,
    permissions,
    status: "pending",
    expiresAt: expiresAt.toISOString(),
  };
}

export async function readWorkspaceInvitationByToken(params: { prisma?: any; token: string }) {
  const prisma = params.prisma ?? prismaGlobal;
  await ensureWorkspaceResponsibilityStore(prisma);
  const rows = await prisma.$queryRaw<Array<{
    id: string;
    tenant_id: string;
    workspace_id: string;
    email: string;
    full_name: string | null;
    role_key: string;
    permissions: unknown;
    status: string;
    token: string;
    expires_at: Date;
    created_at: Date;
    tenant_name: string;
    workspace_name: string;
  }>>`
    SELECT
      invitation.id,
      invitation.tenant_id,
      invitation.workspace_id,
      invitation.email,
      invitation.full_name,
      invitation.role_key,
      invitation.permissions,
      invitation.status,
      invitation.token,
      invitation.expires_at,
      invitation.created_at,
      tenant.name AS tenant_name,
      workspace.name AS workspace_name
    FROM eiah_workspace_invitations AS invitation
    JOIN tenants AS tenant ON tenant.id = invitation.tenant_id
    JOIN workspaces AS workspace ON workspace.id = invitation.workspace_id
    WHERE invitation.token = ${params.token}
    LIMIT 1
  `;
  const row = rows[0] ?? null;
  if (!row) return null;
  const roleOptions = await listWorkspaceRoleOptions({ prisma, tenantId: row.tenant_id, workspaceId: row.workspace_id });
  return {
    id: row.id,
    tenantId: row.tenant_id,
    workspaceId: row.workspace_id,
    tenantName: row.tenant_name,
    workspaceName: row.workspace_name,
    email: row.email,
    fullName: row.full_name?.trim() || row.email,
    roleKey: row.role_key,
    roleLabel: roleOptions.find((item) => item.key === row.role_key)?.label ?? titleCaseLabel(row.role_key.replace(/_/g, " ")),
    permissions: safeArray(row.permissions),
    status: row.status,
    token: row.token,
    expiresAt: row.expires_at.toISOString(),
    createdAt: row.created_at.toISOString(),
    expired: row.expires_at.getTime() < Date.now(),
  };
}

export async function acceptWorkspaceInvitation(params: {
  prisma?: any;
  token: string;
  authenticatedUserId?: string | null;
  fullName?: string | null;
  email?: string | null;
  passwordHash?: string | null;
}) {
  const prisma = params.prisma ?? prismaGlobal;
  await ensureWorkspaceResponsibilityStore(prisma);
  const invitation = await readWorkspaceInvitationByToken({ prisma, token: params.token });
  if (!invitation) {
    throw Object.assign(new Error("Workspace invitation not found"), {
      code: "WORKSPACE_INVITATION_NOT_FOUND",
      status: 404,
    });
  }
  if (invitation.status !== "pending") {
    throw Object.assign(new Error("Workspace invitation already processed"), {
      code: "WORKSPACE_INVITATION_NOT_PENDING",
      status: 409,
    });
  }
  if (invitation.expired) {
    throw Object.assign(new Error("Workspace invitation expired"), {
      code: "WORKSPACE_INVITATION_EXPIRED",
      status: 410,
    });
  }

  return prisma.$transaction(async (tx: any) => {
    let user = null as null | { id: string; email: string; displayName: string | null; tenantId: string };
    if (params.authenticatedUserId) {
      user = await tx.user.findUnique({
        where: { id: params.authenticatedUserId },
        select: { id: true, email: true, displayName: true, tenantId: true },
      });
      if (!user) {
        throw Object.assign(new Error("Authenticated user not found"), {
          code: "USER_NOT_FOUND",
          status: 404,
        });
      }
      if (user.email.trim().toLowerCase() !== invitation.email.trim().toLowerCase()) {
        throw Object.assign(new Error("Invitation email does not match the authenticated user"), {
          code: "WORKSPACE_INVITATION_EMAIL_MISMATCH",
          status: 409,
        });
      }
      if (user.tenantId !== invitation.tenantId) {
        throw Object.assign(new Error("Invitation tenant does not match the authenticated user tenant"), {
          code: "WORKSPACE_INVITATION_TENANT_MISMATCH",
          status: 409,
        });
      }
    } else {
      const normalizedEmail = (params.email ?? invitation.email).trim().toLowerCase();
      if (normalizedEmail !== invitation.email.trim().toLowerCase()) {
        throw Object.assign(new Error("Invitation email does not match the submitted email"), {
          code: "WORKSPACE_INVITATION_EMAIL_MISMATCH",
          status: 409,
        });
      }

      user = await tx.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true, email: true, displayName: true, tenantId: true },
      });

      if (user) {
        throw Object.assign(new Error("User already exists for this email. Log in before accepting the invitation."), {
          code: "WORKSPACE_INVITATION_LOGIN_REQUIRED",
          status: 409,
        });
      }

      const fullName = params.fullName?.trim() || invitation.fullName || normalizedEmail;
      user = await tx.user.create({
        data: {
          tenantId: invitation.tenantId,
          email: normalizedEmail,
          displayName: fullName,
        },
        select: { id: true, email: true, displayName: true, tenantId: true },
      });
      const createdUser = user!;

      if (params.passwordHash) {
        await tx.$executeRaw`
          INSERT INTO legacy_auth_credentials (user_id, email, password_hash)
          VALUES (${createdUser.id}, ${normalizedEmail}, ${params.passwordHash})
          ON CONFLICT (user_id)
          DO UPDATE SET
            email = EXCLUDED.email,
            password_hash = EXCLUDED.password_hash,
            updated_at = NOW()
        `;
      }
    }

    if (!user) {
      throw Object.assign(new Error("Workspace invitation user could not be resolved"), {
        code: "WORKSPACE_INVITATION_USER_UNRESOLVED",
        status: 500,
      });
    }

    await upsertWorkspaceMembership({
      prisma: tx,
      tenantId: invitation.tenantId,
      workspaceId: invitation.workspaceId,
      userId: user.id,
      roleKey: invitation.roleKey,
      permissions: invitation.permissions,
      invitedByUserId: null,
      status: "active",
    });

    await tx.$executeRaw`
      UPDATE eiah_workspace_invitations
      SET status = 'accepted',
          accepted_by_user_id = ${user.id},
          accepted_at = NOW(),
          updated_at = NOW()
      WHERE id = ${invitation.id}
    `;

    const existingToken = await tx.apiToken.findFirst({
      where: {
        tenantId: invitation.tenantId,
        workspaceId: invitation.workspaceId,
        userId: user.id,
        revoked: false,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { createdAt: "desc" },
      select: { token: true },
    });
    const token = existingToken?.token ?? `tok_${crypto.randomBytes(24).toString("hex")}`;
    if (!existingToken) {
      await tx.apiToken.create({
        data: {
          token,
          tenantId: invitation.tenantId,
          workspaceId: invitation.workspaceId,
          userId: user.id,
          description: "Workspace invitation acceptance token",
        },
      });
    }

    return {
      token,
      tenantId: invitation.tenantId,
      workspaceId: invitation.workspaceId,
      userId: user.id,
      email: user.email,
      fullName: user.displayName?.trim() || user.email,
      roleKey: invitation.roleKey,
      roleLabel: invitation.roleLabel,
      responsibleLabel: `${user.displayName?.trim() || user.email} (${invitation.roleLabel})`,
    };
  });
}
