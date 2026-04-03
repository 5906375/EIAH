import { useSyncExternalStore } from "react";

const VITE_ENV = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env ?? {};

type SessionState = {
  tenantId: string;
  workspaceId: string;
  userId?: string;
  token?: string;
  activeDomain?: "core" | "imob";
  availableDomains?: Array<"core" | "imob">;
  entitlements?: {
    REAL_ESTATE_CORE?: boolean;
    EXPORTS_ADDON?: boolean;
    BILLING_INSIGHTS_ADDON?: boolean;
    IMOB_INSTALLED?: boolean;
  };
  installedProducts?: string[];
  verticals?: Array<{
    verticalId: "IMOB" | "LEGAL" | "HEALTH";
    label: string;
    activeDomain: "core" | "imob";
    installedProduct: string | null;
    rolloutStage: "context_only" | "installed_surface" | "operationalized";
    enabled: boolean;
    frontDoorSurface:
      | "runs"
      | "billing"
      | "economy"
      | "self_service"
      | "agents"
      | "marketplace"
      | "profile"
      | "imob_chat"
      | "imob_dashboard"
      | null;
    operationalHubSurface:
      | "runs"
      | "billing"
      | "economy"
      | "self_service"
      | "agents"
      | "marketplace"
      | "profile"
      | "imob_chat"
      | "imob_dashboard"
      | null;
    governanceHubSurface:
      | "runs"
      | "billing"
      | "economy"
      | "self_service"
      | "agents"
      | "marketplace"
      | "profile"
      | "imob_chat"
      | "imob_dashboard"
      | null;
    investigationSurfaces: Array<
      | "runs"
      | "billing"
      | "economy"
      | "self_service"
      | "agents"
      | "marketplace"
      | "profile"
      | "imob_chat"
      | "imob_dashboard"
    >;
    contextSpecRef: string;
  }>;
  roles?: string[];
  experience?: {
    resolverVersion: string;
    roleProfile?: "workspace_member" | "workspace_admin" | "tenant_admin" | "founder_global" | "service_operator";
    landingSurface:
      | "runs"
      | "billing"
      | "economy"
      | "self_service"
      | "agents"
      | "marketplace"
      | "profile"
      | "imob_chat"
      | "imob_dashboard";
    landingPath: string;
    primaryNavigation: Array<{
      surfaceId:
        | "runs"
        | "billing"
        | "economy"
        | "self_service"
        | "agents"
        | "marketplace"
        | "profile"
        | "imob_chat"
        | "imob_dashboard";
      path: string;
      label: string;
    }>;
    recommendedActions: Array<{
      actionId: string;
      surfaceId:
        | "runs"
        | "billing"
        | "economy"
        | "self_service"
        | "agents"
        | "marketplace"
        | "profile"
        | "imob_chat"
        | "imob_dashboard";
      path: string;
      label: string;
      priority: "primary" | "secondary";
    }>;
    allowedSurfaceClasses: Array<
      "front_door" | "operational_hub" | "governance_hub" | "investigation_surface"
    >;
    fallbackMode: "fail_closed" | "core_safe_default" | "context_incomplete";
    cachePolicy: {
      strategy: "session_context_only";
      sourceOfTruth: "runtime";
      mode: "fail_safe_accelerator";
    };
  };
  branding?: {
    brandName?: string;
    logoUrl?: string | null;
    primaryColor?: string;
    workspaceLabel?: string;
  };
  accessGate?: {
    code?: string;
    reasonCode?: "IMOB_ENTITLEMENT_MISSING" | "IMOB_INSTALLATION_INACTIVE" | "IMOB_PERMISSION_DENIED";
    message?: string;
    traceId?: string;
    product?: "IMOB";
    capability?: "CENTRAL_OPERACIONAL" | "KNOWLEDGE_SYNC_STATUS" | "KNOWLEDGE_SEARCH";
    scope?: {
      tenantId: string;
      workspaceId: string;
    };
    cta?: {
      type: "INSTALL" | "ACTIVATE" | "CONTACT_ADMIN" | "OPEN_BILLING";
      label: string;
      target: string;
    };
    details?: {
      entitlementRequired?: "IMOB_ACTIVE_INSTALLATION";
      installationStatus?: "missing" | "inactive" | "active";
      stage?: string | null;
    };
  } | null;
};

export type ImobAccessGateState = NonNullable<SessionState["accessGate"]>;
export type AppSessionState = SessionState;

const DEFAULTS: SessionState = {
  tenantId: VITE_ENV.VITE_TENANT_ID || "tenant-demo",
  workspaceId: VITE_ENV.VITE_WORKSPACE_ID || "workspace-demo",
  token: VITE_ENV.VITE_API_TOKEN || undefined,
};
const LOGOUT_FLAG_KEY = "eiah_logged_out";

