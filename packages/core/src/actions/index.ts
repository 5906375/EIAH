export * from "./actionRegistry";
export * from "./guardrails";
export * from "./defi";
export * from "./risk";
export * from "./notifications";
export * from "./knowledge";
export * from "./billing";

import { registerDefiActions } from "./defi";
import { registerRiskActions } from "./risk";
import { registerNotificationActions } from "./notifications";
import { registerKnowledgeActions } from "./knowledge";
import { registerBillingActions } from "./billing";
import {
  createFixedWindowRateLimiter,
  createInMemoryIdempotencyStore,
  type IdempotencyStore,
  type RateLimiter,
} from "./guardrails";

export type RegisterAllActionsOptions = {
  idempotencyStore?: IdempotencyStore;
  rateLimiter?: RateLimiter;
};

export function registerAllActions(options: RegisterAllActionsOptions = {}) {
  const idempotencyStore =
    options.idempotencyStore ?? createInMemoryIdempotencyStore();
  const rateLimiter =
    options.rateLimiter ?? createFixedWindowRateLimiter({ limit: 60, windowMs: 60_000 });

  registerDefiActions({ idempotencyStore, rateLimiter });
  registerRiskActions({ rateLimiter });
  registerNotificationActions({ idempotencyStore, rateLimiter });
  registerKnowledgeActions({ idempotencyStore, rateLimiter });
  registerBillingActions();
}
