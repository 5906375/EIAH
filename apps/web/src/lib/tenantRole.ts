import { useEffect, useMemo, useState } from "react";

export type TenantRole = "tenant_admin" | "tenant_operator" | "tenant_viewer";

const ROLE_STORAGE_KEY = "eiah_profile_active_role";

export function resolveTenantRole(raw?: string | null): TenantRole {
  const value = (raw ?? "").trim().toLowerCase();
  if (value.includes("viewer")) return "tenant_viewer";
  if (value.includes("operator")) return "tenant_operator";
  if (value.includes("admin") || value.includes("eiah")) return "tenant_admin";
  if (value.includes("global")) return "tenant_admin";
  return "tenant_admin";
}

export function getStoredTenantRole(): TenantRole {
  if (typeof window === "undefined") return "tenant_admin";
  return resolveTenantRole(window.localStorage.getItem(ROLE_STORAGE_KEY));
}

export function useTenantRole(): TenantRole {
  const [role, setRole] = useState<TenantRole>(() => getStoredTenantRole());

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === ROLE_STORAGE_KEY) {
        setRole(resolveTenantRole(event.newValue));
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  return useMemo(() => role, [role]);
}

export function canAdminTenant(role: TenantRole) {
  return role === "tenant_admin";
}

export function canExecuteRuns(role: TenantRole) {
  return role === "tenant_admin" || role === "tenant_operator";
}

export function allowedRolesForMembership(role: TenantRole): TenantRole[] {
  if (role === "tenant_admin") return ["tenant_admin", "tenant_operator", "tenant_viewer"];
  if (role === "tenant_operator") return ["tenant_operator", "tenant_viewer"];
  return ["tenant_viewer"];
}