function safeLocalStorage() {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function loadState(): SessionState {
  const storage = safeLocalStorage();
  if (!storage) {
    return {
      tenantId: DEFAULTS.tenantId,
      workspaceId: DEFAULTS.workspaceId,
      token: DEFAULTS.token,
    };
  }

  const persistedToken = storage.getItem("eiah_token");
  const isLoggedOut = storage.getItem(LOGOUT_FLAG_KEY) === "1";

  return {
    tenantId: storage.getItem("tenant_id") || DEFAULTS.tenantId,
    workspaceId:
      storage.getItem("workspace_id") ||
      storage.getItem("project_id") ||
      DEFAULTS.workspaceId,
    userId: storage.getItem("user_id") || undefined,
    token: persistedToken || (isLoggedOut ? undefined : DEFAULTS.token || undefined),
    activeDomain: (storage.getItem("active_domain") as "core" | "imob" | null) ?? "core",
    installedProducts: (storage.getItem("installed_products") || "")
      .split(",")
      .map((entry) => entry.trim().toUpperCase())
      .filter(Boolean),
    branding: {
      brandName: storage.getItem("brand_name") || undefined,
      logoUrl: storage.getItem("brand_logo_url") || undefined,
      primaryColor: storage.getItem("brand_primary_color") || undefined,
      workspaceLabel: storage.getItem("brand_workspace_label") || undefined,
    },
  };
}

let state = loadState();

const listeners = new Set<(next: SessionState) => void>();

function notify(next: SessionState) {
  state = next;
  listeners.forEach((listener) => listener(state));
}

export function getSession(): SessionState {
  return state;
}

export function subscribeSession(listener: (next: SessionState) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSession(): SessionState {
  return useSyncExternalStore(subscribeSession, () => state, () => state);
}

export function updateSession(patch: Partial<SessionState>) {
  const storage = safeLocalStorage();
  const next: SessionState = {
    ...state,
    ...patch,
  };

  if (storage) {
    if (patch.tenantId !== undefined) storage.setItem("tenant_id", patch.tenantId);
    if (patch.workspaceId !== undefined) storage.setItem("workspace_id", patch.workspaceId);
    if (patch.userId !== undefined) storage.setItem("user_id", patch.userId);
    if (patch.token !== undefined) {
      if (patch.token) {
        storage.setItem("eiah_token", patch.token);
        storage.removeItem(LOGOUT_FLAG_KEY);
      } else {
        storage.removeItem("eiah_token");
        storage.setItem(LOGOUT_FLAG_KEY, "1");
      }
    }
    if (patch.activeDomain !== undefined) storage.setItem("active_domain", patch.activeDomain);
    if (patch.installedProducts !== undefined) {
      storage.setItem("installed_products", patch.installedProducts.join(","));
    }
    if (patch.branding?.brandName !== undefined) storage.setItem("brand_name", patch.branding.brandName || "");
    if (patch.branding?.logoUrl !== undefined) storage.setItem("brand_logo_url", patch.branding.logoUrl || "");
    if (patch.branding?.primaryColor !== undefined) {
      storage.setItem("brand_primary_color", patch.branding.primaryColor || "");
    }
    if (patch.branding?.workspaceLabel !== undefined) {
      storage.setItem("brand_workspace_label", patch.branding.workspaceLabel || "");
    }
  }

  notify(next);
}

export function clearSession() {
  const storage = safeLocalStorage();
  if (storage) {
    storage.removeItem("tenant_id");
    storage.removeItem("workspace_id");
    storage.removeItem("project_id");
    storage.removeItem("user_id");
    storage.removeItem("eiah_token");
    storage.removeItem("active_domain");
    storage.removeItem("installed_products");
    storage.removeItem("brand_name");
    storage.removeItem("brand_logo_url");
    storage.removeItem("brand_primary_color");
    storage.removeItem("brand_workspace_label");
    storage.setItem(LOGOUT_FLAG_KEY, "1");
  }

  notify({
    tenantId: DEFAULTS.tenantId,
    workspaceId: DEFAULTS.workspaceId,
    token: undefined,
    activeDomain: "core",
  });
}

declare global {
  interface Window {
    updateSession?: typeof updateSession;
    getSessionState?: typeof getSession;
    clearSessionState?: typeof clearSession;
  }
}

if (typeof window !== "undefined") {
  window.updateSession = updateSession;
  window.getSessionState = getSession;
  window.clearSessionState = clearSession;
}
