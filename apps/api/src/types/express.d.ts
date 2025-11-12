import type { StructuredLogger } from "@eiah/core";

declare global {
  namespace Express {
    interface Request {
      logger: StructuredLogger;
      traceId?: string;
    }
  }
}

export {};
