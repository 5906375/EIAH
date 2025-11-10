export interface TelemetryBridge {
  emit(event: string, payload?: Record<string, unknown>): Promise<void> | void;
}

export class ConsoleTelemetryBridge implements TelemetryBridge {
  emit(event: string, payload: Record<string, unknown> = {}) {
    const safePayload = (() => {
      try {
        return JSON.stringify(payload);
      } catch {
        return "[unstringifiable payload]";
      }
    })();
    // eslint-disable-next-line no-console
    console.log(`[orchestrator] ${event}`, safePayload);
  }
}

export class NoopTelemetryBridge implements TelemetryBridge {
  // eslint-disable-next-line @typescript-eslint/require-await
  async emit() {
    /* no-op */
  }
}
