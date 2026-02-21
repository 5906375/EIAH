export type TenantRole = "TENANT_ADMIN" | "TENANT_OPERATOR" | "TENANT_VIEWER";
export type MembershipStatus =
  | "INVITED"
  | "PENDING"
  | "ACTIVE"
  | "SUSPENDED"
  | "REJECTED"
  | "DISABLED";
export type LifecycleStatus = "DRAFT" | "ACTIVE" | "DISABLED";

type Limits = Record<string, number | null | undefined>;
type AllowedResources = Record<string, unknown> | Array<unknown>;

export function isTenantAdmin(role: TenantRole) {
  return role === "TENANT_ADMIN";
}

export function validateLimits(limits?: Limits | null) {
  if (!limits || typeof limits !== "object") return false;
  const values = Object.values(limits).filter((value) => typeof value === "number");
  if (values.length === 0) return false;
  return values.every((value) => Number.isFinite(value) && value > 0);
}

export function validateAllowedResources(allowed?: AllowedResources | null) {
  if (!allowed) return false;
  if (Array.isArray(allowed)) return allowed.length > 0;
  return Object.keys(allowed).length > 0;
}

export function canActivateConnector(params: {
  role: TenantRole;
  vaultSecretRef?: string | null;
  allowedResources?: AllowedResources | null;
  limits?: Limits | null;
}) {
  if (!isTenantAdmin(params.role)) return { ok: false, reason: "ROLE_NOT_ALLOWED" };
  if (!params.vaultSecretRef || !params.vaultSecretRef.trim()) {
    return { ok: false, reason: "MISSING_VAULT_SECRET" };
  }
  if (!validateAllowedResources(params.allowedResources)) {
    return { ok: false, reason: "INVALID_ALLOWED_RESOURCES" };
  }
  if (!validateLimits(params.limits)) {
    return { ok: false, reason: "INVALID_LIMITS" };
  }
  return { ok: true };
}

export function canActivateAgentInstall(params: {
  role: TenantRole;
  dependenciesOk: boolean;
}) {
  if (!isTenantAdmin(params.role)) return { ok: false, reason: "ROLE_NOT_ALLOWED" };
  if (!params.dependenciesOk) return { ok: false, reason: "DEPENDENCIES_NOT_READY" };
  return { ok: true };
}

export function enforceNotLastAdmin(params: {
  memberships: ReadonlyArray<{ userId: string; role: TenantRole; status: MembershipStatus }>;
  targetUserId: string;
}) {
  const activeAdmins = params.memberships.filter(
    (m) => m.role === "TENANT_ADMIN" && m.status === "ACTIVE"
  );
  if (activeAdmins.length <= 1 && activeAdmins.some((m) => m.userId === params.targetUserId)) {
    return { ok: false, reason: "LAST_ADMIN_PROTECTED" };
  }
  return { ok: true };
}

export function maskVaultSecretRef(ref?: string | null) {
  if (!ref) return null;
  const trimmed = ref.trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith("vault://")) return "vault://***";
  const withoutScheme = trimmed.replace("vault://", "");
  const parts = withoutScheme.split("/").filter(Boolean);
  if (parts.length <= 1) return "vault://***";
  const maskedParts = [...parts.slice(0, -1), "***"];
  return `vault://${maskedParts.join("/")}`;
}
