import type { PrismaClient } from "@repo/db";

export const RESERVED_DEFAULT_WORKSPACE_NAME = "DEFAULT";
export const RESERVED_DEFAULT_WORKSPACE_ALLOWED_TENANT = "CARLOS ALBERTO MERLO";

export function isReservedDefaultWorkspaceName(name: string) {
  return name.trim().toUpperCase() === RESERVED_DEFAULT_WORKSPACE_NAME;
}

function normalizeTenantName(value: string | null | undefined) {
  return (value ?? "").trim().toUpperCase();
}

export async function canTenantUseReservedDefaultWorkspaceName(params: {
  prisma: PrismaClient;
  tenantId: string;
}) {
  const tenant = await params.prisma.tenant.findUnique({
    where: { id: params.tenantId },
    select: { name: true },
  });
  return (
    normalizeTenantName(tenant?.name) ===
    normalizeTenantName(RESERVED_DEFAULT_WORKSPACE_ALLOWED_TENANT)
  );
}

export async function tenantAlreadyHasReservedDefaultWorkspace(params: {
  prisma: PrismaClient;
  tenantId: string;
  excludeWorkspaceId?: string | null;
}) {
  const existing = await params.prisma.workspace.findFirst({
    where: {
      tenantId: params.tenantId,
      name: RESERVED_DEFAULT_WORKSPACE_NAME,
      ...(params.excludeWorkspaceId ? { id: { not: params.excludeWorkspaceId } } : {}),
    },
    select: { id: true },
  });
  return Boolean(existing);
}
