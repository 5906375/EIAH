import type { NextFunction, Request, Response } from "express";
import { bindLogger, createLogger, ensureTraceId } from "@eiah/core";

const TRACE_HEADER = "x-trace-id";

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

  req.logger = baseLogger;
  req.traceId = traceId;
  res.setHeader(TRACE_HEADER, traceId);

  res.on("finish", () => {
    const durationNs = process.hrtime.bigint() - startedAt;
    const durationMs = Number(durationNs) / 1_000_000;
    const responseLogger = bindLogger(req.logger, {
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

  return next();
}
