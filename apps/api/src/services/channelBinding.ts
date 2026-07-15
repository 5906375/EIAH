type ChannelBindingRecord = {
  tenantId: string | null;
  workspaceId: string | null;
  scope: string | null;
  entitlements: string[];
  allowedScopes: string[];
  sessionExpiresAt: string | null;
};

export type ChannelBindingDecision = {
  allowed: boolean;
  tenantId: string | null;
  workspaceId: string | null;
  scope: string | null;
  entitlement: string;
  reasonCode: string | null;
};

function parseNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseIsoDate(value: unknown): string | null {
  const parsed = parseNonEmptyString(value);
  if (!parsed) return null;
  const asMs = Date.parse(parsed);
  return Number.isFinite(asMs) ? new Date(asMs).toISOString() : null;
}

export function parseChannelBindingsConfig(raw: string | null | undefined) {
  const normalized = raw?.trim();
  if (!normalized) return new Map<string, ChannelBindingRecord>();

  try {
    const parsed = JSON.parse(normalized) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return new Map<string, ChannelBindingRecord>();
    }

    const entries = Object.entries(parsed as Record<string, unknown>).flatMap(([phoneHash, value]) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return [];
      const binding = value as Record<string, unknown>;
      return [[phoneHash, {
        tenantId: parseNonEmptyString(binding.tenantId),
        workspaceId: parseNonEmptyString(binding.workspaceId),
        scope: parseNonEmptyString(binding.scope),
        entitlements: Array.isArray(binding.entitlements)
          ? binding.entitlements.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
          : [],
        allowedScopes: Array.isArray(binding.allowedScopes)
          ? binding.allowedScopes.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
          : [],
        sessionExpiresAt: parseIsoDate(binding.sessionExpiresAt),
      } satisfies ChannelBindingRecord] as const];
    });

    return new Map<string, ChannelBindingRecord>(entries);
  } catch {
    return new Map<string, ChannelBindingRecord>();
  }
}

export function resolveChannelBinding(params: {
  fromPhoneHash: unknown;
  bindingsJson: string | null | undefined;
  nowMs?: number;
  requiredScope: string;
  requiredEntitlement: string;
}): ChannelBindingDecision {
  const fromPhoneHash = parseNonEmptyString(params.fromPhoneHash);
  if (!fromPhoneHash) {
    return {
      allowed: false,
      tenantId: null,
      workspaceId: null,
      scope: null,
      entitlement: params.requiredEntitlement,
      reasonCode: "WHATSAPP_PHONE_NOT_BOUND",
    };
  }

  const binding = parseChannelBindingsConfig(params.bindingsJson).get(fromPhoneHash) ?? null;
  if (!binding) {
    return {
      allowed: false,
      tenantId: null,
      workspaceId: null,
      scope: null,
      entitlement: params.requiredEntitlement,
      reasonCode: "WHATSAPP_PHONE_NOT_BOUND",
    };
  }

  const decisionBase = {
    tenantId: binding.tenantId,
    workspaceId: binding.workspaceId,
    scope: binding.scope,
    entitlement: params.requiredEntitlement,
  };

  if (!binding.tenantId) {
    return { allowed: false, ...decisionBase, reasonCode: "TENANT_NOT_RESOLVED" };
  }
  if (!binding.workspaceId) {
    return { allowed: false, ...decisionBase, reasonCode: "WORKSPACE_NOT_RESOLVED" };
  }

  if (binding.sessionExpiresAt) {
    const nowMs = params.nowMs ?? Date.now();
    const expiresAtMs = Date.parse(binding.sessionExpiresAt);
    if (Number.isFinite(expiresAtMs) && expiresAtMs <= nowMs) {
      return { allowed: false, ...decisionBase, reasonCode: "SESSION_EXPIRED" };
    }
  }

  if (!binding.scope || !binding.allowedScopes.includes(binding.scope) || !binding.allowedScopes.includes(params.requiredScope)) {
    return { allowed: false, ...decisionBase, reasonCode: "ENTITLEMENT_REQUIRED" };
  }
  if (!binding.entitlements.includes(params.requiredEntitlement)) {
    return { allowed: false, ...decisionBase, reasonCode: "ENTITLEMENT_REQUIRED" };
  }

  return {
    allowed: true,
    tenantId: binding.tenantId,
    workspaceId: binding.workspaceId,
    scope: binding.scope,
    entitlement: params.requiredEntitlement,
    reasonCode: null,
  };
}
