import { randomUUID } from "node:crypto";
import pino, { type Logger as PinoLogger, stdTimeFunctions } from "pino";

export type LogContext = {
  traceId?: string;
  tenantId?: string;
  workspaceId?: string;
  runId?: string;
  agentId?: string;
  actionKind?: string;
  costCents?: number;
  stepId?: string;
  jobId?: string;
  service?: string;
  [key: string]: unknown;
};

export type StructuredLogger = PinoLogger;

let rootLogger: StructuredLogger | null = null;

function filterContext(context?: LogContext | null) {
  if (!context) return {};
  return Object.entries(context).reduce<Record<string, unknown>>((acc, [key, value]) => {
    if (value !== undefined && value !== null) {
      acc[key] = value;
    }
    return acc;
  }, {});
}

function resolveLogLevel() {
  if (process.env.LOG_LEVEL) {
    return process.env.LOG_LEVEL;
  }
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

function shouldPrettyPrint() {
  return process.env.LOG_PRETTY === "true";
}

function getRootLogger(): StructuredLogger {
  if (!rootLogger) {
    const base = filterContext({
      service: process.env.LOG_SERVICE_NAME ?? "eiah",
      env: process.env.NODE_ENV ?? "development",
    });

    rootLogger = pino({
      level: resolveLogLevel(),
      base,
      timestamp: stdTimeFunctions.isoTime,
      transport: shouldPrettyPrint()
        ? {
            target: "pino-pretty",
            options: {
              colorize: true,
              translateTime: "SYS:standard",
            },
          }
        : undefined,
    });
  }

  return rootLogger;
}

export function createLogger(context?: LogContext): StructuredLogger {
  return bindLogger(getRootLogger(), context);
}

export function bindLogger(logger: StructuredLogger, context?: LogContext | null): StructuredLogger {
  if (!context || Object.keys(context).length === 0) {
    return logger;
  }

  return logger.child(filterContext(context));
}

export function ensureTraceId(value?: string | null): string {
  const trimmed = value?.trim();
  if (trimmed) {
    return trimmed;
  }

  return typeof randomUUID === "function"
    ? randomUUID()
    : Math.random().toString(36).slice(2, 12);
}

export function withCostContext(logger: StructuredLogger, costCents?: number | null) {
  if (typeof costCents !== "number") {
    return logger;
  }
  return bindLogger(logger, { costCents });
}

export function getRootStructuredLogger() {
  return getRootLogger();
}
