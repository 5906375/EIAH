const hits = new Map<string, number>();
const WINDOW = 10_000;
const LIMIT = 30;

export function rateLimitKey(key: string) {
  const now = Date.now();
  const current = hits.get(key) || 0;

  if (current >= LIMIT) {
    throw new Error("Core RateLimit exceeded");
  }

  hits.set(key, current + 1);

  setTimeout(() => {
    const value = hits.get(key) || 0;
    const next = Math.max(value - 1, 0);
    if (next === 0) {
      hits.delete(key);
    } else {
      hits.set(key, next);
    }
  }, WINDOW);
}

export function tenantRateLimitKey(
  tenantId?: string | null,
  workspaceId?: string | null,
  action?: string | null
) {
  const tenant = tenantId || "unknown-tenant";
  const workspace = workspaceId || "unknown-workspace";
  const act = action || "unknown-action";
  return ["tenant", tenant, workspace, act].join(":");
}
