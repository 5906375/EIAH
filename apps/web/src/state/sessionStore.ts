import { useSyncExternalStore } from "react";

const BASE_URL = import.meta.env.VITE_API_URL || "https://dev.api.eiah.ai/api";

type SessionState = {
  tenantId: string;
  workspaceId: string;
  userId?: string;
};

const DEFAULTS: SessionState = {
  tenantId: import.meta.env.VITE_TENANT_ID || "tenant-demo",
  workspaceId: import.meta.env.VITE_WORKSPACE_ID || "workspace-demo",
};

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
    };
  }

  return {
    tenantId: storage.getItem("tenant_id") || DEFAULTS.tenantId,
    workspaceId:
      storage.getItem("workspace_id") ||
      storage.getItem("project_id") ||
      DEFAULTS.workspaceId,
    userId: storage.getItem("user_id") || undefined,
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

async function readProfileOverrides() {
  try {
    if (typeof window === "undefined") return null;
    const response = await fetch(`${BASE_URL}/auth/me`, { credentials: "include" });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      data?: { role?: string; tenantId?: string; workspaceId?: string };
    };
    if (!data?.data) return null;
    const roleRaw = (data.data.role ?? "").toLowerCase();
    const persona =
      roleRaw.includes("auditor")
        ? "global_auditor"
        : roleRaw.includes("operator")
        ? "tenant_operator"
        : roleRaw.includes("viewer")
        ? "tenant_viewer"
        : roleRaw.includes("admin")
        ? "tenant_admin"
        : "tenant_admin";

    return {
      persona,
      tenantId: data.data.tenantId?.trim() || undefined,
      workspaceId: data.data.workspaceId?.trim() || undefined,
    };
  } catch {
    return null;
  }
}

export async function syncSessionWithProfile() {
  const overrides = await readProfileOverrides();
  if (!overrides) return;
  const next: Partial<SessionState> = {};
  if (overrides.tenantId && overrides.tenantId !== state.tenantId) {
    next.tenantId = overrides.tenantId;
  }
  if (overrides.workspaceId && overrides.workspaceId !== state.workspaceId) {
    next.workspaceId = overrides.workspaceId;
  }
  if (Object.keys(next).length === 0) return;
  updateSession(next);
}

export async function getActivePersonaFromProfile(): Promise<
  "eiah_admin" | "global_auditor" | "tenant_admin" | "tenant_operator" | "tenant_viewer"
> {
  const overrides = await readProfileOverrides();
  return overrides?.persona ?? "tenant_admin";
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
  }

  notify({
    tenantId: DEFAULTS.tenantId,
    workspaceId: DEFAULTS.workspaceId,
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
