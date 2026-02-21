import test from "node:test";
import assert from "node:assert/strict";
import { AgentOrchestrator, type OrchestratorPlanStep } from "./agentOrchestrator";
import type { PlanStepPayload } from "../services/planStepStore";

const originalMcpProxy = process.env.MCP_PROXY_ALL_ACTIONS;
process.env.MCP_PROXY_ALL_ACTIONS = "false";

test.after(() => {
  if (originalMcpProxy === undefined) {
    delete process.env.MCP_PROXY_ALL_ACTIONS;
  } else {
    process.env.MCP_PROXY_ALL_ACTIONS = originalMcpProxy;
  }
});

test("AgentOrchestrator respects maxSteps and persists plan/act steps", async () => {
  const recordedEvents: Array<{ type: string; payload: unknown }> = [];
  const persistedSteps: Array<{ stepIndex: number; stepType: string }> = [];

  const orchestrator = new AgentOrchestrator({
    plan: async (): Promise<OrchestratorPlanStep[]> => [
      { id: "s1", description: "step 1", status: "pending", action: "noop", params: { i: 1 } },
      { id: "s2", description: "step 2", status: "pending", action: "noop", params: { i: 2 } },
      { id: "s3", description: "step 3", status: "pending", action: "noop", params: { i: 3 } },
    ],
    act: async (step) => ({ ok: true, stepId: step.id }),
    eventStore: {
      async record(event) {
        recordedEvents.push({ type: event.type, payload: event.payload });
      },
    },
    stepStore: {
      async saveStep(step: PlanStepPayload) {
        persistedSteps.push({ stepIndex: step.stepIndex, stepType: step.stepType });
        return step as any;
      },
    } as any,
  });

  const context = await orchestrator.run({
    objective: "test",
    tenantId: "t1",
    workspaceId: "w1",
    runId: "r1",
    maxSteps: 2,
  });

  assert.equal(context.outputs.length, 2);
  assert.equal(context.plan.length, 2);
  assert.equal(recordedEvents.some((e) => e.type === "run.plan.truncated"), true);

  const planSteps = persistedSteps.filter((s) => s.stepType === "plan");
  const actSteps = persistedSteps.filter((s) => s.stepType === "act");
  assert.equal(planSteps.length, 2);
  assert.equal(actSteps.length, 2);
});

test("AgentOrchestrator enforces stepTimeoutMs for act()", async () => {
  const recordedEvents: Array<{ type: string; payload: any }> = [];

  const orchestrator = new AgentOrchestrator({
    plan: async (): Promise<OrchestratorPlanStep[]> => [
      { id: "s1", description: "slow step", status: "pending", action: "slow", params: {} },
    ],
    act: async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { ok: true };
    },
    eventStore: {
      async record(event) {
        recordedEvents.push({ type: event.type, payload: event.payload });
      },
    },
  });

  await assert.rejects(
    () =>
      orchestrator.run({
        objective: "test",
        tenantId: "t1",
        workspaceId: "w1",
        runId: "r1",
        stepTimeoutMs: 10,
      }),
    /timed out/i
  );

  const timeoutEvent = recordedEvents.find((e) => e.type === "run.step.timeout");
  assert.ok(timeoutEvent);
  assert.equal(timeoutEvent.payload?.phase, "act");
});

