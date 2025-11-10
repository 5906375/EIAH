import { useSyncExternalStore } from "react";
const DEFAULTS = {
    tenantId: import.meta.env.VITE_TENANT_ID || "tenant-demo",
    workspaceId: import.meta.env.VITE_WORKSPACE_ID || "workspace-demo",
};
function safeLocalStorage() {
    try {
        if (typeof window === "undefined")
            return null;
        return window.localStorage;
    }
    catch {
        return null;
    }
}
function loadState() {
    const storage = safeLocalStorage();
    if (!storage) {
        return {
            tenantId: DEFAULTS.tenantId,
            workspaceId: DEFAULTS.workspaceId,
        };
    }
    return {
        tenantId: storage.getItem("tenant_id") || DEFAULTS.tenantId,
        workspaceId: storage.getItem("workspace_id") ||
            storage.getItem("project_id") ||
            DEFAULTS.workspaceId,
        userId: storage.getItem("user_id") || undefined,
        token: storage.getItem("eiah_token") || undefined,
    };
}
let state = loadState();
const listeners = new Set();
function notify(next) {
    state = next;
    listeners.forEach((listener) => listener(state));
}
export function getSession() {
    return state;
}
export function subscribeSession(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
export function useSession() {
    return useSyncExternalStore(subscribeSession, () => state, () => state);
}
export function updateSession(patch) {
    const storage = safeLocalStorage();
    const next = {
        ...state,
        ...patch,
    };
    if (storage) {
        if (patch.tenantId !== undefined)
            storage.setItem("tenant_id", patch.tenantId);
        if (patch.workspaceId !== undefined)
            storage.setItem("workspace_id", patch.workspaceId);
        if (patch.userId !== undefined)
            storage.setItem("user_id", patch.userId);
        if (patch.token !== undefined)
            storage.setItem("eiah_token", patch.token);
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
    }
    notify({
        tenantId: DEFAULTS.tenantId,
        workspaceId: DEFAULTS.workspaceId,
    });
}
if (typeof window !== "undefined") {
    window.updateSession = updateSession;
    window.getSessionState = getSession;
    window.clearSessionState = clearSession;
}
