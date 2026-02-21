import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => {
  return {
    nextActionRef: { value: "reports.view" },
    mocks: {
      finalizeRunRecord: vi.fn(),
      updateRunStatus: vi.fn(),
      estimateCostCents: vi.fn(),
      chargeRun: vi.fn(),
      emitRunEvent: vi.fn(),
      evaluatePolicyEngine: vi.fn(),
      appendSclRecord: vi.fn(),
      getAgentProfile: vi.fn(),
      listRecentRunsForAgent: vi.fn(),
      getAgentRecommendationState: vi.fn(),
      saveAgentRecommendationState: vi.fn(),
      executeLlmStep: vi.fn(),
    },
  };
});

vi.mock("@eiah/core", () => {
  class AgentOrchestrator {
    private readonly options: any;

    constructor(options: any) {
      this.options = options;
    }

    async run() {
      const step = { id: "step-1", action: hoisted.nextActionRef.value, params: {} };
      const context = {
        actions: {
          [hoisted.nextActionRef.value]: { name: hoisted.nextActionRef.value },
        },
        currentStep: step,
      };
      const output = await this.options.act(step, context);
      return {
        plan: [step],
        outputs: [output],
      };
    }
  }

  return {
    AgentOrchestrator,
    ConsoleTelemetryBridge: class {},
    DefaultPlanManager: class {},
    buildRecommendationPrompt: () => "prompt",
    generateStatefulRecommendations: () => null,
    publishAction: vi.fn(),
    createActionQueueEvents: vi.fn(),
    consume: vi.fn(),
    createLogger: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
    bindLogger: (logger: any) => logger,
    withCostContext: (logger: any) => logger,
    enqueueRunAtivoUniversal: vi.fn(),
    PlanStepStore: class {},
    defaultRunGuardrails: () => [],
    runGuardrails: vi.fn(async () => ({ action: "allow", maxSeverity: "info", findings: [] })),
    recordGuardrailAudit: vi.fn(),
    ensureRunApproval: vi.fn(async () => ({ ok: true })),
    requiresApprovalFromRequest: vi.fn(() => false),
    incrCriticalCounter: vi.fn(),
  };
});

vi.mock("@repo/mcp-runner", () => ({
  MCPExecutor: class {},
  ToolRegistry: {
    get: vi.fn(),
  },
}));

vi.mock("@repo/db", () => ({
  prismaGlobal: {
    run: { findUnique: vi.fn(async () => null) },
  },
}));

vi.mock("../services/billing", () => ({
  estimateCostCents: hoisted.mocks.estimateCostCents,
  chargeRun: hoisted.mocks.chargeRun,
}));

vi.mock("../services/agents", () => ({
  getAgentProfile: hoisted.mocks.getAgentProfile,
  resolveAgentId: (value: string) => value,
}));

vi.mock("../services/runs", () => ({
  finalizeRunRecord: hoisted.mocks.finalizeRunRecord,
  updateRunStatus: hoisted.mocks.updateRunStatus,
  listRecentRunsForAgent: hoisted.mocks.listRecentRunsForAgent,
}));

vi.mock("../services/runEventEmitter", () => ({
  emitRunEvent: hoisted.mocks.emitRunEvent,
}));

vi.mock("../services/judge", () => ({
  judgeResult: vi.fn(async (_agent: string, text: string) => ({ maskedText: text, flags: [] })),
}));

vi.mock("../services/policyEngineAdapter", () => ({
  evaluatePolicyEngine: hoisted.mocks.evaluatePolicyEngine,
}));

vi.mock("../services/recommendations", () => ({
  getAgentRecommendationState: hoisted.mocks.getAgentRecommendationState,
  saveAgentRecommendationState: hoisted.mocks.saveAgentRecommendationState,
}));

vi.mock("../services/memory", () => ({
  getMemoryService: () => ({
    snapshot: vi.fn(async () => null),
    ingestShortTerm: vi.fn(async () => undefined),
    truncateShortTerm: vi.fn(async () => undefined),
  }),
}));

vi.mock("../services/guardrailLedgerStore", () => ({
  createGuardrailLedgerStore: () => ({
    register: vi.fn(async () => undefined),
  }),
}));

vi.mock("../services/sclLedger", () => ({
  appendSclRecord: hoisted.mocks.appendSclRecord,
}));

vi.mock("../actions/tenantActionRegistry", () => ({
  tenantActionResolver: () => ({}),
}));

vi.mock("../orchestrator/llmExecutor", () => ({
  executeLlmStep: hoisted.mocks.executeLlmStep,
}));

const { processRunPayload, resolveRunModeFromPayload } = await import("../workers/runWorker");

