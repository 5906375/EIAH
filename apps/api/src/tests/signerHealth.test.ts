import { describe, expect, it } from "vitest";
import { classifySignerState, resolveSignerBootDecision } from "../services/signerHealth";

describe("signer health state classifier", () => {
  it("returns OK when signer is healthy and stable", () => {
    const state = classifySignerState({
      ok: true,
      latencyMs: 120,
      hasRecentFailures: false,
      degradedLatencyMs: 800,
    });
    expect(state).toBe("OK");
  });

  it("returns DEGRADED when signer is slow", () => {
    const state = classifySignerState({
      ok: true,
      latencyMs: 1200,
      hasRecentFailures: false,
      degradedLatencyMs: 800,
    });
    expect(state).toBe("DEGRADED");
  });

  it("returns DEGRADED when signer has intermittent recent failures", () => {
    const state = classifySignerState({
      ok: true,
      latencyMs: 200,
      hasRecentFailures: true,
      degradedLatencyMs: 800,
    });
    expect(state).toBe("DEGRADED");
  });

  it("returns DOWN when probe is not healthy", () => {
    const state = classifySignerState({
      ok: false,
      latencyMs: 200,
      hasRecentFailures: false,
      degradedLatencyMs: 800,
    });
    expect(state).toBe("DOWN");
  });
});

describe("signer boot gate decision", () => {
  it("always allows non-critical environments", () => {
    expect(
      resolveSignerBootDecision({
        criticalEnv: false,
        state: "DOWN",
        allowDegraded: false,
      })
    ).toBe("up");
  });

  it("denies startup in critical env when signer is DOWN", () => {
    expect(
      resolveSignerBootDecision({
        criticalEnv: true,
        state: "DOWN",
        allowDegraded: false,
      })
    ).toBe("down");
  });

  it("allows degraded startup only when explicitly enabled", () => {
    expect(
      resolveSignerBootDecision({
        criticalEnv: true,
        state: "DEGRADED",
        allowDegraded: true,
      })
    ).toBe("up_degraded");

    expect(
      resolveSignerBootDecision({
        criticalEnv: true,
        state: "DEGRADED",
        allowDegraded: false,
      })
    ).toBe("down");
  });
});
