export type RoleProfile =
  | "workspace_member"
  | "workspace_admin"
  | "tenant_admin"
  | "founder_global"
  | "service_operator";

/**
 * Returns true for any role that can access admin-only surfaces
 * (Billing, Economy, diagnostic views).
 */
export function isAdminProfile(roleProfile: RoleProfile | null | undefined): boolean {
  return (
    roleProfile === "workspace_admin" ||
    roleProfile === "tenant_admin" ||
    roleProfile === "founder_global" ||
    roleProfile === "service_operator"
  );
}

/**
 * Returns true for founder_global role, or when the session roles array
 * contains "founder" or "global_admin" (normalized, case-insensitive).
 * Mirrors the legacy hasFounderAccess check in self-service.
 */
export function isFounderAccess(
  roleProfile: RoleProfile | null | undefined,
  roles?: string[] | null,
): boolean {
  if (roleProfile === "founder_global") return true;
  if (!roles?.length) return false;
  const normalized = roles.map((r) =>
    r
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, ""),
  );
  return normalized.includes("founder") || normalized.includes("globaladmin");
}
