export class RetryExhaustedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetryExhaustedError";
  }
}

type RetryOptions = {
  retries?: number;
  delayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
  jitterRatio?: number;
};

export async function retry<T>(
  fn: () => Promise<T>,
  retriesOrOptions: number | RetryOptions = 3,
  delayMs = 150
) {
  const options: RetryOptions =
    typeof retriesOrOptions === "number"
      ? { retries: retriesOrOptions, delayMs }
      : retriesOrOptions;
  const retries = options.retries ?? 3;
  const baseDelayMs = options.delayMs ?? 150;
  const maxDelayMs = options.maxDelayMs ?? 2000;
  const backoffFactor = options.backoffFactor ?? 2;
  const jitterRatio = options.jitterRatio ?? 0.2;
  let lastErr: unknown = null;
  let currentDelayMs = baseDelayMs;

  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const jitter = currentDelayMs * jitterRatio * Math.random();
      const delayWithJitter = Math.min(maxDelayMs, currentDelayMs + jitter);
      await new Promise((resolve) => setTimeout(resolve, delayWithJitter));
      currentDelayMs = Math.min(maxDelayMs, currentDelayMs * backoffFactor);
    }
  }

  throw new RetryExhaustedError(`Retry exhausted: ${(lastErr as Error | null)?.message ?? lastErr}`);
}
