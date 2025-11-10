import type { ZodTypeAny } from "zod";

export type ActionExecutionContext = {
  action: string;
  input?: unknown;
  rawInput?: unknown;
  runId?: string;
  stepId?: string;
  tenantId?: string;
  workspaceId?: string;
  metadata?: Record<string, unknown>;
  logger?: (event: string, payload?: Record<string, unknown>) => void;
  version?: string;
};

export type ActionExecutionResult = {
  status: "success" | "error";
  output?: unknown;
  error?: string;
  retryable?: boolean;
};

export type ActionHandler = (
  context: ActionExecutionContext
) => Promise<ActionExecutionResult> | ActionExecutionResult;

export type ActionGuardrail = {
  name: string;
  before?: (context: ActionExecutionContext) => Promise<void> | void;
  afterSuccess?: (
    context: ActionExecutionContext,
    result: ActionExecutionResult
  ) => Promise<void> | void;
  afterError?: (
    context: ActionExecutionContext,
    error: { message: string }
  ) => Promise<void> | void;
};

export type ActionContract = {
  input?: ZodTypeAny;
  output?: ZodTypeAny;
};

type RegisteredAction = {
  name: string;
  description?: string;
  version?: string;
  handler: ActionHandler;
  contract?: ActionContract;
  guardrails?: ActionGuardrail[];
};

type RegisteredActionMetadata = Omit<RegisteredAction, "handler" | "guardrails"> & {
  guardrails?: string[];
};

const registry = new Map<string, RegisteredAction>();

export function registerAction(action: RegisteredAction) {
  const key = action.name.trim();
  if (!key) {
    throw new Error("Action name cannot be empty");
  }

  registry.set(key, {
    ...action,
    version: action.version ?? "1.0.0",
    guardrails: action.guardrails ?? [],
  });
}

export function unregisterAction(name: string) {
  registry.delete(name.trim());
}

export function getRegisteredAction(name: string) {
  return registry.get(name.trim()) ?? null;
}

export function listRegisteredActions(): RegisteredActionMetadata[] {
  return Array.from(registry.values()).map((action) => ({
    name: action.name,
    description: action.description,
    version: action.version,
    contract: action.contract,
    guardrails: action.guardrails?.map((guard) => guard.name),
  }));
}

function applyGuardrailsBefore(
  guardrails: ActionGuardrail[],
  context: ActionExecutionContext
) {
  return Promise.all(
    guardrails.map(async (guardrail) => {
      if (!guardrail.before) return;
      await guardrail.before(context);
    })
  );
}

async function applyGuardrailsAfterSuccess(
  guardrails: ActionGuardrail[],
  context: ActionExecutionContext,
  result: ActionExecutionResult
) {
  await Promise.all(
    guardrails.map(async (guardrail) => {
      if (!guardrail.afterSuccess) return;
      await guardrail.afterSuccess(context, result);
    })
  );
}

async function applyGuardrailsAfterError(
  guardrails: ActionGuardrail[],
  context: ActionExecutionContext,
  error: { message: string }
) {
  await Promise.all(
    guardrails.map(async (guardrail) => {
      if (!guardrail.afterError) return;
      await guardrail.afterError(context, error);
    })
  );
}

export async function executeRegisteredAction(
  name: string,
  context: ActionExecutionContext
): Promise<ActionExecutionResult> {
  const registered = getRegisteredAction(name);
  if (!registered) {
    return {
      status: "error",
      error: `Action "${name}" is not registered`,
      retryable: false,
    };
  }

  const guardrails = registered.guardrails ?? [];
  const version = registered.version ?? "1.0.0";
  const rawInput = context.input;
  let parsedInput = rawInput;

  if (registered.contract?.input) {
    const parsed = registered.contract.input.safeParse(rawInput);
    if (!parsed.success) {
      return {
        status: "error",
        error: `Action "${name}" input validation failed`,
        retryable: false,
      };
    }
    parsedInput = parsed.data;
  }

  const executionContext: ActionExecutionContext = {
    ...context,
    action: name,
    version,
    rawInput,
    input: parsedInput,
  };

  try {
    await applyGuardrailsBefore(guardrails, executionContext);
  } catch (guardrailError) {
    const message =
      guardrailError instanceof Error ? guardrailError.message : String(guardrailError);
    executionContext.logger?.("action.guardrail.blocked", {
      action: name,
      message,
    });
    return {
      status: "error",
      error: message,
      retryable: false,
    };
  }

  let result: ActionExecutionResult;

  try {
    result = await registered.handler(executionContext);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    executionContext.logger?.("action.error", { action: name, message });
    await applyGuardrailsAfterError(guardrails, executionContext, { message });
    return {
      status: "error",
      error: message,
      retryable: false,
    };
  }

  if (registered.contract?.output && result.status === "success") {
    const parsedOutput = registered.contract.output.safeParse(result.output);
    if (!parsedOutput.success) {
      const message = `Action "${name}" output validation failed`;
      executionContext.logger?.("action.contract.output.invalid", { action: name });
      await applyGuardrailsAfterError(guardrails, executionContext, { message });
      return {
        status: "error",
        error: message,
        retryable: false,
      };
    }
    result = {
      ...result,
      output: parsedOutput.data,
    };
  }

  await applyGuardrailsAfterSuccess(guardrails, executionContext, result);
  return result;
}

// Register a default no-op action to help with smoke tests
registerAction({
  name: "core.echo",
  description: "Return the received payload as-is for diagnostics.",
  version: "1.0.0",
  handler: async (context) => {
    context.logger?.("action.echo", { input: context.input });
    return {
      status: "success",
      output: context.input ?? null,
    };
  },
});
