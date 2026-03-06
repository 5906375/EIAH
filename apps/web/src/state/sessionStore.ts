import { useSyncExternalStore } from "react";

type SessionState = {
  tenantId: string;
  workspaceId: string;
  userId?: string;
  token?: string;
};

const DEFAULTS: SessionState = {
  tenantId: import.meta.env.VITE_TENANT_ID || "tenant-demo",
  workspaceId: import.meta.env.VITE_WORKSPACE_ID || "workspace-demo",
  token: import.meta.env.VITE_API_TOKEN || undefined,
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
    storage.setItem(LOGOUT_FLAG_KEY, "1");
  }

  notify({
    tenantId: DEFAULTS.tenantId,
    workspaceId: DEFAULTS.workspaceId,
    token: undefined,
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
