import type { RegisteredAction } from "../actions/actionRegistry";
import { PlanManager } from "./planManager";
import { RunEventStore } from "./runEventStore";
import { TelemetryBridge } from "./telemetryBridge";
import type { PlanStepPayload } from "../services/planStepStore";
import type { PlanStepStore } from "../services/planStepStore";

export type OrchestratorActionMap = Record<string, RegisteredAction>;

export type OrchestratorInput = {
  objective: string;
  tenantId: string;
  workspaceId: string;
  runId: string;
  metadata?: Record<string, unknown>;
  actions?: OrchestratorActionMap;
  maxSteps?: number;
  stepTimeoutMs?: number;
  defaultFailureStrategy?: "skip" | "abort";
  mcpProxyAllActions?: boolean;
  dynamicReplan?: {
    enabled?: boolean;
    maxReplans?: number;
  };
};

export type OrchestratorPlanStep = {
  id: string;
  description: string;
  status: "pending" | "in-progress" | "completed" | "failed" | "skipped";
  action?: string;
  params?: unknown;
  result?: unknown;
  error?: string;
  dependsOn?: string[];
  failureStrategy?: "skip" | "abort" | "retry";
};

export type OrchestratorContext = {
  input: OrchestratorInput;
  plan: OrchestratorPlanStep[];
  currentStep?: OrchestratorPlanStep;
  outputs: Array<{ stepId: string; data: unknown }>;
  startedAt: number;
  actions: OrchestratorActionMap;
};

export type OrchestratorTools = {
  plan?: (input: OrchestratorInput) => Promise<OrchestratorPlanStep[]>;
  planManager?: PlanManager;
  act: (step: OrchestratorPlanStep, context: OrchestratorContext) => Promise<unknown>;
  mcpExecutor?: {
    run: (action: string, params: unknown, context: OrchestratorContext) => Promise<unknown>;
  };
  shouldReplan?: (context: OrchestratorContext) => Promise<boolean> | boolean;
  observe?: (context: OrchestratorContext, lastResult: unknown) => Promise<void>;
  reflect?: (context: OrchestratorContext) => Promise<void>;
  logger?: (event: string, payload: Record<string, unknown>) => void;
  eventStore?: RunEventStore;
  stepStore?: PlanStepStore;
  telemetry?: TelemetryBridge;
};

export class AgentOrchestrator {
  private readonly tools: OrchestratorTools;

  constructor(tools: OrchestratorTools) {
    this.tools = tools;
  }

  private log(event: string, payload: Record<string, unknown>) {
    this.tools.logger?.(event, payload);
  }

