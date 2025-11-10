import type { OrchestratorInput, OrchestratorPlanStep } from "./agentOrchestrator";

export interface PlanManager {
  createPlan(input: OrchestratorInput): Promise<OrchestratorPlanStep[]>;
}

export type DefaultPlanManagerOptions = {
  agentId?: string;
};

export class DefaultPlanManager implements PlanManager {
  private readonly options: DefaultPlanManagerOptions;

  constructor(options: DefaultPlanManagerOptions = {}) {
    this.options = options;
  }

  async createPlan(input: OrchestratorInput): Promise<OrchestratorPlanStep[]> {
    const metadata = (input.metadata ?? {}) as Record<string, unknown>;
    const actionFromMeta =
      typeof metadata.action === "string"
        ? (metadata.action as string)
        : typeof metadata.actionName === "string"
        ? (metadata.actionName as string)
        : undefined;

    const params =
      metadata.actionInput ??
      metadata.actionPayload ??
      (typeof metadata.params === "object" ? metadata.params : undefined) ??
      (Object.keys(metadata).length > 0 ? metadata : undefined);

    const description = actionFromMeta
      ? `Executar acao ${actionFromMeta}`
      : this.options.agentId
      ? `Executar agente ${this.options.agentId}`
      : `Executar objetivo`;

    const step: OrchestratorPlanStep = {
      id: `${input.runId}-step-1`,
      description,
      status: "pending",
      action: actionFromMeta,
      params,
    };

    return [step];
  }
}
