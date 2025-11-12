import {
  consumeActions,
  registerAllActions,
  executeRegisteredAction,
  createLogger,
  bindLogger,
} from "@eiah/core";
import { pathToFileURL } from "node:url";

const runnerLogger = createLogger({ component: "action-runner" });
registerAllActions();

export async function startActionRunner() {
  runnerLogger.info("action-runner.starting");

  return consumeActions(async (payload, job) => {
    const jobLogger = bindLogger(runnerLogger, {
      jobId: job.id,
      actionKind: payload.action,
      runId: payload.runId,
      tenantId: payload.tenantId,
      workspaceId: payload.workspaceId,
      stepId: payload.stepId,
    });

    jobLogger.info("action.received");

    const result = await executeRegisteredAction(payload.action, {
      ...payload,
      logger: (event: string, data?: Record<string, unknown>) =>
        jobLogger.info(
          {
            event,
            payload: data,
          },
          "action.log"
        ),
    });

    if (result.status === "error") {
      jobLogger.error(
        {
          error: result.error ?? "unknown",
        },
        "action.failed"
      );

      if (result.retryable) {
        throw new Error(result.error ?? `Action ${payload.action} failed`);
      }

      return result;
    }

    jobLogger.info("action.completed");

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
    runnerLogger.error(
      {
        err: error,
      },
      "action-runner.failed"
    );
    process.exit(1);
  });
}






