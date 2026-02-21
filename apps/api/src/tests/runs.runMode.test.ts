import { describe, expect, it } from "vitest";
import { resolveReplayTxPolicy, resolveRunModeFromRequest } from "../routes/runs";

describe("runs route runMode resolver", () => {
  it("keeps explicit runMode when provided", () => {
    expect(resolveRunModeFromRequest({ runMode: "LIVE" })).toBe("LIVE");
    expect(resolveRunModeFromRequest({ runMode: "DRY_RUN" })).toBe("DRY_RUN");
  });

  it("maps metadata.mode=simulate to DRY_RUN", () => {
    expect(resolveRunModeFromRequest({ metadata: { mode: "simulate" } })).toBe("DRY_RUN");
    expect(resolveRunModeFromRequest({ metadata: { mode: "  simulate  " } })).toBe("DRY_RUN");
  });

  it("defaults to LIVE when mode is not simulate", () => {
    expect(resolveRunModeFromRequest({ metadata: { mode: "live" } })).toBe("LIVE");
    expect(resolveRunModeFromRequest({ metadata: {} })).toBe("LIVE");
  });
});

describe("runs replay tx policy resolver", () => {
  it("enqueues when no previous tx exists", () => {
    const result = resolveReplayTxPolicy({
      requestedPolicy: "idempotent",
      existingTxId: null,
      allowNewTxReplay: false,
    });
    expect(result.action).toBe("enqueue");
    expect(result.txPolicy).toBe("idempotent");
  });

  it("returns noop by default when tx already exists", () => {
    const result = resolveReplayTxPolicy({
      existingTxId: "tx-abc",
      allowNewTxReplay: false,
    });
    expect(result.action).toBe("noop");
    expect(result.txPolicy).toBe("idempotent");
  });

  it("denies new_tx when explicit override is disabled", () => {
    const result = resolveReplayTxPolicy({
      requestedPolicy: "new_tx",
      existingTxId: "tx-abc",
      allowNewTxReplay: false,
    });
    expect(result.action).toBe("deny");
  });

  it("enqueues new_tx when explicit override is enabled", () => {
    const result = resolveReplayTxPolicy({
      requestedPolicy: "new_tx",
      existingTxId: "tx-abc",
      allowNewTxReplay: true,
    });
    expect(result.action).toBe("enqueue");
    expect(result.txPolicy).toBe("new_tx");
  });
});
