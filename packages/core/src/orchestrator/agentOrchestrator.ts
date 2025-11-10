import { PlanManager } from "./planManager";
import { RunEventStore } from "./runEventStore";
import { TelemetryBridge } from "./telemetryBridge";

export type OrchestratorInput = {
  objective: string;
  tenantId: string;
  workspaceId: string;
  runId: string;
  metadata?: Record<string, unknown>;
};

export type OrchestratorPlanStep = {
  id: string;
  description: string;
  status: "pending" | "in-progress" | "completed" | "failed";
  action?: string;
  params?: unknown;
  result?: unknown;
  error?: string;
};

export type OrchestratorContext = {
  input: OrchestratorInput;
  plan: OrchestratorPlanStep[];
  currentStep?: OrchestratorPlanStep;
  outputs: Array<{ stepId: string; data: unknown }>;
  startedAt: number;
};

export type OrchestratorTools = {
  plan?: (input: OrchestratorInput) => Promise<OrchestratorPlanStep[]>;
  planManager?: PlanManager;
  act: (step: OrchestratorPlanStep, context: OrchestratorContext) => Promise<unknown>;
  reflect?: (context: OrchestratorContext) => Promise<void>;
  logger?: (event: string, payload: Record<string, unknown>) => void;
  eventStore?: RunEventStore;
  telemetry?: TelemetryBridge;
};

export class AgentOrchestrator {
  private readonly tools: OrchestratorTools;

  constructor(tools: OrchestratorTools) {
    this.tools = tools;
  }

  private log(event: string, payload: Record<string, unknown>) {
    if (this.tools.logger) {
      this.tools.logger(event, payload);
    }
  }

  private emitTelemetry(event: string, payload: Record<string, unknown>) {
    if (this.tools.telemetry) {
      void this.tools.telemetry.emit(event, payload);
    }
  }

  private async recordEvent(
    input: OrchestratorInput,
    event: string,
    payload: Record<string, unknown>
  ) {
    if (this.tools.eventStore) {
      await this.tools.eventStore.record({
        runId: input.runId,
        tenantId: input.tenantId,
        workspaceId: input.workspaceId,
        userId: typeof input.metadata?.userId === "string" ? input.metadata?.userId : undefined,
        type: event,
        payload,
      });
    }
  }

  private async createPlan(input: OrchestratorInput) {
    if (this.tools.planManager) {
      return this.tools.planManager.createPlan(input);
    }
    if (this.tools.plan) {
      return this.tools.plan(input);
    }
    throw new Error("AgentOrchestrator requires a planManager or plan function.");
  }

  async run(input: OrchestratorInput): Promise<OrchestratorContext> {
    const context: OrchestratorContext = {
      input,
      plan: [],
      outputs: [],
      startedAt: Date.now(),
    };

    this.log("orchestrator.start", { runId: input.runId, objective: input.objective });
    this.emitTelemetry("orchestrator.start", { runId: input.runId });
    await this.recordEvent(input, "run.orchestrator.started", {
      objective: input.objective,
    });

    // Perceive & Plan
    context.plan = await this.createPlan(input);
    this.log("orchestrator.plan.created", {
      runId: input.runId,
      steps: context.plan.map((step) => ({
        id: step.id,
        description: step.description,
        action: step.action,
      })),
    });
    await this.recordEvent(input, "run.plan.generated", {
      steps: context.plan.map((step) => ({
        id: step.id,
        description: step.description,
        action: step.action,
      })),
    });

    // Act loop
    for (const step of context.plan) {
      context.currentStep = step;
      step.status = "in-progress";
      this.log("orchestrator.step.start", { runId: input.runId, stepId: step.id });
      await this.recordEvent(input, "run.step.started", {
        stepId: step.id,
        description: step.description,
        action: step.action,
      });

      try {
        const result = await this.tools.act(step, context);
        step.status = "completed";
        step.result = result;
        context.outputs.push({ stepId: step.id, data: result });
        this.log("orchestrator.step.completed", { runId: input.runId, stepId: step.id });
        const resultPreview =
          typeof result === "string"
            ? result.slice(0, 200)
            : (() => {
                try {
                  return JSON.parse(JSON.stringify(result));
                } catch {
                  return "[unserializable]";
                }
              })();
        await this.recordEvent(input, "run.step.completed", {
          stepId: step.id,
          resultPreview,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        step.status = "failed";
        step.error = message;
        this.log("orchestrator.step.failed", { runId: input.runId, stepId: step.id, error: message });
        await this.recordEvent(input, "run.step.failed", {
          stepId: step.id,
          error: message,
        });
        throw error;
      }
    }

    // Reflect (optional)
    if (this.tools.reflect) {
      await this.tools.reflect(context);
      this.log("orchestrator.reflect", { runId: input.runId });
      await this.recordEvent(input, "run.reflect.completed", {
        outputs: context.outputs,
      });
    }

    this.log("orchestrator.finish", { runId: input.runId });
    await this.recordEvent(input, "run.orchestrator.finished", {
      tookMs: Date.now() - context.startedAt,
    });
    return context;
  }
}
