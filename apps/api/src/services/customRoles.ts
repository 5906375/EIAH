import type { PrismaClient } from "@repo/db/client";

const CACHE_TTL_MS = 60_000;
const rolePermissionCache = new Map<
  string,
  { expiresAt: number; permissions: Set<string>; name: string | null }
>();

function cacheKey(tenantId: string, roleId: string) {
  return `${tenantId}:${roleId}`;
}

export async function loadCustomRoleWithPermissions(params: {
  prisma: PrismaClient;
  tenantId: string;
  roleId: string;
}) {
  const key = cacheKey(params.tenantId, params.roleId);
  const cached = rolePermissionCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached;
  }

  const role = await params.prisma.tenantRoleCustom.findFirst({
    where: { id: params.roleId, tenantId: params.tenantId },
    select: {
      id: true,
      name: true,
      permissions: { select: { permissionKey: true } },
    },
  });

  if (!role) {
    rolePermissionCache.delete(key);
    return null;
  }

  const permissions = new Set(
    role.permissions
      .map((entry) => entry.permissionKey)
      .filter((value) => typeof value === "string" && value.length > 0)
  );

  const next = {
    expiresAt: Date.now() + CACHE_TTL_MS,
    permissions,
    name: role.name ?? null,
  };
  rolePermissionCache.set(key, next);
  return next;
}

export function invalidateCustomRoleCache(tenantId: string, roleId: string) {
  rolePermissionCache.delete(cacheKey(tenantId, roleId));
}
