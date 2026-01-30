export class MCPCircuitBreaker {
  private failures = 0;
  private state: "closed" | "open" | "half-open" = "closed";
  private openedAtMs: number | null = null;
  private halfOpenInFlight = false;

  constructor(
    private readonly options: {
      failureThreshold?: number;
      resetTimeoutMs?: number;
    } = {}
  ) {}

  get snapshot() {
    return {
      failures: this.failures,
      state: this.state,
      openedAtMs: this.openedAtMs,
      failureThreshold: this.failureThreshold,
      resetTimeoutMs: this.resetTimeoutMs,
    };
  }

  private get failureThreshold() {
    const configured = this.options.failureThreshold ?? 5;
    return Number.isFinite(configured) && configured > 0 ? configured : 5;
  }

  private get resetTimeoutMs() {
    const configured = this.options.resetTimeoutMs ?? 30_000;
    return Number.isFinite(configured) && configured > 0 ? configured : 30_000;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const now = Date.now();

    if (this.state === "open") {
      const openedAt = this.openedAtMs ?? now;
      const elapsed = now - openedAt;
      if (elapsed < this.resetTimeoutMs) {
        throw new Error("Circuit breaker open");
      }
      this.state = "half-open";
    }

    if (this.state === "half-open") {
      if (this.halfOpenInFlight) {
        throw new Error("Circuit breaker half-open");
      }
      this.halfOpenInFlight = true;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    } finally {
      this.halfOpenInFlight = false;
    }
  }

  private onSuccess() {
    this.failures = 0;
    this.state = "closed";
    this.openedAtMs = null;
  }

  private onFailure() {
    this.failures += 1;
    if (this.state === "half-open" || this.failures >= this.failureThreshold) {
      this.state = "open";
      this.openedAtMs = Date.now();
    }
  }
}

