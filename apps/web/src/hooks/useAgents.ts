import { useEffect } from "react";
import { useSyncExternalStore } from "react";
import { apiListAgents, type Agent } from "@/lib/api";
import { getSession, subscribeSession } from "@/state/sessionStore";

type AgentsCacheState = {
  status: "idle" | "loading" | "ready" | "error";
  items: Agent[];
  error: string | null;
  cacheKey: string | null;
};

let cache: AgentsCacheState = {
  status: "idle",
  items: [],
  error: null,
  cacheKey: null,
};

const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((fn) => fn());
}

function subscribeAgents(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getCacheSnapshot(): AgentsCacheState {
  return cache;
}

let inflight: Promise<void> | null = null;

function buildCacheKey(): string | null {
  const { token, workspaceId } = getSession();
  if (!token) return null;
  return `${token}::${workspaceId}`;
}

export function ensureAgents(): void {
  const key = buildCacheKey();

  if (!key) {
    if (cache.cacheKey !== null || cache.status !== "idle") {
      cache = { status: "idle", items: [], error: null, cacheKey: null };
      notifyListeners();
    }
    return;
  }

  if (inflight || (cache.cacheKey === key && cache.status !== "idle")) return;

  cache = { ...cache, status: "loading", cacheKey: key };
  notifyListeners();

  const promise = apiListAgents()
    .then((response) => {
      if (cache.cacheKey !== key) return;
      const items = Array.isArray(response.items) ? response.items : [];
      cache = { status: "ready", items, error: null, cacheKey: key };
      notifyListeners();
    })
    .catch((err) => {
      if (cache.cacheKey !== key) return;
      cache = {
        status: "error",
        items: [],
        error: err instanceof Error ? err.message : "Falha ao carregar agentes.",
        cacheKey: key,
      };
      notifyListeners();
    })
    .finally(() => {
      if (inflight === promise) inflight = null;
    });

  inflight = promise;
}

// Invalidate the cache whenever the session token / workspaceId changes.
subscribeSession(() => {
  const key = buildCacheKey();
  if (key !== cache.cacheKey) {
    cache = { status: "idle", items: [], error: null, cacheKey: null };
    inflight = null;
    notifyListeners();
  }
});

export function useAgents(): AgentsCacheState {
  const snapshot = useSyncExternalStore(subscribeAgents, getCacheSnapshot, getCacheSnapshot);

  useEffect(() => {
    ensureAgents();
  }, [snapshot.cacheKey]);

  return snapshot;
}
