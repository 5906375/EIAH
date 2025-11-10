import { consumeActions, registerAllActions, executeRegisteredAction } from "@eiah/core";
import { pathToFileURL } from "node:url";

function formatPayload(payload: unknown) {
  if (payload === undefined || payload === null) {
    return "";
  }

  if (typeof payload === "string") {
    return payload;
  }

  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

registerAllActions();

export async function startActionRunner() {
  console.log("[action-runner] starting worker");

  return consumeActions(async (payload, job) => {
    const logger = (event: string, data?: Record<string, unknown>) => {
      const extra = data ? ` ${formatPayload(data)}` : "";
      console.log(`[action-runner] ${event} job=${job.id}${extra}`);
    };

    logger("action.received", {
      action: payload.action,
      runId: payload.runId,
      stepId: payload.stepId,
    });

    const result = await executeRegisteredAction(payload.action, {
      ...payload,
      logger,
    });

    if (result.status === "error") {
      logger("action.error", {
        action: payload.action,
        error: result.error ?? "unknown",
      });

      if (result.retryable) {
        throw new Error(result.error ?? `Action ${payload.action} failed`);
      }

      return result;
    }

    logger("action.completed", {
      action: payload.action,
      runId: payload.runId,
    });

    return result;
  });
}

function isMainModule() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    const entryUrl = pathToFileURL(entry);
    return import.meta.url === entryUrl.href;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  startActionRunner().catch((error) => {
    console.error("[action-runner] bootstrap failed", error);
    process.exit(1);
  });
}