describe("run worker DRY_RUN", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.nextActionRef.value = "reports.view";
    hoisted.mocks.getAgentProfile.mockResolvedValue({ tools: ["reports.view"] });
    hoisted.mocks.updateRunStatus.mockResolvedValue(undefined);
    hoisted.mocks.listRecentRunsForAgent.mockResolvedValue([]);
    hoisted.mocks.getAgentRecommendationState.mockResolvedValue(null);
    hoisted.mocks.saveAgentRecommendationState.mockResolvedValue(undefined);
    hoisted.mocks.estimateCostCents.mockResolvedValue(120);
    hoisted.mocks.chargeRun.mockResolvedValue(true);
    hoisted.mocks.appendSclRecord.mockResolvedValue({ txId: "tx-1", criticalHash: "hash-1" });
    hoisted.mocks.finalizeRunRecord.mockResolvedValue(undefined);
    hoisted.mocks.emitRunEvent.mockResolvedValue(undefined);
    hoisted.mocks.evaluatePolicyEngine.mockResolvedValue({ decision: "allow", mode: "enforce" });
    hoisted.mocks.executeLlmStep.mockResolvedValue({
      outputText: "{}",
      rawResponse: { ok: true },
      traceId: "trace-smoke",
      tookMs: 12,
    });
  });

  it("blocks write-like action in DRY_RUN", async () => {
    hoisted.nextActionRef.value = "billing.charge_customer";

    await processRunPayload({
      runId: "run-dry-block",
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      userId: "user-A",
      agent: "AADV",
      prompt: "test",
      runMode: "DRY_RUN",
      metadata: {},
    } as any);

    expect(hoisted.mocks.finalizeRunRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-dry-block",
        status: "error",
      })
    );
    expect(hoisted.mocks.chargeRun).not.toHaveBeenCalled();
    expect(hoisted.mocks.emitRunEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-dry-block",
        type: "run.failed",
        payload: expect.objectContaining({
          message: expect.stringContaining("DRY_RUN_POLICY_BLOCKED"),
        }),
      })
    );
  });

  it("skips charging when runMode is DRY_RUN", async () => {
    hoisted.nextActionRef.value = "reports.view";

    await processRunPayload({
      runId: "run-dry-success",
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      userId: "user-A",
      agent: "AADV",
      prompt: "test",
      runMode: "DRY_RUN",
      metadata: {},
    } as any);

    expect(hoisted.mocks.finalizeRunRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-dry-success",
        status: "success",
        estimatedCostCents: 120,
        finalCostCents: 0,
        costCents: 0,
        charged: false,
        chargeReason: "DRY_RUN",
      })
    );
    expect(hoisted.mocks.chargeRun).not.toHaveBeenCalled();
    const completed = hoisted.mocks.emitRunEvent.mock.calls
      .map((call) => call[0])
      .filter((payload) => payload?.type === "run.completed");
    expect(completed).toHaveLength(1);
    expect(completed[0]).toEqual(
      expect.objectContaining({
        payload: expect.objectContaining({
          estimatedCostCents: 120,
          finalCostCents: 0,
          costCents: 0,
          charged: false,
          chargeReason: "DRY_RUN",
          runMode: "DRY_RUN",
          criticalHash: "hash-1",
          sclTxId: "tx-1",
          txId: "tx-1",
        }),
      })
    );
  });

  it("uses FREE_TIER_OR_DISABLED for LIVE runs with final cost zero", async () => {
    hoisted.nextActionRef.value = "";
    hoisted.mocks.estimateCostCents.mockResolvedValue(0);
    hoisted.mocks.chargeRun.mockResolvedValue(true);

    await processRunPayload({
      runId: "run-live-free-tier",
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      userId: "user-A",
      agent: "AADV",
      prompt: "test live",
      runMode: "LIVE",
      metadata: {},
    } as any);

    expect(hoisted.mocks.finalizeRunRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-live-free-tier",
        status: "success",
        estimatedCostCents: 0,
        finalCostCents: 0,
        costCents: 0,
        charged: false,
        chargeReason: "FREE_TIER_OR_DISABLED",
      })
    );
    const completed = hoisted.mocks.emitRunEvent.mock.calls
      .map((call) => call[0])
      .filter((payload) => payload?.type === "run.completed");
    expect(completed).toHaveLength(1);
    expect(completed[0]?.payload).toEqual(
      expect.objectContaining({
        costCents: 0,
        estimatedCostCents: 0,
        finalCostCents: 0,
        charged: false,
        chargeReason: "FREE_TIER_OR_DISABLED",
        runMode: "LIVE",
      })
    );
  });

  it("sets CHARGE_FAILED when billing charge fails on LIVE run", async () => {
    hoisted.nextActionRef.value = "";
    hoisted.mocks.estimateCostCents.mockResolvedValue(120);
    hoisted.mocks.chargeRun.mockResolvedValue(false);

    await processRunPayload({
      runId: "run-live-charge-fail",
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      userId: "user-A",
      agent: "AADV",
      prompt: "test charge fail",
      runMode: "LIVE",
      metadata: {},
    } as any);

    expect(hoisted.mocks.finalizeRunRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-live-charge-fail",
        status: "success",
        estimatedCostCents: 120,
        finalCostCents: 120,
        costCents: 120,
        charged: false,
        chargeReason: "CHARGE_FAILED",
      })
    );
    const completed = hoisted.mocks.emitRunEvent.mock.calls
      .map((call) => call[0])
      .filter((payload) => payload?.type === "run.completed");
    expect(completed).toHaveLength(1);
    expect(completed[0]?.payload).toEqual(
      expect.objectContaining({
        costCents: 120,
        estimatedCostCents: 120,
        finalCostCents: 120,
        charged: false,
        chargeReason: "CHARGE_FAILED",
        runMode: "LIVE",
      })
    );
  });

  it("accepts metadata.mode=simulate as DRY_RUN", () => {
    const mode = resolveRunModeFromPayload({
      runId: "run-legacy",
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      agent: "AADV",
      prompt: "legacy simulate",
      metadata: { mode: "simulate" },
    } as any);

    expect(mode).toBe("DRY_RUN");
  });
});