test("AgentOrchestrator enforces dependsOn with skip strategy", async () => {
  const recordedEvents: Array<{ type: string; payload: any }> = [];

  const orchestrator = new AgentOrchestrator({
    plan: async (): Promise<OrchestratorPlanStep[]> => [
      {
        id: "a",
        description: "fails",
        status: "pending",
        action: "fail",
        params: {},
        failureStrategy: "skip",
      },
      {
        id: "b",
        description: "depends on a",
        status: "pending",
        action: "noop",
        params: {},
        dependsOn: ["a"],
        failureStrategy: "skip",
      },
    ],
    act: async (step) => {
      if (step.id === "a") {
        throw new Error("boom");
      }
      return { ok: true };
    },
    eventStore: {
      async record(event) {
        recordedEvents.push({ type: event.type, payload: event.payload });
      },
    },
  });

  const context = await orchestrator.run({
    objective: "test",
    tenantId: "t1",
    workspaceId: "w1",
    runId: "r1",
  });

  const stepA = context.plan.find((s) => s.id === "a");
  const stepB = context.plan.find((s) => s.id === "b");
  assert.equal(stepA?.status, "skipped");
  assert.equal(stepB?.status, "skipped");

  const skippedB = recordedEvents.find(
    (e) => e.type === "run.step.skipped" && e.payload?.stepId === "b" && e.payload?.reason === "dependency_failed"
  );
  assert.ok(skippedB);
});

test("AgentOrchestrator can replan dynamically when shouldReplan returns true", async () => {
  const recordedEvents: Array<{ type: string; payload: any }> = [];
  let planned = 0;

  const orchestrator = new AgentOrchestrator({
    plan: async () => {
      planned += 1;
      if (planned === 1) {
        return [
          { id: "s1", description: "first", status: "pending", action: "noop", params: { i: 1 } },
          { id: "s2", description: "will be replaced", status: "pending", action: "noop", params: { i: 2 } },
        ];
      }
      return [{ id: "s3", description: "replanned", status: "pending", action: "noop", params: { i: 3 } }];
    },
    act: async (step) => ({ ok: true, stepId: step.id }),
    shouldReplan: async (context) => context.outputs.some((o) => o.stepId === "s1"),
    eventStore: {
      async record(event) {
        recordedEvents.push({ type: event.type, payload: event.payload });
      },
    },
  });

  const context = await orchestrator.run({
    objective: "test",
    tenantId: "t1",
    workspaceId: "w1",
    runId: "r1",
    dynamicReplan: { enabled: true, maxReplans: 1 },
  });

  assert.equal(planned, 2);
  assert.equal(context.plan.some((s) => s.id === "s3"), true);
  assert.equal(context.plan.some((s) => s.id === "s2" && s.status !== "completed"), false);

  const replanEvent = recordedEvents.find((e) => e.type === "run.action.replan");
  assert.ok(replanEvent);
});

test("AgentOrchestrator clamps maxSteps to 30 and emits max-step termination event", async () => {
  const recordedEvents: Array<{ type: string; payload: any }> = [];
  const orchestrator = new AgentOrchestrator({
    plan: async (): Promise<OrchestratorPlanStep[]> =>
      Array.from({ length: 50 }, (_, index) => ({
        id: `s-${index + 1}`,
        description: `step ${index + 1}`,
        status: "pending",
        action: "noop",
        params: { i: index + 1 },
      })),
    act: async (step) => ({ ok: true, stepId: step.id }),
    eventStore: {
      async record(event) {
        recordedEvents.push({ type: event.type, payload: event.payload });
      },
    },
  });

  const context = await orchestrator.run({
    objective: "test",
    tenantId: "t1",
    workspaceId: "w1",
    runId: "r1",
    maxSteps: 200,
    metadata: {},
  });

  assert.equal(context.plan.length, 30);
  assert.equal(context.outputs.length, 30);
  assert.equal(context.input.metadata?.terminationReason, "MAX_STEPS");

  const maxStepsEvent = recordedEvents.find((event) => event.type === "run.max_steps_reached");
  assert.ok(maxStepsEvent);
  assert.equal(maxStepsEvent.payload?.effectiveMaxSteps, 30);
  assert.equal(maxStepsEvent.payload?.runId, "r1");
  assert.equal(maxStepsEvent.payload?.tenantId, "t1");
  assert.equal(maxStepsEvent.payload?.workspaceId, "w1");
  assert.equal(maxStepsEvent.payload?.terminationReason, "MAX_STEPS");
});
