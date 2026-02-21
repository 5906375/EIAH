import crypto from "node:crypto";

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

export class InMemoryLLMCache<T = unknown> {
  private store = new Map<string, CacheEntry<T>>();

  constructor(private options: { ttlMs?: number; maxEntries?: number } = {}) {}

  makeKey(input: {
    task?: string;
    provider?: string;
    model?: string;
    prompt: string;
    metadata?: Record<string, unknown>;
  }) {
    const payload = JSON.stringify({
      task: input.task ?? null,
      provider: input.provider ?? null,
      model: input.model ?? null,
      prompt: input.prompt,
      metadata: input.metadata ?? null,
    });
    return crypto.createHash("sha256").update(payload).digest("hex");
  }

  get(key: string): T | null {
    const hit = this.store.get(key);
    if (!hit) return null;
    if (hit.expiresAt < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return hit.value;
  }

  set(key: string, value: T) {
    const ttlMs = this.options.ttlMs ?? 30_000;
    const maxEntries = this.options.maxEntries ?? 500;

    if (this.store.size >= maxEntries) {
      const oldestKey = this.store.keys().next().value as string | undefined;
      if (oldestKey) this.store.delete(oldestKey);
    }

    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }
}

