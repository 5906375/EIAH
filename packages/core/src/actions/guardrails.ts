import type { ActionExecutionContext, ActionGuardrail } from "./actionRegistry";

export interface IdempotencyStore {
  register(key: string, ttlMs: number): Promise<boolean>;
}

export function createInMemoryIdempotencyStore(): IdempotencyStore {
  const items = new Map<string, number>();

  return {
    async register(key, ttlMs) {
      const now = Date.now();
      const existing = items.get(key);
      if (existing && existing > now) {
        return false;
      }
      items.set(key, now + ttlMs);
      return true;
    },
  };
}

export type GuardrailLedgerKeyPayload = {
  tenantId: string;
  actionType: string;
  idempotencyKey: string;
};

export function encodeGuardrailKey(payload: GuardrailLedgerKeyPayload): string {
  return JSON.stringify(payload);
}

export function decodeGuardrailKey(key: string): GuardrailLedgerKeyPayload | null {
  try {
    const parsed = JSON.parse(key) as GuardrailLedgerKeyPayload;
    if (!parsed.idempotencyKey || !parsed.actionType || !parsed.tenantId) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export type GuardrailLedgerAdapter = {
  insert(entry: GuardrailLedgerKeyPayload & { usageCount?: number }): Promise<void>;
  cleanup?: (params: { tenantId: string; actionType: string; before: Date }) => Promise<void>;
  isUniqueConstraintError?: (error: unknown) => boolean;
};

export function createLedgerBackedIdempotencyStore(
  adapter: GuardrailLedgerAdapter
): IdempotencyStore {
  return {
    async register(key, ttlMs) {
      const decoded = decodeGuardrailKey(key);
      if (!decoded) {
        return false;
      }

      if (adapter.cleanup && ttlMs > 0) {
        const cutoff = new Date(Date.now() - ttlMs);
        await adapter.cleanup({
          tenantId: decoded.tenantId,
          actionType: decoded.actionType,
          before: cutoff,
        });
      }

      try {
        await adapter.insert(decoded);
        return true;
      } catch (error) {
        if (adapter.isUniqueConstraintError?.(error)) {
          return false;
        }
        throw error;
      }
    },
  };
}

export type RequireIdempotencyOptions = {
  store: IdempotencyStore;
  ttlMs?: number;
  keyResolver?: (context: ActionExecutionContext) => string;
  onDuplicateMessage?: string;
};

export function requireIdempotency(options: RequireIdempotencyOptions): ActionGuardrail {
  const ttlMs = options.ttlMs ?? 5 * 60 * 1000;
  const keyResolver =
    options.keyResolver ??
    ((context: ActionExecutionContext) =>
      [
        "action",
        context.action,
        context.runId,
        context.stepId,
        context.workspaceId,
      ]
        .filter(Boolean)
        .join(":"));

  return {
    name: "requireIdempotency",
    before: async (context) => {
      const key = keyResolver(context);
      if (!key) {
        throw new Error("Idempotency guardrail requires a non-empty key");
      }
      const accepted = await options.store.register(key, ttlMs);
      if (!accepted) {
        throw new Error(
          options.onDuplicateMessage ??
            `Action "${context.action}" rejected by idempotency guardrail`
        );
      }
      context.logger?.("action.guardrail.idempotency.accepted", { key });
    },
  };
}

export interface RateLimiter {
  consume(key: string, weight: number): Promise<{
    allowed: boolean;
    remaining: number;
    resetAt: number;
  }>;
}

export function createFixedWindowRateLimiter(options: {
  limit: number;
  windowMs: number;
}): RateLimiter {
  const buckets = new Map<string, { count: number; windowStart: number }>();

  return {
    async consume(key, weight) {
      const now = Date.now();
      const entry = buckets.get(key);
      if (!entry || now > entry.windowStart + options.windowMs) {
        buckets.set(key, { count: weight, windowStart: now });
        return {
          allowed: weight <= options.limit,
          remaining: Math.max(options.limit - weight, 0),
          resetAt: now + options.windowMs,
        };
      }

      const nextCount = entry.count + weight;
      entry.count = nextCount;
      return {
        allowed: nextCount <= options.limit,
        remaining: Math.max(options.limit - nextCount, 0),
        resetAt: entry.windowStart + options.windowMs,
      };
    },
  };
}

export type RateLimitOptions = {
  limiter: RateLimiter;
  weightResolver?: (context: ActionExecutionContext) => number;
  keyResolver?: (context: ActionExecutionContext) => string;
  onLimitExceededMessage?: string;
};

export function rateLimit(options: RateLimitOptions): ActionGuardrail {
  const weightResolver = options.weightResolver ?? (() => 1);
  const keyResolver =
    options.keyResolver ??
    ((context: ActionExecutionContext) =>
      [
        "rl",
        context.action,
        context.workspaceId ?? context.tenantId ?? "global",
      ]
        .filter(Boolean)
        .join(":"));

  return {
    name: "rateLimit",
    before: async (context) => {
      const key = keyResolver(context);
      const weight = Math.max(1, weightResolver(context));
      const result = await options.limiter.consume(key, weight);
      if (!result.allowed) {
        context.logger?.("action.guardrail.rateLimit.blocked", {
          key,
          resetAt: result.resetAt,
        });
        throw new Error(
          options.onLimitExceededMessage ??
            `Action "${context.action}" blocked by rate limiter`
        );
      }
      context.logger?.("action.guardrail.rateLimit.accepted", {
        key,
        remaining: result.remaining,
        resetAt: result.resetAt,
      });
    },
  };
}
