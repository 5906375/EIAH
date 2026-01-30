import type { NextFunction, Request, Response } from "express";
import { bindLogger, createLogger, ensureTraceId } from "@eiah/core";

const TRACE_HEADER = "x-trace-id";

// Usamos símbolos internos para evitar crash em atribuições no req
const LOGGER_KEY = Symbol("logger");
const TRACE_ID_KEY = Symbol("traceId");

declare global {
  namespace Express {
    interface Request {
      [LOGGER_KEY]?: ReturnType<typeof createLogger>;
      [TRACE_ID_KEY]?: string;
    }
  }
}

function takeTraceId(req: Request) {
  const headerValue =
    req.header(TRACE_HEADER) ??
    req.header(TRACE_HEADER.toUpperCase());
  return ensureTraceId(headerValue);
}

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const traceId = takeTraceId(req);
  const startedAt = process.hrtime.bigint();

  const baseLogger = createLogger({
    traceId,
    component: "api",
    httpMethod: req.method,
    path: req.originalUrl ?? req.url,
  });

  // Armazena usando Symbols — seguro e não quebra Express
  req[LOGGER_KEY] = baseLogger;
  req[TRACE_ID_KEY] = traceId;

  res.setHeader(TRACE_HEADER, traceId);

  res.on("finish", () => {
    const durationNs = process.hrtime.bigint() - startedAt;
    const durationMs = Number(durationNs) / 1_000_000;

    const responseLogger = bindLogger(req[LOGGER_KEY] ?? baseLogger, {
      statusCode: res.statusCode,
      contentLength: res.getHeader("content-length"),
    });

    responseLogger.info(
      {
        durationMs: Number.isFinite(durationMs) ? durationMs : undefined,
      },
      "http.request.completed"
    );
  });

  next();
}