  private emitTelemetry(event: string, payload: Record<string, unknown>) {
    void this.tools.telemetry?.emit(event, payload);
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

  private serialize(value: unknown) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return null;
    }
  }

  private async persistStep(payload: PlanStepPayload) {
    if (!this.tools.stepStore) return;
    await this.tools.stepStore.saveStep(payload);
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    ms: number | undefined,
    label: string,
    input: OrchestratorInput,
    stepIndex?: number,
    stepId?: string
  ): Promise<T> {
    if (!ms || ms <= 0) {
      return promise;
    }

    let timeoutId: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Step "${label}" timed out after ${ms}ms`));
      }, ms);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } catch (err) {
      await this.recordEvent(input, "run.step.timeout", {
        stepIndex,
        stepId,
        phase: label,
        timeoutMs: ms,
      });
      throw err;
    } finally {
      clearTimeout(timeoutId!);
    }
  }

  private async createPlan(input: OrchestratorInput) {
    if (this.tools.planManager) return this.tools.planManager.createPlan(input);
    if (this.tools.plan) return this.tools.plan(input);
    throw new Error("AgentOrchestrator requires a planManager or plan function.");
  }

  private isMcpProxyEnabled(input: OrchestratorInput) {
    if (typeof input.mcpProxyAllActions === "boolean") return input.mcpProxyAllActions;
    const raw =
      typeof process !== "undefined"
        ? (process.env.MCP_PROXY_ALL_ACTIONS ?? "").trim().toLowerCase()
        : "";
    return raw === "1" || raw === "true" || raw === "on";
  }

  private dynamicReplanConfig(input: OrchestratorInput) {
    const enabled = Boolean(input.dynamicReplan?.enabled);
    const maxReplansRaw = input.dynamicReplan?.maxReplans ?? 2;
    const maxReplans =
      Number.isFinite(maxReplansRaw) && maxReplansRaw > 0 ? Math.floor(maxReplansRaw) : 2;
    return { enabled, maxReplans };
  }

  private async shouldReplan(context: OrchestratorContext): Promise<boolean> {
    if (!this.tools.shouldReplan) return false;
    try {
      return Boolean(await this.tools.shouldReplan(context));
    } catch {
      return false;
    }
  }

  private async applyPlannedSteps(input: OrchestratorInput, plan: OrchestratorPlanStep[], startIndex: number) {
    await Promise.all(
      plan.map((step, index) =>
        this.recordEvent(input, "run.action.plan", {
          stepId: step.id,
          stepIndex: startIndex + index,
          description: step.description,
          action: step.action ?? null,
          dependsOn: Array.isArray(step.dependsOn) ? step.dependsOn : [],
        })
      )
    );

    await Promise.all(
      plan.map((step, index) =>
        this.persistStep({
          runId: input.runId,
          tenantId: input.tenantId,
          workspaceId: input.workspaceId,
          stepIndex: startIndex + index,
          stepType: "plan",
          input: this.serialize({
            objective: input.objective,
            metadata: input.metadata ?? null,
          }) as any,
          output: this.serialize({
            id: step.id,
            description: step.description,
            action: step.action ?? null,
            params: step.params ?? null,
            dependsOn: Array.isArray(step.dependsOn) ? step.dependsOn : [],
            failureStrategy: step.failureStrategy ?? null,
          }) as any,
        })
      )
    );
  }

  /**
   * 🧩 Hook: integrações externas seguras (REST/GraphQL/SOAP via VaultSigner)
   * Detecta ações do tipo "legacy.api.call" e executa via conector integrado.
   */
  private async useExternalSource(
    step: OrchestratorPlanStep,
    context: OrchestratorContext
  ): Promise<unknown | null> {
    if (step.action !== "legacy.api.call") return null;

    // Lazy-load integrations to avoid forcing runtime-only dependencies in contexts
    // that don't use external connectors (e.g. unit tests, minimal builds).
    const { registerIntegrations } = await import("../integrations");
    const integrations = registerIntegrations();

    const params = (step.params ?? {}) as {
      system: string;
      url: string;
      protocol?: "rest" | "graphql" | "soap";
      method?: string;
      headers?: Record<string, string>;
      body?: unknown;
    };

    const result = await integrations.legacyApi.call({
      tenantId: context.input.tenantId,
      workspaceId: context.input.workspaceId,
      system: params.system,
      protocol: params.protocol ?? "rest",
      runId: context.input.runId,
      method: params.method ?? "GET",
      url: params.url,
      headers: params.headers,
      body: params.body,
    });

    await this.recordEvent(context.input, "run.external.legacy_api_call", {
      system: params.system,
      url: params.url,
      status: result.status,
      ok: result.ok,
      requestHash: result.requestHash,
      responseHash: result.responseHash,
    });

    // 💾 Retorna apenas os dados mascarados (sem PII) ao contexto do agente
    return result.masked;
  }

  async run(input: OrchestratorInput): Promise<OrchestratorContext> {
    const actions = input.actions ?? {};
    const context: OrchestratorContext = {
      input,
      plan: [],
      outputs: [],
      startedAt: Date.now(),
      actions,
    };

    this.log("orchestrator.start", { runId: input.runId, objective: input.objective });
    this.emitTelemetry("orchestrator.start", { runId: input.runId });
    await this.recordEvent(input, "run.orchestrator.started", { objective: input.objective });

    // 🧠 Perceive & Plan
    context.plan = await this.withTimeout(
      this.createPlan(input),
      input.stepTimeoutMs,
      "plan",
      input,
      -1
    );

    const maxSteps =
      typeof input.maxSteps === "number" && Number.isFinite(input.maxSteps) && input.maxSteps > 0
        ? Math.floor(input.maxSteps)
        : null;
    if (maxSteps && context.plan.length > maxSteps) {
      await this.recordEvent(input, "run.plan.truncated", {
        maxSteps,
        totalSteps: context.plan.length,
      });
      context.plan = context.plan.slice(0, maxSteps);
    }

    this.log("orchestrator.plan.created", {
      runId: input.runId,
      steps: context.plan.map((step) => ({
        id: step.id,
        description: step.description,
        action: step.action,
      })),
    });
    await this.recordEvent(input, "run.plan.generated", {
      steps: context.plan.map((s) => ({
        id: s.id,
        description: s.description,
        action: s.action,
      })),
    });

    await this.applyPlannedSteps(input, context.plan, 0);

    // ⚙️ Act loop
    const mcpProxyEnabled = this.isMcpProxyEnabled(input);
    const dynamicReplan = this.dynamicReplanConfig(input);
    let replans = 0;

    let stepIndex = 0;
    while (stepIndex < context.plan.length) {
      const step = context.plan[stepIndex]!;
      const dependencyIds = Array.isArray(step.dependsOn) ? step.dependsOn : [];
      if (dependencyIds.length > 0) {
        const failedDependencies = dependencyIds
          .map((id) => context.plan.find((candidate) => candidate.id === id))
          .filter((candidate) => candidate && (candidate.status === "failed" || candidate.status === "skipped"))
          .map((candidate) => candidate!.id);

        if (failedDependencies.length > 0) {
          const strategy = step.failureStrategy ?? input.defaultFailureStrategy ?? "abort";
          const errorMessage = `Dependency failed: ${failedDependencies.join(", ")}`;

          await this.recordEvent(input, "run.step.skipped", {
            stepId: step.id,
            dependsOn: dependencyIds,
            failedDependencies,
            strategy,
            reason: "dependency_failed",
          });

          await this.persistStep({
            runId: input.runId,
            tenantId: input.tenantId,
            workspaceId: input.workspaceId,
            stepIndex,
            stepType: "act",
            input: this.serialize(step.params ?? null) as any,
            output: this.serialize({
              skipped: true,
              reason: "dependency_failed",
              dependsOn: dependencyIds,
              failedDependencies,
            }) as any,
          });

          step.status = "skipped";
          step.error = errorMessage;

          if (strategy === "skip") {
            stepIndex += 1;
            continue;
          }

          throw new Error(errorMessage);
        }
      }

      context.currentStep = step;
      step.status = "in-progress";
      this.log("orchestrator.step.start", { runId: input.runId, stepId: step.id });
      await this.recordEvent(input, "run.step.started", {
        stepId: step.id,
        description: step.description,
        action: step.action,
      });

      try {
        let result: unknown = null;

        await this.recordEvent(input, "run.action.call", {
          stepId: step.id,
          stepIndex,
          action: step.action ?? null,
          kind: step.action === "legacy.api.call" ? "legacy" : step.action ? "tool" : "llm",
        });

        if (mcpProxyEnabled && step.action) {
          if (!this.tools.mcpExecutor) {
            throw new Error("MCP proxy enabled but no mcpExecutor was provided");
          }

          result = await this.withTimeout(
            this.tools.mcpExecutor.run(step.action, step.params, context),
            input.stepTimeoutMs,
            "mcp",
            input,
            stepIndex,
            step.id
          );
        } else {
          // 🔌 1️⃣ Primeiro tenta consumir sistemas legados
          const externalResult = await this.withTimeout(
            this.useExternalSource(step, context),
            input.stepTimeoutMs,
            "external",
            input,
            stepIndex,
            step.id
          );
          if (externalResult !== null) {
            result = externalResult;
          } else {
            // 🧠 2️⃣ Caso contrário, executa a ação padrão (AI/funcional)
            result = await this.withTimeout(
              this.tools.act(step, context),
              input.stepTimeoutMs,
              "act",
              input,
              stepIndex,
              step.id
            );
          }
        }

        step.status = "completed";
        step.result = result;
        context.outputs.push({ stepId: step.id, data: result });

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

        this.log("orchestrator.step.completed", { runId: input.runId, stepId: step.id });
        await this.persistStep({
          runId: input.runId,
          tenantId: input.tenantId,
          workspaceId: input.workspaceId,
          stepIndex,
          stepType: "act",
          input: this.serialize(step.params ?? null) as any,
          output: this.serialize(result) as any,
        });
        await this.recordEvent(input, "run.step.completed", {
          stepId: step.id,
          resultPreview,
        });

        await this.recordEvent(input, "run.action.result", {
          stepId: step.id,
          stepIndex,
          action: step.action ?? null,
          status: "success",
          resultPreview,
        });

        if (this.tools.observe) {
          try {
            await this.withTimeout(
              this.tools.observe(context, result),
              input.stepTimeoutMs,
              "observe",
              input,
              stepIndex,
              step.id
            );
            await this.recordEvent(input, "run.action.observe", {
              stepId: step.id,
              stepIndex,
              action: step.action ?? null,
            });
          } catch (observeError) {
            const observeMessage =
              observeError instanceof Error ? observeError.message : String(observeError);
            await this.recordEvent(input, "run.action.observe.failed", {
              stepId: step.id,
              stepIndex,
              action: step.action ?? null,
              error: observeMessage,
            });
          }
        }

        stepIndex += 1;

        if (dynamicReplan.enabled && replans < dynamicReplan.maxReplans) {
          const requested = await this.shouldReplan(context);
          if (requested) {
            replans += 1;
            await this.recordEvent(input, "run.action.replan", {
              reason: "shouldReplan",
              replanIndex: replans,
              lastStepId: step.id,
            });

            const nextInput: OrchestratorInput = {
              ...input,
              metadata: {
                ...(input.metadata ?? {}),
                orchestrator: {
                  outputs: context.outputs,
                  lastStepId: step.id,
                  replanIndex: replans,
                },
              },
            };

            const newPlan = await this.withTimeout(
              this.createPlan(nextInput),
              input.stepTimeoutMs,
              "replan",
              input,
              stepIndex
            );

            const completedPrefix = context.plan.slice(0, stepIndex);
            const maxSteps =
              typeof input.maxSteps === "number" && Number.isFinite(input.maxSteps) && input.maxSteps > 0
                ? Math.floor(input.maxSteps)
                : null;
            const remainingBudget =
              maxSteps === null ? null : Math.max(maxSteps - completedPrefix.length, 0);
            const normalizedNewPlan =
              remainingBudget === null ? newPlan : newPlan.slice(0, remainingBudget);

            if (remainingBudget !== null && newPlan.length > remainingBudget) {
              await this.recordEvent(input, "run.plan.truncated", {
                maxSteps,
                totalSteps: completedPrefix.length + newPlan.length,
              });
            }

            context.plan = [...completedPrefix, ...normalizedNewPlan];
            await this.applyPlannedSteps(input, normalizedNewPlan, completedPrefix.length);
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const strategy = step.failureStrategy ?? input.defaultFailureStrategy ?? "abort";
        step.status = strategy === "skip" ? "skipped" : "failed";
        step.error = message;
        this.log("orchestrator.step.failed", { runId: input.runId, stepId: step.id, error: message });
        await this.persistStep({
          runId: input.runId,
          tenantId: input.tenantId,
          workspaceId: input.workspaceId,
          stepIndex,
          stepType: "act",
          input: this.serialize(step.params ?? null) as any,
          output: this.serialize(
            strategy === "skip"
              ? { skipped: true, reason: "step_failed", error: message }
              : { error: message }
          ) as any,
        });
        await this.recordEvent(
          input,
          strategy === "skip" ? "run.step.skipped" : "run.step.failed",
          { stepId: step.id, error: message, strategy, reason: "step_failed" }
        );

        await this.recordEvent(input, "run.action.result", {
          stepId: step.id,
          stepIndex,
          action: step.action ?? null,
          status: strategy === "skip" ? "skipped" : "error",
          error: message,
          strategy,
        });

        if (strategy === "skip") {
          stepIndex += 1;
          continue;
        }

        if (
          dynamicReplan.enabled &&
          replans < dynamicReplan.maxReplans &&
          /missing context|context missing|missing_context/i.test(message)
        ) {
          replans += 1;
          await this.recordEvent(input, "run.action.replan", {
            reason: "missing_context",
            replanIndex: replans,
            failedStepId: step.id,
            error: message,
          });

          step.status = "skipped";
          await this.recordEvent(input, "run.step.skipped", {
            stepId: step.id,
            strategy: "skip",
            reason: "replan_missing_context",
            error: message,
          });

          stepIndex += 1;

          const nextInput: OrchestratorInput = {
            ...input,
            metadata: {
              ...(input.metadata ?? {}),
              orchestrator: {
                outputs: context.outputs,
                lastError: message,
                failedStepId: step.id,
                replanIndex: replans,
              },
            },
          };

          const newPlan = await this.withTimeout(
            this.createPlan(nextInput),
            input.stepTimeoutMs,
            "replan",
            input,
            stepIndex
          );

          const completedPrefix = context.plan.slice(0, stepIndex);
          const maxSteps =
            typeof input.maxSteps === "number" && Number.isFinite(input.maxSteps) && input.maxSteps > 0
              ? Math.floor(input.maxSteps)
              : null;
          const remainingBudget =
            maxSteps === null ? null : Math.max(maxSteps - completedPrefix.length, 0);
          const normalizedNewPlan =
            remainingBudget === null ? newPlan : newPlan.slice(0, remainingBudget);

          if (remainingBudget !== null && newPlan.length > remainingBudget) {
            await this.recordEvent(input, "run.plan.truncated", {
              maxSteps,
              totalSteps: completedPrefix.length + newPlan.length,
            });
          }

          context.plan = [...completedPrefix, ...normalizedNewPlan];
          await this.applyPlannedSteps(input, normalizedNewPlan, completedPrefix.length);
          continue;
        }

        throw error;
      }
    }

    // 🔁 Reflect (memória, análise, resumo)
    if (this.tools.reflect) {
      await this.withTimeout(
        this.tools.reflect(context),
        input.stepTimeoutMs,
        "reflect",
        input,
        context.plan.length
      );
      this.log("orchestrator.reflect", { runId: input.runId });
      await this.recordEvent(input, "run.reflect.completed", { outputs: context.outputs });
      await this.recordEvent(input, "run.action.reflect", {
        outputs: context.outputs.length,
        steps: context.plan.length,
      });
    }

    this.log("orchestrator.finish", { runId: input.runId });
    await this.recordEvent(input, "run.orchestrator.finished", {
      tookMs: Date.now() - context.startedAt,
    });
    return context;
  }
}
