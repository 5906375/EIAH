export * from "./actionRegistry";
export * from "./guardrails";
export * from "./defi";
export * from "./risk";
export * from "./notifications";
export * from "./knowledge";
export * from "./billing";
export * from "./finance";
export * from "./reporting";
export * from "./agents";
export * from "./registry/VersionedActionRegistry";
export * from "./registry/TenantActionResolver";

import { registerDefiActions } from "./defi";
import { registerRiskActions } from "./risk";
import { registerNotificationActions } from "./notifications";
import { registerKnowledgeActions } from "./knowledge";
import { registerBillingActions } from "./billing";
import { registerFinanceActions } from "./finance";
import { registerReportingActions } from "./reporting";
import { registerAgentProfileActions } from "./agents";
import {
  createFixedWindowRateLimiter,
  createInMemoryIdempotencyStore,
  type IdempotencyStore,
  type RateLimiter,
} from "./guardrails";
import type { TenantActionResolver } from "./registry/TenantActionResolver";
import type { VersionedActionRegistry } from "./registry/VersionedActionRegistry";

export type RegisterAllActionsOptions = {
  idempotencyStore?: IdempotencyStore;
  rateLimiter?: RateLimiter;
  actionResolver?: TenantActionResolver;
};

export function registerAllActions(
  registry: VersionedActionRegistry,
  options: RegisterAllActionsOptions = {}
) {
  const idempotencyStore =
    options.idempotencyStore ?? createInMemoryIdempotencyStore();
  const rateLimiter =
    options.rateLimiter ?? createFixedWindowRateLimiter({ limit: 60, windowMs: 60_000 });

  registerDefiActions({ idempotencyStore, rateLimiter });
  registerRiskActions({ rateLimiter });
  registerNotificationActions({ idempotencyStore, rateLimiter });
  registerKnowledgeActions({ idempotencyStore, rateLimiter });
  registerBillingActions();
  registerFinanceActions({ idempotencyStore, rateLimiter });
  registerReportingActions({ idempotencyStore });
  registerAgentProfileActions();

  return {
    resolve: (tenantId: string) => options.actionResolver?.resolveActions(tenantId) ?? {},
    registry,
  };
}
